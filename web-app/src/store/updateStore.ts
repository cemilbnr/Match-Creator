import { create } from 'zustand';
import {
  checkForUpdate,
  downloadAndInstall,
  type ProgressEvent,
  type UpdateInfo,
} from '../api/updater';

export type UpdateStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'none'; checkedAt: number }
  | { kind: 'available'; info: UpdateInfo }
  | { kind: 'downloading'; info: UpdateInfo; bytes: number; total: number }
  | { kind: 'installing'; info: UpdateInfo }
  | { kind: 'error'; message: string };

interface UpdateState {
  status: UpdateStatus;
  /** Current app version baked into package.json at build time. */
  currentVersion: string;

  check: () => Promise<void>;
  install: () => Promise<void>;
  /** Kicks off a silent check on app startup; errors collapse to idle. */
  silentStartupCheck: () => Promise<void>;
  dismiss: () => void;
}

// Pulled via Vite's compile-time replacement. package.json version lives at
// `npm_package_version` but Vite doesn't inject it — use a simple import.meta
// shim instead.
const CURRENT_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? '0.2.1-beta';

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return 'Unknown error';
  }
}

/**
 * GitHub returns 404 for `/releases/latest/` when no release has ever been
 * published. The updater plugin treats that as an error, but from the user's
 * perspective it's "nothing to update". Same for common offline patterns.
 * Keep the benign misses quiet and only escalate the noisy ones.
 */
function classifyCheckError(err: unknown): 'benign' | 'error' {
  const msg = errMessage(err).toLowerCase();
  if (msg.includes('404') || msg.includes('not found') || msg.includes('release not found')) {
    return 'benign';
  }
  return 'error';
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  status: { kind: 'idle' },
  currentVersion: CURRENT_VERSION,

  check: async () => {
    set({ status: { kind: 'checking' } });
    try {
      const info = await checkForUpdate();
      if (info) {
        set({ status: { kind: 'available', info } });
      } else {
        set({ status: { kind: 'none', checkedAt: Date.now() } });
      }
    } catch (err) {
      // Log full error to devtools for debugging — the UI only shows a
      // short summary.
      console.error('[updater] check failed:', err);
      if (classifyCheckError(err) === 'benign') {
        set({ status: { kind: 'none', checkedAt: Date.now() } });
        return;
      }
      set({
        status: {
          kind: 'error',
          message: errMessage(err),
        },
      });
    }
  },

  install: async () => {
    const current = get().status;
    if (current.kind !== 'available') return;
    const info = current.info;
    set({ status: { kind: 'downloading', info, bytes: 0, total: 0 } });
    try {
      await downloadAndInstall(info, (event: ProgressEvent) => {
        if (event.kind === 'finished') {
          set({ status: { kind: 'installing', info } });
        } else {
          set({
            status: {
              kind: 'downloading',
              info,
              bytes: event.bytes,
              total: event.total,
            },
          });
        }
      });
    } catch (err) {
      set({
        status: {
          kind: 'error',
          message: (err as Error).message || 'Update failed',
        },
      });
    }
  },

  silentStartupCheck: async () => {
    try {
      const info = await checkForUpdate();
      if (info) set({ status: { kind: 'available', info } });
    } catch (err) {
      // Ignore for UI — startup shouldn't put a red banner in front of the
      // user just because GitHub is flaky or no release is out yet.
      console.warn('[updater] startup check suppressed:', err);
    }
  },

  dismiss: () => set({ status: { kind: 'idle' } }),
}));
