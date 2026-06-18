# articleditor İçin API Anahtarı Gerektirmeyen Self-Hosted RAG: Hetzner Senaryosu

**Tarih:** 18 Haziran 2026  
**Kapsam:** Mevcut browser-First / client-key tabanlı RAG mimarisinin, API anahtarlarını sunucuya taşıyan self-hosted bir Hetzner yığınına nasıl dönüştürüleceği.  
**Hedef:** articleditor kullanıcılarının tarayıcılarından hiçbir üçüncü-taraf API anahtarı açıklanmadan RAG/chat ve embedding işlemlerinin çalışması.

---

## 1. Özet

articleditor şu anda `app/api/rag/chat/route.ts` üzerinden Anthropic/OpenAI API’lerine giden istekleri, muhtemelen istemci tarafında veya kolayca görülebilecek bir `env` değeriyle besliyor. Bu senaryoda, tüm LLM ve embedding çağrıları Hetzner’da barındırılan bir **Ollama + LiteLLM Proxy** arkasına alınır; uygulama yalnızca kendi alan adı altındaki OpenAI-uyumlu proxy’ye konuşur. Gerçek API anahtarları (varsa) yalnızca sunucu ortamında, LiteLLM yapılandırmasında veya Ollama içinde kalır.

---

## 2. Donanım Minimumu

| Bileşen | Minimum | Önerilen | Açıklama |
|---------|---------|----------|----------|
| CPU | 4 vCPU paylaşımlı | 8 vCPU paylaşımlı veya dedicated | CPU üzerinde quantized LLM çalıştırmak CPU-yoğun; daha fazla çekirdek paralel istek ve token üretim hızını artırır. |
| RAM | 8 GB | 16 GB | 7B-8B Q4 model ~6-8 GB; embedding modeli + pgvector + OS önbelleği ile 8 GB sınırda kalır. |
| Disk | 80 GB NVMe SSD | 160 GB NVMe SSD | Modeller (3-8 GB), vektör indeksleri ve loglar hızla büyür. |
| Bant Genişliği | Hetzner dahilî trafik paketi | Paketin üzerine %50 başlangıç payı | Aşağıdaki trafik notuna bakın. |
| GPU | Gerekmez | İsteğe bağlı: RTX 4000 Ada 20 GB | CPU-only yığın maliyeti düşürür ama token/s hızı düşüktür. |

### Hetzner Trafik Limiti (Güncel Durum)

Hetzner Aralık 2024 itibarıyla bulut sunucularının dahil trafik limitini değiştirdi: artık tüm makineler 20 TB yerine **1 TB × (vCPU sayısı / 2)** formülüyle trafik alıyor (yuvarlanmış).[^1]

- **CX33** (4 vCPU / 8 GB) → **~2 TB/ay** dahil.
- **CX43** (8 vCPU / 16 GB) → **~4 TB/ay** dahil.
- **GEX44** (8 vCPU / 64 GB / GPU) → **~4 TB/ay** dahil.

RAG/chat uygulamasında tipik kullanıcı başına trafik çok düşük olduğundan, 2-4 TB/ay başlangıç için yeterlidir. Aşırı kullanımda Hetzner aşım ücreti robot dokümanlarına göre **~€1/TB** seviyesindedir.[^2]

---

## 3. Önerilen Yazılım Yığını

```
articleditor (Next.js)
        │
        ▼
   https://rag-proxy.articleditor.drtr.uk/v1
        │
        ▼
+------------------------------------------+
|  Caddy / Nginx (TLS, rate-limit, gzip)   |
+------------------------------------------+
        │
        ▼
+------------------------------------------+
|  LiteLLM Proxy  (port 4000)              |
|  - OpenAI-uyumlu tek API yüzeyi          |
|  - model routing / fallback / virtual key|
+------------------------------------------+
        │                    │
        ▼                    ▼
+----------------+   +----------------------+
| Ollama         |   | PostgreSQL 16        |
| (port 11434)   |   | + pgvector extension |
| LLM + embed    |   | vektör depolama      |
+----------------+   +----------------------+
```

### 3.1 Neden bu yığın?

