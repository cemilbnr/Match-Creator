import type { BlenderExport } from '../features/gameplaySequencer/blenderExport';
import { useBlenderSessionStore } from '../store/sessionStore';

interface HealthResponse {
  ok: boolean;
  blenderVersion: string;
  /** Set when the addon knows the active .blend filepath. */
  blendFile?: string;
  blendFileName?: string;
}

interface GameplayResponse {
  ok: boolean;
  collection: string;
  tileCount: number;
  tilebackCount: number;
  frameRange: [number, number];
  fps: number;
}

const DEFAULT_PORT = 17654;

function apiBase(): string {
  const session = useBlenderSessionStore.getState().session;
  if (session && session.port) {
    return `http://localhost:${session.port}`;
  }
  // Dev server proxies /api → localhost:17654 (see vite.config.ts).
  if (import.meta.env.DEV) return '';
  return `http://localhost:${DEFAULT_PORT}`;
}

export class BlenderApiError extends Error {
  readonly status: number;
  readonly kind: 'http' | 'network' | 'timeout' | 'parse';

  constructor(message: string, kind: BlenderApiError['kind'], status = 0) {
    super(message);
    this.name = 'BlenderApiError';
    this.kind = kind;
    this.status = status;
  }
}

async function request<T>(
  path: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      ...init,
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as DOMException).name === 'AbortError') {
      throw new BlenderApiError(
        `Request timed out after ${Math.round(timeoutMs / 1000)}s (${path}).`,
        'timeout',
      );
    }
    throw new BlenderApiError(
      'Blender addon unreachable. Is Blender running with the add-on server started?',
      'network',
    );
  } finally {
    window.clearTimeout(timer);
  }

  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* body was not JSON; keep status-line message */
    }
    throw new BlenderApiError(message, 'http', res.status);
  }

  try {
    return (await res.json()) as T;
  } catch {
    throw new BlenderApiError(
      `Malformed response body from ${path}.`,
      'parse',
      res.status,
    );
  }
}

export async function pingBlender(): Promise<HealthResponse> {
  return request<HealthResponse>('/api/health', { method: 'GET' }, 5000);
}

export async function sendGameplayToBlender(
  payload: BlenderExport,
): Promise<GameplayResponse> {
  return request<GameplayResponse>(
    '/api/gameplay',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    30000,
  );
}
