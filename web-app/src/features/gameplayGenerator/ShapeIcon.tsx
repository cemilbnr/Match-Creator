import type { ShapeCategory } from './placement';

interface Props {
  category: ShapeCategory;
  cellPx?: number;
  className?: string;
}

/** Cell coordinates (row, col) for each category's icon. The icon renders
 *  a 2D layout that mirrors how the shape sits on the board — wider than
 *  tall for "h"-leaning shapes, etc. */
function cellsFor(cat: ShapeCategory): [number, number][] {
  switch (cat) {
    case '3-line':
      return [
        [0, 0],
        [0, 1],
        [0, 2],
      ];
    case '4-line':
      return [
        [0, 0],
        [0, 1],
        [0, 2],
        [0, 3],
      ];
    case '2x2':
      return [
        [0, 0],
        [0, 1],
        [1, 0],
        [1, 1],
      ];
    case '3x2':
      return [
        [0, 0],
        [0, 1],
        [0, 2],
        [1, 0],
        [1, 1],
        [1, 2],
      ];
    case '4x2':
      return [
        [0, 0],
        [0, 1],
        [0, 2],
        [0, 3],
        [1, 0],
        [1, 1],
        [1, 2],
        [1, 3],
      ];
  }
}

export function ShapeIcon({ category, cellPx = 5, className = '' }: Props) {
  const cells = cellsFor(category);
  const maxCol = Math.max(...cells.map(([, c]) => c)) + 1;
  const maxRow = Math.max(...cells.map(([r]) => r)) + 1;
  const gap = 1;
  const totalW = maxCol * cellPx + (maxCol - 1) * gap;
  const totalH = maxRow * cellPx + (maxRow - 1) * gap;
  return (
    <svg
      width={totalW}
      height={totalH}
      viewBox={`0 0 ${totalW} ${totalH}`}
      className={`shrink-0 text-neutral-400 ${className}`}
    >
      {cells.map(([r, c], i) => (
        <rect
          key={i}
          x={c * (cellPx + gap)}
          y={r * (cellPx + gap)}
          width={cellPx}
          height={cellPx}
          rx={1}
          fill="currentColor"
        />
      ))}
    </svg>
  );
}
