import { DirtyRect } from './types';

export function bresenhamLine(
  x0: number, y0: number, x1: number, y1: number,
  plot: (x: number, y: number) => void
) {
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let cx = x0, cy = y0;
  while (true) {
    plot(cx, cy);
    if (cx === x1 && cy === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; cx += sx; }
    if (e2 <= dx) { err += dx; cy += sy; }
  }
}

export function stampAt(
  cx: number, cy: number, radius: number,
  buffer: Uint8Array, width: number, height: number,
  value: number,
  shouldPaint: (x: number, y: number) => boolean,
  dirty: DirtyRect
) {
  const r = Math.max(0, radius);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r * r) {
        const px = cx + dx, py = cy + dy;
        if (px >= 0 && px < width && py >= 0 && py < height && shouldPaint(px, py)) {
          buffer[py * width + px] = value;
          if (px < dirty.minX) dirty.minX = px;
          if (px > dirty.maxX) dirty.maxX = px;
          if (py < dirty.minY) dirty.minY = py;
          if (py > dirty.maxY) dirty.maxY = py;
        }
      }
    }
  }
}

export function strokeLine(
  x0: number, y0: number, x1: number, y1: number,
  radius: number,
  buffer: Uint8Array, width: number, height: number,
  value: number,
  shouldPaint: (x: number, y: number) => boolean,
  dirty: DirtyRect
) {
  bresenhamLine(x0, y0, x1, y1, (x, y) => {
    stampAt(x, y, radius, buffer, width, height, value, shouldPaint, dirty);
  });
}

export function scanlineFill(
  startX: number, startY: number,
  buffer: Uint8Array, width: number, height: number,
  paintValue: number,
  shouldPaint: (x: number, y: number) => boolean
): DirtyRect {
  const target = buffer[startY * width + startX];
  const dirty: DirtyRect = { minX: width, minY: height, maxX: -1, maxY: -1 };
  if (target === paintValue) return dirty;

  const visited = new Uint8Array(width * height);
  const stack: number[] = [startX, startY];
  const region: number[] = [];

  while (stack.length > 0) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    const idx = y * width + x;
    if (visited[idx] || buffer[idx] !== target) continue;

    let lx = x;
    while (lx > 0 && !visited[y * width + lx - 1] && buffer[y * width + lx - 1] === target) lx--;
    let rx = x;
    while (rx < width - 1 && !visited[y * width + rx + 1] && buffer[y * width + rx + 1] === target) rx++;

    let spanAbove = false, spanBelow = false;
    for (let i = lx; i <= rx; i++) {
      visited[y * width + i] = 1;
      region.push(i, y);
      if (i < dirty.minX) dirty.minX = i;
      if (i > dirty.maxX) dirty.maxX = i;
      if (y < dirty.minY) dirty.minY = y;
      if (y > dirty.maxY) dirty.maxY = y;

      if (y > 0) {
        const above = buffer[(y - 1) * width + i] === target && !visited[(y - 1) * width + i];
        if (above && !spanAbove) { stack.push(i, y - 1); spanAbove = true; }
        else if (!above) spanAbove = false;
      }
      if (y < height - 1) {
        const below = buffer[(y + 1) * width + i] === target && !visited[(y + 1) * width + i];
        if (below && !spanBelow) { stack.push(i, y + 1); spanBelow = true; }
        else if (!below) spanBelow = false;
      }
    }
  }

  for (let i = 0; i < region.length; i += 2) {
    const x = region[i], y = region[i + 1];
    if (shouldPaint(x, y)) {
      buffer[y * width + x] = paintValue;
    }
  }

  return dirty;
}

export function floydSteinbergFill(
  startX: number, startY: number,
  buffer: Uint8Array, width: number, height: number,
  paintValue: number,
  density: number
): DirtyRect {
  const target = buffer[startY * width + startX];
  const dirty: DirtyRect = { minX: width, minY: height, maxX: -1, maxY: -1 };
  if (target === paintValue && density >= 100) return dirty;

  const visited = new Uint8Array(width * height);
  const stack: number[] = [startX, startY];

  while (stack.length > 0) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    const idx = y * width + x;
    if (visited[idx] || buffer[idx] !== target) continue;

    let lx = x;
    while (lx > 0 && !visited[y * width + lx - 1] && buffer[y * width + lx - 1] === target) lx--;
    let rx = x;
    while (rx < width - 1 && !visited[y * width + rx + 1] && buffer[y * width + rx + 1] === target) rx++;

    let spanAbove = false, spanBelow = false;
    for (let i = lx; i <= rx; i++) {
      visited[y * width + i] = 1;
      if (i < dirty.minX) dirty.minX = i;
      if (i > dirty.maxX) dirty.maxX = i;
      if (y < dirty.minY) dirty.minY = y;
      if (y > dirty.maxY) dirty.maxY = y;

      if (y > 0) {
        const above = buffer[(y - 1) * width + i] === target && !visited[(y - 1) * width + i];
        if (above && !spanAbove) { stack.push(i, y - 1); spanAbove = true; }
        else if (!above) spanAbove = false;
      }
      if (y < height - 1) {
        const below = buffer[(y + 1) * width + i] === target && !visited[(y + 1) * width + i];
        if (below && !spanBelow) { stack.push(i, y + 1); spanBelow = true; }
        else if (!below) spanBelow = false;
      }
    }
  }

  if (dirty.minX > dirty.maxX) return dirty;

  const rw = dirty.maxX - dirty.minX + 1;
  const errors = new Float32Array(rw * (dirty.maxY - dirty.minY + 1));
  const grayLevel = density / 100;

  for (let y = dirty.minY; y <= dirty.maxY; y++) {
    for (let x = dirty.minX; x <= dirty.maxX; x++) {
      if (!visited[y * width + x]) continue;
      const ri = (y - dirty.minY) * rw + (x - dirty.minX);
      const oldVal = grayLevel + errors[ri];
      const newVal = oldVal >= 0.5 ? 1 : 0;
      const err = oldVal - newVal;

      if (x + 1 <= dirty.maxX && visited[y * width + x + 1])
        errors[ri + 1] += err * 7 / 16;
      if (y + 1 <= dirty.maxY) {
        if (x - 1 >= dirty.minX && visited[(y + 1) * width + x - 1])
          errors[ri + rw - 1] += err * 3 / 16;
        if (visited[(y + 1) * width + x])
          errors[ri + rw] += err * 5 / 16;
        if (x + 1 <= dirty.maxX && visited[(y + 1) * width + x + 1])
          errors[ri + rw + 1] += err * 1 / 16;
      }

      buffer[y * width + x] = newVal ? paintValue : (paintValue === 1 ? 0 : 1);
    }
  }

  return dirty;
}
