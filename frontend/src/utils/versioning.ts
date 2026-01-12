export const BUILD_VERSION = import.meta.env.VITE_BUILD_VERSION || 'dev';
export const BUILD_ISO = import.meta.env.VITE_BUILD_ISO || '';

export function versioned(url: string): string {
  if (!url) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${BUILD_VERSION}`;
}
