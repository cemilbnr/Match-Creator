import { useEffect, useState } from 'react';
import { PIECE_BY_KEY } from '../../data/pieceTypes';
import type { Brush } from '../../types';

/**
 * Global keyboard controls for painting:
 *   Q = red, W = blue, E = green, R = yellow
 *   Holding Shift temporarily flips the effective brush to 'eraser'
 * Inputs and textareas are ignored so typing a Board name doesn't steal focus.
 */
export function useBrushControls(initial: Brush = 'red') {
  const [brush, setBrush] = useState<Brush>(initial);
  const [shiftHeld, setShiftHeld] = useState(false);

  useEffect(() => {
    const isEditable = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      return target.isContentEditable;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setShiftHeld(true);
        return;
      }
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditable(e.target)) return;
      const color = PIECE_BY_KEY[e.key.toLowerCase()];
      if (color) {
        e.preventDefault();
        setBrush(color);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftHeld(false);
    };

    const onBlur = () => setShiftHeld(false);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  return { brush, setBrush, shiftHeld };
}