| Bileşen | Görev | Sebep |
|---------|-------|-------|
| **Ollama v0.30.10** | LLM + embedding sunucusu | Hem `/v1/chat/completions` hem `/v1/embeddings` OpenAI-uyumlu endpoint sunar; tek binary kurulumu ve model yönetimi kolaydır.[^3] |
| **LiteLLM Proxy** | API gateway | Birden fazla modeli tek `baseURL` altında birleştirir; virtual key, rate-limit, fallback ve harcama izleme sağlar.[^4] |
| **PostgreSQL + pgvector** | Vektör DB | Mevcut SQL bilgisiyle entegrasyonu basittir; HNSW indeks desteği vardır; Hetzner’da aynı makinede çalıştırılabilir.[^5] |
| **Caddy** | TLS / reverse proxy | Otomatik Let’s Encrypt, basit yapılandırma. |

### 3.2 Önerilen Modeller (CPU-Only, 8-16 GB RAM)

| Görev | Model | Boyut | Bellek (Q4) | Not |
|-------|-------|-------|-------------|-----|
| Chat (hafif, hızlı) | `gemma3:4b` | 4B | ~5 GB | Düşük gecikme, akademik özetleme için yeterli. |
| Chat (daha yetenekli) | `qwen3:8b` | 8B | ~6-8 GB | 8 GB makinede sınırda, 16 GB makinede rahat. |
| Chat (minimal) | `llama3.2:3b` | 3B | ~2 GB | Çok düşük kaynak, kalite orta. |
| Embedding | `nomic-embed-text` | 274 MB | <1 GB | 768 boyut, MRL desteği, hızlı ve kararlı.[^6] |
| Embedding (güçlü) | `qwen3-embedding:0.6b` | 639 MB | <1.5 GB | 1024 boyut, çok dilli metinlerde daha iyi.[^7] |

> **Önemli:** 8 GB RAM’li sunucuda aynı anda 8B chat modeli, embedding modeli ve pgvector çalışırsa swap kullanımı artar. Üretim için **16 GB** başlangıç önerilir.

---

## 4. articleditor Kodunda Yapılacak Değişiklikler

### 4.1 Ortak Değişiklik

Mevcut `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` tarayıcıya gönderilmeyecek şekilde kaldırılır. Sunucu tarafı route handler’lar aşağıdaki gibi güncellenir.

### 4.2 `app/api/rag/chat/route.ts` (örnek)

```ts
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: process.env.LLM_PROXY_BASE_URL!, // https://rag-proxy.articleditor.drtr.uk/v1
  apiKey: process.env.LLM_PROXY_API_KEY!,   // LiteLLM virtual key (sunucu env’inde)
});

export async function POST(req: NextRequest) {
  const { messages } = await req.json();

  const stream = await openai.chat.completions.create({
    model: 'gemma3:4b', // LiteLLM config’te tanımlı alias
    messages,
    stream: true,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      }
      controller.close();
    },
  });

  return new NextResponse(readable, {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}
```

### 4.3 `app/api/rag/embed/route.ts` (örnek)

```ts
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: process.env.LLM_PROXY_BASE_URL!,
  apiKey: process.env.LLM_PROXY_API_KEY!,
});

export async function POST(req: NextRequest) {
  const { input } = await req.json();

  const response = await openai.embeddings.create({
    model: 'nomic-embed-text', // LiteLLM config’te tanımlı alias
    input,
  });

  return NextResponse.json(response);
}
```

### 4.4 Çevre Değişkenleri (Vercel / sunucu env)

```bash
# Eski (istemciye sızmaması gereken)
# ANTHROPIC_API_KEY=...
# OPENAI_API_KEY=...

# Yeni
LLM_PROXY_BASE_URL=https://rag-proxy.articleditor.drtr.uk/v1
LLM_PROXY_API_KEY=sk-litellm-virtual-key
DATABASE_URL=postgresql://... # pgvector bağlantısı
```

### 4.5 İsteğe Bağlı İyileştirmeler

- **Model fallback:** LiteLLM config’te `fallback_models` tanımlayarak Ollama cevap veremezse bulut provider’a yönlendirme yapılabilir. Bu durumda bulut provider anahtarı yalnızca LiteLLM sunucusunda kalır.
- **Virtual key başına limit:** Kullanıcı başına `max_budget` ve RPM limiti koyulabilir.
- **Önbellek:** Sık sorulan sorular için Redis/memcached katmanı eklenebilir.

---

## 5. Hızlı Kurulum Taslağı (Hetzner Ubuntu 24.04)

