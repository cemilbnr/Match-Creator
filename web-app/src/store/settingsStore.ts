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
  /**
   * When true (default), the Send / Update flow in the sequencer pulls the
   * scene's timeline markers from Blender and pads each match so its swap
   * starts on the marker named "1", "2", "3", … in order. If the variant
   * has more matches than there are numeric markers, the user is warned and
   * can choose to abort or fall back to natural sequencing.
   */
  syncMatchesWithMarkers: boolean;
  setTilePreviewMode: (m: TilePreviewMode) => void;
  setActiveTileSetId: (id: string) => void;
  setShowMatchPreview: (v: boolean) => void;
  setDefaultMatchFrames: (n: number) => void;
  setSyncMatchesWithMarkers: (v: boolean) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      tilePreviewMode: 'fill',
      activeTileSetId: 'set-00',
      showMatchPreview: true,
      defaultMatchFrames: 0,
      syncMatchesWithMarkers: true,
      setTilePreviewMode: (m) => set({ tilePreviewMode: m }),
      setActiveTileSetId: (id) => set({ activeTileSetId: id }),
      setShowMatchPreview: (v) => set({ showMatchPreview: v }),
      setDefaultMatchFrames: (n) =>
        set({ defaultMatchFrames: Math.max(0, Math.round(n)) }),
      setSyncMatchesWithMarkers: (v) => set({ syncMatchesWithMarkers: v }),
    }),
    { name: 'match-creator:settings:v4' },
  ),
);
