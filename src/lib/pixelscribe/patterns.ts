import { HalftoneMode, PatternType, PatternScale } from './types';

const SCALE_MAP: Record<PatternScale, number> = { S: 1, M: 2, L: 4 };

export function getPatternFn(type: PatternType, scale: PatternScale): (x: number, y: number) => boolean {
  const s = SCALE_MAP[scale];
  switch (type) {
    case 'plain': return () => true;
    case 'checker': return (x, y) => (Math.floor(x / s) + Math.floor(y / s)) % 2 === 0;
    case 'hstripes': return (_x, y) => Math.floor(y / s) % 2 === 0;
    case 'vstripes': return (x) => Math.floor(x / s) % 2 === 0;
    case 'dots': return (x, y) => { const p = Math.max(s * 3, 3); return x % p === 0 && y % p === 0; };
    case 'crosshatch': return (x, y) => { const p = Math.max(s * 2, 2); return x % p === 0 || y % p === 0; };
    case 'diagonal': return (x, y) => { const p = Math.max(s * 2, 2); return (x + y) % p < Math.max(s, 1); };
    case 'bricks': return (x, y) => {
      const bh = Math.max(s * 2, 2), bw = Math.max(s * 4, 4);
      const row = Math.floor(y / bh);
      const offset = row % 2 === 0 ? 0 : Math.floor(bw / 2);
      return y % bh === 0 || (x + offset) % bw === 0;
    };
    case 'noise': return (x, y) => {
      let h = x * 374761393 + y * 668265263;
      h = (h ^ (h >> 13)) * 1274126177;
      h = h ^ (h >> 16);
      return (h & 0xff) < 128;
    };
    case 'weave': return (x, y) => {
      const p = Math.max(s * 4, 4);
      return (Math.floor(x / p) % 2) !== (Math.floor(y / p) % 2);
    };
  }
}

export function renderPatternPreview(canvas: HTMLCanvasElement, type: PatternType, scale: PatternScale = 'S') {
  const size = canvas.width;
  const ctx = canvas.getContext('2d')!;
  const fn = getPatternFn(type, scale);
  const imageData = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const v = fn(x, y) ? 0 : 255;
      imageData.data[idx] = v;
      imageData.data[idx + 1] = v;
      imageData.data[idx + 2] = v;
      imageData.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

export const ALL_PATTERNS: PatternType[] = ['plain', 'checker', 'hstripes', 'vstripes', 'dots', 'crosshatch', 'diagonal', 'bricks', 'noise', 'weave'];

export const PATTERN_LABELS: Record<PatternType, string> = {
  plain: 'Solid', checker: 'Check', hstripes: 'H-Line', vstripes: 'V-Line',
  dots: 'Dots', crosshatch: 'Cross', diagonal: 'Diag', bricks: 'Brick',
  noise: 'Noise', weave: 'Weave',
};

export function getHalftoneFn(mode: HalftoneMode, scale: PatternScale = 'S'): (x: number, y: number, density: number) => boolean {
  const s = SCALE_MAP[scale];
  switch (mode) {
    case 'none': return () => true;
    case 'dot-screen': return (x, y, d) => {
      const p = 6 * s;
      const cx = (x % p) - p / 2 + 0.5;
      const cy = (y % p) - p / 2 + 0.5;
      const dist = Math.sqrt(cx * cx + cy * cy) / (p * 0.707);
      return dist < d / 100;
    };
    case 'line-screen': return (_x, y, d) => (Math.floor(y / s) % 6) / 6 < d / 100;
    case 'diagonal-screen': return (x, y, d) => (Math.floor((x + y) / s) % 6) / 6 < d / 100;
  }
}

export function renderHalftonePreview(canvas: HTMLCanvasElement, mode: HalftoneMode, density: number = 50, scale: PatternScale = 'S') {
  const size = canvas.width;
  const ctx = canvas.getContext('2d')!;
  const fn = getHalftoneFn(mode, scale);
  const imageData = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const v = fn(x, y, density) ? 0 : 255;
      imageData.data[idx] = v;
      imageData.data[idx + 1] = v;
      imageData.data[idx + 2] = v;
      imageData.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

export const ALL_HALFTONE_MODES: { mode: HalftoneMode; label: string }[] = [
  { mode: 'none', label: 'None' },
  { mode: 'dot-screen', label: 'Dot' },
  { mode: 'line-screen', label: 'Line' },
  { mode: 'diagonal-screen', label: 'Diag' },
];

export const ALL_DENSITIES = [10, 30, 50, 80, 90] as const;
