import type { PieceColor } from '../types';

export interface TileSet {
  id: string;
  label: string;
  tiles: Record<PieceColor, string>;
}

// URLs are resolved via Vite's publicDir (../assets), so
// /set00/R_Tile.png → MATCH_CREATOR/assets/set00/R_Tile.png
export const TILE_SETS: TileSet[] = [
  {
    id: 'set-00',
    label: 'Set 00',
    tiles: {
      red:    '/set00/R_Tile.png',
      blue:   '/set00/B_tile.png',
      green:  '/set00/G_Tile.png',
      yellow: '/set00/Y_Tile.png',
    },
  },
];

const BY_ID: Record<string, TileSet> = Object.fromEntries(
  TILE_SETS.map((s) => [s.id, s]),
);

export function getTileSet(id: string): TileSet {
  return BY_ID[id] ?? TILE_SETS[0]!;
}
