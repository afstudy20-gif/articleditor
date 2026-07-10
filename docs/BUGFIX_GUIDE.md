# ARTED — Bugfix Guide for AI Agents

Handoff document for any LM/agent tasked with fixing bugs in this project.
Read this **before** touching code. It tells you how the app is built, how to
reproduce and verify, what the invariants are, and where the traps hide.

Companion doc: [SPEC.md](SPEC.md) is the source of truth for **what each flow
must do**. This file is about **how to work on the code safely**.

---

## 1. What this project is

ARTED — a browser-based academic writing + EndNote/citation converter.
Turkish/English UI. All user data lives in the browser (IndexedDB via Dexie);
the Next.js server is a **stateless proxy** for metadata lookup, optional AI,
and integrity (plagiarism) checks. No user database on the server.

- **Stack**: Next.js 16 (App Router) · React 19 · TypeScript 5.7 · TipTap
  (ProseMirror) · Tailwind 3 · Dexie (IndexedDB) · JSZip · fast-xml-parser · Zod.
- **Node**: v22 (repo built on 22.14). Use the system Node; do not switch it.
- **Scale**: 24 API routes, ~56 components, 65 node test files (505 tests).

---

## 2. Setup & the four quality gates

```bash
npm install
```

A change is **NOT done** until all four gates pass. Run them in this order:

```bash
npm test          # node --test suites under lib/**/*.test.ts + store/**/*.test.ts
npm run typecheck # tsc --noEmit — zero errors
npm run lint      # eslint . — zero errors/warnings (run: npx eslint . --quiet)
npm run build     # next build — production build must succeed
```

E2E (browser core loop, optional but preferred for editor/import changes):

```bash
npm run test:e2e  # Playwright; reuses a running dev server if present
```

> The file-write tools report success even when code does not compile. NEVER
> claim a fix is complete before running `npm run typecheck` and `npm test`.
> If you cannot run a gate, say so explicitly — do not assume green.

Dev server for manual/preview checks:

```bash
npm run dev       # http://localhost:3000
```

---

## 3. Directory map (where things live)

```
app/
  page.tsx                 Landing
  edit/EditorClient.tsx    MAIN editor shell (huge — ~3700 LOC; read in chunks)
  reader/                  PDF reader page
  convert/                 Standalone convert page
  api/                     24 route.ts files (see §6)
components/                56 React components, grouped by feature
lib/                       PURE LOGIC — most bugs are fixed here, and it is where tests live
  docx/    parse.ts, build.ts, build-rich.ts (38 KB!), template-docx.ts
  refs/    parsers (ris, enw, enxml, bibtex, nbib, csl-json, csv, cff…), styles, dedupe
  lookup/  crossref, openalex, pubmed, enrich   (external metadata APIs)
  markers/ citation marker detection ([1], [1-3]) + byline.ts
  editor/  numbering, abstract, abbreviations, mixed-content, to-export
  ai/      provider, registry, guard, gemini/openai/anthropic, citation-safety, schemas
  export/  print-html, preview
  integrity/ copyleaks
  i18n/    index.ts  (tr + en dictionaries — MUST stay key-identical)
store/     db.ts  Dexie schema + migrations (v1→v4)
docs/      SPEC.md (contract), this file
```

**Rule of thumb**: if the bug is in parsing, formatting, detection, numbering,
export content, or merge logic → fix it in `lib/` and add/adjust a
`*.test.ts` next to it. If it is layout/interaction → it is in a component.

---

## 4. How to fix a bug (the loop)

1. **Reproduce first.** Find or write a failing `*.test.ts` that captures the
   bug against the real exported API. Run it, watch it fail. Tests use the node
   runner: `node --import tsx --test lib/path/thing.test.ts`.
2. **Fix the source**, not the test — unless the test itself encodes wrong
   behavior (then fix the test and say why in the commit).
3. **Re-run that test**, then the full four gates (§2).
4. If the change is visible in the browser (editor, import, export preview,
   panels), verify it live with the dev server before claiming done.
5. Keep the diff minimal and matching surrounding style. Immutable updates
   (spread, no in-place mutation). No `console.log` left in `lib/`.

Test idiom to copy (match existing files exactly):

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { thing } from './thing';

