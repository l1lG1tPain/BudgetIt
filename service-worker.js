/* === STATIC CACHE CONFIG ============================================ */
const CACHE_PREFIX  = 'budgetit-cache';
const CACHE_VERSION = 'v2.10.3'; // ⬅️ обновлено
const CACHE_NAME    = `${CACHE_PREFIX}-${CACHE_VERSION}`;

/* Файлы, которые точно должны быть офлайн-доступны */
const STATIC_ASSETS = [
    '/', '/index.html', '/onboarding.html',
    '/style.css', '/theme.css',
    '/404.html', '/500.html', '/offline.html',
    '/app.js', '/migration.js',

    // widgets
    '/widgets/bannerCarousel.js',
    '/widgets/charts.js',
    '/widgets/currencyChips.js',

    // основной функционал
    '/src/BudgetManager.js',
    '/src/UIManager.js',
    '/src/ThemeManager.js',
    '/src/settings.js',
    '/src/profileAnalytics.js',

    // utils
    '/src/utils/emojiMap.js',
    '/src/utils/loader.js',
    '/src/utils/tweakSystem.js',
    '/src/utils/utils.js',
    '/src/utils/achievements.js',
    '/src/utils/achievementUtils.js',

    // constants
    '/constants/achievementList.js',
    '/constants/constants.js',
    '/constants/debtCategories.js',
    '/constants/depositCategories.js',
    '/constants/expenseCategories.js',
    '/constants/faq-constants.js',
    '/constants/incomeCategories.js',
    '/constants/index.js',
    '/constants/loadingMessages.js',

    // assets
    '/manifest.json',

    '/assets/banner1.jpg',
    '/assets/banner2.jpg',
    '/assets/banner8.jpg',
    '/assets/banner9.jpg',
    '/assets/banner10.jpg',
    '/assets/banner11.jpg',

    '/assets/blackberry-pattern.png',
    '/assets/Cocacola-pattern.png',
    '/assets/dolphin-pattern.png',
    '/assets/hookah-pattern.png',
    '/assets/shark-pattern.png',

    '/assets/Budgetit ava.png',
    '/assets/BudgetIt ava v2.10-min.png',
    '/assets/switch-budget-img.png',
    '/assets/onbording-img.jpg',
    '/assets/og-cover.png',
    '/assets/favicon.ico',

    '/assets/icon-192x192v2.10.png',
    '/assets/icon-512x512v2.10.png',

    '/assets/404.png',
    '/assets/500.png',
    '/assets/offline.png',
    '/assets/shark.png'
];

/* === INSTALL ======================================================== */
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(async cache => {
                const results = await Promise.allSettled(
                    STATIC_ASSETS.map(url => cache.add(url))
                );
                results
                    .filter(r => r.status === 'rejected')
                    .forEach(r => console.warn('[SW] asset skip:', r.reason.url));
            })
            .then(() => self.skipWaiting())
    );
});

/* === ACTIVATE ======================================================= */
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
            .then(() =>
                self.clients.matchAll({ type: 'window' })
                    .then(clients =>
                        clients.forEach(c => c.postMessage({ type: 'SW_UPDATED' }))
                    )
            )
    );
});

/* === FETCH ========================================================== */
self.addEventListener('fetch', event => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    const isUmami = url.href.includes('umami');

    if (url.origin !== self.location.origin && !isUmami) return;
    if (url.pathname.startsWith('/api/')) return;

    const isNavigate =
        request.mode === 'navigate' ||
        (request.headers.get('accept') || '').includes('text/html');

    if (isNavigate) {
        const network = fromNetwork(request, 4000)
            .then(resp => {
                if (!resp.ok) {
                    if (resp.status === 404)  return caches.match('/404.html');
                    if (resp.status >= 500)   return caches.match('/500.html');
                }
                cacheIfAllowed(request, resp.clone());
                return resp;
            })
            .catch(() => caches.match('/offline.html'));

        event.respondWith(network);
        return;
    }

    // ⛔ Для umami.js всегда загружаем из сети
    if (isUmami) {
        event.respondWith(fetch(request));
        return;
    }

    event.respondWith(
        caches.match(request).then(cached => {
            const network = fetch(request)
                .then(resp => { cacheIfAllowed(request, resp.clone()); return resp; })
                .catch(() => cached);
            return cached || network;
        })
    );
});

/* === HELPERS ======================================================== */
function cacheIfAllowed(request, response) {
    if (response.ok && (response.type === 'basic' || response.type === 'cors')) {
        caches.open(CACHE_NAME)
            .then(c => c.put(request, response))
            .catch(err => console.warn('[SW] put error:', err, request.url));
    }
}

function fromNetwork(request, timeout = 4000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject('timeout'), timeout);
        fetch(request).then(response => {
            clearTimeout(timer);
            resolve(response);
        }, reject);
    });
}
