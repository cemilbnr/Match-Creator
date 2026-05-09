import {
  computeCascadeDelta,
  findMatches,
  removeMatched,
  simulateCascade,
  swapCells,
  type CascadeStep,
} from '../gameplaySequencer/match';
import {
  FRAMES_DISSOLVE,
  FRAMES_PER_FALL_CELL,
  FRAMES_SWAP,
  type RecordedMatch,
} from '../../store/sequencerStore';
import type { Cell, PieceColor } from '../../types';
import { mulberry32 } from './path';
import type { MatchPlacement } from './placement';

export interface GenerateOpts {
  width: number;
  height: number;
  /** Placements (geometry + optional secondary plan) come pre-decided from
   *  computePlacements. The generator just plants colors and records the
   *  swap-driven matches; secondary geometry is not its concern. */
  placements: MatchPlacement[];
  colorCount?: 2 | 3 | 4;
  /** Default FALSE — generated previews skip gravity/spawn. */
  cascadeEnabled?: boolean;
  seed?: number;
}

export interface SecondaryStats {
  /** Number of placements where the RNG roll authorised an attempt. */
  attempted: number;
  /** Subset of `attempted` where validation succeeded and a secondary plant
   *  was actually committed to the board. */
  succeeded: number;
  /** Cells (other than the swapFrom anchor) that were painted with the
   *  blocker color as part of a successful secondary plant. The overlay
   *  uses these to mark the swap-source neighbourhood. */
  cells: { row: number; col: number }[];
}

export interface GenerateResult {
  matches: RecordedMatch[];
  startingGrid: Cell[][];
  warnings: string[];
  secondaryStats: SecondaryStats;
}

const ALL_COLORS: PieceColor[] = ['red', 'blue', 'green', 'yellow'];

export function emptyLayout(width: number, height: number): Cell[][] {
  return Array.from({ length: height }, () => new Array<Cell>(width).fill(null));
}

function paletteFor(colorCount: number | undefined): PieceColor[] {
  const n = Math.max(2, Math.min(4, colorCount ?? 4));
  return ALL_COLORS.slice(0, n);
}

function key(r: number, c: number) {
  return `${r}:${c}`;
}

function fallFramesTotal(
  afterSwap: Cell[][],
  steps: CascadeStep[],
  cascadeEnabled: boolean,
): number {
  if (!cascadeEnabled) return 0;
  let total = 0;
  let prev = afterSwap;
  for (const step of steps) {
    const matchedSet = new Set(step.matched);
    const afterRemove = removeMatched(prev, matchedSet);
    const after = step.gridAfterCascade;
    const { moves, spawns } = computeCascadeDelta(afterRemove, after);
    let maxDur = 0;
    for (const m of moves) {
      const d = Math.abs(m.toRow - m.fromRow);
      maxDur = Math.max(maxDur, Math.max(1, d * FRAMES_PER_FALL_CELL));
    }
    for (const sp of spawns) {
      const d = Math.abs(sp.toRow - sp.entryRow);
      maxDur = Math.max(maxDur, Math.max(1, d * FRAMES_PER_FALL_CELL));
    }
    total += maxDur;
    prev = after;
  }
  return total;
}

function makeMatchId(rng: () => number, index: number): string {
  const r = Math.floor(rng() * 0xffffff)
    .toString(36)
    .padStart(4, '0');
  return `m_gen_${index}_${r}`;
}

/**
 * Apply each placement's "match color + blocker + swap source" plant onto
 * `grid`. Each placement gets a tile color drawn from the palette such that
 * neighbouring placements are unlikely to share colors (which would create
 * incidental cross-placement matches).
 */
