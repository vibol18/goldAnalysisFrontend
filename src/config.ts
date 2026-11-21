const configuredApiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
const configuredWsUrl = (import.meta.env.VITE_WS_URL as string | undefined)?.trim();

export const API_BASE = configuredApiUrl?.replace(/\/+$/, '') ?? '';

function resolveWsBase(): string {
  if (configuredWsUrl) return configuredWsUrl.replace(/\/+$/, '');
  if (typeof window === 'undefined') return '';

  const apiOrigin = API_BASE
    ? new URL(API_BASE, window.location.origin)
    : new URL(window.location.origin);
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${apiOrigin.host}`;
}

export const WS_BASE = resolveWsBase();

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}
