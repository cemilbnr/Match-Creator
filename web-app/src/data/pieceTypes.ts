import type { PieceColor } from '../types';

export interface PieceDef {
  id: PieceColor;
  label: string;
  hex: string;
  key: string;    // keyboard shortcut (lowercased)
}

export const PIECES: PieceDef[] = [
  { id: 'red',    label: 'Red',    hex: '#e53935', key: 'q' },
  { id: 'blue',   label: 'Blue',   hex: '#1e88e5', key: 'w' },
  { id: 'green',  label: 'Green',  hex: '#43a047', key: 'e' },
  { id: 'yellow', label: 'Yellow', hex: '#fdd835', key: 'r' },
];

export const PIECE_BY_KEY: Record<string, PieceColor> = Object.fromEntries(
  PIECES.map((p) => [p.key, p.id]),
);

export const PIECE_BY_ID: Record<PieceColor, PieceDef> = Object.fromEntries(
  PIECES.map((p) => [p.id, p]),
) as Record<PieceColor, PieceDef>;
