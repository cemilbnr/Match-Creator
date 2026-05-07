import { useEffect, useRef, useState } from 'react';
import { CopyIcon, RedoIcon, TrashIcon } from '../../components/icons';
import { cellStyleFor, useTileRender } from '../../components/tileRender';
import type {
  BoardSide,
  GeneratorTool,
  SelectionRect,
} from '../../store/boardGeneratorStore';
import { MAX_BOARD_SIDE, MIN_BOARD_SIDE } from '../../types';
import type { Brush, Cell, PieceColor } from '../../types';

interface FloatingOverlay {
  content: Cell[][];
  row: number;
  col: number;
}

interface Props {
  width: number;
  height: number;
  layout: Cell[][];
  brush: Brush;
  /** While held, painting skips cells that already have a piece. */
  shiftHeld: boolean;
  /** Side length of each cell in px. */
  cellSize?: number;
  /** Active tool. Drives whether mousedown paints or starts a marquee. */
  tool: GeneratorTool;

  selection: SelectionRect | null;
  floating: FloatingOverlay | null;
  hasClipboard: boolean;

  onPaint: (row: number, col: number, value: Cell) => void;
  /** Ctrl + right-click on a painted cell: erase every cell of that color. */
  onEraseColor: (color: PieceColor) => void;
  /** Alt + right-click on a painted cell: repaint every cell of that color with `to`. */
  onReplaceColor: (from: PieceColor, to: PieceColor) => void;
  /** Edge +/- buttons: add or remove a single row/col from the given side. */
  onAddEdge: (side: BoardSide) => void;
  onRemoveEdge: (side: BoardSide) => void;

  onSelectionChange: (rect: SelectionRect | null) => void;
  onCopy: () => void;
  onCut: () => void;
  onDelete: () => void;
  /** Rotate gizmo — rotates the float (or selection in place if no float). */
  onRotate: () => void;
  onPasteAt: (row: number, col: number) => void;

  /** Lift the current selection's content into a float. */
  onBeginFloat: () => void;
  /** Move the active float to a new top-left cell. */
  onMoveFloat: (row: number, col: number) => void;
  /** Stamp the float into the layout at its current position. */
  onCommitFloat: () => void;
}

/** Width/height of an edge band in CSS pixels. */
const EDGE_THICKNESS = 22;

