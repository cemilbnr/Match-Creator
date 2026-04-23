import { create } from 'zustand';
import { getSession, onSessionChanged, type BlenderSession } from '../api/session';

interface SessionState {
  session: BlenderSession | null;
  /** Re-read session.json via the Tauri command. */
  refresh: () => Promise<void>;
  /** Mount-time wiring: subscribes to `session-changed` events and polls once. */
  init: () => Promise<() => void>;
}

export const useBlenderSessionStore = create<SessionState>((set) => ({
  session: null,

  refresh: async () => {
    const next = await getSession();
    set({ session: next });
  },

  init: async () => {
    const { refresh } = useBlenderSessionStore.getState();
    await refresh();
    const unlisten = await onSessionChanged(() => {
      void refresh();
    });
    // Also poll every 8s so dev mode (no single-instance callback) still
    // picks up new session files. This ticks in parallel with Sidebar's
    // health ping — not worth debouncing.
    const interval = window.setInterval(() => {
      void refresh();
    }, 8000);
    return () => {
      unlisten();
      window.clearInterval(interval);
    };
  },
}));
