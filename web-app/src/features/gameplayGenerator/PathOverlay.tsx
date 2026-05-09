import { useMemo } from 'react';
import { type PathPoint } from './path';
import { type MatchPlacement, placementCenter } from './placement';

interface Props {
  paths: PathPoint[][];
  placements: MatchPlacement[];
  gridWidth: number;
  gridHeight: number;
  cellSize: number;
  gap: number;
  /** Perpendicular search width around each path cell — drawn underneath
   *  the stroke as a wide faint band so the user sees where the algorithm
   *  is allowed to anchor matches. */
  pathThickness?: number;
  /** Cells the generator painted as part of a successful secondary plant.
   *  Marked with a small dashed halka so the user can see "this swap also
   *  fires a match here" before pressing Generate's autoplay. */
  secondaryCells?: { row: number; col: number }[];
}

const PAD = 12;
const BORDER = 1;

function cellCenter(
  row: number,
  col: number,
  cellSize: number,
  gap: number,
): { x: number; y: number } {
  const x = PAD + BORDER + col * (cellSize + gap) + cellSize / 2;
  const y = PAD + BORDER + row * (cellSize + gap) + cellSize / 2;
  return { x, y };
}

function cellRect(
  row: number,
  col: number,
  cellSize: number,
  gap: number,
): { x: number; y: number; w: number; h: number } {
  const x = PAD + BORDER + col * (cellSize + gap);
  const y = PAD + BORDER + row * (cellSize + gap);
  return { x, y, w: cellSize, h: cellSize };
}

/** Convert "rgba(R, G, B, 1)" (our accent format) to "rgba(R, G, B, alpha)". */
function withAlpha(rgba: string, alpha: number): string {
  return rgba.replace(/[\d.]+\)$/, `${alpha})`);
}

/**
 * Build an SVG `d` attribute that draws a smooth Catmull-Rom curve through
 * `points` by emitting cubic Bezier segments. The cubic control points come
 * from the standard Catmull-Rom→Bezier conversion (tension 0.5):
 *   cp1 = p1 + (p2 - p0) / 6
 *   cp2 = p2 - (p3 - p1) / 6
 * Endpoints are duplicated so the curve passes exactly through the first
 * and last points.
 */
function smoothPathD(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    const p = points[0]!;
    return `M ${p.x},${p.y}`;
  }
  if (points.length === 2) {
    const a = points[0]!;
    const b = points[1]!;
    return `M ${a.x},${a.y} L ${b.x},${b.y}`;
  }
  const padded = [points[0]!, ...points, points[points.length - 1]!];
  const first = points[0]!;
  let d = `M ${first.x},${first.y}`;
  for (let i = 1; i < points.length; i++) {
    const p0 = padded[i - 1]!;
    const p1 = padded[i]!;
    const p2 = padded[i + 1]!;
    const p3 = padded[i + 2]!;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }
  return d;
}

