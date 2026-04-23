import { useMemo, useState } from 'react';
import { sendGameplayToBlender } from '../../api/blenderClient';
import { BoardThumbnail } from '../../components/BoardThumbnail';
import {
  ClockIcon,
  ContinueHereIcon,
  PlayIcon,
  RefreshIcon,
  SendIcon,
  TrashIcon,
} from '../../components/icons';
import { Button, IconButton } from '../../components/ui';
import { useLibrary } from '../../store/libraryStore';
import { useSequencer, type RecordedMatch } from '../../store/sequencerStore';
import { useSettings } from '../../store/settingsStore';
import { useVariants } from '../../store/variantsStore';
import type { Board } from '../../types';
import { buildBlenderExport, type BlenderExportMode } from './blenderExport';

/**
 * Bottom strip: one square card per recorded match + Play + Send.
 *   - Drag cards to reorder.
 *   - Continue icon   → rewind the board to this match's end state, truncate after.
 *   - Clock icon      → edit this match's total duration (hold frames at end).
 *   - Trash icon      → remove the match from the active variant.
 *   - Optional thumbnail preview (toggled from the gear menu).
 */
export function MatchStrip() {
  const boardId = useSequencer((s) => s.boardId);
  const activeVariantId = useSequencer((s) => s.activeVariantId);
  const animating = useSequencer((s) => s.animating);
  const isReplaying = useSequencer((s) => s.isReplaying);
  const replay = useSequencer((s) => s.replayActiveVariant);
  const continueFromMatch = useSequencer((s) => s.continueFromMatch);
  const fps = useSequencer((s) => s.fps);

  const boards = useLibrary((s) => s.boards);
  const variants = useVariants((s) => s.variants);
  const removeMatchAt = useVariants((s) => s.removeMatchAt);
  const reorderMatches = useVariants((s) => s.reorderMatches);
  const setMatchFrameLength = useVariants((s) => s.setMatchFrameLength);

  const showMatchPreview = useSettings((s) => s.showMatchPreview);

  const board = useMemo(
    () => boards.find((b) => b.id === boardId) ?? null,
    [boards, boardId],
  );
  const activeVariant = useMemo(
    () => variants.find((v) => v.id === activeVariantId) ?? null,
    [variants, activeVariantId],
  );

  const matches = activeVariant?.matches ?? [];
  const canReplay = matches.length > 0 && !animating;

  const [blenderStatus, setBlenderStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'sending'; mode: BlenderExportMode }
    | { kind: 'ok'; mode: BlenderExportMode; collection: string; tileCount: number }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });

  const canSendToBlender =
    !!activeVariant &&
    !!board &&
    matches.length > 0 &&
    !animating &&
    blenderStatus.kind !== 'sending';

  const sendBlockReason = !activeVariant
    ? null
    : !board
      ? 'Board not found.'
      : matches.length === 0
        ? 'Record at least one swap first.'
        : null;

  const dispatchBlender = async (mode: BlenderExportMode) => {
    if (!activeVariant || !board) return;
    setBlenderStatus({ kind: 'sending', mode });
    try {
      const payload = buildBlenderExport(board, activeVariant, fps, mode);
      const res = await sendGameplayToBlender(payload);
      setBlenderStatus({
        kind: 'ok',
        mode,
        collection: res.collection,
        tileCount: res.tileCount,
      });
      window.setTimeout(() => {
        setBlenderStatus((s) => (s.kind === 'ok' ? { kind: 'idle' } : s));
      }, 3500);
    } catch (err) {
      setBlenderStatus({
        kind: 'error',
        message: (err as Error).message || 'Unknown error',
      });
      window.setTimeout(() => {
        setBlenderStatus((s) => (s.kind === 'error' ? { kind: 'idle' } : s));
      }, 6000);
    }
  };

  const onSendToBlender = () => dispatchBlender('create');
  const onUpdateVariant = () => dispatchBlender('update');

  // ---- Drag-and-drop reorder ----
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const onSlotDragStart = (index: number) => (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
    setDragIndex(index);
  };
  const onSlotDragOver = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (overIndex !== index) setOverIndex(index);
  };
  const onSlotDrop = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const from = Number(e.dataTransfer.getData('text/plain'));
    if (!activeVariantId) return;
    if (Number.isFinite(from) && from !== index) {
      reorderMatches(activeVariantId, from, index);
    }
    setDragIndex(null);
    setOverIndex(null);
  };
  const onSlotDragEnd = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

  const onChangeLength = (match: RecordedMatch) => {
    if (!activeVariantId) return;
    const current = match.customFrameLength ?? match.frameLength;
    const raw = window.prompt(
      `Frames for this match (minimum ${match.frameLength}). Blank to clear override.`,
      String(current),
    );
    if (raw === null) return;
    const trimmed = raw.trim();
    if (trimmed === '') {
      setMatchFrameLength(activeVariantId, matches.indexOf(match), null);
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return;
    setMatchFrameLength(activeVariantId, matches.indexOf(match), n);
  };

  const totalFrames = matches.reduce(
    (sum, m) => sum + (m.customFrameLength ?? m.frameLength),
    0,
  );

  return (
    <div className="flex flex-col gap-2.5 px-5 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-neutral-500">
          <span>Matches</span>
          {matches.length > 0 && (
            <span className="text-neutral-600">
              · {matches.length} swap{matches.length === 1 ? '' : 's'} · {totalFrames}f total
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <IconButton
            onClick={replay}
            disabled={!canReplay}
            title={
              isReplaying
                ? 'Replaying…'
                : matches.length === 0
                  ? 'Record a swap first (Space)'
                  : 'Replay the active variant (Space)'
            }
          >
            <PlayIcon />
          </IconButton>
          <Button
            size="sm"
            variant="secondary"
            leading={<RefreshIcon />}
            onClick={onUpdateVariant}
            disabled={!canSendToBlender}
            title={
              sendBlockReason ??
              'Refresh the existing GP_<board>_<variant> collection in Blender (keep objects, update keyframes/materials)'
            }
          >
            {blenderStatus.kind === 'sending' && blenderStatus.mode === 'update'
              ? 'Updating…'
              : 'Update variant'}
          </Button>
          <Button
            size="sm"
            variant="primary"
            leading={<SendIcon />}
            onClick={onSendToBlender}
            disabled={!canSendToBlender}
            title={
              sendBlockReason ??
              'Send as a NEW collection (existing ones stay untouched)'
            }
          >
            {blenderStatus.kind === 'sending' && blenderStatus.mode === 'create'
              ? 'Sending…'
              : 'Send to Blender'}
          </Button>
        </div>
      </div>

      <StatusLine
        blenderStatus={blenderStatus}
        sendBlockReason={canSendToBlender ? null : sendBlockReason}
      />

      <div>
        {matches.length === 0 ? (
          <div className="flex h-28 items-center rounded-md border border-dashed border-neutral-800 bg-neutral-925 px-4 text-xs text-neutral-500">
            Drag a piece on the board to record your first match — it lands here.
          </div>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {matches.map((match, i) => (
              <li key={match.id}>
                <MatchCard
                  board={board}
                  match={match}
                  index={i}
                  showPreview={showMatchPreview}
                  disabled={animating}
                  dragging={dragIndex === i}
                  dropTarget={overIndex === i && dragIndex !== null && dragIndex !== i}
                  onContinueHere={() => continueFromMatch(i)}
                  onChangeLength={() => onChangeLength(match)}
                  onRemove={() => {
                    if (!activeVariantId) return;
                    removeMatchAt(activeVariantId, i);
                  }}
                  onDragStart={onSlotDragStart(i)}
                  onDragOver={onSlotDragOver(i)}
                  onDrop={onSlotDrop(i)}
                  onDragEnd={onSlotDragEnd}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatusLine({
  blenderStatus,
  sendBlockReason,
}: {
  blenderStatus:
    | { kind: 'idle' }
    | { kind: 'sending'; mode: BlenderExportMode }
    | { kind: 'ok'; mode: BlenderExportMode; collection: string; tileCount: number }
    | { kind: 'error'; message: string };
  sendBlockReason: string | null;
}) {
  if (blenderStatus.kind === 'ok') {
    const verb = blenderStatus.mode === 'update' ? 'Updated' : 'Built';
    return (
      <div className="rounded-md border border-emerald-700/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200">
        {verb} <span className="font-medium">{blenderStatus.collection}</span> —{' '}
        {blenderStatus.tileCount} tile{blenderStatus.tileCount === 1 ? '' : 's'}.
      </div>
    );
  }
  if (blenderStatus.kind === 'error') {
    return (
      <div className="rounded-md border border-rose-700/40 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-200">
        {blenderStatus.message}
      </div>
    );
  }
  if (sendBlockReason) {
    return <div className="text-[11px] text-neutral-500">{sendBlockReason}</div>;
  }
  return null;
}

const CARD_SIZE_PX = 128;
const CARD_META_BAR_PX = 24;
const CARD_ACTION_BAR_PX = 32;
const CARD_INDICATOR_PX = 2;

function MatchCard({
  board,
  match,
  index,
  showPreview,
  disabled,
  dragging,
  dropTarget,
  onContinueHere,
  onChangeLength,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  board: Board | null;
  match: RecordedMatch;
  index: number;
  showPreview: boolean;
  disabled: boolean;
  dragging: boolean;
  dropTarget: boolean;
  onContinueHere: () => void;
  onChangeLength: () => void;
  onRemove: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const totalFrames = match.customFrameLength ?? match.frameLength;
  const isCustom = match.customFrameLength !== undefined;

  // Final grid AFTER this match completes (for the preview).
  const finalGrid = useMemo(() => {
    if (!showPreview || !board) return null;
    const last = match.cascadeSteps[match.cascadeSteps.length - 1];
    return last ? last.gridAfterCascade : match.initialGrid;
  }, [showPreview, board, match]);

  const cardHeightPx = CARD_SIZE_PX + CARD_META_BAR_PX + CARD_INDICATOR_PX;
  const previewAreaPx = CARD_SIZE_PX - CARD_ACTION_BAR_PX;
  const kind = match.kind ?? 'success';

  return (
    <div
      draggable={!disabled}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      style={{ width: CARD_SIZE_PX, height: cardHeightPx }}
      className={`relative flex cursor-grab flex-col overflow-hidden rounded-md border transition active:cursor-grabbing ${
        dragging ? 'opacity-40' : ''
      } ${
        dropTarget
          ? 'border-sky-400 bg-sky-500/10'
          : 'border-neutral-700 bg-neutral-925 hover:border-neutral-500'
      }`}
    >
      {/* Top indicator strip: green = success, red = fail */}
      <div
        className={`shrink-0 ${
          kind === 'fail' ? 'bg-rose-500' : 'bg-emerald-500'
        }`}
        style={{ height: CARD_INDICATOR_PX }}
        aria-hidden
      />

      {/* Row 1: preview (or large label when preview is off) */}
      <div
        className="flex items-center justify-center bg-neutral-950"
        style={{ height: previewAreaPx }}
      >
        {showPreview && board && finalGrid ? (
          <BoardThumbnail
            width={board.width}
            height={board.height}
            layout={finalGrid}
            maxWidthPx={CARD_SIZE_PX - 12}
            maxHeightPx={previewAreaPx - 12}
          />
        ) : (
          <div className="text-sm font-semibold text-neutral-200">Match {index + 1}</div>
        )}
      </div>

      {/* Row 2: match index | frame length */}
      <div
        className="flex shrink-0 items-center border-t border-neutral-800 bg-neutral-925 text-[11px]"
        style={{ height: CARD_META_BAR_PX }}
      >
        <div className="flex flex-1 items-center justify-center text-neutral-300 tabular-nums">
          #{index + 1}
        </div>
        <div className="h-full w-px bg-neutral-800" />
        <div
          className={`flex flex-1 items-center justify-center tabular-nums ${
            isCustom ? 'text-amber-300' : 'text-neutral-400'
          }`}
          title={isCustom ? `Custom duration (min ${match.frameLength}f)` : 'Computed duration'}
        >
          {totalFrames}f{isCustom ? '*' : ''}
        </div>
      </div>

      {/* Row 3: action bar */}
      <div
        className="flex shrink-0 items-center justify-around border-t border-neutral-800 bg-neutral-925"
        style={{ height: CARD_ACTION_BAR_PX }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onContinueHere();
          }}
          disabled={disabled}
          title="Continue from here (rewind board to this state)"
          className="flex h-full flex-1 items-center justify-center text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-50 disabled:opacity-40"
        >
          <ContinueHereIcon width={14} height={14} />
        </button>
        <div className="h-full w-px bg-neutral-800" />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onChangeLength();
          }}
          disabled={disabled}
          title={`Change duration (min ${match.frameLength}f, current ${totalFrames}f)`}
          className={`flex h-full flex-1 items-center justify-center transition hover:bg-neutral-800 hover:text-neutral-50 disabled:opacity-40 ${
            isCustom ? 'text-amber-300' : 'text-neutral-400'
          }`}
        >
          <ClockIcon width={14} height={14} />
        </button>
        <div className="h-full w-px bg-neutral-800" />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          disabled={disabled}
          title="Remove match"
          className="flex h-full flex-1 items-center justify-center text-neutral-400 transition hover:bg-rose-500/15 hover:text-rose-300 disabled:opacity-40"
        >
          <TrashIcon width={14} height={14} />
        </button>
      </div>
    </div>
  );
}
