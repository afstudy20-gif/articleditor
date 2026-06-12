'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import type { Ref, MarkerOccurrence } from '@/store/types';
import { useLang } from '@/lib/i18n/hooks';

type Props = {
  bodyText: string;
  refs: Ref[];
  markers: MarkerOccurrence[];
  lowConfidence: number[];
  onEditRef: (idx: number, ref: Ref) => void;
  onLookup: (idx: number) => void;
  busyLookup: number | null;
  onLookupAll?: () => void;
  onReset?: () => void;
  lookupAllBusy?: boolean;
};

export function PreviewParsed({
  bodyText,
  refs,
  markers,
  lowConfidence,
  onLookup,
  busyLookup,
  onLookupAll,
  onReset,
  lookupAllBusy,
}: Props) {
  const { lang } = useLang();
  const tr = lang === 'tr';
  const wordCount = bodyText.trim().split(/\s+/).filter(Boolean).length;
  const [selectedIdx, setSelectedIdx] = useState<number | null>(refs.length > 0 ? 0 : null);
  const [occurrenceCursor, setOccurrenceCursor] = useState(0);
  const bodyContainerRef = useRef<HTMLDivElement>(null);
  const activeMarkerRef = useRef<HTMLElement | null>(null);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const [detailWidth, setDetailWidth] = useState<number>(560);
  const draggingRef = useRef(false);

  function onDividerMouseDown(e: React.MouseEvent): void {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  useEffect(() => {
    function onMove(e: MouseEvent): void {
      if (!draggingRef.current) return;
      const container = splitContainerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const fromRight = rect.right - e.clientX;
      const clamped = Math.max(280, Math.min(rect.width - 320, fromRight));
      setDetailWidth(clamped);
    }
    function onUp(): void {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  useEffect(() => {
    if (selectedIdx != null && selectedIdx >= refs.length) {
      setSelectedIdx(refs.length > 0 ? 0 : null);
    }
  }, [refs.length, selectedIdx]);

  // All marker indices that cite the currently selected ref, in document order.
  const activeMarkerList = useMemo(() => {
    if (selectedIdx == null) return [] as number[];
    const refNumber = selectedIdx + 1;
    const out: number[] = [];
    markers.forEach((m, i) => {
      if (m.refNumbers.includes(refNumber)) out.push(i);
    });
    return out;
  }, [selectedIdx, markers]);

  const activeMarkerSet = useMemo(() => new Set(activeMarkerList), [activeMarkerList]);

  // Reset occurrence cursor when selection changes.
  useEffect(() => {
    setOccurrenceCursor(0);
  }, [selectedIdx]);

  const currentOccurrenceMarkerIdx =
    activeMarkerList.length > 0
      ? activeMarkerList[occurrenceCursor % activeMarkerList.length]
      : -1;

  // Scroll body to current marker.
  useEffect(() => {
    if (currentOccurrenceMarkerIdx < 0) return;
    const container = bodyContainerRef.current;
    const target = activeMarkerRef.current;
    if (!container || !target) return;
    const cRect = container.getBoundingClientRect();
    const tRect = target.getBoundingClientRect();
    const offset = tRect.top - cRect.top + container.scrollTop - container.clientHeight / 3;
    container.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' });
  }, [currentOccurrenceMarkerIdx]);

  function nextOccurrence(): void {
    if (activeMarkerList.length === 0) return;
    setOccurrenceCursor((c) => (c + 1) % activeMarkerList.length);
  }
  function prevOccurrence(): void {
    if (activeMarkerList.length === 0) return;
    setOccurrenceCursor((c) => (c - 1 + activeMarkerList.length) % activeMarkerList.length);
  }

  return (
    <div className="space-y-4">
      {/* Body — full width, alt alta */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
          <h3 className="font-semibold text-primary">{tr ? 'Gövde metin' : 'Body text'}</h3>
          <div className="flex items-center gap-2 text-xs text-muted">
            <span>
              {wordCount} {tr ? 'kelime' : 'words'} · {markers.length} {tr ? 'atıf' : 'citations'}
            </span>
            {selectedIdx != null && activeMarkerList.length > 0 && (
              <>
                <span className="text-faint">·</span>
                <span className="text-red font-semibold">
                  Ref {selectedIdx + 1}: {occurrenceCursor + 1}/{activeMarkerList.length}
                </span>
                <button
                  onClick={prevOccurrence}
                  disabled={activeMarkerList.length < 2}
                  className="px-2 py-0.5 rounded border border-border hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  title={tr ? 'Önceki atıf' : 'Previous citation'}
                >
                  ↑
                </button>
                <button
                  onClick={nextOccurrence}
                  disabled={activeMarkerList.length < 2}
                  className="px-2 py-0.5 rounded border border-border hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  title={tr ? 'Sonraki atıf' : 'Next citation'}
                >
                  ↓
                </button>
              </>
            )}
          </div>
        </div>
        <div
          ref={bodyContainerRef}
          className="text-sm text-secondary leading-relaxed max-h-[360px] overflow-auto whitespace-pre-wrap font-mono"
        >
          {renderBodyWithHighlights(bodyText, markers, activeMarkerSet, currentOccurrenceMarkerIdx, activeMarkerRef)}
        </div>
      </div>

      {/* Refs list + resizable detail side-by-side */}
      <div ref={splitContainerRef} className="flex flex-col md:flex-row gap-0 md:gap-0 items-stretch">
        <div className="card p-4 min-w-0 flex-1">
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <div className="flex items-center gap-3">
              <h3 className="font-semibold text-primary">{tr ? 'Algılanan kaynakça' : 'Detected references'} ({refs.length})</h3>
              {lowConfidence.length > 0 && (
                <span className="text-xs text-red">{lowConfidence.length} {tr ? 'düşük güven' : 'low confidence'}</span>
              )}
            </div>
            <div className="flex gap-2">
              {onLookupAll && (
                <button
                  className="btn-secondary text-xs"
                  onClick={onLookupAll}
                  disabled={lookupAllBusy || refs.length === 0}
                >
                  {lookupAllBusy ? (tr ? 'Taranıyor…' : 'Scanning…') : (tr ? 'Tüm referansları DOI tara' : 'Find DOIs for all references')}
                </button>
              )}
              {onReset && (
                <button className="btn-secondary text-xs" onClick={onReset}>
                  {tr ? 'Sıfırla' : 'Reset'}
                </button>
              )}
            </div>
          </div>
          <ol className="space-y-1.5 max-h-[600px] overflow-auto pr-1">
            {refs.map((r, i) => {
              const selected = selectedIdx === i;
              return (
                <li
                  key={r.id}
                  className={`border rounded-lg p-2.5 text-sm cursor-pointer transition ${
                    selected
                      ? 'border-teal bg-teal-bg shadow-card'
                      : lowConfidence.includes(i)
                        ? 'border-red-200 bg-red-bg/40 hover:bg-red-bg/60'
                        : 'border-border hover:bg-slate-50'
                  }`}
                  onClick={() => setSelectedIdx(i)}
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <span className="font-bold text-teal w-6 shrink-0">{i + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-primary font-medium leading-snug line-clamp-2">
                        {r.title || r.raw?.slice(0, 100) || (tr ? 'Başlık yok' : 'No title')}
                      </div>
                      <div className="text-xs text-muted mt-0.5 truncate">
                        {(r.authors[0]?.family || r.authors[0]?.literal || '—') +
                          (r.authors.length > 1 ? ' et al.' : '')}
                        {r.year ? ` · ${r.year}` : ''}
                        {r.containerTitle ? ` · ${r.containerTitle}` : ''}
                      </div>
                      <div className="text-xs mt-1 flex gap-2 items-center flex-wrap">
                        {r.doi && <span className="bg-teal-bg text-teal px-1.5 py-0.5 rounded">DOI</span>}
                        {r.pmid && <span className="bg-teal-bg text-teal px-1.5 py-0.5 rounded">PMID</span>}
                        {r.abstract && (
                          <span className="bg-slate-100 text-muted px-1.5 py-0.5 rounded">{tr ? 'özet' : 'abstract'}</span>
                        )}
                        {r.confidence != null && (
                          <span className="text-faint">{tr ? 'güven' : 'confidence'}: {Math.round(r.confidence * 100)}%</span>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onLookup(i);
                          }}
                          disabled={busyLookup === i}
                          className="ml-auto text-teal hover:underline text-xs"
                        >
                          {busyLookup === i ? (tr ? 'Aranıyor…' : 'Searching…') : (tr ? 'DOI tara' : 'Find DOI')}
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Divider handle */}
        <div
          onMouseDown={onDividerMouseDown}
          className="hidden md:flex items-center justify-center w-2 mx-1 cursor-col-resize group shrink-0"
          title={tr ? 'Sürükleyerek genişliği ayarla' : 'Drag to resize'}
        >
          <div className="w-0.5 h-12 bg-border group-hover:bg-teal rounded-full transition" />
        </div>

        <aside
          className="md:sticky md:top-20 self-start shrink-0 basis-full md:basis-auto"
          style={{ width: `min(100%, ${detailWidth}px)` }}
        >
          {selectedIdx != null && refs[selectedIdx] ? (
            <RefDetail reference={refs[selectedIdx]} number={selectedIdx + 1} tr={tr} />
          ) : (
            <div className="card p-6 text-sm text-muted text-center">
              {tr ? 'Bir referansı seçince detayı burada görünecek.' : 'Select a reference to see its details here.'}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function RefDetail({ reference: r, number, tr }: { reference: Ref; number: number; tr: boolean }) {
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
    <div className="card p-4 max-h-[600px] overflow-auto">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-8 h-8 rounded-md bg-teal text-white font-bold text-sm flex items-center justify-center">
          {number}
        </span>
        <span className="text-xs uppercase tracking-wider text-muted font-semibold">{tr ? 'Referans detayı' : 'Reference details'}</span>
      </div>

      <h4 className="text-sm font-bold text-primary leading-snug mb-3">
        {r.title || (tr ? '(Başlık yok)' : '(No title)')}
      </h4>

      <dl className="text-xs space-y-2">
        {authorStr && (
          <Field label={tr ? 'Yazarlar' : 'Authors'} value={authorStr} />
        )}
        {r.containerTitle && <Field label={tr ? 'Dergi / kaynak' : 'Journal / source'} value={r.containerTitle} />}
        <div className="flex flex-wrap gap-3">
          {r.year && <MiniField label={tr ? 'Yıl' : 'Year'} value={String(r.year)} />}
          {r.volume && <MiniField label={tr ? 'Cilt' : 'Volume'} value={r.volume} />}
          {r.issue && <MiniField label={tr ? 'Sayı' : 'Issue'} value={r.issue} />}
          {r.pages && <MiniField label={tr ? 'Sayfa' : 'Pages'} value={r.pages} />}
        </div>
        {r.publisher && <Field label={tr ? 'Yayıncı' : 'Publisher'} value={r.publisher} />}
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
        {r.confidence != null && (
          <Field label={tr ? 'Parser güveni' : 'Parser confidence'} value={`${Math.round(r.confidence * 100)}%`} />
        )}
      </dl>

      <div className="mt-4 pt-3 border-t border-border">
        <div className="tool-label mb-1.5">{tr ? 'Özet' : 'Abstract'}</div>
        {r.abstract ? (
          <p className="text-xs text-secondary leading-relaxed whitespace-pre-wrap">{r.abstract}</p>
        ) : (
          <p className="text-xs text-faint italic">
            {tr
              ? "Bu kayıt için açık erişimli özet bulunamadı. DOI tara butonu ile CrossRef/OpenAlex/PubMed'den çekilebilir."
              : 'No open-access abstract found for this record. Use the Find DOI button to fetch it from CrossRef/OpenAlex/PubMed.'}
          </p>
        )}
      </div>

      {r.raw && (
        <details className="mt-4 pt-3 border-t border-border">
          <summary className="tool-label cursor-pointer hover:text-teal">{tr ? 'Orijinal satır' : 'Original line'}</summary>
          <p className="text-xs text-muted font-mono mt-2 leading-relaxed whitespace-pre-wrap break-words">
            {r.raw}
          </p>
        </details>
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

function renderBodyWithHighlights(
  text: string,
  markers: MarkerOccurrence[],
  activeIndices: Set<number> = new Set(),
  firstActiveIdx: number = -1,
  activeRef?: React.MutableRefObject<HTMLElement | null>,
): React.ReactNode[] {
  if (markers.length === 0) return [text];
  const out: React.ReactNode[] = [];
  let cursor = 0;
  markers.forEach((m, i) => {
    if (m.startIndex > cursor) out.push(text.slice(cursor, m.startIndex));
    const isActive = activeIndices.has(i);
    const isFirstActive = i === firstActiveIdx;
    out.push(
      <mark
        key={i}
        ref={
          isFirstActive && activeRef
            ? (el) => {
                activeRef.current = el;
              }
            : undefined
        }
        className={
          isActive
            ? 'bg-red text-white px-1 rounded font-semibold shadow-sm'
            : 'bg-teal-bg text-teal px-0.5 rounded'
        }
      >
        {m.raw}
      </mark>,
    );
    cursor = m.endIndex;
  });
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}