function plantPlacements(
  grid: Cell[][],
  placements: MatchPlacement[],
  palette: PieceColor[],
  rng: () => number,
): {
  warnings: string[];
  tileColors: PieceColor[];
  blockerColors: PieceColor[];
} {
  const warnings: string[] = [];
  const tileColors: PieceColor[] = [];
  const blockerColors: PieceColor[] = [];

  for (let i = 0; i < placements.length; i++) {
    const p = placements[i]!;
    // Choose a tile color that differs from neighbouring placements' colors
    // when possible. With only 2 palette colors this is best-effort.
    let tileColor: PieceColor;
    if (palette.length === 1) {
      tileColor = palette[0]!;
    } else {
      const banned = new Set<PieceColor>();
      // Look at any already-planted cells touching this placement and avoid
      // their color so adjacent matches don't merge.
      for (const cell of [...p.cells, p.swapFrom]) {
        for (const [dr, dc] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ]) {
          const r = cell.row + dr;
          const c = cell.col + dc;
          if (r < 0 || c < 0 || r >= grid.length || c >= (grid[0]?.length ?? 0)) continue;
          const v = grid[r]![c];
          if (v !== null && v !== 'gap') banned.add(v as PieceColor);
        }
      }
      const allowed = palette.filter((c) => !banned.has(c));
      const pool = allowed.length > 0 ? allowed : palette;
      tileColor = pool[Math.floor(rng() * pool.length)]!;
    }

    const blockerChoices = palette.filter((c) => c !== tileColor);
    const blockerColor =
      blockerChoices.length > 0
        ? blockerChoices[Math.floor(rng() * blockerChoices.length)]!
        : palette[0]!;

    for (const cell of p.cells) {
      const isBlocker =
        cell.row === p.swapInto.row && cell.col === p.swapInto.col;
      grid[cell.row]![cell.col] = isBlocker ? blockerColor : tileColor;
    }
    grid[p.swapFrom.row]![p.swapFrom.col] = tileColor;

    // Verify a swap (swapFrom <-> swapInto) actually creates a match. If not,
    // warn (probably means the placement geometry is malformed — should never
    // happen if computePlacements did its job, but guard anyway).
    const test = swapCells(
      grid,
      p.swapFrom.row,
      p.swapFrom.col,
      p.swapInto.row,
      p.swapInto.col,
    );
    if (findMatches(test).size === 0) {
      warnings.push(
        `Placement ${i + 1} (${p.shape}) plant didn't produce a match — algorithm bug.`,
      );
    }

    tileColors.push(tileColor);
    blockerColors.push(blockerColor);
  }
  return { warnings, tileColors, blockerColors };
}

/**
 * For each placement that has a `secondary` plan attached (decided in
 * placement.ts during the geometry pass), paint the plan's non-swapFrom
 * cells with the placement's blocker color so the primary swap fires both
 * matches. Validates that:
 *   - Writing those cells doesn't create a pre-existing match in the
 *     static grid (otherwise the gameplay would resolve a stray match
 *     before the user even swaps).
 *   - Simulating the primary swap really does include every secondary
 *     cell in the matched set (sanity — guards against a planted plan
 *     conflicting with a neighbouring primary's colour landscape).
 *
 * If a placement's secondary plan fails validation, the writes are
 * reverted and the placement keeps only its primary. The plan stays on
 * the placement object so the overlay can still show it as "intended".
 */
function plantSecondaryMatches(
  grid: Cell[][],
  placements: MatchPlacement[],
  blockerColors: PieceColor[],
  rng: () => number,
): {
  secondaryReserved: Set<string>;
  succeeded: number;
  attempted: number;
  cells: { row: number; col: number }[];
  warnings: string[];
} {
  void rng;
  const warnings: string[] = [];
  const secondaryReserved = new Set<string>();
  const cells: { row: number; col: number }[] = [];
  let succeeded = 0;
  let attempted = 0;

  for (let i = 0; i < placements.length; i++) {
    const p = placements[i]!;
    if (!p.secondary) continue;
    attempted++;
    const blocker = blockerColors[i]!;
    const swapFromKey = key(p.swapFrom.row, p.swapFrom.col);
    const otherCells = p.secondary.cells.filter(
      (c) => key(c.row, c.col) !== swapFromKey,
    );
    if (otherCells.length === 0) continue;

    // Snapshot existing values so we can revert on validation failure.
    const snapshot = otherCells.map((c) => grid[c.row]![c.col]!);
    for (const c of otherCells) grid[c.row]![c.col] = blocker;

    // Validation: no pre-existing match anywhere on the static grid.
    if (findMatches(grid).size > 0) {
      for (let j = 0; j < otherCells.length; j++) {
        const c = otherCells[j]!;
        grid[c.row]![c.col] = snapshot[j]!;
      }
      continue;
    }

    // Validation: primary swap triggers every secondary cell.
    const swapped = swapCells(
      grid,
      p.swapFrom.row,
      p.swapFrom.col,
      p.swapInto.row,
      p.swapInto.col,
    );
    const matched = findMatches(swapped);
    let allHit = true;
    for (const c of p.secondary.cells) {
      if (!matched.has(key(c.row, c.col))) {
        allHit = false;
        break;
      }
    }
    if (!allHit) {
      for (let j = 0; j < otherCells.length; j++) {
        const c = otherCells[j]!;
        grid[c.row]![c.col] = snapshot[j]!;
      }
      continue;
    }

    // Success.
    for (const c of otherCells) {
      secondaryReserved.add(key(c.row, c.col));
      cells.push({ row: c.row, col: c.col });
    }
    succeeded++;
  }

  return { secondaryReserved, succeeded, attempted, cells, warnings };
}

