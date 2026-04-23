import { Pill, Section } from '../../components/ui';
import type { Brush } from '../../types';
import { PIECES } from '../../data/pieceTypes';

interface Props {
  brush: Brush;
  shiftHeld: boolean;
  onSelect: (brush: Brush) => void;
  onFillEmpty: () => void;
}

export function BrushPanel({ brush, shiftHeld, onSelect, onFillEmpty }: Props) {
  return (
    <Section
      title="Brushes"
      action={shiftHeld ? <Pill tone="warn">Lock filled</Pill> : null}
    >
      <div className="flex flex-col gap-1">
        {PIECES.map((p) => {
          const selected = brush === p.id;
          return (
            <BrushButton
              key={p.id}
              selected={selected}
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
          );
        })}

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

      <button
        type="button"
        onClick={onFillEmpty}
        disabled={brush === 'eraser'}
        className="flex h-9 items-center justify-between gap-2 rounded-md border border-neutral-800 bg-neutral-950 px-2.5 text-sm font-medium text-neutral-200 transition hover:border-neutral-600 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-40"
        title={
          brush === 'eraser'
            ? 'Pick a color brush first'
            : 'Fill every empty cell with the selected brush'
        }
      >
        <span>Fill empty</span>
        <kbd className="rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 text-[10px] text-neutral-400">
          Ctrl+F
        </kbd>
      </button>

      <div className="flex flex-col gap-1.5 rounded-md border border-neutral-800 bg-neutral-950 p-2.5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
          Shortcuts
        </div>
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
