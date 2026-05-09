import { useState } from 'react';
import { BoardThumbnail } from '../../components/BoardThumbnail';
import { TrashIcon } from '../../components/icons';
import { IconButton } from '../../components/ui';
import { useGameplayGenerator } from '../../store/gameplayGeneratorStore';

const DRAG_MIME = 'application/x-mc-preview-match-index';

export function PreviewTimeline() {
  const matches = useGameplayGenerator((s) => s.previewMatches);
  const reorder = useGameplayGenerator((s) => s.reorderPreviewMatch);
  const removeAt = useGameplayGenerator((s) => s.removePreviewMatchAt);
  const width = useGameplayGenerator((s) => s.width);
  const height = useGameplayGenerator((s) => s.height);

  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (matches.length === 0) return null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-neutral-500">
        Preview · {matches.length} match{matches.length === 1 ? '' : 'es'}
      </div>
      <div className="mx-1 h-8 w-px bg-neutral-800" />
      {matches.map((m, idx) => {
        const isDragging = draggingIdx === idx;
        const isHover = hoverIdx === idx && draggingIdx !== null && draggingIdx !== idx;
        return (
          <div
            key={m.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData(DRAG_MIME, String(idx));
              setDraggingIdx(idx);
            }}
            onDragEnd={() => {
              setDraggingIdx(null);
              setHoverIdx(null);
            }}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setHoverIdx(idx);
            }}
            onDragLeave={() => {
              if (hoverIdx === idx) setHoverIdx(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              const raw = e.dataTransfer.getData(DRAG_MIME);
              const from = Number(raw);
              if (Number.isFinite(from) && from !== idx) reorder(from, idx);
              setDraggingIdx(null);
              setHoverIdx(null);
            }}
            className={`relative flex shrink-0 flex-col items-stretch gap-1 rounded-md border bg-neutral-925 p-1.5 transition ${
              isDragging
                ? 'opacity-40'
                : isHover
                  ? 'border-emerald-500/70'
                  : 'border-neutral-800'
            }`}
            style={{ width: 96, cursor: 'grab' }}
          >
            <div className="flex items-center justify-between text-[10px] text-neutral-400">
              <span className="font-semibold text-neutral-200">#{idx + 1}</span>
              <IconButton
                tone="danger"
                size="sm"
                onClick={() => removeAt(idx)}
                title="Remove match"
              >
                <TrashIcon />
              </IconButton>
            </div>
            <div className="flex items-center justify-center rounded bg-neutral-950 p-1">
              <BoardThumbnail
                width={width}
                height={height}
                layout={m.initialGrid}
                maxWidthPx={84}
                maxHeightPx={64}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