/**
 * Fill cells outside any placement with random palette colors. Two layers
 * of validation per candidate color:
 *
 *   1. Static check — placing the color must not produce any 3+ run in the
 *      static grid (would resolve to a match-3 before the user even swaps).
 *   2. Post-swap check — for every planned swap (one per placement),
 *      simulating the swap on the static grid must produce a matched set
 *      that is a SUBSET of the placement's expected cells (primary +
 *      secondary if planted). This stops free-fill colors from secretly
 *      extending a planned 3-line into a 4-line, or co-firing with an
 *      adjacent placement's cells.
 *
 * `secondaryReserved` is the set of cells that `plantSecondaryMatches`
 * actually committed (so we know which placements will fire a secondary
 * at simulation time and include those cells in the "expected" set).
 */
function fillFreeCells(
  grid: Cell[][],
  placements: MatchPlacement[],
  palette: PieceColor[],
  rng: () => number,
  extraReserved?: Set<string>,
): string[] {
  const warnings: string[] = [];
  const reserved = new Set<string>();
  for (const p of placements) {
    for (const cell of p.cells) reserved.add(key(cell.row, cell.col));
    reserved.add(key(p.swapFrom.row, p.swapFrom.col));
  }
  if (extraReserved) {
    for (const k of extraReserved) reserved.add(k);
  }

  const h = grid.length;
  const w = grid[0]?.length ?? 0;

  // Per-placement expected matched-set: primary cells + secondary cells
  // when the secondary plant succeeded (its other cells live in
  // extraReserved). Used by the post-swap validator below.
  const expectedSets: Set<string>[] = placements.map((p) => {
    const set = new Set<string>();
    for (const cell of p.cells) set.add(key(cell.row, cell.col));
    if (p.secondary) {
      const swapFromKey = key(p.swapFrom.row, p.swapFrom.col);
      const otherCells = p.secondary.cells.filter(
        (c) => key(c.row, c.col) !== swapFromKey,
      );
      const secondarySucceeded =
        otherCells.length > 0 &&
        extraReserved !== undefined &&
        extraReserved.has(key(otherCells[0]!.row, otherCells[0]!.col));
      if (secondarySucceeded) {
        for (const c of p.secondary.cells) set.add(key(c.row, c.col));
      }
    }
    return set;
  });

  const wouldCreateMatch = (r: number, c: number, color: PieceColor): boolean => {
    grid[r]![c] = color;
    // Static no-match check.
    if (findMatches(grid).size > 0) {
      grid[r]![c] = null;
      return true;
    }
    // Post-swap check, narrowed: a fill cell can only affect a swap's
    // matched set if it ends up part of that match (a same-color run
    // including this cell). So we just check whether THIS cell is in the
    // matched set after each swap and, if so, whether it belongs to the
    // expected match for that swap. Earlier we compared the entire
    // matched set against expected; that was too strict — every minor
    // pre-existing imperfection in a placement's match cascade got
    // attributed to whatever cell was being filled, leaving cells with
    // no legal color choices on dense boards.
    const testKey = key(r, c);
    for (let i = 0; i < placements.length; i++) {
      const p = placements[i]!;
      const expected = expectedSets[i]!;
      const swapped = swapCells(
        grid,
        p.swapFrom.row,
        p.swapFrom.col,
        p.swapInto.row,
        p.swapInto.col,
      );
      const matched = findMatches(swapped);
      if (matched.has(testKey) && !expected.has(testKey)) {
        grid[r]![c] = null;
        return true;
      }
    }
    grid[r]![c] = null;
    return false;
  };

  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (grid[r]![c] !== null) continue; // gap or already-planted

      // Try shuffled palette to find a color that avoids creating a match.
      const order = palette.slice();
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = order[i]!;
        order[i] = order[j]!;
        order[j] = tmp;
      }
      let chosen: PieceColor | null = null;
      for (const color of order) {
        if (!wouldCreateMatch(r, c, color)) {
          chosen = color;
          break;
        }
      }
      if (!chosen) {
        // All colors create a match — pick the first anyway and warn. This
        // can happen with a 2-color palette in tightly packed corners.
        chosen = order[0]!;
        warnings.push(
          `Cell (${r},${c}) had no match-free color choice — used ${chosen}. Try fewer matches or 3+ colors.`,
        );
      }
      grid[r]![c] = chosen;
    }
  }

  // Final validation: any remaining match means a placement plant overlaps
  // a fill in a way we couldn't avoid.
  if (findMatches(grid).size > 0) {
    if (reserved.size > 0) {
      warnings.push(
        'Filled board has incidental matches — some placements may play out unexpectedly.',
      );
    }
  }
  return warnings;
}

