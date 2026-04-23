import type { Board, Cell, PieceColor } from '../../types';
import type { GameplayVariant } from '../../store/variantsStore';
import {
  FRAMES_DISSOLVE,
  FRAMES_PER_FALL_CELL,
  FRAMES_SWAP,
} from '../../store/sequencerStore';
import { computeCascadeDelta } from './match';

/**
 * Exported gameplay schema consumed by the Blender addon. One keyframe per
 * piece per state change. Frames are absolute (scene frame numbers).
 */
export interface BlenderKeyframe {
  frame: number;
  row: number;
  col: number;
  scale: number;
  dip: number;
}

export interface BlenderPiece {
  id: string;
  color: PieceColor;
  keyframes: BlenderKeyframe[];
}

export type BlenderExportMode = 'create' | 'update';

export interface BlenderExport {
  version: 1;
  /**
   * create — always make a fresh collection (existing ones untouched).
   * update — reuse the existing GP_<Board>_<Variant> collection; objects stay,
   *          keyframes and materials are refreshed.
   */
  mode: BlenderExportMode;
  boardName: string;
  variantName: string;
  fps: number;
  grid: { width: number; height: number };
  startFrame: number;
  endFrame: number;
  pieces: BlenderPiece[];
}

/** Tracks a single piece through the gameplay timeline. */
interface LivePiece {
  id: string;
  color: PieceColor;
  row: number;
  col: number;
  keyframes: BlenderKeyframe[];
}

function makePieceId(counter: { n: number }): string {
  counter.n += 1;
  return `p_${String(counter.n).padStart(4, '0')}`;
}

function pushKf(p: LivePiece, kf: BlenderKeyframe): void {
  // Avoid pushing duplicate frame entries (same frame wins last write)
  const existing = p.keyframes[p.keyframes.length - 1];
  if (existing && existing.frame === kf.frame) {
    p.keyframes[p.keyframes.length - 1] = kf;
  } else {
    p.keyframes.push(kf);
  }
}

/**
 * Main export builder. Simulates the variant's playback with stable piece IDs
 * and emits one keyframe list per piece (initial placement, swap destinations,
 * dip peaks, scale-to-0 on dissolve, fall endpoints, spawn origins).
 */
