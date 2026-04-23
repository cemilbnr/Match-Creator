import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type TilePreviewMode = 'fill' | 'image';

interface SettingsState {
  tilePreviewMode: TilePreviewMode;
  activeTileSetId: string;
  /** Whether the match cards in the sequencer strip show a thumbnail preview. */
  showMatchPreview: boolean;
  /**
   * Target frame length for newly recorded matches. 0 = auto (use the
   * computed minimum). Positive values are clamped up to the computed
   * minimum per match so the animation still fits.
   */
  defaultMatchFrames: number;
  setTilePreviewMode: (m: TilePreviewMode) => void;
  setActiveTileSetId: (id: string) => void;
  setShowMatchPreview: (v: boolean) => void;
  setDefaultMatchFrames: (n: number) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      tilePreviewMode: 'fill',
      activeTileSetId: 'set-00',
      showMatchPreview: true,
      defaultMatchFrames: 0,
      setTilePreviewMode: (m) => set({ tilePreviewMode: m }),
      setActiveTileSetId: (id) => set({ activeTileSetId: id }),
      setShowMatchPreview: (v) => set({ showMatchPreview: v }),
      setDefaultMatchFrames: (n) =>
        set({ defaultMatchFrames: Math.max(0, Math.round(n)) }),
    }),
    { name: 'match-creator:settings:v3' },
  ),
);
