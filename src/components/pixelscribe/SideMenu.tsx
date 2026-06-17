import { useMemo } from 'react';
import { Pen, Eraser, PaintBucket, Undo2, Redo2, PanelLeft, MoveHorizontal, Trash2, Share } from 'lucide-react';
import { PreviewTile } from './PreviewTile';
import { SupportInline } from './SupportTheWorkshop';
import { DrawState, Tool, PatternScale, Density } from '@/lib/pixelscribe/types';
import {
  ALL_PATTERNS, ALL_HALFTONE_MODES, ALL_DENSITIES,
  PATTERN_LABELS, renderPatternPreview, renderHalftonePreview,
} from '@/lib/pixelscribe/patterns';

type MenuSide = 'left' | 'right';

interface Props {
  state: DrawState;
  viewMode: 'draw' | 'pixel';
  menuOpen: boolean;
  menuSide: MenuSide;
  onToggleMenu: () => void;
  onSwapSide: () => void;
  onChange: (partial: Partial<DrawState>) => void;
  onSetViewMode: (mode: 'draw' | 'pixel') => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onExport: () => void;
}

const TOOLS: { tool: Tool; label: string; icon: React.ReactNode }[] = [
  { tool: 'ink', label: 'Ink', icon: <Pen size={14} /> },
  { tool: 'eraser', label: 'Eraser', icon: <Eraser size={14} /> },
  { tool: 'bucket', label: 'Fill', icon: <PaintBucket size={14} /> },
];

function MenuBtn({ active, onClick, children, className = '' }: {
  active?: boolean; onClick: () => void; children: React.ReactNode; className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`border border-foreground px-2 py-1 text-xs font-mono transition-none select-none ${
        active ? 'bg-foreground text-background' : 'bg-background text-foreground'
      } ${className}`}
    >
      {children}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] tracking-widest text-foreground/70 mt-3 mb-1 font-mono">{children}</div>;
}