export function GridCanvas({
  width,
  height,
  layout,
  brush,
  shiftHeld,
  cellSize = 32,
  tool,
  selection,
  floating,
  hasClipboard,
  onPaint,
  onEraseColor,
  onReplaceColor,
  onAddEdge,
  onRemoveEdge,
  onSelectionChange,
  onCopy,
  onCut,
  onDelete,
  onRotate,
  onPasteAt,
  onBeginFloat,
  onMoveFloat,
  onCommitFloat,
}: Props) {
  const [painting, setPainting] = useState<null | 'paint' | 'erase'>(null);
  const { mode, set } = useTileRender();

  // Track Ctrl/Cmd globally so the edge buttons can flip from + to −.
  const [ctrlHeld, setCtrlHeld] = useState(false);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) setCtrlHeld(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) setCtrlHeld(false);
    };
    const clear = () => setCtrlHeld(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clear);
    };
  }, []);

  const paintValue: Cell = brush === 'eraser' ? null : brush;

  const apply = (row: number, col: number, m: 'paint' | 'erase') => {
    if (m === 'erase') {
      onPaint(row, col, null);
      return;
    }
    if (shiftHeld) {
      const existing = layout[row]?.[col] ?? null;
      if (existing !== null) return;
    }
    onPaint(row, col, paintValue);
  };

  const gap = Math.max(2, Math.round(cellSize / 16));
  const gridWidthPx = width * cellSize + (width - 1) * gap;
  const gridHeightPx = height * cellSize + (height - 1) * gap;
  const padPx = EDGE_THICKNESS + 6;

  const canAdd = {
    top: height < MAX_BOARD_SIDE,
    bottom: height < MAX_BOARD_SIDE,
    left: width < MAX_BOARD_SIDE,
    right: width < MAX_BOARD_SIDE,
  };
  const canRemove = {
    top: height > MIN_BOARD_SIDE,
    bottom: height > MIN_BOARD_SIDE,
    left: width > MIN_BOARD_SIDE,
    right: width > MIN_BOARD_SIDE,
  };

  const onEdgeClick = (side: BoardSide) => {
    if (ctrlHeld) {
      if (canRemove[side]) onRemoveEdge(side);
    } else {
      if (canAdd[side]) onAddEdge(side);
    }
  };
  const edgeMode: 'add' | 'remove' = ctrlHeld ? 'remove' : 'add';

  // ---- Marquee dragging --------------------------------------------------
  const [dragRect, setDragRect] = useState<SelectionRect | null>(null);
  const dragRef = useRef<{ origin: { row: number; col: number } } | null>(null);

  // ---- Floating drag-move ------------------------------------------------
  // When the user mousedowns INSIDE the current selection, we lift the cells
  // into a float and move it as the cursor travels. The originCellOffset is
  // the (row,col) gap between the cursor cell and the float's top-left, so
  // dragging keeps the lifted region aligned with the cursor.
  const moveDragRef = useRef<{
    originCellOffset: { dr: number; dc: number };
  } | null>(null);

  const beginMarquee = (row: number, col: number) => {
    dragRef.current = { origin: { row, col } };
    setDragRect({ r0: row, c0: col, r1: row, c1: col });
  };
  const updateMarquee = (row: number, col: number) => {
    const o = dragRef.current?.origin;
    if (!o) return;
    setDragRect({ r0: o.row, c0: o.col, r1: row, c1: col });
  };
  const endMarquee = () => {
    if (!dragRef.current || !dragRect) {
      dragRef.current = null;
      return;
    }
    onSelectionChange(dragRect);
    dragRef.current = null;
    setDragRect(null);
  };

  // Cancel an in-flight marquee on global mouseup so dropping outside the
  // grid still commits cleanly. Same hook also commits an in-flight float
  // move when the mouse is released anywhere.
  useEffect(() => {
    if (tool !== 'select') return;
    const onUp = () => {
      if (dragRef.current) endMarquee();
      if (moveDragRef.current) {
        onCommitFloat();
        moveDragRef.current = null;
      }
    };
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, dragRect]);

  const isInsideSelection = (row: number, col: number): boolean => {
    if (!selection) return false;
    const r0 = Math.min(selection.r0, selection.r1);
    const r1 = Math.max(selection.r0, selection.r1);
    const c0 = Math.min(selection.c0, selection.c1);
    const c1 = Math.max(selection.c0, selection.c1);
    return row >= r0 && row <= r1 && col >= c0 && col <= c1;
  };

  const liveRect = dragRect ?? selection;
  const showSelection = !!liveRect && tool === 'select';

  const rectStyle = liveRect
    ? rectToPx(liveRect, cellSize, gap, padPx)
    : null;

  // Floating overlay positioning — the float's content is rendered as an
  // absolutely-positioned mini-grid on top of the layout.
  const floatStyle = floating
    ? rectToPx(
        {
          r0: floating.row,
          c0: floating.col,
          r1: floating.row + floating.content.length - 1,
          c1: floating.col + (floating.content[0]?.length ?? 1) - 1,
        },
        cellSize,
        gap,
        padPx,
      )
    : null;

  return (
    <div
      className="relative inline-block select-none rounded-lg border border-neutral-800 bg-neutral-900"
      onMouseLeave={() => setPainting(null)}
      onMouseUp={() => setPainting(null)}
      onContextMenu={(e) => e.preventDefault()}
      style={{ padding: `${padPx}px` }}
    >
      {/* Edge buttons */}
      <EdgeButton
        side="top"
        mode={edgeMode}
        disabled={edgeMode === 'add' ? !canAdd.top : !canRemove.top}
        onClick={() => onEdgeClick('top')}
        style={{
          position: 'absolute',
          left: padPx,
          top: 4,
          width: gridWidthPx,
          height: EDGE_THICKNESS,
        }}
      />
      <EdgeButton
        side="bottom"
        mode={edgeMode}
        disabled={edgeMode === 'add' ? !canAdd.bottom : !canRemove.bottom}
        onClick={() => onEdgeClick('bottom')}
        style={{
          position: 'absolute',
          left: padPx,
          bottom: 4,
          width: gridWidthPx,
          height: EDGE_THICKNESS,
        }}
      />
      <EdgeButton
        side="left"
        mode={edgeMode}
        disabled={edgeMode === 'add' ? !canAdd.left : !canRemove.left}
        onClick={() => onEdgeClick('left')}
        style={{
          position: 'absolute',
          left: 4,
          top: padPx,
          width: EDGE_THICKNESS,
          height: gridHeightPx,
        }}
      />
      <EdgeButton
        side="right"
        mode={edgeMode}
        disabled={edgeMode === 'add' ? !canAdd.right : !canRemove.right}
        onClick={() => onEdgeClick('right')}
        style={{
          position: 'absolute',
          right: 4,
          top: padPx,
          width: EDGE_THICKNESS,
          height: gridHeightPx,
        }}
      />

      <div
        className="grid"
        style={{
          gap: `${gap}px`,
          gridTemplateColumns: `repeat(${width}, ${cellSize}px)`,
          gridTemplateRows: `repeat(${height}, ${cellSize}px)`,
        }}
      >
        {Array.from({ length: height }).flatMap((_, row) =>
          Array.from({ length: width }).map((__, col) => {
            const cell = layout[row]?.[col] ?? null;
            return (
              <button
                key={`${row}:${col}`}
                type="button"
                className="rounded border border-neutral-800 bg-neutral-950 transition hover:border-neutral-600"
                style={{
                  width: cellSize,
                  height: cellSize,
                  ...cellStyleFor(cell, mode, set),
                  cursor:
                    tool === 'select' && isInsideSelection(row, col)
                      ? 'move'
                      : undefined,
                }}
                onMouseDown={(e) => {
                  if (tool === 'select') {
                    if (e.button !== 0) return;
                    // Mousedown inside the existing selection → start a
                    // floating drag-move. Otherwise → new marquee.
                    if (selection && isInsideSelection(row, col)) {
                      // Lift the float (no-op if one already exists), then
                      // record the cursor's offset relative to the float's
                      // top-left so dragging stays anchored to the cell the
                      // user grabbed.
                      if (!floating) onBeginFloat();
                      const baseRow = floating ? floating.row : selection.r0;
                      const baseCol = floating ? floating.col : selection.c0;
                      moveDragRef.current = {
                        originCellOffset: {
                          dr: row - baseRow,
                          dc: col - baseCol,
                        },
                      };
                      return;
                    }
                    beginMarquee(row, col);
                    return;
                  }
                  if (
                    e.button === 2 &&
                    (e.ctrlKey || e.metaKey) &&
                    cell !== null &&
                    cell !== 'gap'
                  ) {
                    onEraseColor(cell);
                    return;
                  }
                  if (
                    e.button === 2 &&
                    e.altKey &&
                    cell !== null &&
                    cell !== 'gap' &&
                    brush !== 'eraser' &&
                    brush !== 'gap' &&
                    cell !== brush
                  ) {
                    onReplaceColor(cell, brush);
                    return;
                  }
                  const m: 'paint' | 'erase' = e.button === 2 ? 'erase' : 'paint';
                  setPainting(m);
                  apply(row, col, m);
                }}
                onMouseEnter={() => {
                  if (tool === 'select') {
                    if (moveDragRef.current) {
                      const { dr, dc } = moveDragRef.current.originCellOffset;
                      onMoveFloat(row - dr, col - dc);
                    } else if (dragRef.current) {
                      updateMarquee(row, col);
                    }
                  } else if (painting) {
                    apply(row, col, painting);
                  }
                }}
                aria-label={`cell ${row},${col}`}
              />
            );
          }),
        )}
      </div>

      {/* Floating overlay — rendered above the layout so the lifted cells
          sit on top of whatever's underneath. Pointer events disabled so
          underlying cells still receive enter/down events for drag-move. */}
      {floating && floatStyle && (
        <div
          className="pointer-events-none absolute"
          style={{
            ...floatStyle,
            // Match the cell grid's gap so floating cells align with the
            // layout grid behind them.
          }}
        >
          <div
            className="grid"
            style={{
              gap: `${gap}px`,
              gridTemplateColumns: `repeat(${
                floating.content[0]?.length ?? 1
              }, ${cellSize}px)`,
              gridTemplateRows: `repeat(${floating.content.length}, ${cellSize}px)`,
              // The floatStyle had +1 outline padding; offset back by 1px
              // so cells line up with the layout grid lines.
              transform: 'translate(1px, 1px)',
            }}
          >
            {floating.content.map((row, dr) =>
              row.map((cell, dc) => (
                <div
                  key={`f-${dr}-${dc}`}
                  className="rounded border border-sky-300/60 shadow-[0_0_8px_rgba(56,189,248,0.35)]"
                  style={{
                    width: cellSize,
                    height: cellSize,
                    ...cellStyleFor(cell, mode, set),
                    opacity: cell === null ? 0 : 0.92,
                  }}
                />
              )),
            )}
          </div>
        </div>
      )}

      {/* Selection overlay (dashed marquee) — drawn over the float so the
          user can still see where the float is going to land. */}
      {showSelection && rectStyle && (
        <div
          className="pointer-events-none absolute rounded-sm border-2 border-dashed border-sky-300/90 shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
          style={rectStyle}
        />
      )}

      {/* Rotate gizmo — small handle anchored above the marquee top-right.
          Click rotates the float (or selection in place) 90° CW. */}
      {showSelection && rectStyle && tool === 'select' && (
        <RotateGizmo rectStyle={rectStyle} onClick={onRotate} />
      )}

      {/* Floating selection toolbar (no rotate button; rotation is the
          dedicated gizmo above). */}
      {showSelection && rectStyle && tool === 'select' && (
        <SelectionToolbar
          rectStyle={rectStyle}
          hasClipboard={hasClipboard}
          isFloating={!!floating}
          onCopy={onCopy}
          onCut={onCut}
          onDelete={onDelete}
          onPaste={() => {
            if (!liveRect) return;
            onPasteAt(liveRect.r0, liveRect.c0);
          }}
          onCommit={onCommitFloat}
        />
      )}
    </div>
  );
}

