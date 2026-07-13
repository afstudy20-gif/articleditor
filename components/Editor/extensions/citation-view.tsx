'use client';

import { useEffect, useState } from 'react';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { Citation as CitationCore } from './Citation';
import type { Ref } from '@/store/types';
import {
  formatInTextCitation,
  isSuperscriptCitationStyle,
  type StyleId,
} from '@/lib/refs/styles';

type RefMap = Map<string, number>;

declare global {
  // The editor needs to read the live ref order; we stash it on a global symbol per-editor.
  interface Window {
    __enrRefOrder?: RefMap;
    __enrRefs?: Map<string, Ref>;
    __enrStyle?: StyleId;
    __enrHighlightRefId?: string | null;
    __enrOnCitationClick?: (pos: number, refIds: string[]) => void;
    __enrOnCitationHoverStart?: (rect: DOMRect, refIds: string[]) => void;
    __enrOnCitationHoverEnd?: () => void;
  }
}

function CitationNodeView({ node, getPos }: any) {
  const refIds: string[] = node.attrs.refIds ?? [];
  const [currentHighlight, setCurrentHighlight] = useState<string | null>(
    typeof window !== 'undefined' ? window.__enrHighlightRefId ?? null : null,
  );
  const [, setTick] = useState(0);

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

  const highlighted: boolean =
    (currentHighlight != null && refIds.includes(currentHighlight)) || node.attrs.highlighted === true;
  const order = (typeof window !== 'undefined' && window.__enrRefOrder) || new Map<string, number>();
  const refsMap = (typeof window !== 'undefined' && window.__enrRefs) || new Map<string, Ref>();
  const style: StyleId = (typeof window !== 'undefined' && window.__enrStyle) || 'vancouver';

  const resolvedRefs: Ref[] = refIds.map((id) => refsMap.get(id)).filter((r): r is Ref => Boolean(r));
  const numbers = refIds.map((id) => order.get(id) ?? 0).filter((n) => n > 0);
  const citeOpts = {
    locator: node.attrs.locator || undefined,
    prefix: node.attrs.prefix || undefined,
    suffix: node.attrs.suffix || undefined,
    suppressAuthor: node.attrs.suppressAuthor || undefined,
  };
  const display =
    resolvedRefs.length > 0 ? formatInTextCitation(style, resolvedRefs, numbers, citeOpts) : '[?]';
  const superscript = isSuperscriptCitationStyle(style);

  // Screen-reader label only — a native `title` tooltip would fight with the
  // rich CitationHoverCard rendered on hover (see onMouseEnter below).
  const ariaLabel = refIds
    .map((id) => {
      const r = refsMap.get(id);
      if (!r) return id;
      const a = r.authors[0]?.family || r.authors[0]?.literal || '';
      return `${a}${r.year ? ' ' + r.year : ''}: ${r.title ?? ''}`;
    })
    .join(' | ');

  const baseCls = `enr-citation inline-block px-1 mx-0.5 rounded text-xs cursor-pointer select-none transition-colors duration-300 ${
    superscript ? 'align-super' : 'align-baseline'
  }`;
  const className = highlighted
    ? `${baseCls} bg-red text-white font-bold shadow-sm`
    : `${baseCls} bg-teal-bg text-teal font-semibold`;

  return (
    <NodeViewWrapper
      as={superscript ? 'sup' : 'span'}
      className={className}
      aria-label={ariaLabel}
      data-ref-ids={refIds.join(',')}
      onClick={(e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof window !== 'undefined' && window.__enrOnCitationClick) {
          const pos = typeof getPos === 'function' ? getPos() : -1;
          window.__enrOnCitationClick(pos, refIds);
        }
      }}
      onMouseEnter={(e: React.MouseEvent<HTMLElement>) => {
        window.__enrOnCitationHoverStart?.(e.currentTarget.getBoundingClientRect(), refIds);
      }}
      onMouseLeave={() => {
        window.__enrOnCitationHoverEnd?.();
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
