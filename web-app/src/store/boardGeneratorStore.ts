import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DEFAULT_BOARD_HEIGHT,
  DEFAULT_BOARD_WIDTH,
  MAX_BOARD_SIDE,
  MIN_BOARD_SIDE,
  type Board,
  type Cell,
  type PieceColor,
} from '../types';

/**
 * Persistent state for the Board Generator panel.
 *
 * Lives outside the component so a) switching panels (BoardGenerator →
 * Sequencer → BoardGenerator) keeps the in-progress edit, and b) restarting
 * the app preserves an unsaved draft.
 *
 * Actions own the side-aware resize logic (add/remove rows/columns from
 * top/right/bottom/left) used by the canvas's edge +/- buttons.
 */

export type BoardSide = 'top' | 'right' | 'bottom' | 'left';

/** Active tool: paint with a brush or define rectangular selections. */
export type GeneratorTool = 'paint' | 'select';

/** Inclusive cell-space rectangle. */
export interface SelectionRect {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

function normalizeRect(r: SelectionRect, height: number, width: number): SelectionRect {
  const r0 = Math.max(0, Math.min(height - 1, Math.min(r.r0, r.r1)));
  const r1 = Math.max(0, Math.min(height - 1, Math.max(r.r0, r.r1)));
  const c0 = Math.max(0, Math.min(width - 1, Math.min(r.c0, r.c1)));
  const c1 = Math.max(0, Math.min(width - 1, Math.max(r.c0, r.c1)));
  return { r0, c0, r1, c1 };
}

const MIN_GEN_CELL = 20;
const MAX_GEN_CELL = 64;
const GEN_CELL_STEP = 6;

function emptyLayout(width: number, height: number): Cell[][] {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => null),
  );
}

function clampSide(v: number): number {
  if (!Number.isFinite(v)) return MIN_BOARD_SIDE;
  return Math.max(MIN_BOARD_SIDE, Math.min(MAX_BOARD_SIDE, Math.floor(v)));
}

function clampCell(v: number): number {
  return Math.max(MIN_GEN_CELL, Math.min(MAX_GEN_CELL, Math.round(v)));
}

function resizeRightBottom(
  layout: Cell[][],
  width: number,
  height: number,
): Cell[][] {
  const next: Cell[][] = [];
  for (let r = 0; r < height; r++) {
    const src = layout[r] ?? [];
    const row: Cell[] = [];
    for (let c = 0; c < width; c++) {
      row.push(src[c] ?? null);
    }
    next.push(row);
  }
  return next;
}

