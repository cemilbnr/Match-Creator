import { create } from 'zustand';
import {
  emptyLayout,
  generateGameplay,
  type SecondaryStats,
} from '../features/gameplayGenerator/generator';
import type { PathPoint } from '../features/gameplayGenerator/path';
import {
  computePlacements,
  DEFAULT_PROBABILITIES,
  type ProbabilityWeights,
  type ShapeCategory,
} from '../features/gameplayGenerator/placement';
import type { Board, Cell } from '../types';
import {
  DEFAULT_BOARD_HEIGHT,
  DEFAULT_BOARD_WIDTH,
  MAX_BOARD_SIDE,
  MIN_BOARD_SIDE,
} from '../types';
import { swapCells } from '../features/gameplaySequencer/match';
import { useLibrary } from './libraryStore';
import {
  CELL_SIZE_STEP,
  MAX_CELL_SIZE,
  MIN_CELL_SIZE,
  useSequencer,
  type RecordedMatch,
} from './sequencerStore';
import { useUI } from './uiStore';
import { useVariants } from './variantsStore';

const DEFAULT_CELL_SIZE = 52;
const DEFAULT_MATCH_COUNT = 8;
const DEFAULT_PATH_THICKNESS = 2;
const MAX_PATH_THICKNESS = 4;
const DEFAULT_SECONDARY_PROB = 0.4;

const ANIM_SETTLE_MS = 60;
const ANIM_SWAP_HOLD_MS = 180;
const ANIM_DISSOLVE_MS = 280;
const ANIM_POST_MS = 80;

export type GeneratorMode = 'idle' | 'draw-path';
export type ColorCount = 2 | 3 | 4;

interface GameplayGeneratorState {
  // ---- Setup ----
  width: number;
  height: number;
  /** Cap on how many placements the algorithm produces from the drawn paths.
   *  Drawing past this cap leaves the extra path cells as visual guides
   *  only — no new placements appear. */
  matchCount: number;
  /** Perpendicular search width around each path cell (in cells). 1 = strict
   *  on-path; 2+ lets the algorithm offset matches by ±N cells perpendicular
   *  to the path direction so 2x2s and longer shapes have more room. */
  pathThickness: number;
  /** Per-category sampling weights. Higher = more likely to be picked first
   *  at each cursor; 0 = never used. Live previews and Generate both use
   *  these via weighted-without-replacement sampling. */
  probabilities: ProbabilityWeights;
  /** 0..1 — for each primary placement, the chance the algorithm tries to
   *  plant a SECONDARY match around the swap-source cell so a single swap
   *  fires two simultaneous matches. Zero disables the feature entirely. */
  secondaryMatchProbability: number;
  colorCount: ColorCount;
  /** Drives the placement geometry (computePlacements). Changing it
   *  reshuffles which cells become matches, which shapes appear, etc. */
  seed: number | null;
  /** Drives the board fill (color choices outside the planted match cells)
   *  in generateGameplay. Independent from `seed` so the user can re-roll
   *  just the colors without disturbing the placement layout. */
  generateSeed: number | null;

  // ---- Paths ----
  paths: PathPoint[][];
  mode: GeneratorMode;

  // ---- Preview ----
  previewMatches: RecordedMatch[];
  previewStartingGrid: Cell[][] | null;
  previewSecondaryStats: SecondaryStats;
  warnings: string[];
  isGenerating: boolean;

  // ---- Playback ----
  playbackIndex: number;
  playbackGrid: Cell[][] | null;
  playbackMatched: string[];
  playbackAnimating: boolean;
  /** True while Generate's auto-walk is running. Manual ←/→ flips this off
   *  so the user can take over mid-playback. */
  autoplayActive: boolean;

  // ---- View ----
  cellSize: number;

  // ---- Actions ----
  resizeBoard: (w: number, h: number) => void;
  setMatchCount: (n: number) => void;
  setPathThickness: (n: number) => void;
  setProbability: (cat: ShapeCategory, value: number) => void;
  setSecondaryMatchProbability: (n: number) => void;
  setColorCount: (n: ColorCount) => void;
  setSeed: (n: number | null) => void;
  setGenerateSeed: (n: number | null) => void;

  setMode: (m: GeneratorMode) => void;
  appendPathPoint: (p: PathPoint) => void;
  beginNewPath: () => void;
  clearAllPaths: () => void;
  removePath: (idx: number) => void;

