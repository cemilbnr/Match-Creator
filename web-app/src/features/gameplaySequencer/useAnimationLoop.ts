import { useEffect } from 'react';
import { useSequencer } from '../../store/sequencerStore';

/**
 * Advances the sequencer frame counter at the configured FPS. Runs
 * continuously while the sequencer panel is mounted — `tickFrame` is a cheap
 * no-op when there are no active segments. Frame-locked timing ensures the
 * preview matches the Blender animation 1:1 at the same FPS.
 */
export function useAnimationLoop() {
  const fps = useSequencer((s) => s.fps);

  useEffect(() => {
    const frameIntervalMs = 1000 / Math.max(1, fps);
    let raf = 0;
    let last = performance.now();
    let accum = 0;

    const tick = (now: number) => {
      accum += now - last;
      last = now;
      while (accum >= frameIntervalMs) {
        accum -= frameIntervalMs;
        useSequencer.getState().tickFrame();
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [fps]);
}
