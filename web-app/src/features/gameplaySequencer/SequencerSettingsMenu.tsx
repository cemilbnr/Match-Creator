import { useEffect, useRef, useState } from 'react';
import { SettingsIcon } from '../../components/icons';
import { IconButton, Pill, Toggle } from '../../components/ui';
import { useSequencer } from '../../store/sequencerStore';
import { useSettings } from '../../store/settingsStore';

/**
 * Gear icon in the page header. Opens a small popover with:
 *   - Match preview toggle (sequencer-local UI setting)
 *   - Default match length (applies to newly recorded matches)
 *   - Advanced / experimental toggles (Cascade WIP)
 */
export function SequencerSettingsMenu() {
  const showMatchPreview = useSettings((s) => s.showMatchPreview);
  const setShowMatchPreview = useSettings((s) => s.setShowMatchPreview);
  const defaultMatchFrames = useSettings((s) => s.defaultMatchFrames);
  const setDefaultMatchFrames = useSettings((s) => s.setDefaultMatchFrames);
  const cascadeEnabled = useSequencer((s) => s.cascadeEnabled);
  const setCascadeEnabled = useSequencer((s) => s.setCascadeEnabled);

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Local text state for the input so we can support "clear the field".
  const [frameInput, setFrameInput] = useState<string>(
    defaultMatchFrames > 0 ? String(defaultMatchFrames) : '',
  );

  useEffect(() => {
    setFrameInput(defaultMatchFrames > 0 ? String(defaultMatchFrames) : '');
  }, [defaultMatchFrames]);

  const commitFrameInput = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === '') {
      setDefaultMatchFrames(0);
      return;
    }
    const n = Number(trimmed);
    if (Number.isFinite(n)) setDefaultMatchFrames(n);
  };

  return (
    <div ref={wrapRef} className="relative">
      <IconButton
        onClick={() => setOpen((v) => !v)}
        title="Sequencer settings"
        aria-expanded={open}
      >
        <SettingsIcon />
      </IconButton>

      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-80 rounded-md border border-neutral-700 bg-neutral-900 p-3 shadow-2xl ring-1 ring-black/40">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            Display
          </div>
          <Toggle
            label="Match preview"
            description="Show a small board thumbnail on each match card."
            checked={showMatchPreview}
            onChange={setShowMatchPreview}
          />

          <div className="my-3 h-px bg-neutral-800" />

          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            Recording
          </div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm text-neutral-100">Default match length</div>
              <div className="mt-0.5 text-[11px] leading-snug text-neutral-500">
                Frames assigned to new matches. Blank = use the computed
                minimum (swap + cascades).
              </div>
            </div>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={600}
                placeholder="Auto"
                value={frameInput}
                onChange={(e) => setFrameInput(e.target.value)}
                onBlur={() => commitFrameInput(frameInput)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                className="h-9 w-20 rounded-md border border-neutral-800 bg-neutral-950 px-2 text-right text-sm text-neutral-100 focus:border-neutral-500 focus:outline-none"
              />
              <span className="text-[11px] text-neutral-500">f</span>
            </div>
          </div>

          <div className="my-3 h-px bg-neutral-800" />

          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            Advanced
            <Pill tone="warn">WIP</Pill>
          </div>
          <Toggle
            label="Cascade"
            description="Pieces fall and new ones spawn after a match."
            checked={cascadeEnabled}
            onChange={setCascadeEnabled}
          />
        </div>
      )}
    </div>
  );
}