  setCellSize: (n: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;

  generatePreview: () => void;
  clearPreview: () => void;
  reorderPreviewMatch: (from: number, to: number) => void;
  removePreviewMatchAt: (idx: number) => void;

  resetPlayback: () => void;
  stepForward: () => void;
  stepBackward: () => void;
  /** Walks forward through every preview match in sequence with brief
   *  pauses between matches. Manual ←/→ stops the walk so the user can
   *  take over at any point. */
  autoplayPreview: () => void;
  cancelAutoplay: () => void;

  sendPreviewToSequencer: (
    name?: string,
  ) => { boardId: string; variantId: string } | null;
}

function clampSide(v: number): number {
  return Math.max(MIN_BOARD_SIDE, Math.min(MAX_BOARD_SIDE, Math.round(v)));
}

function clampCellSize(v: number): number {
  return Math.max(MIN_CELL_SIZE, Math.min(MAX_CELL_SIZE, Math.round(v)));
}

function newBoardId() {
  return `board_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function totalPathPoints(paths: PathPoint[][]): number {
  let n = 0;
  for (const p of paths) n += p.length;
  return n;
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

const PLAYBACK_RESET_PATCH: Partial<GameplayGeneratorState> = {
  playbackIndex: -1,
  playbackGrid: null,
  playbackMatched: [],
  playbackAnimating: false,
  autoplayActive: false,
};

const ANIM_BETWEEN_MATCHES_MS = 180;
const ANIM_BEFORE_AUTOPLAY_MS = 250;

const EMPTY_SECONDARY_STATS: SecondaryStats = {
  attempted: 0,
  succeeded: 0,
  cells: [],
};

const PREVIEW_RESET_PATCH: Partial<GameplayGeneratorState> = {
  previewMatches: [],
  previewStartingGrid: null,
  previewSecondaryStats: EMPTY_SECONDARY_STATS,
  warnings: [],
  ...PLAYBACK_RESET_PATCH,
};

export const useGameplayGenerator = create<GameplayGeneratorState>(
  (set, get) => ({
    width: DEFAULT_BOARD_WIDTH,
    height: DEFAULT_BOARD_HEIGHT,
    matchCount: DEFAULT_MATCH_COUNT,
    pathThickness: DEFAULT_PATH_THICKNESS,
    probabilities: { ...DEFAULT_PROBABILITIES },
    secondaryMatchProbability: DEFAULT_SECONDARY_PROB,
    colorCount: 4,
    seed: null,
    generateSeed: null,

    paths: [[]],
    mode: 'idle',

    previewMatches: [],
    previewStartingGrid: null,
    previewSecondaryStats: EMPTY_SECONDARY_STATS,
    warnings: [],
    isGenerating: false,

    playbackIndex: -1,
    playbackGrid: null,
    playbackMatched: [],
    playbackAnimating: false,
    autoplayActive: false,

    cellSize: DEFAULT_CELL_SIZE,

    resizeBoard: (w, h) =>
      set({
        width: clampSide(w),
        height: clampSide(h),
        // Resizing invalidates path coordinates; clear everything.
        paths: [[]],
        ...PREVIEW_RESET_PATCH,
      }),

    setMatchCount: (n) =>
      set({
        matchCount: Math.max(1, Math.min(99, Math.round(n))),
        ...PREVIEW_RESET_PATCH,
      }),

    setPathThickness: (n) =>
      set({
        pathThickness: Math.max(1, Math.min(MAX_PATH_THICKNESS, Math.round(n))),
        ...PREVIEW_RESET_PATCH,
      }),

    setProbability: (cat, value) =>
      set((s) => ({
        probabilities: {
          ...s.probabilities,
          [cat]: Math.max(0, Math.min(100, Math.round(value))),
        },
        ...PREVIEW_RESET_PATCH,
      })),

    setSecondaryMatchProbability: (n) =>
      set({
        secondaryMatchProbability: Math.max(0, Math.min(1, n)),
        ...PREVIEW_RESET_PATCH,
      }),

    setColorCount: (n) =>
      // Color count only affects fill at generate time, but a stale preview
      // would have wrong palette — clear it.
      set({ colorCount: n, ...PREVIEW_RESET_PATCH }),

    setSeed: (seed) => set({ seed, ...PREVIEW_RESET_PATCH }),

    setGenerateSeed: (generateSeed) =>
      set({ generateSeed, ...PREVIEW_RESET_PATCH }),

    setMode: (mode) => set({ mode }),

    appendPathPoint: (p) =>
      set((s) => {
        if (p.row < 0 || p.col < 0 || p.row >= s.height || p.col >= s.width) {
          return {};
        }
        const paths = s.paths.length > 0 ? s.paths.slice() : [[]];
        const idx = paths.length - 1;
        const last = paths[idx]!;
        // Distance-based dedup so free-draw doesn't accumulate hundreds of
        // near-coincident samples per stroke. Anything closer than 0.3 cell
        // to the previous sample gets dropped — visually identical, but
        // keeps the curve render and rasterizer cheap.
        if (last.length > 0) {
          const tail = last[last.length - 1]!;
          const dr = p.row - tail.row;
          const dc = p.col - tail.col;
          if (dr * dr + dc * dc < 0.3 * 0.3) return {};
        }
        paths[idx] = [...last, { row: p.row, col: p.col }];
        return { paths, ...PREVIEW_RESET_PATCH };
      }),

    beginNewPath: () =>
      set((s) => {
        if (s.paths.length === 0) return { paths: [[]] };
        const last = s.paths[s.paths.length - 1]!;
        if (last.length === 0) return {};
        return { paths: [...s.paths, []] };
      }),

    clearAllPaths: () =>
      set({ paths: [[]], ...PREVIEW_RESET_PATCH }),

    removePath: (idx) =>
      set((s) => {
        if (idx < 0 || idx >= s.paths.length) return {};
        const next = s.paths.slice();
        next.splice(idx, 1);
        if (next.length === 0) next.push([]);
        return { paths: next, ...PREVIEW_RESET_PATCH };
      }),

    setCellSize: (n) => set({ cellSize: clampCellSize(n) }),
    zoomIn: () =>
      set((s) => ({ cellSize: clampCellSize(s.cellSize + CELL_SIZE_STEP) })),
    zoomOut: () =>
      set((s) => ({ cellSize: clampCellSize(s.cellSize - CELL_SIZE_STEP) })),

    generatePreview: () => {
      const s = get();
      const placements = computePlacements({
        paths: s.paths,
        gridWidth: s.width,
        gridHeight: s.height,
        maxCount: s.matchCount,
        thickness: s.pathThickness,
        probabilities: s.probabilities,
        seed: s.seed ?? undefined,
        secondaryMatchProbability: s.secondaryMatchProbability,
      });
      if (placements.length === 0) {
        set({
          warnings: ['No placements derived — draw a path that runs at least 3 cells in a row.'],
          ...PREVIEW_RESET_PATCH,
        });
        return;
      }
      set({ isGenerating: true });
      try {
        const result = generateGameplay({
          width: s.width,
          height: s.height,
          placements,
          colorCount: s.colorCount,
          cascadeEnabled: false,
          // Generate uses its own seed (independent of the placement seed)
          // so the user can re-roll just the board fill without losing the
          // placement layout. Null falls back to the placement seed which
          // falls back to Date.now() inside generateGameplay.
          seed: s.generateSeed ?? s.seed ?? undefined,
        });
        set({
          previewMatches: result.matches,
          previewStartingGrid: result.startingGrid,
          previewSecondaryStats: result.secondaryStats,
          warnings: result.warnings,
          isGenerating: false,
          ...PLAYBACK_RESET_PATCH,
        });
        // Note: no auto-play. The user steps through with → manually so
        // they can pause on each board state and inspect it.
      } catch (err) {
        set({
          warnings: [
            `Generation failed: ${err instanceof Error ? err.message : String(err)}`,
          ],
          isGenerating: false,
        });
      }
    },

    clearPreview: () => set(PREVIEW_RESET_PATCH),

    reorderPreviewMatch: (from, to) =>
      set((s) => {
        if (
          from < 0 ||
          from >= s.previewMatches.length ||
          to < 0 ||
          to >= s.previewMatches.length ||
          from === to
        ) {
          return {};
        }
        const next = s.previewMatches.slice();
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved!);
        return { previewMatches: next, ...PLAYBACK_RESET_PATCH };
      }),

    removePreviewMatchAt: (idx) =>
      set((s) => {
        if (idx < 0 || idx >= s.previewMatches.length) return {};
        const next = s.previewMatches.slice();
        next.splice(idx, 1);
        return { previewMatches: next, ...PLAYBACK_RESET_PATCH };
      }),

    resetPlayback: () => set(PLAYBACK_RESET_PATCH),

    stepForward: () => {
      const s = get();
      if (s.playbackAnimating) return;
      const next = s.playbackIndex + 1;
      if (next >= s.previewMatches.length) return;
      const match = s.previewMatches[next]!;
      // Internal calls (from autoplay) keep the flag on. External callers
      // hit cancelAutoplay first, so by the time we read the flag here
      // it's already false for manual nav.
      set({ playbackAnimating: true });
      void runForwardAnimation(match).then(() => {
        const lastStep = match.cascadeSteps[match.cascadeSteps.length - 1];
        const finalGrid = lastStep
          ? lastStep.gridAfterCascade
          : swapCells(
              match.initialGrid,
              match.swap.from.row,
              match.swap.from.col,
              match.swap.to.row,
              match.swap.to.col,
            );
        set({
          playbackIndex: next,
          playbackGrid: finalGrid,
          playbackMatched: [],
          playbackAnimating: false,
        });
      });
    },

    stepBackward: () => {
      const s = get();
      if (s.playbackAnimating) return;
      // Manual ← always cancels an in-flight autoplay loop.
      if (s.autoplayActive) set({ autoplayActive: false });
      if (s.playbackIndex <= -1) return;
      const prev = s.playbackIndex - 1;
      if (prev < 0) {
        set({
          playbackIndex: -1,
          playbackGrid: null,
          playbackMatched: [],
        });
        return;
      }
      const prevMatch = s.previewMatches[prev]!;
      const lastStep = prevMatch.cascadeSteps[prevMatch.cascadeSteps.length - 1];
      const grid = lastStep
        ? lastStep.gridAfterCascade.map((r) => r.slice())
        : prevMatch.initialGrid.map((r) => r.slice());
      set({
        playbackIndex: prev,
        playbackGrid: grid,
        playbackMatched: [],
      });
    },

    autoplayPreview: () => {
      const s = get();
      if (s.previewMatches.length === 0) return;
      set({
        playbackIndex: -1,
        playbackGrid: null,
        playbackMatched: [],
        playbackAnimating: false,
        autoplayActive: true,
      });
      void runAutoplayLoop();
    },

    cancelAutoplay: () => {
      if (get().autoplayActive) set({ autoplayActive: false });
    },

    sendPreviewToSequencer: (name) => {
      const s = get();
      if (totalPathPoints(s.paths) === 0) return null;

      if (s.previewMatches.length === 0 || s.previewStartingGrid === null) {
        get().generatePreview();
      }
      const fresh = get();
      if (
        fresh.previewMatches.length === 0 ||
        fresh.previewStartingGrid === null
      ) {
        return null;
      }

      const now = Date.now();
      const finalName =
        name?.trim() || `Generated ${new Date(now).toLocaleString()}`;
      const board: Board = {
        id: newBoardId(),
        name: finalName,
        width: fresh.width,
        height: fresh.height,
        tileSet: 'default',
        layout: fresh.previewStartingGrid,
        createdAt: now,
        updatedAt: now,
      };
      useLibrary.getState().saveBoard(board);

      const variantId = useVariants
        .getState()
        .addVariant(finalName, board.id, fresh.previewMatches);

      useSequencer.getState().setBoardId(board.id);
      useSequencer.getState().setActiveVariantId(variantId);
      useSequencer.getState().setCascadeEnabled(false);
      useUI.getState().setPanel('gameplay-sequencer');

      return { boardId: board.id, variantId };
    },
  }),
);

/**
 * Auto-walks the preview from the start to the last match. Polls
 * `autoplayActive` between iterations so manual ←/→ (or any other
 * cancelling action) breaks out cleanly mid-loop. Each iteration calls
 * `stepForward()` and waits for its animation to settle before the next.
 */
async function runAutoplayLoop(): Promise<void> {
  const store = useGameplayGenerator;
  await sleep(ANIM_BEFORE_AUTOPLAY_MS);
  while (true) {
    const s = store.getState();
    if (!s.autoplayActive) return;
    if (s.playbackIndex >= s.previewMatches.length - 1) break;
    s.stepForward();
    // Wait for the just-started animation to finish.
    await new Promise<void>((resolve) => {
      const unsub = store.subscribe((state) => {
        if (!state.playbackAnimating) {
          unsub();
          resolve();
        }
      });
    });
    if (!store.getState().autoplayActive) return;
    await sleep(ANIM_BETWEEN_MATCHES_MS);
  }
  store.setState({ autoplayActive: false });
}

async function runForwardAnimation(match: RecordedMatch): Promise<void> {
  const set = useGameplayGenerator.setState;

  set({
    playbackGrid: match.initialGrid.map((r) => r.slice()),
    playbackMatched: [],
  });
  await sleep(ANIM_SETTLE_MS);

  const swapped = swapCells(
    match.initialGrid,
    match.swap.from.row,
    match.swap.from.col,
    match.swap.to.row,
    match.swap.to.col,
  );
  set({ playbackGrid: swapped, playbackMatched: [] });
  await sleep(ANIM_SWAP_HOLD_MS);

  for (const step of match.cascadeSteps) {
    set({ playbackMatched: [...step.matched] });
    await sleep(ANIM_DISSOLVE_MS);
    set({
      playbackGrid: step.gridAfterCascade.map((r) => r.slice()),
      playbackMatched: [],
    });
    await sleep(ANIM_POST_MS);
  }
}

/** Empty-board layout derived from current width/height — used by the panel
 *  whenever there's no preview yet to display. */
export function templateLayout(state: GameplayGeneratorState): Cell[][] {
  return emptyLayout(state.width, state.height);
}

export function pathsReady(s: GameplayGeneratorState): boolean {
  return totalPathPoints(s.paths) > 0;
}

export function previewReady(s: GameplayGeneratorState): boolean {
  return s.previewMatches.length > 0;
}
