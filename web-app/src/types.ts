export type PieceColor = 'red' | 'blue' | 'green' | 'yellow';
export type Brush = PieceColor | 'eraser';
export type Cell = PieceColor | null;

export interface Board {
  id: string;
  name: string;
  width: number;
  height: number;
  tileSet: string;          // placeholder: "default" for now
  layout: Cell[][];         // [row][col]
  createdAt: number;
  updatedAt: number;
}

export const DEFAULT_BOARD_WIDTH = 12;
export const DEFAULT_BOARD_HEIGHT = 8;
export const MIN_BOARD_SIDE = 1;
export const MAX_BOARD_SIDE = 20;
