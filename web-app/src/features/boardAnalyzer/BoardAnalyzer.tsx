import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BrushIcon,
  CheckIcon,
  CloseIcon,
  CropIcon,
  EraserIcon,
  RedoIcon,
  TrashIcon,
  UndoIcon,
  ViewfinderIcon,
} from '../../components/icons';
import { Button, Field, IconButton, PageHeader, Pill, Section } from '../../components/ui';
import type { Board, Cell, PieceColor } from '../../types';
import { PIECES, PIECE_BY_ID } from '../../data/pieceTypes';
import { useLibrary } from '../../store/libraryStore';
import { useUI } from '../../store/uiStore';
import { analyzeImage, clearAnalyzerCache, type AnalysisResult } from './analyzer';

// ---------- Types ----------------------------------------------------------

interface Rect {
  id: string;
  /** Natural-pixel top-left x. */
  x: number;
  /** Natural-pixel top-left y. */
  y: number;
  /** Width in natural pixels. */
  w: number;
  /** Height in natural pixels. */
  h: number;
}

interface NaturalSize {
  w: number;
  h: number;
}

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const ALL_HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

type DragState =
  | { kind: 'draw'; anchorX: number; anchorY: number; id: string }
  | { kind: 'move'; id: string; offsetX: number; offsetY: number }
  | { kind: 'resize'; id: string; handle: Handle; origin: Rect }
  | null;

// ---------- History hook ---------------------------------------------------

function useHistory<T>(initial: T) {
  const [past, setPast] = useState<T[]>([]);
  const [present, setPresent] = useState<T>(initial);
  const [future, setFuture] = useState<T[]>([]);

  const commit = useCallback((next: T) => {
    setPast((p) => [...p, present]);
    setPresent(next);
    setFuture([]);
  }, [present]);

  const replace = useCallback((next: T) => setPresent(next), []);

  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      const prev = p[p.length - 1]!;
      setFuture((f) => [present, ...f]);
      setPresent(prev);
      return p.slice(0, -1);
    });
  }, [present]);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0]!;
      setPast((p) => [...p, present]);
      setPresent(next);
      return f.slice(1);
    });
  }, [present]);

  const reset = useCallback((v: T) => {
    setPast([]);
    setPresent(v);
    setFuture([]);
  }, []);

  return {
    state: present,
    commit,
    replace,
    undo,
    redo,
    reset,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
  };
}

// ---------- Geometry helpers ----------------------------------------------

const MIN_RECT_SIZE = 8;
const HANDLE_PX = 14;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function clampRectInside(r: Rect, bounds: NaturalSize): Rect {
  const w = Math.min(Math.max(r.w, MIN_RECT_SIZE), bounds.w);
  const h = Math.min(Math.max(r.h, MIN_RECT_SIZE), bounds.h);
  const x = clamp(r.x, 0, bounds.w - w);
  const y = clamp(r.y, 0, bounds.h - h);
  return { id: r.id, x, y, w, h };
}

function rectFromAnchor(
  anchorX: number,
  anchorY: number,
  px: number,
  py: number,
): { x: number; y: number; w: number; h: number } {
  const x = Math.min(anchorX, px);
  const y = Math.min(anchorY, py);
  const w = Math.abs(px - anchorX);
  const h = Math.abs(py - anchorY);
  return { x, y, w, h };
}

/** Location in natural-pixel space of a given handle on a rect. Used for
 *  hit-testing pointer-down against the 8 handle positions. */
function handlePoint(r: Rect, h: Handle): { x: number; y: number } {
  switch (h) {
    case 'nw': return { x: r.x, y: r.y };
    case 'n':  return { x: r.x + r.w / 2, y: r.y };
    case 'ne': return { x: r.x + r.w, y: r.y };
    case 'e':  return { x: r.x + r.w, y: r.y + r.h / 2 };
    case 'se': return { x: r.x + r.w, y: r.y + r.h };
    case 's':  return { x: r.x + r.w / 2, y: r.y + r.h };
    case 'sw': return { x: r.x, y: r.y + r.h };
    case 'w':  return { x: r.x, y: r.y + r.h / 2 };
  }
}

/** Recompute a rect while dragging a given handle. The non-moving edges of
 *  the handle stay pinned; the moving edges follow the pointer. Axes are
 *  independent — no square lock. */
function resizeRect(origin: Rect, handle: Handle, p: { x: number; y: number }): Rect {
  let left = origin.x;
  let right = origin.x + origin.w;
  let top = origin.y;
  let bottom = origin.y + origin.h;
  if (handle.includes('w')) left = p.x;
  if (handle.includes('e')) right = p.x;
  if (handle.includes('n')) top = p.y;
  if (handle.includes('s')) bottom = p.y;
  // Normalize if the user dragged past the opposite edge (the handle flips
  // cleanly, the rect keeps a positive width/height).
  const x = Math.min(left, right);
  const y = Math.min(top, bottom);
  const w = Math.abs(right - left);
  const h = Math.abs(bottom - top);
  return { id: origin.id, x, y, w, h };
}

// ---------- Overlap grouping ----------------------------------------------

/** Two rects overlap if their bounding boxes intersect. Touching-at-edge
 *  counts as no overlap (strict `<`), so rects placed adjacent but not
 *  overlapping stay independent. */
function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x + a.w > b.x && b.x + b.w > a.x && a.y + a.h > b.y && b.y + b.h > a.y;
}

/** Minimum bounding rect that contains every rect in the input. The id is
 *  a composite so analysis results can be keyed back to the group. */
function boundingRect(rects: Rect[]): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rects) {
    if (r.x < x0) x0 = r.x;
    if (r.y < y0) y0 = r.y;
    if (r.x + r.w > x1) x1 = r.x + r.w;
    if (r.y + r.h > y1) y1 = r.y + r.h;
  }
  return {
    id: rects.map((r) => r.id).sort().join('|'),
    x: x0,
    y: y0,
    w: x1 - x0,
    h: y1 - y0,
  };
}

export interface RectGroup {
  /** Composite id derived from member rect ids — stable across renders so
   *  long as the set of member ids is stable. */
  id: string;
  /** Rects that belong to this overlap group. */
  rects: Rect[];
  /** Bounding box that encloses every member rect. Used as the analysis
   *  region for the group. */
  bbox: Rect;
}

