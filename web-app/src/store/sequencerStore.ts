import { create } from 'zustand';
import type { Cell } from '../types';
import {
  computeCascadeDelta,
  findMatches,
  initializeGrid,
  isAdjacent,
  removeMatched,
  applyGravityAndSpawn,
  swapCells,
  type CascadeStep,
} from '../features/gameplaySequencer/match';
import { useSettings } from './settingsStore';
import { useVariants } from './variantsStore';

export interface GridPos {
  row: number;
  col: number;
}

export type MatchKind = 'success' | 'fail';

export interface RecordedMatch {
  id: string;
  initialGrid: Cell[][];
  swap: { from: GridPos; to: GridPos };
  cascadeSteps: CascadeStep[];
  /** Computed minimum frame count (swap + dissolves + falls, or invalid swap). */
  frameLength: number;
  /**
   * User-specified total frames this match occupies. Extra frames past the
   * computed animation become a static hold at the end. Must be >= frameLength.
   * Undefined means "use the computed value".
   */
  customFrameLength?: number;
  /** 'fail' = the swap didn't produce a match. Defaults to 'success' when absent. */
  kind?: MatchKind;
}

/** Returns the actual duration this match occupies (custom or computed). */
export function matchDuration(m: RecordedMatch): number {
  if (m.customFrameLength === undefined) return m.frameLength;
  return Math.max(m.frameLength, m.customFrameLength);
}

// ---- Animation constants (in frames — ties visual timing to fps) ----
export const FRAMES_SWAP = 5;            // X/Z swap over 5 frames
export const FRAMES_DISSOLVE = 5;        // scale to 0 over 5 frames
export const FRAMES_PER_FALL_CELL = 3;   // Cascade fall: 3 frames per cell distance
const DIP_AMOUNT = 0.14;                 // how far the dragged piece dips (cell units)

export const MIN_CELL_SIZE = 20;
export const MAX_CELL_SIZE = 96;
export const CELL_SIZE_STEP = 6;
const DEFAULT_CELL_SIZE = 52;

const MIN_FPS = 1;
const MAX_FPS = 120;
const DEFAULT_FPS = 30;

export interface CellAnim {
  offsetRow: number;
  offsetCol: number;
  scale: number;
  dip: number;
}

export interface AnimationSegment {
  id: string;
  cellKey: string;
  property: 'offsetRow' | 'offsetCol' | 'scale';
  from: number;
  to: number;
  startFrame: number;
  duration: number;
}

export interface DipSegment {
  id: string;
  cellKey: string;
  startFrame: number;
  duration: number;
}

interface SequencerState {
  // Board selection + gameplay
  boardId: string | null;
  originalLayout: Cell[][];
  grid: Cell[][];
  selected: GridPos | null;
  matched: Set<string>;
  animating: boolean;

  // Frame-locked animation state (free-running counter the RAF loop advances)
  frame: number;
  cellAnims: Record<string, CellAnim>;
  lerpSegments: AnimationSegment[];
  dipSegments: DipSegment[];

  // Recording / variant
  cascadeEnabled: boolean;
  activeVariantId: string | null;
  isReplaying: boolean;

  // View
  cellSize: number;

  // Animation fps (Blender export uses the same value)
  fps: number;

  // Board / gameplay
  setBoardId: (id: string | null) => void;
  loadBoard: (layout: Cell[][]) => void;
  resetBoard: () => void;

  // Drag-based swap entry point
  handleCellMouseDown: (row: number, col: number) => void;
  handleSwapAttempt: (from: GridPos, to: GridPos) => void;
  clearSelected: () => void;

  // Variant + cascade
  setCascadeEnabled: (v: boolean) => void;
  setActiveVariantId: (id: string | null) => void;
  replayActiveVariant: () => void;
  /**
   * Continue-from-here: rewinds the playable grid to the state right after
   * the match at `matchIndex` of the active variant, then truncates every
   * match that came after. New swaps append at position matchIndex + 1.
   */
  continueFromMatch: (matchIndex: number) => void;

