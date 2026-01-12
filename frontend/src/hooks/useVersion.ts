import { useEffect, useRef, useState } from 'react';

// Simple version derivation: stringify asset-manifest.json. In CRA this contains hashed filenames.
// We poll periodically and also listen for a custom 'app.versionchange' event fired when SW controller changes.
export interface UseVersionResult {
  currentVersion: string | null; // version detected on initial load
  latestVersion: string | null;  // last polled version value
  hasUpdate: boolean;            // true if a newer version likely exists
  checking: boolean;             // true while a fetch is in flight
  reload: () => void;            // force reload to activate new assets
  dismiss: () => void;           // temporarily hide update state
}

const VERSION_URL = '/version.json';
const POLL_INTERVAL_MS = 60_000; // 1 minute

function computeVersion(manifest: any): string {
  try {
    return JSON.stringify(manifest);
  } catch {
    return Date.now().toString();
  }
}

export function useVersion(): UseVersionResult {
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [checking, setChecking] = useState(false);
  const dismissedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchManifest = async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setChecking(true);
    try {
  const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!res.ok) throw new Error('manifest fetch failed');
      const json = await res.json();
  const ver = json.version ? String(json.version) : computeVersion(json);
      if (!currentVersion) {
        setCurrentVersion(ver);
      }
      setLatestVersion(ver);
      if (currentVersion && ver !== currentVersion && !dismissedRef.current) {
        setHasUpdate(true);
      }
    } catch (e) {
      // Ignore abort errors (cleanup on unmount)
      if (e instanceof Error && e.name !== 'AbortError') {
        console.warn('Version check error:', e.message);
      }
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    fetchManifest(); // initial
    const interval = setInterval(fetchManifest, POLL_INTERVAL_MS);

    const onVersionChange = () => {
      if (!dismissedRef.current) {
        setHasUpdate(true);
      }
    };
    window.addEventListener('app.versionchange', onVersionChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('app.versionchange', onVersionChange);
      if (abortRef.current) abortRef.current.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentVersion]);

  return {
    currentVersion,
    latestVersion,
    hasUpdate,
    checking,
    reload: () => window.location.reload(),
    dismiss: () => {
      dismissedRef.current = true;
      setHasUpdate(false);
    },
  };
}

export default useVersion;
