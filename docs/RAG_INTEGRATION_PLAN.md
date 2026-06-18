# RAG Integration Plan — PDF-based Q&A over the Reference Library

**Goal:** Add a per-project, embedding-based "Ask your library" feature. A user can open one or more PDFs, have their text chunked, embedded, and stored locally, then ask natural-language questions and receive answers with citations that point back to specific PDF pages and reference records.

**Scope:** The implementation is intentionally browser-first and local-only: IndexedDB stores chunks and embeddings, existing `/api/rag/*` server routes provide embedding and chat inference, and the UI is mounted inside the existing editor workspace.

---

## 1. Current State

The codebase already contains most of the RAG plumbing, which this feature reuses rather than duplicates.

### 1.1 Existing RAG server routes

- `app/api/rag/chat/route.ts` — Anthropic-based RAG chat. Accepts `question`, `contextChunks` (`{ id, text, refId, pageNo }[]`), and optional `history`. The system prompt requires the model to cite chunks with `[chunk_id]`.
- `app/api/rag/embed/route.ts` — Proxies OpenAI `text-embedding-3-small` (1536-dim) and returns base64-encoded `Float32Array` vectors.

### 1.2 Existing RAG client utilities

- `lib/rag/chat-client.ts` — Browser wrapper for `/api/rag/chat`.
- `lib/rag/embed-client.ts` — Browser wrapper for `/api/rag/embed`; decodes base64 vectors.
- `lib/rag/chunker.ts` — `chunkText(text, opts)` returns `{ text, charStart, charEnd, tokenCount }`. Defaults: 500 tokens, 50-token overlap, sentence/paragraph boundary snapping.
- `lib/rag/cosine.ts` — `cosineSimilarity`, `topK(query, candidates, k)`, and `mmrReRank(...)` for local reranking.
- `lib/rag/errors.ts` — Typed error classes for retry/back-off handling.

### 1.3 Existing PDF text extraction

- `lib/pdf/extract.ts`:
  - `getPdfText(doc, maxPages = 30)` (line 30) — extracts text from a `PDFDocumentProxy` page-by-page.
  - `getPdfMetadata(doc)` (line 52) — returns title/author/subject/keywords.
  - `extractIds(text)` (line 45) — finds DOIs, PMIDs, arXiv IDs.

### 1.4 Existing IndexedDB layer

- `store/db.ts` — Dexie database currently at **version 4** (line 41).
  - Stores: `projects`, `snapshots`, `phrasebanks`, `kv`.
- `store/types.ts`:
  - `Project` (line 86) has no per-project PDF registry.
  - `Ref` (line 17) already has `embedding?: number[]` and `embeddingSource?: string`, but these are reserved for title+abstract semantic citation suggestions (`lib/ai/embed-refs.ts`), **not** for PDF chunk embeddings.

### 1.5 Existing UI mounting points

- `app/edit/EditorClient.tsx`:
  - Header toolbar has fixed icons and a `CommandPalette` (`commands` array at line 2274).
  - Right-hand panel renders `<RefsPanel ...>` at line 2671.
  - Fixed overlays (e.g. `aiReview`, `aiGaps`, `aiSuggest`) use a `fixed left-4 top-24 bottom-4 w-[...] z-40` pattern (lines 2887–2964).
- `components/RefsPanel/RefsPanel.tsx` — library tab header (lines 110–142), currently supports Library / Aspects / History / Add tabs.
- `app/reader/ReaderClient.tsx` — standalone PDF reader with a `ProjectPicker` and `WorkspaceSaver`. PDFs are loaded ad-hoc (`source: File | string | null` at line 37). There is **no** project-level list of attached PDFs today.

### 1.6 Existing i18n keys

- `lib/i18n/index.ts` already contains a `// RAG — kütüphaneye sor` block with keys such as `rag_title`, `rag_input_placeholder`, `rag_send`, `rag_sources`, etc. These can be reused for the panel labels.

---

## 2. Dexie Schema Diff (v4 → v5)

