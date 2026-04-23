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
const CURRENT_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? '0.2.0-beta';

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
      set({
        status: {
          kind: 'error',
          message: (err as Error).message || 'Failed to check for updates',
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
    } catch {
      // Ignore — don't show a startup error banner for a flaky network.
    }
  },

  dismiss: () => set({ status: { kind: 'idle' } }),
}));
