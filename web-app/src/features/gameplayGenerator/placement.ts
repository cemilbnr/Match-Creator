import { densifyPath, mulberry32, type PathPoint } from './path';

export type MatchShape =
  | '3h'
  | '3v'
  | '4h'
  | '4v'
  | '2x2'
  | '3x2-h'
  | '3x2-v'
  | '4x2-h'
  | '4x2-v';

export type ShapeCategory = '3-line' | '4-line' | '2x2' | '3x2' | '4x2';

export const SHAPE_CATEGORIES: ShapeCategory[] = [
  '3-line',
  '4-line',
  '2x2',
  '3x2',
  '4x2',
];

export type ProbabilityWeights = Record<ShapeCategory, number>;

export const DEFAULT_PROBABILITIES: ProbabilityWeights = {
  '3-line': 100,
  '4-line': 50,
  '2x2': 60,
  '3x2': 20,
  '4x2': 10,
};

/**
 * A secondary near-match attached to a primary placement. Cells include
 * the primary's swapFrom (which becomes the blocker color after the swap)
 * plus N-1 neighbour cells that the generator paints with the same blocker
 * color. When the primary swap fires, both the primary and secondary
 * matches resolve in the same animation step. Decided here at placement
 * time (geometry-only) so the overlay can render it during drawing.
 */
export interface SecondaryPlan {
  shape: MatchShape;
  cells: PathPoint[];
}

export interface MatchPlacement {
  id: string;
  shape: MatchShape;
  cells: PathPoint[];
  swapFrom: PathPoint;
  swapInto: PathPoint;
  accentColor: string;
  /** When present, the generator will paint these cells with this primary's
   *  blocker color so a single swap fires two matches simultaneously. */
  secondary?: SecondaryPlan;
}

const ACCENT_COLORS = [
  'rgba(56, 189, 248, 1)',
  'rgba(244, 114, 182, 1)',
  'rgba(250, 204, 21, 1)',
  'rgba(167, 139, 250, 1)',
  'rgba(52, 211, 153, 1)',
  'rgba(251, 146, 60, 1)',
  'rgba(96, 165, 250, 1)',
  'rgba(232, 121, 249, 1)',
  'rgba(248, 113, 113, 1)',
  'rgba(45, 212, 191, 1)',
];

const NEIGHBORS: [number, number][] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

function key(r: number, c: number) {
  return `${r}:${c}`;
}

function inBounds(p: PathPoint, w: number, h: number): boolean {
  return p.row >= 0 && p.row < h && p.col >= 0 && p.col < w;
}

function cellsFit(
  cells: PathPoint[],
  consumed: Set<string>,
  w: number,
  h: number,
): boolean {
  for (const c of cells) {
    if (!inBounds(c, w, h)) return false;
    if (consumed.has(key(c.row, c.col))) return false;
  }
  return true;
}

function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}

/**
 * Cells of `shape` anchored at the origin (0,0). Translation by an offset
 * vector lets us place the shape so that any one of its cells aligns with
 * an arbitrary anchor coordinate.
 */
function buildShape(
  shape: MatchShape,
  anchor: PathPoint,
  dirH: 1 | -1,
  dirV: 1 | -1,
): PathPoint[] {
  const cell = (dr: number, dc: number) => ({
    row: anchor.row + dirV * dr,
    col: anchor.col + dirH * dc,
  });
  switch (shape) {
    case '3h':
      return [cell(0, 0), cell(0, 1), cell(0, 2)];
    case '3v':
      return [cell(0, 0), cell(1, 0), cell(2, 0)];
    case '4h':
      return [cell(0, 0), cell(0, 1), cell(0, 2), cell(0, 3)];
    case '4v':
      return [cell(0, 0), cell(1, 0), cell(2, 0), cell(3, 0)];
    case '2x2':
      return [cell(0, 0), cell(0, 1), cell(1, 0), cell(1, 1)];
    case '3x2-h':
      return [
        cell(0, 0), cell(0, 1), cell(0, 2),
        cell(1, 0), cell(1, 1), cell(1, 2),
      ];
    case '3x2-v':
      return [
        cell(0, 0), cell(0, 1),
        cell(1, 0), cell(1, 1),
        cell(2, 0), cell(2, 1),
      ];
    case '4x2-h':
      return [
        cell(0, 0), cell(0, 1), cell(0, 2), cell(0, 3),
        cell(1, 0), cell(1, 1), cell(1, 2), cell(1, 3),
      ];
    case '4x2-v':
      return [
        cell(0, 0), cell(0, 1),
        cell(1, 0), cell(1, 1),
        cell(2, 0), cell(2, 1),
        cell(3, 0), cell(3, 1),
      ];
  }
}

