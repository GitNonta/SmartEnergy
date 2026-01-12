/* eslint-disable */
/* global self, clients */
// Service Worker for SMART Energy Monitoring
// รองรับการทำงานบนมือถือและ background sync

// Increment or timestamp this to force full cache refresh on deploy
const CACHE_VERSION = '1767718407718';
const CACHE_NAME = 'smart-energy-' + CACHE_VERSION;
// Minimal pre-cache; hashed bundles are cache-managed automatically by browser due to unique names
const PRECACHE_URLS = [ '/', '/manifest.json' ];

// Install event - cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(PRECACHE_URLS.map(u => u + '?v=' + CACHE_VERSION));
    })()
  );
  self.skipWaiting();
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(cacheNames => Promise.all(cacheNames.map(cacheName => {
      if (cacheName !== CACHE_NAME) {
        console.log('Deleting old cache:', cacheName);
        return caches.delete(cacheName);
      }
      return Promise.resolve();
    })))
  );
  self.clients && self.clients.claim();
});

// Helper: network-first for navigations & core assets to avoid stale UI
async function networkFirst(request) {
  try {
  const url = new URL(request.url);
  const cacheBusted = new Request(url.toString(), { cache: 'no-store' });
  const fresh = await fetch(cacheBusted);
    if (fresh && fresh.status === 200 && request.method === 'GET') {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch (err) {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}

// Fetch event
self.addEventListener('fetch', (event) => {
  // Skip WebSocket connections
  if (event.request.url.startsWith('ws://') || event.request.url.startsWith('wss://')) {
    return;
  }

  // Network first for API calls
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          return new Response(JSON.stringify({ 
            error: 'Offline', 
            cached: true 
          }), {
            headers: { 'Content-Type': 'application/json' }
          });
        })
    );
    return;
  }

  // For navigation/html & JS/CSS: network-first to pick new deploy
  const destination = event.request.destination;
  if (event.request.mode === 'navigate' || destination === 'script' || destination === 'style' || destination === 'document') {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Cache-first fallback for images/fonts/etc.
  event.respondWith(
    caches.match(event.request).then(res => res || fetch(event.request, { cache: 'no-store' }))
  );
});

// Background sync for offline data
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-energy-data') {
    event.waitUntil(
      // Sync logic here
      fetch('/api/sync')
        .then(() => {
          console.log('Background sync completed');
        })
        .catch((error) => {
          console.error('Background sync failed:', error);
        })
    );
  }
});

// Push notification support
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : 'New energy data available',
    icon: '/logo192.png',
    badge: '/logo192.png',
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    }
  };

  event.waitUntil(
    self.registration.showNotification('SMART Energy', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
  self.clients && self.clients.openWindow('/')
  );
});

// Periodic background sync (experimental)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'energy-update') {
    event.waitUntil(
      // Fetch latest energy data
      fetch('/api/energy/summary?timeRange=1D')
        .then(response => response.json())
        .then(data => {
          console.log('Periodic sync completed:', data);
        })
        .catch(error => {
          console.error('Periodic sync failed:', error);
        })
    );
  }
});

console.log('Service Worker loaded for SMART Energy Monitoring');

// Listen for explicit skip waiting trigger
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});