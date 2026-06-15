'use client';

import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { PDFPageProxy, PageViewport } from 'pdfjs-dist';
import { loadPdfjs } from '@/lib/pdf/worker';

type Props = {
  page: PDFPageProxy;
  viewport: PageViewport;
  /** Called on mouse-up when a non-trivial selection exists. */
  onSelect: (text: string, anchor: { x: number; y: number }) => void;
  /** Called when the user clicks without selecting (collapse). */
  onClear: () => void;
};

/**
 * Renders PDF.js' transparent text layer over the page so the cursor can
 * select real text. Native browser selection drives the popup.
 */
export function TextSelectionLayer({ page, viewport, onSelect, onClear }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;
    container.replaceChildren();

    async function render() {
      const pdfjs = await loadPdfjs();
      const textContent = await page.getTextContent();
      if (cancelled || !container) return;
      const layer = new pdfjs.TextLayer({
        textContentSource: textContent,
        container,
        viewport,
      });
      await layer.render();
    }

    render().catch(() => {
      /* some PDFs have no text layer — selection simply won't be available */
    });

    return () => {
      cancelled = true;
      container?.replaceChildren();
    };
  }, [page, viewport]);

  function handleMouseUp(event: React.MouseEvent<HTMLDivElement>) {
    const selection = window.getSelection();
    const text = selection?.toString().replace(/\s+/g, ' ').trim() ?? '';
    if (text.length > 1) {
      onSelect(text, { x: event.clientX, y: event.clientY });
    } else {
      onClear();
    }
  }

  const style: CSSProperties = {
    // setLayerDimensions uses --total-scale-factor, derived from --scale-factor.
    ['--scale-factor' as string]: String(viewport.scale),
  };

  return (
    <div
      ref={containerRef}
      className="pdf-text-layer"
      style={style}
      onMouseUp={handleMouseUp}
    />
  );
}
