import { useMemo } from 'react';
import { useLibrary } from '../../store/libraryStore';
import { useSequencer } from '../../store/sequencerStore';

/**
 * Header component: a full-list dropdown on the left + the last three
 * most-recent boards as quick-switch chips on the right. Sole source of
 * board navigation inside the Sequencer.
 */
export function BoardSwitcher() {
  const boards = useLibrary((s) => s.boards);
  const boardId = useSequencer((s) => s.boardId);
  const setBoardId = useSequencer((s) => s.setBoardId);
  const animating = useSequencer((s) => s.animating);

  const recents = useMemo(() => {
    return [...boards]
      .filter((b) => b.id !== boardId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 3);
  }, [boards, boardId]);

  if (boards.length === 0) return null;

  return (
    <div className="flex items-center gap-3">
      <label className="flex items-center gap-2 text-xs text-neutral-500">
        Board
        <select
          value={boardId ?? ''}
          onChange={(e) => setBoardId(e.target.value || null)}
          disabled={animating}
          className="h-9 w-56 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 transition focus:border-neutral-500 focus:outline-none disabled:opacity-60"
        >
          {boardId === null && (
            <option value="" disabled>
              Select a board…
            </option>
          )}
          {boards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} ({b.width}×{b.height})
            </option>
          ))}
        </select>
      </label>

      {recents.length > 0 && (
        <div className="flex items-center gap-1.5 border-l border-neutral-800 pl-3">
          <span className="text-[11px] uppercase tracking-wide text-neutral-600">
            Recent
          </span>
          {recents.map((b) => (
            <button
              key={b.id}
              type="button"
              disabled={animating}
              onClick={() => setBoardId(b.id)}
              title={`${b.name} (${b.width}×${b.height})`}
              className="h-7 max-w-[120px] truncate rounded-full border border-neutral-800 bg-neutral-925 px-2.5 text-xs text-neutral-300 transition hover:border-neutral-600 hover:text-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 disabled:opacity-50"
            >
              {b.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
