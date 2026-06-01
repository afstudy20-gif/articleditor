'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Ref } from '@/store/types';

type Highlight = { start: number; end: number; color: string };

type Props = {
  reference: Ref | null;
  number?: number;
  onUpdate?: (id: string, patch: Partial<Ref>) => void;
};

const PALETTE: Array<{ label: string; value: string }> = [
  { label: 'Yellow', value: '#fef08a' },
  { label: 'Green', value: '#bbf7d0' },
  { label: 'Blue', value: '#bfdbfe' },
  { label: 'Pink', value: '#fbcfe8' },
];

function normalizeHighlights(items: Highlight[], textLen: number): Highlight[] {
  const cleaned = items
    .map((h) => ({ ...h, start: Math.max(0, h.start), end: Math.min(textLen, h.end) }))
    .filter((h) => h.end > h.start);
  return cleaned.sort((a, b) => a.start - b.start);
}

function renderAbstract(text: string, highlights: Highlight[]): JSX.Element[] {
  const out: JSX.Element[] = [];
  let cursor = 0;
  for (let i = 0; i < highlights.length; i += 1) {
    const h = highlights[i];
    if (h.start > cursor) out.push(<span key={`t${i}`}>{text.slice(cursor, h.start)}</span>);
    out.push(
      <mark key={`h${i}`} style={{ backgroundColor: h.color, color: 'inherit' }} className="rounded px-0.5">
        {text.slice(h.start, h.end)}
      </mark>,
    );
    cursor = h.end;
  }
  if (cursor < text.length) out.push(<span key="tail">{text.slice(cursor)}</span>);
  return out;
}

