# ARTED — Functional Specification

Finalized: 2026-07-06. This spec is code-aligned with the current Next.js app:
24 API routes, 14 AI routes, and 54 node-test suites under `lib/**/*.test.ts`.

Browser-based academic article editor and EndNote converter. All user data lives in
IndexedDB (Dexie); the server is a stateless proxy for metadata lookup, AI features
and integrity checks. This document is the reference for what the app must do; the
automated suite under `lib/**/*.test.ts` (`npm test`) verifies the pure-logic core
of the flows listed here.

## 1. Flows

### F1 — Document import
- **Entry**: `/convert` (Dropzone, PasteBox) and `/edit` (DocImportModal).
- **Behavior**: `.docx` upload or plain-text paste is parsed into segments
  (`lib/docx/parse.ts`, `lib/docx/plain-text.ts`) and converted to TipTap JSON
  (`lib/editor/import-rich.ts`). Bold/italic/sub/superscript, tables and headings
  survive import. A bibliography block is auto-detected and split into references
  (`lib/refs/parse-biblio.ts`).
- **Invariants**:
  - docx → TipTap → docx round-trip preserves text content.
  - Import never throws on malformed docx; degraded output + warning instead.

### F2 — Citation marker detection
- **Modules**: `lib/markers/detect.ts`, `lib/markers/byline.ts`.
- **Behavior**: numeric markers `[1]`, `[1,3]`, `[1-4]` and superscript variants are
  recognized in body text and linked to bibliography entries.
- **Invariants**:
  - IQR / measurement bracket ranges (e.g. `[25–75]` after "IQR") are NOT citations.
  - Author byline / affiliation blocks are skipped entirely (`byline.ts`):
    numbered affiliation markers after author names are not citations.
  - Markers inside the detected bibliography block itself are ignored.

### F3 — Reference library
- **Entry**: RefsPanel (tabs, drag-drop import, paste import), RefDetail.
- **Modules**: `lib/refs/import-auto.ts` (format sniffing) routing to parsers:
  RIS (`ris.ts`), EndNote `.enw` (`enw.ts`), EndNote XML (`enxml.ts`,
  `endnote-xml.ts`), BibTeX (`bibtex.ts`), PubMed nbib (`nbib.ts`), PubMed XML
  (`pubmed-xml.ts`), CSL-JSON (`csl-json.ts`), CSV (`csv.ts`), CFF (`cff.ts`),
  EndNote style `.ens` (`ens.ts`). Normalization (`normalize.ts`) and dedupe
  (`dedupe.ts`) run on every import.
- **Invariants**:
  - `sniffFormat` never misroutes: each supported format's canonical sample is
    detected correctly; unknown text falls back to plain-bibliography parsing.
  - Dedupe keys on DOI, then PMID, then normalized title+year; merging keeps the
    richer record.
  - Parsers never throw on truncated/garbage input; they return `[]` or partial.

### F4 — Metadata lookup & enrichment
- **Entry**: RefDetail "enrich", RefsPanel import auto-enrich; `/api/lookup`.
- **Modules**: `lib/lookup/{crossref,openalex,pubmed,enrich,cache}.ts`.
- **Behavior**: lookup by DOI, PMID or title+author+year against CrossRef, OpenAlex
  and PubMed; results merged field-by-field with source precedence; 1 h in-process
  cache; only title + first author + year leave the client (privacy contract).
- **Invariants**:
  - Exact-DOI matches are authoritative: fetched bibliographic fields replace
    local ones, but fields the source did not return are never blanked.
  - Title-search matches below the confidence threshold merge conservatively
    (identifiers/abstract only) or not at all — a low-confidence candidate must
    never replace the user's title/authors/year with an unrelated paper.
  - DOI/PMID are normalized (prefix-stripped, trimmed) before comparison.

### F5 — Editor & numbering
- **Entry**: `/edit` TipTap editor; CitationPopover, CitationInsertPicker.
- **Modules**: `lib/editor/numbering.ts`, `doc-structure.ts`, `doc-text.ts`,
  `mixed-content.ts`, `lib/history.ts`.