function newId() {
  return `board_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Stamp a floating selection into the layout at its current row/col,
 * resolve the resulting selection rect, and clear the float. Pulled out so
 * setTool / setSelection / commitFloat can share it without tripping over
 * Zustand's setState semantics.
 */
type SetFn = (
  partial:
    | Partial<BoardGeneratorState>
    | ((s: BoardGeneratorState) => Partial<BoardGeneratorState>),
) => void;

function stampFloatIntoLayout(set: SetFn, s: BoardGeneratorState): void {
  if (!s.floating) return;
  const { content, row, col } = s.floating;
  const fh = content.length;
  const fw = content[0]?.length ?? 0;
  const next = s.layout.map((r) => r.slice());
  let r0 = s.height,
    r1 = -1,
    c0 = s.width,
    c1 = -1;
  for (let dr = 0; dr < fh; dr++) {
    for (let dc = 0; dc < fw; dc++) {
      const tr = row + dr;
      const tc = col + dc;
      if (tr < 0 || tr >= s.height || tc < 0 || tc >= s.width) continue;
      const v = content[dr]?.[dc];
      if (v === undefined) continue;
      // Floating null cells skip the destination ("transparent" pixels) so
      // the stamp behaves like an irregular shape rather than a hard
      // rectangle. Use 'gap' explicitly to override.
      if (v === null) continue;
      next[tr]![tc] = v;
      if (tr < r0) r0 = tr;
      if (tr > r1) r1 = tr;
      if (tc < c0) c0 = tc;
      if (tc > c1) c1 = tc;
    }
  }
  const newSelection =
    r1 >= r0 && c1 >= c0 ? { r0, c0, r1, c1 } : null;
  set({ layout: next, floating: null, selection: newSelection });
}

function rotateFloatInternal(set: SetFn, s: BoardGeneratorState): void {
  if (!s.floating) return;
  const c = s.floating.content;
  const h = c.length;
  const w = c[0]?.length ?? 0;
  const rotated: Cell[][] = Array.from({ length: w }, () =>
    Array.from({ length: h }, () => null as Cell),
  );
  for (let r = 0; r < h; r++) {
    for (let cc = 0; cc < w; cc++) {
      rotated[cc]![h - 1 - r] = c[r]![cc]!;
    }
  }
  // Recenter the rotation around the float's current center so it doesn't
  // jump to a far corner when the dimensions swap.
  const cy = s.floating.row + (h - 1) / 2;
  const cx = s.floating.col + (w - 1) / 2;
  const newH = w;
  const newW = h;
  const newRow = Math.round(cy - (newH - 1) / 2);
  const newCol = Math.round(cx - (newW - 1) / 2);

  set({
    floating: { ...s.floating, content: rotated, row: newRow, col: newCol },
    selection: {
      r0: newRow,
      c0: newCol,
      r1: newRow + newH - 1,
      c1: newCol + newW - 1,
    },
  });
}

interface BoardGeneratorState {
  boardId: string;
  name: string;
  width: number;
  height: number;
  tileSet: string;
  layout: Cell[][];
  /** Last successful save timestamp; the page uses it to flash a "saved" pill. */
  savedAt: number | null;
  cellSize: number;

  // ---- Selection / clipboard / floating ---------------------------------
  /** Active tool. The select tool exposes the marquee + region operations. */
  tool: GeneratorTool;
  /** Committed marquee rectangle (cell-space, inclusive). */
  selection: SelectionRect | null;
  /** Cells captured by the most recent copy/cut, in [row][col] order. */
  clipboard: Cell[][] | null;
  /**
   * "Floating" selection state — the content has been lifted out of the
   * board and is being dragged around (Aseprite/Photoshop semantics). While
   * non-null:
   *   • the original cells are already cleared in `layout`
   *   • the float is rendered as an overlay at (row, col)
   *   • mouseup commits, Esc cancels (restores `originalLayout`).
   */
  floating: {
    content: Cell[][];
    /** Top-left in cell space. */
    row: number;
    col: number;
    /** Layout snapshot taken at beginFloat(); cancelFloat() restores this. */
    originalLayout: Cell[][];
  } | null;

  setTool: (t: GeneratorTool) => void;
  setSelection: (rect: SelectionRect | null) => void;
  /** Capture the cells under the current selection into the clipboard. */
  copySelection: () => void;
  /** copySelection() + clear those cells (paint with null). */
  cutSelection: () => void;
  /** Erase every cell under the current selection (no clipboard write). */
  deleteSelection: () => void;
  /** Paste the clipboard starting at (row, col). Out-of-bounds cells are
   *  clipped silently. Returns the bounding rect actually written, or null. */
  pasteAt: (row: number, col: number) => SelectionRect | null;
  /** Rotate the cells under the current selection 90° clockwise IN PLACE
   *  (no clipboard touched, no float created). The selection rectangle is
   *  resized to the new dimensions and clipped to the board. */
  rotateSelectionCW: () => void;

  /** Lift the current selection's contents out of the layout. The original
   *  cells become null; the captured grid is held in `floating` until
   *  commitFloat() / cancelFloat(). No-op when there's no selection. */
  beginFloat: () => void;
  /** Move a floating selection to a new top-left cell. */
  moveFloat: (row: number, col: number) => void;
  /** Rotate the floating content 90° CW; the bounding box dimensions swap. */
  rotateFloatCW: () => void;
  /** Stamp the floating content into the layout at its current position
   *  and clear the float. Selection becomes the new bounding rect. */
  commitFloat: () => void;
  /** Discard the float and restore the layout to its pre-lift snapshot. */
  cancelFloat: () => void;

  setName: (n: string) => void;
  /** Resize from the right/bottom edge (legacy default — keep existing fields). */
  setWidth: (w: number) => void;
  setHeight: (h: number) => void;
  /** Replace the layout wholesale (e.g. when loading a saved board). */
  setLayoutDirect: (layout: Cell[][]) => void;
  paint: (row: number, col: number, value: Cell) => void;
  fillEmpty: (color: PieceColor | 'gap') => void;
  eraseColor: (color: PieceColor) => void;
  replaceColor: (from: PieceColor, to: PieceColor) => void;
  clearCanvas: () => void;

  /** Side-aware add/remove a single row/col from the given edge. */
  addEdge: (side: BoardSide) => void;
  removeEdge: (side: BoardSide) => void;

  resetTo: (board: Board) => void;
  resetNew: (suggestedName: string) => void;
  markSaved: () => void;

  zoomIn: () => void;
  zoomOut: () => void;
  setCellSize: (n: number) => void;

  /** Helpers exposed for the page header. */
  canZoomIn: () => boolean;
  canZoomOut: () => boolean;
}

export const useBoardGenerator = create<BoardGeneratorState>()(
  persist(
    (set, get) => ({
      boardId: newId(),
      name: 'Board 1',
      width: DEFAULT_BOARD_WIDTH,
      height: DEFAULT_BOARD_HEIGHT,
      tileSet: 'default',
      layout: emptyLayout(DEFAULT_BOARD_WIDTH, DEFAULT_BOARD_HEIGHT),
      savedAt: null,
      cellSize: 32,

      tool: 'paint',
      selection: null,
      clipboard: null,
      floating: null,

      setTool: (t) => {
        // Switching away from select commits any in-flight float (we don't
        // want the lifted cells to silently disappear) and drops the marquee.
        const s = get();
        if (s.floating) {
          // Commit synchronously without re-using commitFloat (avoids reading
          // from `set` twice).
          stampFloatIntoLayout(set, s);
        }
        if (t !== 'select') {
          set({ tool: t, selection: null });
        } else {
          set({ tool: t });
        }
      },
      setSelection: (rect) => {
        const s = get();
        // Changing the selection while a float is active commits the float
        // first (matches Aseprite / Photoshop).
        if (s.floating) {
          stampFloatIntoLayout(set, s);
        }
        if (rect === null) {
          set({ selection: null });
          return;
        }
        set({ selection: normalizeRect(rect, s.height, s.width) });
      },

      copySelection: () => {
        const s = get();
        if (!s.selection) return;
        const { r0, c0, r1, c1 } = s.selection;
        const slice: Cell[][] = [];
        for (let r = r0; r <= r1; r++) {
          const row: Cell[] = [];
          for (let c = c0; c <= c1; c++) {
            row.push(s.layout[r]?.[c] ?? null);
          }
          slice.push(row);
        }
        set({ clipboard: slice });
      },

      cutSelection: () => {
        const s = get();
        if (!s.selection) return;
        const { r0, c0, r1, c1 } = s.selection;
        const slice: Cell[][] = [];
        const next = s.layout.map((row) => row.slice());
        for (let r = r0; r <= r1; r++) {
          const row: Cell[] = [];
          for (let c = c0; c <= c1; c++) {
            row.push(s.layout[r]?.[c] ?? null);
            if (next[r]) next[r]![c] = null;
          }
          slice.push(row);
        }
        set({ clipboard: slice, layout: next });
      },

      deleteSelection: () => {
        const s = get();
        if (!s.selection) return;
        const { r0, c0, r1, c1 } = s.selection;
        const next = s.layout.map((row) => row.slice());
        for (let r = r0; r <= r1; r++) {
          for (let c = c0; c <= c1; c++) {
            if (next[r]) next[r]![c] = null;
          }
        }
        set({ layout: next });
      },

      pasteAt: (row, col) => {
        const s = get();
        if (!s.clipboard || s.clipboard.length === 0) return null;
        const ph = s.clipboard.length;
        const pw = s.clipboard[0]!.length;
        const next = s.layout.map((r) => r.slice());
        let lastR = row;
        let lastC = col;
        for (let dr = 0; dr < ph; dr++) {
          for (let dc = 0; dc < pw; dc++) {
            const tr = row + dr;
            const tc = col + dc;
            if (tr < 0 || tr >= s.height || tc < 0 || tc >= s.width) continue;
            const v = s.clipboard[dr]![dc] ?? null;
            // Pasting `null` cells from the clipboard keeps the destination
            // intact (transparent paste). Set explicit gap/colour to override.
            if (v === null) continue;
            next[tr]![tc] = v;
            if (tr > lastR) lastR = tr;
            if (tc > lastC) lastC = tc;
          }
        }
        const written: SelectionRect = {
          r0: Math.max(0, row),
          c0: Math.max(0, col),
          r1: Math.min(s.height - 1, row + ph - 1),
          c1: Math.min(s.width - 1, col + pw - 1),
        };
        set({ layout: next, selection: written });
        return written;
      },

      rotateSelectionCW: () => {
        const s = get();
        if (!s.selection) return;
        // If we're currently floating, rotate the float instead (covered by
        // rotateFloatCW). This action is for the non-floating case.
        if (s.floating) {
          rotateFloatInternal(set, s);
          return;
        }
        const { r0, c0, r1, c1 } = s.selection;
        const h = r1 - r0 + 1;
        const w = c1 - c0 + 1;

        // Capture, clear, rotate, stamp.
        const captured: Cell[][] = [];
        for (let r = r0; r <= r1; r++) {
          const row: Cell[] = [];
          for (let c = c0; c <= c1; c++) {
            row.push(s.layout[r]?.[c] ?? null);
          }
          captured.push(row);
        }
        const rotated: Cell[][] = Array.from({ length: w }, () =>
          Array.from({ length: h }, () => null as Cell),
        );
        for (let r = 0; r < h; r++) {
          for (let c = 0; c < w; c++) {
            rotated[c]![h - 1 - r] = captured[r]![c]!;
          }
        }

        // New rect: anchored at the original top-left (r0, c0). New
        // dimensions are (w, h) — width/height swap. Clipped to board.
        const newH = w;
        const newW = h;
        const newR1 = Math.min(s.height - 1, r0 + newH - 1);
        const newC1 = Math.min(s.width - 1, c0 + newW - 1);

        const next = s.layout.map((row) => row.slice());
        // Clear original
        for (let r = r0; r <= r1; r++) {
          for (let c = c0; c <= c1; c++) {
            if (next[r]) next[r]![c] = null;
          }
        }
        // Stamp rotated (clipped)
        for (let dr = 0; dr <= newR1 - r0; dr++) {
          for (let dc = 0; dc <= newC1 - c0; dc++) {
            const v = rotated[dr]?.[dc] ?? null;
            const tr = r0 + dr;
            const tc = c0 + dc;
            if (next[tr]) next[tr]![tc] = v;
          }
        }
        set({
          layout: next,
          selection: { r0, c0, r1: newR1, c1: newC1 },
        });
      },

      beginFloat: () => {
        const s = get();
        if (!s.selection || s.floating) return;
        const { r0, c0, r1, c1 } = s.selection;
        const content: Cell[][] = [];
        const next = s.layout.map((row) => row.slice());
        for (let r = r0; r <= r1; r++) {
          const row: Cell[] = [];
          for (let c = c0; c <= c1; c++) {
            row.push(s.layout[r]?.[c] ?? null);
            if (next[r]) next[r]![c] = null;
          }
          content.push(row);
        }
        set({
          layout: next,
          floating: {
            content,
            row: r0,
            col: c0,
            originalLayout: s.layout.map((row) => row.slice()),
          },
        });
      },

      moveFloat: (row, col) => {
        set((s) => {
          if (!s.floating) return s;
          const fh = s.floating.content.length;
          const fw = s.floating.content[0]?.length ?? 0;
          // Clamp top-left so at least one cell of the float stays on the
          // board. (Allowing partial off-board placement: clip on commit.)
          const minRow = -(fh - 1);
          const maxRow = s.height - 1;
          const minCol = -(fw - 1);
          const maxCol = s.width - 1;
          const r = Math.max(minRow, Math.min(maxRow, row));
          const c = Math.max(minCol, Math.min(maxCol, col));
          return {
            floating: { ...s.floating, row: r, col: c },
            selection: {
              r0: r,
              c0: c,
              r1: r + fh - 1,
              c1: c + fw - 1,
            },
          };
        });
      },

      rotateFloatCW: () => {
        const s = get();
        rotateFloatInternal(set, s);
      },

      commitFloat: () => {
        const s = get();
        if (!s.floating) return;
        stampFloatIntoLayout(set, s);
      },

      cancelFloat: () => {
        const s = get();
        if (!s.floating) return;
        set({
          layout: s.floating.originalLayout.map((row) => row.slice()),
          floating: null,
          // Selection stays where it was (the original lifted rect).
        });
      },

      setName: (n) => set({ name: n }),

      setWidth: (w) => {
        const next = clampSide(w);
        set((s) => ({
          width: next,
          layout: resizeRightBottom(s.layout, next, s.height),
        }));
      },

      setHeight: (h) => {
        const next = clampSide(h);
        set((s) => ({
          height: next,
          layout: resizeRightBottom(s.layout, s.width, next),
        }));
      },

      setLayoutDirect: (layout) => {
        const height = layout.length;
        const width = layout[0]?.length ?? 0;
        set({ layout: layout.map((r) => r.slice()), width, height });
      },

      paint: (row, col, value) => {
        set((s) => {
          if (!s.layout[row] || s.layout[row]![col] === value) return s;
          const next = s.layout.map((r) => r.slice());
          next[row]![col] = value;
          return { layout: next };
        });
      },

      fillEmpty: (color) => {
        set((s) => {
          let changed = false;
          const next = s.layout.map((row) =>
            row.map((c) => {
              if (c === null) {
                changed = true;
                return color;
              }
              return c;
            }),
          );
          return changed ? { layout: next } : s;
        });
      },

      eraseColor: (color) => {
        set((s) => {
          let changed = false;
          const next = s.layout.map((row) =>
            row.map((c) => {
              if (c === color) {
                changed = true;
                return null;
              }
              return c;
            }),
          );
          return changed ? { layout: next } : s;
        });
      },

      replaceColor: (from, to) => {
        if (from === to) return;
        set((s) => {
          let changed = false;
          const next = s.layout.map((row) =>
            row.map((c) => {
              if (c === from) {
                changed = true;
                return to;
              }
              return c;
            }),
          );
          return changed ? { layout: next } : s;
        });
      },

      clearCanvas: () => {
        set((s) => ({ layout: emptyLayout(s.width, s.height) }));
      },

      addEdge: (side) => {
        set((s) => {
          if (side === 'top' || side === 'bottom') {
            if (s.height >= MAX_BOARD_SIDE) return s;
            const newRow: Cell[] = Array.from({ length: s.width }, () => null);
            const layout =
              side === 'top'
                ? [newRow, ...s.layout.map((r) => r.slice())]
                : [...s.layout.map((r) => r.slice()), newRow];
            return { layout, height: s.height + 1 };
          }
          if (s.width >= MAX_BOARD_SIDE) return s;
          const layout = s.layout.map((row) => {
            const next = row.slice();
            if (side === 'left') next.unshift(null);
            else next.push(null);
            return next;
          });
          return { layout, width: s.width + 1 };
        });
      },

      removeEdge: (side) => {
        set((s) => {
          if (side === 'top' || side === 'bottom') {
            if (s.height <= MIN_BOARD_SIDE) return s;
            const layout =
              side === 'top'
                ? s.layout.slice(1).map((r) => r.slice())
                : s.layout.slice(0, s.layout.length - 1).map((r) => r.slice());
            return { layout, height: s.height - 1 };
          }
          if (s.width <= MIN_BOARD_SIDE) return s;
          const layout = s.layout.map((row) => {
            if (side === 'left') return row.slice(1);
            return row.slice(0, row.length - 1);
          });
          return { layout, width: s.width - 1 };
        });
      },

      resetTo: (board) => {
        set({
          boardId: board.id,
          name: board.name,
          width: board.width,
          height: board.height,
          layout: board.layout.map((row) => row.slice()),
          savedAt: null,
        });
      },

      resetNew: (suggestedName) => {
        set({
          boardId: newId(),
          name: suggestedName,
          width: DEFAULT_BOARD_WIDTH,
          height: DEFAULT_BOARD_HEIGHT,
          layout: emptyLayout(DEFAULT_BOARD_WIDTH, DEFAULT_BOARD_HEIGHT),
          savedAt: null,
        });
      },

      markSaved: () => set({ savedAt: Date.now() }),

      zoomIn: () =>
        set((s) => ({ cellSize: clampCell(s.cellSize + GEN_CELL_STEP) })),
      zoomOut: () =>
        set((s) => ({ cellSize: clampCell(s.cellSize - GEN_CELL_STEP) })),
      setCellSize: (n) => set({ cellSize: clampCell(n) }),

      canZoomIn: () => get().cellSize < MAX_GEN_CELL,
      canZoomOut: () => get().cellSize > MIN_GEN_CELL,
    }),
    {
      name: 'match-creator:board-generator:v1',
      // savedAt is intentionally ephemeral — the "Saved" pill should not flash
      // when the app reopens. Tool / selection / clipboard are also session-
      // scoped: a stale marquee from a previous edit would be confusing.
      partialize: (s) => ({
        boardId: s.boardId,
        name: s.name,
        width: s.width,
        height: s.height,
        tileSet: s.tileSet,
        layout: s.layout,
        cellSize: s.cellSize,
      }),
    },
  ),
);

/** Replaces the boardId with a fresh one (used by Save-As after the copy is committed). */
export function adoptNewBoardId(name: string): string {
  const id = newId();
  useBoardGenerator.setState({
    boardId: id,
    name,
    savedAt: Date.now(),
  });
  return id;
}
