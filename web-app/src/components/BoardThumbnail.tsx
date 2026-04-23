import type { Cell } from '../types';
import { cellStyleFor, useTileRender } from './tileRender';

/**
 * Miniature board renderer used by the Library cards and the Match Strip
 * previews. Cell size auto-fits inside the given maxWidthPx/maxHeightPx.
 */
export function BoardThumbnail({
  width,
  height,
  layout,
  maxWidthPx = 220,
  maxHeightPx = 140,
  emptyColor = 'rgb(10 10 10)',
}: {
  width: number;
  height: number;
  layout: Cell[][];
  maxWidthPx?: number;
  maxHeightPx?: number;
  emptyColor?: string;
}) {
  const { mode, set } = useTileRender();
  const cellByWidth = Math.floor(maxWidthPx / Math.max(1, width));
  const cellByHeight = Math.floor(maxHeightPx / Math.max(1, height));
  const cell = Math.max(2, Math.min(14, cellByWidth, cellByHeight));

  return (
    <div
      className="grid gap-px rounded-sm bg-neutral-800 p-0.5"
      style={{
        gridTemplateColumns: `repeat(${width}, ${cell}px)`,
        gridTemplateRows: `repeat(${height}, ${cell}px)`,
      }}
    >
      {layout.flatMap((row, r) =>
        row.map((cellValue, c) => (
          <div
            key={`${r}:${c}`}
            className="rounded-[1px] border border-transparent"
            style={cellValue ? cellStyleFor(cellValue, mode, set) : { backgroundColor: emptyColor }}
          />
        )),
      )}
    </div>
  );
}
