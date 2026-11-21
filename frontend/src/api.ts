import { UserInfo } from './types';

const TOKEN_KEY = 'wtp_scada_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(path, { ...options, headers });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      msg = err.detail || msg;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export async function apiDownload(path: string, filename: string): Promise<void> {
  const token = getStoredToken();
  const res = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    throw new Error(`Download failed: HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function loginApi(
  username: string,
  password: string
): Promise<{ access_token: string; user: UserInfo }> {
  return apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export interface TelemetrySubscription {
  close: () => void;
}

/**
 * Opens a resilient WebSocket telemetry stream with exponential-backoff reconnection.
 */
export function connectTelemetryStream(
  token: string,
  onData: (payload: unknown) => void,
  onStatus: (connected: boolean, attempt: number) => void
): TelemetrySubscription {
  let closedByCaller = false;
  let ws: WebSocket | null = null;
  let retryTimer: number | null = null;
  let attempt = 0;

  const connect = () => {
    if (closedByCaller) return;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${window.location.host}/ws/telemetry?token=${encodeURIComponent(token)}`);

    ws.onopen = () => {
      attempt = 0;
      onStatus(true, 0);
    };

    ws.onmessage = (ev) => {
      try {
        onData(JSON.parse(ev.data));
      } catch {
        // ignore malformed frame
      }
    };

    const scheduleReconnect = () => {
      if (closedByCaller) return;
      attempt += 1;
      onStatus(false, attempt);
      const delayMs = Math.min(15000, 1000 * Math.pow(2, Math.min(attempt - 1, 4)));
      retryTimer = window.setTimeout(connect, delayMs);
    };

    ws.onclose = scheduleReconnect;
    ws.onerror = () => {
      ws?.close();
    };
  };

  connect();

  return {
    close: () => {
      closedByCaller = true;
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
      ws?.close();
    },
  };
}
