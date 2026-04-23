import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Board } from '../types';

interface LibraryState {
  boards: Board[];
  saveBoard: (board: Board) => void;
  deleteBoard: (id: string) => void;
  duplicateBoard: (id: string) => string | null;
}

function newBoardId() {
  return `board_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const useLibrary = create<LibraryState>()(
  persist(
    (set) => ({
      boards: [],
      saveBoard: (board) =>
        set((state) => {
          const now = Date.now();
          const idx = state.boards.findIndex((b) => b.id === board.id);
          if (idx >= 0) {
            const next = state.boards.slice();
            next[idx] = { ...board, updatedAt: now };
            return { boards: next };
          }
          return {
            boards: [
              ...state.boards,
              { ...board, createdAt: board.createdAt || now, updatedAt: now },
            ],
          };
        }),
      deleteBoard: (id) =>
        set((state) => ({ boards: state.boards.filter((b) => b.id !== id) })),
      duplicateBoard: (id) => {
        const state = useLibrary.getState();
        const src = state.boards.find((b) => b.id === id);
        if (!src) return null;
        const now = Date.now();
        const copy: Board = {
          ...src,
          id: newBoardId(),
          name: `${src.name} copy`,
          layout: src.layout.map((r) => r.slice()),
          createdAt: now,
          updatedAt: now,
        };
        set({ boards: [...state.boards, copy] });
        return copy.id;
      },
    }),
    { name: 'match-creator:library:v1' },
  ),
);