export function SideMenu({ state, viewMode, menuOpen, menuSide, onToggleMenu, onSwapSide, onChange, onSetViewMode, onUndo, onRedo, onClear, onExport }: Props) {
  const isRight = menuSide === 'right';

  const patternRenderers = useMemo(() => {
    return ALL_PATTERNS.map(p => ({
      type: p,
      render: (canvas: HTMLCanvasElement) => renderPatternPreview(canvas, p, state.patternScale),
    }));
  }, [state.patternScale]);

  const halftoneRenderers = useMemo(() => {
    return ALL_HALFTONE_MODES.map(d => ({
      mode: d.mode,
      label: d.label,
      render: (canvas: HTMLCanvasElement) => renderHalftonePreview(canvas, d.mode, state.density, state.patternScale),
    }));
  }, [state.density, state.patternScale]);

  return (
    <>
      {/* Toggle + swap buttons */}
      <div className={`fixed top-2 z-50 flex gap-1 ${isRight ? 'right-2' : 'left-2'}`}>
        <button
          onClick={onToggleMenu}
          className="bg-background text-foreground border border-foreground w-8 h-8 flex items-center justify-center hover:bg-foreground hover:text-background select-none"
        >
          <PanelLeft size={16} />
        </button>
        <button
          onClick={onSwapSide}
          className="bg-background text-foreground border border-foreground w-8 h-8 flex items-center justify-center hover:bg-foreground hover:text-background select-none"
        >
          <MoveHorizontal size={16} />
        </button>
        <button
          onClick={onClear}
          className="bg-background text-foreground border border-foreground w-8 h-8 flex items-center justify-center hover:bg-foreground hover:text-background select-none"
        >
          <Trash2 size={16} />
        </button>
        <button
          onClick={onExport}
          className="bg-background text-foreground border border-foreground w-8 h-8 flex items-center justify-center hover:bg-foreground hover:text-background select-none"
        >
          <Share size={16} />
        </button>
      </div>

      {menuOpen && (
        <div className={`fixed top-0 z-40 w-52 h-full bg-background overflow-y-auto pt-12 px-2 pb-4 font-mono ${
          isRight ? 'right-0 border-l border-foreground' : 'left-0 border-r border-foreground'
        }`}>
          <SectionLabel>TOOLS</SectionLabel>
          <div className="grid grid-cols-3 gap-1">
            {TOOLS.map(t => (
              <MenuBtn key={t.tool} active={state.tool === t.tool} onClick={() => onChange({ tool: t.tool })}>
                <span className="flex flex-col items-center gap-0.5">
                  {t.icon}
                  <span className="text-[7px]">{t.label}</span>
                </span>
              </MenuBtn>
            ))}
          </div>

          <SectionLabel>VIEW</SectionLabel>
          <div className="flex items-center gap-1">
            <MenuBtn active={viewMode === 'draw'} onClick={() => onSetViewMode('draw')}>
              DRAW 1×
            </MenuBtn>
            <MenuBtn active={viewMode === 'pixel'} onClick={() => onSetViewMode('pixel')}>
              PIXEL 16×
            </MenuBtn>
          </div>

          <SectionLabel>BRUSH SIZE</SectionLabel>
          <div className="flex items-center gap-1">
            <MenuBtn onClick={() => onChange({ brushSize: Math.max(1, state.brushSize - 1) })}>−</MenuBtn>
            <span className="text-sm w-8 text-center text-foreground">{state.brushSize}</span>
            <MenuBtn onClick={() => onChange({ brushSize: Math.min(32, state.brushSize + 1) })}>+</MenuBtn>
          </div>

          <SectionLabel>HALFTONE</SectionLabel>
          <div className="flex flex-wrap gap-1">
            {halftoneRenderers.map(d => (
              <div key={d.mode} className="flex flex-col items-center gap-0.5">
                <PreviewTile
                  render={d.render}
                  active={state.halftoneMode === d.mode}
                  onClick={() => onChange({ halftoneMode: d.mode })}
                />
                <span className="text-[8px] text-foreground">{d.label}</span>
              </div>
            ))}
          </div>

          <SectionLabel>DENSITY</SectionLabel>
          <div className="flex gap-1 flex-wrap">
            {ALL_DENSITIES.map(d => (
              <MenuBtn key={d} active={state.density === d} onClick={() => onChange({ density: d as Density })}>
                {d}%
              </MenuBtn>
            ))}
          </div>

          <SectionLabel>PATTERNS</SectionLabel>
          <div className="flex flex-wrap gap-1">
            {patternRenderers.map(p => (
              <div key={p.type} className="flex flex-col items-center gap-0.5">
                <PreviewTile
                  render={p.render}
                  active={state.patternType === p.type}
                  onClick={() => onChange({ patternType: p.type })}
                />
                <span className="text-[8px] text-foreground">{PATTERN_LABELS[p.type]}</span>
              </div>
            ))}
          </div>

          <SectionLabel>SCALE</SectionLabel>
          <div className="flex gap-1">
            {(['S', 'M', 'L'] as PatternScale[]).map(s => (
              <MenuBtn key={s} active={state.patternScale === s} onClick={() => onChange({ patternScale: s })}>
                {s}
              </MenuBtn>
            ))}
          </div>

          <SectionLabel>ACTIONS</SectionLabel>
          <div className="flex gap-1 items-center">
            <button
              onClick={onUndo}
              className="border border-foreground w-8 h-8 flex items-center justify-center bg-background text-foreground hover:bg-foreground hover:text-background select-none"
            >
              <Undo2 size={16} />
            </button>
            <button
              onClick={onRedo}
              className="border border-foreground w-8 h-8 flex items-center justify-center bg-background text-foreground hover:bg-foreground hover:text-background select-none"
            >
              <Redo2 size={16} />
            </button>
          </div>

          <SectionLabel>ABOUT</SectionLabel>
          <SupportInline />
        </div>
      )}
    </>
  );
}
