export type Tool = 'ink' | 'eraser' | 'bucket';
export type HalftoneMode = 'none' | 'dot-screen' | 'line-screen' | 'diagonal-screen';
export type PatternType = 'plain' | 'checker' | 'hstripes' | 'vstripes' | 'dots' | 'crosshatch' | 'diagonal' | 'bricks' | 'noise' | 'weave';
export type PatternScale = 'S' | 'M' | 'L';
export type Density = 10 | 30 | 50 | 80 | 90;

export interface DrawState {
  tool: Tool;
  brushSize: number;
  halftoneMode: HalftoneMode;
  patternType: PatternType;
  patternScale: PatternScale;
  density: Density;
  zoom: number;
}

export interface DirtyRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