/** Union-find over rect overlap. Produces one group per connected
 *  component — any pair of overlapping rects ends up in the same group. */
function computeGroups(rects: Rect[]): RectGroup[] {
  const n = rects.length;
  const parent = rects.map((_, i) => i);
  const find = (i: number): number => {
    let x = i;
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!;
      x = parent[x]!;
    }
    return x;
  };
  const unify = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (rectsOverlap(rects[i]!, rects[j]!)) unify(i, j);
    }
  }
  const buckets = new Map<number, Rect[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const bucket = buckets.get(root) ?? [];
    bucket.push(rects[i]!);
    buckets.set(root, bucket);
  }
  return Array.from(buckets.values()).map((rs) => ({
    id: rs.map((r) => r.id).sort().join('|'),
    rects: rs,
    bbox: boundingRect(rs),
  }));
}

function pointInUnion(p: { x: number; y: number }, rects: Rect[]): boolean {
  return rects.some((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);
}

// ---------- Brush palette --------------------------------------------------

type BrushValue = PieceColor | 'eraser' | 'gap';

// ---------- Main component -------------------------------------------------

export function BoardAnalyzer() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<NaturalSize | null>(null);
  const history = useHistory<Rect[]>([]);
  const rects = history.state;

  const [cropMode, setCropMode] = useState(false);
  const [draft, setDraft] = useState<Rect | null>(null);

  const [brush, setBrush] = useState<BrushValue>('red');

  const [analyses, setAnalyses] = useState<AnalysisResult[]>([]);
  const [analyzing, setAnalyzing] = useState(false);

  const [sessionBoardId, setSessionBoardId] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);

  const saveBoard = useLibrary((s) => s.saveBoard);
  const openLibrary = useUI((s) => s.setPanel);

  // --- Image loading ------------------------------------------------------

  useEffect(() => {
    if (!imageUrl) return;
    return () => URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  const loadFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) return;
      const url = URL.createObjectURL(file);
      clearAnalyzerCache();
      setImageUrl(url);
      setNaturalSize(null);
      setDraft(null);
      setCropMode(false);
      setAnalyses([]);
      setSessionBoardId(null);
      history.reset([]);
    },
    [history],
  );

  const clearImage = () => {
    clearAnalyzerCache();
    setImageUrl(null);
    setNaturalSize(null);
    setDraft(null);
    setCropMode(false);
    setAnalyses([]);
    setSessionBoardId(null);
    history.reset([]);
  };

  // --- Paste anywhere ------------------------------------------------------

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            loadFile(file);
            e.preventDefault();
            return;
          }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [loadFile]);

  // Group overlapping rects so each connected component is analyzed as a
  // single region (bounding box union). Disjoint rects stay independent.
  const groups = useMemo(() => computeGroups(rects), [rects]);

  // --- Keyboard: Ctrl+Z / Ctrl+Y / Ctrl+S / Escape -------------------------

  // Keyboard shortcuts. Effect re-registers when the referenced state
  // changes so the Ctrl+S handler always sees current values.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA')) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && !e.shiftKey && k === 'z') {
        e.preventDefault();
        history.undo();
      } else if (mod && (k === 'y' || (e.shiftKey && k === 'z'))) {
        e.preventDefault();
        history.redo();
      } else if (mod && !e.shiftKey && k === 's') {
        if (analyses.length === 0) return;
        e.preventDefault();
        if (sessionBoardId) {
          const current = useLibrary
            .getState()
            .boards.find((b) => b.id === sessionBoardId);
          if (current) {
            const board = buildComposedBoard(sessionBoardId, current.name);
            if (board) {
              saveBoard(board);
              flashSaved();
              return;
            }
          }
        }
        setSaveModalOpen(true);
      } else if (e.key === 'Escape') {
        if (draft) setDraft(null);
        else if (cropMode) setCropMode(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [history, draft, cropMode, analyses, groups, sessionBoardId, saveBoard]);

  // --- Live re-analysis: debounced so drags don't thrash the CPU ----------

  useEffect(() => {
    if (!imageUrl || !naturalSize || groups.length === 0) {
      setAnalyses([]);
      return;
    }
    let cancelled = false;
    setAnalyzing(true);
    const t = window.setTimeout(() => {
      // Analyze each group's bbox. The analyzer's `rectId` field is what
      // we pass as the bbox id (== group id), so results key cleanly to
      // groups on the render side.
      void analyzeImage(imageUrl, groups.map((g) => g.bbox)).then((results) => {
        if (cancelled) return;
        setAnalyses(results);
        setAnalyzing(false);
      });
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [imageUrl, naturalSize, groups]);

  // --- Crop-mode ✓ / × ----------------------------------------------------

  const confirmCrop = () => {
    if (draft && draft.w >= MIN_RECT_SIZE && draft.h >= MIN_RECT_SIZE) {
      history.commit([...rects, draft]);
    }
    setDraft(null);
    setCropMode(false);
  };

  const cancelCrop = () => {
    setDraft(null);
    setCropMode(false);
  };

  const deleteRect = (id: string) => {
    history.commit(rects.filter((r) => r.id !== id));
  };

  // --- Painting inside analyzed cells -------------------------------------

  const paintCell = (rectId: string, row: number, col: number) => {
    setAnalyses((prev) =>
      prev.map((a) => {
        if (a.rectId !== rectId) return a;
        const nextCells = a.cells.map((rw, r) =>
          rw.map((v, c) =>
            r === row && c === col ? (brush === 'eraser' ? null : brush) : v,
          ),
        );
        return { ...a, cells: nextCells };
      }),
    );
  };

  // --- Save / Save as ----------------------------------------------------

  // Save composes a single board from all regions: the envelope bbox of
  // every user rect becomes the board canvas; cells that fall inside a
  // region inherit that region's analyzed piece; cells that fall outside
  // every region become structural gaps. So a "piecewise" board made of
  // several disjoint crops still saves as one coherent board.
  const saveable = analyses.length >= 1;
  const canSaveAs = saveable;
  const canSave = saveable;

  const flashSaved = () => {
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 2200);
  };

  /** Build a single "mega" board that spans the envelope bounding box of
   *  every user rect. Cell size is taken from the first region (screenshot
   *  tiles are assumed uniform across crops). Cells inside any region get
   *  that region's classified color; cells outside every region become
   *  `'gap'`, so a piecewise composed board saves as one coherent layout. */
  const buildComposedBoard = (id: string, name: string): Board | null => {
    if (analyses.length === 0 || groups.length === 0) return null;
    const firstGroup = groups[0]!;
    const firstAnalysis = analyses.find((a) => a.rectId === firstGroup.id);
    if (!firstAnalysis || firstAnalysis.cols <= 0 || firstAnalysis.rows <= 0) {
      return null;
    }
    const allRects = groups.flatMap((g) => g.rects);
    const envelope = {
      x: Math.min(...allRects.map((r) => r.x)),
      y: Math.min(...allRects.map((r) => r.y)),
      x2: Math.max(...allRects.map((r) => r.x + r.w)),
      y2: Math.max(...allRects.map((r) => r.y + r.h)),
    };
    const envW = envelope.x2 - envelope.x;
    const envH = envelope.y2 - envelope.y;
    const cellW = firstGroup.bbox.w / firstAnalysis.cols;
    const cellH = firstGroup.bbox.h / firstAnalysis.rows;
    const cols = Math.max(1, Math.round(envW / cellW));
    const rows = Math.max(1, Math.round(envH / cellH));

    const layout: Cell[][] = [];
    for (let r = 0; r < rows; r++) {
      const row: Cell[] = [];
      for (let c = 0; c < cols; c++) {
        const cx = envelope.x + (c + 0.5) * cellW;
        const cy = envelope.y + (r + 0.5) * cellH;
        let placed: Cell = 'gap';
        for (const g of groups) {
          if (!pointInUnion({ x: cx, y: cy }, g.rects)) continue;
          const a = analyses.find((an) => an.rectId === g.id);
          if (!a) continue;
          const lc = Math.floor(((cx - g.bbox.x) / g.bbox.w) * a.cols);
          const lr = Math.floor(((cy - g.bbox.y) / g.bbox.h) * a.rows);
          if (lr >= 0 && lr < a.rows && lc >= 0 && lc < a.cols) {
            placed = a.cells[lr]?.[lc] ?? null;
          }
          break;
        }
        row.push(placed);
      }
      layout.push(row);
    }

    const now = Date.now();
    return { id, name, width: cols, height: rows, tileSet: 'default', layout, createdAt: now, updatedAt: now };
  };

  const newBoardId = () =>
    `board_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  // Save as — always pops the naming modal. Confirming creates one entry
  // per analyzed region (names get suffixed "(i/n)" for multi-region).
  const openSaveAsModal = () => {
    if (!saveable) return;
    setSaveModalOpen(true);
  };

  const confirmSaveAs = (name: string) => {
    if (analyses.length === 0) {
      setSaveModalOpen(false);
      return;
    }
    const base = name.trim() || `Analyzed ${new Date().toLocaleString()}`;
    const id = newBoardId();
    const board = buildComposedBoard(id, base);
    if (!board) {
      setSaveModalOpen(false);
      return;
    }
    // eslint-disable-next-line no-console
    console.log('[BoardAnalyzer] saving composed board', {
      id,
      name: base,
      width: board.width,
      height: board.height,
      regions: analyses.length,
    });
    saveBoard(board);
    setSessionBoardId(id);
    setSaveModalOpen(false);
    flashSaved();
  };

  // Save — updates the in-session entry if one exists, otherwise falls
  // through to Save as (which prompts for a name + creates a new entry).
  const doSaveInPlace = () => {
    if (!saveable) return;
    if (!sessionBoardId) return openSaveAsModal();
    const current = useLibrary.getState().boards.find((b) => b.id === sessionBoardId);
    if (!current) {
      // Entry was deleted from library in another panel; treat as fresh save.
      setSessionBoardId(null);
      return openSaveAsModal();
    }
    const board = buildComposedBoard(sessionBoardId, current.name);
    if (!board) return;
    saveBoard(board);
    flashSaved();
  };

  const savedBoardName = useMemo(() => {
    if (!sessionBoardId) return null;
    return (
      useLibrary.getState().boards.find((b) => b.id === sessionBoardId)?.name ?? null
    );
  }, [sessionBoardId, savedFlash]);

  // --- Derived bits -------------------------------------------------------

  const hasImage = !!imageUrl;
  const allRects = useMemo(() => (draft ? [...rects, draft] : rects), [rects, draft]);
  const brushEnabled = !cropMode && analyses.length > 0;

  // --- Render -------------------------------------------------------------

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        eyebrow="Analyzer"
        title="Board Analyzer"
        subtitle="Load a board screenshot, mask everything but the board, analyze the grid."
        actions={
          <>
            {savedFlash && <Pill tone="success">Saved</Pill>}
            {analyzing && <Pill tone="neutral">Analyzing…</Pill>}
            {sessionBoardId && savedBoardName && !savedFlash && (
              <button
                type="button"
                onClick={() => openLibrary('board-library')}
                className="text-[11px] text-neutral-400 underline-offset-2 hover:text-neutral-100 hover:underline"
                title={`Open "${savedBoardName}" in the Library`}
              >
                {savedBoardName}
              </button>
            )}
            <Button
              variant="secondary"
              disabled={!canSave}
              onClick={doSaveInPlace}
              title={
                canSave
                  ? sessionBoardId
                    ? `Update "${savedBoardName ?? 'the saved board'}" (Ctrl+S)`
                    : 'Save to library (Ctrl+S)'
                  : 'Draw a selection first'
              }
            >
              Save
            </Button>
            <Button
              variant="primary"
              disabled={!canSaveAs}
              onClick={openSaveAsModal}
              title={
                canSaveAs
                  ? analyses.length === 1
                    ? 'Save as a new board'
                    : `Compose ${analyses.length} regions into one board (unselected areas become gaps)`
                  : 'Draw a selection first'
              }
            >
              Save as…
            </Button>
          </>
        }
      />
      <div className="grid min-h-0 flex-1 grid-cols-[240px_1fr_260px] overflow-hidden">
        <LeftPanel
          hasImage={hasImage}
          cropMode={cropMode}
          rectCount={rects.length}
          analyzed={analyses.length > 0}
          saved={!!sessionBoardId}
        />
        <CenterWorkspace
          imageUrl={imageUrl}
          naturalSize={naturalSize}
          onNaturalSize={setNaturalSize}
          onLoadFile={loadFile}
          onPickImage={loadFile}
          onClearImage={clearImage}
          cropMode={cropMode}
          onToggleCropMode={() => setCropMode((v) => !v)}
          onConfirmCrop={confirmCrop}
          onCancelCrop={cancelCrop}
          rects={rects}
          draft={draft}
          allRects={allRects}
          setDraft={setDraft}
          commitRects={history.commit}
          replaceRects={history.replace}
          deleteRect={deleteRect}
          undo={history.undo}
          redo={history.redo}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          groups={groups}
          analyses={analyses}
          brushEnabled={brushEnabled}
          onPaintCell={paintCell}
        />
        <BrushPanel
          brush={brush}
          onBrushChange={setBrush}
          enabled={brushEnabled}
          analyses={analyses}
        />
      </div>
      {saveModalOpen && analyses.length > 0 && (
        <SaveAsModal
          preview={(() => {
            const preview = buildComposedBoard('preview', '');
            if (!preview) return null;
            const classified = preview.layout.reduce(
              (acc, row) => acc + row.filter((c) => c !== null && c !== 'gap').length,
              0,
            );
            const gaps = preview.layout.reduce(
              (acc, row) => acc + row.filter((c) => c === 'gap').length,
              0,
            );
            return {
              cols: preview.width,
              rows: preview.height,
              classifiedCells: classified,
              gapCells: gaps,
              regionCount: analyses.length,
            };
          })()}
          onCancel={() => setSaveModalOpen(false)}
          onConfirm={confirmSaveAs}
        />
      )}
    </div>
  );
}

// ---------- Save-as modal --------------------------------------------------

interface SavePreview {
  cols: number;
  rows: number;
  classifiedCells: number;
  gapCells: number;
  regionCount: number;
}

function SaveAsModal({
  preview,
  onCancel,
  onConfirm,
}: {
  preview: SavePreview | null;
  onCancel: () => void;
  onConfirm: (name: string) => void;
}) {
  const defaultName = useMemo(
    () => `Analyzed ${new Date().toLocaleString()}`,
    [],
  );
  const [name, setName] = useState(defaultName);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const submit = () => {
    const trimmed = name.trim();
    onConfirm(trimmed || defaultName);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-lg border border-neutral-800 bg-neutral-950 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-neutral-50">Save board</h2>
        {preview && (
          <p className="mt-0.5 text-xs text-neutral-500">
            {preview.cols} × {preview.rows} board · {preview.classifiedCells}{' '}
            tile{preview.classifiedCells === 1 ? '' : 's'}
            {preview.gapCells > 0
              ? ` · ${preview.gapCells} gap cell${preview.gapCells === 1 ? '' : 's'}`
              : ''}
            {preview.regionCount > 1
              ? ` · composed from ${preview.regionCount} regions`
              : ''}
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="mt-4 flex flex-col gap-3"
        >
          <Field label="Name">
            <input
              type="text"
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 placeholder:text-neutral-600 transition focus:border-neutral-500 focus:outline-none"
            />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Save
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------- Left panel -----------------------------------------------------

function LeftPanel({
  hasImage,
  cropMode,
  rectCount,
  analyzed,
  saved,
}: {
  hasImage: boolean;
  cropMode: boolean;
  rectCount: number;
  analyzed: boolean;
  saved: boolean;
}) {
  const steps = [
    {
      label: 'Load a screenshot',
      done: hasImage,
      hint: 'Drop, paste (Ctrl+V), or use Choose image.',
    },
    {
      label: 'Enable Crop mode',
      done: hasImage && (cropMode || rectCount > 0),
      hint: 'Toggle the crop icon in the bottom bar.',
    },
    {
      label: 'Mark board area',
      done: rectCount > 0,
      hint: 'Drag rectangles around the board. Outside stays dark.',
    },
    {
      label: 'Review analysis',
      done: analyzed,
      hint: 'Grid + piece colors appear on the image. Retouch with the brush.',
    },
    {
      label: 'Save',
      done: saved,
      hint: 'Send the detected board to your Library.',
    },
  ];

  return (
    <aside className="flex flex-col gap-4 border-r border-neutral-800 bg-neutral-950 p-4">
      <Section title="Workflow">
        <ol className="flex flex-col gap-3">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-2.5">
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold ${
                  s.done
                    ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-200'
                    : 'border-neutral-700 bg-neutral-900 text-neutral-400'
                }`}
              >
                {s.done ? <CheckIcon className="h-3 w-3" /> : i + 1}
              </span>
              <div className="min-w-0">
                <div
                  className={`text-sm ${
                    s.done ? 'text-neutral-100' : 'text-neutral-300'
                  }`}
                >
                  {s.label}
                </div>
                <div className="text-[11px] leading-snug text-neutral-500">
                  {s.hint}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Shortcuts">
        <ul className="flex flex-col gap-1 text-[11px] text-neutral-500">
          <li>
            <Kbd>Ctrl+V</Kbd> paste image
          </li>
          <li>
            <Kbd>Ctrl+Z</Kbd> / <Kbd>Ctrl+Y</Kbd> undo, redo
          </li>
          <li>
            <Kbd>Esc</Kbd> cancel crop draft
          </li>
        </ul>
      </Section>
    </aside>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-neutral-700 bg-neutral-900 px-1 text-[10px] text-neutral-300">
      {children}
    </kbd>
  );
}

