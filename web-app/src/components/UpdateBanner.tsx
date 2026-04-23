import { useUpdateStore } from '../store/updateStore';
import { Button } from './ui';
import { RefreshIcon } from './icons';

/**
 * Top-of-app banner that appears while a new version is available, being
 * downloaded, or while the MSI is running. Silent during idle / `none`
 * states — only Settings shows the "checked, nothing new" information.
 */
export function UpdateBanner() {
  const status = useUpdateStore((s) => s.status);
  const install = useUpdateStore((s) => s.install);
  const dismiss = useUpdateStore((s) => s.dismiss);

  if (status.kind === 'idle' || status.kind === 'checking' || status.kind === 'none') {
    return null;
  }

  if (status.kind === 'error') {
    return (
      <div className="flex shrink-0 items-center gap-3 border-b border-rose-900/60 bg-rose-950 px-4 py-2 text-sm text-rose-200">
        <span className="flex-1">
          Update failed: <span className="font-medium">{status.message}</span>
        </span>
        <Button size="sm" variant="ghost" onClick={dismiss}>
          Dismiss
        </Button>
      </div>
    );
  }

  if (status.kind === 'available') {
    return (
      <div className="flex shrink-0 items-center gap-3 border-b border-emerald-900/60 bg-emerald-950 px-4 py-2 text-sm text-emerald-100">
        <RefreshIcon className="shrink-0 text-emerald-300" />
        <div className="flex-1">
          <span className="font-semibold">New version {status.info.version}</span>
          <span className="ml-2 text-emerald-300/80">available. Install now?</span>
        </div>
        <Button size="sm" variant="ghost" onClick={dismiss}>
          Later
        </Button>
        <Button size="sm" variant="primary" onClick={install}>
          Install &amp; restart
        </Button>
      </div>
    );
  }

  if (status.kind === 'downloading') {
    const pct =
      status.total > 0 ? Math.min(100, Math.round((status.bytes / status.total) * 100)) : 0;
    return (
      <div className="flex shrink-0 flex-col gap-1 border-b border-neutral-800 bg-neutral-925 px-4 py-2 text-sm text-neutral-200">
        <div className="flex items-center gap-3">
          <span className="flex-1">
            Downloading {status.info.version}…
            {status.total > 0 && (
              <span className="ml-2 text-neutral-500">
                {Math.round(status.bytes / 1024 / 1024)} MB of{' '}
                {Math.round(status.total / 1024 / 1024)} MB
              </span>
            )}
          </span>
          <span className="tabular-nums text-neutral-400">{pct}%</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-neutral-800">
          <div
            className="h-full bg-emerald-400 transition-[width]"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  // installing
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-neutral-800 bg-neutral-925 px-4 py-2 text-sm text-neutral-200">
      <RefreshIcon className="shrink-0 animate-spin text-neutral-400" />
      Installing {status.info.version} — the app will restart automatically.
    </div>
  );
}
