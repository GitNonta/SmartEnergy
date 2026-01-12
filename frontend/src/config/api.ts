declare global {
  interface Window { __BACKEND_PORT?: string; }
}

const DEFAULT_CANDIDATES = [
  import.meta.env.VITE_API_PORT,
  '3001',  // Check this first (most common)
  '3101'
].filter(Boolean) as string[];

let resolvedPort: string | null = null;

function preferEnvPort(): string | null {
  return (import.meta.env.VITE_API_PORT || null);
}

export function getBackendPort(): string {
  if (typeof window !== 'undefined') {
    if (window.__BACKEND_PORT) return window.__BACKEND_PORT;
  }
  if (resolvedPort) return resolvedPort;
  return preferEnvPort() || '3001';
}

export function getApiBase(): string {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  if (typeof window !== 'undefined' && window.location) {
    const isHttps = window.location.protocol === 'https:';
    const proto = isHttps ? 'https' : 'http';
    const host = window.location.hostname;
    return `${proto}://${host}:${getBackendPort()}`;
  }
  return `http://localhost:${getBackendPort()}`;
}

export function getWsUrl(): string {
  if (import.meta.env.VITE_WS_URL && import.meta.env.MODE !== 'development') {
    return import.meta.env.VITE_WS_URL;
  }
  if (typeof window !== 'undefined' && window.location) {
    const isHttps = window.location.protocol === 'https:';
    const proto = isHttps ? 'wss' : 'ws';
    const host = window.location.hostname;
    return `${proto}://${host}:${getBackendPort()}`;
  }
  // Server-side fallback only (shouldn't happen in browser)
  return `ws://0.0.0.0:${getBackendPort()}`;
}

export async function detectBackendPort(candidates: string[] = DEFAULT_CANDIDATES): Promise<string> {
  if (typeof window === 'undefined') {
    resolvedPort = preferEnvPort() || candidates[0] || '3001';
    return resolvedPort;
  }
  const host = window.location.hostname;
  for (const port of candidates) {
    if (!port) continue;
    try {
      const url = `${window.location.protocol}//${host}:${port}/health`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000); // 2s timeout

      const res = await fetch(url, {
        cache: 'no-store',
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!res.ok) continue;

      // Check content-type to ensure it's JSON, not HTML
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        window.__BACKEND_PORT = port;
        resolvedPort = port;
        console.log(`✅ Backend detected on port ${port}`);
        return port;
      }
    } catch (e) {
      // Silently try next port
    }
  }
  // fallback
  resolvedPort = preferEnvPort() || '3001';
  window.__BACKEND_PORT = resolvedPort;
  console.warn(`⚠️ No backend detected, using fallback port ${resolvedPort}`);
  return resolvedPort;
}

export function backendInfo() {
  return {
    port: getBackendPort(),
    apiBase: getApiBase(),
    wsUrl: getWsUrl(),
    envPort: preferEnvPort()
  };
}
