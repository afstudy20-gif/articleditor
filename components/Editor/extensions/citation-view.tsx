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
    // Position of the most-recently-inserted citation; consumed by NodeView
    // to flash a yellow tint for ~3s. Set by Citation extension command.
    __enrFreshCitationPos?: number | null;
  }
}

function CitationNodeView({ node, getPos }: any) {
  const refIds: string[] = node.attrs.refIds ?? [];
  const [currentHighlight, setCurrentHighlight] = useState<string | null>(
    typeof window !== 'undefined' ? window.__enrHighlightRefId ?? null : null,
  );
  const [, setTick] = useState(0);

  // Fresh state driven by a global pos pointer set by Citation extension on
  // insertion. NodeView checks if its own getPos() matches.
  const computeFresh = (): boolean => {
    if (typeof window === 'undefined') return false;
    const target = window.__enrFreshCitationPos;
    if (target == null) return false;
    const myPos = typeof getPos === 'function' ? getPos() : -1;
    return myPos === target;
  };
  const [fresh, setFresh] = useState(false);

  useEffect(() => {
    // Check immediately on mount — covers the initial render after insert.
    setFresh(computeFresh());
    function onHighlight(): void {
      setCurrentHighlight((typeof window !== 'undefined' && window.__enrHighlightRefId) || null);
    }
    function onRefresh(): void {
      setTick((t) => t + 1);
    }
    function onFresh(): void {
      setFresh(computeFresh());
    }
    window.addEventListener('enr:highlight', onHighlight);
    window.addEventListener('enr:refresh', onRefresh);
    window.addEventListener('enr:fresh-citation', onFresh);
    return () => {
      window.removeEventListener('enr:highlight', onHighlight);
      window.removeEventListener('enr:refresh', onRefresh);
      window.removeEventListener('enr:fresh-citation', onFresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
