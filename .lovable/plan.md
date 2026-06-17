

# Fix: Dither Patterns Should Follow Scale Setting (S/M/L)

## Problem
All dither modes (Bayer 2x2, Bayer 4x4, Stipple, halftones) ignore the Scale setting. Bayer matrices index directly into fixed 2x2 or 4x4 grids, and halftone screens use a hardcoded period of 6. The reference image shows how ordered dither should scale -- each "cell" of the matrix should grow with the scale multiplier.

## Solution
Add a `scale` parameter to `getDitherFn` and multiply the pixel coordinates' period by the scale factor (S=1, M=2, L=4), so each dither cell covers more pixels at larger scales.

## Technical Details

**File: `src/lib/pixelscribe/patterns.ts`**

1. Change `getDitherFn` signature from `(mode)` to `(mode, scale)`:
   ```typescript
   export function getDitherFn(mode: DitherMode, scale: PatternScale = 'S'):
   ```

2. Use `SCALE_MAP[scale]` (already defined at top of file) to scale all dither lookups:
   - `bayer2`: `BAYER2[Math.floor(y/s) & 1][Math.floor(x/s) & 1]`
   - `bayer4`: `BAYER4[Math.floor(y/s) & 3][Math.floor(x/s) & 3]`
   - `floyd/stipple`: scale the hash coordinates: hash uses `Math.floor(x/s)` and `Math.floor(y/s)`
   - `dot-screen`: scale period `p = 6 * s`
   - `line-screen`: scale period `(Math.floor(y/s) % 6)`
   - `diagonal-screen`: scale period `(Math.floor((x+y)/s) % 6)`

3. Update `renderDitherPreview` to accept and pass scale.

**File: `src/components/pixelscribe/DrawingCanvas.tsx`** (line 335)

Pass `s.patternScale` to `getDitherFn`:
```typescript
const ditherFn = getDitherFn(s.ditherMode, s.patternScale);
```

**File: `src/components/pixelscribe/SideMenu.tsx`**

Update `renderDitherPreview` calls to pass current scale so previews reflect the active scale setting.

| File | Change |
|------|--------|
| `patterns.ts` | Add scale param to `getDitherFn` and `renderDitherPreview`; scale all dither coordinate lookups |
| `DrawingCanvas.tsx` | Pass `patternScale` to `getDitherFn` |
| `SideMenu.tsx` | Pass `patternScale` to `renderDitherPreview` |