The new tables are project-scoped so embeddings and chunks can be cleaned up when a project is deleted or shrunk. They are kept separate from the `Project` object so snapshots and Google Drive sync do not balloon.

### 2.1 New types (`store/types.ts`)

```ts
export type ProjectPdf = {
  id: string;
  projectId: string;
  /** Stable id for the owning reference, if the PDF is linked to a Ref. */
  refId?: string;
  /** Human-friendly label shown in the RAG panel. */
  label: string;
  /** SHA-256 hex digest of the file bytes. Used to skip re-processing. */
  hash: string;
  /** Byte length of the original PDF. */
  size: number;
  /** Number of pages actually indexed (maxPages cap). */
  pageCount: number;
  /** ISO timestamp of ingestion. */
  indexedAt: number;
};

export type PdfChunk = {
  id: string;
  projectId: string;
  pdfId: string;
  /** 1-based page number where the chunk text starts. */
  pageNo: number;
  /** Character offset inside the extracted plain text of that page. */
  charStart: number;
  charEnd: number;
  /** Plain text of the chunk. */
  text: string;
  /** Approximate token count used for chunking diagnostics. */
  tokenCount: number;
};

export type PdfEmbedding = {
  /** Equal to the corresponding PdfChunk.id for direct joins. */
  chunkId: string;
  projectId: string;
  pdfId: string;
  /** Float32 embedding vector stored as a plain number[]. */
  vector: number[];
  /** Model name that produced the vector (e.g. text-embedding-3-small). */
  model: string;
};
```

### 2.2 Schema bump (`store/db.ts`)

Add after the v4 block (after line 46):

```ts
db.version(5).stores({
  projects: 'id, updatedAt',
  snapshots: 'id, projectId, createdAt',
  phrasebanks: 'id, updatedAt',
  kv: 'key',
  projectPdfs: 'id, projectId, [projectId+hash]',
  pdfChunks: 'id, projectId, pdfId, [projectId+pdfId]',
  pdfEmbeddings: 'chunkId, projectId, pdfId, [projectId+pdfId]',
});
```

Indexes:

- `projectPdfs` by `projectId` and compound `[projectId+hash]` for duplicate detection.
- `pdfChunks` by `projectId`, `pdfId`, and compound `[projectId+pdfId]` for fast deletion.
- `pdfEmbeddings` by `chunkId` (primary), plus `projectId`/`pdfId` for cleanup.

### 2.3 Interface update (`store/db.ts`)

Update `AppDB` (line 11):

```ts
export interface AppDB extends Dexie {
  projects: EntityTable<Project, 'id'>;
  snapshots: EntityTable<Snapshot, 'id'>;
  phrasebanks: EntityTable<UserPhrasebank, 'id'>;
  kv: EntityTable<KvRow, 'key'>;
  projectPdfs: EntityTable<ProjectPdf, 'id'>;
  pdfChunks: EntityTable<PdfChunk, 'id'>;
  pdfEmbeddings: EntityTable<PdfEmbedding, 'chunkId'>;
}
```

### 2.4 New DB helpers (`store/db.ts`)

Add alongside existing helpers:

