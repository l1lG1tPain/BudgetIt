// === CONFIG ===
const CACHE_VERSION = "budgetit-v2.6f";
const CACHE_NAME = `budgetit-cache-v2.6f`;
const ASSETS = [
  "/", // Главная страница
  "/index.html",
  "/style.css",
  "/app.js",
  "/manifest.json", // Манифест
  "/assets/icon-192x192v2.3.png", // Иконки для PWA
  "/assets/icon-512x512v2.3.png"
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
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache.startsWith("budgetit-") && cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
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
