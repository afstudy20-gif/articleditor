'use client';

import { useEffect, useRef, useCallback } from 'react';
import type {
  Canvas as FabricCanvas,
  FabricObject,
  Line,
  Rect,
  Ellipse,
} from 'fabric';
import {
  flushAnnotations,
  getPageAnnotation,
  loadAnnotations,
  setPageAnnotation,
} from '@/lib/pdf/annotations';

export type AnnotationTool =
  | 'select'
  | 'pen'
  | 'highlight'
  | 'eraser'
  | 'line'
  | 'arrow'
  | 'rect'
  | 'circle'
  | 'text';

type Props = {
  width: number;
  height: number;
  backgroundUrl: string;
  tool: AnnotationTool;
  color: string;
  strokeWidth: number;
  opacity: number;
  pageNum: number;
  /** Stable per-document id so annotations persist and never cross documents. */
  docKey: string;
};

let fabricModule: typeof import('fabric') | null = null;

async function loadFabric() {
  if (fabricModule) return fabricModule;
  fabricModule = await import('fabric');
  return fabricModule;
}

/** Serialize annotations without the page background image (re-applied from the
 *  rendered PDF on load) — keeps persisted JSON tiny. */
function serializeCanvas(fc: FabricCanvas): string {
  const data = fc.toJSON() as Record<string, unknown>;
  delete data.backgroundImage;
  return JSON.stringify(data);
}

