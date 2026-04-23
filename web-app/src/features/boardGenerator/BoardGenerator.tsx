import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDownIcon,
  PlusIcon,
  SaveIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from '../../components/icons';
import { Button, IconButton, PageHeader, Pill } from '../../components/ui';
import { useLibrary } from '../../store/libraryStore';
import { useUI } from '../../store/uiStore';
import {
  DEFAULT_BOARD_HEIGHT,
  DEFAULT_BOARD_WIDTH,
  MAX_BOARD_SIDE,
  MIN_BOARD_SIDE,
  type Board,
  type Cell,
  type PieceColor,
} from '../../types';
import { BoardPreferences } from './BoardPreferences';
import { BrushPanel } from './BrushPanel';
import { GridCanvas } from './GridCanvas';
import { useBrushControls } from './useBrushControls';

function emptyLayout(width: number, height: number): Cell[][] {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => null),
  );
}

function clampSide(v: number): number {
  if (!Number.isFinite(v)) return MIN_BOARD_SIDE;
  return Math.max(MIN_BOARD_SIDE, Math.min(MAX_BOARD_SIDE, Math.floor(v)));
}

function resizeLayout(layout: Cell[][], width: number, height: number): Cell[][] {
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

// Cell-size zoom bounds for the generator (mirrors the sequencer for consistency).
const MIN_GEN_CELL = 20;
const MAX_GEN_CELL = 64;
const GEN_CELL_STEP = 6;

export function BoardGenerator() {
  const { brush, shiftHeld, setBrush } = useBrushControls('red');
  const savedBoards = useLibrary((s) => s.boards);
  const saveBoard = useLibrary((s) => s.saveBoard);
  const pendingBoardId = useUI((s) => s.pendingBoardId);
  const clearPendingBoard = useUI((s) => s.clearPendingBoard);

  const [boardId, setBoardId] = useState<string>(() => newId());
  const [name, setName] = useState('Board 1');
  const [width, setWidth] = useState(DEFAULT_BOARD_WIDTH);
  const [height, setHeight] = useState(DEFAULT_BOARD_HEIGHT);
  const [tileSet] = useState('default');
  const [layout, setLayout] = useState<Cell[][]>(() =>
    emptyLayout(DEFAULT_BOARD_WIDTH, DEFAULT_BOARD_HEIGHT),
  );
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [cellSize, setCellSize] = useState(32);

  const loadBoard = useCallback((board: Board) => {
    setBoardId(board.id);
    setName(board.name);
    setWidth(board.width);
    setHeight(board.height);
    setLayout(board.layout.map((row) => row.slice()));
    setSavedAt(null);
  }, []);

  const onLoadBoardById = useCallback(
    (id: string) => {
      const b = useLibrary.getState().boards.find((x) => x.id === id);
      if (b) loadBoard(b);
    },
    [loadBoard],
  );

  useEffect(() => {
    if (!pendingBoardId) return;
    const b = useLibrary.getState().boards.find((x) => x.id === pendingBoardId);
    if (b) loadBoard(b);
    clearPendingBoard();
  }, [pendingBoardId, clearPendingBoard, loadBoard]);

  const updateWidth = useCallback(
    (w: number) => {
      const next = clampSide(w);
      setWidth(next);
      setLayout((prev) => resizeLayout(prev, next, height));
    },
    [height],
  );

  const updateHeight = useCallback(
    (h: number) => {
      const next = clampSide(h);
      setHeight(next);
      setLayout((prev) => resizeLayout(prev, width, next));
    },
    [width],
  );

  const paint = useCallback((row: number, col: number, value: Cell) => {
    setLayout((prev) => {
      if (!prev[row] || prev[row]![col] === value) return prev;
      const next = prev.map((r) => r.slice());
      next[row]![col] = value;
      return next;
    });
  }, []);

  const onClear = useCallback(() => {
    setLayout(emptyLayout(width, height));
  }, [width, height]);

  const eraseColor = useCallback((color: PieceColor) => {
    setLayout((prev) => {
      let changed = false;
      const next = prev.map((row) =>
        row.map((c) => {
          if (c === color) {
            changed = true;
            return null;
          }
          return c;
        }),
      );
      return changed ? next : prev;
    });
  }, []);

  const replaceColor = useCallback((from: PieceColor, to: PieceColor) => {
    if (from === to) return;
    setLayout((prev) => {
      let changed = false;
      const next = prev.map((row) =>
        row.map((c) => {
          if (c === from) {
            changed = true;
            return to;
          }
          return c;
        }),
      );
      return changed ? next : prev;
    });
  }, []);

  const fillEmpty = useCallback(() => {
    if (brush === 'eraser') return;
    setLayout((prev) => {
      let changed = false;
      const next = prev.map((row) =>
        row.map((c) => {
          if (c === null) {
            changed = true;
            return brush;
          }
          return c;
        }),
      );
      return changed ? next : prev;
    });
  }, [brush]);

  const onSave = useCallback(() => {
    const board: Board = {
      id: boardId,
      name: name.trim() || 'Untitled',
      width,
      height,
      tileSet,
      layout,
      createdAt: 0,
      updatedAt: 0,
    };
    saveBoard(board);
    setSavedAt(Date.now());
  }, [boardId, name, width, height, tileSet, layout, saveBoard]);

  const onSaveAs = useCallback(() => {
    const suggested = `${name.trim() || 'Untitled'} copy`;
    const next = window.prompt('Save as — new board name', suggested);
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed) return;
    const freshId = newId();
    const board: Board = {
      id: freshId,
      name: trimmed,
      width,
      height,
      tileSet,
      layout,
      createdAt: 0,
      updatedAt: 0,
    };
    saveBoard(board);
    // Become the new board for further editing.
    setBoardId(freshId);
    setName(trimmed);
    setSavedAt(Date.now());
  }, [name, width, height, tileSet, layout, saveBoard]);

  const onNew = useCallback(() => {
    setBoardId(newId());
    setName(`Board ${savedBoards.length + 1}`);
    setWidth(DEFAULT_BOARD_WIDTH);
    setHeight(DEFAULT_BOARD_HEIGHT);
    setLayout(emptyLayout(DEFAULT_BOARD_WIDTH, DEFAULT_BOARD_HEIGHT));
    setSavedAt(null);
  }, [savedBoards.length]);

  const savedRecently = useMemo(
    () => savedAt !== null && Date.now() - savedAt < 3000,
    [savedAt],
  );

  const canZoomIn = cellSize < MAX_GEN_CELL;
  const canZoomOut = cellSize > MIN_GEN_CELL;
  const zoomIn = () =>
    setCellSize((s) => Math.min(MAX_GEN_CELL, s + GEN_CELL_STEP));
  const zoomOut = () =>
    setCellSize((s) => Math.max(MIN_GEN_CELL, s - GEN_CELL_STEP));

  // ---- Ctrl+F = fill empty cells with the active brush ----
  // Fresh ref so the keydown handler always uses the latest closure.
  const fillEmptyRef = useRef(fillEmpty);
  fillEmptyRef.current = fillEmpty;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() !== 'f') return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      )
        return;
      e.preventDefault();
      fillEmptyRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        eyebrow="Design"
        title={name || 'Untitled'}
        subtitle={`${width} × ${height} · paint with the brush panel, drag to sweep.`}
        actions={
          <>
            {savedRecently && <Pill tone="success">Saved to library</Pill>}

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

            <Button variant="secondary" leading={<PlusIcon />} onClick={onNew}>
              New
            </Button>
            <SaveSplitButton onSave={onSave} onSaveAs={onSaveAs} />
          </>
        }
      />

      <div className="grid flex-1 grid-cols-[14rem_1fr_18rem] gap-4 overflow-hidden p-4">
        <aside className="overflow-y-auto pr-1">
          <BrushPanel
            brush={brush}
            shiftHeld={shiftHeld}
            onSelect={setBrush}
            onFillEmpty={fillEmpty}
          />
        </aside>

        <section className="flex items-start justify-center overflow-auto rounded-lg border border-neutral-800 bg-neutral-950">
          <div className="flex min-h-full items-center p-6">
            <GridCanvas
              width={width}
              height={height}
              layout={layout}
              brush={brush}
              shiftHeld={shiftHeld}
              cellSize={cellSize}
              onPaint={paint}
              onEraseColor={eraseColor}
              onReplaceColor={replaceColor}
            />
          </div>
        </section>

        <aside className="overflow-y-auto pl-1">
          <BoardPreferences
            savedBoards={savedBoards}
            currentBoardId={boardId}
            onLoadBoard={onLoadBoardById}
            name={name}
            width={width}
            height={height}
            onNameChange={setName}
            onWidthChange={updateWidth}
            onHeightChange={updateHeight}
            onClear={onClear}
            tileSet={tileSet}
          />
        </aside>
      </div>
    </div>
  );
}

// ---------- SaveSplitButton -----------------------------------------------

function SaveSplitButton({
  onSave,
  onSaveAs,
}: {
  onSave: () => void;
  onSaveAs: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative inline-flex">
      <button
        type="button"
        onClick={onSave}
        className="inline-flex h-9 items-center gap-2 rounded-l-md bg-neutral-100 px-3.5 text-sm font-semibold text-neutral-900 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
        title="Save (overwrite current board)"
      >
        <SaveIcon />
        Save
      </button>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 w-7 items-center justify-center rounded-r-md border-l border-neutral-300 bg-neutral-100 text-neutral-900 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
        title="More save options"
        aria-expanded={open}
      >
        <ChevronDownIcon />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+4px)] z-30 w-44 rounded-md border border-neutral-700 bg-neutral-900 p-1 shadow-2xl ring-1 ring-black/40">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onSaveAs();
            }}
            className="flex w-full items-center rounded px-3 py-2 text-left text-sm text-neutral-200 transition hover:bg-neutral-800"
          >
            Save as new…
          </button>
        </div>
      )}
    </div>
  );
}
