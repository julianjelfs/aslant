// Aslant's service worker: keeps the app working with no signal.
//
// Each deploy gets its own cache. tool/stamp.mjs replaces __VERSION__ with
// the commit and fills PRECACHE with every file the deploy ships, which
// changes this file's bytes, which is what makes the browser install the
// new worker. Every local URL is versioned the same way, so a file from one
// deploy is never served to another's page.
//
// The page itself is fetched network-first, so an installed app opens the
// latest deploy whenever it's online and falls back to the cached one when
// it isn't. Everything else is cache-first: local files are versioned and
// three.js comes from a pinned version on jsDelivr, so none of it changes
// under its URL. jsDelivr files are cached as the page fetches them, and on
// the very first visit (before this worker controlled the page) from the
// list the page posts once the head has loaded.

const VERSION = '__VERSION__';
const CACHE = `aslant-${VERSION}`;
const PRECACHE = [] /* __PRECACHE__ */;
const CDN = 'https://cdn.jsdelivr.net/';
const DEV = VERSION.startsWith('__');

self.addEventListener('install', (event) => {
  if (DEV) return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'no-cache' })));
      // three.js on jsDelivr is pinned, so carry it over from the last
      // deploy rather than fetching it again.
      for (const key of await caches.keys()) {
        if (!key.startsWith('aslant-') || key === CACHE) continue;
        const old = await caches.open(key);
        for (const request of await old.keys()) {
          if (request.url.startsWith(CDN)) await cache.put(request, await old.match(request));
        }
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('aslant-') && key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'warm') event.waitUntil(warm(event.data.urls));
});

self.addEventListener('fetch', (event) => {
  if (DEV) return;
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const local = url.origin === self.location.origin;
  if (!local && !request.url.startsWith(CDN)) return;

  if (request.mode === 'navigate') {
    event.respondWith(page());
    return;
  }

  event.respondWith(
    caches.match(request, { cacheName: CACHE }).then((hit) => hit || fetchAndStore(request)),
  );
});

// Network first, with a short wait, then the cached page.
async function page() {
  const cache = await caches.open(CACHE);
  try {
    const response = await Promise.race([
      fetch('./', { cache: 'no-cache' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), 3000)),
    ]);
    if (response.ok) {
      await cache.put('./', response.clone());
      return response;
    }
  } catch {
    // Offline or slow: fall through to the cached page.
  }
  return (await cache.match('./')) ?? fetch('./');
}

async function fetchAndStore(request) {
  const response = await fetch(request);
  if (response.ok && (response.type === 'basic' || response.type === 'cors')) {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

async function warm(urls) {
  const cache = await caches.open(CACHE);
  for (const url of urls) {
    const local = new URL(url).origin === self.location.origin;
    if (!local && !url.startsWith(CDN)) continue;
    if (await cache.match(url)) continue;
    try {
      const response = await fetch(url, { mode: local ? 'same-origin' : 'cors' });
      if (response.ok) await cache.put(url, response);
    } catch {
      // Offline already; the fetch handler fills the gap next time.
    }
  }
}
