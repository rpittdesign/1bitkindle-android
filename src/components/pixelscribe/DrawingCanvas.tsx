import { useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { DrawState, DirtyRect } from '@/lib/pixelscribe/types';
import { strokeLine, stampAt, scanlineFill } from '@/lib/pixelscribe/drawing';
import { getPatternFn, getHalftoneFn } from '@/lib/pixelscribe/patterns';

export interface DrawingCanvasRef {
  undo: () => void;
  redo: () => void;
  clear: () => void;
  exportPNGBlob: () => Promise<Blob | null>;
  exportPNG: () => void;
  panBy: (dx: number, dy: number) => void;
}

interface Props {
  drawState: DrawState;
}

const GRID_THRESHOLD = 6;

/** Read ?scale=N from URL, default 1 */
function getScaleFactor(): number {
  try {
    const s = new URLSearchParams(window.location.search).get('scale');
    if (s) {
      const n = parseInt(s, 10);
      if (n >= 1 && n <= 4) return n;
    }
  } catch {
    /* ignore */
  }
  return 1;
}

export const DrawingCanvas = forwardRef<DrawingCanvasRef, Props>(({ drawState }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridCanvasRef = useRef<HTMLCanvasElement>(null);
  const bufferRef = useRef<Uint8Array | null>(null);
  const sizeRef = useRef({ width: 0, height: 0 });
  const scaleRef = useRef(getScaleFactor());
  const undoStackRef = useRef<Uint8Array[]>([]);
  const redoStackRef = useRef<Uint8Array[]>([]);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const drawStateRef = useRef(drawState);
  const panRef = useRef({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // Cached brush settings (frozen at pen-down)
    // E-ink RAF throttle: accumulate dirty rects, flush once per animation frame
  const rafHandleRef = useRef<number | null>(null);
  const pendingDirtyRef = useRef<{ minX: number; minY: number; maxX: number; maxY: number } | null>(null);
  const cachedBrushRef = useRef<{
    value: number;
    radius: number;
    shouldPaint: (x: number, y: number) => boolean;
  } | null>(null);

  // Reused offscreen canvas for dirty rendering (Kindle performance)
  const dirtyOffRef = useRef<HTMLCanvasElement | null>(null);
  const dirtyOffCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const dirtyImageRef = useRef<{ w: number; h: number; img: ImageData } | null>(null);

  useEffect(() => {
    drawStateRef.current = drawState;
  }, [drawState]);

  const applyFixedPanForZoom = useCallback((zoom: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width, height } = sizeRef.current;

    // At 1×, the buffer matches the viewport (scale=1 case), so anchoring at (0,0)
    // keeps the entire drawing visible.
    if (zoom <= 1) {
      panRef.current = { x: 0, y: 0 };
      return;
    }

    // For high-zoom "pixel" work, default to centering the drawing in the viewport.
    const cx = Math.floor((canvas.width - width * zoom) / 2);
    const cy = Math.floor((canvas.height - height * zoom) / 2);
    panRef.current = { x: cx, y: cy };
  }, []);

  const centerOnPixel = useCallback((px: number, py: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const zoom = drawStateRef.current.zoom;

    // Put the target pixel at the center of the viewport.
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const panX = Math.round(cx - (px + 0.5) * zoom);
    const panY = Math.round(cy - (py + 0.5) * zoom);
    panRef.current = { x: panX, y: panY };
  }, []);

  // snapPanToPixel removed — pan is now handled by PanControls arrows

  const renderFull = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bufferRef.current) return;
    const ctx = canvas.getContext('2d')!;
    const { width, height } = sizeRef.current;
    const zoom = drawStateRef.current.zoom;
    const pan = panRef.current;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;
    const buffer = bufferRef.current;

    for (let i = 0; i < width * height; i++) {
      const di = i * 4;
      const v = buffer[i] ? 0 : 255;
      data[di] = v;
      data[di + 1] = v;
      data[di + 2] = v;
      data[di + 3] = 255;
    }

    // One-off temp canvas is OK here (not called every move)
    const off = document.createElement('canvas');
    off.width = width;
    off.height = height;
    off.getContext('2d')!.putImageData(imageData, 0, 0);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, pan.x, pan.y, width * zoom, height * zoom);
  }, []);

  // Render only a portion of the canvas defined by a DirtyRect.
  // Kindle-safe: reuse offscreen canvas + reuse ImageData where possible.
  const renderDirty = useCallback((rect: DirtyRect) => {
    const canvas = canvasRef.current;
    const buffer = bufferRef.current;
    if (!canvas || !buffer) return;

    const ctx = canvas.getContext('2d')!;
    const { width, height } = sizeRef.current;
    const zoom = drawStateRef.current.zoom;
    const pan = panRef.current;

    // Clamp rect to buffer bounds
    const x0 = Math.max(0, rect.minX);
    const y0 = Math.max(0, rect.minY);
    const x1 = Math.min(width - 1, rect.maxX);
    const y1 = Math.min(height - 1, rect.maxY);
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    if (w <= 0 || h <= 0) return;

    // Init reusable offscreen
    if (!dirtyOffRef.current) {
      dirtyOffRef.current = document.createElement('canvas');
      dirtyOffCtxRef.current = dirtyOffRef.current.getContext('2d', { alpha: false })!;
    }
    const off = dirtyOffRef.current;
    const offCtx = dirtyOffCtxRef.current!;

    // Resize offscreen only when necessary
    if (off.width !== w || off.height !== h) {
      off.width = w;
      off.height = h;
      dirtyImageRef.current = null; // invalidate cached ImageData
    }

    // Reuse ImageData when size repeats
    let cached = dirtyImageRef.current;
    if (!cached || cached.w !== w || cached.h !== h) {
      cached = { w, h, img: offCtx.createImageData(w, h) };
      dirtyImageRef.current = cached;
    }
    const imageData = cached.img;
    const data = imageData.data;

    // Fill ImageData for just the dirty area
    for (let yy = y0; yy <= y1; yy++) {
      for (let xx = x0; xx <= x1; xx++) {
        const bi = yy * width + xx;
        const di = ((yy - y0) * w + (xx - x0)) * 4;
        const v = buffer[bi] ? 0 : 255;
        data[di] = v;
        data[di + 1] = v;
        data[di + 2] = v;
        data[di + 3] = 255;
      }
    }

    offCtx.putImageData(imageData, 0, 0);

    ctx.imageSmoothingEnabled = false;
    const destX = pan.x + x0 * zoom;
    const destY = pan.y + y0 * zoom;
    ctx.drawImage(off, destX, destY, w * zoom, h * zoom);
  }, []);

  const renderGrid = useCallback(() => {
    const gridCanvas = gridCanvasRef.current;
    if (!gridCanvas) return;
    const ctx = gridCanvas.getContext('2d')!;
    const zoom = drawStateRef.current.zoom;
    const pan = panRef.current;
    const { width, height } = sizeRef.current;

    ctx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);
    if (zoom < GRID_THRESHOLD) return;

    ctx.strokeStyle = 'rgba(128, 128, 128, 0.3)';
    ctx.lineWidth = 1;

    const startX = pan.x;
    const startY = pan.y;
    const viewW = gridCanvas.width;
    const viewH = gridCanvas.height;

    const firstCol = Math.max(0, Math.floor(-startX / zoom));
    const lastCol = Math.min(width, Math.ceil((viewW - startX) / zoom));
    const firstRow = Math.max(0, Math.floor(-startY / zoom));
    const lastRow = Math.min(height, Math.ceil((viewH - startY) / zoom));

    ctx.beginPath();
    for (let col = firstCol; col <= lastCol; col++) {
      const x = Math.floor(startX + col * zoom) + 0.5;
      ctx.moveTo(x, Math.max(0, startY));
      ctx.lineTo(x, Math.min(viewH, startY + height * zoom));
    }
    for (let row = firstRow; row <= lastRow; row++) {
      const y = Math.floor(startY + row * zoom) + 0.5;
      ctx.moveTo(Math.max(0, startX), y);
      ctx.lineTo(Math.min(viewW, startX + width * zoom), y);
    }
    ctx.stroke();
  }, []);

  const saveToStorage = useCallback(() => {
    const buffer = bufferRef.current;
    if (!buffer) return;
    const { width, height } = sizeRef.current;

    const packed = new Uint8Array(Math.ceil(buffer.length / 8));
    for (let i = 0; i < buffer.length; i++) {
      if (buffer[i]) packed[i >> 3] |= 1 << (i & 7);
    }

    let str = '';
    for (let i = 0; i < packed.length; i += 8192) {
      str += String.fromCharCode(...packed.slice(i, Math.min(i + 8192, packed.length)));
    }

    try {
      localStorage.setItem('pixelscribe-buffer', btoa(str));
      localStorage.setItem('pixelscribe-size', JSON.stringify({ width, height }));
    } catch {
      /* quota exceeded */
    }
  }, []);

  const loadFromStorage = useCallback((width: number, height: number): Uint8Array | null => {
    try {
      const saved = localStorage.getItem('pixelscribe-buffer');
      const savedSize = localStorage.getItem('pixelscribe-size');
      if (!saved || !savedSize) return null;

      const { width: sw, height: sh } = JSON.parse(savedSize);
      if (sw !== width || sh !== height) return null;

      const decoded = atob(saved);
      const packed = new Uint8Array(decoded.length);
      for (let i = 0; i < decoded.length; i++) packed[i] = decoded.charCodeAt(i);

      const buffer = new Uint8Array(width * height);
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] = (packed[i >> 3] >> (i & 7)) & 1;
      }
      return buffer;
    } catch {
      return null;
    }
  }, []);

  // Init with scale factor
  useEffect(() => {
    const container = containerRef.current!;
    const canvas = canvasRef.current!;
    const gridCanvas = gridCanvasRef.current!;
    const viewW = container.clientWidth;
    const viewH = container.clientHeight;

    canvas.width = viewW;
    canvas.height = viewH;
    gridCanvas.width = viewW;
    gridCanvas.height = viewH;

    const scale = scaleRef.current;
    const bufW = Math.floor(viewW / scale);
    const bufH = Math.floor(viewH / scale);
    sizeRef.current = { width: bufW, height: bufH };

    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    const restored = loadFromStorage(bufW, bufH);
    bufferRef.current = restored || new Uint8Array(bufW * bufH);

    // When scale > 1, default zoom to scale so pixels map 1:1 to screen
    if (scale > 1 && drawStateRef.current.zoom === 1) {
      container.dispatchEvent(new CustomEvent('pixelscribe-zoom', { detail: scale }));
    }

    renderFull();
    renderGrid();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Prevent "drawn content disappears" when switching zoom levels by resetting pan.
    applyFixedPanForZoom(drawState.zoom);
    renderFull();
    renderGrid();
  }, [drawState.zoom, renderFull, renderGrid]);

  const pushUndo = useCallback(() => {
    const buffer = bufferRef.current;
    if (!buffer) return;
    const stack = undoStackRef.current;
    if (stack.length >= 10) stack.shift();
    stack.push(new Uint8Array(buffer));
    redoStackRef.current = []; // new stroke clears redo
  }, []);

  const getShouldPaint = useCallback((): ((x: number, y: number) => boolean) => {
    const s = drawStateRef.current;
    const halftoneFn = getHalftoneFn(s.halftoneMode, s.patternScale);
    const patternFn = getPatternFn(s.patternType, s.patternScale);
    return (x, y) => patternFn(x, y) && halftoneFn(x, y, s.density);
  }, []);

  const getPixelCoords = useCallback((e: PointerEvent): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const zoom = drawStateRef.current.zoom;
    const pan = panRef.current;
    const canvasX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const canvasY = (e.clientY - rect.top) * (canvas.height / rect.height);
    return {
      x: Math.floor((canvasX - pan.x) / zoom),
      y: Math.floor((canvasY - pan.y) / zoom),
    };
  }, []);

  const handlePointerDown = useCallback(
    function (e: React.PointerEvent) {
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        isPanningRef.current = true;
        const canvas = canvasRef.current!;
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch (_) {
          /* Kindle fallback */
        }
        panStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          panX: panRef.current.x,
          panY: panRef.current.y,
        };
        return;
      }

      if (isDrawingRef.current) return;
      const canvas = canvasRef.current!;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (_) {
        /* Kindle fallback */
      }
      isDrawingRef.current = true;

      const coords = getPixelCoords(e.nativeEvent);
      lastPosRef.current = { x: coords.x, y: coords.y };

      const s = drawStateRef.current;
      const buffer = bufferRef.current!;
      const width = sizeRef.current.width;
      const height = sizeRef.current.height;

      // snapPanToPixel removed — no more canvas jumping on touch

      pushUndo();

      if (s.tool === 'bucket') {
        if (coords.x < 0 || coords.x >= width || coords.y < 0 || coords.y >= height) {
          isDrawingRef.current = false;
          return;
        }
        const tapped = buffer[coords.y * width + coords.x];
        const paintValue = tapped === 0 ? 1 : 0;

        const dirty = scanlineFill(coords.x, coords.y, buffer, width, height, paintValue, getShouldPaint());

        if (dirty.minX <= dirty.maxX) renderDirty(dirty); // no grid redraw here
        saveToStorage();
        isDrawingRef.current = false;
        return;
      }

      // Cache brush settings at pen-down
      const value = s.tool === 'eraser' ? 0 : 1;
      const radius = Math.max(0, Math.floor(s.brushSize / 2));
      const shouldPaint = s.tool === 'eraser' ? () => true : getShouldPaint();
      cachedBrushRef.current = { value, radius, shouldPaint };

      const dirtyR: DirtyRect = { minX: width, minY: height, maxX: -1, maxY: -1 };
      stampAt(coords.x, coords.y, radius, buffer, width, height, value, shouldPaint, dirtyR);
      if (dirtyR.minX <= dirtyR.maxX) renderDirty(dirtyR); // no grid redraw here
    },
    [getPixelCoords, pushUndo, getShouldPaint, renderDirty, saveToStorage]
  );

  const handlePointerMove = useCallback(
    function (e: React.PointerEvent) {
      if (isPanningRef.current) {
        const dx = e.clientX - panStartRef.current.x;
        const dy = e.clientY - panStartRef.current.y;
        panRef.current = {
          x: panStartRef.current.panX + dx,
          y: panStartRef.current.panY + dy,
        };
        renderFull();
        renderGrid();
        return;
      }

      if (!isDrawingRef.current) return;
      const s = drawStateRef.current;
      if (s.tool === 'bucket') return;

      const cached = cachedBrushRef.current;
      if (!cached) return;

      const buffer = bufferRef.current!;
      const width = sizeRef.current.width;
      const height = sizeRef.current.height;

      // Use coalesced events if supported (helps Kindle “squiggle”)
      const native = e.nativeEvent as PointerEvent & { getCoalescedEvents?: () => PointerEvent[] };
      const events = native.getCoalescedEvents ? native.getCoalescedEvents() : [native];

      const dirty: DirtyRect = { minX: width, minY: height, maxX: -1, maxY: -1 };

      for (const ev of events) {
        const coords = getPixelCoords(ev);
        const last = lastPosRef.current;
        const prevX = last ? last.x : coords.x;
        const prevY = last ? last.y : coords.y;

        strokeLine(
          prevX,
          prevY,
          coords.x,
          coords.y,
          cached.radius,
          buffer,
          width,
          height,
          cached.value,
          cached.shouldPaint,
          dirty
        );

        lastPosRef.current = { x: coords.x, y: coords.y };
      }

      // RAF throttle: accumulate dirty rects across pointermove events,
      // flush with a single renderDirty call per animation frame.
      // On e-ink this prevents the display queue from falling behind.
      if (dirty.minX <= dirty.maxX) {
        const p = pendingDirtyRef.current;
        if (!p) {
          pendingDirtyRef.current = { ...dirty };
        } else {
          p.minX = Math.min(p.minX, dirty.minX);
          p.minY = Math.min(p.minY, dirty.minY);
          p.maxX = Math.max(p.maxX, dirty.maxX);
          p.maxY = Math.max(p.maxY, dirty.maxY);
        }
        if (!rafHandleRef.current) {
          rafHandleRef.current = requestAnimationFrame(() => {
            rafHandleRef.current = null;
            const d = pendingDirtyRef.current;
            pendingDirtyRef.current = null;
            if (d && d.minX <= d.maxX) renderDirty(d);
          });
        }
      }
    },
    [getPixelCoords, renderFull, renderDirty, renderGrid]
  );

  const handlePointerUp = useCallback(
    function (e: React.PointerEvent) {
      if (isPanningRef.current) {
        isPanningRef.current = false;
        lastPosRef.current = null; // prevent phantom connecting lines
        try {
          canvasRef.current?.releasePointerCapture(e.pointerId);
        } catch (_) {
          /* */
        }
        return;
      }

      if (!isDrawingRef.current) return;

      isDrawingRef.current = false;
      lastPosRef.current = null;
      cachedBrushRef.current = null;
      try {
        canvasRef.current?.releasePointerCapture(e.pointerId);
      } catch (_) {
        /* */
      }
      saveToStorage();
    },
    [saveToStorage]
  );

  // Wheel/pinch zoom is intentionally disabled here.
  // This Kindle build uses a simple two-mode toggle (1× "draw" and 16× "pixel").

  // Custom cursor
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const r = Math.max(1, Math.floor(drawState.brushSize / 2));
    const d = r * 2 + 1;
    const cursorSize = Math.max(d + 4, 7);

    const off = document.createElement('canvas');
    off.width = cursorSize;
    off.height = cursorSize;
    const ctx = off.getContext('2d')!;
    const center = Math.floor(cursorSize / 2);

    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(center + 0.5, center + 0.5, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(center + 0.5, 0);
    ctx.lineTo(center + 0.5, cursorSize);
    ctx.moveTo(0, center + 0.5);
    ctx.lineTo(cursorSize, center + 0.5);
    ctx.stroke();

    canvas.style.cursor = `url(${off.toDataURL()}) ${center} ${center}, crosshair`;
  }, [drawState.brushSize]);

  useImperativeHandle(
    ref,
    () => ({
      undo: () => {
        const stack = undoStackRef.current;
        if (stack.length === 0) return;
        // Push current to redo before restoring
        const current = bufferRef.current;
        if (current) {
          const redoStack = redoStackRef.current;
          if (redoStack.length >= 10) redoStack.shift();
          redoStack.push(new Uint8Array(current));
        }
        const prev = stack.pop()!;
        bufferRef.current!.set(prev);
        renderFull();
        renderGrid();
        saveToStorage();
      },
      redo: () => {
        const stack = redoStackRef.current;
        if (stack.length === 0) return;
        // Push current to undo before restoring
        const current = bufferRef.current;
        if (current) {
          const undoStack = undoStackRef.current;
          if (undoStack.length >= 10) undoStack.shift();
          undoStack.push(new Uint8Array(current));
        }
        const next = stack.pop()!;
        bufferRef.current!.set(next);
        renderFull();
        renderGrid();
        saveToStorage();
      },
      clear: () => {
        pushUndo();
        bufferRef.current!.fill(0);
        renderFull();
        renderGrid();
        saveToStorage();
      },
      exportPNGBlob: async () => {
        const canvas = canvasRef.current;
        if (!canvas || !bufferRef.current) return null;

        const { width, height } = sizeRef.current;
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = width;
        exportCanvas.height = height;

        const ctx = exportCanvas.getContext('2d')!;
        const imageData = ctx.createImageData(width, height);
        const buffer = bufferRef.current;

        for (let i = 0; i < width * height; i++) {
          const di = i * 4;
          const v = buffer[i] ? 0 : 255;
          imageData.data[di] = v;
          imageData.data[di + 1] = v;
          imageData.data[di + 2] = v;
          imageData.data[di + 3] = 255;
        }

        ctx.putImageData(imageData, 0, 0);

        return await new Promise<Blob | null>((resolve) => {
          try {
            exportCanvas.toBlob((b) => resolve(b), 'image/png');
          } catch {
            resolve(null);
          }
        });
      },
      exportPNG: () => {
        const canvas = canvasRef.current;
        if (!canvas || !bufferRef.current) return;

        const { width, height } = sizeRef.current;
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = width;
        exportCanvas.height = height;

        const ctx = exportCanvas.getContext('2d')!;
        const imageData = ctx.createImageData(width, height);
        const buffer = bufferRef.current;

        for (let i = 0; i < width * height; i++) {
          const di = i * 4;
          const v = buffer[i] ? 0 : 255;
          imageData.data[di] = v;
          imageData.data[di + 1] = v;
          imageData.data[di + 2] = v;
          imageData.data[di + 3] = 255;
        }

        ctx.putImageData(imageData, 0, 0);

        const dataURL = exportCanvas.toDataURL('image/png');
        document.dispatchEvent(new CustomEvent('pixelscribe-export', { detail: dataURL }));
      },
      panBy: (dx: number, dy: number) => {
        const zoom = drawStateRef.current.zoom;
        panRef.current = {
          x: panRef.current.x + dx * zoom,
          y: panRef.current.y + dy * zoom,
        };
        lastPosRef.current = null;
        renderFull();
        renderGrid();
      },
    }),
    [renderFull, renderGrid, pushUndo, saveToStorage]
  );

  return (
    <div ref={containerRef} className="absolute inset-0 bg-background">
      <canvas
        ref={canvasRef}
        className="block absolute inset-0"
        style={{
          imageRendering: 'pixelated',
          touchAction: 'none',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
      <canvas
        ref={gridCanvasRef}
        className="block absolute inset-0 pointer-events-none"
        style={{ imageRendering: 'auto' }}
      />
    </div>
  );
});

DrawingCanvas.displayName = 'DrawingCanvas';
