# Alternatif Plan A: Browser-WASM RAG (sıfır anahtar)

Araştırma tarihi: 2026-06-18. Hedef, articleditor'da API key olmadan en az semantik arama sağlamaktır. Cevap üretimi için tarayıcı içi LLM opsiyoneldir; ilk ürünleştirilebilir kazanım, PDF chunk embedding'lerini istemcide üretip IndexedDB'de saklamaktır.

## Tavsiye edilen stack

- Embedding: `onnx-community/all-MiniLM-L6-v2-ONNX`, Transformers.js `feature-extraction`, `pooling: "mean"`, `normalize: true`, `dtype: "q8"` veya cihaz uygunsa `q4`. Model kartı 384 boyutlu vektör ve 22.7M parametre belirtir; Transformers.js v3 docs `ModelRegistry.get_available_dtypes("onnx-community/all-MiniLM-L6-v2-ONNX")` örneğinde `fp32`, `fp16`, `int8`, `uint8`, `q8`, `q4` dtypelarını gösterir. Tahmini ilk indirme: q8 için 25-35 MB, fp32 için 90-100 MB; runtime RAM: 120-220 MB. Kaynaklar: [all-MiniLM-L6-v2 model card](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2), [Transformers.js dtypes](https://huggingface.co/docs/transformers.js/guides/dtypes).
- Türkçe/multilingual fallback: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`, 384 dim, 50 dil. Türkçe içerik veya Türkçe sorgu bekleniyorsa bunu seçilebilir "multilingual mode" yap. İlk indirme ve RAM MiniLM-L6'dan yüksek olur; masaüstünde kabul edilebilir, mobilde yavaşlar. Kaynak: [paraphrase-multilingual-MiniLM-L12-v2](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2).
- İngilizce kalite alternatifi: `BAAI/bge-small-en-v1.5`, 384 dim, English-only. BGE docs v1.5 için daha dengeli similarity dağılımı ve query instruction önerir; Türkçe için doğru seçim değil. Kaynak: [BAAI/bge-small-en-v1.5](https://huggingface.co/BAAI/bge-small-en-v1.5).
- Uzun bağlam alternatifi: `nomic-ai/nomic-embed-text-v1.5`, 768 dim, 8192 seq len, 0.1B parametre, English tag'li. Transformers.js destekli ama task prefix zorunlu: dokümanlar `search_document: ...`, sorgular `search_query: ...`. Matryoshka ile 512/256/128 dim kesilebilir. Türkçe için tavsiye etme; model kartı English olarak etiketli. Kaynak: [nomic-embed-text-v1.5](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5).
- LLM: Varsayılan olarak kapalı. Sıfır anahtar MVP'de "kaynak pasajlarını bul ve göster" yeterli olmalı. Masaüstü deneysel cevap modu için `@mlc-ai/web-llm` + `Llama-3.2-3B-Instruct-q4f16_1-MLC` önerilir: WebLLM config `vram_required_MB: 2263.69`, 4096 context ve low-resource flag gösteriyor. Daha düşük cihaz için `SmolLM2-360M-Instruct-q4f16_1-MLC` 376 MB VRAM seviyesinde, kalite sınırlı. Kaynaklar: [WebLLM README](https://github.com/mlc-ai/web-llm), [WebLLM config.ts](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts).
- Fallback: `navigator.gpu` varsa WebGPU dene; başarısız olursa aynı embedding modelini WASM CPU'da q8/q4 çalıştır. Mobil veya düşük RAM'de LLM'i hiç önermeden yalnızca semantik arama aç. Online ama key isteyen alternatifleri ayrı "cloud provider" modu olarak sun: Hugging Face/OpenRouter "zero app key" değildir, kullanıcı hesabı token'ı ister.

## Transformers.js notları

Transformers.js docs 2026-06 itibarıyla stable v3.8.1 gösteriyor ve tarayıcıda varsayılan CPU/WASM, `device: "webgpu"` ile GPU çalıştırma modelini belgeliyor. Feature extraction destekli görevler listesinde açıkça var; WebGPU guide embedding örneğini `pipeline("feature-extraction", ..., { device: "webgpu" })` ile veriyor. Kaynaklar: [Transformers.js docs](https://huggingface.co/docs/transformers.js/index), [Running models on WebGPU](https://huggingface.co/docs/transformers.js/guides/webgpu).

WebGPU daha hızlı ve özellikle LLM için gerekli, ancak kapsama ve tarayıcı davranışı değişken. HF docs Ekim 2024'te global WebGPU desteğini yaklaşık %70 olarak vermiş; Safari/Firefox tarafında hâlâ flag veya deneysel davranışlar olabilir. WASM daha yaygın ve embedding için yeterli, ama CPU'yu meşgul eder. Bu yüzden embedding worker içinde çalışmalı; ana thread yalnızca progress ve cancel yönetmeli.

## Browser LLM değerlendirmesi

`webllm` en temiz entegrasyon: WebGPU zorunlu, OpenAI chat API uyumlu, streaming ve worker/service worker desteği var. Built-in model aileleri Llama, Phi, Gemma, Mistral, Qwen olarak listeleniyor; config'te Llama 3.2 3B, Llama 3.1 8B, Phi-3.5 mini, Phi-4 mini, DeepSeek R1 distill ve SmolLM2 seçenekleri görünüyor. Pratik RAM: 1B-3B q4 modeller için 1.5-3 GB VRAM/RAM bütçesi, 7B-8B için 5-6 GB sınıfı. İlk indirme model ağırlığına bağlı olarak yüzlerce MB ile birkaç GB arası; 3B q4 için kullanıcıya 1.8-2.5 GB disk/cache bütçesi anlatılmalı. Kaynak: [WebLLM README](https://github.com/mlc-ai/web-llm).

`wllama` llama.cpp/GGUF hattı için güçlü alternatif. V3 WebGPU, multimodal ve tool calling desteği eklemiş; WASM SIMD ile GPU olmadan da çalışabiliyor. Artısı GGUF ekosistemi ve CPU fallback; eksisi model seçme, split GGUF, COOP/COEP header ve bellek yönetimi daha fazla ürün işi gerektirir. README, çok thread için `Cross-Origin-Embedder-Policy` ve `Cross-Origin-Opener-Policy` zorunluluğunu, 2 GB ArrayBuffer limitini ve 512 MB split önerisini belirtiyor. Kaynak: [wllama README](https://github.com/ngxson/wllama).

## Hugging Face Inference API free tier

HF'nin eski "serverless Inference API" hattı Inference Providers altında birleşmiş. Ücretsiz kullanıcıya aylık $0.10 kredi, PRO kullanıcıya $2.00 kredi veriliyor; ekstra kullanım için kredi satın almak gerekiyor. OpenAI-compatible endpoint yalnızca chat completion için mevcut; embeddings/feature extraction için HF client veya task endpoint kullanılır. Yani embedding için OpenAI-compatible değildir. HF Inference sağlayıcısı Temmuz 2025 itibarıyla daha çok CPU işleri, embedding, reranking, text-classification ve küçük tarihsel LLM'lere odaklanıyor. Kaynaklar: [HF Inference Providers](https://huggingface.co/docs/inference-providers/index), [HF pricing](https://huggingface.co/docs/inference-providers/pricing).

Articleditor açısından HF "sıfır anahtar" çözümü değil; kullanıcı HF token'ı gerekir. Ancak "kendi HF token'ını gir" şeklinde düşük maliyetli cloud fallback olabilir.

## OpenRouter free routes

OpenRouter ücretsiz model varyantları `:free` suffix'iyle çalışıyor ve `openrouter/free` router mevcut. Yine de API key gerekir; yani sıfır anahtar hedefini karşılamaz. Resmi limits docs free modeller için 20 request/min, kredi satın almamış veya $10'dan az kredi almış hesaplarda 50 request/day, en az $10 kredi almış hesaplarda 1000 request/day belirtir. Kaynak: [OpenRouter limits](https://openrouter.ai/docs/api/reference/limits).

2026-06-18'de doğrulanan örnek free routes:

- `deepseek/deepseek-chat-v3-0324:free`: ücretsiz, 131K context, 2025-03-24 release. Kaynak: [DeepSeek V3 0324 free](https://openrouter.ai/deepseek/deepseek-chat-v3-0324:free).
- `google/gemini-2.0-flash-exp:free`: ücretsiz, 1M context, 2024-12-11 release. Kaynak: [Gemini 2.0 Flash Experimental free](https://openrouter.ai/google/gemini-2.0-flash-exp:free).
- `meta-llama/llama-4-maverick:free`: ücretsiz, 1M context, 2025-04-05 release, multimodal. Kaynak: [Llama 4 Maverick free](https://openrouter.ai/meta-llama/llama-4-maverick:free).
- `openrouter/free`: rastgele uygun free model seçer; kullanılacak model response içindeki `model` alanında döner. Free model listesi sık değişir. Kaynak: [Free Models Router](https://openrouter.ai/docs/guides/routing/routers/free-router).

## Maliyet karşılaştırması

| Stack | Anahtar | İlk indirme | RAM | Aylık $ |
|---|---:|---:|---:|---:|
| Transformers.js + `all-MiniLM-L6-v2` q8, semantik arama | Yok | 25-35 MB | 120-220 MB | 0 |
| Transformers.js + multilingual MiniLM, semantik arama | Yok | 100-150 MB sınıfı | 250-450 MB | 0 |
| Transformers.js + `nomic-embed-text-v1.5` | Yok | 400 MB+ sınıfı | 700 MB-1.2 GB | 0 |
| WebLLM `Llama-3.2-3B-Instruct-q4f16_1-MLC` cevap modu | Yok | 1.8-2.5 GB | 2.3 GB+ WebGPU VRAM | 0 |
| wllama + GGUF Q4 1B-3B | Yok | 0.7-2.5 GB | model + KV cache | 0 |
| HF Inference Providers | Kullanıcı HF token | Yok | Sunucu | $0.10/ay free kredi, sonrası pay-as-you-go |
| OpenRouter free routes | Kullanıcı OpenRouter key | Yok | Sunucu | 0, rate limitli |
| Mevcut OpenAI embed + Anthropic chat | OpenAI + Anthropic key | Yok | Sunucu | Kullanıma bağlı |

## Articleditor entegrasyon adımları

1. `lib/rag/local-embed.ts` ekle. Client-only modül olmalı; server import etmemeli.

```ts
export type LocalEmbeddingModel =
  | 'onnx-community/all-MiniLM-L6-v2-ONNX'
  | 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2'
  | 'BAAI/bge-small-en-v1.5'
  | 'nomic-ai/nomic-embed-text-v1.5';

export type LocalEmbedOptions = {
  model?: LocalEmbeddingModel;
  dtype?: 'q4' | 'q8' | 'fp16' | 'fp32';
  preferWebGpu?: boolean;
  signal?: AbortSignal;
  onProgress?: (event: { status: string; file?: string; loaded?: number; total?: number; progress?: number }) => void;
};

export async function getLocalEmbedder(opts?: LocalEmbedOptions): Promise<{
  model: LocalEmbeddingModel;
  dim: number;
  device: 'webgpu' | 'wasm';
  embed(texts: string[], kind?: 'document' | 'query'): Promise<Float32Array[]>;
}>;

export async function embedLocalTexts(texts: string[], opts?: LocalEmbedOptions & {
  kind?: 'document' | 'query';
}): Promise<{ vectors: Float32Array[]; model: string; dim: number; device: 'webgpu' | 'wasm' }>;
```

Implementation ayrıntısı: dynamic import kullan (`await import("@huggingface/transformers")`), `pipeline("feature-extraction", model, { device, dtype, progress_callback })` çağır. MiniLM/BGE için `pooling: "mean", normalize: true`; Nomic için metinleri `search_document:` veya `search_query:` prefix'iyle işle, sonra gerekiyorsa 512 dim'e slice + normalize uygula.

2. `app/api/rag/embed/route.ts` için davranış değişikliği planla: env yoksa route 500 döndürmeye devam edebilir, ama response'a makine-okunur kod eklenmeli: `{ error, mode: "client-only", reason: "missing_openai_key" }`. Asıl yönlendirme client'ta yapılmalı: `lib/rag/embed-client.ts`, 500 + `mode: "client-only"` gördüğünde veya kullanıcı "Local" seçtiğinde `/api` yerine `embedLocalTexts` çağırmalı.

3. `lib/rag/search.ts` değişikliği: `searchProjectChunks({ projectId, query, embeddingMode?: "auto" | "server" | "local" })`. Query embedding'i indexteki chunk embedding modeliyle aynı olmalı. `PdfEmbedding.model` zaten var; proje içinde karışık model varsa arama ya aktif model grubuna filtrelemeli ya da kullanıcıya "yeniden indexle" göstermeli.

4. UI değişikliği: RAG panelinde mode selector ekle: `Cloud` / `Local`. Local ilk çalıştırmada model indirme progress modalı göster. Modal metni teknik ama kısa olmalı: model adı, yaklaşık indirme, cache konumu, iptal butonu. Progress kaynağı Transformers.js `progress_callback`; WebLLM için `initProgressCallback`.

5. IndexedDB cache stratejisi: Mevcut `projectPdfs`, `pdfChunks`, `pdfEmbeddings` korunur. `PdfEmbedding.model` değerini tam model + dtype + dim + pooling + prefix policy olarak yaz: ör. `local:onnx-community/all-MiniLM-L6-v2-ONNX:q8:384:mean:norm`. PDF hash değişmiyorsa chunk metni aynı kabul edilir; model değişirse sadece embedding tablosu yenilenir, PDF/chunk yeniden çıkarılmaz. Model dosyaları HF/Browser Cache API tarafından tutulur; uygulama tarafında `kv` içine `rag:local-models` manifest'i yaz ve "local model cache temizle" UI'sı için hangi modelin indirildiğini takip et.

6. Worker planı: Embedding'i `lib/rag/local-embed.worker.ts` içine taşı. PDF ingestion büyük batch'lerde `await embedLocalTexts(chunks.slice(i, i + 8))` yapmalı. Ana thread UI update alır; IndexedDB bulk write batch sonunda yapılır. Abort sinyali worker'a mesaj olarak iletilir.

7. Cevap üretimi: MVP'de kapalı. Sonraki iterasyon için WebLLM worker eklenebilir; `RagPanel` sadece masaüstü + WebGPU + yeterli bellek sinyali varsa "Local answer beta" düğmesi gösterir. Aksi halde top passages + citation chips gösterilir.

## Riskler

- Türkçe kalite: `all-MiniLM-L6-v2`, `bge-small-en-v1.5`, `nomic-embed-text-v1.5` İngilizce ağırlıklı. Türkçe arama için multilingual MiniLM varsayılan olmalı veya proje dili algılanmalı.
- Model değiştirme: Farklı embedding dim/model karışırsa cosine sonuçları anlamsız olur. Her embedding row `model` ile filtrelenmeli.
- İlk indirme UX'i: Kullanıcı 25 MB ile 2 GB arasındaki farkı açıkça görmeli. Sıfır anahtar hedefinde LLM'i otomatik indirmek kötü deneyim olur.
- WebGPU kırılganlığı: Chrome iyi, Safari/Firefox daha değişken. Fallback mutlaka WASM olmalı.
- Mobil: 3B LLM gerçekçi değil; embedding bile batch küçük tutulmalı. iOS storage eviction ve RAM kill riski var.
- Headers: wllama multi-thread veya bazı WASM optimizasyonları COOP/COEP isteyebilir; Next config'e header eklemek tüm app için yan etkili olabilir.
- Privacy: Local embedding gerçek localdir; HF/OpenRouter fallback açılırsa metin üçüncü tarafa gider. UI bunu mode bazında belirtmeli.
- Storage: PDF text + vectors + model cache büyür. `estimateStorageBytes()` ve shrink UI'sı local model/cache temizliklerini de kapsamalı.

## Karar matrisi

- Mobile kullanım varsa: LLM yok. Embedding için `paraphrase-multilingual-MiniLM-L12-v2` yalnız Türkçe gerekiyorsa; aksi halde `all-MiniLM-L6-v2` q4/q8, batch 4-8, worker, top passages UI.
- Düşük güç cihaz: `all-MiniLM-L6-v2` q8 WASM. WebGPU başarısızsa sessizce WASM. Nomic ve local LLM gösterme.
- Türkçe yoğun kullanım varsa: varsayılan model `paraphrase-multilingual-MiniLM-L12-v2`; İngilizce akademik PDF ağırlıklı projelerde `all-MiniLM-L6-v2`.
- Sadece masaüstü: `all-MiniLM-L6-v2` q8 veya `bge-small-en-v1.5` İngilizce kalite modu. Cevap üretimi için opsiyonel WebLLM `Llama-3.2-3B-Instruct-q4f16_1-MLC`.
- En iyi zero-key MVP: local embedding + MMR + kaynak pasaj listesi. Chat sentezi daha sonra local LLM veya kullanıcının kendi HF/OpenRouter/OpenAI key'i ile eklenir.