```ts
export async function listProjectPdfs(projectId: string): Promise<ProjectPdf[]> {
  return getDb().projectPdfs.where('projectId').equals(projectId).sortBy('indexedAt');
}

export async function getProjectPdfByHash(
  projectId: string,
  hash: string,
): Promise<ProjectPdf | undefined> {
  return getDb().projectPdfs.where({ projectId, hash }).first();
}

export async function addProjectPdf(pdf: Omit<ProjectPdf, 'id'>): Promise<ProjectPdf> {
  const row: ProjectPdf = { ...pdf, id: newId('pdf') };
  await getDb().projectPdfs.put(row);
  return row;
}

export async function deleteProjectPdf(projectId: string, pdfId: string): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.projectPdfs, db.pdfChunks, db.pdfEmbeddings, async () => {
    await db.projectPdfs.delete(pdfId);
    const chunkIds = await db.pdfChunks
      .where({ projectId, pdfId })
      .primaryKeys();
    await db.pdfChunks.where({ projectId, pdfId }).delete();
    await db.pdfEmbeddings.bulkDelete(chunkIds);
  });
}

export async function clearProjectPdfs(projectId: string): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.projectPdfs, db.pdfChunks, db.pdfEmbeddings, async () => {
    await db.projectPdfs.where('projectId').equals(projectId).delete();
    await db.pdfChunks.where('projectId').equals(projectId).delete();
    await db.pdfEmbeddings.where('projectId').equals(projectId).delete();
  });
}

export async function putPdfChunksAndEmbeddings(
  projectId: string,
  pdfId: string,
  chunks: Omit<PdfChunk, 'id' | 'projectId' | 'pdfId'>[],
  vectors: number[][],
  model: string,
): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.pdfChunks, db.pdfEmbeddings, async () => {
    await db.pdfChunks.where({ projectId, pdfId }).delete();
    const keptEmbeddings = await db.pdfEmbeddings.where({ projectId, pdfId }).primaryKeys();
    await db.pdfEmbeddings.bulkDelete(keptEmbeddings);

    const insertedChunks: PdfChunk[] = [];
    for (const c of chunks) {
      insertedChunks.push({
        id: newId('chunk'),
        projectId,
        pdfId,
        pageNo: c.pageNo,
        charStart: c.charStart,
        charEnd: c.charEnd,
        text: c.text,
        tokenCount: c.tokenCount,
      });
    }
    await db.pdfChunks.bulkAdd(insertedChunks);

    const embeddings: PdfEmbedding[] = insertedChunks.map((chunk, i) => ({
      chunkId: chunk.id,
      projectId,
      pdfId,
      vector: vectors[i],
      model,
    }));
    await db.pdfEmbeddings.bulkAdd(embeddings);
  });
}

export async function getProjectChunksAndEmbeddings(
  projectId: string,
): Promise<Array<PdfChunk & { vector: number[] }>> {
  const db = getDb();
  const chunks = await db.pdfChunks.where('projectId').equals(projectId).toArray();
  const embeddings = await db.pdfEmbeddings.where('projectId').equals(projectId).toArray();
  const byChunkId = new Map(embeddings.map((e) => [e.chunkId, e.vector]));
  return chunks
    .map((c) => ({ ...c, vector: byChunkId.get(c.id) }))
    .filter((c): c is PdfChunk & { vector: number[] } => !!c.vector);
}
```

> **Important:** `shrinkProject` (line 211) currently clears `Ref.embedding`. Extend it to also call `clearProjectPdfs(projectId)` when the user opts in, but **do not** clear PDF data automatically on every shrink — chunks are much larger than title embeddings.

---

## 3. API Route Adaptation

The existing routes already match the required contract. Only small augmentations are needed.

### 3.1 `app/api/rag/embed/route.ts`

Current behavior: accepts `texts: string[]`, optional `model`, returns `{ embeddings: string[] }` where each string is base64 Float32 bytes.

Required change: **none**. Continue using the same route. The client will send batches of chunk texts.

### 3.2 `app/api/rag/chat/route.ts`

Current behavior: accepts `contextChunks` with `{ id, text, refId, pageNo }`, forces citations with `[chunk_id]`.

Required changes:

1. The route already surfaces `refId` and `pageNo` in the chunk schema. Keep sending them.
2. The system prompt contains a Turkish fallback answer when no context is found. Ensure the client sends at least one chunk, or change the fallback to the active UI language.
3. Add an optional `language` field to the body so the model can answer in the user's language (the editor supports `tr` and `en`).

```ts
const BodySchema = z.object({
  question: z.string().min(1).max(MAX_QUESTION_CHARS),
  contextChunks: z.array(z.object({
    id: z.string(),
    text: z.string(),
    refId: z.string().optional(),
    pageNo: z.number().int().optional(),
  })).max(MAX_CHUNKS),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() }))
    .max(MAX_HISTORY)
    .optional(),
  language: z.enum(['tr', 'en']).optional(),
});
```

Update the system prompt to include the language instruction when provided.