// ---------- Center workspace ----------------------------------------------

interface CenterWorkspaceProps {
  imageUrl: string | null;
  naturalSize: NaturalSize | null;
  onNaturalSize: (s: NaturalSize) => void;
  onLoadFile: (f: File) => void;
  onPickImage: (f: File) => void;
  onClearImage: () => void;
  cropMode: boolean;
  onToggleCropMode: () => void;
  onConfirmCrop: () => void;
  onCancelCrop: () => void;
  rects: Rect[];
  draft: Rect | null;
  allRects: Rect[];
  setDraft: (s: Rect | null) => void;
  commitRects: (next: Rect[]) => void;
  replaceRects: (next: Rect[]) => void;
  deleteRect: (id: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  groups: RectGroup[];
  analyses: AnalysisResult[];
  brushEnabled: boolean;
  onPaintCell: (groupId: string, row: number, col: number) => void;
}

function CenterWorkspace(props: CenterWorkspaceProps) {
  const {
    imageUrl,
    naturalSize,
    onNaturalSize,
    onLoadFile,
    onPickImage,
    onClearImage,
    cropMode,
    onToggleCropMode,
    onConfirmCrop,
    onCancelCrop,
    rects,
    draft,
    allRects,
    setDraft,
    commitRects,
    replaceRects,
    deleteRect,
    undo,
    redo,
    canUndo,
    canRedo,
    groups,
    analyses,
    brushEnabled,
    onPaintCell,
  } = props;

  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onLoadFile(f);
  };

