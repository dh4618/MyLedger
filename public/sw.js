/* Ledger service worker.
 *
 * Two jobs:
 *   1. Let the Home Screen app open without a connection.
 *   2. Make the install a real PWA, which materially improves how long WebKit
 *      keeps script-writable storage around — that storage holds the Supabase
 *      refresh token, and losing it is what forces an unexpected sign-in.
 *
 * Strategy: the app shell is network-first so a new deploy is picked up on the
 * next launch, hashed build assets and fonts are cache-first because their URLs
 * change when their contents do, and anything Supabase is never cached because
 * stale ledger data would be worse than no data.
 */

const CACHE = 'ledger-v1';

// Enough to boot the app shell offline. Build assets are added as they're fetched.
const PRECACHE = [
  '/',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // addAll is all-or-nothing, so one missing icon would fail the whole
      // install. Add individually and let stragglers be filled in at runtime.
      .then((cache) => Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const putInCache = async (request, response) => {
  // Opaque cross-origin responses report status 0 but are still worth keeping.
  if (!response || (response.status !== 200 && response.type !== 'opaque')) return;
  const cache = await caches.open(CACHE);
  await cache.put(request, response.clone()).catch(() => {});
};

const cacheFirst = async (request) => {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  await putInCache(request, response);
  return response;
};

const networkFirst = async (request, fallbackUrl) => {
  try {
    const response = await fetch(request);
    await putInCache(request, response);
    return response;
  } catch (e) {
    const cached = (await caches.match(request)) || (fallbackUrl && (await caches.match(fallbackUrl)));
    if (cached) return cached;
    throw e;
  }
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache auth or ledger data — a stale day would look like data loss.
  if (url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.in')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, '/'));
    return;
  }

  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Vite fingerprints everything under /assets/, so those are immutable.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(networkFirst(request));
});