export function generateGameplay(opts: GenerateOpts): GenerateResult {
  const cascadeEnabled = opts.cascadeEnabled ?? false;
  const seed = opts.seed ?? Date.now();
  const rng = mulberry32(seed);
  const palette = paletteFor(opts.colorCount);
  const warnings: string[] = [];

  if (opts.placements.length === 0) {
    warnings.push('No match placements yet — draw a path first.');
    return {
      matches: [],
      startingGrid: emptyLayout(opts.width, opts.height),
      warnings,
      secondaryStats: { attempted: 0, succeeded: 0, cells: [] },
    };
  }

  let grid: Cell[][] = emptyLayout(opts.width, opts.height);

  // Step 1: plant each placement (match cells + blocker + swap source).
  const plantResult = plantPlacements(grid, opts.placements, palette, rng);
  warnings.push(...plantResult.warnings);

  // Step 2: paint the secondary plans (decided in placement.ts) onto the
  // grid using each primary's blocker color. Validation catches any plan
  // whose colors would create a pre-existing match or fail to fire with
  // the swap; those skip silently and the primary still plays.
  const secondaryResult = plantSecondaryMatches(
    grid,
    opts.placements,
    plantResult.blockerColors,
    rng,
  );
  warnings.push(...secondaryResult.warnings);

  // Step 3: fill all remaining cells with random palette colors avoiding
  // accidental matches. Secondary-plant cells are non-null already so
  // they're skipped naturally; the explicit reserved set is belt-and-
  // suspenders.
  warnings.push(
    ...fillFreeCells(grid, opts.placements, palette, rng, secondaryResult.secondaryReserved),
  );

  const startingGrid = grid.map((r) => r.slice());

  // Step 3: simulate the variant — for each placement, swap and cascade.
  const matches: RecordedMatch[] = [];
  let cursorGrid = grid;

  for (let k = 0; k < opts.placements.length; k++) {
    const p = opts.placements[k]!;
    const initialGrid = cursorGrid.map((r) => r.slice());

    const swapped = swapCells(
      cursorGrid,
      p.swapFrom.row,
      p.swapFrom.col,
      p.swapInto.row,
      p.swapInto.col,
    );
    const matchedAfterSwap = findMatches(swapped);
    if (matchedAfterSwap.size === 0) {
      warnings.push(
        `Match ${k + 1}: swap didn't trigger a match (cells were perturbed by neighbouring placement). Skipping.`,
      );
      continue;
    }
    const { finalGrid, steps } = simulateCascade(swapped, cascadeEnabled, palette);

    const fallFrames = fallFramesTotal(swapped, steps, cascadeEnabled);
    const frameLength =
      FRAMES_SWAP + steps.length * FRAMES_DISSOLVE + fallFrames;

    matches.push({
      id: makeMatchId(rng, k),
      initialGrid,
      swap: {
        from: { ...p.swapFrom },
        to: { ...p.swapInto },
      },
      cascadeSteps: steps.map((s) => ({
        matched: [...s.matched],
        gridAfterCascade: s.gridAfterCascade.map((r) => r.slice()),
      })),
      frameLength,
      kind: 'success',
    });

    cursorGrid = finalGrid;
  }

  return {
    matches,
    startingGrid,
    warnings,
    secondaryStats: {
      attempted: secondaryResult.attempted,
      succeeded: secondaryResult.succeeded,
      cells: secondaryResult.cells,
    },
  };
}
