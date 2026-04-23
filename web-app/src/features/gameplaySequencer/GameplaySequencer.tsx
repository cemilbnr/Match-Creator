import { useCallback, useEffect, useMemo, useRef } from 'react';
import { BoardView } from '../../components/BoardView';
import {
  RefreshIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from '../../components/icons';
import { IconButton, PageHeader } from '../../components/ui';
import { useLibrary } from '../../store/libraryStore';
import {
  MAX_CELL_SIZE,
  MIN_CELL_SIZE,
  useSequencer,
  type GridPos,
} from '../../store/sequencerStore';
import { useUI } from '../../store/uiStore';
import { useVariants } from '../../store/variantsStore';
import { BoardSwitcher } from './BoardSwitcher';
import { MatchStrip } from './MatchStrip';
import { SequencerRightRail } from './SequencerRightRail';
import { SequencerSettingsMenu } from './SequencerSettingsMenu';
import { useAnimationLoop } from './useAnimationLoop';

const DRAG_THRESHOLD_PX = 10;

export function GameplaySequencer() {
  const boards = useLibrary((s) => s.boards);
  const boardId = useSequencer((s) => s.boardId);
  const setBoardId = useSequencer((s) => s.setBoardId);
  const loadBoard = useSequencer((s) => s.loadBoard);
  const resetBoard = useSequencer((s) => s.resetBoard);

  const grid = useSequencer((s) => s.grid);
  const selected = useSequencer((s) => s.selected);
  const matched = useSequencer((s) => s.matched);
  const animating = useSequencer((s) => s.animating);
  const cellAnims = useSequencer((s) => s.cellAnims);
  const handleCellMouseDown = useSequencer((s) => s.handleCellMouseDown);
  const handleSwapAttempt = useSequencer((s) => s.handleSwapAttempt);
  const clearSelected = useSequencer((s) => s.clearSelected);
  const replayActive = useSequencer((s) => s.replayActiveVariant);

  const activeVariantId = useSequencer((s) => s.activeVariantId);
  const setActiveVariantId = useSequencer((s) => s.setActiveVariantId);
  const cellSize = useSequencer((s) => s.cellSize);
  const zoomIn = useSequencer((s) => s.zoomIn);
  const zoomOut = useSequencer((s) => s.zoomOut);
  const fps = useSequencer((s) => s.fps);
  const setFps = useSequencer((s) => s.setFps);

  const variants = useVariants((s) => s.variants);
  const setPanel = useUI((s) => s.setPanel);

  const board = useMemo(
    () => boards.find((b) => b.id === boardId) ?? null,
    [boards, boardId],
  );

  // Default board selection: newest saved board once boards exist.
  useEffect(() => {
    if (boardId !== null) return;
    if (boards.length === 0) return;
    const newest = [...boards].sort((a, b) => b.updatedAt - a.updatedAt)[0]!;
    setBoardId(newest.id);
  }, [boardId, boards, setBoardId]);

  useEffect(() => {
    if (!board) return;
    loadBoard(board.layout);
  }, [board?.id, loadBoard]); // eslint-disable-line react-hooks/exhaustive-deps

  // Default variant: most recent for the active board. Auto-commit creates one
  // on the first drag if none exists, so we only pick one here if there's a
  // candidate already.
  useEffect(() => {
    if (!boardId) return;
    const scoped = variants
      .filter((v) => v.boardId === boardId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    if (scoped.length === 0) {
      if (activeVariantId !== null) setActiveVariantId(null);
      return;
    }
    const stillValid = scoped.some((v) => v.id === activeVariantId);
    if (!stillValid) setActiveVariantId(scoped[0]!.id);
  }, [boardId, variants, activeVariantId, setActiveVariantId]);

  useAnimationLoop();

  // Space = play. Ignore while typing in inputs or during animations.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      )
        return;
      if (animating) return;
      e.preventDefault();
      replayActive();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [animating, replayActive]);

  // ---- Drag-to-swap ----
  const dragRef = useRef<{
    from: GridPos;
    x: number;
    y: number;
    fired: boolean;
  } | null>(null);

  const onCellMouseDown = useCallback(
    (row: number, col: number, e: React.MouseEvent) => {
      if (animating) return;
      if (e.button !== 0) return;
      handleCellMouseDown(row, col);
      dragRef.current = { from: { row, col }, x: e.clientX, y: e.clientY, fired: false };

      const onMove = (ev: MouseEvent) => {
        const d = dragRef.current;
        if (!d || d.fired) return;
        const dx = ev.clientX - d.x;
        const dy = ev.clientY - d.y;
        if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return;
        let dr = 0;
        let dc = 0;
        if (Math.abs(dx) > Math.abs(dy)) dc = dx > 0 ? 1 : -1;
        else dr = dy > 0 ? 1 : -1;
        const to: GridPos = { row: d.from.row + dr, col: d.from.col + dc };
        d.fired = true;
        handleSwapAttempt(d.from, to);
        cleanup();
      };

      const onUp = () => {
        const d = dragRef.current;
        if (d && !d.fired) clearSelected();
        cleanup();
      };

      function cleanup() {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        dragRef.current = null;
      }

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [animating, handleCellMouseDown, handleSwapAttempt, clearSelected],
  );

  const canZoomIn = cellSize < MAX_CELL_SIZE;
  const canZoomOut = cellSize > MIN_CELL_SIZE;

  const activeVariantName = useMemo(
    () => variants.find((v) => v.id === activeVariantId)?.name ?? null,
    [variants, activeVariantId],
  );
  const title = board
    ? activeVariantName
      ? `${board.name} · ${activeVariantName}`
      : board.name
    : 'Gameplay Sequencer';
  const subtitle = board
    ? 'Hold and drag a piece to swap. Valid matches are recorded automatically.'
    : boards.length === 0
      ? 'Design a board first to start recording gameplay.'
      : 'Pick a board to start.';

  const headerActions = board ? (
    <>
      <BoardSwitcher />

      <div className="mx-1 h-6 w-px bg-neutral-800" />

      <label className="flex items-center gap-1.5 text-[11px] text-neutral-500">
        FPS
        <input
          type="number"
          min={1}
          max={120}
          value={fps}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) setFps(v);
          }}
          className="h-9 w-16 rounded-md border border-neutral-800 bg-neutral-950 px-2 text-sm text-neutral-100 focus:border-neutral-500 focus:outline-none"
        />
      </label>

      <div className="flex items-center rounded-md border border-neutral-800 bg-neutral-950">
        <IconButton size="sm" onClick={zoomOut} disabled={!canZoomOut} title="Zoom out">
          <ZoomOutIcon />
        </IconButton>
        <div className="min-w-8 text-center text-[11px] tabular-nums text-neutral-500">
          {cellSize}
        </div>
        <IconButton size="sm" onClick={zoomIn} disabled={!canZoomIn} title="Zoom in">
          <ZoomInIcon />
        </IconButton>
      </div>

      <IconButton onClick={resetBoard} disabled={animating} title="Reset board to saved layout">
        <RefreshIcon />
      </IconButton>

      <SequencerSettingsMenu />
    </>
  ) : null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader eyebrow="Record" title={title} subtitle={subtitle} actions={headerActions} />

      {!board ? (
        <EmptyState
          hasBoards={boards.length > 0}
          onGoToGenerator={() => setPanel('board-generator')}
        />
      ) : (
        <>
          <section className="grid flex-1 grid-cols-[1fr_260px] overflow-hidden">
            <div className="flex items-center justify-center overflow-auto bg-neutral-975 p-6">
              {grid.length > 0 && (
                <BoardView
                  width={board.width}
                  height={board.height}
                  layout={grid}
                  cellSize={cellSize}
                  gap={Math.max(2, Math.round(cellSize / 14))}
                  selectedCell={selected}
                  matchedCells={matched}
                  cellAnims={cellAnims}
                  onCellMouseDown={onCellMouseDown}
                  disabled={animating}
                />
              )}
            </div>

            <aside className="border-l border-neutral-800 bg-neutral-925">
              <SequencerRightRail />
            </aside>
          </section>

          <footer className="border-t border-neutral-800 bg-neutral-950">
            <MatchStrip />
          </footer>
        </>
      )}
    </div>
  );
}

