import { Kbd, Pill, Section } from '../../components/ui';
import { EraserIcon } from '../../components/icons';
import type { Brush } from '../../types';
import { PIECES } from '../../data/pieceTypes';

interface Props {
  brush: Brush;
  shiftHeld: boolean;
  onSelect: (brush: Brush) => void;
  onFillEmpty: () => void;
  onClear: () => void;
}

export function BrushPanel({ brush, shiftHeld, onSelect, onFillEmpty, onClear }: Props) {
  return (
    <div className="flex flex-col gap-5">
      <Section
        variant="framed"
        title="Brushes"
        action={shiftHeld ? <Pill tone="warn">Lock filled</Pill> : null}
      >
        {PIECES.map((p) => (
          <BrushButton
            key={p.id}
            selected={brush === p.id}
            onClick={() => onSelect(p.id)}
            hotkey={p.key.toUpperCase()}
            swatch={
              <span
                className="inline-block h-4 w-4 rounded-sm"
                style={{ backgroundColor: p.hex }}
                aria-hidden
              />
            }
            label={p.label}
          />
        ))}
        <BrushButton
          selected={brush === 'gap'}
          onClick={() => onSelect('gap')}
          hotkey="G"
          swatch={
            <span
              className="inline-block h-4 w-4 rounded-sm"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(45deg, rgb(23 23 23) 0 2px, rgb(64 64 64) 2px 4px)',
                borderColor: 'rgb(64 64 64)',
              }}
              aria-hidden
            />
          }
          label="Gap"
        />
        <BrushButton
          selected={brush === 'eraser'}
          onClick={() => onSelect('eraser')}
          hotkey=""
          swatch={
            <span
              className="inline-block h-4 w-4 rounded-sm border border-dashed border-neutral-500 bg-neutral-950"
              aria-hidden
            />
          }
          label="Eraser"
        />
      </Section>

      <Section variant="framed" title="Quick actions">
        <QuickActionButton
          onClick={onFillEmpty}
          disabled={brush === 'eraser'}
          icon={<FillIconFor brush={brush} />}
          label="Fill empty"
          hotkey="Ctrl+F"
          title={
            brush === 'eraser'
              ? 'Pick a color or Gap brush first'
              : 'Fill every empty cell with the selected brush'
          }
        />
        <QuickActionButton
          onClick={onClear}
          icon={<EraserIcon className="text-neutral-400" />}
          label="Clear canvas"
          tone="danger"
          title="Wipe every cell on the board"
        />
      </Section>

      <Section variant="framed" title="Shortcuts">
        <ShortcutRow keys={[['Left-click'], ['Drag']]} desc="Paint with the selected brush" />
        <ShortcutRow keys={[['Right-click']]} desc="Erase a cell" />
        <ShortcutRow
          keys={[['Shift'], ['Drag']]}
          desc="Paint empties only — locks cells that already have a piece"
        />
        <ShortcutRow keys={[['Ctrl', 'F']]} desc="Fill every empty cell with the brush" />
        <ShortcutRow
          keys={[['Ctrl'], ['Right-click']]}
          desc="Wipe every cell of the clicked color"
        />
        <ShortcutRow
          keys={[['Alt'], ['Right-click']]}
          desc="Repaint every cell of the clicked color with the active brush"
        />
      </Section>
    </div>
  );
}

/** Vertical shortcut row — keys on top, description below. Handles
 *  multi-chunk combos like [Ctrl] + [Right-click] cleanly. */
function ShortcutRow({
  keys,
  desc,
}: {
  keys: string[][];
  desc: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md px-2 py-1.5">
      <div className="flex flex-wrap items-center gap-1">
        {keys.map((chunk, ci) => (
          <span key={ci} className="inline-flex items-center gap-0.5">
            {ci > 0 && <span className="px-1 text-[10px] text-neutral-600">+</span>}
            {chunk.map((k, ki) => (
              <Kbd key={ki}>{k}</Kbd>
            ))}
          </span>
        ))}
      </div>
      <div className="text-[11px] leading-snug text-neutral-500">{desc}</div>
    </div>
  );
}

function FillIconFor({ brush }: { brush: Brush }) {
  if (brush === 'eraser') {
    return (
      <span
        className="inline-block h-4 w-4 rounded-sm border border-dashed border-neutral-600 bg-neutral-950"
        aria-hidden
      />
    );
  }
  if (brush === 'gap') {
    return (
      <span
        className="inline-block h-4 w-4 rounded-sm border border-neutral-600"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, rgb(23 23 23) 0 2px, rgb(64 64 64) 2px 4px)',
        }}
        aria-hidden
      />
    );
  }
  const hex = PIECES.find((p) => p.id === brush)?.hex;
  return (
    <span
      className="inline-block h-4 w-4 rounded-sm"
      style={{ backgroundColor: hex }}
      aria-hidden
    />
  );
}

function QuickActionButton({
  onClick,
  disabled,
  icon,
  label,
  hotkey,
  tone = 'neutral',
  title,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  hotkey?: string;
  tone?: 'neutral' | 'danger';
  title?: string;
}) {
  const danger = tone === 'danger';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      className={`flex h-9 items-center justify-between gap-2 rounded-md border px-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
        danger
          ? 'border-neutral-800 bg-neutral-950 text-neutral-200 hover:border-rose-600/60 hover:bg-rose-500/10 hover:text-rose-200'
          : 'border-neutral-800 bg-neutral-950 text-neutral-200 hover:border-neutral-600 hover:bg-neutral-900'
      }`}
    >
      <span className="flex items-center gap-2.5">
        {icon}
        <span>{label}</span>
      </span>
      {hotkey && (
        <kbd className="rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 text-[10px] text-neutral-400">
          {hotkey}
        </kbd>
      )}
    </button>
  );
}

function BrushButton({
  selected,
  onClick,
  swatch,
  label,
  hotkey,
}: {
  selected: boolean;
  onClick: () => void;
  swatch: React.ReactNode;
  label: string;
  hotkey: string;
}) {
  // Active state borrows from the iPadOS-style design pass: a subtle
  // row-fill plus a 2px accent bar pinned to the left edge. Quieter than
  // a bordered filled pill, but still unmistakable at a glance.
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex h-9 items-center justify-between gap-2 rounded-md px-2.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 ${
        selected
          ? 'bg-white/[0.06] text-neutral-50'
          : 'text-neutral-200 hover:bg-white/[0.035]'
      }`}
    >
      {selected && (
        <span
          aria-hidden
          className="absolute left-1 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-emerald-400"
        />
      )}
      <span className="flex items-center gap-2.5">
        {swatch}
        <span>{label}</span>
      </span>
      {hotkey && <Kbd>{hotkey}</Kbd>}
    </button>
  );
}