- **Invariants**:
  - Citations are numbered by order of first appearance; deleting/inserting a
    citation renumbers the whole document and the bibliography consistently.
  - Multi-cite nodes render per active style (`[1,3]`, `[1-3]` collapsing).
  - Undo history checkpoints are bounded (no unbounded memory growth).

### F6 — Citation styles & bibliography
- **Modules**: `lib/refs/styles.ts`, `style-spec.ts`, `mdpi-styles.ts`.
- **Behavior**: Vancouver, APA 7, AMA, IEEE plus journal variants (MDPI, SAGE);
  custom style via `StyleSpec` DSL; switching styles re-renders in-text citations
  and the bibliography live.
- **Invariants**: formatter handles 0-author, 1-author, 6+, 7+ author et-al rules,
  missing year/journal/pages without emitting `undefined`/`null` text.

### F7 — Exports
- **Modules**: `lib/editor/to-export.ts`, `lib/docx/build.ts` (placeholder docx),
  `lib/docx/build-rich.ts` (active EndNote EN.CITE docx),
  `lib/docx/template-docx.ts` (journal production layout), `lib/tex/build.ts`
  (LaTeX + BibTeX bundle), `lib/refs/bibtex-out.ts`, `lib/refs/export-library.ts`
  (RIS), `lib/export/print-html.ts`, `lib/projects/backup.ts` (JSON backup).
- **Invariants**:
  - Active EndNote export produces well-formed OOXML with `ADDIN EN.CITE` field
    codes; record numbers match bibliography order.
  - Placeholder export emits `{Author, Year #N}` tokens EndNote CWYW can resolve.
  - LaTeX bundle compiles citation keys consistent between `.tex` and `.bib`.
  - JSON backup round-trips: `restore(backup(project)) ≡ project` and restore
    validates the version field, rejecting incompatible payloads instead of
    silently corrupting the library.

### F8 — AI assistance (all optional, server-side keys only)
- **Entry**: AI panels/modals; 14 routes under `app/api/ai/*`.
- **Modules**: `lib/ai/provider.ts` (env config resolution, provider priority),
  `registry.ts`, `gemini.ts` / `openai.ts` / `anthropic.ts`, `guard.ts`,
  `schemas.ts` (Zod), `citation-safety.ts`, `academic-review.ts`,
  `embed-refs.ts` + `cosine.ts`, `diff.ts`, `errors.ts`, `url-guard.ts`.
- **Invariants**:
  - The 12 feature POST routes call `checkRateLimit` first: per-IP rate limit
    (20/min, in-memory), Zod-bounded request body, timeout signal, sanitized
    errors (no provider detail, no stack traces to the client).
  - `GET /api/ai/status` is read-only and intentionally unguarded.
  - `POST /api/ai/test` is a diagnostics route for provider settings. It is
    excluded from the sanitized feature-route contract and may return provider
    error text to help the operator fix server configuration.
  - **Citation safety**: text sent for rewrite has citations encoded as
    sentinels; the response is rejected/flagged when sentinels are dropped,
    duplicated or invented (`citation-safety.ts`). AI must never silently
    lose a citation.
  - Network safety: PDF routes sanitize user-supplied URLs with
    `sanitizePdfUrl`; deep-research uses fixed CrossRef/OpenAlex/PubMed clients;
    custom OpenAI-compatible base URL hardening is tracked in the backlog.
  - Browser stores no AI keys (`user-keys.ts` actively clears legacy storage).
  - Provider JSON output is Zod-validated; one retry on parse failure, then 502.

### F9 — PDF reader
- **Entry**: `/reader`; Viewer, AnnotationCanvas, NotesPanel, CitationPanel.
- **Modules**: `lib/pdf/resolve.ts` (DOI → OA PDF), `lib/pdf/proxy.ts` (allowlist).
- **Invariants**: pdf-proxy only fetches allowlisted hosts, caps size, validates
  PDF magic bytes; resolve returns `null` on miss (never 500).

