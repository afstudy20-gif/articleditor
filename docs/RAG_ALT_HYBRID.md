# Alternatif Plan C: Hybrid (yerel embed + free chat)

> **Durum:** Araştırma / tasarım önerisi (2026-06). Plan A'yı (server-side OpenAI embed +
> Anthropic chat) sökmeden, anahtarsız çalışabilen bir **fallback yolu** tanımlar.
> Mevcut kod tabanıyla referans noktaları:
> `app/api/rag/embed/route.ts` (OpenAI 1536-dim), `app/api/rag/chat/route.ts`
> (Anthropic `claude-sonnet-4-6`), `lib/rag/embed-client.ts`, `lib/rag/chat-client.ts`.
> `package.json` already bağımlılıkları: `openai@^6.39`, `@google/generative-ai@^0.24`,
> Tauri desktop hedefi.

---

## 1. Önerilen stack

| Katman | Seçim | Gerekçe |
|---|---|---|
| **Embedding (anahtarsız)** | `@huggingface/transformers` (Transformers.js v3+) + `Xenova/all-MiniLM-L6-v2` (384-dim) | Tamamen browser-WASM/WebGPU, sıfır API anahtarı, ~23MB ONNX ağırlığı bir kez cache'lenir. Mevcut `lib/rag/embed-client.ts` ile aynı `Float32Array` çıktısı üretir, sadece boyut 1536→384 düşer. |
| **Embedding (BYOK/paid)** | Mevcut `/api/rag/embed` (OpenAI 1536-dim) | Değişmez; kalite farkı belirgindir (bkz. §4). |
| **Chat fallback (anahtarsız)** | **GLM-4.6** (Z.AI, OpenAI-compat) → **DeepSeek V3.2** → **Gemini 2.5 Flash** rotasyonu | Hepsi OpenAI-compat; `openai` SDK'sı sadece `baseURL` değiştirince çalışır. |
| **Chat (BYOK/paid)** | Mevcut `/api/rag/chat` (Anthropic) | Citation kalitesi en yüksek olanı korunur. |
| **BYOK toggle** | Kullanıcı Ayarlar > AI altından kendi anahtarını girer | Anahtar varsa Premium, yoksa Free rotası otomatik seçilir. |
| **Rate-limit yönetimi** | Tarayıcıda `lib/rag/chat-router.ts` içinde provider rotation + 429/503 backoff | LiteLLM sunucu-side proxy ister; biz client-side minimal router tercih ediyoruz (bkz. §6). |

