import { useCallback, useEffect, useMemo } from 'react';
import { CheckIcon, CloseIcon } from '../../components/icons';
import { SaveSplitButton } from '../../components/SaveSplitButton';
import { Button, IconButton, PageHeader } from '../../components/ui';
import { useBoardGenerator } from '../../store/boardGeneratorStore';
import { useLibrary } from '../../store/libraryStore';
import { useSequencer } from '../../store/sequencerStore';
import { useVariants } from '../../store/variantsStore';
import type { Board } from '../../types';
import { BrushPanel } from '../boardGenerator/BrushPanel';
import { GridCanvas } from '../boardGenerator/GridCanvas';
import { useBrushControls } from '../boardGenerator/useBrushControls';

/**
 * In-sequencer editor for a variant's board layout. Hijacks the
 * BoardGenerator's persistent store while active — the sequencer's
 * beginEditVariant() snapshots that store before loading the variant's
 * layout, and commit/cancel restore it. We rely on that contract here.
 */
export function VariantEditor() {
  const editingVariantId = useSequencer((s) => s.editingVariantId);
  const commitEdit = useSequencer((s) => s.commitEditVariant);
  const cancelEdit = useSequencer((s) => s.cancelEditVariant);

  const variant = useVariants((s) =>
    s.variants.find((v) => v.id === editingVariantId) ?? null,
  );
  const board = useLibrary((s) =>
    variant ? s.boards.find((b) => b.id === variant.boardId) ?? null : null,
  );
  const saveBoard = useLibrary((s) => s.saveBoard);

  const { brush, shiftHeld, setBrush } = useBrushControls('red');

  // Generator store
  const name = useBoardGenerator((s) => s.name);
  const width = useBoardGenerator((s) => s.width);
  const height = useBoardGenerator((s) => s.height);
  const layout = useBoardGenerator((s) => s.layout);
  const cellSize = useBoardGenerator((s) => s.cellSize);

  const paint = useBoardGenerator((s) => s.paint);
  const eraseColor = useBoardGenerator((s) => s.eraseColor);
  const replaceColor = useBoardGenerator((s) => s.replaceColor);
  const fillEmptyAction = useBoardGenerator((s) => s.fillEmpty);
  const clearCanvas = useBoardGenerator((s) => s.clearCanvas);
  const addEdge = useBoardGenerator((s) => s.addEdge);
  const removeEdge = useBoardGenerator((s) => s.removeEdge);

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

  const fillEmpty = useCallback(() => {
    if (brush === 'eraser') return;
    fillEmptyAction(brush);
  }, [brush, fillEmptyAction]);

  /**
   * "Save to library" — overwrite the underlying board with the edited
   * layout. Other variants of the same board that don't have their own
   * `layoutOverride` will pick up the change automatically; this is the
   * intended behaviour ("apply to all variants of this board").
   *
   * Save and Save as new… leave edit mode the same way Save to variant
   * does, so the user lands back in the sequencer with the new state.
   */
  const onSaveToLibrary = useCallback(() => {
    if (!board) return;
    const finalLayout = useBoardGenerator.getState().layout;
    saveBoard({
      ...board,
      layout: finalLayout.map((r) => r.slice()),
      width: finalLayout[0]?.length ?? board.width,
      height: finalLayout.length,
    });
    // After overwriting the board, clear cancel snapshot via cancelEdit so
    // we don't accidentally re-stamp the variant override on top.
    cancelEdit();
  }, [board, saveBoard, cancelEdit]);

  const onSaveAsNewBoard = useCallback(() => {
    if (!board) return;
    const suggested = `${board.name} variant`;
    const next = window.prompt('Save as new board — name', suggested);
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed) return;
    const finalLayout = useBoardGenerator.getState().layout;
    const fresh: Board = {
      id: `board_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      name: trimmed,
      width: finalLayout[0]?.length ?? board.width,
      height: finalLayout.length,
      tileSet: board.tileSet,
      layout: finalLayout.map((r) => r.slice()),
      createdAt: 0,
      updatedAt: 0,
    };
    saveBoard(fresh);
    cancelEdit();
  }, [board, saveBoard, cancelEdit]);

  // ---- Hotkeys: same set as BoardGenerator, plus Ctrl+Enter to commit ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      )
        return;

      const k = e.key.toLowerCase();

      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        commitEdit();
        return;
      }

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
            return;
          }
          // Final Esc with no float / no selection → cancel edit mode.
          e.preventDefault();
          cancelEdit();
          return;
        }
        if ((e.key === 'Delete' || e.key === 'Backspace') && tool === 'select' && selection) {
          e.preventDefault();
          if (floating) {
            cancelFloat();
            deleteSelection();
          } else {
            deleteSelection();
          }
          return;
        }
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

      if (e.ctrlKey || e.metaKey) {
        if (k === 'f') {
          e.preventDefault();
          fillEmpty();
          return;
        }
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
    commitEdit,
    cancelEdit,
    fillEmpty,
  ]);

  const subtitle = useMemo(() => {
    const matchCount = variant?.matches.length ?? 0;
    if (matchCount === 0) return `${width} × ${height} · editing variant board`;
    return `${width} × ${height} · ${matchCount} recorded match${
      matchCount === 1 ? '' : 'es'
    } may be reset on save if you change dimensions`;
  }, [variant, width, height]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        eyebrow="Editing variant board"
        title={name}
        subtitle={subtitle}
        actions={
          <>
            <Button
              variant="danger"
              size="md"
              leading={<CloseIcon />}
              onClick={cancelEdit}
              title="Discard changes (Esc)"
            >
              Cancel
            </Button>

            {/* Save to library: secondary tone so it doesn't outshout the
                primary "Save to variant" CTA. The split chevron exposes
                "Save as new…" for shipping a fresh board. */}
            <SaveSplitButton
              tone="secondary"
              primaryLabel="Save"
              primaryTitle="Save to library — overwrite the underlying board"
              onPrimary={onSaveToLibrary}
              menuItems={[
                {
                  label: 'Save as new board…',
                  onClick: onSaveAsNewBoard,
                },
              ]}
              disabled={!board}
            />

            <Button
              variant="success"
              size="md"
              leading={<CheckIcon />}
              onClick={commitEdit}
              title="Save to variant (Ctrl+Enter)"
            >
              Save to variant
            </Button>
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

        <section className="flex items-start justify-center overflow-auto rounded-lg border border-neutral-800 bg-neutral-950">
          <div className="flex min-h-full items-center p-6">
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
          <div className="rounded-md border border-neutral-800 bg-neutral-925 p-3 text-[11px] leading-relaxed text-neutral-400">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-300">
              Variant edit mode
            </div>
            <p>
              Painting here saves only on the active variant — the underlying
              board stays untouched. Press{' '}
              <kbd className="rounded border border-neutral-700 bg-neutral-900 px-1 text-[10px]">
                Ctrl+Enter
              </kbd>{' '}
              to save,{' '}
              <kbd className="rounded border border-neutral-700 bg-neutral-900 px-1 text-[10px]">
                Esc
              </kbd>{' '}
              to discard.
            </p>
            {variant && variant.matches.length > 0 && (
              <p className="mt-2 text-amber-300/90">
                Heads up: this variant has {variant.matches.length} recorded
                match{variant.matches.length === 1 ? '' : 'es'}. They&rsquo;ll be
                cleared on save if you change the board dimensions.
              </p>
            )}
          </div>
          <div className="mt-3 flex flex-col gap-2">
            <IconButton
              size="md"
              tone="default"
              onClick={commitEdit}
              title="Save"
              className="!h-12 !w-full bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 hover:text-emerald-100"
            >
              <CheckIcon width={20} height={20} />
            </IconButton>
            <IconButton
              size="md"
              tone="danger"
              onClick={cancelEdit}
              title="Discard"
              className="!h-12 !w-full bg-rose-500/10 hover:bg-rose-500/20"
            >
              <CloseIcon width={20} height={20} />
            </IconButton>
          </div>
        </aside>
      </div>
    </div>
  );
}
