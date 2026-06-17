# ARTED

Online academic writing & EndNote converter — by Dr. Yusuf Hoşoğlu, 2026.

Browser-based editor that converts plain-text numbered citations (`[1]`, `[2]`…) in Word documents into **active EndNote field codes** (`ADDIN EN.CITE`). Open the output `.docx` in Word + EndNote CWYW and citations are live — insert a new ref and numbers re-number automatically.

🌐 Live: [arted.drtr.uk](https://arted.drtr.uk/) (planned)
📦 Repo: [github.com/afstudy20-gif/arted](https://github.com/afstudy20-gif/arted)

## Features

- 📄 **Word import** — `.docx` upload or paste; bibliography auto-detected
- 🔍 **DOI / PMID / abstract lookup** — CrossRef, OpenAlex, PubMed (no API key needed)
- ✍️ **TipTap editor** — multi-cite, live numbering, click-to-edit citation popover
- 🎨 **Citation styles** — Vancouver, APA 7, AMA, IEEE (switchable, live re-render)
- 📤 **Exports**:
  - **Active EndNote** `.docx` — ADDIN EN.CITE field codes, opens live in Word+EndNote
  - **Placeholder** `.docx` — `{Author, Year #N}`, EndNote "Update Citations" friendly
  - **LaTeX** bundle (`.tex` + `.bib`) — Overleaf/TeXLive compatible
  - **RIS** for EndNote library import
  - **JSON** project backup
- 📚 **Library import** — EndNote XML, `.enw`, BibTeX, RIS (auto-detect)
- 🔒 **Privacy-first** — all data in your browser's IndexedDB, no server storage
- 🌗 **Light / dark theme**, **TR / EN** UI, **PWA** with offline support

## Stack

Next.js 14 (App Router) · React 18 · TypeScript · TipTap (ProseMirror) · Tailwind · Dexie (IndexedDB) · JSZip · fast-xml-parser · Zod

## Local development

```bash
npm install
npm run dev          # http://localhost:3000
npm run typecheck
npm run build
```

## Docker

```bash
docker build -t arted .
docker run -p 3000:3000 arted
```

## Coolify deployment

1. **Coolify panel** → New Resource → **Public Repository**
2. Repository: `https://github.com/afstudy20-gif/arted`
3. Branch: `main`
4. Build pack: **Dockerfile** (auto-detected)
5. Port: `3000`
6. Healthcheck path: `/api/health`
7. **Environment variables** (all optional):

   | Key | Purpose |
   |---|---|
   | `CROSSREF_MAILTO` | CrossRef polite-pool (higher rate limits) |
   | `NCBI_API_KEY` | NCBI E-utilities rate limit boost |
   | `NCBI_EMAIL` | Polite identifier for PubMed |
   | `ANTHROPIC_API_KEY` | Optional AI features (server fallback; users can BYO-key in UI) |
   | `OPENAI_API_KEY` | Same, OpenAI-compatible providers |
   | `OPENAI_BASE_URL` | Custom OpenAI-compatible endpoint (LM Studio, Groq, OpenRouter) |
   | `COPYLEAKS_EMAIL` | Copyleaks account email for AI-writing and similarity checks |
   | `COPYLEAKS_API_KEY` | Copyleaks server API key |
   | `COPYLEAKS_WEBHOOK_SECRET` | Long random secret used to authenticate plagiarism callbacks |
   | `COPYLEAKS_WEBHOOK_BASE_URL` | Public HTTPS app origin, e.g. `https://arted.drtr.uk` |
   | `COPYLEAKS_SANDBOX` | Set to `true` while testing with Copyleaks mock results |

8. **Domain** — point your subdomain (e.g. `arted.drtr.uk`) at Coolify
9. **Persistent volume** — none required (all data is client-side IndexedDB)
10. Deploy. The container exposes `:3000`, healthcheck `/api/health` returns 200 JSON.

### docker-compose.yml (also included)

```yaml
services:
  arted:
    build: .
    ports:
      - "3000:3000"
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:3000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
```

## Privacy

- All projects, article text and your reference library live in **IndexedDB on your device**
- DOI/PubMed lookups send only the reference **title + first author + year** to public APIs (CrossRef / OpenAlex / NCBI E-utilities)
- Optional AI features use **your own API key** stored only in your browser
- AI-writing and similarity checks are opt-in; when started, the manuscript text is sent to **Copyleaks** through the app server
- **No tracking, no analytics, no cookies**

See `/privacy` in the running app for full details.

## Project structure

```
arted/
├── app/                        # Next.js App Router (UI + API routes)
│   ├── page.tsx                # Landing
│   ├── about/, privacy/, tutorial/
│   ├── edit/                   # Workspace (editor + project list)
│   └── api/{health,lookup}     # CrossRef/OpenAlex/PubMed proxy
├── components/
│   ├── Editor/                 # TipTap editor + Citation node
│   ├── RefsPanel/              # Citation library
│   ├── RefDetail/              # Abstract + metadata
│   ├── Bibliography/           # Formatted bibliography
│   ├── Convert/                # Dropzone, PasteBox, PreviewParsed
│   └── SiteChrome.tsx          # Header, footer, refresh-app button
├── lib/
│   ├── docx/{parse,build}      # .docx ↔ TipTap JSON
│   ├── refs/                   # parse-biblio, ris, enxml, bibtex-out, styles
│   ├── lookup/                 # crossref, openalex, pubmed, enrich
│   ├── markers/                # [N], [N,M], [N-M] detection
│   ├── editor/                 # TipTap → docx build input
│   ├── tex/                    # LaTeX export
│   ├── projects/               # JSON backup/restore
│   └── i18n/                   # TR/EN + theme hooks
├── store/                      # Dexie (IndexedDB) + types
├── public/{sw.js,manifest.webmanifest,icon.svg}
├── Dockerfile, docker-compose.yml
└── package.json
```

## License

Free for personal, clinical and academic use.

© 2026 Dr. Yusuf Hoşoğlu