  return (
    <div className="flex min-h-0 flex-col overflow-hidden">
      <div
        className={`relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-neutral-900/40 p-6 transition ${
          dragOver ? 'bg-neutral-800/60 ring-2 ring-inset ring-neutral-500' : ''
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {imageUrl ? (
          <ImageSurface
            imageUrl={imageUrl}
            naturalSize={naturalSize}
            onNaturalSize={onNaturalSize}
            cropMode={cropMode}
            rects={rects}
            draft={draft}
            allRects={allRects}
            setDraft={setDraft}
            commitRects={commitRects}
            replaceRects={replaceRects}
            deleteRect={deleteRect}
            groups={groups}
            analyses={analyses}
            brushEnabled={brushEnabled}
            onPaintCell={onPaintCell}
          />
        ) : (
          <EmptyState />
        )}
      </div>

      <BottomToolbar
        hasImage={!!imageUrl}
        cropMode={cropMode}
        onPickImageClick={() => fileInputRef.current?.click()}
        onClearImage={onClearImage}
        onToggleCropMode={onToggleCropMode}
        onConfirmCrop={onConfirmCrop}
        onCancelCrop={onCancelCrop}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPickImage(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex max-w-sm flex-col items-center gap-3 rounded-lg border border-dashed border-neutral-700 bg-neutral-950/40 px-8 py-10 text-center">
      <ViewfinderIcon className="h-8 w-8 text-neutral-500" />
      <div className="text-sm font-medium text-neutral-200">
        Drop a screenshot here
      </div>
      <div className="text-xs leading-relaxed text-neutral-500">
        Paste from clipboard with <Kbd>Ctrl+V</Kbd>, drag a file onto this area,
        or use <em>Choose image…</em> in the toolbar below.
      </div>
    </div>
  );
}

// ---------- Bottom toolbar -------------------------------------------------

function BottomToolbar({
  hasImage,
  cropMode,
  onPickImageClick,
  onClearImage,
  onToggleCropMode,
  onConfirmCrop,
  onCancelCrop,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  hasImage: boolean;
  cropMode: boolean;
  onPickImageClick: () => void;
  onClearImage: () => void;
  onToggleCropMode: () => void;
  onConfirmCrop: () => void;
  onCancelCrop: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  return (
    <div className="flex items-center gap-2 border-t border-neutral-800 bg-neutral-950 px-4 py-2.5">
      <Button size="sm" onClick={onPickImageClick} leading={<ViewfinderIcon />}>
        Choose image…
      </Button>
      <Button
        size="sm"
        variant="danger"
        onClick={onClearImage}
        disabled={!hasImage}
        leading={<TrashIcon />}
      >
        Remove
      </Button>

      <div className="mx-2 h-6 w-px bg-neutral-800" />

      <Button
        size="sm"
        variant={cropMode ? 'success' : 'secondary'}
        onClick={onToggleCropMode}
        disabled={!hasImage}
        leading={<CropIcon />}
      >
        Crop mode
      </Button>

      {cropMode && (
        <>
          <IconButton
            size="sm"
            onClick={onConfirmCrop}
            title="Apply (exits crop mode)"
            className="text-emerald-300 hover:bg-emerald-500/15 hover:text-emerald-200"
          >
            <CheckIcon />
          </IconButton>
          <IconButton
            size="sm"
            tone="danger"
            onClick={onCancelCrop}
            title="Cancel draft (exits crop mode)"
          >
            <CloseIcon />
          </IconButton>
        </>
      )}

      <div className="mx-2 h-6 w-px bg-neutral-800" />

      <IconButton
        size="sm"
        onClick={onUndo}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
      >
        <UndoIcon />
      </IconButton>
      <IconButton
        size="sm"
        onClick={onRedo}
        disabled={!canRedo}
        title="Redo (Ctrl+Y)"
      >
        <RedoIcon />
      </IconButton>

      <div className="ml-auto text-[11px] text-neutral-500">
        {cropMode
          ? 'Drag to add a rectangle • inside to move • handles to resize • trash to delete'
          : hasImage
          ? 'Enable Crop mode to edit selections • paint cells with the brush on the right'
          : ''}
      </div>
    </div>
  );
}

// ---------- Image surface (image + mask + rects + overlay + handles) -----

interface ImageSurfaceProps {
  imageUrl: string;
  naturalSize: NaturalSize | null;
  onNaturalSize: (s: NaturalSize) => void;
  cropMode: boolean;
  rects: Rect[];
  draft: Rect | null;
  allRects: Rect[];
  setDraft: (s: Rect | null) => void;
  commitRects: (next: Rect[]) => void;
  replaceRects: (next: Rect[]) => void;
  deleteRect: (id: string) => void;
  groups: RectGroup[];
  analyses: AnalysisResult[];
  brushEnabled: boolean;
  onPaintCell: (groupId: string, row: number, col: number) => void;
}

function ImageSurface(props: ImageSurfaceProps) {
  const {
    imageUrl,
    naturalSize,
    onNaturalSize,
    cropMode,
    rects,
    draft,
    allRects,
    setDraft,
    commitRects,
    replaceRects,
    deleteRect,
    groups,
    analyses,
    brushEnabled,
    onPaintCell,
  } = props;

  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<DragState>(null);
  const dragStartRectsRef = useRef<Rect[] | null>(null);

  const clientToNatural = (e: React.PointerEvent) => {
    const img = imgRef.current;
    if (!img || !naturalSize) return null;
    const r = img.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    const x = ((e.clientX - r.left) / r.width) * naturalSize.w;
    const y = ((e.clientY - r.top) / r.height) * naturalSize.h;
    return { x, y };
  };

  const handleNaturalRadius = () => {
    const img = imgRef.current;
    if (!img || !naturalSize) return HANDLE_PX;
    const r = img.getBoundingClientRect();
    if (r.width === 0) return HANDLE_PX;
    return (HANDLE_PX / r.width) * naturalSize.w;
  };

  const hitHandle = (p: { x: number; y: number }, r: Rect): Handle | null => {
    const tol = handleNaturalRadius();
    const order: Handle[] = ['nw', 'ne', 'sw', 'se', 'n', 'e', 's', 'w'];
    for (const h of order) {
      const hp = handlePoint(r, h);
      if (Math.abs(p.x - hp.x) <= tol && Math.abs(p.y - hp.y) <= tol) return h;
    }
    return null;
  };

  const hitBody = (p: { x: number; y: number }, r: Rect): boolean => {
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  };

  // --- Gesture dispatch ----------------------------------------------------

  const onPointerDown = (e: React.PointerEvent) => {
    if (!naturalSize) return;
    const p = clientToNatural(e);
    if (!p) return;

    if (cropMode) {
      // Hit test newest → oldest so the topmost rect wins.
      for (let i = rects.length - 1; i >= 0; i--) {
        const r = rects[i]!;
        const h = hitHandle(p, r);
        if (h) {
          dragStartRectsRef.current = rects;
          dragRef.current = { kind: 'resize', id: r.id, handle: h, origin: r };
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          e.preventDefault();
          return;
        }
        if (hitBody(p, r)) {
          dragStartRectsRef.current = rects;
          dragRef.current = {
            kind: 'move',
            id: r.id,
            offsetX: p.x - r.x,
            offsetY: p.y - r.y,
          };
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          e.preventDefault();
          return;
        }
      }

      const id = `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      dragRef.current = { kind: 'draw', anchorX: p.x, anchorY: p.y, id };
      setDraft({ id, x: p.x, y: p.y, w: 0, h: 0 });
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    // Non-crop mode: if brush is enabled, a pointer-down on a cell paints
    // it. The click must land inside the actual rect union of a group
    // (not just its bounding box) so masked-dark cells don't get painted.
    if (brushEnabled) {
      for (const a of analyses) {
        const group = groups.find((g) => g.id === a.rectId);
        if (!group) continue;
        if (!pointInUnion(p, group.rects)) continue;
        const { bbox } = group;
        const col = Math.floor(((p.x - bbox.x) / bbox.w) * a.cols);
        const row = Math.floor(((p.y - bbox.y) / bbox.h) * a.rows);
        if (row < 0 || col < 0 || row >= a.rows || col >= a.cols) continue;
        onPaintCell(a.rectId, row, col);
        e.preventDefault();
        return;
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || !naturalSize) return;
    const p = clientToNatural(e);
    if (!p) return;

    if (drag.kind === 'draw') {
      const { x, y, w, h } = rectFromAnchor(drag.anchorX, drag.anchorY, p.x, p.y);
      const fx = clamp(x, 0, naturalSize.w);
      const fy = clamp(y, 0, naturalSize.h);
      const fw = Math.min(w, naturalSize.w - fx);
      const fh = Math.min(h, naturalSize.h - fy);
      setDraft({ id: drag.id, x: fx, y: fy, w: fw, h: fh });
    } else if (drag.kind === 'move') {
      const start = dragStartRectsRef.current ?? rects;
      const sq = start.find((s) => s.id === drag.id);
      if (!sq) return;
      const nx = p.x - drag.offsetX;
      const ny = p.y - drag.offsetY;
      const clamped = clampRectInside(
        { id: sq.id, x: nx, y: ny, w: sq.w, h: sq.h },
        naturalSize,
      );
      replaceRects(start.map((s) => (s.id === sq.id ? clamped : s)));
    } else if (drag.kind === 'resize') {
      const start = dragStartRectsRef.current ?? rects;
      const next = resizeRect(drag.origin, drag.handle, p);
      const clamped = clampRectInside(next, naturalSize);
      replaceRects(start.map((s) => (s.id === drag.id ? clamped : s)));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);

    if (drag.kind === 'draw') {
      if (draft && draft.w >= MIN_RECT_SIZE && draft.h >= MIN_RECT_SIZE) {
        commitRects([...rects, draft]);
      }
      setDraft(null);
    } else {
      const before = dragStartRectsRef.current;
      if (before && before !== rects) commitRects(rects);
    }
    dragStartRectsRef.current = null;
  };

  const [hoverCursor, setHoverCursor] = useState<string>('default');
  const onPointerHover = (e: React.PointerEvent) => {
    if (!naturalSize || dragRef.current) return;
    const p = clientToNatural(e);
    if (!p) {
      setHoverCursor('default');
      return;
    }
    if (cropMode) {
      for (let i = rects.length - 1; i >= 0; i--) {
        const r = rects[i]!;
        const h = hitHandle(p, r);
        if (h) return setHoverCursor(handleToCursor(h));
        if (hitBody(p, r)) return setHoverCursor('move');
      }
      setHoverCursor('crosshair');
      return;
    }
    if (brushEnabled) {
      for (const g of groups) {
        if (pointInUnion(p, g.rects)) return setHoverCursor('pointer');
      }
    }
    setHoverCursor('default');
  };

  return (
    <div className="relative flex max-h-full max-w-full items-center justify-center">
      <div className="relative inline-block max-h-full max-w-full">
        <img
          ref={imgRef}
          src={imageUrl}
          alt="Source screenshot"
          draggable={false}
          className="block max-h-[calc(100vh-240px)] max-w-full select-none rounded-sm"
          onLoad={(e) => {
            const t = e.currentTarget;
            onNaturalSize({ w: t.naturalWidth, h: t.naturalHeight });
          }}
        />

        {/* Mask layer */}
        {naturalSize && allRects.length > 0 && (
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox={`0 0 ${naturalSize.w} ${naturalSize.h}`}
            preserveAspectRatio="none"
          >
            <defs>
              <mask id="board-analyzer-mask">
                <rect x={0} y={0} width={naturalSize.w} height={naturalSize.h} fill="white" />
                {allRects.map((r) => (
                  <rect key={r.id} x={r.x} y={r.y} width={r.w} height={r.h} fill="black" />
                ))}
              </mask>
            </defs>
            <rect
              x={0}
              y={0}
              width={naturalSize.w}
              height={naturalSize.h}
              fill="black"
              opacity={0.82}
              mask="url(#board-analyzer-mask)"
            />
          </svg>
        )}

        {/* Analysis overlay: grid lines over each group's bbox + piece
            color dots (only in cells whose center lies inside the actual
            rect union, so the masked-dark gap between disjoint members
            stays empty). */}
        {naturalSize && analyses.length > 0 && (
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox={`0 0 ${naturalSize.w} ${naturalSize.h}`}
            preserveAspectRatio="none"
          >
            {analyses.map((a) => {
              const group = groups.find((g) => g.id === a.rectId);
              if (!group) return null;
              const { bbox, rects: members } = group;
              const cellW = bbox.w / a.cols;
              const cellH = bbox.h / a.rows;
              const lines: JSX.Element[] = [];
              for (let c = 1; c < a.cols; c++) {
                const x = bbox.x + c * cellW;
                lines.push(
                  <line
                    key={`v-${a.rectId}-${c}`}
                    x1={x}
                    y1={bbox.y}
                    x2={x}
                    y2={bbox.y + bbox.h}
                    stroke="white"
                    strokeOpacity={0.22}
                    strokeWidth={1}
                  />,
                );
              }
              for (let r = 1; r < a.rows; r++) {
                const y = bbox.y + r * cellH;
                lines.push(
                  <line
                    key={`h-${a.rectId}-${r}`}
                    x1={bbox.x}
                    y1={y}
                    x2={bbox.x + bbox.w}
                    y2={y}
                    stroke="white"
                    strokeOpacity={0.22}
                    strokeWidth={1}
                  />,
                );
              }
              const dots: JSX.Element[] = [];
              for (let r = 0; r < a.rows; r++) {
                for (let c = 0; c < a.cols; c++) {
                  const cell = a.cells[r]?.[c];
                  if (!cell) continue;
                  const cx = bbox.x + c * cellW + cellW / 2;
                  const cy = bbox.y + r * cellH + cellH / 2;
                  if (!pointInUnion({ x: cx, y: cy }, members)) continue;
                  if (cell === 'gap') {
                    // Gap marker: a darker overlay square + an X. Avoids
                    // being mistaken for a dim piece color.
                    const half = Math.min(cellW, cellH) * 0.32;
                    dots.push(
                      <g key={`d-${a.rectId}-${r}-${c}`}>
                        <rect
                          x={cx - half}
                          y={cy - half}
                          width={half * 2}
                          height={half * 2}
                          fill="rgba(0,0,0,0.55)"
                          stroke="rgba(255,255,255,0.6)"
                          strokeWidth={1.2}
                        />
                        <line
                          x1={cx - half * 0.7}
                          y1={cy - half * 0.7}
                          x2={cx + half * 0.7}
                          y2={cy + half * 0.7}
                          stroke="rgba(255,255,255,0.85)"
                          strokeWidth={1.4}
                        />
                        <line
                          x1={cx - half * 0.7}
                          y1={cy + half * 0.7}
                          x2={cx + half * 0.7}
                          y2={cy - half * 0.7}
                          stroke="rgba(255,255,255,0.85)"
                          strokeWidth={1.4}
                        />
                      </g>,
                    );
                    continue;
                  }
                  const radius = Math.min(cellW, cellH) * 0.28;
                  dots.push(
                    <circle
                      key={`d-${a.rectId}-${r}-${c}`}
                      cx={cx}
                      cy={cy}
                      r={radius}
                      fill={PIECE_BY_ID[cell].hex}
                      stroke="rgba(0,0,0,0.45)"
                      strokeWidth={1.5}
                    />,
                  );
                }
              }
              return <g key={a.rectId}>{lines}{dots}</g>;
            })}
          </svg>
        )}

        {/* Pointer capture surface */}
        <div
          className="absolute inset-0 touch-none"
          style={{ cursor: hoverCursor }}
          onPointerDown={onPointerDown}
          onPointerMove={(e) => {
            onPointerMove(e);
            onPointerHover(e);
          }}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />

        {/* Rect overlays (borders + handles + trash gizmo) */}
        {naturalSize &&
          allRects.map((r) => {
            // Each group's label attaches to its first rect (the "lead"),
            // so overlapping rects don't render duplicate labels for the
            // same group.
            const group = groups.find((g) => g.rects.some((gr) => gr.id === r.id));
            const isLead = group?.rects[0]?.id === r.id;
            const analysis =
              isLead && group ? analyses.find((a) => a.rectId === group.id) ?? null : null;
            return (
              <RectOverlay
                key={r.id}
                rect={r}
                naturalSize={naturalSize}
                cropMode={cropMode}
                isDraft={r.id === draft?.id}
                onDelete={() => deleteRect(r.id)}
                analysis={analysis}
              />
            );
          })}
      </div>
    </div>
  );
}

function handleToCursor(h: Handle): string {
  switch (h) {
    case 'nw':
    case 'se':
      return 'nwse-resize';
    case 'ne':
    case 'sw':
      return 'nesw-resize';
    case 'n':
    case 's':
      return 'ns-resize';
    case 'e':
    case 'w':
      return 'ew-resize';
  }
}

function RectOverlay({
  rect,
  naturalSize,
  cropMode,
  isDraft,
  onDelete,
  analysis,
}: {
  rect: Rect;
  naturalSize: NaturalSize;
  cropMode: boolean;
  isDraft: boolean;
  onDelete: () => void;
  analysis: AnalysisResult | null;
}) {
  const style: React.CSSProperties = {
    left: `${(rect.x / naturalSize.w) * 100}%`,
    top: `${(rect.y / naturalSize.h) * 100}%`,
    width: `${(rect.w / naturalSize.w) * 100}%`,
    height: `${(rect.h / naturalSize.h) * 100}%`,
  };

  const borderColor = isDraft
    ? 'border-emerald-300'
    : cropMode
    ? 'border-emerald-400'
    : 'border-emerald-400/60';

  return (
    <div
      className={`pointer-events-none absolute border-2 ${borderColor} ${
        isDraft ? 'bg-emerald-400/10' : ''
      }`}
      style={style}
    >
      {/* Size / grid label — top-left of rect */}
      {!isDraft && analysis && (
        <span className="pointer-events-none absolute left-0 top-0 -translate-y-full rounded-t-sm bg-neutral-950/80 px-1.5 py-0.5 text-[10px] font-medium text-emerald-200">
          {analysis.cols} × {analysis.rows}
        </span>
      )}

      {cropMode && !isDraft && (
        <>
          {/* Center trash gizmo. pointer-events-auto so the button receives
              the click; the capture surface below doesn't see it. */}
          <button
            type="button"
            onClick={onDelete}
            onPointerDown={(e) => e.stopPropagation()}
            title="Delete this selection"
            className="pointer-events-auto absolute left-1/2 top-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-neutral-950/90 text-rose-300 ring-2 ring-rose-400/50 shadow transition hover:bg-rose-500/30 hover:text-rose-100"
          >
            <TrashIcon />
          </button>
          {ALL_HANDLES.map((h) => (
            <HandleKnob key={h} handle={h} />
          ))}
        </>
      )}
    </div>
  );
}

function HandleKnob({ handle }: { handle: Handle }) {
  const pos = (() => {
    switch (handle) {
      case 'nw': return 'left-0 top-0 -translate-x-1/2 -translate-y-1/2';
      case 'n':  return 'left-1/2 top-0 -translate-x-1/2 -translate-y-1/2';
      case 'ne': return 'right-0 top-0 translate-x-1/2 -translate-y-1/2';
      case 'e':  return 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2';
      case 'se': return 'right-0 bottom-0 translate-x-1/2 translate-y-1/2';
      case 's':  return 'left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2';
      case 'sw': return 'left-0 bottom-0 -translate-x-1/2 translate-y-1/2';
      case 'w':  return 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2';
    }
  })();
  return (
    <span
      className={`pointer-events-none absolute h-3 w-3 border-2 border-emerald-300 bg-neutral-950 ${pos}`}
    />
  );
}

// ---------- Right panel: brush --------------------------------------------

function BrushPanel({
  brush,
  onBrushChange,
  enabled,
  analyses,
}: {
  brush: BrushValue;
  onBrushChange: (b: BrushValue) => void;
  enabled: boolean;
  analyses: AnalysisResult[];
}) {
  const totalCells = analyses.reduce((acc, a) => acc + a.rows * a.cols, 0);
  const filledCells = analyses.reduce(
    (acc, a) => acc + a.cells.reduce((c, row) => c + row.filter(Boolean).length, 0),
    0,
  );

  return (
    <aside className="flex flex-col gap-4 border-l border-neutral-800 bg-neutral-950 p-4">
      <Section title="Retouch brush">
        <p className="text-[11px] leading-snug text-neutral-500">
          {enabled
            ? 'Click a cell on the image to set its color.'
            : 'Draw a selection to start analyzing. The brush turns on once the detector has something to fix.'}
        </p>
        <div className={`grid grid-cols-4 gap-2 ${enabled ? '' : 'opacity-50'}`}>
          {PIECES.map((p) => {
            const active = enabled && brush === p.id;
            return (
              <button
                key={p.id}
                type="button"
                disabled={!enabled}
                onClick={() => onBrushChange(p.id as PieceColor)}
                className={`flex h-10 items-center justify-center rounded-md border transition disabled:cursor-not-allowed ${
                  active
                    ? 'border-neutral-100 ring-2 ring-neutral-100'
                    : 'border-neutral-800 hover:border-neutral-600'
                }`}
                style={{ backgroundColor: p.hex }}
                title={p.label}
              />
            );
          })}
          <button
            type="button"
            disabled={!enabled}
            onClick={() => onBrushChange('gap')}
            className={`col-span-2 flex h-10 items-center justify-center gap-1.5 rounded-md border text-xs text-neutral-300 transition disabled:cursor-not-allowed ${
              enabled && brush === 'gap'
                ? 'border-neutral-100 ring-2 ring-neutral-100'
                : 'border-neutral-800 hover:border-neutral-600'
            }`}
            style={{
              backgroundImage:
                'repeating-linear-gradient(45deg, rgb(23 23 23) 0 4px, rgb(38 38 38) 4px 8px)',
            }}
            title="Gap — mark a cell as a structural hole (no tile will ever go there)"
          >
            Gap
          </button>
          <button
            type="button"
            disabled={!enabled}
            onClick={() => onBrushChange('eraser')}
            className={`col-span-2 flex h-10 items-center justify-center gap-1.5 rounded-md border text-xs text-neutral-300 transition disabled:cursor-not-allowed ${
              enabled && brush === 'eraser'
                ? 'border-neutral-100 ring-2 ring-neutral-100'
                : 'border-neutral-800 hover:border-neutral-600'
            }`}
            title="Eraser"
          >
            <EraserIcon />
            Eraser
          </button>
        </div>
      </Section>

      {analyses.length > 0 && (
        <Section title="Detection">
          <ul className="flex flex-col gap-1.5 text-[11px] text-neutral-400">
            {analyses.map((a, i) => (
              <li key={a.rectId} className="flex items-center justify-between">
                <span>
                  Region {i + 1}: {a.cols} × {a.rows}
                </span>
                <span className="text-neutral-500">
                  {a.cells.reduce((c, row) => c + row.filter(Boolean).length, 0)}/{a.rows * a.cols}
                </span>
              </li>
            ))}
          </ul>
          {totalCells > 0 && (
            <div className="text-[11px] text-neutral-500">
              {filledCells} of {totalCells} cells classified.
            </div>
          )}
        </Section>
      )}

      <Section title="Status">
        <div className="rounded-md border border-neutral-800 bg-neutral-900/40 p-3 text-[11px] leading-snug text-neutral-500">
          <BrushIcon className="mb-1 inline h-3.5 w-3.5 text-neutral-500" />{' '}
          Analysis is best-effort: dominant hue per cell center. Retouch in
          this panel if any cell comes back wrong, then save from the top
          right.
        </div>
      </Section>
    </aside>
  );
}