### F10 — Writing panels
Journals check (`lib/journals`), cover letters (`lib/letters`), tables
(`lib/tables`), figures (`lib/figures`), abstract (`lib/editor/abstract.ts`),
abbreviations (`lib/editor/abbreviations.ts`), spellcheck (`lib/spellcheck`),
phrasebank (`lib/phrasebank`), checklists (`lib/checklists`), compliance
(`lib/compliance`), stats reporting (`lib/stats`).
- **Invariant**: each panel's core transform is pure and covered by its own test.

### F11 — Integrity checks (Copyleaks)
- **Modules**: `lib/integrity/copyleaks.ts`; 4 routes under `app/api/integrity/*`.
- **Invariants**: env-gated (503 when unconfigured); webhook callbacks verified
  against `COPYLEAKS_WEBHOOK_SECRET`; webhook base URL must be public HTTPS.

### F12 — Persistence, i18n, PWA
- **Modules**: `store/db.ts` (Dexie schema + migrations), `lib/sync` (local folder
  sync), `lib/fs`, `lib/i18n/index.ts`, `public/sw.js`.
- **Invariants**:
  - TR and EN dictionaries expose identical key sets (no missing translations).
  - Dexie schema migrations never drop stores.

## 2. Server API Contract

| Route | Guard | Failure contract |
|---|---|---|
| `POST /api/ai/*` (12 feature routes, excluding `test`) | rate limit + Zod body bounds + timeout + sanitize | 400 bad body, 429 rate, 503 not configured, 502 upstream, 504 timeout |
| `GET /api/ai/status` | none | always 200 `{configured, provider}` |
| `POST /api/ai/test` | provider allowlist only | 400 unknown provider, 503 missing config, 500 provider failure with diagnostic text |
| `POST /api/lookup` | 1 h cache, Zod | falls through providers, TR error strings |
| `GET /api/mesh/lookup` | length bounds, 6 s timeout | empty suggestions on failure |
| `GET/POST /api/pdf-proxy` | host allowlist, 50 MB cap, magic bytes | 403 off-list, 413 oversize, 502 upstream |
| `GET/POST /api/pdf-resolve` | url sanitize | `{pdfUrl: null}` on miss |
| `POST /api/integrity/*` | env gate + webhook secret | 503 unconfigured, 401 bad signature |
| `GET /api/health` | none | always 200 |

## 3. Quality Gates

Definition of green (all must pass):
1. `npm test` — every `lib/**/*.test.ts` suite passes.
2. `npm run typecheck` — zero errors.
3. `npm run lint -- --quiet` — zero errors.
4. `npm run build` — production build succeeds.

## 4. Out Of Scope For Node Tests

React components, TipTap editor interaction, Dexie/IndexedDB behavior, File
System Access sync, service worker, Tauri shell. These are exercised manually or
via future Playwright E2E.

## 5. Final Acceptance Matrix

| Area | Current executable coverage |
|---|---|
| Document import/export | docx parse/build, rich export, template docx, print HTML, LaTeX |
| Citation/reference core | marker detection, bibliography parsing, import formats, dedupe, styles |
| AI safety/provider core | guard, provider resolution, structured schemas, citation safety, URL guard |
| Writing support | abstract, abbreviations, letters, checklists, compliance, stats, spellcheck |
| PDF/integrity | PDF resolve/proxy, Copyleaks payload/signature helpers |

Manual release checklist:
1. Import a `.docx`, verify detected references, edit citations, export active
   EndNote `.docx`, and open it in Word + EndNote CWYW.
2. Switch TR/EN and light/dark, then verify main editor panels do not overlap at
   desktop and mobile widths.
3. With AI env vars configured, run enhance/review/style/extract-aspects once and
   confirm citation sentinel warnings appear when citations are altered.
4. With Copyleaks env vars missing, confirm integrity routes return 503; with
   sandbox enabled, confirm plagiarism/AI-detection submissions complete.

Improvement backlog:
1. Add Playwright E2E for import → edit → export, AI panel happy paths, and PDF
   reader annotations.
2. Add browser storage migration tests for Dexie backup/restore and schema
   evolution.
3. Harden `OPENAI_BASE_URL` by applying `sanitizeBaseUrl` inside provider config
   resolution before production use of custom OpenAI-compatible endpoints.
4. Add API smoke tests for all `app/api/**/route.ts` contracts.
