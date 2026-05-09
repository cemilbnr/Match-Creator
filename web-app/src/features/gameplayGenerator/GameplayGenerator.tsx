import { useCallback, useEffect, useMemo, useRef } from 'react';
import { BoardView } from '../../components/BoardView';
import { ZoomInIcon, ZoomOutIcon } from '../../components/icons';
import { IconButton, PageHeader } from '../../components/ui';
import { useGameplayGenerator } from '../../store/gameplayGeneratorStore';
import {
  MAX_CELL_SIZE,
  MIN_CELL_SIZE,
} from '../../store/sequencerStore';
import { GeneratorRightRail } from './GeneratorRightRail';
import { PathOverlay } from './PathOverlay';
import { eventToCoord } from './pathInteraction';
import { computePlacements } from './placement';
import { PreviewTimeline } from './PreviewTimeline';
import { emptyLayout } from './generator';

export function GameplayGenerator() {
  const width = useGameplayGenerator((s) => s.width);
  const height = useGameplayGenerator((s) => s.height);
  const matchCount = useGameplayGenerator((s) => s.matchCount);
  const pathThickness = useGameplayGenerator((s) => s.pathThickness);
  const probabilities = useGameplayGenerator((s) => s.probabilities);
  const secondaryMatchProbability = useGameplayGenerator(
    (s) => s.secondaryMatchProbability,
  );
  const seed = useGameplayGenerator((s) => s.seed);
  const paths = useGameplayGenerator((s) => s.paths);
  const mode = useGameplayGenerator((s) => s.mode);
  const cellSize = useGameplayGenerator((s) => s.cellSize);
  const previewMatches = useGameplayGenerator((s) => s.previewMatches);
  const previewStartingGrid = useGameplayGenerator((s) => s.previewStartingGrid);
  const previewSecondaryStats = useGameplayGenerator(
    (s) => s.previewSecondaryStats,
  );
  const playbackGrid = useGameplayGenerator((s) => s.playbackGrid);
  const playbackMatched = useGameplayGenerator((s) => s.playbackMatched);
  const playbackIndex = useGameplayGenerator((s) => s.playbackIndex);
  const playbackAnimating = useGameplayGenerator((s) => s.playbackAnimating);

  const setMode = useGameplayGenerator((s) => s.setMode);
  const appendPathPoint = useGameplayGenerator((s) => s.appendPathPoint);
  const beginNewPath = useGameplayGenerator((s) => s.beginNewPath);
  const zoomIn = useGameplayGenerator((s) => s.zoomIn);
  const zoomOut = useGameplayGenerator((s) => s.zoomOut);
  const stepForward = useGameplayGenerator((s) => s.stepForward);
  const stepBackward = useGameplayGenerator((s) => s.stepBackward);
  const cancelAutoplay = useGameplayGenerator((s) => s.cancelAutoplay);

  // Placements are derived from paths in real-time so the overlay updates
  // live as the user draws. computePlacements is cheap for paths of typical
  // length; keep this in component scope (not a store field) so we don't
  // need to keep a stored copy in sync.
  const placements = useMemo(
    () =>
      computePlacements({
        paths,
        gridWidth: width,
        gridHeight: height,
        maxCount: matchCount,
        thickness: pathThickness,
        probabilities,
        seed: seed ?? undefined,
        secondaryMatchProbability,
      }),
    [
      paths,
      width,
      height,
      matchCount,
      pathThickness,
      probabilities,
      seed,
      secondaryMatchProbability,
    ],
  );

  // Esc cancels draw-path mode.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      if (mode === 'draw-path') {
        e.preventDefault();
        setMode('idle');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, setMode]);

  // Arrow-key playback (only meaningful once a preview exists).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'ArrowLeft' && e.code !== 'ArrowRight') return;
      const target = e.target as HTMLElement | null;
      const inField =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      if (inField) return;
      if (previewMatches.length === 0) return;
      e.preventDefault();
      // Manual nav always cancels an in-flight autoplay so the user takes
      // over instantly from wherever the auto-walk reached.
      cancelAutoplay();
      if (e.code === 'ArrowRight') stepForward();
      else stepBackward();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewMatches.length, stepForward, stepBackward, cancelAutoplay]);

  const gap = Math.max(2, Math.round(cellSize / 14));
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const isDrawingRef = useRef(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (mode !== 'draw-path') return;
      if (e.button !== 0) return;
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cell = eventToCoord(e, rect, cellSize, gap, width, height);
      if (!cell) return;
      if (isDrawingRef.current) {
        beginNewPath();
      } else {
        const state = useGameplayGenerator.getState();
        const last = state.paths[state.paths.length - 1] ?? [];
        if (last.length > 0) beginNewPath();
      }
      appendPathPoint(cell);
      isDrawingRef.current = true;
      try {
        (e.target as Element).setPointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [mode, cellSize, gap, width, height, appendPathPoint, beginNewPath],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (mode !== 'draw-path') return;
      if (e.buttons === 0) return;
      if (!isDrawingRef.current) return;
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cell = eventToCoord(e, rect, cellSize, gap, width, height);
      if (cell) appendPathPoint(cell);
    },
    [mode, cellSize, gap, width, height, appendPathPoint],
  );

  const onPointerUp = useCallback(() => {
    isDrawingRef.current = false;
  }, []);

  const canZoomIn = cellSize < MAX_CELL_SIZE;
  const canZoomOut = cellSize > MIN_CELL_SIZE;

  // Display priority: live playback > generated starting grid > empty board.
  const baseLayout = useMemo(
    () => previewStartingGrid ?? emptyLayout(width, height),
    [previewStartingGrid, width, height],
  );
  const displayGrid = playbackGrid ?? baseLayout;
  const displayMatched = useMemo(
    () => new Set(playbackMatched),
    [playbackMatched],
  );

  // Hide overlay during preview playback so the cells animate cleanly.
  const showOverlay = previewMatches.length === 0 || playbackIndex === -1;

  const headerActions = (
    <>
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
    </>
  );

  const subtitle =
    mode === 'draw-path'
      ? 'Click and drag to draw paths. Match shapes appear live along your strokes. Esc to exit drawing.'
      : previewMatches.length > 0
        ? `Use ←/→ to step through preview · ${
            playbackIndex < 0 ? 'start' : `match ${playbackIndex + 1}/${previewMatches.length}`
          }${playbackAnimating ? ' · animating…' : ''}`
        : placements.length > 0
          ? `${placements.length} match${placements.length === 1 ? '' : 'es'} planned. Click Generate to fill the surrounding tiles.`
          : 'Draw a path on the empty board — match shapes are placed for you. Click Generate when ready.';

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* WIP banner — Gameplay Generator is still in active development.
          Some outputs (especially with secondary matches on dense boards)
          may behave unexpectedly. Banner stays visible until the feature
          stabilises. */}
      <div className="flex shrink-0 items-center gap-2 border-b border-amber-700/50 bg-amber-500/15 px-6 py-1.5 text-[11px] text-amber-200">
        <span className="rounded-sm bg-amber-500/30 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100">
          WIP
        </span>
        <span>
          Gameplay Generator is work in progress — algorithm and UI may
          change. Outputs on dense boards or with high secondary slider
          values can still produce unexpected matches.
        </span>
      </div>

      <PageHeader
        eyebrow="Generate"
        title="Gameplay Generator"
        subtitle={subtitle}
        actions={headerActions}
      />

      <section className="grid min-h-0 flex-1 grid-cols-[320px_1fr] overflow-hidden">
        <aside className="flex min-h-0 flex-col overflow-hidden border-r border-neutral-800 bg-neutral-925">
          <GeneratorRightRail />
        </aside>

        <div className="flex items-center justify-center overflow-auto bg-neutral-975 p-6">
          {displayGrid.length > 0 && (
            <div
              ref={wrapperRef}
              className={`relative inline-block ${
                mode === 'draw-path' ? 'cursor-crosshair' : ''
              }`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <BoardView
                width={width}
                height={height}
                layout={displayGrid}
                cellSize={cellSize}
                gap={gap}
                matchedCells={displayMatched}
                disabled
              />
              {showOverlay && (
                <PathOverlay
                  paths={paths}
                  placements={placements}
                  gridWidth={width}
                  gridHeight={height}
                  cellSize={cellSize}
                  gap={gap}
                  pathThickness={pathThickness}
                  secondaryCells={previewSecondaryStats.cells}
                />
              )}
            </div>
          )}
        </div>
      </section>

      {previewMatches.length > 0 && (
        <footer className="border-t border-neutral-800 bg-neutral-950">
          <PreviewTimeline />
        </footer>
      )}
    </div>
  );
}
