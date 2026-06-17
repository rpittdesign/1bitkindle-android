import { useState, useRef, useCallback, useEffect } from 'react';
import * as QRCode from 'qrcode';
import { DrawingCanvas, DrawingCanvasRef } from './DrawingCanvas';
import { SideMenu } from './SideMenu';
import { PanControls } from './PanControls';
import { SupportPostAction } from './SupportTheWorkshop';
import { DrawState } from '@/lib/pixelscribe/types';

type ViewMode = 'draw' | 'pixel';
type MenuSide = 'left' | 'right';

export function PixelScribeApp() {
  const canvasRef = useRef<DrawingCanvasRef>(null);
  const [menuOpen, setMenuOpen] = useState(true);
  const [menuSide, setMenuSide] = useState<MenuSide>('left');
  const [viewMode, setViewMode] = useState<ViewMode>('draw');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [shareInfo, setShareInfo] = useState<{
    url: string;
    id: string;
    idShort: string;
    qrDataUrl: string;
    expiresAt: number;
  } | null>(null);

  // Keep separate brush sizes per mode so switching feels intentional.
  const drawBrushRef = useRef<number>(3);
  const pixelBrushRef = useRef<number>(1);
  const [drawState, setDrawState] = useState<DrawState>({
    tool: 'ink',
    brushSize: 3,
    halftoneMode: 'none',
    patternType: 'plain',
    patternScale: 'S',
    density: 50,
    zoom: 1,
  });
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Global error handler
  useEffect(() => {
    const handleError = (e: ErrorEvent) => {
      setError(`${e.message} (line ${e.lineno})`);
    };
    const handleRejection = (e: PromiseRejectionEvent) => {
      setError(String(e.reason));
    };
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  // Listen for export fallback (popup blocked)
  useEffect(() => {
    const handler = (e: Event) => {
      setPreviewImage((e as CustomEvent).detail as string);
    };
    document.addEventListener('pixelscribe-export', handler);
    return () => document.removeEventListener('pixelscribe-export', handler);
  }, []);

  // Listen for wheel-zoom events from canvas
  useEffect(() => {
    const handler = (e: Event) => {
      const zoom = (e as CustomEvent).detail as number;
      setDrawState(prev => ({ ...prev, zoom }));
    };
    document.addEventListener('pixelscribe-zoom', handler);
    return () => document.removeEventListener('pixelscribe-zoom', handler);
  }, []);

  // Keyboard shortcuts (dev-only convenience)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        canvasRef.current?.undo();
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        canvasRef.current?.redo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
        e.preventDefault();
        canvasRef.current?.redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleChange = useCallback((partial: Partial<DrawState>) => {
    setDrawState(prev => ({ ...prev, ...partial }));
  }, []);

  const handleSetViewMode = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    setDrawState(prev => {
      if (mode === 'draw') {
        pixelBrushRef.current = prev.brushSize;
        const brushSize = Math.max(1, drawBrushRef.current || 3);
        return { ...prev, zoom: 1, brushSize };
      }
      drawBrushRef.current = prev.brushSize;
      const brushSize = Math.max(1, pixelBrushRef.current || 1);
      return { ...prev, zoom: 16, brushSize };
    });
  }, []);

  const handlePan = useCallback((dir: 'up' | 'down' | 'left' | 'right') => {
    const step = 8; // buffer pixels
    const map = { up: [0, step], down: [0, -step], left: [step, 0], right: [-step, 0] };
    const [dx, dy] = map[dir];
    canvasRef.current?.panBy(dx, dy);
  }, []);

  const handleExport = useCallback(async () => {
    setError(null);
    setSaveStatus(null);
    try {
      const blob = await canvasRef.current?.exportPNGBlob();
      if (!blob) {
        setError('Export failed: could not create PNG');
        return;
      }

      // ── Android (Capacitor) path ─────────────────────────────────────────
      // Save directly to Pictures/PixelScribe/ — no network needed.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cap = (window as any).Capacitor;
      if (cap) {
        const arrayBuffer = await blob.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuffer);
        let binary = '';
        uint8.forEach(b => { binary += String.fromCharCode(b); });
        const base64 = btoa(binary);
        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `pixelscribe_${ts}.png`;
        await cap.Plugins.Filesystem.writeFile({
          path: `Pictures/PixelScribe/${filename}`,
          data: base64,
          directory: 'EXTERNAL_STORAGE',
          recursive: true,
        });
        setSaveStatus(`Saved: Pictures/PixelScribe/${filename}`);
        return;
      }

      // ── Web / Kindle path ────────────────────────────────────────────────
      // Upload to a short-lived share bucket (24h TTL)
      const form = new FormData();
      // Kindle WebKit is happier with a File than a raw Blob
      const file = new File([blob], 'pixelscribe.png', { type: 'image/png' });
      form.append('file', file);

      const res = await fetch('/.netlify/functions/upload', {
        method: 'POST',
        body: form,
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = payload?.error || `Share failed (${res.status})`;
        setError(msg);
        return;
      }

      const id = String(payload?.id || '');
      const urlPath = String(payload?.url || '');
      const expiresAt = Number(payload?.expiresAt || 0);
      if (!id || !urlPath) {
        setError('Share failed: invalid server response');
        return;
      }

      const absoluteUrl = `${window.location.origin}${urlPath}`;
      const qrDataUrl = await QRCode.toDataURL(absoluteUrl, {
        margin: 1,
        scale: 6,
      });

      setShareInfo({ url: absoluteUrl, id, idShort: id.slice(0, 8), qrDataUrl, expiresAt });
    } catch (e) {
      setError(String(e));
    }
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-background font-mono">
      <DrawingCanvas ref={canvasRef} drawState={drawState} />
      <PanControls visible={drawState.zoom >= 6} onPan={handlePan} />
      <SideMenu
        state={drawState}
        viewMode={viewMode}
        menuOpen={menuOpen}
        menuSide={menuSide}
        onToggleMenu={() => setMenuOpen(v => !v)}
        onSwapSide={() => setMenuSide(s => s === 'left' ? 'right' : 'left')}
        onChange={handleChange}
        onSetViewMode={handleSetViewMode}
        onUndo={() => canvasRef.current?.undo()}
        onRedo={() => canvasRef.current?.redo()}
        onClear={() => setShowClearConfirm(true)}
        onExport={handleExport}
      />

      {/* In-app clear confirmation */}
      {showClearConfirm && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-foreground p-3 flex items-center justify-between font-mono">
          <span className="text-sm text-foreground">Clear canvas?</span>
          <div className="flex gap-2">
            <button
              onClick={() => { canvasRef.current?.clear(); setShowClearConfirm(false); }}
              className="border border-foreground bg-foreground text-background px-3 py-1 text-xs select-none"
            >
              Yes
            </button>
            <button
              onClick={() => setShowClearConfirm(false)}
              className="border border-foreground bg-background text-foreground px-3 py-1 text-xs select-none"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {previewImage && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center p-4 font-mono">
          <img src={previewImage} alt="Exported drawing" className="max-w-full max-h-[80vh] border border-foreground" />
          <button
            onClick={() => setPreviewImage(null)}
            className="mt-4 border border-foreground bg-foreground text-background px-4 py-2 text-sm select-none"
          >
            Close
          </button>
        </div>
      )}

      {shareInfo && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center p-4 font-mono">
          <div className="w-full max-w-md border border-foreground p-4">
            <div className="text-xs tracking-widest">SHARE (EXPIRES IN 24H)</div>

            <div className="mt-4 flex items-center justify-center">
              <img
                src={shareInfo.qrDataUrl}
                alt="QR code for share link"
                className="border border-foreground"
                style={{ imageRendering: 'pixelated' }}
              />
            </div>

            <div className="mt-3 text-[11px] text-foreground/80">
              Scan this QR code with a phone/computer to download or email the PNG.
            </div>

            <div className="mt-3 text-[10px] break-all border border-foreground p-2 select-text">
              {shareInfo.url}
            </div>

            <div className="mt-2 text-[10px] text-foreground/60">
              Code: {shareInfo.idShort} · {shareInfo.expiresAt ? `Expires: ${new Date(shareInfo.expiresAt).toLocaleString()}` : ''}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setShareInfo(null)}
                className="border border-foreground bg-foreground text-background px-4 py-2 text-sm select-none"
              >
                Close
              </button>
              <button
                onClick={() => {
                  // Try to open the share page in the same tab (Kindle-friendly).
                  window.location.href = `/s/${shareInfo.id}`;
                }}
                className="border border-foreground bg-background text-foreground px-4 py-2 text-sm select-none"
              >
                Open share page
              </button>
            </div>

            <SupportPostAction context="Share ready" />
          </div>
        </div>
      )}

      {saveStatus && (
        <div className="fixed bottom-2 left-2 right-2 z-50 bg-background text-foreground border border-foreground p-2 font-mono text-xs">
          <div className="flex justify-between items-start">
            <span>✓ {saveStatus}</span>
            <button onClick={() => setSaveStatus(null)} className="ml-2 underline">×</button>
          </div>
        </div>
      )}

      {error && (
        <div className="fixed bottom-2 left-2 right-2 z-50 bg-foreground text-background p-2 font-mono text-xs">
          <div className="flex justify-between items-start">
            <span>ERROR: {error}</span>
            <button onClick={() => setError(null)} className="ml-2 underline">×</button>
          </div>
        </div>
      )}
    </div>
  );
}
