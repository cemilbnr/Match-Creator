export interface PathPoint {
  row: number;
  col: number;
}

export interface TargetPoint {
  row: number;
  col: number;
}

/**
 * Walk the polyline cell-by-cell, rounding to integer grid cells along the
 * way. Inputs may be float (free-draw mode); the output is always integer
 * cells with no duplicates so the placement algorithm has a clean stream.
 */
export function densifyPath(path: PathPoint[]): PathPoint[] {
  if (path.length === 0) return [];
  const first = path[0]!;
  const out: PathPoint[] = [
    { row: Math.round(first.row), col: Math.round(first.col) },
  ];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const dr = b.row - a.row;
    const dc = b.col - a.col;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dr), Math.abs(dc))));
    for (let s = 1; s <= steps; s++) {
      const r = Math.round(a.row + (dr * s) / steps);
      const c = Math.round(a.col + (dc * s) / steps);
      const last = out[out.length - 1]!;
      if (r !== last.row || c !== last.col) out.push({ row: r, col: c });
    }
  }
  return out;
}

export function arcLengthTargets(
  path: PathPoint[],
  count: number,
): TargetPoint[] {
  if (count <= 0 || path.length === 0) return [];
  if (path.length === 1) {
    return Array.from({ length: count }, () => ({ ...path[0]! }));
  }
  const segLens: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const dr = b.row - a.row;
    const dc = b.col - a.col;
    const len = Math.hypot(dr, dc);
    segLens.push(len);
    total += len;
  }
  if (total === 0) {
    return Array.from({ length: count }, () => ({ ...path[0]! }));
  }
  const targets: TargetPoint[] = [];
  for (let k = 0; k < count; k++) {
    const t = (k + 0.5) / count;
    let need = t * total;
    let segIdx = 0;
    while (segIdx < segLens.length - 1 && need > segLens[segIdx]!) {
      need -= segLens[segIdx]!;
      segIdx++;
    }
    const a = path[segIdx]!;
    const b = path[segIdx + 1]!;
    const len = segLens[segIdx]!;
    const f = len > 0 ? need / len : 0;
    targets.push({
      row: a.row + (b.row - a.row) * f,
      col: a.col + (b.col - a.col) * f,
    });
  }
  return targets;
}

export function isEdgeCell(
  p: { row: number; col: number },
  gridWidth: number,
  gridHeight: number,
): boolean {
  return (
    p.row === 0 ||
    p.col === 0 ||
    p.row === gridHeight - 1 ||
    p.col === gridWidth - 1
  );
}

export interface DistributedTargets {
  targets: TargetPoint[];
  /** For each input path index, the slice of `targets` that belongs to it. */
  ranges: { start: number; count: number }[];
}

function pathArcLength(path: PathPoint[]): number {
  if (path.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += Math.hypot(
      path[i]!.row - path[i - 1]!.row,
      path[i]!.col - path[i - 1]!.col,
    );
  }
  return total;
}

/**
 * Distribute `total` target points across multiple paths proportional to
 * each path's arc length, returning per-path slice ranges. Empty paths get
 * a `count: 0` range. When `edgeSnap` is provided, the first/last target of
 * a path whose endpoint sits on the board edge is snapped to that exact
 * cell — this powers the "edge endpoints must match exactly" rule.
 */
export function distributeTargets(
  paths: PathPoint[][],
  total: number,
  edgeSnap?: { gridWidth: number; gridHeight: number },
): DistributedTargets {
  if (paths.length === 0 || total <= 0) {
    return { targets: [], ranges: paths.map(() => ({ start: 0, count: 0 })) };
  }

  const usableIdx: number[] = [];
  for (let i = 0; i < paths.length; i++) {
    if (paths[i]!.length > 0) usableIdx.push(i);
  }
  if (usableIdx.length === 0) {
    return { targets: [], ranges: paths.map(() => ({ start: 0, count: 0 })) };
  }

  const counts = new Array<number>(paths.length).fill(0);

  if (usableIdx.length === 1) {
    counts[usableIdx[0]!] = total;
  } else {
    const lens = usableIdx.map((i) => Math.max(1e-6, pathArcLength(paths[i]!)));
    const sumLen = lens.reduce((a, b) => a + b, 0);
    const raw = lens.map((l) => (total * l) / sumLen);
    const local = raw.map((v) => Math.floor(v));
    let assigned = local.reduce((a, b) => a + b, 0);
    const remainders = raw.map((v, i) => ({ i, frac: v - Math.floor(v) }));
    remainders.sort((a, b) => b.frac - a.frac);
    let r = 0;
    while (assigned < total) {
      const pick = remainders[r % remainders.length]!;
      local[pick.i] = (local[pick.i] ?? 0) + 1;
      assigned++;
      r++;
    }
    if (total >= usableIdx.length) {
      for (let i = 0; i < local.length; i++) {
        if (local[i]! === 0) {
          let donorIdx = 0;
          for (let j = 1; j < local.length; j++) {
            if ((local[j] ?? 0) > (local[donorIdx] ?? 0)) donorIdx = j;
          }
          if ((local[donorIdx] ?? 0) > 1) {
            local[donorIdx] = (local[donorIdx] ?? 0) - 1;
            local[i] = 1;
          }
        }
      }
    }
    for (let i = 0; i < usableIdx.length; i++) {
      counts[usableIdx[i]!] = local[i]!;
    }
  }

  const targets: TargetPoint[] = [];
  const ranges: { start: number; count: number }[] = paths.map(() => ({
    start: 0,
    count: 0,
  }));
  for (let i = 0; i < paths.length; i++) {
    const count = counts[i]!;
    const start = targets.length;
    ranges[i] = { start, count };
    if (count <= 0) continue;
    const path = paths[i]!;
    const slice = arcLengthTargets(path, count);

    // Edge-snap: paths whose endpoints sit on the board edge MUST land match #1
    // (and match #N) at those exact cells. We rewrite the slice's first/last
    // entry to the literal endpoint coords; the generator separately uses the
    // ranges to enforce these as "locked" targets during the greedy walk.
    if (edgeSnap && path.length > 0) {
      const first = path[0]!;
      const last = path[path.length - 1]!;
      if (
        isEdgeCell(first, edgeSnap.gridWidth, edgeSnap.gridHeight) &&
        slice.length > 0
      ) {
        slice[0] = { row: first.row, col: first.col };
      }
      if (
        slice.length > 0 &&
        isEdgeCell(last, edgeSnap.gridWidth, edgeSnap.gridHeight)
      ) {
        slice[slice.length - 1] = { row: last.row, col: last.col };
      }
    }

    targets.push(...slice);
  }

  return { targets, ranges };
}

/** Backwards-compatible thin wrapper over distributeTargets. */
export function combineTargets(
  paths: PathPoint[][],
  total: number,
  edgeSnap?: { gridWidth: number; gridHeight: number },
): TargetPoint[] {
  return distributeTargets(paths, total, edgeSnap).targets;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
