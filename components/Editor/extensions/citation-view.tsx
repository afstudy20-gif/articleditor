'use client';

import { useEffect, useState } from 'react';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { Citation as CitationCore } from './Citation';
import type { Ref } from '@/store/types';
import { formatInTextCitation, type CitationStyle } from '@/lib/refs/styles';

type RefMap = Map<string, number>;

declare global {
  // The editor needs to read the live ref order; we stash it on a global symbol per-editor.
  interface Window {
    __enrRefOrder?: RefMap;
    __enrRefs?: Map<string, Ref>;
    __enrStyle?: CitationStyle;
    __enrHighlightRefId?: string | null;
    __enrOnCitationClick?: (pos: number, refIds: string[]) => void;
  }
}

// How long a freshly-inserted citation stays tinted yellow.
const FRESH_HIGHLIGHT_MS = 3000;

function CitationNodeView({ node, getPos }: any) {
  const refIds: string[] = node.attrs.refIds ?? [];
  const insertedAt: number = node.attrs.insertedAt ?? 0;
  const [currentHighlight, setCurrentHighlight] = useState<string | null>(
    typeof window !== 'undefined' ? window.__enrHighlightRefId ?? null : null,
  );
  const [, setTick] = useState(0);
  const [fresh, setFresh] = useState(
    insertedAt > 0 && Date.now() - insertedAt < FRESH_HIGHLIGHT_MS,
  );

  useEffect(() => {
    function onHighlight(): void {
      setCurrentHighlight((typeof window !== 'undefined' && window.__enrHighlightRefId) || null);
    }
    function onRefresh(): void {
      setTick((t) => t + 1);
    }
    window.addEventListener('enr:highlight', onHighlight);
    window.addEventListener('enr:refresh', onRefresh);
    return () => {
      window.removeEventListener('enr:highlight', onHighlight);
      window.removeEventListener('enr:refresh', onRefresh);
    };
  }, []);

  // Clear the fresh-insert tint after the cooldown.
  useEffect(() => {
    if (!fresh) return;
    const remaining = Math.max(0, FRESH_HIGHLIGHT_MS - (Date.now() - insertedAt));
    const timer = setTimeout(() => setFresh(false), remaining);
    return () => clearTimeout(timer);
  }, [fresh, insertedAt]);

  const highlighted: boolean =
    (currentHighlight != null && refIds.includes(currentHighlight)) || node.attrs.highlighted === true;
  const order = (typeof window !== 'undefined' && window.__enrRefOrder) || new Map<string, number>();
  const refsMap = (typeof window !== 'undefined' && window.__enrRefs) || new Map<string, Ref>();
  const style: CitationStyle = (typeof window !== 'undefined' && window.__enrStyle) || 'vancouver';

  const resolvedRefs: Ref[] = refIds.map((id) => refsMap.get(id)).filter((r): r is Ref => Boolean(r));
  const numbers = refIds.map((id) => order.get(id) ?? 0).filter((n) => n > 0);
  const display =
    resolvedRefs.length > 0 ? formatInTextCitation(style, resolvedRefs, numbers) : '[?]';

  const titleAttr = refIds
    .map((id) => {
      const r = refsMap.get(id);
      if (!r) return id;
      const a = r.authors[0]?.family || r.authors[0]?.literal || '';
      return `${a}${r.year ? ' ' + r.year : ''}: ${r.title ?? ''}`;
    })
    .join(' | ');

  const baseCls = 'enr-citation inline-block px-1 mx-0.5 rounded text-xs cursor-pointer select-none align-baseline transition-colors duration-300';
  const className = fresh
    ? `${baseCls} bg-yellow-300 text-amber-900 font-bold ring-2 ring-amber-400 shadow-sm font-semibold`
    : highlighted
      ? `${baseCls} bg-red text-white font-bold shadow-sm`
      : `${baseCls} bg-teal-bg text-teal font-semibold`;

  return (
    <NodeViewWrapper
      as="span"
      className={className}
      title={titleAttr}
      data-ref-ids={refIds.join(',')}
      onClick={(e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof window !== 'undefined' && window.__enrOnCitationClick) {
          const pos = typeof getPos === 'function' ? getPos() : -1;
          window.__enrOnCitationClick(pos, refIds);
        }
      }}
    >
      {display}
    </NodeViewWrapper>
  );
}

import { findPlugin } from './find-plugin';

export const CitationWithView = CitationCore.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CitationNodeView);
  },
  addProseMirrorPlugins() {
    return [findPlugin];
  },
});