  // View
  setCellSize: (size: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setFps: (fps: number) => void;

  // Animation engine internals (called by the frame loop)
  tickFrame: () => void;
}

function clampCellSize(v: number): number {
  return Math.max(MIN_CELL_SIZE, Math.min(MAX_CELL_SIZE, Math.round(v)));
}

function clampFps(v: number): number {
  return Math.max(MIN_FPS, Math.min(MAX_FPS, Math.round(v)));
}

function makeMatchId() {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
}

function makeSegId() {
  return `s_${Math.random().toString(36).slice(2, 8)}`;
}

function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

function emptyCellAnim(): CellAnim {
  return { offsetRow: 0, offsetCol: 0, scale: 1, dip: 0 };
}

function dipValue(t: number, duration: number): number {
  // frame 0: orig y → frame 1: dipped → frame (duration-1): dipped → frame duration: orig y
  if (t <= 0 || t >= duration) return 0;
  if (t >= 1 && t <= duration - 1) {
    if (t < 1 + 0.0001) return -DIP_AMOUNT;
    if (t > duration - 1 - 0.0001) return -DIP_AMOUNT;
    return -DIP_AMOUNT;
  }
  if (t < 1) return -DIP_AMOUNT * t;
  if (t > duration - 1) return -DIP_AMOUNT * (duration - t);
  return 0;
}

function waitFrames(n: number): Promise<void> {
  const targetFrame = useSequencer.getState().frame + n;
  return new Promise((resolve) => {
    const unsub = useSequencer.subscribe((s) => {
      if (s.frame >= targetFrame) {
        unsub();
        resolve();
      }
    });
  });
}

function computeFrameLength(cascadeStepCount: number, fallFramesTotal: number): number {
  return FRAMES_SWAP + cascadeStepCount * FRAMES_DISSOLVE + fallFramesTotal;
}

// ---- Animation helpers that mutate the store directly ----

function addLerpSegment(
  key: string,
  property: AnimationSegment['property'],
  from: number,
  to: number,
  startFrame: number,
  duration: number,
): void {
  const seg: AnimationSegment = {
    id: makeSegId(),
    cellKey: key,
    property,
    from,
    to,
    startFrame,
    duration,
  };
  useSequencer.setState((s) => ({
    lerpSegments: [...s.lerpSegments, seg],
    cellAnims: {
      ...s.cellAnims,
      [key]: { ...(s.cellAnims[key] ?? emptyCellAnim()), [property]: from },
    },
  }));
}

function addDipSegment(key: string, startFrame: number, duration: number): void {
  const seg: DipSegment = { id: makeSegId(), cellKey: key, startFrame, duration };
  useSequencer.setState((s) => ({
    dipSegments: [...s.dipSegments, seg],
    cellAnims: {
      ...s.cellAnims,
      [key]: { ...(s.cellAnims[key] ?? emptyCellAnim()), dip: 0 },
    },
  }));
}

function clearAllAnims() {
  useSequencer.setState({
    cellAnims: {},
    lerpSegments: [],
    dipSegments: [],
  });
}

function lerp(from: number, to: number, t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return from + (to - from) * clamped;
}

// ---- Core orchestration: swap + cascades with frame-accurate animations ----

async function animateSwapPhase(
  prevGrid: Cell[][],
  from: GridPos,
  to: GridPos,
): Promise<void> {
  const state = useSequencer.getState();
  const startFrame = state.frame;
  const fromKey = cellKey(from.row, from.col);
  const toKey = cellKey(to.row, to.col);

  const dr = to.row - from.row;
  const dc = to.col - from.col;

  addLerpSegment(fromKey, 'offsetRow', dr, 0, startFrame, FRAMES_SWAP);
  addLerpSegment(fromKey, 'offsetCol', dc, 0, startFrame, FRAMES_SWAP);
  addLerpSegment(toKey, 'offsetRow', -dr, 0, startFrame, FRAMES_SWAP);
  addLerpSegment(toKey, 'offsetCol', -dc, 0, startFrame, FRAMES_SWAP);
  addDipSegment(toKey, startFrame, FRAMES_SWAP);

  useSequencer.setState({ grid: prevGrid });
  await waitFrames(FRAMES_SWAP);
}

async function animateInvalidSwap(from: GridPos, to: GridPos): Promise<void> {
  const state = useSequencer.getState();
  const startFrame = state.frame;
  const fromKey = cellKey(from.row, from.col);
  const toKey = cellKey(to.row, to.col);
  const dr = to.row - from.row;
  const dc = to.col - from.col;

  addLerpSegment(fromKey, 'offsetRow', 0, dr, startFrame, FRAMES_SWAP);
  addLerpSegment(fromKey, 'offsetCol', 0, dc, startFrame, FRAMES_SWAP);
  addLerpSegment(toKey, 'offsetRow', 0, -dr, startFrame, FRAMES_SWAP);
  addLerpSegment(toKey, 'offsetCol', 0, -dc, startFrame, FRAMES_SWAP);
  addDipSegment(fromKey, startFrame, FRAMES_SWAP);
  await waitFrames(FRAMES_SWAP);

  const mid = useSequencer.getState().frame;
  addLerpSegment(fromKey, 'offsetRow', dr, 0, mid, FRAMES_SWAP);
  addLerpSegment(fromKey, 'offsetCol', dc, 0, mid, FRAMES_SWAP);
  addLerpSegment(toKey, 'offsetRow', -dr, 0, mid, FRAMES_SWAP);
  addLerpSegment(toKey, 'offsetCol', -dc, 0, mid, FRAMES_SWAP);
  await waitFrames(FRAMES_SWAP);
}

async function animateDissolve(matchedCells: Set<string>): Promise<void> {
  const startFrame = useSequencer.getState().frame;
  matchedCells.forEach((k) => {
    addLerpSegment(k, 'scale', 1, 0, startFrame, FRAMES_DISSOLVE);
  });
  await waitFrames(FRAMES_DISSOLVE);
}

async function animateFallAndSpawn(
  beforeGrid: Cell[][],
  afterGrid: Cell[][],
): Promise<number> {
  const { moves, spawns } = computeCascadeDelta(beforeGrid, afterGrid);
  const startFrame = useSequencer.getState().frame;

  let maxDuration = 0;

  for (const m of moves) {
    const dist = Math.abs(m.toRow - m.fromRow);
    const duration = Math.max(1, dist * FRAMES_PER_FALL_CELL);
    maxDuration = Math.max(maxDuration, duration);
    addLerpSegment(
      cellKey(m.toRow, m.col),
      'offsetRow',
      m.fromRow - m.toRow,
      0,
      startFrame,
      duration,
    );
  }

  for (const sp of spawns) {
    const dist = Math.abs(sp.toRow - sp.entryRow);
    const duration = Math.max(1, dist * FRAMES_PER_FALL_CELL);
    maxDuration = Math.max(maxDuration, duration);
    addLerpSegment(
      cellKey(sp.toRow, sp.col),
      'offsetRow',
      sp.entryRow - sp.toRow,
      0,
      startFrame,
      duration,
    );
  }

  if (maxDuration > 0) {
    await waitFrames(maxDuration);
  }
  return maxDuration;
}

/**
 * Appends a recorded match onto the active variant. If no variant is active
 * yet, auto-create "Variant 1" for the active board and make it the target.
 * This powers the auto-commit recording model — drags always land somewhere.
 */
/** Frame duration of an invalid-swap animation (forward 5f + reverse 5f). */
const FRAMES_INVALID = FRAMES_SWAP * 2;

function commitMatchToActiveVariant(
  from: GridPos,
  to: GridPos,
  initialGrid: Cell[][],
  steps: CascadeStep[],
  fallFramesTotal: number,
  kind: MatchKind = 'success',
): void {
  const sequencer = useSequencer.getState();
  const computedLength =
    kind === 'fail'
      ? FRAMES_INVALID
      : computeFrameLength(steps.length, fallFramesTotal);

  // Apply the user's "default match length" setting, clamped to the per-match
  // minimum so the animation always fits.
  const defaultTarget = useSettings.getState().defaultMatchFrames;
  const customFrameLength =
    defaultTarget > 0 && defaultTarget > computedLength
      ? defaultTarget
      : undefined;

  const record: RecordedMatch = {
    id: makeMatchId(),
    initialGrid,
    swap: { from: { ...from }, to: { ...to } },
    cascadeSteps: steps,
    frameLength: computedLength,
    kind,
    ...(customFrameLength !== undefined ? { customFrameLength } : {}),
  };

  const variants = useVariants.getState();
  let targetId = sequencer.activeVariantId;

  if (!targetId) {
    const scoped = variants.variants.filter((v) => v.boardId === sequencer.boardId);
    const name = `Variant ${scoped.length + 1}`;
    targetId = variants.createEmptyVariant(name, sequencer.boardId);
    useSequencer.setState({ activeVariantId: targetId });
  }

  useVariants.getState().appendMatchToVariant(targetId, record);
}

async function processSwap(from: GridPos, to: GridPos): Promise<void> {
  const startState = useSequencer.getState();
  const initialGrid = startState.grid.map((r) => r.slice());
  const swapped = swapCells(initialGrid, from.row, from.col, to.row, to.col);
  const firstMatches = findMatches(swapped);

  useSequencer.setState({ selected: null, animating: true });

  if (firstMatches.size === 0) {
    // Invalid swap: record it as a fail and play only the bounce animation
    // (forward 5f + reverse 5f). Grid stays at initialGrid the whole time.
    await animateInvalidSwap(from, to);
    clearAllAnims();
    commitMatchToActiveVariant(from, to, initialGrid, [], 0, 'fail');
    useSequencer.setState({ animating: false });
    return;
  }

  await animateSwapPhase(swapped, from, to);

  const steps: CascadeStep[] = [];
  let currentGrid = swapped;
  let matches = firstMatches;
  let fallFramesTotal = 0;
  let safety = 0;
  const cascadeEnabled = startState.cascadeEnabled;

  while (matches.size > 0 && safety++ < 50) {
    await animateDissolve(matches);

    const afterRemove = removeMatched(currentGrid, matches);
    const afterCascade = cascadeEnabled
      ? applyGravityAndSpawn(afterRemove)
      : afterRemove;

    steps.push({
      matched: Array.from(matches),
      gridAfterCascade: afterCascade.map((r) => r.slice()),
    });

    useSequencer.setState({ grid: afterCascade, matched: new Set<string>() });

    if (cascadeEnabled) {
      const fallFrames = await animateFallAndSpawn(afterRemove, afterCascade);
      fallFramesTotal += fallFrames;
    }

    clearAllAnims();

    currentGrid = afterCascade;
    matches = cascadeEnabled ? findMatches(currentGrid) : new Set<string>();
    if (matches.size > 0) {
      useSequencer.setState({ matched: matches });
    }
  }

  commitMatchToActiveVariant(from, to, initialGrid, steps, fallFramesTotal);

  useSequencer.setState({
    grid: currentGrid,
    matched: new Set<string>(),
    animating: false,
  });
  clearAllAnims();
}

async function replayActive(): Promise<void> {
  const { activeVariantId } = useSequencer.getState();
  if (!activeVariantId) return;
  const variant = useVariants
    .getState()
    .variants.find((v) => v.id === activeVariantId);
  if (!variant || variant.matches.length === 0) return;

  useSequencer.setState({
    animating: true,
    isReplaying: true,
    selected: null,
    matched: new Set<string>(),
  });

  for (const match of variant.matches) {
    const initialGrid = match.initialGrid.map((r) => r.slice());
    useSequencer.setState({ grid: initialGrid });
    clearAllAnims();

    // Inter-match pause (6 frames @ 30fps ≈ 200ms)
    await waitFrames(6);

    if (match.kind === 'fail') {
      // Failed swap: wobble out and back without changing the grid.
      await animateInvalidSwap(match.swap.from, match.swap.to);
      clearAllAnims();
      const customPad =
        match.customFrameLength !== undefined
          ? Math.max(0, match.customFrameLength - match.frameLength)
          : 0;
      if (customPad > 0) await waitFrames(customPad);
      continue;
    }

    const swapped = swapCells(
      initialGrid,
      match.swap.from.row,
      match.swap.from.col,
      match.swap.to.row,
      match.swap.to.col,
    );
    await animateSwapPhase(swapped, match.swap.from, match.swap.to);
    useSequencer.setState({ grid: swapped });

    let prev = swapped;
    for (const step of match.cascadeSteps) {
      const matchedSet = new Set(step.matched);
      useSequencer.setState({ matched: matchedSet });
      await animateDissolve(matchedSet);

      const postDissolve: Cell[][] = prev.map((row, r) =>
        row.map((cell, c) =>
          matchedSet.has(`${r}:${c}`) ? null : cell,
        ),
      );

      const afterCascade = step.gridAfterCascade.map((r) => r.slice());
      useSequencer.setState({ grid: afterCascade, matched: new Set<string>() });
      // If the step was recorded with cascade disabled, gridAfterCascade keeps
      // holes where matches dissolved (gravity + spawn never ran). Skip the
      // fall animation in that case — otherwise computeCascadeDelta assumes a
      // bottom-packed layout and fakes move/spawn lerps for stationary tiles.
      const cascadeWasApplied = afterCascade.every((row) =>
        row.every((cell) => cell !== null),
      );
      if (cascadeWasApplied) {
        await animateFallAndSpawn(postDissolve, afterCascade);
      }
      clearAllAnims();
      prev = afterCascade;
    }

    // Honor per-match custom duration by holding the final state a bit longer.
    const customPad =
      match.customFrameLength !== undefined
        ? Math.max(0, match.customFrameLength - match.frameLength)
        : 0;
    if (customPad > 0) await waitFrames(customPad);
  }

  useSequencer.setState({ animating: false, isReplaying: false });
  clearAllAnims();
}

export const useSequencer = create<SequencerState>((set, get) => ({
  boardId: null,
  originalLayout: [],
  grid: [],
  selected: null,
  matched: new Set<string>(),
  animating: false,

  frame: 0,
  cellAnims: {},
  lerpSegments: [],
  dipSegments: [],

  cascadeEnabled: false,
  activeVariantId: null,
  isReplaying: false,

  cellSize: DEFAULT_CELL_SIZE,
  fps: DEFAULT_FPS,

  setBoardId: (id) => set({ boardId: id, activeVariantId: null }),

  loadBoard: (layout) => {
    const snapshot = layout.map((r) => r.slice());
    const fresh = initializeGrid(layout);
    set({
      originalLayout: snapshot,
      grid: fresh,
      selected: null,
      matched: new Set<string>(),
      animating: false,
      cellAnims: {},
      lerpSegments: [],
      dipSegments: [],
    });
  },

  resetBoard: () => {
    const { originalLayout } = get();
    if (originalLayout.length === 0) return;
    const fresh = initializeGrid(originalLayout);
    set({
      grid: fresh,
      selected: null,
      matched: new Set<string>(),
      animating: false,
      cellAnims: {},
      lerpSegments: [],
      dipSegments: [],
    });
  },

  handleCellMouseDown: (row, col) => {
    const s = get();
    if (s.animating) return;
    const cell = s.grid[row]?.[col] ?? null;
    if (cell === null) return;
    set({ selected: { row, col } });
  },

  handleSwapAttempt: (from, to) => {
    const s = get();
    if (s.animating) return;
    if (!isAdjacent(from, to)) {
      set({ selected: null });
      return;
    }
    const fromCell = s.grid[from.row]?.[from.col] ?? null;
    const toCell = s.grid[to.row]?.[to.col] ?? null;
    if (fromCell === null || toCell === null) {
      set({ selected: null });
      return;
    }
    void processSwap(from, to);
  },

  clearSelected: () => set({ selected: null }),

  setCascadeEnabled: (cascadeEnabled) => set({ cascadeEnabled }),
  setActiveVariantId: (id) => set({ activeVariantId: id }),
  replayActiveVariant: () => {
    void replayActive();
  },

  continueFromMatch: (matchIndex) => {
    const s = get();
    if (s.animating) return;
    const variantId = s.activeVariantId;
    if (!variantId) return;
    const variant = useVariants.getState().variants.find((v) => v.id === variantId);
    if (!variant) return;
    const match = variant.matches[matchIndex];
    if (!match) return;
    const lastStep = match.cascadeSteps[match.cascadeSteps.length - 1];
    const finalGrid = lastStep
      ? lastStep.gridAfterCascade.map((r) => r.slice())
      : match.initialGrid.map((r) => r.slice());
    useVariants.getState().truncateMatchesAfter(variantId, matchIndex);
    set({
      grid: finalGrid,
      selected: null,
      matched: new Set<string>(),
      cellAnims: {},
      lerpSegments: [],
      dipSegments: [],
    });
  },

  setCellSize: (size) => set({ cellSize: clampCellSize(size) }),
  zoomIn: () => set((s) => ({ cellSize: clampCellSize(s.cellSize + CELL_SIZE_STEP) })),
  zoomOut: () => set((s) => ({ cellSize: clampCellSize(s.cellSize - CELL_SIZE_STEP) })),

  setFps: (fps) => set({ fps: clampFps(fps) }),

  tickFrame: () => {
    const s = get();
    const nextFrame = s.frame + 1;
    const anims: Record<string, CellAnim> = {};

    for (const key of Object.keys(s.cellAnims)) {
      anims[key] = { ...s.cellAnims[key]! };
    }

    const keepLerps: AnimationSegment[] = [];
    for (const seg of s.lerpSegments) {
      const t = (nextFrame - seg.startFrame) / seg.duration;
      const value = lerp(seg.from, seg.to, t);
      const cell = anims[seg.cellKey] ?? emptyCellAnim();
      anims[seg.cellKey] = { ...cell, [seg.property]: value };
      if (nextFrame < seg.startFrame + seg.duration) {
        keepLerps.push(seg);
      } else {
        anims[seg.cellKey] = { ...anims[seg.cellKey]!, [seg.property]: seg.to };
      }
    }

    const keepDips: DipSegment[] = [];
    for (const seg of s.dipSegments) {
      const t = nextFrame - seg.startFrame;
      const value = dipValue(t, seg.duration);
      const cell = anims[seg.cellKey] ?? emptyCellAnim();
      anims[seg.cellKey] = { ...cell, dip: value };
      if (nextFrame < seg.startFrame + seg.duration) {
        keepDips.push(seg);
      } else {
        anims[seg.cellKey] = { ...anims[seg.cellKey]!, dip: 0 };
      }
    }

    set({
      frame: nextFrame,
      cellAnims: anims,
      lerpSegments: keepLerps,
      dipSegments: keepDips,
    });
  },
}));