---

## 4. Client Library / Hook

Create a single new module that orchestrates ingestion and retrieval.

### 4.1 New file: `lib/rag/pdf-indexer.ts`

Responsibilities:

- Hash PDF bytes with the Web Crypto API (`crypto.subtle.digest('SHA-256', ...)`).
- Extract text per page with `getPdfText(doc)` or `page.getTextContent()` directly if page-level boundaries are required.
- Chunk text with `chunkText()`.
- Embed chunks in batches (e.g. 32 per call) via `embedTexts()` from `lib/rag/embed-client.ts`.
- Persist `ProjectPdf`, `PdfChunk`, and `PdfEmbedding` rows via the new DB helpers.
- Skip re-processing when `hash` matches an existing `ProjectPdf`.

Key function signatures:

```ts
export async function indexPdf(
  projectId: string,
  source: File | ArrayBuffer,
  options?: {
    label?: string;
    refId?: string;
    maxPages?: number;
    chunkSize?: number;
    chunkOverlap?: number;
    onProgress?: (done: number, total: number) => void;
  },
): Promise<ProjectPdf>;

export async function searchProjectChunks(
  projectId: string,
  query: string,
  options?: { topK?: number; mmrLambda?: number },
): Promise<Array<PdfChunk & { pdfLabel: string; refId?: string; score: number }>>;
```

Implementation notes:

- For page-level provenance, do **not** call `getPdfText(doc)` which concatenates pages. Instead iterate `doc.getPage(i)` and chunk per page, carrying `pageNo` into each chunk.
- Pass `chunkSize: 500, chunkOverlap: 50` to `chunkText` to match the existing default.
- Use `topK` from `lib/rag/cosine.ts` for retrieval, then optionally `mmrReRank` for diversity.
- Decode the query embedding with `embedTexts([query])` from `lib/rag/embed-client.ts`.

### 4.2 New hook: `lib/hooks/useRag.ts` (optional but recommended)

Wraps the indexer and chat client for the React panel:

```ts
export function useRag(projectId: string) {
  const [busy, setBusy] = useState(false);
  const [pdfs, setPdfs] = useState<ProjectPdf[]>([]);
  const [answer, setAnswer] = useState<RagChatResponse | null>(null);

  const refresh = useCallback(async () => {
    setPdfs(await listProjectPdfs(projectId));
  }, [projectId]);

  const indexFile = useCallback(async (file: File, label?: string) => {
    setBusy(true);
    try {
      const pdf = await indexPdf(projectId, file, { label });
      await refresh();
      return pdf;
    } finally {
      setBusy(false);
    }
  }, [projectId, refresh]);

  const ask = useCallback(async (question: string, lang: 'tr' | 'en') => {
    setBusy(true);
    try {
      const chunks = await searchProjectChunks(projectId, question, { topK: 8 });
      const response = await ragChat({
        question,
        contextChunks: chunks.map((c) => ({
          id: c.id,
          text: c.text,
          refId: c.refId,
          pageNo: c.pageNo,
        })),
        language: lang,
      });
      setAnswer(response);
      return response;
    } finally {
      setBusy(false);
    }
  }, [projectId]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { pdfs, busy, indexFile, ask, answer, refresh };
}
```

---

## 5. UI Hook Points

### 5.1 New panel: `components/Rag/RagPanel.tsx`

A fixed right-side panel following the existing overlay pattern.

Features:

- Header with close button and "Index PDF" file input.
- List of indexed PDFs with page counts and delete buttons.
- Question input, send button, streaming/loading state.
- Answer area that parses `[chunk_id]` citations and renders them as clickable badges.
- Clicking a citation scrolls to / highlights the chunk text and shows `(PDF label, p. N)`.

Layout skeleton (matches `aiReview.open` at line 2887):

```tsx
<div className="fixed left-4 top-24 bottom-4 w-[420px] z-40 shadow-2xl">
  <RagPanel projectId={project.id} onClose={() => setRagOpen(false)} lang={lang} />
</div>
```

### 5.2 Open from the header