export function RefDetail({ reference: r, number, onUpdate }: Props): JSX.Element {
  if (!r) {
    return (
      <div className="card p-6 text-sm text-muted text-center">
        Bir referansı seçince detayı burada görünecek.
      </div>
    );
  }

  const authorStr = r.authors
    .map((a) => {
      if (a.literal) return a.literal;
      const fam = a.family ?? '';
      const giv = a.given ?? '';
      return [fam, giv].filter(Boolean).join(', ');
    })
    .filter(Boolean)
    .join('; ');

  return (
    <div className="card p-4 max-h-full overflow-auto">
      <div className="flex items-center gap-2 mb-3">
        {number != null && (
          <span className="w-8 h-8 rounded-md bg-teal text-white font-bold text-sm flex items-center justify-center">
            {number}
          </span>
        )}
        <span className="text-xs uppercase tracking-wider text-muted font-semibold">Referans detayı</span>
      </div>

      <h4 className="text-sm font-bold text-primary leading-snug mb-3">{r.title || '(Başlık yok)'}</h4>

      <dl className="text-xs space-y-2">
        {authorStr && <Field label="Yazarlar" value={authorStr} />}
        {r.containerTitle && <Field label="Dergi / kaynak" value={r.containerTitle} />}
        <div className="flex flex-wrap gap-3">
          {r.year && <MiniField label="Yıl" value={String(r.year)} />}
          {r.volume && <MiniField label="Cilt" value={r.volume} />}
          {r.issue && <MiniField label="Sayı" value={r.issue} />}
          {r.pages && <MiniField label="Sayfa" value={r.pages} />}
        </div>
        {r.publisher && <Field label="Yayıncı" value={r.publisher} />}
        {r.doi && (
          <Field
            label="DOI"
            value={
              <a
                href={`https://doi.org/${r.doi}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal hover:underline break-all"
              >
                {r.doi}
              </a>
            }
          />
        )}
        {r.pmid && (
          <Field
            label="PMID"
            value={
              <a
                href={`https://pubmed.ncbi.nlm.nih.gov/${r.pmid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal hover:underline"
              >
                {r.pmid}
              </a>
            }
          />
        )}
        {r.url && !r.doi && (
          <Field
            label="URL"
            value={
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal hover:underline break-all"
              >
                {r.url}
              </a>
            }
          />
        )}
        {r.confidence != null && <Field label="Parser güveni" value={`${Math.round(r.confidence * 100)}%`} />}
      </dl>

      {r.userNote && (
        <div className="mt-4 pt-3 border-t border-border">
          <div className="tool-label mb-1.5 flex items-center gap-1">
            <span>📝 Notum</span>
          </div>
          <p className="text-xs text-secondary leading-relaxed whitespace-pre-wrap bg-teal-bg/30 border border-teal/20 rounded p-2">
            {r.userNote}
          </p>
        </div>
      )}

      <AbstractWithHighlights
        refId={r.id}
        text={r.abstract}
        highlights={r.abstractHighlights ?? []}
        onChange={onUpdate ? (next) => onUpdate(r.id, { abstractHighlights: next }) : undefined}
      />

      {r.raw && (
        <details className="mt-4 pt-3 border-t border-border">
          <summary className="tool-label cursor-pointer hover:text-teal">Orijinal satır</summary>
          <p className="text-xs text-muted font-mono mt-2 leading-relaxed whitespace-pre-wrap break-words">{r.raw}</p>
        </details>
      )}
    </div>
  );
}

function AbstractWithHighlights({
  refId,
  text,
  highlights,
  onChange,
}: {
  refId: string;
  text?: string;
  highlights: Highlight[];
  onChange?: (next: Highlight[]) => void;
}): JSX.Element {
  const containerRef = useRef<HTMLParagraphElement>(null);
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);

  // Reset stale selection when switching to another ref.
  useEffect(() => {
    setSelection(null);
  }, [refId]);

  const normalized = useMemo(
    () => normalizeHighlights(highlights, text?.length ?? 0),
    [highlights, text],
  );

  const captureSelection = (): void => {
    const sel = window.getSelection();
    const el = containerRef.current;
    if (!sel || sel.rangeCount === 0 || !el) {
      setSelection(null);
      return;
    }
    const range = sel.getRangeAt(0);
    if (range.collapsed || !el.contains(range.commonAncestorContainer)) {
      setSelection(null);
      return;
    }
    const pre = range.cloneRange();
    pre.selectNodeContents(el);
    pre.setEnd(range.startContainer, range.startOffset);
    const start = pre.toString().length;
    const end = start + range.toString().length;
    if (end > start) setSelection({ start, end });
    else setSelection(null);
  };

  const addHighlight = (color: string): void => {
    if (!selection || !onChange) return;
    onChange([...normalized, { ...selection, color }]);
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  const clearAll = (): void => {
    if (!onChange) return;
    onChange([]);
  };

  return (
    <div className="mt-4 pt-3 border-t border-border">
      <div className="flex items-center justify-between mb-1.5">
        <div className="tool-label">Özet</div>
        {text && onChange && normalized.length > 0 && (
          <button onClick={clearAll} className="text-[10px] text-muted hover:text-red">
            ✕ vurguları temizle
          </button>
        )}
      </div>
      {text ? (
        <>
          <p
            ref={containerRef}
            onMouseUp={captureSelection}
            onKeyUp={captureSelection}
            className="text-xs text-secondary leading-relaxed whitespace-pre-wrap select-text"
          >
            {renderAbstract(text, normalized)}
          </p>
          {selection && onChange && (
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-muted">Vurgula:</span>
              {PALETTE.map((p) => (
                <button
                  key={p.value}
                  title={p.label}
                  onClick={() => addHighlight(p.value)}
                  className="w-5 h-5 rounded border border-border hover:scale-110 transition"
                  style={{ background: p.value }}
                />
              ))}
              <button
                onClick={() => {
                  setSelection(null);
                  window.getSelection()?.removeAllRanges();
                }}
                className="text-[10px] text-muted hover:text-primary ml-1"
              >
                iptal
              </button>
            </div>
          )}
        </>
      ) : (
        <p className="text-xs text-faint italic">
          Açık erişimli özet bulunamadı. DOI tara ile CrossRef/OpenAlex/PubMed&apos;den çekilebilir.
        </p>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }): JSX.Element {
  return (
    <div>
      <dt className="tool-label">{label}</dt>
      <dd className="text-secondary mt-0.5 break-words">{value}</dd>
    </div>
  );
}

function MiniField({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <dt className="tool-label">{label}</dt>
      <dd className="text-primary font-semibold mt-0.5">{value}</dd>
    </div>
  );
}