export function PathOverlay({
  paths,
  placements,
  gridWidth,
  gridHeight,
  cellSize,
  gap,
  pathThickness = 1,
  secondaryCells,
}: Props) {
  const totalW =
    2 * (PAD + BORDER) + gridWidth * cellSize + Math.max(0, gridWidth - 1) * gap;
  const totalH =
    2 * (PAD + BORDER) +
    gridHeight * cellSize +
    Math.max(0, gridHeight - 1) * gap;

  const placementsRender = useMemo(() => {
    return placements.map((p) => {
      const cellSet = new Set(p.cells.map((c) => `${c.row}:${c.col}`));
      // Build a single rounded-rect path enclosing all match cells. For
      // contiguous lines/2x2 blocks this is a straight rectangle; non-
      // contiguous shapes (shouldn't happen with our shape catalogue but
      // defensive) just render per-cell rects.
      const minRow = Math.min(...p.cells.map((c) => c.row));
      const maxRow = Math.max(...p.cells.map((c) => c.row));
      const minCol = Math.min(...p.cells.map((c) => c.col));
      const maxCol = Math.max(...p.cells.map((c) => c.col));
      const isRectangular =
        (maxRow - minRow + 1) * (maxCol - minCol + 1) === p.cells.length;
      const center = placementCenter(p);
      return {
        placement: p,
        cellSet,
        bbox: { minRow, maxRow, minCol, maxCol },
        isRectangular,
        center,
      };
    });
  }, [placements]);

  if (paths.every((p) => p.length === 0) && placements.length === 0) {
    return null;
  }

  const dotR = Math.max(2, Math.round(cellSize / 18));
  const fontSize = Math.max(10, Math.round(cellSize / 3.4));
  const strokeW = Math.max(2, Math.round(cellSize / 14));

  return (
    <svg
      width={totalW}
      height={totalH}
      className="pointer-events-none absolute inset-0"
      style={{ overflow: 'visible' }}
    >
      {/* Thickness band — wide faint stroke under the path showing where
          the placement algorithm is allowed to anchor matches. Smooth
          Catmull-Rom curve through the (potentially fractional) path
          coords, so free-draw strokes don't render with grid-step
          stutters. */}
      {pathThickness > 1 &&
        paths.map((path, pi) => {
          if (path.length === 0) return null;
          const stride = cellSize + gap;
          const bandWidth = stride * pathThickness - gap;
          if (path.length === 1) {
            const c = cellCenter(path[0]!.row, path[0]!.col, cellSize, gap);
            return (
              <circle
                key={`band-${pi}`}
                cx={c.x}
                cy={c.y}
                r={bandWidth / 2}
                fill="rgba(148, 163, 184, 0.12)"
              />
            );
          }
          const px = path.map((p) => cellCenter(p.row, p.col, cellSize, gap));
          const d = smoothPathD(px);
          return (
            <path
              key={`band-${pi}`}
              d={d}
              fill="none"
              stroke="rgba(148, 163, 184, 0.14)"
              strokeWidth={bandWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}

      {/* Path strokes (drawn under placements). Smooth curve through the
          float coordinates collected by the free-draw pointer handler. */}
      {paths.map((path, pi) => {
        if (path.length < 1) return null;
        if (path.length === 1) {
          const c = cellCenter(path[0]!.row, path[0]!.col, cellSize, gap);
          return (
            <circle
              key={`pp-${pi}`}
              cx={c.x}
              cy={c.y}
              r={dotR}
              fill="rgba(160, 174, 192, 0.5)"
            />
          );
        }
        const px = path.map((p) => cellCenter(p.row, p.col, cellSize, gap));
        const d = smoothPathD(px);
        return (
          <path
            key={`pp-${pi}`}
            d={d}
            fill="none"
            stroke="rgba(148, 163, 184, 0.65)"
            strokeWidth={Math.max(1.5, Math.round(cellSize / 18))}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}

      {/* Placement overlays — each match is a coloured patch with stroke +
          translucent fill. Shape numbered at the centre. */}
      {placementsRender.map(
        ({ placement: p, isRectangular, bbox, center }, idx) => {
          const fill = withAlpha(p.accentColor, 0.32);
          const stroke = p.accentColor;
          const cellsToRender = isRectangular
            ? [
                {
                  row: bbox.minRow,
                  col: bbox.minCol,
                  rows: bbox.maxRow - bbox.minRow + 1,
                  cols: bbox.maxCol - bbox.minCol + 1,
                },
              ]
            : p.cells.map((c) => ({ row: c.row, col: c.col, rows: 1, cols: 1 }));

          // Centre badge (cell-center coordinates).
          const cc = cellCenter(center.row, center.col, cellSize, gap);
          // Swap-source small marker.
          const sf = cellCenter(p.swapFrom.row, p.swapFrom.col, cellSize, gap);
          const si = cellCenter(p.swapInto.row, p.swapInto.col, cellSize, gap);

          return (
            <g key={p.id}>
              {cellsToRender.map((seg, j) => {
                const r = cellRect(seg.row, seg.col, cellSize, gap);
                const w = seg.cols * cellSize + (seg.cols - 1) * gap;
                const h = seg.rows * cellSize + (seg.rows - 1) * gap;
                return (
                  <rect
                    key={`${p.id}-r${j}`}
                    x={r.x}
                    y={r.y}
                    width={w}
                    height={h}
                    rx={Math.max(4, cellSize / 6)}
                    ry={Math.max(4, cellSize / 6)}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={strokeW}
                  />
                );
              })}

              {/* Swap-source marker: a small ring + arrow toward the blocker. */}
              <circle
                cx={sf.x}
                cy={sf.y}
                r={Math.max(4, cellSize / 9)}
                fill="none"
                stroke={stroke}
                strokeWidth={Math.max(1.5, strokeW * 0.6)}
                strokeDasharray={`${cellSize / 8} ${cellSize / 10}`}
              />
              <line
                x1={sf.x}
                y1={sf.y}
                x2={si.x}
                y2={si.y}
                stroke={withAlpha(p.accentColor, 0.7)}
                strokeWidth={Math.max(1.5, strokeW * 0.7)}
                strokeLinecap="round"
                markerEnd=""
              />

              {/* Match number badge. */}
              <circle
                cx={cc.x}
                cy={cc.y}
                r={Math.max(10, cellSize / 3.2)}
                fill="rgba(15, 23, 42, 0.85)"
                stroke={stroke}
                strokeWidth={1.5}
              />
              <text
                x={cc.x}
                y={cc.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={fontSize}
                fontWeight={700}
                fill={stroke}
              >
                {idx + 1}
              </text>

              {/* Secondary plan (when present) — fainter rect of the same
                  accent over the planned cells, plus an "N-S" badge at its
                  centroid. Drawn during path drawing so the user sees the
                  full plan before pressing Generate. */}
              {p.secondary &&
                (() => {
                  const cells = p.secondary.cells;
                  const sMinR = Math.min(...cells.map((c) => c.row));
                  const sMaxR = Math.max(...cells.map((c) => c.row));
                  const sMinC = Math.min(...cells.map((c) => c.col));
                  const sMaxC = Math.max(...cells.map((c) => c.col));
                  const sIsRect =
                    (sMaxR - sMinR + 1) * (sMaxC - sMinC + 1) === cells.length;
                  const sFill = withAlpha(p.accentColor, 0.18);
                  const segs = sIsRect
                    ? [
                        {
                          row: sMinR,
                          col: sMinC,
                          rows: sMaxR - sMinR + 1,
                          cols: sMaxC - sMinC + 1,
                        },
                      ]
                    : cells.map((c) => ({ row: c.row, col: c.col, rows: 1, cols: 1 }));
                  let scR = 0;
                  let scC = 0;
                  for (const c of cells) {
                    scR += c.row;
                    scC += c.col;
                  }
                  scR /= cells.length;
                  scC /= cells.length;
                  const scc = cellCenter(scR, scC, cellSize, gap);
                  return (
                    <g>
                      {segs.map((seg, j) => {
                        const r = cellRect(seg.row, seg.col, cellSize, gap);
                        const w = seg.cols * cellSize + (seg.cols - 1) * gap;
                        const h = seg.rows * cellSize + (seg.rows - 1) * gap;
                        return (
                          <rect
                            key={`${p.id}-s${j}`}
                            x={r.x}
                            y={r.y}
                            width={w}
                            height={h}
                            rx={Math.max(4, cellSize / 6)}
                            ry={Math.max(4, cellSize / 6)}
                            fill={sFill}
                            stroke={stroke}
                            strokeWidth={Math.max(1.5, strokeW * 0.6)}
                            strokeDasharray={`${cellSize / 5} ${cellSize / 6}`}
                          />
                        );
                      })}
                      <rect
                        x={scc.x - Math.max(14, cellSize / 2.6)}
                        y={scc.y - Math.max(8, cellSize / 4.5)}
                        width={Math.max(28, cellSize / 1.3)}
                        height={Math.max(16, cellSize / 2.25)}
                        rx={Math.max(8, cellSize / 4.5)}
                        ry={Math.max(8, cellSize / 4.5)}
                        fill="rgba(15, 23, 42, 0.85)"
                        stroke={stroke}
                        strokeWidth={1.5}
                      />
                      <text
                        x={scc.x}
                        y={scc.y}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={Math.max(9, Math.round(cellSize / 4))}
                        fontWeight={700}
                        fill={stroke}
                      >
                        {idx + 1}-S
                      </text>
                    </g>
                  );
                })()}
            </g>
          );
        },
      )}

      {/* Secondary plant markers — small dashed halka around each cell the
          generator painted as part of a secondary near-match. Lets the user
          see which cells the secondary slider actually moved without
          decoding tile colours. */}
      {secondaryCells &&
        secondaryCells.map((c, i) => {
          const ctr = cellCenter(c.row, c.col, cellSize, gap);
          return (
            <circle
              key={`sec-${i}`}
              cx={ctr.x}
              cy={ctr.y}
              r={Math.max(6, cellSize / 3.2)}
              fill="none"
              stroke="rgba(250, 204, 21, 0.95)"
              strokeWidth={Math.max(1.5, Math.round(cellSize / 22))}
              strokeDasharray={`${cellSize / 7} ${cellSize / 8}`}
            />
          );
        })}
    </svg>
  );
}
