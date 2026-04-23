import { useState } from 'react';
import { cellStyleFor, useTileRender } from '../../components/tileRender';
import type { Brush, Cell, PieceColor } from '../../types';

interface Props {
  width: number;
  height: number;
  layout: Cell[][];
  brush: Brush;
  /** While held, painting skips cells that already have a piece. */
  shiftHeld: boolean;
  /** Side length of each cell in px. */
  cellSize?: number;
  onPaint: (row: number, col: number, value: Cell) => void;
  /** Ctrl + right-click on a painted cell: erase every cell of that color. */
  onEraseColor: (color: PieceColor) => void;
  /** Alt + right-click on a painted cell: repaint every cell of that color with `to`. */
  onReplaceColor: (from: PieceColor, to: PieceColor) => void;
}

export function GridCanvas({
  width,
  height,
  layout,
  brush,
  shiftHeld,
  cellSize = 32,
  onPaint,
  onEraseColor,
  onReplaceColor,
}: Props) {
  const [painting, setPainting] = useState<null | 'paint' | 'erase'>(null);
  const { mode, set } = useTileRender();

  const paintValue: Cell = brush === 'eraser' ? null : brush;

  const apply = (row: number, col: number, m: 'paint' | 'erase') => {
    if (m === 'erase') {
      onPaint(row, col, null);
      return;
    }
    // Shift-as-modifier: keep filled cells as-is, only paint empties.
    if (shiftHeld) {
      const existing = layout[row]?.[col] ?? null;
      if (existing !== null) return;
    }
    onPaint(row, col, paintValue);
  };

  const gap = Math.max(2, Math.round(cellSize / 16));

  return (
    <div
      className="inline-block select-none rounded-lg border border-neutral-800 bg-neutral-900 p-3"
      onMouseLeave={() => setPainting(null)}
      onMouseUp={() => setPainting(null)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className="grid"
        style={{
          gap: `${gap}px`,
          gridTemplateColumns: `repeat(${width}, ${cellSize}px)`,
          gridTemplateRows: `repeat(${height}, ${cellSize}px)`,
        }}
      >
        {Array.from({ length: height }).flatMap((_, row) =>
          Array.from({ length: width }).map((__, col) => {
            const cell = layout[row]?.[col] ?? null;
            return (
              <button
                key={`${row}:${col}`}
                type="button"
                className="rounded border border-neutral-800 bg-neutral-950 transition hover:border-neutral-600"
                style={{
                  width: cellSize,
                  height: cellSize,
                  ...cellStyleFor(cell, mode, set),
                }}
                onMouseDown={(e) => {
                  // Ctrl + right-click on a painted cell wipes every cell of
                  // that same color. One-shot action — no drag-paint follow-up.
                  if (e.button === 2 && (e.ctrlKey || e.metaKey) && cell !== null) {
                    onEraseColor(cell);
                    return;
                  }
                  // Alt + right-click on a painted cell repaints every cell
                  // of that color with the currently selected brush.
                  if (
                    e.button === 2 &&
                    e.altKey &&
                    cell !== null &&
                    brush !== 'eraser' &&
                    cell !== brush
                  ) {
                    onReplaceColor(cell, brush);
                    return;
                  }
                  // Right-click always erases regardless of Shift.
                  const m: 'paint' | 'erase' = e.button === 2 ? 'erase' : 'paint';
                  setPainting(m);
                  apply(row, col, m);
                }}
                onMouseEnter={() => {
                  if (painting) apply(row, col, painting);
                }}
                aria-label={`cell ${row},${col}`}
              />
            );
          }),
        )}
      </div>
    </div>
  );
}
