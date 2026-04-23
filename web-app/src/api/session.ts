import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface BlenderSession {
  blendFile: string;
  blendFileName: string;
  blenderPid: number;
  port: number;
  startedAt: number;
}

/**
 * Reads the session file that the Blender addon wrote before launching
 * Match Creator. Returns null when there's no active session (standalone
 * launch, stale file, or running in the browser without Tauri).
 */
export async function getSession(): Promise<BlenderSession | null> {
  if (typeof window === 'undefined') return null;
  // Tauri injects window.__TAURI_INTERNALS__. When we're running in a plain
  // browser (e.g. `npm run dev` without the Tauri shell) skip the call.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!(window as any).__TAURI_INTERNALS__) return null;
  try {
    return await invoke<BlenderSession | null>('get_session');
  } catch {
    return null;
  }
}

/**
 * Subscribes to the `session-changed` event that Rust emits when another
 * instance (usually the Blender addon spawning us again) triggers the
 * single-instance handler.
 */
export async function onSessionChanged(cb: () => void): Promise<UnlistenFn> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof window === 'undefined' || !(window as any).__TAURI_INTERNALS__) {
    return () => {};
  }
  return listen('session-changed', cb);
}
