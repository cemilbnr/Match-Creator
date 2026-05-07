import { useState } from 'react';
import {
  ChevronDownIcon,
  CopyIcon,
  EditIcon,
  PlusIcon,
  TrashIcon,
} from '../../components/icons';
import { IconButton, Section } from '../../components/ui';
import { useSequencer } from '../../store/sequencerStore';
import { useVariants, type GameplayVariant } from '../../store/variantsStore';

/**
 * Right rail of the Gameplay Sequencer page. Houses the variants list for
 * the active board. FPS / zoom / reset / settings live in the page header.
 */
export function SequencerRightRail() {
  const boardId = useSequencer((s) => s.boardId);
  const animating = useSequencer((s) => s.animating);
  const activeVariantId = useSequencer((s) => s.activeVariantId);
  const setActiveVariantId = useSequencer((s) => s.setActiveVariantId);

  const variants = useVariants((s) => s.variants);
  const createEmptyVariant = useVariants((s) => s.createEmptyVariant);
  const renameVariant = useVariants((s) => s.renameVariant);
  const setVariantComment = useVariants((s) => s.setVariantComment);
  const duplicateVariant = useVariants((s) => s.duplicateVariant);
  const deleteVariant = useVariants((s) => s.deleteVariant);

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const scoped = variants
    .filter((v) => v.boardId === boardId)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const onCreateEmpty = () => {
    if (animating || !boardId) return;
    const name = `Variant ${scoped.length + 1}`;
    const id = createEmptyVariant(name, boardId);
    setActiveVariantId(id);
  };

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-4">
      <Section
        title="Variants"
        action={
          <IconButton
            size="sm"
            onClick={onCreateEmpty}
            disabled={animating || !boardId}
            title="Create an empty variant"
          >
            <PlusIcon />
          </IconButton>
        }
      >
        {!boardId ? (
          <p className="text-[11px] leading-relaxed text-neutral-500">
            Pick a board to see its variants.
          </p>
        ) : scoped.length === 0 ? (
          <p className="text-[11px] leading-relaxed text-neutral-500">
            Drag a tile on the board — we&rsquo;ll auto-create{' '}
            <span className="text-neutral-300">Variant 1</span> on the first swap.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {scoped.map((v) => (
              <li key={v.id}>
                <VariantRow
                  variant={v}
                  active={activeVariantId === v.id}
                  expanded={expandedId === v.id}
                  disabled={animating}
                  onToggleExpand={() =>
                    setExpandedId((id) => (id === v.id ? null : v.id))
                  }
                  onSelect={() => setActiveVariantId(v.id)}
                  onRename={() => {
                    const next = window.prompt('Variant name', v.name);
                    if (next === null) return;
                    const trimmed = next.trim();
                    if (!trimmed || trimmed === v.name) return;
                    renameVariant(v.id, trimmed);
                  }}
                  onCommentChange={(value) => setVariantComment(v.id, value)}
                  onDuplicate={() => {
                    const copyId = duplicateVariant(v.id);
                    if (copyId) setActiveVariantId(copyId);
                  }}
                  onDelete={() => {
                    if (!window.confirm(`Delete variant "${v.name}"?`)) return;
                    deleteVariant(v.id);
                    if (activeVariantId === v.id) setActiveVariantId(null);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function VariantRow({
  variant,
  active,
  expanded,
  disabled,
  onToggleExpand,
  onSelect,
  onRename,
  onCommentChange,
  onDuplicate,
  onDelete,
}: {
  variant: GameplayVariant;
  active: boolean;
  expanded: boolean;
  disabled: boolean;
  onToggleExpand: () => void;
  onSelect: () => void;
  onRename: () => void;
  onCommentChange: (value: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const matchCount = variant.matches.length;
  const totalFrames = variant.matches.reduce(
    (sum, m) => sum + (m.customFrameLength ?? m.frameLength),
    0,
  );
  const hasComment = !!variant.comment && variant.comment.trim().length > 0;

  return (
    <div
      className={`group flex flex-col rounded-md border transition ${
        active
          ? 'border-emerald-500/70 bg-emerald-500/10'
          : 'border-neutral-800 bg-neutral-950 hover:border-neutral-700'
      }`}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onSelect}
          disabled={disabled}
          className="flex flex-1 flex-col items-start gap-0.5 px-3 py-2 text-left disabled:opacity-50"
        >
          <span className="flex w-full items-center gap-2">
            <span className="flex-1 truncate text-xs font-medium text-neutral-100">
              {variant.name}
            </span>
            {hasComment && (
              <span
                title="Has notes"
                className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400/80"
              />
            )}
            {active && (
              <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
            )}
          </span>
          <span className="text-[11px] text-neutral-500">
            {matchCount} {matchCount === 1 ? 'match' : 'matches'} · {totalFrames}f
          </span>
        </button>

        <div className="flex items-center gap-0.5 pr-1">
          {/* Chevron toggle: always visible so the user can find the notes
              area even before hovering the row. */}
          <IconButton
            size="sm"
            onClick={onToggleExpand}
            title={expanded ? 'Hide notes' : 'Show notes'}
            className={expanded ? 'text-neutral-100' : ''}
          >
            <span
              className="inline-flex transition-transform"
              style={{
                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
            >
              <ChevronDownIcon />
            </span>
          </IconButton>
          {/* The row-level actions stay hover-revealed to keep the rail tidy. */}
          <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
            <IconButton size="sm" onClick={onRename} title="Rename" disabled={disabled}>
              <EditIcon />
            </IconButton>
            <IconButton size="sm" onClick={onDuplicate} title="Duplicate" disabled={disabled}>
              <CopyIcon />
            </IconButton>
            <IconButton
              size="sm"
              tone="danger"
              onClick={onDelete}
              title="Delete"
              disabled={disabled}
            >
              <TrashIcon />
            </IconButton>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-neutral-800/80 px-2 pb-2 pt-2">
          <textarea
            value={variant.comment ?? ''}
            onChange={(e) => onCommentChange(e.target.value)}
            placeholder="Notes about this variant — what it tests, the colour palette, who designed it…"
            rows={3}
            className="w-full resize-y rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-[11px] leading-snug text-neutral-200 placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none"
          />
        </div>
      )}
    </div>
  );
}
