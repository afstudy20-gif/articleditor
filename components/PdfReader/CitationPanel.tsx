'use client';

import { useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Ref } from '@/store/types';
import { extractIds, getPdfMetadata, getPdfText } from '@/lib/pdf/extract';
import { enrichRef } from '@/lib/lookup/enrich';
import { newId } from '@/lib/id';

type Props = {
  doc: PDFDocumentProxy | null;
  onAddRef?: (ref: Ref) => void;
};

type Candidate = {
  key: string;
  source: 'doi' | 'pmid' | 'arxiv' | 'meta';
  raw: string;
  ref?: Ref;
  status: 'pending' | 'loading' | 'ok' | 'err';
  err?: string;
};

export function CitationPanel({ doc, onAddRef }: Props) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [scanning, setScanning] = useState(false);

  async function scan() {
    if (!doc) return;
    setScanning(true);
    try {
      const text = await getPdfText(doc);
      const ids = extractIds(text);
      const meta = await getPdfMetadata(doc);

      const items: Candidate[] = [];
      ids.dois.forEach((d) => items.push({ key: `doi:${d}`, source: 'doi', raw: d, status: 'pending' }));
      ids.pmids.forEach((p) => items.push({ key: `pmid:${p}`, source: 'pmid', raw: p, status: 'pending' }));
      ids.arxivIds.forEach((a) => items.push({ key: `arxiv:${a}`, source: 'arxiv', raw: a, status: 'pending' }));
      if (meta.title) {
        items.push({ key: `meta:${meta.title}`, source: 'meta', raw: meta.title, status: 'pending' });
      }
      setCandidates(items);

      for (let i = 0; i < items.length; i += 1) {
        const c = items[i];
        setCandidates((prev) => prev.map((x) => (x.key === c.key ? { ...x, status: 'loading' } : x)));
        const seed: Ref = {
          id: newId('ref'),
          type: 'journal-article',
          authors: [],
          doi: c.source === 'doi' ? c.raw : undefined,
          pmid: c.source === 'pmid' ? c.raw : undefined,
          title: c.source === 'meta' ? c.raw : undefined,
          source: `pdf-${c.source}`,
        };
        try {
          const enriched = await enrichRef(seed);
          setCandidates((prev) =>
            prev.map((x) => (x.key === c.key ? { ...x, ref: enriched, status: 'ok' } : x)),
          );
        } catch (e: unknown) {
          setCandidates((prev) =>
            prev.map((x) =>
              x.key === c.key
                ? { ...x, status: 'err', err: e instanceof Error ? e.message : String(e) }
                : x,
            ),
          );
        }
      }
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="border-b border-gray-200 px-3 py-2">
        <button
          type="button"
          onClick={scan}
          disabled={!doc || scanning}
          className="w-full rounded bg-teal-700 px-3 py-1.5 text-sm text-white hover:bg-teal-800 disabled:opacity-50"
        >
          {scanning ? 'Scanning…' : 'Extract citations'}
        </button>
      </div>
      <div className="flex-1 overflow-auto p-2 text-sm">
        {candidates.length === 0 && (
          <p className="p-3 text-xs text-gray-500">
            Open a PDF and click Extract to find DOIs, PMIDs and metadata.
          </p>
        )}
        <ul className="space-y-1.5">
          {candidates.map((c) => (
            <li key={c.key} className="rounded border border-gray-200 p-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="mr-1 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase text-gray-600">
                    {c.source}
                  </span>
                  <span className="break-all text-xs text-gray-700">{c.raw}</span>
                </div>
                <span className="text-xs text-gray-500">
                  {c.status === 'loading' && '…'}
                  {c.status === 'ok' && '✓'}
                  {c.status === 'err' && '✗'}
                </span>
              </div>
              {c.ref?.title && (
                <p className="mt-1 line-clamp-2 text-xs font-medium text-gray-900">{c.ref.title}</p>
              )}
              {c.ref && (c.ref.containerTitle || c.ref.year) && (
                <p className="text-[11px] text-gray-500">
                  {c.ref.containerTitle}
                  {c.ref.containerTitle && c.ref.year ? ' · ' : ''}
                  {c.ref.year}
                </p>
              )}
              {c.status === 'ok' && c.ref && (
                <button
                  type="button"
                  onClick={() => onAddRef?.(c.ref!)}
                  className="mt-1.5 rounded bg-teal-50 px-2 py-0.5 text-[11px] text-teal-800 hover:bg-teal-100"
                >
                  Add to library
                </button>
              )}
              {c.err && <p className="mt-1 text-[11px] text-red-600">{c.err}</p>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
