# RAG Anahtarsız Kullanım — Sentez ve Karar

> Tarih: 2026-06-18 · Patron sentezi
> Kaynaklar: [Plan A](RAG_ALT_TRANSFORMERSJS.md) (Codex), [Plan B](RAG_ALT_SELFHOSTED.md) (Kimi), [Plan C](RAG_ALT_HYBRID.md) (ZCode)

## TL;DR
3 ajan, 3 farklı yön araştırdı. **Plan C (Hybrid)** kazanan: yerel embedding + rotasyonlu ücretsiz cloud chat. Plan A'nın embedding kısmı C'nin embed bacağını oluşturur. Plan B (Hetzner self-host) ölçek/gizlilik kritikse 2026 sonu için yedek.

## Üç plan karşılaştırması

| Boyut | A: Browser-WASM | B: Hetzner Self-Host | C: Hybrid |
|------|-----------------|----------------------|-----------|
| Anahtar gerekli mi | Hayır | Hayır (server tutar) | Hayır (free rotasyon), opsiyonel BYOK |
| İlk indirme | 25–35 MB (embed) + 1.8–2.5 GB (LLM ops.) | 0 | 25–35 MB (sadece embed) |
| Chat kalitesi | Düşük-orta (3B yerel) | Yüksek (7-8B Ollama) | Yüksek (GLM-4.6 free, DeepSeek V3, Gemini Flash) |
| Türkçe | ✓ (multilingual MiniLM-L12) | ✓ | ✓ |
| Aylık maliyet | $0 | ~€6 Hetzner CX33 | $0 (free routes), aşımda BYOK |
| Mobil | Sadece arama | Tam | Tam (chat free API'den) |
| Latency | Yüksek (browser LLM) | Düşük-orta | Düşük (cloud chat) |
| Bakım | Yok | OS update + model güncelleme | Free API breakage izleme |
| Karmaşıklık | Düşük | Orta-yüksek (docker, nginx, ssl) | Düşük-orta (router katmanı) |

## Karar: Plan C uygula (A embed bacağı + C router)

Sebep:
- Sıfır anahtar hedefi karşılanır
- Türkçe destek var
- Mobil/desktop ikisinde de çalışır
- Bakım yükü minimal
- Plan A'nın LLM tarafı 2026'da hala olgunlaşmamış (RAM, indirme süresi engelli)
- Plan B yararlı ama 6€/ay her kullanıcıya anlamsız — kullanıcı tabanı büyürse Hetzner'a kayma yolu açık kalır

## Uygulama planı (Wave 7)

### 7a — Codex: Yerel embedder
- `lib/rag/embed-local.ts` — `@huggingface/transformers` v3+ pipeline wrapper, `Xenova/all-MiniLM-L6-v2` (varsayılan) + `paraphrase-multilingual-MiniLM-L12-v2` (TR fallback)
- Mevcut `embedTexts()` ile aynı imza, dim farkı (384 vs 1536) → store/types.ts'de dim alanı zaten mevcut
- WebWorker'da çalıştır, ana thread sadece progress + cancel
- WebGPU dene → başarısız ise WASM CPU fallback

### 7b — ZCode: Chat router
- `lib/rag/chat-router.ts` — provider rotation (GLM-4.6 → DeepSeek V3 → Gemini 2.5 Flash), 429/503 backoff
- `lib/rag/free-providers.ts` — endpoint config (OpenAI-compat baseURL listesi)
- `app/api/rag/chat-free/route.ts` — yeni endpoint, anahtar yoksa free rotasyona düşer
- BYOK toggle: Ayarlar > AI > 3 mod (Premium / Free / BYOK)

### 7c — Kimi: Entegrasyon + i18n + UI
- RagPanel'e mod chip ekle (Free/Premium/BYOK)
- Rate limit göstergesi (provider X dk içinde tekrar dene mesajı)
- Ayarlar paneline AI mod seçici
- i18n: rag_mode_premium, rag_mode_free, rag_mode_byok, rag_rate_limit_wait

### 7d — Patron: Plan B docker-compose template
- Sadece **docs/HETZNER_DEPLOY.md** olarak yaz — kod yok
- Kullanıcı tabanı 50+ kişiye ulaşırsa veya hassas içerik tespit edilirse devreye alınır
- Wave 7 bu adım için kod yazmaz, sadece referans bırakır

## Riskler ve mitigasyon
- **GLM-4.6 free son bulursa**: rotation listesi DeepSeek + Gemini Flash ile devam eder
- **Rate limit**: kullanıcıya "X saniye bekle" mesajı + BYOK önerisi
- **Türkçe kalite**: multilingual MiniLM yeterli mi? — test gerekli, ilk 10 sorguda manuel doğrula
- **PDF için optimum chunk size farklı olabilir**: 384-dim embed'le mevcut 500 tok chunk yetersiz olabilir, MMR daha agresif tutulmalı (lambda 0.3)

## Sonraki adım
Onayın varsa Wave 7'yi 4 ajanla başlat. Yoksa BYOK'lu Premium mod ile mevcut akış devam eder.
