# EndNoteRe

Online akademik yazım & EndNote dönüştürücü.

Word belgesindeki düz metin numaralı atıfları (`[1]`, `[2]`, …) **aktif EndNote alan kodlarına** dönüştürür. Word + EndNote CWYW açıldığında numaralar otomatik tanınır ve araya yeni atıf eklendiğinde otomatik kayar.

## Özellikler

- **.docx yükle veya metin yapıştır** — kaynakça bölümü ("Kaynaklar/References/Bibliography") otomatik algılanır
- **Heuristik biblio parser** — numbered/Vancouver/APA/IEEE formatlarını yakalar
- **DOI / PMID taraması** — CrossRef + NCBI E-utilities (anahtarsız çalışır)
- **Çıktı modları**:
  - Aktif EndNote `.docx` (ADDIN EN.CITE alan kodları gömülü)
  - Placeholder `.docx` (`{Yazar, Yıl #N}` — EndNote "Update Citations" ile aktifleşir)
  - `.ris` (EndNote kütüphanesine import için)
- **Online editör** (yakında) — TipTap tabanlı, canlı kaynakça paneli, otomatik numaralandırma
- **AI yardımcı** (opsiyonel, BYO-key) — Paperpal benzeri clarity/concision/akademik ton

## Geliştirme

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck
npm run build
```

## Docker (Coolify)

```bash
docker build -t endnotere .
docker run -p 3000:3000 endnotere
```

Coolify panelinde:
1. New Resource → Docker Compose veya Dockerfile
2. Repo'yu bağla (lokal/Git)
3. Environment variables: `.env.example` referans
4. Port: 3000
5. Healthcheck: `/api/health`

## Çevre Değişkenleri

Tümü opsiyonel. Anahtarsız da çalışır.

| Değişken | Amaç |
|---|---|
| `CROSSREF_MAILTO` | CrossRef polite pool (yüksek rate-limit) |
| `NCBI_API_KEY` | PubMed E-utilities rate-limit artırır |
| `NCBI_EMAIL` | PubMed istek tanımlayıcısı |
| `ANTHROPIC_API_KEY` | AI yardımcı (server fallback) |
| `OPENAI_API_KEY` | AI yardımcı (OpenAI veya uyumlu) |
| `OPENAI_BASE_URL` | Generic OpenAI uyumlu endpoint (LM Studio, Groq, OpenRouter) |

Kullanıcı kendi anahtarını ayarlardan (UI) girebilir; o durumda env var gerekmez.

## İş Akışı (Dönüştürücü)

1. `/convert` aç
2. `.docx` yükle veya metin yapıştır
3. Önizleme: gövde + algılanan referanslar + güven skorları
4. "DOI tara" ile referansları zenginleştir
5. Aktif EndNote modunda `.docx` indir
6. `.ris` indir → EndNote kütüphanesine import et
7. `.docx`'i Word'de aç — EndNote CWYW alan kodlarını tanır

## Mimari

```
endnotere/
├── app/                 # Next.js App Router (UI + API)
├── lib/
│   ├── docx/            # .docx parse + build (JSZip + OOXML)
│   ├── refs/            # Biblio parser, RIS, EndNote XML payload
│   ├── lookup/          # CrossRef + PubMed adaptörleri
│   └── markers/         # [N], [N,M], [N-M] tespit
├── components/
│   ├── Convert/         # Dönüştürücü UI
│   └── Editor/          # Online editör (yakında)
├── store/               # IndexedDB (Dexie) + tipler
└── Dockerfile
```

## Lisans

Henüz tanımlanmadı. Şahsi/klinik kullanım için.