export function buildBlenderExport(
  board: Board,
  variant: GameplayVariant,
  fps: number,
  mode: BlenderExportMode = 'create',
  startFrame = 1,
): BlenderExport {
  const width = board.width;
  const height = board.height;
  const counter = { n: 0 };

  // Grid of piece IDs. null = empty cell.
  const ids: (string | null)[][] = Array.from({ length: height }, () =>
    new Array<string | null>(width).fill(null),
  );
  const pieces: Map<string, LivePiece> = new Map();

  // ---- Seed initial state from the first match's initialGrid (or a fallback) ----
  const initialGrid: Cell[][] =
    variant.matches[0]?.initialGrid ??
    Array.from({ length: height }, () => new Array<Cell>(width).fill(null));

  let frame = startFrame;
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const color = initialGrid[r]?.[c] ?? null;
      // `gap` cells are structural holes in the board — no tile ever spawns
      // there, so they're skipped entirely during export.
      if (color === null || color === 'gap') continue;
      const id = makePieceId(counter);
      const p: LivePiece = { id, color, row: r, col: c, keyframes: [] };
      pushKf(p, { frame, row: r, col: c, scale: 1, dip: 0 });
      pieces.set(id, p);
      ids[r]![c] = id;
    }
  }

  // ---- Walk each match ----
  for (const match of variant.matches) {
    // Swap: 5 frames. Positions swap; dragged piece gets a Y-dip peak.
    const swapStart = frame;
    const swapEnd = frame + FRAMES_SWAP;
    const fromId = ids[match.swap.from.row]?.[match.swap.from.col] ?? null;
    const toId = ids[match.swap.to.row]?.[match.swap.to.col] ?? null;

    if (fromId && toId) {
      const from = pieces.get(fromId)!;
      const to = pieces.get(toId)!;

      // Start keyframes at swap start (hold current position)
      pushKf(from, { frame: swapStart, row: from.row, col: from.col, scale: 1, dip: 0 });
      pushKf(to, { frame: swapStart, row: to.row, col: to.col, scale: 1, dip: 0 });

      // Dip peak on the dragged piece (`from`), matching BlastAnimator_01
      pushKf(from, {
        frame: swapStart + 1,
        row: from.row,
        col: from.col,
        scale: 1,
        dip: -0.14,
      });
      pushKf(from, {
        frame: swapEnd - 1,
        row: match.swap.to.row,
        col: match.swap.to.col,
        scale: 1,
        dip: -0.14,
      });

      // End of swap: pieces at new positions, dip returns to 0
      pushKf(from, {
        frame: swapEnd,
        row: match.swap.to.row,
        col: match.swap.to.col,
        scale: 1,
        dip: 0,
      });
      pushKf(to, {
        frame: swapEnd,
        row: match.swap.from.row,
        col: match.swap.from.col,
        scale: 1,
        dip: 0,
      });

      if (match.kind === 'fail') {
        // Invalid swap: pieces go back to their original cells over the next
        // 5 frames. Don't mutate ids/piece positions — nothing actually moved.
        const bounceEnd = swapEnd + FRAMES_SWAP;
        pushKf(from, {
          frame: bounceEnd,
          row: match.swap.from.row,
          col: match.swap.from.col,
          scale: 1,
          dip: 0,
        });
        pushKf(to, {
          frame: bounceEnd,
          row: match.swap.to.row,
          col: match.swap.to.col,
          scale: 1,
          dip: 0,
        });
        frame = bounceEnd;
        if (match.customFrameLength !== undefined) {
          const pad = Math.max(0, match.customFrameLength - match.frameLength);
          if (pad > 0) frame += pad;
        }
        continue;
      }

      // Update id grid + piece positions
      ids[match.swap.from.row]![match.swap.from.col] = toId;
      ids[match.swap.to.row]![match.swap.to.col] = fromId;
      from.row = match.swap.to.row;
      from.col = match.swap.to.col;
      to.row = match.swap.from.row;
      to.col = match.swap.from.col;
    }

    frame = swapEnd;

    // ---- Cascade steps ----
    for (const step of match.cascadeSteps) {
      // Dissolve: matched cells scale to 0 over 5 frames
      const dissolveStart = frame;
      const dissolveEnd = frame + FRAMES_DISSOLVE;

      for (const key of step.matched) {
        const [rStr, cStr] = key.split(':');
        const r = Number(rStr);
        const c = Number(cStr);
        const pid = ids[r]?.[c] ?? null;
        if (!pid) continue;
        const p = pieces.get(pid)!;
        pushKf(p, { frame: dissolveStart, row: p.row, col: p.col, scale: 1, dip: 0 });
        pushKf(p, { frame: dissolveEnd, row: p.row, col: p.col, scale: 0, dip: 0 });
      }

      // Logically remove the matched cells
      for (const key of step.matched) {
        const [rStr, cStr] = key.split(':');
        ids[Number(rStr)]![Number(cStr)] = null;
      }

      frame = dissolveEnd;

      // Gravity + spawn: compute delta between "prev grid (post-dissolve)" and "gridAfterCascade"
      const postDissolve: Cell[][] = Array.from({ length: height }, (_, r) =>
        Array.from({ length: width }, (_, c) => {
          const pid = ids[r]?.[c] ?? null;
          return pid ? pieces.get(pid)!.color : null;
        }),
      );
      const afterCascade: Cell[][] = step.gridAfterCascade;

      // Cascade-disabled recording leaves holes in gridAfterCascade. Emitting
      // fall/spawn keyframes in that case would nudge stationary pieces because
      // computeCascadeDelta assumes a bottom-packed layout.
      const cascadeWasApplied = afterCascade.every((row) =>
        row.every((cell) => cell !== null),
      );
      if (!cascadeWasApplied) {
        continue;
      }

      const { moves, spawns } = computeCascadeDelta(postDissolve, afterCascade);

      // Build a map of (col, toRow) → pieceId for new ids grid
      const newIds: (string | null)[][] = postDissolve.map((row) => row.slice().map(() => null as string | null));
      // Pieces that didn't move keep their ids at their current positions
      for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
          if (ids[r]?.[c]) newIds[r]![c] = ids[r]![c];
        }
      }

      const fallStart = frame;
      let maxFallDuration = 0;

      // Handle moves: existing pieces fall to new row
      for (const m of moves) {
        const pid = ids[m.fromRow]?.[m.col] ?? null;
        if (!pid) continue;
        const p = pieces.get(pid)!;
        const dist = Math.abs(m.toRow - m.fromRow);
        const duration = Math.max(1, dist * FRAMES_PER_FALL_CELL);
        maxFallDuration = Math.max(maxFallDuration, duration);

        pushKf(p, { frame: fallStart, row: m.fromRow, col: m.col, scale: 1, dip: 0 });
        pushKf(p, {
          frame: fallStart + duration,
          row: m.toRow,
          col: m.col,
          scale: 1,
          dip: 0,
        });

        p.row = m.toRow;
        newIds[m.fromRow]![m.col] = null;
        newIds[m.toRow]![m.col] = pid;
      }

      // Handle spawns: create new piece, starts at entryRow scale 1, falls in
      for (const sp of spawns) {
        const color = afterCascade[sp.toRow]?.[sp.col];
        if (!color || color === 'gap') continue;
        const id = makePieceId(counter);
        const p: LivePiece = {
          id,
          color,
          row: sp.toRow,
          col: sp.col,
          keyframes: [],
        };
        const dist = Math.abs(sp.toRow - sp.entryRow);
        const duration = Math.max(1, dist * FRAMES_PER_FALL_CELL);
        maxFallDuration = Math.max(maxFallDuration, duration);

        pushKf(p, { frame: fallStart, row: sp.entryRow, col: sp.col, scale: 1, dip: 0 });
        pushKf(p, {
          frame: fallStart + duration,
          row: sp.toRow,
          col: sp.col,
          scale: 1,
          dip: 0,
        });
        pieces.set(id, p);
        newIds[sp.toRow]![sp.col] = id;
      }

      // Replace ids with newIds
      for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
          ids[r]![c] = newIds[r]![c] ?? null;
        }
      }

      frame = fallStart + maxFallDuration;
    }

    // Honor per-match customFrameLength by holding extra frames at the end.
    if (match.customFrameLength !== undefined) {
      const pad = Math.max(0, match.customFrameLength - match.frameLength);
      if (pad > 0) frame += pad;
    }
  }

  // Small trailing pause so the viewer sees the final state
  const endFrame = frame + 6;

  return {
    version: 1,
    mode,
    boardName: board.name,
    variantName: variant.name,
    fps,
    grid: { width, height },
    startFrame,
    endFrame,
    pieces: Array.from(pieces.values()).map((p) => ({
      id: p.id,
      color: p.color,
      keyframes: p.keyframes,
    })),
  };
}