export function categoryShapes(
  cat: ShapeCategory,
  horizontalDominant: boolean,
): MatchShape[] {
  switch (cat) {
    case '3-line':
      return horizontalDominant ? ['3h', '3v'] : ['3v', '3h'];
    case '4-line':
      return horizontalDominant ? ['4h', '4v'] : ['4v', '4h'];
    case '2x2':
      return ['2x2'];
    case '3x2':
      return horizontalDominant ? ['3x2-h', '3x2-v'] : ['3x2-v', '3x2-h'];
    case '4x2':
      return horizontalDominant ? ['4x2-h', '4x2-v'] : ['4x2-v', '4x2-h'];
  }
}

function pickSwap(
  cells: PathPoint[],
  consumed: Set<string>,
  w: number,
  h: number,
): { from: PathPoint; into: PathPoint } | null {
  const cellSet = new Set(cells.map((c) => key(c.row, c.col)));
  type Candidate = { from: PathPoint; into: PathPoint; score: number };
  const candidates: Candidate[] = [];
  for (const cell of cells) {
    for (const [dr, dc] of NEIGHBORS) {
      const r = cell.row + dr;
      const c = cell.col + dc;
      if (!inBounds({ row: r, col: c }, w, h)) continue;
      const k = key(r, c);
      if (cellSet.has(k)) continue;
      if (consumed.has(k)) continue;
      const idx = cells.indexOf(cell);
      const isMiddle = idx > 0 && idx < cells.length - 1;
      candidates.push({
        from: { row: r, col: c },
        into: { row: cell.row, col: cell.col },
        score: isMiddle ? 1 : 0,
      });
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return { from: candidates[0]!.from, into: candidates[0]!.into };
}

interface ShapeCandidate {
  shape: MatchShape;
  cells: PathPoint[];
}

/**
 * Build all translations of each shape such that one of its cells coincides
 * with `anchor`. For a 3-line that's 3 candidates (anchor at left/middle/
 * right cell); for a 4x2 that's 8. Caller iterates and picks the first that
 * fits the consumed-cells + adjacency rules. Shuffled with the seeded RNG.
 */
function shapesIncludingAnchor(
  anchor: PathPoint,
  shapes: MatchShape[],
  dRow: number,
  dCol: number,
  rng: () => number,
): ShapeCandidate[] {
  const dirH: 1 | -1 = dCol < 0 ? -1 : 1;
  const dirV: 1 | -1 = dRow < 0 ? -1 : 1;
  const out: ShapeCandidate[] = [];
  for (const shape of shapes) {
    const baseCells = buildShape(shape, { row: 0, col: 0 }, dirH, dirV);
    for (let i = 0; i < baseCells.length; i++) {
      const offset = {
        row: anchor.row - baseCells[i]!.row,
        col: anchor.col - baseCells[i]!.col,
      };
      const cells = baseCells.map((c) => ({
        row: c.row + offset.row,
        col: c.col + offset.col,
      }));
      out.push({ shape, cells });
    }
  }
  shuffleInPlace(out, rng);
  return out;
}

/**
 * Wrapper around `shapesIncludingAnchor` that also widens the search to
 * perpendicular offsets up to `thickness - 1` cells away from the path
 * cell. Iteration order is deterministic (offset 0 first, then ±1, ±2…)
 * so the cursor-walk's RNG stream stays prefix-stable when the user
 * extends a path.
 */
function shapeCandidatesNearby(
  pathAnchor: PathPoint,
  dRow: number,
  dCol: number,
  thickness: number,
  shapes: MatchShape[],
  rng: () => number,
): ShapeCandidate[] {
  const t = Math.max(1, Math.round(thickness));
  if (t === 1) {
    return shapesIncludingAnchor(pathAnchor, shapes, dRow, dCol, rng);
  }
  const horizontalDominant = Math.abs(dCol) >= Math.abs(dRow);
  const offsets: number[] = [0];
  for (let k = 1; k <= t - 1; k++) {
    offsets.push(k);
    offsets.push(-k);
  }
  const out: ShapeCandidate[] = [];
  for (const off of offsets) {
    const anchor: PathPoint = horizontalDominant
      ? { row: pathAnchor.row + off, col: pathAnchor.col }
      : { row: pathAnchor.row, col: pathAnchor.col + off };
    out.push(...shapesIncludingAnchor(anchor, shapes, dRow, dCol, rng));
  }
  return out;
}

/**
 * Single-shape variant exposed for the secondary-plant step in the
 * generator. Returns every translation of `shape` such that one of its
 * cells coincides with `anchor`, in a seeded-shuffled order.
 */
export function enumerateShapeCandidatesAt(
  anchor: PathPoint,
  shape: MatchShape,
  rng: () => number,
): { shape: MatchShape; cells: PathPoint[] }[] {
  return shapesIncludingAnchor(anchor, [shape], 0, 1, rng);
}

function localDirection(
  path: PathPoint[],
  i: number,
): { dRow: number; dCol: number } {
  let dRow = 0;
  let dCol = 0;
  const window = path.slice(i, i + 5);
  for (let j = 1; j < window.length; j++) {
    dRow += window[j]!.row - window[j - 1]!.row;
    dCol += window[j]!.col - window[j - 1]!.col;
  }
  return { dRow, dCol };
}

function makePlacementId(seq: number, rng: () => number): string {
  const r = Math.floor(rng() * 0xffff)
    .toString(36)
    .padStart(3, '0');
  return `pl_${seq}_${r}`;
}

function touchesPlaced(cells: PathPoint[], placed: Set<string>): boolean {
  if (placed.size === 0) return true;
  for (const cell of cells) {
    if (placed.has(key(cell.row - 1, cell.col))) return true;
    if (placed.has(key(cell.row + 1, cell.col))) return true;
    if (placed.has(key(cell.row, cell.col - 1))) return true;
    if (placed.has(key(cell.row, cell.col + 1))) return true;
  }
  return false;
}

/** Weighted-without-replacement category shuffle. Zero-weight categories
 *  are dropped so a slider at 0 truly disables that shape. */
export function pickShuffledCategories(
  probabilities: ProbabilityWeights,
  rng: () => number,
): ShapeCategory[] {
  const remaining: ShapeCategory[] = SHAPE_CATEGORIES.filter(
    (c) => (probabilities[c] ?? 0) > 0,
  );
  const weights = remaining.map((c) => probabilities[c]!);
  const out: ShapeCategory[] = [];
  while (remaining.length > 0) {
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) break;
    let r = rng() * total;
    let i = 0;
    for (; i < weights.length; i++) {
      r -= weights[i]!;
      if (r <= 0) break;
    }
    if (i >= weights.length) i = weights.length - 1;
    out.push(remaining[i]!);
    remaining.splice(i, 1);
    weights.splice(i, 1);
  }
  return out;
}

export interface ComputePlacementsOpts {
  paths: PathPoint[][];
  gridWidth: number;
  gridHeight: number;
  maxCount?: number;
  /** Manhattan radius of the path band that the infection is allowed to
   *  spread through. 1 = strict on-path; larger = wider blob territory. */
  thickness?: number;
  probabilities?: ProbabilityWeights;
  seed?: number;
  /** 0..1 — for each primary placement, the chance the algorithm tries to
   *  attach a secondary near-match plan around its swapFrom cell. Decided
   *  here so the overlay can show the plan during drawing; the generator's
   *  plant step still validates with colors before committing. */
  secondaryMatchProbability?: number;
}

/**
 * Frontier-growth ("infection") placement algorithm.
 *
 * 1. The drawn paths define a band: every cell within `thickness - 1`
 *    Manhattan distance of any path cell.
 * 2. Seed: place the first match at the start of the first path (falling
 *    back to other band cells if it can't fit there).
 * 3. Spread: each iteration picks a random un-consumed band cell that's
 *    4-adjacent to any already-placed cell, then tries to anchor a new
 *    match shape so one of its cells sits on that frontier cell. The
 *    chosen shape is sampled by the per-category probability weights, and
 *    multiple translations of each shape are tried (so the shape can grow
 *    in any direction from the anchor).
 * 4. Stop on cap or empty frontier.
 *
 * The result feels like an infection spreading through the path's band:
 * branching, organic, every seed → different output.
 */
export function computePlacements(opts: ComputePlacementsOpts): MatchPlacement[] {
  const {
    paths,
    gridWidth,
    gridHeight,
    maxCount,
    thickness = 1,
    probabilities = DEFAULT_PROBABILITIES,
    seed,
    secondaryMatchProbability = 0,
  } = opts;

  const cap = typeof maxCount === 'number' && maxCount > 0 ? maxCount : Infinity;
  const rng = mulberry32(typeof seed === 'number' ? seed : 0xc0ffee);

  const validPaths = paths.filter((p) => p.length > 0).map(densifyPath);
  if (validPaths.length === 0) return [];

  const consumed = new Set<string>();
  const placedCells = new Set<string>();
  const placements: MatchPlacement[] = [];
  let seq = 0;

  /**
   * Geometry-only secondary plan around `placement.swapFrom`. Picks a shape
   * weighted by `probabilities` and returns the first translation whose
   * cells fit within bounds and don't overlap any consumed cell other than
   * the swapFrom anchor itself. Returns null if no fit exists or the RNG
   * roll declined the attempt.
   */
  const tryPlanSecondary = (placement: MatchPlacement): SecondaryPlan | null => {
    if (secondaryMatchProbability <= 0) return null;
    if (rng() >= secondaryMatchProbability) return null;
    const swapFromKey = key(placement.swapFrom.row, placement.swapFrom.col);
    // Direction at swapFrom: vector from any primary cell to swapFrom — the
    // primary's swap axis. Use it to pick h vs v shape variants.
    const ref = placement.cells[0]!;
    const dRow = placement.swapFrom.row - ref.row;
    const dCol = placement.swapFrom.col - ref.col;
    const horizontalDominant = Math.abs(dCol) >= Math.abs(dRow);
    const categories = pickShuffledCategories(probabilities, rng);
    for (const cat of categories) {
      const shapes = categoryShapes(cat, horizontalDominant);
      for (const shape of shapes) {
        const candidates = shapesIncludingAnchor(
          placement.swapFrom,
          [shape],
          dRow,
          dCol,
          rng,
        );
        for (const cand of candidates) {
          let fits = true;
          for (const c of cand.cells) {
            if (c.row < 0 || c.row >= gridHeight || c.col < 0 || c.col >= gridWidth) {
              fits = false;
              break;
            }
            const k = key(c.row, c.col);
            // The shape MUST include swapFrom (the anchor), and swapFrom
            // is in `consumed` (the primary added it). Allow it; reject
            // any other consumed cell.
            if (k === swapFromKey) continue;
            if (consumed.has(k)) {
              fits = false;
              break;
            }
          }
          if (!fits) continue;
          return {
            shape: cand.shape,
            cells: cand.cells.map((c) => ({ ...c })),
          };
        }
      }
    }
    return null;
  };

  /** Reserve the secondary's non-swapFrom cells in `consumed` so subsequent
   *  primary or secondary placements don't trample them. */
  const reserveSecondary = (placement: MatchPlacement) => {
    if (!placement.secondary) return;
    const swapFromKey = key(placement.swapFrom.row, placement.swapFrom.col);
    for (const c of placement.secondary.cells) {
      const k = key(c.row, c.col);
      if (k === swapFromKey) continue;
      consumed.add(k);
    }
  };

  /** Try to place a primary match anchored at `anchor` with the given local
   *  path direction (dRow/dCol). Iterates probability-weighted shape
   *  categories and their translations (with thickness perp offsets) and
   *  returns the first that fits the consumed-cells + adjacency rules. */
  const tryPlaceAt = (
    anchor: PathPoint,
    dRow: number,
    dCol: number,
    requireAdjacency: boolean,
  ): MatchPlacement | null => {
    const horizontalDominant = Math.abs(dCol) >= Math.abs(dRow);
    const categories = pickShuffledCategories(probabilities, rng);
    for (const cat of categories) {
      const shapes = categoryShapes(cat, horizontalDominant);
      const candidates = shapeCandidatesNearby(
        anchor,
        dRow,
        dCol,
        thickness,
        shapes,
        rng,
      );
      for (const cand of candidates) {
        if (!cellsFit(cand.cells, consumed, gridWidth, gridHeight)) continue;
        if (requireAdjacency && !touchesPlaced(cand.cells, placedCells)) {
          continue;
        }
        const swap = pickSwap(cand.cells, consumed, gridWidth, gridHeight);
        if (!swap) continue;
        return {
          id: makePlacementId(seq++, rng),
          shape: cand.shape,
          cells: cand.cells.map((c) => ({ ...c })),
          swapFrom: swap.from,
          swapInto: swap.into,
          accentColor: ACCENT_COLORS[placements.length % ACCENT_COLORS.length]!,
        };
      }
    }
    return null;
  };

  // Cursor-walk: process each path's cells in order. Because RNG calls
  // happen strictly in path-cell order and consumed/placedCells only
  // accumulate (no random retries over the whole band), this is
  // PREFIX-STABLE: extending a path by one cell only affects placements
  // that would land at or past the new cell. The matches the user has
  // already seen on the board don't shift around as they keep drawing.
  for (const path of validPaths) {
    if (placements.length >= cap) break;
    let pathPlaced = false;
    let i = 0;
    let safety = 0;
    while (i < path.length && safety++ < 1000) {
      if (placements.length >= cap) break;
      const anchor = path[i]!;
      if (consumed.has(key(anchor.row, anchor.col))) {
        i++;
        continue;
      }
      const { dRow, dCol } = localDirection(path, i);
      // Adjacency rule: every match after the very first must touch some
      // earlier placement. Per-path "first placement free" lets a fresh
      // stroke start anywhere when it's the very first match on the board.
      const requireAdjacency = pathPlaced || placements.length > 0;
      const placed = tryPlaceAt(anchor, dRow, dCol, requireAdjacency);
      if (placed) {
        for (const cell of placed.cells) {
          consumed.add(key(cell.row, cell.col));
          placedCells.add(key(cell.row, cell.col));
        }
        consumed.add(key(placed.swapFrom.row, placed.swapFrom.col));
        placed.secondary = tryPlanSecondary(placed) ?? undefined;
        reserveSecondary(placed);
        placements.push(placed);
        pathPlaced = true;
        // Skip past the cells this placement consumed so the next anchor
        // lands somewhere fresh. Capped at 4 so big rectangles don't jump
        // the cursor across the whole path.
        i += Math.max(1, Math.min(placed.cells.length, 4));
      } else {
        i++;
      }
    }
  }

  return placements;
}

export function placementCenter(p: MatchPlacement): {
  row: number;
  col: number;
} {
  let r = 0;
  let c = 0;
  for (const cell of p.cells) {
    r += cell.row;
    c += cell.col;
  }
  return { row: r / p.cells.length, col: c / p.cells.length };
}
