// === CONFIG ===
const CACHE_VERSION = "budgetit-v1.1";
const CACHE_NAME = `budgetit-${CACHE_VERSION}`;
const ASSETS = [
  "/", // Главная страница
  "/index.html",
  "/style.css",
  "/app.js",
  "/manifest.json", // Манифест
  "/assets/icon-192x192.png", // Иконки для PWA
  "/assets/icon-512x512.png"
];

// === INSTALL ===
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting(); // Активирует новый Service Worker сразу после установки
});

// === ACTIVATE ===
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            // Удаляем устаревшие кэши
            return caches.delete(cache);
          }
        })
      )
    )
  );
  self.clients.claim(); // Берёт управление существующими клиентами
});

// === FETCH ===
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // 1. Если ресурс есть в кэше, отдаем его
      if (cachedResponse) {
        return cachedResponse;
      }

      // 2. Если нет в кэше, пробуем загрузить из сети
      return fetch(event.request);
    })
  );
});
