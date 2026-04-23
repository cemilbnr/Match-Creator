import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { RecordedMatch } from './sequencerStore';

export interface GameplayVariant {
  id: string;
  name: string;
  boardId: string | null;
  matches: RecordedMatch[];
  createdAt: number;
  updatedAt: number;
}

interface VariantsState {
  variants: GameplayVariant[];
  addVariant: (
    name: string,
    boardId: string | null,
    matches: RecordedMatch[],
  ) => string;
  createEmptyVariant: (name: string, boardId: string | null) => string;
  updateVariantMatches: (id: string, matches: RecordedMatch[]) => void;
  appendMatchToVariant: (id: string, match: RecordedMatch) => void;
  removeMatchAt: (id: string, index: number) => void;
  reorderMatches: (id: string, from: number, to: number) => void;
  /** Drops every match at position > keepUpToIndex. Used by continue-from-here. */
  truncateMatchesAfter: (id: string, keepUpToIndex: number) => void;
  /** Sets customFrameLength on a match. Pass null to clear the override. */
  setMatchFrameLength: (id: string, index: number, frames: number | null) => void;
  renameVariant: (id: string, name: string) => void;
  duplicateVariant: (id: string) => string | null;
  deleteVariant: (id: string) => void;
}

function newVariantId() {
  return `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function cloneMatch(m: RecordedMatch): RecordedMatch {
  // Spread copies the primitive fields (id, frameLength, customFrameLength).
  // The deep fields below get re-cloned explicitly so downstream mutations
  // don't bleed back into the variant store.
  return {
    ...m,
    initialGrid: m.initialGrid.map((r) => r.slice()),
    swap: { from: { ...m.swap.from }, to: { ...m.swap.to } },
    cascadeSteps: m.cascadeSteps.map((s) => ({
      matched: [...s.matched],
      gridAfterCascade: s.gridAfterCascade.map((r) => r.slice()),
    })),
  };
}

export const useVariants = create<VariantsState>()(
  persist(
    (set, get) => ({
      variants: [],
      addVariant: (name, boardId, matches) => {
        const id = newVariantId();
        const now = Date.now();
        const variant: GameplayVariant = {
          id,
          name,
          boardId,
          matches: matches.map(cloneMatch),
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({ variants: [...state.variants, variant] }));
        return id;
      },
      createEmptyVariant: (name, boardId) => {
        const id = newVariantId();
        const now = Date.now();
        const variant: GameplayVariant = {
          id,
          name,
          boardId,
          matches: [],
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({ variants: [...state.variants, variant] }));
        return id;
      },
      updateVariantMatches: (id, matches) =>
        set((state) => ({
          variants: state.variants.map((v) =>
            v.id === id
              ? {
                  ...v,
                  matches: matches.map(cloneMatch),
                  updatedAt: Date.now(),
                }
              : v,
          ),
        })),
      appendMatchToVariant: (id, match) =>
        set((state) => ({
          variants: state.variants.map((v) =>
            v.id === id
              ? {
                  ...v,
                  matches: [...v.matches, cloneMatch(match)],
                  updatedAt: Date.now(),
                }
              : v,
          ),
        })),
      removeMatchAt: (id, index) =>
        set((state) => ({
          variants: state.variants.map((v) => {
            if (v.id !== id) return v;
            if (index < 0 || index >= v.matches.length) return v;
            const next = v.matches.slice();
            next.splice(index, 1);
            return { ...v, matches: next, updatedAt: Date.now() };
          }),
        })),
      reorderMatches: (id, from, to) =>
        set((state) => ({
          variants: state.variants.map((v) => {
            if (v.id !== id) return v;
            const len = v.matches.length;
            if (from < 0 || from >= len || to < 0 || to >= len || from === to)
              return v;
            const next = v.matches.slice();
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved!);
            return { ...v, matches: next, updatedAt: Date.now() };
          }),
        })),
      truncateMatchesAfter: (id, keepUpToIndex) =>
        set((state) => ({
          variants: state.variants.map((v) => {
            if (v.id !== id) return v;
            if (keepUpToIndex < -1) return v;
            const nextLen = keepUpToIndex + 1;
            if (nextLen >= v.matches.length) return v;
            return {
              ...v,
              matches: v.matches.slice(0, Math.max(0, nextLen)),
              updatedAt: Date.now(),
            };
          }),
        })),
      setMatchFrameLength: (id, index, frames) =>
        set((state) => ({
          variants: state.variants.map((v) => {
            if (v.id !== id) return v;
            if (index < 0 || index >= v.matches.length) return v;
            const next = v.matches.slice();
            const current = next[index]!;
            if (frames === null) {
              const { customFrameLength: _discard, ...rest } = current;
              void _discard;
              next[index] = rest;
            } else {
              const clamped = Math.max(current.frameLength, Math.round(frames));
              next[index] = { ...current, customFrameLength: clamped };
            }
            return { ...v, matches: next, updatedAt: Date.now() };
          }),
        })),
      renameVariant: (id, name) =>
        set((state) => ({
          variants: state.variants.map((v) =>
            v.id === id ? { ...v, name, updatedAt: Date.now() } : v,
          ),
        })),
      duplicateVariant: (id) => {
        const src = get().variants.find((v) => v.id === id);
        if (!src) return null;
        const now = Date.now();
        const newId = newVariantId();
        const copy: GameplayVariant = {
          ...src,
          id: newId,
          name: `${src.name} copy`,
          matches: src.matches.map(cloneMatch),
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({ variants: [...state.variants, copy] }));
        return newId;
      },
      deleteVariant: (id) =>
        set((state) => ({ variants: state.variants.filter((v) => v.id !== id) })),
    }),
    { name: 'match-creator:variants:v1' },
  ),
);
