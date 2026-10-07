/* === STATIC CACHE CONFIG ============================================ */
const CACHE_PREFIX  = 'budgetit-cache';
const CACHE_VERSION = 'v5.0.1';
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
    '/glass.css',
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
    '/src/theme/themeTokens.js',
    '/src/ui/DateSheet.js',
    '/src/shark/SharkMood.js',
    '/src/shark/SharkUI.js',
    '/src/shark/SharkTalk.js',
    '/src/shark/SharkPlus.js',
    '/src/shark/SharkExtra.js',
    '/src/shark/texts/flavor.js',
    '/src/shark/texts/answers-c.js',
    '/src/shark/texts/glossary.js',
    '/src/shark/texts/mood.js',
    '/src/shark/texts/mood-more.js',
    '/src/shark/texts/toasts-more.js',
    '/src/shark/texts/extras-more-a.js',
    '/src/shark/texts/extras-more-b.js',
    '/src/shark/texts/answers.js',
    '/src/shark/texts/index.js',
    '/src/shark/texts/answers-a.js',
    '/src/shark/texts/answers-b.js',
    '/src/shark/texts/proactive.js',
    '/src/shark/texts/fun.js',
    '/src/shark/texts/toasts.js',
    '/src/shark/texts/extras.js',
    '/src/shark/texts/help.js',
    '/src/ui/AccountsPage.js',
    '/src/ui/DesktopWidgets.js',
    '/src/utils/customCategories.js',
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
    '/src/analytics/period.js',
    '/src/analytics/stats.js',
    '/src/analytics/ui.js',
    '/src/utils/insightsMath.js',
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
    '/assets/icons/LG.png',
    '/assets/icons/budgetit-icon.png',
    '/assets/icons/ludomania-icon.png',
    '/assets/icons/migri-icon.png',
    '/assets/icons/trackit-icon.png',

    // assets — шрифты (self-hosted)
    '/assets/fonts/manrope-cyrillic-wght-normal.woff2',
    '/assets/fonts/manrope-latin-wght-normal.woff2',
    '/assets/fonts/unbounded-cyrillic-wght-normal.woff2',
    '/assets/fonts/unbounded-latin-wght-normal.woff2',

    // assets — PWA иконки
    '/assets/icon-192x192v4.png',
    '/assets/icon-512x512v4.png',

    // assets — системные
    '/assets/404.png',
    '/assets/500.png',
    '/assets/offline.png',
    '/assets/shark.png',
    '/assets/wary-shark.png',
    '/assets/proud-shark.png',
    '/assets/angry-shark.png',

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

/* Внешние библиотеки (CDN): кладём в кэш, чтобы графики, импорт Excel/PDF работали без сети */
const CDN_ASSETS = [
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
    'https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
];
const CDN_HOSTS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

/* === INSTALL ======================================================== */
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(async cache => {
                // cache:'reload' — берём свежие файлы с сервера, а не из HTTP-кэша браузера
                const local = STATIC_ASSETS.map(url => cache.add(new Request(url, { cache: 'reload' })));
                const cdn   = CDN_ASSETS.map(url => cache.add(new Request(url, { mode: 'cors', credentials: 'omit' })));
                const results = await Promise.allSettled([...local, ...cdn]);
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
    const isCdn = CDN_HOSTS.includes(url.hostname);

    // ⛔ Для umami.js и прочей аналитики — всегда только сеть
    if (isUmami) {
        event.respondWith(fetch(request));
        return;
    }

    // прочие внешние домены пропускаем
    if (url.origin !== self.location.origin && !isCdn) return;

    // /api/ не кэшируем
    if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;

    // Диапазонные запросы (видео/аудио) не трогаем
    if (request.headers.has('range')) return;

    const isNavigate =
        request.mode === 'navigate' ||
        (request.headers.get('accept') || '').includes('text/html');

    if (isNavigate && !isCdn) {
        event.respondWith(handleNavigate(request, url));
        return;
    }

    // CDN и остальная статика: кэш сразу + тихое обновление из сети
    event.respondWith(cacheFirst(event, request));
});

/* === HELPERS ======================================================== */

// Страница: сеть (до 4 с) → иначе то, что есть в кэше → иначе offline.html
async function handleNavigate(request, url) {
    try {
        const resp = await fromNetwork(request, 4000);
        if (!resp.ok) {
            if (resp.status === 404) return (await caches.match('/404.html')) || resp;
            if (resp.status >= 500)  return (await caches.match('/500.html')) || resp;
        }
        cacheIfAllowed(request, resp.clone());
        return resp;
    } catch (e) {
        // офлайн или очень медленная сеть: открываем приложение из кэша
        const exact = await caches.match(request);
        if (exact) return exact;
        const bare = await caches.match(request, { ignoreSearch: true });
        if (bare) return bare;
        const p = url.pathname;
        if (p === '/' || p === '' || p.endsWith('/index.html') || !/\.[a-z0-9]+$/i.test(p)) {
            const app = await caches.match('/index.html');
            if (app) return app;
        }
        return (await caches.match('/offline.html')) ||
            new Response('Нет соединения', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
}

async function cacheFirst(event, request) {
    const cached = await caches.match(request);
    const refresh = fetch(request)
        .then(resp => { cacheIfAllowed(request, resp.clone()); return resp; })
        .catch(() => null);

    if (cached) {
        event.waitUntil(refresh);   // обновляем кэш в фоне, пока SW жив
        return cached;
    }
    const net = await refresh;
    if (net) return net;
    // та же статика, но с другим ?v= — берём любую копию
    const loose = await caches.match(request, { ignoreSearch: true });
    return loose || Response.error();
}

function cacheIfAllowed(request, response) {
    if (response.ok && response.status === 200 && (response.type === 'basic' || response.type === 'cors')) {
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
