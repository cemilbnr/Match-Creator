export type PieceColor = 'red' | 'blue' | 'green' | 'yellow';
/** `'gap'` is a structural board feature — a cell that never holds a tile
 *  (e.g., a hole in an irregular board). Rendered distinctly from an
 *  unpainted / empty cell. */
export type Cell = PieceColor | 'gap' | null;
export type Brush = PieceColor | 'eraser' | 'gap';

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
