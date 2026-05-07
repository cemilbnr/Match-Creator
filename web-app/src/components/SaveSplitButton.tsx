import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDownIcon, SaveIcon } from './icons';

/**
 * Split-button: primary "Save" action on the left, dropdown chevron on the
 * right that exposes secondary save modes (e.g. "Save as new…"). Used by
 * BoardGenerator and the in-sequencer VariantEditor — same component so the
 * affordance feels identical in both places.
 *
 * `tone` controls the primary button colour. Default ("primary") is the
 * white pill used in BoardGenerator. `secondary` is a quieter slate look
 * for when this button is one of several save actions and shouldn't pull
 * focus from a separate primary CTA.
 */
export function SaveSplitButton({
  primaryLabel = 'Save',
  primaryTitle,
  onPrimary,
  menuItems,
  tone = 'primary',
  disabled = false,
  leading,
}: {
  primaryLabel?: string;
  primaryTitle?: string;
  onPrimary: () => void;
  menuItems: { label: string; onClick: () => void; disabled?: boolean }[];
  tone?: 'primary' | 'secondary';
  disabled?: boolean;
  leading?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
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

  const primaryColors =
    tone === 'primary'
      ? 'bg-neutral-100 text-neutral-900 hover:bg-white'
      : 'border border-neutral-800 bg-neutral-950 text-neutral-200 hover:border-neutral-600 hover:text-neutral-50';
  const chevronColors =
    tone === 'primary'
      ? 'border-l border-neutral-300 bg-neutral-100 text-neutral-900 hover:bg-white'
      : 'border-l border-neutral-800 bg-neutral-950 text-neutral-300 hover:text-neutral-50';

  return (
    <div ref={wrapRef} className="relative inline-flex">
      <button
        type="button"
        onClick={onPrimary}
        disabled={disabled}
        title={primaryTitle ?? primaryLabel}
        className={`inline-flex h-9 items-center gap-2 rounded-l-md px-3.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 disabled:cursor-not-allowed disabled:opacity-50 ${primaryColors}`}
      >
        {leading ?? <SaveIcon />}
        {primaryLabel}
      </button>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className={`inline-flex h-9 w-7 items-center justify-center rounded-r-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 disabled:cursor-not-allowed disabled:opacity-50 ${chevronColors}`}
        title="More save options"
        aria-expanded={open}
      >
        <ChevronDownIcon />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+4px)] z-30 w-48 rounded-md border border-neutral-700 bg-neutral-900 p-1 shadow-2xl ring-1 ring-black/40">
          {menuItems.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                if (item.disabled) return;
                setOpen(false);
                item.onClick();
              }}
              disabled={item.disabled}
              className="flex w-full items-center rounded px-3 py-2 text-left text-sm text-neutral-200 transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:text-neutral-500"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
