import { Pill, Section } from '../../components/ui';
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
        title="Brushes"
        action={shiftHeld ? <Pill tone="warn">Lock filled</Pill> : null}
      >
        <div className="flex flex-col gap-1">
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
        </div>
      </Section>

      <Section title="Quick actions">
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

      <Section title="Shortcuts">
        <div className="flex flex-col gap-1.5 rounded-md border border-neutral-800 bg-neutral-950 p-2.5">
          <ShortcutLine keys={['Left-click', 'Drag']} desc="Paint with the selected brush" />
          <ShortcutLine keys={['Right-click']} desc="Erase a cell" />
          <ShortcutLine
            keys={['Shift', '+', 'Drag']}
            desc="Paint empties only — locks cells that already have a piece"
          />
          <ShortcutLine keys={['Ctrl+F']} desc="Fill every empty cell with the brush" />
          <ShortcutLine
            keys={['Ctrl', '+', 'Right-click']}
            desc="Wipe every cell of the clicked color"
          />
          <ShortcutLine
            keys={['Alt', '+', 'Right-click']}
            desc="Repaint every cell of the clicked color with the active brush"
          />
        </div>
      </Section>
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
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-9 items-center justify-between gap-2 rounded-md border px-2.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 ${
        selected
          ? 'border-neutral-500 bg-neutral-800 text-neutral-50'
          : 'border-neutral-800 bg-neutral-950 text-neutral-200 hover:border-neutral-700'
      }`}
    >
      <span className="flex items-center gap-2.5">
        {swatch}
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

function ShortcutLine({ keys, desc }: { keys: string[]; desc: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-neutral-500">
      <span className="flex shrink-0 items-center gap-0.5">
        {keys.map((k) =>
          k === '+' ? (
            <span key={k} className="px-0.5 text-neutral-600">
              +
            </span>
          ) : (
            <kbd
              key={k}
              className="rounded border border-neutral-700 bg-neutral-900 px-1 py-0.5 text-[10px] font-medium text-neutral-300"
            >
              {k}
            </kbd>
          ),
        )}
      </span>
      <span className="leading-snug">{desc}</span>
    </div>
  );
}
