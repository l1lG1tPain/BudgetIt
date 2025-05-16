/* === STATIC CACHE CONFIG ============================================= */
const CACHE_PREFIX  = 'budgetit-cache';
const CACHE_VERSION = 'v2.9.7';
const CACHE_NAME    = `${CACHE_PREFIX}-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  '/', '/index.html', '/onboarding.html',
  '/style.css', '/theme.css',
  '/app.js',
  '/src/BudgetManager.js', '/src/UIManager.js',
  '/src/ThemeManager.js',  '/src/utils/utils.js',
  '/src/utils/emojiMap.js','/src/utils/analytics.js',
  '/manifest.json',
  '/assets/icon-192x192.png', '/assets/icon-512x512.png'
];

/* === INSTALL ========================================================= */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      const results = await Promise.allSettled(
        STATIC_ASSETS.map(url => cache.add(url))
      );
      results
        .filter(r => r.status === 'rejected')
        .forEach(r => console.warn('[SW] asset skip:', r.reason.url));
    }).then(() => self.skipWaiting())
  );
});

/* === ACTIVATE ======================================================== */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME)
            .map(k => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

/* === FETCH =========================================================== */
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const { request } = event;

  /* 1) HTML — network-first */
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then(resp => { cacheIfAllowed(request, resp); return resp; })
        .catch(() =>
          caches.match(request, { ignoreSearch: true })
            .then(cached => cached || caches.match('/index.html'))
        )
    );
    return;
  }

  /* 2) Остальное — cache-first, refresh in background */
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(cached => {
      const network = fetch(request)
        .then(resp => { cacheIfAllowed(request, resp); return resp; })
        .catch(() => cached);
      return cached || network;
    })
  );
});

/* helper */
function cacheIfAllowed(request, response) {
  if (
    response.ok &&
    (response.type === 'basic' || response.type === 'cors')
  ) {
    const clone = response.clone();
    caches.open(CACHE_NAME).then(c => c.put(request, clone))
      .catch(console.error);
  }
}
