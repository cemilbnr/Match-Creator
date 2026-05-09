import type { PathPoint } from './path';

// Must mirror the BoardView's `p-3` Tailwind padding + 1px border so the
// overlay's coordinate space lines up with the rendered grid.
const PAD = 12;
const BORDER = 1;

export function eventToCell(
  e: { clientX: number; clientY: number },
  rect: DOMRect,
  cellSize: number,
  gap: number,
  gridWidth: number,
  gridHeight: number,
): PathPoint | null {
  const localX = e.clientX - rect.left - PAD - BORDER;
  const localY = e.clientY - rect.top - PAD - BORDER;
  if (localX < 0 || localY < 0) return null;
  const stride = cellSize + gap;
  const col = Math.floor(localX / stride);
  const row = Math.floor(localY / stride);
  if (col < 0 || col >= gridWidth) return null;
  if (row < 0 || row >= gridHeight) return null;
  return { row, col };
}

/**
 * Sub-cell-precision pointer-to-grid mapping for free-draw paths. Returns
 * a continuous (row, col) coordinate where integers are cell centers and
 * fractional values are the cursor's position inside that cell. The path
 * renderer uses these for smooth curves; densifyPath in the placement
 * algorithm rounds them back to integer cells.
 */
export function eventToCoord(
  e: { clientX: number; clientY: number },
  rect: DOMRect,
  cellSize: number,
  gap: number,
  gridWidth: number,
  gridHeight: number,
): PathPoint | null {
  const localX = e.clientX - rect.left - PAD - BORDER;
  const localY = e.clientY - rect.top - PAD - BORDER;
  const stride = cellSize + gap;
  // Continuous mapping: cell (r, c)'s center is at (r * stride + cellSize/2,
  // c * stride + cellSize/2) in local pixels; invert that.
  const col = (localX - cellSize / 2) / stride;
  const row = (localY - cellSize / 2) / stride;
  if (col < -0.5 || col > gridWidth - 0.5) return null;
  if (row < -0.5 || row > gridHeight - 0.5) return null;
  // Clamp to valid range so a stroke that grazes the edge still produces
  // sensible points (path renderer is happy with floats; placement rounds).
  return {
    row: Math.max(0, Math.min(gridHeight - 1, row)),
    col: Math.max(0, Math.min(gridWidth - 1, col)),
  };
}
