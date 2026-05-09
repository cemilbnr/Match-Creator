import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  PlusIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from '../../components/icons';
import { SaveSplitButton } from '../../components/SaveSplitButton';
import { Button, IconButton, PageHeader, Pill } from '../../components/ui';
import {
  adoptNewBoardId,
  useBoardGenerator,
} from '../../store/boardGeneratorStore';
import { useLibrary } from '../../store/libraryStore';
import { useUI } from '../../store/uiStore';
import type { Board } from '../../types';
import { BoardPreferences } from './BoardPreferences';
import { BrushPanel } from './BrushPanel';
import { GridCanvas } from './GridCanvas';
import { useBrushControls } from './useBrushControls';

export function BoardGenerator() {
  const { brush, shiftHeld, setBrush } = useBrushControls('red');
  const savedBoards = useLibrary((s) => s.boards);
  const saveBoard = useLibrary((s) => s.saveBoard);
  const pendingBoardId = useUI((s) => s.pendingBoardId);
  const clearPendingBoard = useUI((s) => s.clearPendingBoard);

  // ---- Persistent generator state -----------------------------------------
  const boardId = useBoardGenerator((s) => s.boardId);
  const name = useBoardGenerator((s) => s.name);
  const width = useBoardGenerator((s) => s.width);
  const height = useBoardGenerator((s) => s.height);
  const tileSet = useBoardGenerator((s) => s.tileSet);
  const layout = useBoardGenerator((s) => s.layout);
  const savedAt = useBoardGenerator((s) => s.savedAt);
  const cellSize = useBoardGenerator((s) => s.cellSize);

  const setName = useBoardGenerator((s) => s.setName);
  const setWidth = useBoardGenerator((s) => s.setWidth);
  const setHeight = useBoardGenerator((s) => s.setHeight);
  const paint = useBoardGenerator((s) => s.paint);
  const eraseColor = useBoardGenerator((s) => s.eraseColor);
  const replaceColor = useBoardGenerator((s) => s.replaceColor);
  const fillEmptyAction = useBoardGenerator((s) => s.fillEmpty);
  const clearCanvas = useBoardGenerator((s) => s.clearCanvas);
  const addEdge = useBoardGenerator((s) => s.addEdge);
  const removeEdge = useBoardGenerator((s) => s.removeEdge);
  const resetTo = useBoardGenerator((s) => s.resetTo);
  const resetNew = useBoardGenerator((s) => s.resetNew);
  const markSaved = useBoardGenerator((s) => s.markSaved);
  const zoomIn = useBoardGenerator((s) => s.zoomIn);
  const zoomOut = useBoardGenerator((s) => s.zoomOut);
  const canZoomInFn = useBoardGenerator((s) => s.canZoomIn);
  const canZoomOutFn = useBoardGenerator((s) => s.canZoomOut);
  const canZoomIn = canZoomInFn();
  const canZoomOut = canZoomOutFn();

  // Selection / clipboard / floating
  const tool = useBoardGenerator((s) => s.tool);
  const setTool = useBoardGenerator((s) => s.setTool);
  const selection = useBoardGenerator((s) => s.selection);
  const clipboard = useBoardGenerator((s) => s.clipboard);
  const floating = useBoardGenerator((s) => s.floating);
  const setSelection = useBoardGenerator((s) => s.setSelection);
  const copySelection = useBoardGenerator((s) => s.copySelection);
  const cutSelection = useBoardGenerator((s) => s.cutSelection);
  const deleteSelection = useBoardGenerator((s) => s.deleteSelection);
  const pasteAt = useBoardGenerator((s) => s.pasteAt);
  const rotateSelectionCW = useBoardGenerator((s) => s.rotateSelectionCW);
  const beginFloat = useBoardGenerator((s) => s.beginFloat);
  const moveFloat = useBoardGenerator((s) => s.moveFloat);
  const rotateFloatCW = useBoardGenerator((s) => s.rotateFloatCW);
  const commitFloat = useBoardGenerator((s) => s.commitFloat);
  const cancelFloat = useBoardGenerator((s) => s.cancelFloat);

  const loadBoard = useCallback(
    (board: Board) => {
      resetTo(board);
    },
    [resetTo],
  );

  const onLoadBoardById = useCallback(
    (id: string) => {
      const b = useLibrary.getState().boards.find((x) => x.id === id);
      if (b) loadBoard(b);
    },
    [loadBoard],
  );

  // Honor cross-panel "open in generator" requests.
  useEffect(() => {
    if (!pendingBoardId) return;
    const b = useLibrary.getState().boards.find((x) => x.id === pendingBoardId);
    if (b) loadBoard(b);
    clearPendingBoard();
  }, [pendingBoardId, clearPendingBoard, loadBoard]);

  const fillEmpty = useCallback(() => {
    if (brush === 'eraser') return;
    fillEmptyAction(brush);
  }, [brush, fillEmptyAction]);

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
    markSaved();
  }, [boardId, name, width, height, tileSet, layout, saveBoard, markSaved]);

  const onSaveAs = useCallback(() => {
    const suggested = `${name.trim() || 'Untitled'} copy`;
    const next = window.prompt('Save as — new board name', suggested);
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed) return;
    const freshId = adoptNewBoardId(trimmed);
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
  }, [name, width, height, tileSet, layout, saveBoard]);

  const onNew = useCallback(() => {
    resetNew(`Board ${savedBoards.length + 1}`);
  }, [resetNew, savedBoards.length]);

  const savedRecently = useMemo(
    () => savedAt !== null && Date.now() - savedAt < 3000,
    [savedAt],
  );

  // ---- Ctrl+F = fill empty cells with the active brush --------------------
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

  // ---- Selection-mode hotkeys --------------------------------------------
  // V → select tool, B → brush tool, Esc → cancel float / drop selection,
  // Del → clear cells under selection, Ctrl+C/X/V → copy/cut/paste,
  // R → rotate float (or rotate selection in place).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      )
        return;

      const k = e.key.toLowerCase();

      // Tool toggles (no modifiers)
      if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        if (k === 'v') {
          e.preventDefault();
          setTool('select');
          return;
        }
        if (k === 'b') {
          e.preventDefault();
          setTool('paint');
          return;
        }
        if (k === 'r' && tool === 'select') {
          // While floating, rotate the float; otherwise rotate the cells
          // under the selection in place.
          e.preventDefault();
          if (floating) rotateFloatCW();
          else if (selection) rotateSelectionCW();
          return;
        }
        if (k === 'enter' && floating) {
          e.preventDefault();
          commitFloat();
          return;
        }
        if (e.key === 'Escape') {
          if (floating) {
            e.preventDefault();
            cancelFloat();
            return;
          }
          if (selection) {
            e.preventDefault();
            setSelection(null);
          }
          return;
        }
        if ((e.key === 'Delete' || e.key === 'Backspace') && tool === 'select' && selection) {
          e.preventDefault();
          if (floating) {
            // Deleting a float = drop it without stamping.
            cancelFloat();
            deleteSelection();
          } else {
            deleteSelection();
          }
          return;
        }
        // Arrow nudge while floating
        if (floating && e.key.startsWith('Arrow')) {
          e.preventDefault();
          const dr =
            e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
          const dc =
            e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
          moveFloat(floating.row + dr, floating.col + dc);
          return;
        }
      }

      // Clipboard ops require Ctrl/Cmd
      if (e.ctrlKey || e.metaKey) {
        if (k === 'c' && selection) {
          e.preventDefault();
          copySelection();
          return;
        }
        if (k === 'x' && selection) {
          e.preventDefault();
          cutSelection();
          return;
        }
        if (k === 'v' && clipboard && selection) {
          e.preventDefault();
          pasteAt(selection.r0, selection.c0);
          return;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    tool,
    selection,
    clipboard,
    floating,
    setTool,
    setSelection,
    copySelection,
    cutSelection,
    deleteSelection,
    pasteAt,
    rotateSelectionCW,
    rotateFloatCW,
    moveFloat,
    commitFloat,
    cancelFloat,
  ]);

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
            <SaveSplitButton
              onPrimary={onSave}
              primaryTitle="Save (overwrite current board)"
              menuItems={[{ label: 'Save as new…', onClick: onSaveAs }]}
            />
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
            onClear={clearCanvas}
            tool={tool}
            onToolChange={setTool}
          />
        </aside>

        {/* Canvas viewport. Section is the scroll container (`overflow-auto`).
            The inner wrapper uses `min-w-full min-h-full` so it fills the
            section when the canvas is smaller (centred via flex-center) AND
            grows past the section when a zoomed-in canvas overflows — which
            is what makes both axes actually pannable. Without `min-w-full`,
            `justify-center` on an overflowing child clips the left side and
            leaves it unreachable. */}
        <section className="overflow-auto rounded-lg border border-neutral-800 bg-neutral-950">
          <div className="flex min-h-full min-w-full items-center justify-center p-6">
            <GridCanvas
              width={width}
              height={height}
              layout={layout}
              brush={brush}
              shiftHeld={shiftHeld}
              cellSize={cellSize}
              tool={tool}
              selection={selection}
              floating={floating}
              hasClipboard={!!clipboard && clipboard.length > 0}
              onPaint={paint}
              onEraseColor={eraseColor}
              onReplaceColor={replaceColor}
              onAddEdge={addEdge}
              onRemoveEdge={removeEdge}
              onSelectionChange={setSelection}
              onCopy={copySelection}
              onCut={cutSelection}
              onDelete={deleteSelection}
              onRotate={() => {
                if (floating) rotateFloatCW();
                else if (selection) rotateSelectionCW();
              }}
              onPasteAt={(r, c) => {
                pasteAt(r, c);
              }}
              onBeginFloat={beginFloat}
              onMoveFloat={moveFloat}
              onCommitFloat={commitFloat}
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
            onWidthChange={setWidth}
            onHeightChange={setHeight}
            tileSet={tileSet}
          />
        </aside>
      </div>
    </div>
  );
}