export function AnnotationCanvas({
  width,
  height,
  backgroundUrl,
  tool,
  color,
  strokeWidth,
  opacity,
  pageNum,
  docKey,
}: Props) {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fcRef = useRef<FabricCanvas | null>(null);
  const toolRef = useRef(tool);
  const colorRef = useRef(color);
  const widthRef = useRef(strokeWidth);
  const opacityRef = useRef(opacity);
  const shapeState = useRef<{
    drawing: boolean;
    originX: number;
    originY: number;
    // Fabric shapes have no shared base type across Line/Rect/Ellipse here.
    shape: import('fabric').FabricObject | null;
  }>({ drawing: false, originX: 0, originY: 0, shape: null });

  toolRef.current = tool;
  colorRef.current = color;
  widthRef.current = strokeWidth;
  opacityRef.current = opacity;

  const saveAnnotations = useCallback(() => {
    const fc = fcRef.current;
    if (!fc) return;
    setPageAnnotation(docKey, pageNum, serializeCanvas(fc));
  }, [docKey, pageNum]);

  useEffect(() => {
    let fc: FabricCanvas | null = null;
    let disposed = false;

    async function init() {
      const fabric = await loadFabric();
      const el = canvasElRef.current;
      if (!el || disposed) return;

      fc = new fabric.Canvas(el, {
        width,
        height,
        selection: true,
      }) as FabricCanvas;
      fcRef.current = fc;

      // Fabric v6 no longer auto-creates the free-drawing brush (it was created
      // lazily in v5). Without this the pen / highlight tools silently draw
      // nothing — isDrawingMode is on but there is no brush. Seed one here and
      // apply the current tool settings.
      const brush = new fabric.PencilBrush(fc);
      brush.color = colorRef.current;
      brush.width = widthRef.current;
      fc.freeDrawingBrush = brush;

      const img = await fabric.FabricImage.fromURL(backgroundUrl, { crossOrigin: 'anonymous' });
      (fc as unknown as { backgroundImage: unknown }).backgroundImage = img;
      fc.renderAll();

      await loadAnnotations(docKey);
      if (disposed) return;
      const saved = getPageAnnotation(docKey, pageNum);
      if (saved) {
        try {
          await fc.loadFromJSON(saved);
          const bgImg = await fabric.FabricImage.fromURL(backgroundUrl, { crossOrigin: 'anonymous' });
          (fc as unknown as { backgroundImage: unknown }).backgroundImage = bgImg;
          fc.renderAll();
        } catch { /* ignore corrupt */ }
      }

      // Persist (debounced) whenever the drawing changes.
      const persist = () => {
        if (fc) setPageAnnotation(docKey, pageNum, serializeCanvas(fc));
      };
      fc.on('object:modified', persist);
      fc.on('path:created', persist);

      // Eraser
      fc.on('mouse:down', (e) => {
        if (toolRef.current !== 'eraser') return;
        const target = e.target as FabricObject | undefined;
        if (target) {
          fc!.remove(target);
          fc!.renderAll();
          persist();
        }
      });

      // Shape drawing
      fc.on('mouse:down', (e) => {
        const t = toolRef.current;
        if (!['line', 'arrow', 'rect', 'circle'].includes(t)) return;
        const ptr = fc!.getScenePoint(e.e);
        const ss = shapeState.current;
        ss.drawing = true;
        ss.originX = ptr.x;
        ss.originY = ptr.y;

        const opts = {
          stroke: colorRef.current,
          strokeWidth: widthRef.current,
          opacity: opacityRef.current,
          fill: 'transparent',
          selectable: false,
          evented: false,
        };

        if (t === 'line' || t === 'arrow') {
          ss.shape = new fabric.Line([ptr.x, ptr.y, ptr.x, ptr.y], opts);
        } else if (t === 'rect') {
          ss.shape = new fabric.Rect({ left: ptr.x, top: ptr.y, width: 0, height: 0, ...opts });
        } else {
          ss.shape = new fabric.Ellipse({ left: ptr.x, top: ptr.y, rx: 0, ry: 0, ...opts });
        }
        fc!.add(ss.shape);
      });

      fc.on('mouse:move', (e) => {
        const ss = shapeState.current;
        if (!ss.drawing || !ss.shape) return;
        const ptr = fc!.getScenePoint(e.e);
        const t = toolRef.current;

        if (t === 'line' || t === 'arrow') {
          (ss.shape as Line).set({ x2: ptr.x, y2: ptr.y });
        } else if (t === 'rect') {
          (ss.shape as Rect).set({
            left: Math.min(ss.originX, ptr.x),
            top: Math.min(ss.originY, ptr.y),
            width: Math.abs(ptr.x - ss.originX),
            height: Math.abs(ptr.y - ss.originY),
          });
        } else if (t === 'circle') {
          (ss.shape as Ellipse).set({
            left: Math.min(ss.originX, ptr.x),
            top: Math.min(ss.originY, ptr.y),
            rx: Math.abs(ptr.x - ss.originX) / 2,
            ry: Math.abs(ptr.y - ss.originY) / 2,
          });
        }
        fc!.renderAll();
      });

      fc.on('mouse:up', () => {
        const ss = shapeState.current;
        if (!ss.drawing || !ss.shape) return;

        if (toolRef.current === 'arrow') {
          const line = ss.shape as Line;
          const x1 = line.x1 ?? 0;
          const y1 = line.y1 ?? 0;
          const x2 = line.x2 ?? 0;
          const y2 = line.y2 ?? 0;
          const angle = Math.atan2(y2 - y1, x2 - x1);
          const headLen = 14;
          const points = [
            { x: x2, y: y2 },
            { x: x2 - headLen * Math.cos(angle - Math.PI / 6), y: y2 - headLen * Math.sin(angle - Math.PI / 6) },
            { x: x2 - headLen * Math.cos(angle + Math.PI / 6), y: y2 - headLen * Math.sin(angle + Math.PI / 6) },
          ];
          const head = new fabric.Polygon(points, {
            fill: colorRef.current,
            selectable: false,
            evented: false,
            opacity: opacityRef.current,
          });
          fc!.add(head);
        }

        ss.shape.set({ selectable: true, evented: true });
        ss.drawing = false;
        ss.shape = null;
        fc!.renderAll();
        persist();
      });

      // Text tool (double-click)
      fc.on('mouse:dblclick', (e) => {
        if (toolRef.current !== 'text') return;
        const ptr = fc!.getScenePoint(e.e);
        const textbox = new fabric.Textbox('Type here', {
          left: ptr.x,
          top: ptr.y,
          fontSize: Math.max(12, 16 * widthRef.current / 3),
          fill: colorRef.current,
          opacity: opacityRef.current,
          fontFamily: 'sans-serif',
          width: 200,
          editable: true,
        });
        fc!.add(textbox);
        fc!.setActiveObject(textbox);
        textbox.enterEditing();
        fc!.renderAll();
        persist();
      });
    }

    init();

    return () => {
      disposed = true;
      if (fc) {
        setPageAnnotation(docKey, pageNum, serializeCanvas(fc));
        void flushAnnotations(docKey);
        fc.dispose();
      }
      fcRef.current = null;
    };
  }, [width, height, backgroundUrl, pageNum, docKey]);

  // Update tool settings when props change
  useEffect(() => {
    const fc = fcRef.current;
    if (!fc) return;

    if (tool === 'select') {
      fc.isDrawingMode = false;
      fc.selection = true;
      fc.forEachObject((o: FabricObject) => { o.selectable = true; o.evented = true; });
    } else if (tool === 'pen' || tool === 'highlight') {
      fc.isDrawingMode = true;
      fc.selection = false;
      const brush = fc.freeDrawingBrush;
      if (brush) {
        brush.color = tool === 'highlight' ? color + '66' : color;
        brush.width = tool === 'highlight' ? strokeWidth * 4 : strokeWidth;
      }
    } else if (tool === 'eraser') {
      fc.isDrawingMode = false;
      fc.selection = false;
      fc.forEachObject((o: FabricObject) => { o.selectable = false; o.evented = true; });
    } else if (tool === 'text') {
      fc.isDrawingMode = false;
      fc.selection = false;
    } else {
      fc.isDrawingMode = false;
      fc.selection = false;
      fc.forEachObject((o: FabricObject) => { o.selectable = false; o.evented = false; });
    }
    fc.renderAll();
  }, [tool, color, strokeWidth, opacity]);

  useEffect(() => {
    return () => { saveAnnotations(); };
  }, [saveAnnotations]);

  return (
    <div style={{ position: 'relative', width, height, boxShadow: '0 2px 8px rgba(0,0,0,.12)' }}>
      <canvas ref={canvasElRef} />
    </div>
  );
}
