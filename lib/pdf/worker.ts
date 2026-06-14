'use client';

let loaded: typeof import('pdfjs-dist') | null = null;

export async function loadPdfjs(): Promise<typeof import('pdfjs-dist')> {
  if (loaded) return loaded;
  const mod = await import('pdfjs-dist');
  mod.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  loaded = mod;
  return mod;
}