### 5.1 Sunucu hazırlığı

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y docker.io docker-compose-plugin nginx-core curl
sudo usermod -aG docker $USER
# çıkış yapıp tekrar bağlan
```

### 5.2 `docker-compose.yml` (LiteLLM + Ollama + PostgreSQL)

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    restart: unless-stopped
    environment:
      POSTGRES_USER: rag
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: rag
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "127.0.0.1:5432:5432"

  ollama:
    image: ollama/ollama:latest
    restart: unless-stopped
    volumes:
      - ollama:/root/.ollama
    ports:
      - "127.0.0.1:11434:11434"
    deploy:
      resources:
        limits:
          memory: 10G

  litellm:
    image: ghcr.io/berriai/litellm:main-stable
    restart: unless-stopped
    command: ["--config", "/app/config.yaml"]
    volumes:
      - ./litellm-config.yaml:/app/config.yaml:ro
    environment:
      DATABASE_URL: "postgresql://rag:${POSTGRES_PASSWORD}@postgres:5432/rag"
      LITELLM_MASTER_KEY: ${LITELLM_MASTER_KEY}
      LITELLM_SALT_KEY: ${LITELLM_SALT_KEY}
    ports:
      - "127.0.0.1:4000:4000"
    depends_on:
      - postgres
      - ollama

volumes:
  pgdata:
  ollama:
```

### 5.3 `litellm-config.yaml`

```yaml
model_list:
  - model_name: gemma3:4b
    litellm_params:
      model: ollama/gemma3:4b
      api_base: http://ollama:11434

  - model_name: qwen3:8b
    litellm_params:
      model: ollama/qwen3:8b
      api_base: http://ollama:11434

  - model_name: nomic-embed-text
    litellm_params:
      model: ollama/nomic-embed-text
      api_base: http://ollama:11434

  - model_name: qwen3-embedding:0.6b
    litellm_params:
      model: ollama/qwen3-embedding:0.6b
      api_base: http://ollama:11434

general_settings:
  master_key: os.environ/LITELLM_MASTER_KEY
  database_url: os.environ/DATABASE_URL
```

### 5.4 Modelleri indirme

```bash
docker compose exec ollama ollama pull gemma3:4b
docker compose exec ollama ollama pull nomic-embed-text
docker compose exec ollama ollama pull qwen3:8b
```

### 5.5 TLS / Dışarı Açım (Caddy örneği)

```
rag-proxy.articleditor.drtr.uk {
    reverse_proxy localhost:4000
    encode gzip
}
```

---

## 6. Aylık Maliyet Karşılaştırması (Haziran 2026)

Tüm fiyatlar **KDV hariç**, Hetzner EU lokasyonu (Falkenstein / Nürnberg / Helsinki) için verilmiştir.[^8][^9]

| Senaryo | Sunucu | vCPU / RAM / Disk | Dahil Trafik | Aylık Maliyet | Toplam Tahmini Maliyet |
|---------|--------|-------------------|--------------|---------------|------------------------|
| **Minimum CPU** | CX33 | 4 / 8 GB / 80 GB | ~2 TB | €6.99 | **~€7/ay** |
| **Önerilen CPU** | CX43 | 8 / 16 GB / 160 GB | ~4 TB | €12.49 | **~€12.5/ay** |
| **Yüksek CPU garantisi** | CCX33 | 8 dedicated / 32 GB / 240 GB | ~4 TB | €62.99 | **~€63/ay** |
| **GPU (yüksek hız)** | GEX44 | 8 / 64 GB / 320 GB + RTX 4000 Ada 20 GB | ~4 TB | ~€234 + setup €79-€264 | **~€250-300/ay** |
| Mevcut bulut API maliyeti | — | — | — | Kullanıma bağlı | Orta kullanımda **€20-100/ay** |

### Maliyet Yorumu

- **CX43** (8 vCPU / 16 GB), Ollama CPU-only yığını ile aylık **~€12.5** gibi düşük bir maliyetle API key riskini tamamen ortadan kaldırır.
- **GEX44** GPU sunucu, büyük modellerde (13B-70B) üretim hızı sağlar ama maliyet 20 kata kadar artar.
- Bulut API’leriyle kıyaslama yapılırken, API key’in sızdırılma maliyeti ve kullanıcı gizliliği gibi riskleri de hesaba katmak gerekir.

---

## 7. Riskler ve Azaltma Önlemleri

