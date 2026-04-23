import type { Cell, PieceColor } from '../../types';

const COLORS: PieceColor[] = ['red', 'blue', 'green', 'yellow'];

export function randomPiece(): PieceColor {
  return COLORS[Math.floor(Math.random() * COLORS.length)]!;
}

/** A cell is "piece-like" if it holds one of the four colors — i.e. not a
 *  structural gap and not an empty slot. Gap cells are excluded from
 *  matching, gravity, and spawn. */
function isPiece(v: Cell): v is PieceColor {
  return v !== null && v !== 'gap';
}

export const key = (row: number, col: number) => `${row}:${col}`;

export function isAdjacent(
  a: { row: number; col: number },
  b: { row: number; col: number },
): boolean {
  const dr = Math.abs(a.row - b.row);
  const dc = Math.abs(a.col - b.col);
  return dr + dc === 1;
}

export function swapCells(
  grid: Cell[][],
  aRow: number,
  aCol: number,
  bRow: number,
  bCol: number,
): Cell[][] {
  const next = grid.map((r) => r.slice());
  const tmp = next[aRow]![aCol]!;
  next[aRow]![aCol] = next[bRow]![bCol]!;
  next[bRow]![bCol] = tmp;
  return next;
}

/**
 * Matches:
 *   - 3+ in a row horizontally
 *   - 3+ in a row vertically
 *   - Any 2×2 block of identical colors (covers 3×3 as a superset)
 * Empty cells never participate in matches.
 */
export function findMatches(grid: Cell[][]): Set<string> {
  const matched = new Set<string>();
  const h = grid.length;
  const w = grid[0]?.length ?? 0;
  if (h === 0 || w === 0) return matched;

  // Horizontal runs
  for (let r = 0; r < h; r++) {
    let runStart = 0;
    for (let c = 1; c <= w; c++) {
      const curr = c < w ? grid[r]![c] : null;
      const startVal = grid[r]![runStart];
      const continueRun =
        c < w && isPiece(startVal) && isPiece(curr) && curr === startVal;
      if (continueRun) continue;
      const runLen = c - runStart;
      if (runLen >= 3 && isPiece(startVal)) {
        for (let k = runStart; k < c; k++) matched.add(key(r, k));
      }
      runStart = c;
    }
  }

  // Vertical runs
  for (let c = 0; c < w; c++) {
    let runStart = 0;
    for (let r = 1; r <= h; r++) {
      const curr = r < h ? grid[r]![c] : null;
      const startVal = grid[runStart]![c];
      const continueRun =
        r < h && isPiece(startVal) && isPiece(curr) && curr === startVal;
      if (continueRun) continue;
      const runLen = r - runStart;
      if (runLen >= 3 && isPiece(startVal)) {
        for (let k = runStart; k < r; k++) matched.add(key(k, c));
      }
      runStart = r;
    }
  }

  // 2×2 blocks
  for (let r = 0; r < h - 1; r++) {
    for (let c = 0; c < w - 1; c++) {
      const v = grid[r]![c];
      if (
        isPiece(v) &&
        v === grid[r]![c + 1] &&
        v === grid[r + 1]![c] &&
        v === grid[r + 1]![c + 1]
      ) {
        matched.add(key(r, c));
        matched.add(key(r, c + 1));
        matched.add(key(r + 1, c));
        matched.add(key(r + 1, c + 1));
      }
    }
  }

  return matched;
}

export function removeMatched(grid: Cell[][], matched: Set<string>): Cell[][] {
  return grid.map((row, r) =>
    row.map((cell, c) => (matched.has(key(r, c)) ? null : cell)),
  );
}

/**
 * Pieces fall down to the bottom of each column; empty slots at the top
 * get filled with new random pieces.
 */
