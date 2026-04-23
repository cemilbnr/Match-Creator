import { RefreshIcon } from '../../components/icons';
import { Button, Field, PageHeader, Pill, Section } from '../../components/ui';
import { TILE_SETS } from '../../data/tileSets';
import { useSettings, type TilePreviewMode } from '../../store/settingsStore';
import { useUpdateStore } from '../../store/updateStore';

export function SettingsPanel() {
  const tilePreviewMode = useSettings((s) => s.tilePreviewMode);
  const activeTileSetId = useSettings((s) => s.activeTileSetId);
  const setTilePreviewMode = useSettings((s) => s.setTilePreviewMode);
  const setActiveTileSetId = useSettings((s) => s.setActiveTileSetId);

  const currentVersion = useUpdateStore((s) => s.currentVersion);
  const updateStatus = useUpdateStore((s) => s.status);
  const checkForUpdates = useUpdateStore((s) => s.check);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        eyebrow="App"
        title="Settings"
        subtitle="Preferences apply everywhere tiles are rendered."
      />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-xl flex-col gap-6">
          <Section title="Tile preview">
            <Field label="Render mode">
              <div className="grid grid-cols-2 gap-2">
                <ModeOption
                  value="fill"
                  current={tilePreviewMode}
                  onSelect={setTilePreviewMode}
                  label="Fill color"
                  description="Solid piece color."
                />
                <ModeOption
                  value="image"
                  current={tilePreviewMode}
                  onSelect={setTilePreviewMode}
                  label="Tile image"
                  description="Use the tile set artwork."
                />
              </div>
            </Field>

            <Field
              label="Active tile set"
              hint={
                tilePreviewMode === 'fill'
                  ? 'Switch to "Tile image" to enable this.'
                  : undefined
              }
            >
              <select
                value={activeTileSetId}
                onChange={(e) => setActiveTileSetId(e.target.value)}
                disabled={tilePreviewMode === 'fill'}
                className="h-9 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 transition focus:border-neutral-500 focus:outline-none disabled:text-neutral-500"
              >
                {TILE_SETS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
          </Section>

          <Section title="Updates">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm text-neutral-100">
                  Current version{' '}
                  <span className="font-mono text-neutral-300">v{currentVersion}</span>
                </div>
                <div className="mt-0.5 text-xs text-neutral-500">
                  Match Creator auto-checks on launch. Use this to force a check.
                </div>
              </div>
              <Button
                variant="secondary"
                leading={<RefreshIcon className={updateStatus.kind === 'checking' ? 'animate-spin' : ''} />}
                onClick={() => {
                  void checkForUpdates();
                }}
                disabled={updateStatus.kind === 'checking' || updateStatus.kind === 'downloading'}
              >
                {updateStatus.kind === 'checking' ? 'Checking…' : 'Check for updates'}
              </Button>
            </div>

            <UpdateStatusLine status={updateStatus} />
          </Section>
        </div>
      </div>
    </div>
  );
}

function UpdateStatusLine({ status }: { status: ReturnType<typeof useUpdateStore.getState>['status'] }) {
  if (status.kind === 'none') {
    const ts = new Date(status.checkedAt);
    return (
      <div className="text-xs text-neutral-500">
        You&rsquo;re on the latest version. Last checked {ts.toLocaleTimeString()}.
      </div>
    );
  }
  if (status.kind === 'available') {
    return (
      <div className="flex items-center gap-2 text-xs">
        <Pill tone="success">v{status.info.version} available</Pill>
        <span className="text-neutral-500">
          Use the banner at the top of the app to install.
        </span>
      </div>
    );
  }
  if (status.kind === 'error') {
    return (
      <div className="rounded-md border border-rose-700/40 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-200">
        {status.message}
      </div>
    );
  }
  return null;
}

function ModeOption({
  value,
  current,
  onSelect,
  label,
  description,
}: {
  value: TilePreviewMode;
  current: TilePreviewMode;
  onSelect: (v: TilePreviewMode) => void;
  label: string;
  description: string;
}) {
  const selected = current === value;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={`flex flex-col items-start gap-0.5 rounded-md border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 ${
        selected
          ? 'border-neutral-400 bg-neutral-800'
          : 'border-neutral-800 bg-neutral-950 hover:border-neutral-700'
      }`}
    >
      <span className="text-sm font-medium text-neutral-100">{label}</span>
      <span className="text-[11px] text-neutral-500">{description}</span>
    </button>
  );
}
