// === CONFIG ===
const CACHE_VERSION = "budgetit-v2.9.1";
const CACHE_NAME = `budgetit-cache-v2.9.1`;
const ASSETS = [
  "/", // Главная страница
  "/index.html",
  "/style.css",
  "/app.js",
  "/manifest.json?v=2.9.1", // Манифест с версией
  "/assets/icon-192x192v2.9.png", // Иконки для PWA
  "/assets/icon-512x512v2.9.png"
];

// === INSTALL ===
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting(); // Активирует новый Service Worker сразу
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
  self.clients.claim(); // 👈 Применяет SW ко всем вкладкам
});

// === FETCH ===
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request);
    })
  );
});