> **Neden GLM-4.6 öncelikli?** Z.AI, GLM-4.6 için "limited-time free" sunuyor; tester raporları
> "anlamlı bir rate limit hit edilmedi" diyor ([Medium](https://medium.com/data-science-in-your-pocket/glm-4-6-free-api-unlimited-24e0028bd209),
> [Z.AI pricing](https://docs.z.ai/guides/overview/pricing)). 200K context, OpenAI-compat endpoint,
> `chat.z.ai/api/anthropic` veya `open.bigmodel.cn/api/paas/v4` üzerinden. Anthropic-uyumlu
> arayüzü de var — bu da mevcut `@anthropic-ai/sdk` kodunu baseURL değiştirerek tekrar
> kullanmamıza olanak tanır.

---

## 2. Articleditor entegrasyon

### 2.1 `lib/rag/embed-local.ts` — Transformers.js wrapper (yeni)

Mevcut `embedTexts()` ile aynı imzayı sunar, böylece UI katmanı fark etmez:

```ts
// lib/rag/embed-local.ts
import { pipeline, env } from '@huggingface/transformers';

// Sadece client. SSR'de import edilirse patlamaması için dynamic.
env.allowLocalModels = false;        // HF CDN'den indir
env.useBrowserCache = true;          // IndexedDB cache (mevcut Dexie'den ayrı)

let extractor: Promise<any> | null = null;
function getExtractor() {
  if (!extractor) {
    extractor = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      dtype: 'q8',          // quantized: ~23MB vs fp32 ~90MB
      device: 'webgpu',     // varsa; yoksa WASM'a otomatik düşer
    });
  }
  return extractor;
}

export async function embedTextsLocal(texts: string[]): Promise<{
  vectors: Float32Array[]; model: string; dim: number;
}> {
  const ext = await getExtractor();
  const out = await ext(texts, { pooling: 'mean', normalize: true });
  // out.ort_tensor -> Float32Array[], dim = 384
  return { vectors: toFloat32Arrays(out), model: 'all-MiniLM-L6-v2', dim: 384 };
}
```

**Boyut uyumsuzluğu:** Free modda üretilen 384-dim vektörler, paid 1536-dim vektörlerle
karıştırılamaz. `PdfEmbedding.model` alanı zaten var (Plan A, §2.1); retrieval sırasında
sadece **aynı model** embed'leri eşleştir. Kullanıcı mod değiştirirse, tek seferlik
"re-index" uyarısı göster.

### 2.2 `lib/rag/chat-router.ts` — modu ve provider'ı seç (yeni)

```ts
// lib/rag/chat-router.ts
export type RagMode = 'premium' | 'free' | 'byok';

export type FreeProvider = {
  id: 'glm46' | 'deepseek-v32' | 'gemini-flash';
  baseURL: string;
  model: string;
  rpm: number;        // bilinen dakika limiti
  priority: number;   // 1 = ilk denenir
};

// GLM öncelikli → DeepSeek → Gemini
export const FREE_PROVIDERS: FreeProvider[] = [
  { id: 'glm46', baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4.6', rpm: 60, priority: 1 },
  { id: 'deepseek-v32', baseURL: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat', rpm: 60, priority: 2 },
  { id: 'gemini-flash', baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.5-flash', rpm: 10, priority: 3 },
];

export async function ragChatFree(req: RagChatRequest, opts?: { signal?: AbortSignal }) {
  for (const p of sortBy(FREE_PROVIDERS, 'priority')) {
    try {
      return await callOpenAICompat(p, req, opts);
    } catch (e) {
      if (isRateLimited(e) || isUnavailable(e)) continue; // sıradaki provider
      throw e;
    }
  }
  throw new RagChatError('Tüm free chat sağlayıcıları tükendi (rate-limit/erişim).');
}
```

**Citation sözleşmesi:** Plan A'nın `SYSTEM_PROMPT`'u (`[chunk_id]` inline citation +
"cevap bulunamadı" fallback) olduğu gibi `callOpenAICompat` içine taşınır. DeepSeek ve GLM
bu formatı güvenilir üretir; Gemini Flash daha az kararlı — fallback'te citation-rate
düşebilir, bu yüzden öncelik 3'te.

### 2.3 UI: Ayarlar > AI > 3 mod

`components/Settings/AiSettings.tsx` (yeni) içinde tek bir `<select>`:

```
Mod:  [Premium (Anthropic + OpenAI, sunucu anahtarı)]   ← env var varsa default
      [Free (yerel embed + GLM/DeepSeek/Gemini)]
      [BYOK (kendi anahtarını gir)]
```

- **Premium:** `OPENAI_API_KEY` + `ANTHROPIC_API_KEY` env'de varsa otomatik etkindir.
  Kod yolu = mevcut `/api/rag/*` rotaları.
- **Free:** embed için `embedTextsLocal()`, chat için `ragChatFree()` — hepsi tarayıcıda,
  sunucuya hiçbir istek gitmez.
- **BYOK:** Kullanıcı `localStorage`'a kendi `openai_base_url` + `openai_api_key`
  (veya `anthropic_api_key`) girer. Anahtar tarayıcıdan dışarı çıkmaz; proxy server'a
  gönderilmez. Tauri build'de OS keychain de opsiyonel.

### 2.4 Rate-limit göstergesi

`RagPanel` üst barında: `GLM-4.6 ●` (yeşil) / `⚠ DeepSeek'e geçildi (GLM 429)` /
`✗ Hepsi tükendi — 60sn bekle`. `chat-router.ts` her provider için 60snlik
sliding-window sayaç tutar (`rpm` field'ına göre), UI'a `onProviderChange` callback
verir.

---

## 3. Free chat tier karşılaştırması (2026-06)

| Sağlayıcı | Model | Rate/dk | Bağlam | Cite kalitesi | Notlar |
|---|---|---|---|---|---|
| **Z.AI** | GLM-4.6 | "Limited-time free", tester raporu ~60 RPM pratik ([Medium](https://medium.com/data-science-in-your-pocket/glm-4-6-free-api-unlimited-24e0028bd209)) | **200K** ([docs.z.ai](https://docs.z.ai/guides/llm/glm-4.6)) | ★★★★ — Anthropic-uyumlu endpoint de var, `[id]` citation güvenilir | Öncelik 1. OpenAI + Anthropic çift protokol. |
| **DeepSeek** | V3.2 (`deepseek-chat`) | Hesap başına **eşzamanlılık limiti**, sabit RPM yayımlanmıyor; yeni hesaba 5M token ([pricepertoken](https://pricepertoken.com/endpoints/deepseek/free)) | 128K | ★★★★ — uzun metin RAG'da güçlü | Öncelik 2. Paid $0.14/$0.28 per M ([tldl](https://www.tldl.io/resources/deepseek-api-pricing)). |
| **Google** | Gemini 2.5 Flash (AI Studio) | **10 RPM**, ~250K TPM free ([Yingtu](https://yingtu.ai/en/blog/gemini-api-rate-limits-explained), [PE Collective](https://pecollective.com/tools/gemini-free-tier-guide/)) | 1M | ★★★ — citation formatına uyması daha az kararlı | Öncelik 3. En uzun bağlam ama RPM çok düşük. |
| **OpenRouter** | `:free` koleksiyonu (DeepSeek V4 Flash, Llama, Qwen) | Sağlayıcıya göre; toplam **26+ ücretsiz** model ([CostGoat](https://costgoat.com/pricing/openrouter-free-models), [TeamDay](https://www.teamday.ai/blog/best-free-ai-models-openrouter-2026)) | modele göre | ★★–★★★ | BYOK modu için ideal: tek anahtar, çok model. |
| **Hugging Face** | Inference Providers (serverless router) | **$0.10/ay free compute** kredisi; sonrasında PRO'da $2/ay ([HF pricing](https://huggingface.co/docs/inference-providers/en/pricing), [Reddit](https://www.reddit.com/r/huggingface/comments/1ijr6og/)) | modele göre | değişken | Çok cimri; sadece küçük denemeler için. |

> **Mistral Small** free tier: ~1–2 req/dk, ~1B token/ay ([pricepertoken](https://pricepertoken.com/endpoints/mistral/free)).
> Türkçe RAG'da kalitesi iyi ama RPM çok düşük olduğu için ana rotasyona koymadık; BYOK
> alternatifi olarak ayarlarda gösterilebilir.

---

## 4. Mevcut açık kaynak referans

### 4.1 SurfSense (MODSetter/SurfSense)
- **Yerel LLM çağırma:** LiteLLM üzerinden **Ollama, vLLM, llama.cpp, LM Studio**
  ([GitHub](https://github.com/MODSetter/SurfSense), [surfsense.com](https://www.surfsense.com/)).
  "100+ LLM via OpenAI spec" — bizim `chat-router.ts`'in tek farkı: onlar proxy sunar,
  biz client-side minimal router tutuyoruz (Tauri desktop'ta ek process istemiyoruz).
- **6000+ embedding modeli** desteği — biz ise tek model (`all-MiniLM-L6-v2`) ile
  başlayıp sonra `bge-small-en-v1.5` / `multilingual-e5-small` opsiyonu eklemeyi planlıyoruz.
- **Örnek alınabilir:** LiteLLM config formatı (`provider/model` adlandırması) — ileride
  BYOK modunda kullanıcı kendi Ollama URL'ini girmek isterse aynı şema iş görür.

### 4.2 Quivr, Verba, PrivateGPT, GPT4All (2026 durumu)
- **Quivr:** Hâlâ aktif ama "second brain" ürününe kaydı ([GitHub](https://github.com/QuivrHQ/quivr)).
  Tarayıcı-first değil, self-host backend. Bizim mimarimize uymuyor — referans almıyoruz.
- **Verba (Weaviate):** Resmen **maintain edilmiyor** ("Verba is no longer actively
  maintained"). Atlandı.
- **PrivateGPT:** Aktif, tam-offline, retrieval latency'de güçlü. Backend Python — bizim
  Next.js stack'imizle entegrasyon maliyeti yüksek. Referans: citation/prompt formatı.
- **GPT4All (Nomic):** Aktif, masaüstünde local LLM + RAG. Tauri build'imiz için
  ilham: `llama.cpp` binding'i yerine biz WASM yolu seçtik (daha küçük binary, daha az
  native bağımlılık).
- **LangChain.js client-only pattern:** `langchain/js` var ama bize ağır; kendi
  `chunker.ts` + `cosine.ts` + `embed-local.ts` üçlüsü daha hafif ve zaten mevcut.

> **2026 trend:** LlamaIndex (~49K★), LangChain, Haystack, RAGFlow, AnythingLLM başı
> çekiyor. Bunların hepsi backend-first. Articleditor'un farkı: **tamamen tarayıcıda**
> (IndexedDB + Transformers.js) çalışan, sıfır-backend RAG — açık kaynakta nadir.

---

## 5. Riskler

| Risk | Olasılık | Etki | Mitigasyon |
|---|---|---|---|
| **Free API kapanması** (geçmiş: Replicate free, HF 1000→$0.10 düşürmesi [Reddit](https://www.reddit.com/r/huggingface/comments/1ijr6og/)) | Yüksek | Orta | Çok-provider rotasyonu (§2.2) + BYOK her zaman açık acil çıkış. |
| **Rate-limit bypass denemesi → ban** | Orta | Yüksek | `chat-router.ts` sadece resmi 429/Retry-After'a uyar; hesap çoğaltma/VPN rotasyonu **kasıtlı yapılmaz**. Kullanıcıya "kendi anahtarını gir" (BYOK) denir. |
| **384-dim ↔ 1536-dim uyumsuzluğu** | Kesin | Orta | `PdfEmbedding.model` ile izole et; mod değişiminde re-index uyarısı. |
| **WASM embed yavaşlığı** (WebGPU yoksa) | Orta | Orta | WebGPU detect → fallback WASM; ilk index sırasında progress bar (mevcut `IngestProgress.tsx`'i kullan). 40–75x hız farkı ([HF blog](https://huggingface.co/blog/transformersjs-v3)). |
| **Gemini citation formatına uymama** | Orta | Düşük | Gemini'yi öncelik 3'te tut; cevapta `[id]` yoksa `citedChunkIds = []` döner (mevcut `extractCitations` zaten hallucinated id'leri filtreliyor). |
| **GLM-4.6 context auto-trim** ([KiloCode #2778](https://github.com/Kilo-Org/kilocode/issues/2778)) | Düşük | Düşük | `MAX_CHUNKS = 40` ve `MAX_CHUNK_CHARS = 8000` (mevcut) — 200K pencerede trim riski yok. |
| **Anahtar sızıntısı (BYOK)** | Düşük | Yüksek | BYOK anahtarı `localStorage`'da, asla server'a gönderilmez; Tauri'de OS keychain opsiyonel. Hiçbir log/telemetri anahtarı echo etmez. |
| **Çoklu kullanıcı aynı IP'de free tier paylaşımı** | Orta | Düşük | IP-bazlı limit varsa kullanıcıya "kendi anahtarını gir" yönlendirmesi. |

---

## 6. OpenAI-compat proxy — neden LiteLLM değil?

LiteLLM güçlü bir self-host gateway ([BerriAI/litellm](https://github.com/BerriAI/litellm),
[Effloow 2026 guide](https://effloow.com/articles/litellm-ai-gateway-llm-proxy-guide-2026)):
fallback, load-balancing, sanal anahtar, spend tracking hepsi var. **Ama**:

- **Ek process** gerektirir (Python server). Articleditor hem web (Next.js) hem Tauri
  desktop — her ikisinde de ek process yönetmek karmaşıklık katar.
- **Tarayıcıdan doğrudan çağrılmaz** ([search sonucu](https://docs.litellm.ai/docs/)):
  "LiteLLM is typically deployed as a server-side gateway." CORS + anahtar yönetimi
  gerekir.

**Karar:** `lib/rag/chat-router.ts` minimal client-side router. Tek dosya, ~150 satır,
sıfır runtime bağımlılık (`openai` SDK zaten var). LiteLLM sadece ileride self-host
editions (kurumsal) istenirse devreye girer.

---

## 7. Karar — ne zaman hangi plan?

```
                       ┌─────────────────────────────────────────┐
Kullanıcı Ayarlar>AI ─►│ Mod seçimi                               │
                       └──────────────┬──────────────────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              ▼                       ▼                       ▼
         PREMIUM                    FREE                    BYOK
  (env anahtarları var)      (anahtar yok, hemen)    (kullanıcı kendi anahtarı)
              │                       │                       │
   /api/rag/embed (1536)   embedTextsLocal (384)    kullanıcının seçtiği
   /api/rag/chat (Anthropic) ragChatFree()          baseURL/model'i
              │               GLM→DeepSeek→Gemini
              ▼                       ▼                       ▼
     En yüksek kalite        Sıfır maliyet,          Kullanıcının kotası,
     + sunucu anahtarı       citation %80+           kendi sorumluluğu
                              kalitesi
```

| Durum | Plan | Gerekçe |
|---|---|---|
| Kullanıcı Articleditor'u indirip hiçbir anahtar vermeden denemek istiyor | **C (Free)** | Sürtünmesiz onboarding; `all-MiniLM-L6-v2` + GLM-4.6 çoğu demo soruya yeter. |
| Hosted/SSO kurumsal deploy | **A (Premium)** | Anthropic citation kalitesi + SLA. |
| İleri kullanıcı kendi OpenAI/DeepSeek kredisi var | **C (BYOK)** | Maliyet kullanıcıya, kalite kendi seçimi. |
| Çevrimdışı / gizlilik zorunlu (Tauri desktop, havaalanı) | **C (Free)** embed + **Ollama BYOK** chat | Embed her zaman offline; chat için yerel Ollama URL'i (`http://localhost:11434/v1`). |
| Hacimli toplu index (10K+ PDF) | **A (Premium)** | WASM embed büyük hacimde yavaş; OpenAI batch API ekonomik. |

**Varsayılan seçim mantığı (`lib/rag/mode.ts`):**
1. `localStorage.rag_mode` varsa onu kullan.
2. Yoksa `ANTHROPIC_API_KEY` env var erişilebilirse → Premium.
3. Yoksa → Free (sıfır-konfigürasyon).

---

## 8. Uygulama sırası (MVP → tam)

1. **MVP-Free (1-2 gün):** `embed-local.ts` + `chat-router.ts` (sadece GLM-4.6) +
   Ayarlar mod seçici. Mevcut `RagPanel` UI değişmeden çalışır (sadece backend route
   yerine local fonksiyon çağrılır).
2. **Rotasyon (0.5 gün):** DeepSeek + Gemini fallback eklenir, rate-limit göstergesi.
3. **BYOK (1 gün):** Ayarlar'dan `openai_base_url` + `openai_api_key` girişi;
   `chat-router.ts` BYOK durumunda rotasyonu atlar.
4. **Embed model seçeneği (0.5 gün):** `all-MiniLM-L6-v2` yanına `multilingual-e5-small`
   (Türkçe için daha iyi) opsiyonu.
5. **(Opsiyonel) Tauri Ollama entegrasyonu:** desktop build'de `http://localhost:11434`
   otomatik keşif.

> **Plan A'yı sökmüyoruz.** Yeni dosyalar eklenir, `RagPanel` runtime'da mode'a göre
> `/api/rag/*` veya local fonksiyonları çağırır. Mevcut testler (`chunker.test.ts`,
> `cosine.test.ts`, `ref-source.test.ts`) değişmez.

---

## Kaynaklar (2026-06 doğrulandı)

**Embedding (Transformers.js):**
- [Transformers.js v3 — WebGPU blog](https://huggingface.co/blog/transformersjs-v3)
- [all-MiniLM-L6-v2 model card](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)
- [WebGPU guide](https://huggingface.co/docs/transformers.js/en/guides/webgpu)

**Free chat API'ler:**
- [Z.AI GLM-4.6 docs (200K context)](https://docs.z.ai/guides/llm/glm-4.6)
- [Z.AI pricing (GLM-4.6 limited-time free)](https://docs.z.ai/guides/overview/pricing)
- [DeepSeek API docs (OpenAI-compat)](https://api-docs.deepseek.com/)
- [DeepSeek free tier (5M token)](https://pricepertoken.com/endpoints/deepseek/free)
- [Gemini rate limits (resmi)](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Mistral free tier limits](https://pricepertoken.com/endpoints/mistral/free)
- [OpenRouter free models koleksiyonu](https://openrouter.ai/collections/free-models)
- [HF Inference Providers pricing](https://huggingface.co/docs/inference-providers/en/pricing)

**Açık kaynak referans:**
- [SurfSense GitHub](https://github.com/MODSetter/SurfSense)
- [Quivr GitHub](https://github.com/QuivrHQ/quivr)
- [LiteLLM GitHub](https://github.com/BerriAI/litellm)

**RAG citation kalitesi:**
- [GLM-4.6 vs DeepSeek-V3.2 benchmark](https://deepinfra.com/blog/glm-4-6-vs-deepseek-v3-2-performance-deepinfra)
- [LLM API karşılaştırması 2026](https://www.morphllm.com/llm-api)