export function applyGravityAndSpawn(grid: Cell[][]): Cell[][] {
  const h = grid.length;
  const w = grid[0]?.length ?? 0;
  const next: Cell[][] = Array.from({ length: h }, () =>
    new Array<Cell>(w).fill(null),
  );

  // Gaps act as immovable barriers: each column is split into segments
  // bounded by gap cells. Pieces fall to the bottom of their segment and
  // the segment's top fills with fresh random pieces.
  for (let c = 0; c < w; c++) {
    let segStart = 0;
    const closeSegment = (segEnd: number) => {
      const pieces: PieceColor[] = [];
      for (let r = segStart; r < segEnd; r++) {
        const v = grid[r]![c];
        if (isPiece(v)) pieces.push(v);
      }
      const segLen = segEnd - segStart;
      const empties = segLen - pieces.length;
      for (let i = 0; i < empties; i++) next[segStart + i]![c] = randomPiece();
      for (let i = 0; i < pieces.length; i++) {
        next[segStart + empties + i]![c] = pieces[i]!;
      }
    };
    for (let r = 0; r < h; r++) {
      if (grid[r]![c] === 'gap') {
        closeSegment(r);
        next[r]![c] = 'gap';
        segStart = r + 1;
      }
    }
    closeSegment(h);
  }

  return next;
}

export interface CascadeStep {
  matched: string[];           // serializable list of "r:c" keys
  gridAfterCascade: Cell[][];  // grid state after this step
}

/**
 * Run the match-resolve loop until stable. When `cascadeEnabled` is false,
 * matches are only removed (no gravity, no new pieces), so the loop runs
 * once at most because no new matches can form without movement.
 */
export function simulateCascade(
  startGrid: Cell[][],
  cascadeEnabled: boolean,
): { finalGrid: Cell[][]; steps: CascadeStep[] } {
  let grid = startGrid;
  const steps: CascadeStep[] = [];
  let matches = findMatches(grid);
  let safety = 0;
  while (matches.size > 0 && safety++ < 50) {
    const after = cascadeEnabled
      ? applyGravityAndSpawn(removeMatched(grid, matches))
      : removeMatched(grid, matches);
    steps.push({
      matched: Array.from(matches),
      gridAfterCascade: after.map((r) => r.slice()),
    });
    grid = after;
    if (!cascadeEnabled) break;
    matches = findMatches(grid);
  }
  return { finalGrid: grid, steps };
}

export interface CascadeMove {
  col: number;
  fromRow: number;
  toRow: number;
}

export interface CascadeSpawn {
  col: number;
  toRow: number;
  entryRow: number; // virtual row above the grid where the piece enters from
}

/**
 * Compare a grid before vs. after gravity+spawn and infer which existing
 * pieces fell, and which cells got fresh spawns entering from above.
 *
 * For each column, existing non-null pieces stay in relative order; they
 * just get packed to the bottom. New pieces fill the top. We pair existing
 * pieces by their color-sequence to figure out fromRow→toRow moves.
 */
export function computeCascadeDelta(
  before: Cell[][],
  after: Cell[][],
): { moves: CascadeMove[]; spawns: CascadeSpawn[] } {
  const moves: CascadeMove[] = [];
  const spawns: CascadeSpawn[] = [];
  const h = before.length;
  const w = before[0]?.length ?? 0;

  for (let c = 0; c < w; c++) {
    // Collect existing non-null pieces with their original rows (top → bottom order).
    const existing: { row: number; color: Cell }[] = [];
    for (let r = 0; r < h; r++) {
      const v = before[r]![c];
      if (v !== null) existing.push({ row: r, color: v });
    }

    // Existing pieces pack to the bottom in `after`. Pair them by descending row.
    const filled = h - existing.length;
    for (let i = 0; i < existing.length; i++) {
      const fromRow = existing[i]!.row;
      const toRow = filled + i;
      if (fromRow !== toRow) {
        moves.push({ col: c, fromRow, toRow });
      }
    }

    // Spawned pieces are the top `filled` cells in `after`. Entry row is above the grid.
    for (let r = 0; r < filled; r++) {
      if (after[r]![c] !== null) {
        spawns.push({
          col: c,
          toRow: r,
          // Pieces enter from above sequentially: topmost enters first,
          // lower new pieces enter from just above the grid.
          entryRow: r - filled,
        });
      }
    }
  }

  return { moves, spawns };
}

/**
 * Produce the starting play state from a designed layout:
 *   - Empty cells get filled with random pieces.
 *   - Any pre-existing matches get resolved until the grid is stable,
 *     so the player starts on a clean board.
 */
export function initializeGrid(layout: Cell[][]): Cell[][] {
  let grid: Cell[][] = layout.map((row) =>
    row.map((cell) => (cell === null ? randomPiece() : cell)),
  );
  let guard = 0;
  while (guard++ < 100) {
    const matches = findMatches(grid);
    if (matches.size === 0) break;
    grid = applyGravityAndSpawn(removeMatched(grid, matches));
  }
  return grid;
}