In `app/edit/EditorClient.tsx`, add a new `HeaderIcon` near line 2504 inside the header icon row:

```tsx
<HeaderIcon
  onClick={() => setRagOpen(true)}
  title={t('rag_title') ?? 'Ask library'}
  label="🧠"
  caption={t('rag_title') ?? 'RAG'}
/>
```

Add `ragOpen` state near other panel states (around line 243):

```ts
const [ragOpen, setRagOpen] = useState(false);
```

Mount the panel in the JSX tree near other overlays (after line 3018):

```tsx
{ragOpen && (
  <div className="fixed left-4 top-24 bottom-4 w-[420px] z-40 shadow-2xl">
    <RagPanel projectId={project.id} onClose={() => setRagOpen(false)} lang={lang} />
  </div>
)}
```

### 5.3 Open from the command palette

Add a command in the `commands` array at line 2274:

```ts
{ id: 'rag-ask', group: t('cmd_g_ai'), label: t('rag_title') ?? 'Ask library', disabled: aiOff, run: () => setRagOpen(true) }
```

### 5.4 RefsPanel integration (optional)

In `components/RefsPanel/RefsPanel.tsx`, add a "Library Q&A" tab next to the existing Library / Aspects / History / Add tabs. When active, render `<RagPanel ...>` inline or open the fixed overlay. This is a lower-priority alternative to the header icon.

### 5.5 PDF reader integration (optional)

In `app/reader/ReaderClient.tsx`, add a "Index this PDF" button in the header (near line 277). When clicked:

1. If `source` is a `File`, call `indexPdf(projectId, source, { label: source.name })`.
2. If `source` is a URL, fetch bytes with `fetchPdfBytes(source)`, hash, and index.

This lets users index PDFs directly from the reader instead of reopening them in the editor.

---

## 6. Conflict Analysis

| Existing feature | Potential conflict | Mitigation |
|---|---|---|
| `Ref.embedding` / `embeddingSource` (lines 40–41) | These store title+abstract vectors for semantic citation suggestions. PDF chunk vectors must not overwrite them. | Store PDF vectors in the new `pdfEmbeddings` table keyed by `chunkId`, not inside `Ref`. |
| Snapshots / Google Drive sync | Chunks and embeddings are large. Including them in `Project` or `Snapshot` would blow up backup size. | New Dexie tables are not part of `Project`/`Snapshot`; they stay local-only and are rebuilt on restore. |
| `shrinkProject` (line 211) | Currently clears only `Ref.embedding`. A user may expect shrink to also free PDF data. | Add a user-facing checkbox or extend shrink with an explicit "Clear indexed PDFs" step. Do not auto-clear. |
| `app/api/rag/chat/route.ts` Turkish fallback | The fallback message is hard-coded Turkish. If the UI is English, it feels broken. | Pass `language` from the client and update the system prompt accordingly. |
| `lib/pdf/extract.ts` `getPdfText` maxPages default = 30 | Indexing only the first 30 pages may surprise users with long PDFs. | Make `maxPages` configurable in `indexPdf` options and expose it in the panel UI. |
| `WorkspaceSaver` / `savePdfToProjectSources` | Saves PDF files to the local FS workspace but does not record them in IndexedDB. | Use `WorkspaceSaver` output path as the `label`, but keep the new `projectPdfs` row as the source of truth for RAG. |
| `CitationPanel` in the reader | Extracts DOIs/PMIDs and creates `Ref` records. A PDF could be indexed and also added as a ref. | Allow optional `refId` on `ProjectPdf`. When the user creates a ref from the PDF, link the indexed PDF to that ref. |

---

## 7. File Checklist

### Must change

