import { AppState, LogsResponse, StatePatch, TrafficState } from './types';

declare global {
  interface Window {
    __sbApiCall?: (req: { method: string; path: string; body?: any }) => Promise<any>;
  }
}

async function request<T>(method: string, path: string, body?: any): Promise<T> {
  // If running inside WebView2 with custom binding
  if (typeof window !== 'undefined' && typeof window.__sbApiCall === 'function') {
    try {
      return (await window.__sbApiCall({ method, path, body })) as T;
    } catch (err: any) {
      throw new Error(err?.message || String(err));
    }
  }

  // Fallback to standard HTTP fetch (works both in dev and when loaded via local HTTP server)
  const headers: HeadersInit = {
    'Accept': 'application/json',
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const errData = await res.json();
      if (errData?.error) errMsg = errData.error;
    } catch {
      // ignore
    }
    throw new Error(errMsg);
  }

  return (await res.json()) as T;
}

export const api = {
  getState: () => request<AppState>('GET', '/api/state'),
  patchState: (patch: StatePatch) => request<AppState>('POST', '/api/state', patch),
  getTraffic: () => request<TrafficState>('GET', '/api/traffic'),
  getLogs: (fromId = 0) => request<LogsResponse>('GET', `/api/logs?from=${fromId}`),

  // Process actions
  toggleStartStop: () => request<AppState>('POST', '/api/action/start-stop'),
  restartCore: () => request<AppState>('POST', '/api/action/restart-core'),
  refreshConfig: () => request<AppState>('POST', '/api/action/refresh-config'),
  copyLogs: () => request<{ ok: boolean }>('POST', '/api/action/copy-logs'),
  updateApp: () => request<{ ok: boolean }>('POST', '/api/action/update-app'),

  // Profiles
  createProfile: (name: string) => request<AppState>('POST', '/api/profile/new', { name }),
  deleteProfile: (name: string) => request<AppState>('POST', '/api/profile/delete', { name }),
  renameProfile: (name: string) => request<AppState>('POST', '/api/profile/rename', { name }),

  // Config editor
  getConfig: () => request<{ content: string; path: string; profile: string }>('GET', '/api/config'),
  saveConfig: (content: string) => request<{ ok: boolean; path: string }>('POST', '/api/config', { content }),

  // Selectors
  selectOutbound: (selector: string, outbound: string) =>
    request<AppState>('POST', '/api/selector/select', { selector, outbound }),
  checkDelay: (selector: string, outbound: string) =>
    request<any>('POST', '/api/selector/delay', { selector, outbound }),
  checkAllDelays: (selector: string) =>
    request<any>('POST', '/api/selector/delay-all', { selector }),
};

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i] || 'TB'}`;
}

export function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return '0 KB/s';
  const kb = bytesPerSec / 1024;
  if (kb < 1000) return `${kb.toFixed(1)} KB/s`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB/s`;
}

export function formatUptime(seconds: number): string {
  if (!seconds || seconds <= 0) return '00:00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const pad = (n: number) => (n < 10 ? '0' + n : String(n));
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
}
