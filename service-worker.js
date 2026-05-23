/* === STATIC CACHE CONFIG ============================================ */
const CACHE_PREFIX  = 'budgetit-cache';
const CACHE_VERSION = 'v4.0.0';
const CACHE_NAME    = `${CACHE_PREFIX}-${CACHE_VERSION}`;

/* Файлы, которые точно должны быть офлайн-доступны */
const STATIC_ASSETS = [
    // базовые страницы
    '/',
    '/index.html',
    '/onboarding.html',

    // системные страницы
    '/404.html',
    '/500.html',
    '/offline.html',

    // стили — корень
    '/style.css',
    '/theme.css',
    '/theme-polish-fixes.css',
    '/Achievements.css',
    '/Search.css',
    '/analytics-insights.css',
    '/excel-import.css',
    '/export-import-page.css',
    '/planner.css',

    // точка входа и миграция
    '/app.js',
    '/migration.js',

    // widgets
    '/src/widgets/bannerCarousel.js',
    '/src/widgets/charts.js',
    '/src/widgets/currencyChips.js',

    // основной функционал
    '/src/BudgetManager.js',
    '/src/UIManager.js',
    '/src/ThemeManager.js',
    '/src/settings.js',
    '/src/profileAnalytics.js',
    '/src/profilePage.js',
    '/src/StorageManager.js',
    '/src/EditManager.js',
    '/src/Searchmanager.js',
    '/src/Analyticsinsights.js',
    '/src/Excelimportmanager.js',

    // planner
    '/src/planner/PlannerManager.js',
    '/src/planner/PlannerPage.js',
    '/src/planner/PlannerSheet.js',
    '/src/planner/plannerUtils.js',

    // utils
    '/src/utils/emojiMap.js',
    '/src/utils/loader.js',
    '/src/utils/tweakSystem.js',
    '/src/utils/utils.js',
    '/src/utils/achievements.js',
    '/src/utils/achievementUtils.js',
    '/src/utils/analytics.js',
    '/src/utils/umami-events.js',

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

    // PWA / манифест
    '/manifest.json',

    // assets — баннеры
    '/assets/banner1.jpg',
    '/assets/banner2.jpg',
    '/assets/banner8.jpg',
    '/assets/banner9.jpg',
    '/assets/banner10.jpg',
    '/assets/banner11.jpg',

    // assets — паттерны
    '/assets/blackbberry-pattern.png',
    '/assets/Cocacola-pattern.png',
    '/assets/dolphin-pattern.png',
    '/assets/hookah-pattern.png',
    '/assets/shark-pattern.png',

    // assets — общие
    '/assets/BudgetIt ava.png',
    '/assets/onbording-img.jpg',
    '/assets/og-cover.png',
    '/assets/favicon.ico',
    '/assets/akulka-transaction-hero.png',
    '/assets/planner.png',
    '/assets/shark-import.png',

    // assets — PWA иконки
    '/assets/icon-192x192v4.png',
    '/assets/icon-512x512v4.png',

    // assets — системные
    '/assets/404.png',
    '/assets/500.png',
    '/assets/offline.png',
    '/assets/shark.png',

    // assets — аватары профиля
    '/assets/avatar/active.png',
    '/assets/avatar/basketball.png',
    '/assets/avatar/blue-whale.png',
    '/assets/avatar/boxing.png',
    '/assets/avatar/calm.png',
    '/assets/avatar/card.png',
    '/assets/avatar/cat.png',
    '/assets/avatar/clown.png',
    '/assets/avatar/coder.png',
    '/assets/avatar/crab.png',
    '/assets/avatar/default.png',
    '/assets/avatar/dna.png',
    '/assets/avatar/dog.png',
    '/assets/avatar/dollar.png',
    '/assets/avatar/dolphin.png',
    '/assets/avatar/dolphin1.png',
    '/assets/avatar/dragon.png',
    '/assets/avatar/eagle.png',
    '/assets/avatar/elf.png',
    '/assets/avatar/explode.png',
    '/assets/avatar/financial.png',
    '/assets/avatar/genie.png',
    '/assets/avatar/ghost.png',
    '/assets/avatar/headphones.png',
    '/assets/avatar/hibiscus.png',
    '/assets/avatar/ice.png',
    '/assets/avatar/jellyfish.png',
    '/assets/avatar/juice.png',
    '/assets/avatar/legendary.png',
    '/assets/avatar/lobster.png',
    '/assets/avatar/lock.png',
    '/assets/avatar/lol.png',
    '/assets/avatar/low-battery.png',
    '/assets/avatar/meditate.png',
    '/assets/avatar/meme.png',
    '/assets/avatar/moon.png',
    '/assets/avatar/muscle.png',
    '/assets/avatar/octopus.png',
    '/assets/avatar/penguin.png',
    '/assets/avatar/pig.png',
    '/assets/avatar/poop.png',
    '/assets/avatar/robot.png',
    '/assets/avatar/rocket.png',
    '/assets/avatar/sakura.png',
    '/assets/avatar/seal.png',
    '/assets/avatar/shark.png',
    '/assets/avatar/squid.png',
    '/assets/avatar/surf.png',
    '/assets/avatar/target.png',
    '/assets/avatar/tech.png',
    '/assets/avatar/trophy.png',
    '/assets/avatar/tropical.png',
    '/assets/avatar/turtle.png',
    '/assets/avatar/unicorn.png',
    '/assets/avatar/vampire.png',
    '/assets/avatar/wave.png',
    '/assets/avatar/zombie.png',
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
                    .forEach(r => console.warn('[SW] asset skip:', r.reason?.url || r.reason));
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

    // внешние домены пропускаем, кроме umami, который явно разрешён
    if (url.origin !== self.location.origin && !isUmami) return;

    // /api/ не кэшируем
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

    // ⛔ Для umami.js и прочей аналитики — всегда только сеть
    if (isUmami) {
        event.respondWith(fetch(request));
        return;
    }

    // Остальное: cache-first + подкачка из сети
    event.respondWith(
        caches.match(request).then(cached => {
            const network = fetch(request)
                .then(resp => {
                    cacheIfAllowed(request, resp.clone());
                    return resp;
                })
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
