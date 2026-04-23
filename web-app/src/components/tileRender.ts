import type { CSSProperties } from 'react';
import { PIECE_BY_ID } from '../data/pieceTypes';
import { getTileSet, type TileSet } from '../data/tileSets';
import { useSettings, type TilePreviewMode } from '../store/settingsStore';
import type { Cell } from '../types';

export function useTileRender(): { mode: TilePreviewMode; set: TileSet } {
  const mode = useSettings((s) => s.tilePreviewMode);
  const setId = useSettings((s) => s.activeTileSetId);
  return { mode, set: getTileSet(setId) };
}

export function cellStyleFor(
  cell: Cell,
  mode: TilePreviewMode,
  set: TileSet,
): CSSProperties {
  if (cell === null) return {};
  if (cell === 'gap') {
    // Diagonal stripe pattern reads immediately as "not a tile slot" —
    // distinct from both an unpainted cell and any piece color.
    return {
      backgroundImage:
        'repeating-linear-gradient(45deg, rgb(23 23 23) 0 4px, rgb(38 38 38) 4px 8px)',
      borderColor: 'rgb(64 64 64)',
    };
  }
  if (mode === 'fill') {
    const hex = PIECE_BY_ID[cell].hex;
    return { backgroundColor: hex, borderColor: hex };
  }
  const url = set.tiles[cell];
  if (!url) {
    // Fallback: solid color if an image is missing
    const hex = PIECE_BY_ID[cell].hex;
    return { backgroundColor: hex, borderColor: hex };
  }
  return {
    backgroundImage: `url("${url}")`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    borderColor: 'transparent',
  };
}