describe('thing', () => {
  it('does X', () => { assert.equal(thing(input), expected); });
});
```

---

## 5. Invariants you must not break

These are load-bearing. Breaking one is a regression even if tests pass.

- **Citation safety (AI rewrite)**: citations are encoded as private-use-area
  sentinels (`` / ``) before text goes to an LLM, then restored.
  The sentinel constants in `lib/ai/citation-safety.ts` and
  `lib/editor/mixed-content.ts` MUST be non-empty PUA chars and identical
  across both files. If they become empty strings, plain digits in prose get
  parsed as citations and deleted. (This was a real bug — do not reintroduce.)
- **Parsers never throw** on truncated/garbage input — return `[]` or partial.
- **Format sniffing** (`lib/refs/import-auto.ts`): each format's canonical
  sample must route to the correct parser. RIS and nbib share `TI`/`AU` tags —
  a `TY  -` line means RIS, and `looksLikeNbib` defers to it.
- **Enrichment merge** (`lib/lookup/enrich.ts`): a low-confidence title match
  must NEVER replace the user's title/authors/year with an unrelated paper.
  Exact-DOI matches are authoritative but never blank fields the source lacks.
- **i18n parity**: `tr` and `en` in `lib/i18n/index.ts` expose identical key
  sets. `lib/i18n/parity.test.ts` enforces it — add every new key to both.
- **Dexie migrations** (`store/db.ts`): never drop an object store; upgrades
  only add. `store/db.test.ts` seeds a real v1 DB and checks survival.
- **Citation numbering**: numbered by order of first appearance; insert/delete
  renumbers document + bibliography consistently.
- **Byline skip** (`lib/markers/byline.ts`): author/affiliation numbers
  (`Smith 1,2`) are NOT citations. MDPI export also uses this to style front
  matter.

---

## 6. API routes — contract summary

All under `app/api/**/route.ts`. Failure behavior matters for bug reports.

- `POST /api/ai/*` (12 feature routes): each calls `checkRateLimit` first
  (20/min per IP, in-memory), Zod-bounds the body, times out, and **sanitizes
  errors** — no provider detail or stack traces reach the client. Codes:
  429 rate, 503 not-configured, 502 upstream, 504 timeout.
- `GET /api/ai/status`: read-only, unguarded, always 200.
- `POST /api/ai/test`: diagnostics; MAY return provider error text (excluded
  from the sanitized contract) to help fix server config.
- `POST /api/lookup`: CrossRef/OpenAlex/PubMed metadata; 1 h cache; falls
  through providers; Turkish error strings.
- `GET /api/mesh/lookup`: MeSH autocomplete (NCBI); empty on failure.
- `GET|POST /api/pdf-proxy`: host allowlist + 50 MB cap + PDF magic-byte check.
  403 off-list, 413 oversize. SSRF-sensitive — keep the allowlist.
- `GET|POST /api/pdf-resolve`: DOI→OA PDF; returns `{pdfUrl:null}` on miss.
- `POST /api/integrity/*`: Copyleaks; env-gated (503 when unconfigured);
  webhook verified against `COPYLEAKS_WEBHOOK_SECRET`; HTTPS webhook base only.
- `GET /api/health`: liveness, always 200.

AI keys are **server-side env only** (`GEMINI_API_KEY`, `OPENAI_API_KEY`,
`ANTHROPIC_API_KEY`, `OPENAI_BASE_URL`, …). The browser stores no keys — do not
add localStorage key UI back. All env vars are optional; AI simply reports
"not configured" when absent.

---

## 7. Known traps (things that will bite you)

- **`app/edit/EditorClient.tsx` is ~3700 lines.** Read it in offset chunks;
  re-read before editing (context may be stale). Do not attempt a whole-file
  refactor as part of a bugfix.
- **`lib/docx/build-rich.ts` is 38 KB** — the OOXML/EndNote export core.
  Changes here are high-risk; lean on `build-rich.test.ts` and
  `template-docx.test.ts` and inspect generated XML in the test, not by eye.
- **Stale PWA service worker**: after a rebuild, `public/sw.js` can serve old
  JS chunks and the editor shows "This page couldn't load" /
  "module factory is not available". Fix by unregistering the SW + clearing
  caches in the browser (not a code bug):
  ```js
  (async () => {
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    for (const k of await caches.keys()) await caches.delete(k);
    location.reload();
  })()
  ```
- **Empty project ≠ editor**: clicking "Empty project" lands on a workspace
  hub; the manuscript editor opens via "Open Editor". Relevant for E2E and
  repro steps.
- **Default UI locale is Turkish** in a fresh browser context. Assertions and
  scripts must handle both languages (many labels are `tr/en`).
- **Sentinel chars are invisible** in most editors/greps. When you `grep` for
  the OPEN/CLOSE constants they show as `M-nM-^@...`. Do not "clean them up".
- **Do not commit unless asked.** Commit messages end without AI attribution
  (repo convention). Branch off `main` if you must commit.

---

## 8. Fixing an MDPI/journal export bug (common area)

The JCM/MDPI docx export injects the generated body into a real Word template
(`public/templates/jcm-template.dot`), preserving its `styles.xml`, headers,
page setup. Mapping lives in `lib/docx/template-docx.ts` (`styleMap`), rendering
in `lib/docx/build-rich.ts`.

- Front matter (article type, byline, affiliations) and back matter (Author
  Contributions, Funding, Conflicts…) are auto-detected and mapped to MDPI
  styles. Ground truth is the production layout file the client provides
  (e.g. `jcm-*-layout version.docx`) — unzip it and compare the paragraph
  `w:pStyle` sequence.
- On-screen "Export preview" (`lib/export/preview.ts`) renders the same content
  as an A4 sheet with a standard or MDPI theme. Keep it consistent with the
  docx output.

---

## 9. Reporting your work back

When you finish, report:
1. Root cause in one or two sentences (symptom → cause).
2. The exact files changed and why.
3. Which gates you ran and their result (paste the tail: `# pass N # fail 0`).
4. Any invariant from §5 you touched and how you preserved it.
5. Anything you could not verify and why.

Do not report "build PASS" you did not run. If a gate fails and you cannot fix
it, stop and surface the failure with the error output.