function rectToPx(
  rect: SelectionRect,
  cellSize: number,
  gap: number,
  padPx: number,
): React.CSSProperties {
  const r0 = Math.min(rect.r0, rect.r1);
  const r1 = Math.max(rect.r0, rect.r1);
  const c0 = Math.min(rect.c0, rect.c1);
  const c1 = Math.max(rect.c0, rect.c1);
  const left = padPx + c0 * (cellSize + gap) - 1;
  const top = padPx + r0 * (cellSize + gap) - 1;
  const widthPx = (c1 - c0 + 1) * cellSize + (c1 - c0) * gap + 2;
  const heightPx = (r1 - r0 + 1) * cellSize + (r1 - r0) * gap + 2;
  return { left, top, width: widthPx, height: heightPx };
}

// ---------- RotateGizmo ----------------------------------------------------
// Anchors above the top-right corner of the marquee. Click → 90° CW rotation.
// Drawn as a circular handle so it reads as a control rather than a chip.

function RotateGizmo({
  rectStyle,
  onClick,
}: {
  rectStyle: React.CSSProperties;
  onClick: () => void;
}) {
  const top = (rectStyle.top as number) ?? 0;
  const left = (rectStyle.left as number) ?? 0;
  const w = (rectStyle.width as number) ?? 0;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      title="Rotate 90° CW (R)"
      style={{
        position: 'absolute',
        top: top - 18,
        left: left + w - 12,
        width: 24,
        height: 24,
      }}
      className="z-30 inline-flex items-center justify-center rounded-full border border-sky-400/80 bg-neutral-900 text-sky-300 shadow-md transition hover:scale-110 hover:border-sky-300 hover:text-sky-100"
    >
      <RedoIcon width={13} height={13} />
    </button>
  );
}

