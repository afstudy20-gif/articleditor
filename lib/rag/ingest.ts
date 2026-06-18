import { chunkText } from './chunker';
import { embedTexts } from './embed-client';
import { loadPdfjs } from '@/lib/pdf/worker';
import {
  addProjectPdf,
  deleteProjectPdf,
  getProjectPdfByHash,
  putPdfChunksAndEmbeddings,
} from '@/store/db';
import type { PdfChunk, PdfEmbedding, ProjectPdf } from '@/store/types';

const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 100;
const PAGE_SEPARATOR = '\n';

export type IngestProgress =
  | { phase: 'hashing' }
  | { phase: 'extracting'; page: number; total: number }
  | { phase: 'chunking' }
  | { phase: 'embedding'; batch: number; totalBatches: number }
  | { phase: 'persisting' }
  | { phase: 'done'; pdfId: string; chunkCount: number };

function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function indexPdf(opts: {
  file: File;
  projectId: string;
  refId?: string;
  onProgress?: (p: IngestProgress) => void;
}): Promise<ProjectPdf> {
  const { file, projectId, refId, onProgress } = opts;

  onProgress?.({ phase: 'hashing' });
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const sha256 = bufferToHex(digest);

  const existing = await getProjectPdfByHash(projectId, sha256);
  if (existing) {
    onProgress?.({ phase: 'done', pdfId: existing.id, chunkCount: 0 });
    return existing;
  }

  onProgress?.({ phase: 'extracting', page: 0, total: 0 });
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const pageCount = doc.numPages;

  const pageTexts: string[] = [];
  for (let pageNo = 1; pageNo <= pageCount; pageNo += 1) {
    onProgress?.({ phase: 'extracting', page: pageNo, total: pageCount });
    const page = await doc.getPage(pageNo);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .filter(Boolean)
      .join(' ');
    pageTexts.push(text);
  }

  const fullText = pageTexts.join(PAGE_SEPARATOR);
  const charCount = fullText.length;

  const pageBoundaries: number[] = [];
  let offset = 0;
  for (let index = 0; index < pageTexts.length; index += 1) {
    pageBoundaries[index] = offset;
    offset += pageTexts[index].length + PAGE_SEPARATOR.length;
  }

  function pageNoFromCharStart(charStart: number): number {
    for (let index = pageBoundaries.length - 1; index >= 0; index -= 1) {
      if (charStart >= (pageBoundaries[index] ?? 0)) {
        return index + 1;
      }
    }
    return 1;
  }

  onProgress?.({ phase: 'chunking' });
  const rawChunks = chunkText(fullText);

  const totalBatches = Math.ceil(rawChunks.length / BATCH_SIZE);
  onProgress?.({ phase: 'embedding', batch: 0, totalBatches });

  const vectorBuffers: ArrayBuffer[] = [];
  let modelName = '';
  let dim = 0;

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex += 1) {
    onProgress?.({ phase: 'embedding', batch: batchIndex + 1, totalBatches });
    const start = batchIndex * BATCH_SIZE;
    const end = start + BATCH_SIZE;
    const batch = rawChunks.slice(start, end).map((chunk) => chunk.text);

    const { vectors, model, dim: responseDim } = await embedTexts({ texts: batch });
    modelName = model;
    dim = responseDim;

    for (const vector of vectors) {
      const copy = new Float32Array(vector.buffer, vector.byteOffset, vector.byteLength).slice();
      vectorBuffers.push(copy.buffer);
    }

    if (batchIndex < totalBatches - 1) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  const pdfRow = await addProjectPdf({
    projectId,
    refId,
    filename: file.name,
    sha256,
    pageCount,
    charCount,
    addedAt: Date.now(),
  });

  const chunks: PdfChunk[] = rawChunks.map((chunk, index) => ({
    id: `${pdfRow.id}:${index}`,
    pdfId: pdfRow.id,
    projectId,
    refId,
    pageNo: pageNoFromCharStart(chunk.charStart),
    text: chunk.text,
    charStart: chunk.charStart,
    charEnd: chunk.charEnd,
    tokenCount: chunk.tokenCount,
  }));

  const embeddings: PdfEmbedding[] = vectorBuffers.map((vector, index) => ({
    chunkId: `${pdfRow.id}:${index}`,
    pdfId: pdfRow.id,
    projectId,
    vector,
    model: modelName,
    dim,
  }));

  onProgress?.({ phase: 'persisting' });
  try {
    await putPdfChunksAndEmbeddings(chunks, embeddings);
  } catch (err) {
    await deleteProjectPdf(projectId, pdfRow.id);
    throw err;
  }

  onProgress?.({ phase: 'done', pdfId: pdfRow.id, chunkCount: chunks.length });
  return pdfRow;
}