| Risk | Etki | Azaltma |
|------|------|---------|
| **Düşük token hızı** (CPU-only) | Kullanıcı deneyimi yavaşlar; akademik uzun metin özetlerinde sabır gerektirir. | 16 GB+ RAM, daha küçük model (`gemma3:4b`), GPU sunucuya geçiş veya streaming yanıt. |
| **Bellek taşması (OOM)** | Sunucu çöker veya swap’a düşer. | Her konteyner için `memory` limiti; büyük modellerde 16 GB+ RAM; Ollama’da `num_ctx` sınırlandırması. |
| **Model kalitesi** | 3B-8B modeller Claude/GPT-4o kadar tutarlı değildir; hallüsinasyon veya kötü özetleme riski artar. | RAG context’ini daraltmak, prompt’ları dikkatli tasarlamak, gerektiğinde GPU’da daha büyük model. |
| **Operasyonel yük** | Model güncelleme, güvenlik yaması, yedekleme, izleme geliştiriciye kalır. | Watchtower ile otomatik imaj güncelleme, haftalık `pg_dump`, Uptime Kuma/Prometheus monitoring. |
| **Trafik aşımı** | Beklenmedik fatura. | Bant genişliği monitoring; CDN önüne almak gerekmeyebilir çünkü API trafiği hafiftir. |
| **Veri mahremiyeti & GDPR** | Kullanıcı metinleri Hetzner sunucusunda işlenir. | Gerekirse DPA/AVV sözleşmesi; veri saklama politikası; TLS zorunlu tutma. |
| **Kilitlenme / vendor bağımlılığı** | Ollama, LiteLLM, pgvector güncellemeleriyle uyumsuzluk. | Docker imaj sabitleme, test ortamı, konfigürasyonu YAML’de tutma. |

---

## 8. Karar ve Önerilen Yol Haritası

### 8.1 Kısa vadeli öneri (PoC)

1. **Hetzner CX43** (8 vCPU / 16 GB / 160 GB) sunucu aç.
2. Ubuntu 24.04 + Docker Compose ile Ollama + LiteLLM Proxy + pgvector kur.
3. Modeller: `gemma3:4b` (chat) ve `nomic-embed-text` (embedding).
4. articleditor route handler’larını LiteLLM proxy’ye yönlendir; client API key’leri kaldır.
5. 1-2 hafta iç kullanıcı geri bildirimi topla; token hızını ve yanıt kalitesini ölç.

### 8.2 Orta vadeli karar noktası

| PoC Sonucu | Sonraki Adım |
|------------|--------------|
| Hız ve kalite kabul edilebilir | CX43 üzerinde prod’ya al; monitoring ve yedekleme ekle. |
| Hız yetersiz ama kalite iyi | CCX33 (dedicated CPU) veya GEX44 (GPU) sunucuya geç. |
| Kalite yetersiz | Hibrit fallback: LiteLLM config’te Anthropic/OpenAI rotası ekle; anahtar yalnızca proxy’de kalır. |

### 8.3 Sonuç

- **API anahtarı riskini sıfırlamak** istiyorsak ve **aylık bütçe ~€10-15** civarındaysa, **Hetzner CX43 + Ollama + LiteLLM Proxy + pgvector** yığını en dengeli başlangıçtır.
- **Üretimde yüksek hız ve büyük model** şartsa maliyet **~€250/ay** seviyesindeki GPU sunucusuna çıkar.
- En güvenli yaklaşım, önce düşük maliyetli CPU PoC ile başlayıp, gerçek kullanım verilerine göre scale-up yapmaktır.

---

## Kaynakça

[^1]: Talk Python, “Update on Hetzner changes: pricing and limits”, 8 Aralık 2024 — Hetzner’ın Aralık 2024 trafik limiti değişikliği ve 1 TB × (vCPU/2) formülü.
[^2]: Hetzner Robot Docs, “Traffic” — root sunucular ve bulut sunucuları için trafik politikası; aşım ücretlendirmesi.
[^3]: Ollama GitHub Releases, v0.30.10, 17 Haziran 2026 — güncel kararlı sürüm ve OpenAI-uyumlu API desteği.
[^4]: LiteLLM Docs, “Self-Host LiteLLM Proxy on Liquid Web (Docker)”, 27 Mayıs 2026 — Docker Compose, config.yaml, virtual key ve Ollama entegrasyonu.
[^5]: pgvector GitHub/docs — PostgreSQL vektör uzantısı; HNSW indeks desteği.
[^6]: Ollama Library, `nomic-embed-text` — 768 boyutlu embedding modeli.
[^7]: Ollama Library, `qwen3-embedding` — 0.6B ve 8B varyantları, çok dilli embedding.
[^8]: costgoat.com Hetzner Cloud pricing sayfası, Haziran 2026 — CX33 €6.99, CX43 €12.49, CCX33 €62.99 fiyatları.
[^9]: Hetzner Cloud “Price Adjustment” duyurusu, Şubat 2026 — yeni fiyatlandırma güncellemesi.