// ---------- SelectionToolbar ----------------------------------------------

function SelectionToolbar({
  rectStyle,
  hasClipboard,
  isFloating,
  onCopy,
  onCut,
  onDelete,
  onPaste,
  onCommit,
}: {
  rectStyle: React.CSSProperties;
  hasClipboard: boolean;
  isFloating: boolean;
  onCopy: () => void;
  onCut: () => void;
  onDelete: () => void;
  onPaste: () => void;
  onCommit: () => void;
}) {
  const top = (rectStyle.top as number) ?? 0;
  const left = (rectStyle.left as number) ?? 0;
  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      className="absolute z-20 flex items-center gap-0.5 rounded-md border border-neutral-700 bg-neutral-900/95 px-1 py-0.5 text-neutral-200 shadow-lg backdrop-blur"
      style={{ top: top - 30, left }}
    >
      <ToolbarButton onClick={onCopy} title="Copy (Ctrl+C)">
        <CopyIcon width={14} height={14} />
      </ToolbarButton>
      <ToolbarButton onClick={onCut} title="Cut (Ctrl+X)">
        <span className="text-[10px] font-semibold">CUT</span>
      </ToolbarButton>
      {hasClipboard && (
        <ToolbarButton onClick={onPaste} title="Paste (Ctrl+V)">
          <span className="text-[10px] font-semibold">PASTE</span>
        </ToolbarButton>
      )}
      {isFloating && (
        <ToolbarButton onClick={onCommit} title="Drop float (Enter)">
          <span className="text-[10px] font-semibold text-emerald-300">DROP</span>
        </ToolbarButton>
      )}
      <ToolbarButton onClick={onDelete} title="Clear cells (Del)" tone="danger">
        <TrashIcon width={14} height={14} />
      </ToolbarButton>
    </div>
  );
}

