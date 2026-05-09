import { useMemo, useState } from 'react';
import { TrashIcon } from '../../components/icons';
import { Button, Field, IconButton, Input, Pill, Section } from '../../components/ui';
import {
  pathsReady,
  previewReady,
  useGameplayGenerator,
  type ColorCount,
} from '../../store/gameplayGeneratorStore';
import { MAX_BOARD_SIDE, MIN_BOARD_SIDE } from '../../types';
import {
  computePlacements,
  SHAPE_CATEGORIES,
  type ShapeCategory,
} from './placement';
import { ShapeIcon } from './ShapeIcon';

const COLOR_OPTIONS: ColorCount[] = [2, 3, 4];

const CATEGORY_LABELS: Record<ShapeCategory, string> = {
  '3-line': '3-line',
  '4-line': '4-line',
  '2x2': '2×2',
  '3x2': '3×2',
  '4x2': '4×2',
};

export function GeneratorRightRail() {
  const width = useGameplayGenerator((s) => s.width);
  const height = useGameplayGenerator((s) => s.height);
  const matchCount = useGameplayGenerator((s) => s.matchCount);
  const pathThickness = useGameplayGenerator((s) => s.pathThickness);
  const probabilities = useGameplayGenerator((s) => s.probabilities);
  const secondaryMatchProbability = useGameplayGenerator(
    (s) => s.secondaryMatchProbability,
  );
  const colorCount = useGameplayGenerator((s) => s.colorCount);
  const seed = useGameplayGenerator((s) => s.seed);
  const generateSeed = useGameplayGenerator((s) => s.generateSeed);
  const paths = useGameplayGenerator((s) => s.paths);
  const mode = useGameplayGenerator((s) => s.mode);
  const warnings = useGameplayGenerator((s) => s.warnings);
  const isGenerating = useGameplayGenerator((s) => s.isGenerating);
  const previewMatches = useGameplayGenerator((s) => s.previewMatches);

  const resizeBoard = useGameplayGenerator((s) => s.resizeBoard);
  const setMatchCount = useGameplayGenerator((s) => s.setMatchCount);
  const setPathThickness = useGameplayGenerator((s) => s.setPathThickness);
  const setProbability = useGameplayGenerator((s) => s.setProbability);
  const setSecondaryMatchProbability = useGameplayGenerator(
    (s) => s.setSecondaryMatchProbability,
  );
  const setColorCount = useGameplayGenerator((s) => s.setColorCount);
  const setSeed = useGameplayGenerator((s) => s.setSeed);
  const setGenerateSeed = useGameplayGenerator((s) => s.setGenerateSeed);

  const previewSecondaryStats = useGameplayGenerator(
    (s) => s.previewSecondaryStats,
  );

  const setMode = useGameplayGenerator((s) => s.setMode);
  const beginNewPath = useGameplayGenerator((s) => s.beginNewPath);
  const clearAllPaths = useGameplayGenerator((s) => s.clearAllPaths);
  const removePath = useGameplayGenerator((s) => s.removePath);

  const generatePreview = useGameplayGenerator((s) => s.generatePreview);
  const clearPreview = useGameplayGenerator((s) => s.clearPreview);
  const sendPreviewToSequencer = useGameplayGenerator(
    (s) => s.sendPreviewToSequencer,
  );

  const placements = useMemo(
    () =>
      computePlacements({
        paths,
        gridWidth: width,
        gridHeight: height,
        maxCount: matchCount,
        thickness: pathThickness,
        probabilities,
        seed: seed ?? undefined,
        secondaryMatchProbability,
      }),
    [
      paths,
      width,
      height,
      matchCount,
      pathThickness,
      probabilities,
      seed,
      secondaryMatchProbability,
    ],
  );

  const state = useGameplayGenerator.getState();
  const step2Done = pathsReady(state);
  const step3Done = previewReady(state);
  const placementsReady = placements.length > 0;

  const [name, setName] = useState('');

  return (
    <div className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto px-4 py-5">
      <Section title="Board">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Width">
            <input
              type="number"
              min={MIN_BOARD_SIDE}
              max={MAX_BOARD_SIDE}
              value={width}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) resizeBoard(v, height);
              }}
              className="h-9 w-full rounded-md border border-neutral-800 bg-neutral-950 px-2 text-sm text-neutral-100 focus:border-neutral-500 focus:outline-none"
            />
          </Field>
          <Field label="Height">
            <input
              type="number"
              min={MIN_BOARD_SIDE}
              max={MAX_BOARD_SIDE}
              value={height}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) resizeBoard(width, v);
              }}
              className="h-9 w-full rounded-md border border-neutral-800 bg-neutral-950 px-2 text-sm text-neutral-100 focus:border-neutral-500 focus:outline-none"
            />
          </Field>
        </div>

        <Field
          label="Match count"
          hint="Cap on placements derived from your paths"
        >
          <Input
            type="number"
            min={1}
            max={99}
            value={matchCount}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) setMatchCount(v);
            }}
          />
        </Field>

        <Field
          label={`Path thickness · ${pathThickness} cell${pathThickness === 1 ? '' : 's'}`}
          hint="Perpendicular search width — wider lets matches drift off the path"
        >
          <input
            type="range"
            min={1}
            max={4}
            step={1}
            value={pathThickness}
            onChange={(e) => setPathThickness(Number(e.target.value))}
            className="h-9 w-full accent-emerald-500"
          />
        </Field>

        <Field label="Tile colors">
          <div className="flex gap-1.5">
            {COLOR_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setColorCount(n)}
                className={`h-9 flex-1 rounded-md border text-sm font-medium transition ${
                  colorCount === n
                    ? 'border-neutral-100 bg-neutral-100 text-neutral-900'
                    : 'border-neutral-800 bg-neutral-950 text-neutral-300 hover:border-neutral-600'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </Field>
      </Section>

      <Section title="Shape mix">
        <p className="text-[11px] leading-snug text-neutral-500">
          Per-shape weights for placement sampling. 0 disables a shape; higher
          values bias the algorithm toward picking it first.
        </p>
        {SHAPE_CATEGORIES.map((cat) => (
          <div key={cat} className="flex items-center gap-3">
            <div className="flex w-10 shrink-0 items-center justify-center">
              <ShapeIcon category={cat} cellPx={4} />
            </div>
            <div className="flex flex-1 items-center gap-2">
              <span className="w-12 text-[11px] text-neutral-400">
                {CATEGORY_LABELS[cat]}
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={probabilities[cat] ?? 0}
                onChange={(e) => setProbability(cat, Number(e.target.value))}
                className="flex-1 accent-emerald-500"
              />
              <span className="w-7 text-right text-[11px] tabular-nums text-neutral-500">
                {probabilities[cat] ?? 0}
              </span>
            </div>
          </div>
        ))}

        <Field
          label={`Secondary match chance · ${(secondaryMatchProbability * 100).toFixed(0)}%`}
          hint="Bir swap iki match birden tetiklesin: primary'nin yanı sıra swap-source çevresine ek bir shape (3-line/2x2/4-line/...) yerleştirilir."
        >
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(secondaryMatchProbability * 100)}
            onChange={(e) =>
              setSecondaryMatchProbability(Number(e.target.value) / 100)
            }
            className="h-9 w-full accent-emerald-500"
          />
        </Field>
      </Section>

      <Section title="Seeds">
        <Field
          label="Path seed"
          hint="Drives placement layout (which cells, which shapes)."
        >
          <Input
            type="number"
            value={seed ?? ''}
            placeholder="(random)"
            onChange={(e) => {
              const v = e.target.value;
              if (v === '') setSeed(null);
              else {
                const n = Number(v);
                if (Number.isFinite(n)) setSeed(Math.floor(n));
              }
            }}
          />
        </Field>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSeed(Math.floor(Math.random() * 0x7fffffff))}
        >
          Reroll path seed
        </Button>

        <Field
          label="Generate seed"
          hint="Drives board fill colors only — re-roll without disturbing placements."
        >
          <Input
            type="number"
            value={generateSeed ?? ''}
            placeholder="(falls back to path seed)"
            onChange={(e) => {
              const v = e.target.value;
              if (v === '') setGenerateSeed(null);
              else {
                const n = Number(v);
                if (Number.isFinite(n)) setGenerateSeed(Math.floor(n));
              }
            }}
          />
        </Field>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            setGenerateSeed(Math.floor(Math.random() * 0x7fffffff))
          }
        >
          Reroll generate seed
        </Button>
      </Section>

      <Section title="Paths">
        <div className="flex flex-wrap gap-1.5">
          <Button
            variant={mode === 'draw-path' ? 'success' : 'secondary'}
            size="sm"
            onClick={() => setMode(mode === 'draw-path' ? 'idle' : 'draw-path')}
          >
            {mode === 'draw-path' ? 'Drawing…' : 'Draw'}
          </Button>
          <Button variant="secondary" size="sm" onClick={beginNewPath}>
            New path
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAllPaths}
            disabled={!step2Done}
          >
            Clear all
          </Button>
        </div>

        {paths.some((p) => p.length > 0) ? (
          <ul className="flex flex-col gap-1">
            {paths.map((p, i) =>
              p.length > 0 ? (
                <li
                  key={i}
                  className="flex items-center justify-between rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-[12px] text-neutral-300"
                >
                  <span>
                    Path {i + 1}{' '}
                    <span className="text-neutral-500">· {p.length} cells</span>
                  </span>
                  <IconButton
                    tone="danger"
                    size="sm"
                    onClick={() => removePath(i)}
                    title="Remove this path"
                  >
                    <TrashIcon />
                  </IconButton>
                </li>
              ) : null,
            )}
          </ul>
        ) : (
          <p className="text-[11px] leading-snug text-neutral-500">
            Toggle <span className="text-neutral-300">Draw</span>, then click +
            drag across the empty board. Match shapes (3-in-a-row, 4-in-a-row,
            5-in-a-row, 2x2) appear live as you draw.
          </p>
        )}

        {placementsReady && (
          <div className="flex items-center gap-1.5">
            <Pill tone="neutral">
              {placements.length} match{placements.length === 1 ? '' : 'es'}
            </Pill>
          </div>
        )}
      </Section>

      <Section title="Generate">
        {step3Done && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Pill tone="success">
              {previewMatches.length} match{previewMatches.length === 1 ? '' : 'es'}
            </Pill>
            <Pill
              tone={
                previewSecondaryStats.attempted === 0
                  ? 'neutral'
                  : previewSecondaryStats.succeeded > 0
                    ? 'success'
                    : 'warn'
              }
            >
              Secondaries: {previewSecondaryStats.succeeded}/
              {previewSecondaryStats.attempted}
            </Pill>
          </div>
        )}
        <Button
          variant="primary"
          size="md"
          disabled={!placementsReady || isGenerating}
          onClick={generatePreview}
        >
          {isGenerating ? 'Generating…' : 'Generate preview'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!step3Done}
          onClick={clearPreview}
        >
          Clear preview
        </Button>

        <Field label="Variant name">
          <Input
            type="text"
            value={name}
            placeholder="Generated"
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Button
          variant="success"
          size="md"
          disabled={!placementsReady || isGenerating}
          onClick={() => {
            const r = sendPreviewToSequencer(name || undefined);
            if (r) setName('');
          }}
        >
          Send to Sequencer
        </Button>
        {step3Done && (
          <p className="text-[11px] leading-snug text-neutral-500">
            Use ←/→ keys to step through preview matches.
          </p>
        )}
      </Section>

      {warnings.length > 0 && (
        <Section title="Warnings">
          <ul className="flex flex-col gap-1.5">
            {warnings.map((w, i) => (
              <li
                key={i}
                className="rounded-md border border-amber-700/50 bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-snug text-amber-200"
              >
                {w}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
