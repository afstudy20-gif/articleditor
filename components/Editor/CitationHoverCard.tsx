'use client';

import { useEffect, useState } from 'react';
import type { Ref } from '@/store/types';
import { authorList, journalLine } from '@/lib/refs/display';

type Props = {
  refs: Ref[];
  numbers: number[];
  /** Bounding rect of the citation marker in the page, for positioning. */
  anchorRect: DOMRect;
  lang: 'tr' | 'en';
  onMouseEnter: () => void;
  onMouseLeave: () => void;
};

// Per-DOI, per-session cache so re-hovering the same citation doesn't refetch.
// Never persisted — this is scratch UI state, not user data.
const oaCache = new Map<string, string | null>();

const CARD_WIDTH = 360;
const MARGIN = 8;

function clampLeft(x: number): number {
  if (typeof window === 'undefined') return x;
  return Math.min(Math.max(MARGIN, x), window.innerWidth - CARD_WIDTH - MARGIN);
}

function OpenAccessLink({ doi, lang }: { doi: string; lang: 'tr' | 'en' }): JSX.Element {
  const [state, setState] = useState<'loading' | 'found' | 'none'>(
    oaCache.has(doi) ? (oaCache.get(doi) ? 'found' : 'none') : 'loading',
  );
  const [url, setUrl] = useState<string | null>(oaCache.get(doi) ?? null);

  useEffect(() => {
    if (oaCache.has(doi)) return;
    let cancelled = false;
    fetch('/api/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'oa', doi }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { oaUrl?: string | null } | null) => {
        if (cancelled) return;
        const resolved = data?.oaUrl ?? null;
        oaCache.set(doi, resolved);
        setUrl(resolved);
        setState(resolved ? 'found' : 'none');
      })
      .catch(() => {
        if (cancelled) return;
        setState('none');
      });
    return () => {
      cancelled = true;
    };
  }, [doi]);

  if (state === 'loading') {
    return <span className="text-[11px] text-muted">{lang === 'tr' ? 'Tam metin aranıyor…' : 'Finding full text…'}</span>;
  }
  if (state === 'none' || !url) {
    return <span className="text-[11px] text-muted">{lang === 'tr' ? 'Açık erişim bulunamadı' : 'No open-access version found'}</span>;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener"
      className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:underline"
    >
      🔓 {lang === 'tr' ? 'Tam metin (açık erişim)' : 'Full text (open access)'}
    </a>
  );
}

function RefCard({ r, number, lang }: { r: Ref; number?: number; lang: 'tr' | 'en' }): JSX.Element {
  const abstractSnippet = r.abstract?.trim();
  return (
    <div className="p-3 space-y-1.5">
      <div className="flex items-start gap-2">
        {number != null && (
          <span className="shrink-0 mt-0.5 w-5 h-5 rounded-full bg-teal-bg text-teal text-[10px] font-bold flex items-center justify-center">
            {number}
          </span>
        )}
        <div className="min-w-0">
          <div className="font-semibold text-primary text-[13px] leading-snug">
            {r.title || (lang === 'tr' ? '(Başlıksız)' : '(Untitled)')}
          </div>
          <div className="text-[11px] text-muted mt-0.5">
            {authorList(r)} {r.year ? `· ${r.year}` : ''}
          </div>
          {journalLine(r, '') && <div className="text-[11px] text-secondary italic">{journalLine(r)}</div>}
        </div>
      </div>
      {abstractSnippet && (
        <p className="text-[11px] text-secondary leading-relaxed line-clamp-4">
          <span className="font-semibold text-muted uppercase tracking-wide text-[9px] mr-1">
            {lang === 'tr' ? 'Özet' : 'Abstract'}
          </span>
          {abstractSnippet}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
        {r.doi && (
          <a
            href={`https://doi.org/${r.doi}`}
            target="_blank"
            rel="noopener"
            className="text-[11px] font-semibold text-teal hover:underline"
          >
            DOI ↗
          </a>
        )}
        {r.pmid && (
          <a
            href={`https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/`}
            target="_blank"
            rel="noopener"
            className="text-[11px] font-semibold text-teal hover:underline"
          >
            PubMed ↗
          </a>
        )}
        {r.doi ? (
          <OpenAccessLink doi={r.doi} lang={lang} />
        ) : r.url ? (
          <a href={r.url} target="_blank" rel="noopener" className="text-[11px] font-semibold text-teal hover:underline">
            {lang === 'tr' ? 'Kaynak ↗' : 'Source ↗'}
          </a>
        ) : null}
      </div>
    </div>
  );
}

export function CitationHoverCard({ refs, numbers, anchorRect, lang, onMouseEnter, onMouseLeave }: Props): JSX.Element | null {
  if (refs.length === 0) return null;

  const top = anchorRect.bottom + window.scrollY + 6;
  const left = clampLeft(anchorRect.left + window.scrollX);

  return (
    <div
      className="fixed z-[60] bg-white border border-border rounded-xl shadow-xl divide-y divide-border overflow-hidden animate-in fade-in duration-150"
      style={{ top, left, width: CARD_WIDTH, maxHeight: '60vh', overflowY: 'auto' }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {refs.map((r, i) => (
        <RefCard key={r.id} r={r} number={numbers[i]} lang={lang} />
      ))}
    </div>
  );
}
