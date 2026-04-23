import { create } from 'zustand';
import { useSequencer } from './sequencerStore';

export type PanelId =
  | 'board-generator'
  | 'board-analyzer'
  | 'board-library'
  | 'gameplay-sequencer'
  | 'settings';

interface PanelDef {
  id: PanelId;
  label: string;
}

export const PANELS: PanelDef[] = [
  { id: 'board-generator', label: 'Board Generator' },
  { id: 'board-analyzer', label: 'Board Analyzer' },
  { id: 'board-library', label: 'Board Library' },
  { id: 'gameplay-sequencer', label: 'Gameplay Sequencer' },
  { id: 'settings', label: 'Settings' },
];

interface UIState {
  activePanel: PanelId;
  /** One-shot signal: set when another panel wants the generator to load a board. */
  pendingBoardId: string | null;

  setPanel: (p: PanelId) => void;
  openBoardInGenerator: (id: string) => void;
  openBoardInSequencer: (id: string) => void;
  clearPendingBoard: () => void;
}

export const useUI = create<UIState>((set) => ({
  activePanel: 'board-generator',
  pendingBoardId: null,

  setPanel: (p) => set({ activePanel: p }),
  openBoardInGenerator: (id) =>
    set({ activePanel: 'board-generator', pendingBoardId: id }),
  openBoardInSequencer: (id) => {
    useSequencer.getState().setBoardId(id);
    set({ activePanel: 'gameplay-sequencer' });
  },
  clearPendingBoard: () => set({ pendingBoardId: null }),
}));