| File | Change |
|---|---|
| `store/types.ts` | Add `ProjectPdf`, `PdfChunk`, `PdfEmbedding` types. |
| `store/db.ts` | Add v5 schema, update `AppDB`, add `listProjectPdfs`, `getProjectPdfByHash`, `addProjectPdf`, `deleteProjectPdf`, `clearProjectPdfs`, `putPdfChunksAndEmbeddings`, `getProjectChunksAndEmbeddings`. |
| `lib/rag/pdf-indexer.ts` | **New.** Orchestrates hashing, text extraction, chunking, embedding, and persistence. |
| `lib/hooks/useRag.ts` | **New.** React hook wrapping the indexer and chat client. |
| `components/Rag/RagPanel.tsx` | **New.** UI for indexing PDFs, asking questions, and showing cited answers. |
| `app/edit/EditorClient.tsx` | Add `ragOpen` state, header icon, command-palette entry, and fixed panel mount. |
| `app/api/rag/chat/route.ts` | Accept optional `language` and localize the no-context fallback. |

### Should change

| File | Change |
|---|---|
| `app/reader/ReaderClient.tsx` | Add "Index this PDF" button when a project is selected. |
| `components/RefsPanel/RefsPanel.tsx` | Optional "Library Q&A" tab. |
| `lib/fs/workspace.ts` | If needed, export `derivePdfFilename` result or path for richer `ProjectPdf.label`. |
| `store/db.ts` `shrinkProject` | Add optional PDF index clearing. |

### No change required

| File | Reason |
|---|---|
| `app/api/rag/embed/route.ts` | Existing contract already fits chunk embedding. |
| `lib/rag/chat-client.ts` | Existing contract fits; only pass `language`. |
| `lib/rag/embed-client.ts` | No changes. |
| `lib/rag/chunker.ts` | No changes. |
| `lib/rag/cosine.ts` | No changes. |
| `lib/pdf/extract.ts` | Reuse `getPdfText` or per-page extraction directly. |
| `lib/ai/citation-safety.ts` | Unrelated sentinel-based citation preservation for AI rewrites. |

---

## 8. Data Flow

```text
User opens PDF (Reader) or selects file (RAG panel)
        │
        ▼
indexPdf(projectId, source)
        │
        ├── sha256(source bytes) ──► existing ProjectPdf? skip
        │
        ├── extract text per page (pdf.js)
        │
        ├── chunkText(pageText) ──► PdfChunk rows
        │
        ├── embedTexts(chunks) ──► /api/rag/embed
        │
        └── bulkAdd PdfChunk + PdfEmbedding
        │
User asks question
        │
        ▼
searchProjectChunks(projectId, query)
        │
        ├── embedTexts([query])
        ├── load all project PdfChunk + PdfEmbedding
        ├── cosine topK / MMR rerank
        └── return top chunks with pdfId/pageNo
        │
        ▼
ragChat({ question, contextChunks, language })
        │
        ▼
/api/rag/chat ──► model answers with [chunk_id] citations
        │
        ▼
RagPanel renders answer + clickable citation badges
```

---

## 9. Testing & Acceptance Criteria

- [ ] Upgrading an existing browser with v4 DB opens cleanly and creates the three new stores.
- [ ] Indexing the same PDF twice does not create duplicate `ProjectPdf`/`PdfChunk`/`PdfEmbedding` rows.
- [ ] Deleting a project deletes all its PDF rows, chunks, and embeddings.
- [ ] Asking a question returns an answer containing at least one `[chunk_id]` citation when the indexed PDFs are relevant.
- [ ] Clicking a citation in the answer highlights the chunk text and shows the PDF label + page number.
- [ ] The feature is gated by the existing AI configuration check (no API key → disabled button / explain tooltip).
- [ ] Works in both `tr` and `en` UI languages.
- [ ] Snapshot/export does not include chunks/embeddings; restoring from backup rebuilds indexes on demand.

---

## 10. Open Questions

1. Should indexing be automatic when a PDF is saved via `WorkspaceSaver`, or should it remain an explicit user action? **Recommendation:** explicit action to avoid surprising quota/billing usage.
2. Should the chunk store include the full per-page bounding boxes for highlight rendering? **Recommendation:** defer; use `pageNo` only in the MVP.
3. Should PDFs linked to `Ref` records be discoverable automatically from `url` or `doi` fields? **Recommendation:** no; require explicit file selection because URLs are not reliably fetchable in the browser.