function EmptyState({
  hasBoards,
  onGoToGenerator,
}: {
  hasBoards: boolean;
  onGoToGenerator: () => void;
}) {
  const boards = useLibrary((s) => s.boards);
  const setBoardId = useSequencer((s) => s.setBoardId);

  if (!hasBoards) {
    return (
      <div className="flex flex-1 items-center justify-center bg-neutral-975 p-8">
        <div className="max-w-md rounded-lg border border-neutral-800 bg-neutral-925 p-8 text-center">
          <div className="text-base font-semibold text-neutral-50">You need a board first</div>
          <p className="mt-2 text-sm text-neutral-500">
            Paint a match-3 board, save it, then come back here to record the gameplay
            sequence.
          </p>
          <button
            type="button"
            onClick={onGoToGenerator}
            className="mt-4 h-9 rounded-md bg-neutral-100 px-4 text-sm font-medium text-neutral-900 transition hover:bg-white"
          >
            Open Board Generator
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-neutral-975 p-8">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-neutral-800 bg-neutral-925 p-8 text-center">
        <div className="text-base font-semibold text-neutral-50">
          Start by selecting a board
        </div>
        <p className="text-sm text-neutral-500">Pick the board you want to record gameplay on.</p>
        <select
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) setBoardId(e.target.value);
          }}
          className="h-10 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 focus:border-neutral-500 focus:outline-none"
        >
          <option value="" disabled>
            Select a board…
          </option>
          {[...boards]
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.width}×{b.height})
              </option>
            ))}
        </select>
        <div className="text-[11px] text-neutral-600">
          Or design another one in{' '}
          <button
            type="button"
            onClick={onGoToGenerator}
            className="text-neutral-300 underline-offset-2 hover:text-neutral-100 hover:underline"
          >
            Board Generator
          </button>
          .
        </div>
      </div>
    </div>
  );
}
