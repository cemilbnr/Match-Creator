import { Field, Input, Section } from '../../components/ui';
import type { Board } from '../../types';
import { MAX_BOARD_SIDE, MIN_BOARD_SIDE } from '../../types';

interface Props {
  savedBoards: Board[];
  currentBoardId: string;
  onLoadBoard: (id: string) => void;

  name: string;
  width: number;
  height: number;
  onNameChange: (v: string) => void;
  onWidthChange: (v: number) => void;
  onHeightChange: (v: number) => void;

  tileSet: string;
}

export function BoardPreferences(props: Props) {
  const exists = props.savedBoards.some((b) => b.id === props.currentBoardId);

  return (
    <div className="flex flex-col gap-5">
      <Section title="Board">
        <Field label="Name">
          <Input
            type="text"
            value={props.name}
            onChange={(e) => props.onNameChange(e.target.value)}
          />
        </Field>

        <Field label="Size" hint={`${MIN_BOARD_SIDE}–${MAX_BOARD_SIDE} per side`}>
          <div className="grid grid-cols-2 gap-2">
            <LabeledNumber label="W" value={props.width} onChange={props.onWidthChange} />
            <LabeledNumber label="H" value={props.height} onChange={props.onHeightChange} />
          </div>
        </Field>
      </Section>

      <Section title="Load existing">
        <select
          value={exists ? props.currentBoardId : ''}
          onChange={(e) => {
            if (e.target.value) props.onLoadBoard(e.target.value);
          }}
          className="h-9 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 focus:border-neutral-500 focus:outline-none"
        >
          <option value="" disabled>
            {props.savedBoards.length === 0 ? 'No boards saved' : 'Select a board…'}
          </option>
          {props.savedBoards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} ({b.width}×{b.height})
            </option>
          ))}
        </select>
      </Section>

      {props.tileSet && (
        <Section title="Tile set">
          <div className="rounded-md border border-dashed border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-500">
            Default placeholder — material library comes later.
          </div>
        </Section>
      )}
    </div>
  );
}

function LabeledNumber({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex h-9 items-center rounded-md border border-neutral-800 bg-neutral-950 focus-within:border-neutral-500">
      <span className="px-2.5 text-xs text-neutral-500">{label}</span>
      <input
        type="number"
        value={value}
        min={MIN_BOARD_SIDE}
        max={MAX_BOARD_SIDE}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
        className="h-full w-full bg-transparent pr-2 text-sm text-neutral-100 focus:outline-none"
      />
    </div>
  );
}
