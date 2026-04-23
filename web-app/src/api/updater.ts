import { check, type Update } from '@tauri-apps/plugin-updater';

/**
 * Thin wrapper around tauri-plugin-updater so the rest of the app doesn't
 * have to handle the "we're running in a plain browser" case repeatedly.
 */
function inTauri(): boolean {
  if (typeof window === 'undefined') return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return !!(window as any).__TAURI_INTERNALS__;
}

export interface UpdateInfo {
  version: string;
  /** Release notes / changelog body from latest.json. */
  body: string;
  /** ISO timestamp of the release. */
  date?: string;
  /** Underlying plugin handle — used to trigger download+install. */
  handle: Update;
}

export interface ProgressEvent {
  kind: 'started' | 'progress' | 'finished';
  bytes: number;
  total: number;
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!inTauri()) return null;
  const update = await check();
  if (!update) return null;
  return {
    version: update.version,
    body: update.body ?? '',
    date: update.date ?? undefined,
    handle: update,
  };
}

/**
 * Download and install. On Windows the MSI installer closes the app and
 * restarts it after patching — no explicit relaunch needed from our side.
 */
export async function downloadAndInstall(
  info: UpdateInfo,
  onProgress?: (event: ProgressEvent) => void,
): Promise<void> {
  let downloaded = 0;
  let total = 0;
  await info.handle.downloadAndInstall((event) => {
    if (event.event === 'Started') {
      total = event.data.contentLength ?? 0;
      onProgress?.({ kind: 'started', bytes: 0, total });
    } else if (event.event === 'Progress') {
      downloaded += event.data.chunkLength;
      onProgress?.({ kind: 'progress', bytes: downloaded, total });
    } else if (event.event === 'Finished') {
      onProgress?.({ kind: 'finished', bytes: downloaded, total });
    }
  });
}