function ToolbarButton({
  onClick,
  title,
  tone = 'neutral',
  children,
}: {
  onClick: () => void;
  title: string;
  tone?: 'neutral' | 'danger';
  children: React.ReactNode;
}) {
  const danger = tone === 'danger';
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`inline-flex h-6 min-w-6 items-center justify-center rounded px-1.5 transition ${
        danger
          ? 'hover:bg-rose-500/20 hover:text-rose-200'
          : 'hover:bg-neutral-800 hover:text-neutral-50'
      }`}
    >
      {children}
    </button>
  );
}

// ---------- EdgeButton -----------------------------------------------------

interface EdgeButtonProps {
  side: BoardSide;
  mode: 'add' | 'remove';
  disabled: boolean;
  onClick: () => void;
  style: React.CSSProperties;
}

function EdgeButton({ side, mode, disabled, onClick, style }: EdgeButtonProps) {
  const [hovered, setHovered] = useState(false);
  const repeatRef = useRef<number | null>(null);

  const startRepeat = () => {
    if (disabled) return;
    onClick();
    let delay = 240;
    const tick = () => {
      onClick();
      delay = Math.max(60, delay - 30);
      repeatRef.current = window.setTimeout(tick, delay);
    };
    repeatRef.current = window.setTimeout(tick, 320);
  };
  const stopRepeat = () => {
    if (repeatRef.current !== null) {
      window.clearTimeout(repeatRef.current);
      repeatRef.current = null;
    }
  };
  useEffect(() => () => stopRepeat(), []);

  const removeTone = mode === 'remove';
  const baseColor = disabled
    ? 'border-neutral-900 bg-neutral-925/40 text-neutral-700'
    : removeTone
      ? hovered
        ? 'border-rose-500/80 bg-rose-500/15 text-rose-200'
        : 'border-rose-700/40 bg-rose-500/5 text-rose-300/80'
      : hovered
        ? 'border-emerald-500/80 bg-emerald-500/15 text-emerald-200'
        : 'border-neutral-700 bg-neutral-900 text-neutral-400';

  const tooltipAxis = side === 'top' || side === 'bottom' ? 'row' : 'column';
  const verb = mode === 'add' ? 'Add' : 'Remove';
  const tooltip = `${verb} a ${tooltipAxis} on the ${side}${
    mode === 'add' ? ' (Ctrl-click to remove)' : ''
  }`;

  void side;

  return (
    <button
      type="button"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        startRepeat();
      }}
      onPointerUp={stopRepeat}
      onPointerLeave={() => {
        setHovered(false);
        stopRepeat();
      }}
      onPointerEnter={() => setHovered(true)}
      disabled={disabled}
      title={tooltip}
      aria-label={tooltip}
      style={style}
      className={`flex items-center justify-center rounded-md border text-sm font-semibold transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-30 ${baseColor}`}
    >
      <Glyph mode={mode} />
    </button>
  );
}

function Glyph({ mode }: { mode: 'add' | 'remove' }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {mode === 'add' && <path d="M12 5v14" />}
      <path d="M5 12h14" />
    </svg>
  );
}
