import type { CSSProperties } from 'react';
import { cellStyleFor, useTileRender } from './tileRender';
import type { Cell } from '../types';
import type { CellAnim } from '../store/sequencerStore';

interface Props {
  width: number;
  height: number;
  layout: Cell[][];
  cellSize?: number;
  gap?: number;
  className?: string;

  // Optional interactivity
  selectedCell?: { row: number; col: number } | null;
  matchedCells?: Set<string>;
  onCellClick?: (row: number, col: number) => void;
  onCellMouseDown?: (row: number, col: number, e: React.MouseEvent) => void;
  disabled?: boolean;

  // Optional per-cell animation overlay (driven by the sequencer store)
  cellAnims?: Record<string, CellAnim>;
}

/**
 * Grid renderer shared by the Library preview, the Board Generator, and the
 * Gameplay Sequencer. When `cellAnims` is provided, each cell's transform
 * reflects its animated offset/scale/dip — pieces visually slide/squash/dip
 * like Blender keyframes while the grid array updates logically.
 */
export function BoardView({
  width,
  height,
  layout,
  cellSize = 36,
  gap = 2,
  className = '',
  selectedCell = null,
  matchedCells,
  onCellClick,
  onCellMouseDown,
  disabled = false,
  cellAnims,
}: Props) {
  const { mode, set } = useTileRender();
  const interactive = (!!onCellClick || !!onCellMouseDown) && !disabled;
  const hasAnimations = cellAnims !== undefined;

  // When animations are active we disable CSS transitions (we drive values
  // ourselves via the frame loop). Otherwise keep the smooth hover feel.
  const containerStyle: CSSProperties = {
    gap: `${gap}px`,
    gridTemplateColumns: `repeat(${width}, ${cellSize}px)`,
    gridTemplateRows: `repeat(${height}, ${cellSize}px)`,
    overflow: hasAnimations ? 'visible' : undefined,
  };

  return (
    <div
      className={`inline-grid select-none rounded-lg border border-neutral-800 bg-neutral-900 p-3 ${className}`}
      style={containerStyle}
    >
      {Array.from({ length: height }).flatMap((_, row) =>
        Array.from({ length: width }).map((__, col) => {
          const key = `${row}:${col}`;
          const cell = layout[row]?.[col] ?? null;
          const isSelected =
            selectedCell !== null &&
            selectedCell.row === row &&
            selectedCell.col === col;
          const isMatched =
            !hasAnimations && (matchedCells?.has(key) ?? false);
          const anim = cellAnims?.[key];

          const tx = (anim?.offsetCol ?? 0) * (cellSize + gap);
          const ty =
            ((anim?.offsetRow ?? 0) + (anim?.dip ?? 0)) * (cellSize + gap);
          const scale = hasAnimations ? (anim?.scale ?? 1) : isMatched ? 0 : 1;
          const opacity = hasAnimations
            ? anim?.scale !== undefined
              ? anim.scale
              : 1
            : isMatched
              ? 0
              : 1;

          const style: CSSProperties = {
            ...cellStyleFor(cell, mode, set),
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
            opacity,
            transition: hasAnimations
              ? 'none'
              : 'transform 200ms ease-out, opacity 200ms ease-out, box-shadow 120ms ease-out',
            boxShadow: isSelected
              ? '0 0 0 2px #fafafa, 0 0 12px rgba(250,250,250,0.4)'
              : undefined,
            willChange: hasAnimations ? 'transform, opacity' : undefined,
          };

          const baseClass =
            'rounded border border-neutral-800 bg-neutral-950';
          const interactiveClass = interactive
            ? ' cursor-pointer hover:border-neutral-500'
            : '';

          if (interactive) {
            return (
              <button
                key={key}
                type="button"
                onClick={onCellClick ? () => onCellClick(row, col) : undefined}
                onMouseDown={
                  onCellMouseDown
                    ? (e) => onCellMouseDown(row, col, e)
                    : undefined
                }
                onDragStart={(e) => e.preventDefault()}
                className={baseClass + interactiveClass}
                style={style}
                aria-label={`cell ${row},${col}`}
              />
            );
          }
          return <div key={key} className={baseClass} style={style} />;
        }),
      )}
    </div>
  );
}
