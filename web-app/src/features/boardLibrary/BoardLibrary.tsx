import { useMemo, useState } from 'react';
import { BoardThumbnail } from '../../components/BoardThumbnail';
import {
  CopyIcon,
  EditIcon,
  FilmIcon,
  SearchIcon,
  TrashIcon,
} from '../../components/icons';
import { Button, IconButton, Input, PageHeader } from '../../components/ui';
import { useLibrary } from '../../store/libraryStore';
import { useUI } from '../../store/uiStore';
import type { Board } from '../../types';

export function BoardLibrary() {
  const boards = useLibrary((s) => s.boards);
  const deleteBoard = useLibrary((s) => s.deleteBoard);
  const duplicateBoard = useLibrary((s) => s.duplicateBoard);
  const openBoardInGenerator = useUI((s) => s.openBoardInGenerator);
  const openBoardInSequencer = useUI((s) => s.openBoardInSequencer);
  const setPanel = useUI((s) => s.setPanel);

  const [query, setQuery] = useState('');

  const ordered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? boards.filter((b) => b.name.toLowerCase().includes(q))
      : boards;
    return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [boards, query]);

  const subtitle =
    boards.length === 0
      ? 'No boards yet — paint one in Board Generator.'
      : `${boards.length} board${boards.length === 1 ? '' : 's'} stored locally`;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        eyebrow="Library"
        title="Boards"
        subtitle={subtitle}
        actions={
          <>
            <Input
              type="search"
              placeholder="Search boards…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              leading={<SearchIcon />}
              className="w-64"
            />
            <Button variant="primary" onClick={() => setPanel('board-generator')}>
              New board
            </Button>
          </>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        {boards.length === 0 ? (
          <EmptyState onStart={() => setPanel('board-generator')} />
        ) : ordered.length === 0 ? (
          <NoResults query={query} />
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {ordered.map((b) => (
              <li key={b.id}>
                <BoardCard
                  board={b}
                  onOpenGenerator={() => openBoardInGenerator(b.id)}
                  onOpenSequencer={() => openBoardInSequencer(b.id)}
                  onDuplicate={() => duplicateBoard(b.id)}
                  onDelete={() => {
                    if (window.confirm(`Delete "${b.name}"?`)) deleteBoard(b.id);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div className="mx-auto mt-20 flex max-w-md flex-col items-center gap-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900 text-neutral-500">
        <SearchIcon width={24} height={24} />
      </div>
      <div>
        <div className="text-base font-semibold text-neutral-100">
          Your library is empty
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          Paint a board, click Save, and it will appear here.
        </p>
      </div>
      <Button variant="primary" onClick={onStart}>
        Open Board Generator
      </Button>
    </div>
  );
}

function NoResults({ query }: { query: string }) {
  return (
    <div className="mx-auto mt-20 max-w-md text-center text-sm text-neutral-500">
      No boards match <span className="text-neutral-200">"{query}"</span>.
    </div>
  );
}

function BoardCard({
  board,
  onOpenGenerator,
  onOpenSequencer,
  onDuplicate,
  onDelete,
}: {
  board: Board;
  onOpenGenerator: () => void;
  onOpenSequencer: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const updated = new Date(board.updatedAt);
  return (
    <article className="group flex flex-col gap-3 rounded-lg border border-neutral-800 bg-neutral-925 p-4 transition hover:border-neutral-700">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-neutral-50">
            {board.name}
          </div>
          <div className="text-[11px] text-neutral-500">
            {board.width} × {board.height} · {formatDate(updated)}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100">
          <IconButton size="sm" onClick={onDuplicate} title="Duplicate">
            <CopyIcon />
          </IconButton>
          <IconButton size="sm" tone="danger" onClick={onDelete} title="Delete">
            <TrashIcon />
          </IconButton>
        </div>
      </div>

      <button
        type="button"
        onClick={onOpenGenerator}
        className="flex items-center justify-center rounded-md border border-neutral-800 bg-neutral-950 p-3 transition hover:border-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
      >
        <BoardThumbnail
          width={board.width}
          height={board.height}
          layout={board.layout}
        />
      </button>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          leading={<EditIcon />}
          onClick={onOpenGenerator}
          className="flex-1"
        >
          Open in generator
        </Button>
        <Button
          variant="secondary"
          size="sm"
          leading={<FilmIcon />}
          onClick={onOpenSequencer}
          className="flex-1"
        >
          Open in sequencer
        </Button>
      </div>
    </article>
  );
}

function formatDate(d: Date): string {
  const now = Date.now();
  const diffSec = Math.floor((now - d.getTime()) / 1000);
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return d.toLocaleDateString();
}
