/**
 * ▸ отправляет настоящий page‑view + (опционально) meta‑ивент
 * ▸ analytics.js должен вызвать umami.identify() ДО этого файла
 */

/* === SAFE WRAPPER ===================================================== */
window.trackSafe = function trackSafe(event, props = {}) {
  if (typeof umami?.track === 'function') {
    umami.track(event, { userId: window.budgetItUserId || 'unknown', ...props });
  } else {
    console.warn('[Umami] Tracking skipped:', event, props);
  }
};

/* === WAIT UNTIL TRACKER LOADED ======================================== */
function waitForUmami(timeout = 10_000) {
  return new Promise(resolve => {
    if (typeof umami?.track === 'function') return resolve();

    const started = Date.now();
    const poll    = setInterval(() => {
      if (typeof umami?.track === 'function' || Date.now() - started > timeout) {
        clearInterval(poll);
        resolve();
      }
    }, 100);
  });
}

/* === SEND PAGE‑VIEW + META ============================================ */
function sendPageView() {
  const path = location.pathname;          // /index.html, /onboarding.html …
  const ref  = document.referrer || 'direct';

  /* 1. Настоящий page‑view  → попадёт в Views / Sessions (иконка 👁)   */
  // ⚠ аргументов передаём ровно 0 или 1! → это page‑view, не кастом‑ивент
  umami.track(path);         // можно упростить до umami.track() — будет то же

  /* 2. (Необязательно) meta‑ивент  → раздел Events (иконка ⚡)         */
  trackSafe('pageview-meta', {
    tag: 'pageview',
    path,
    ref,
    version: window.BUDGETIT_VERSION || 'dev'
  });
}

/* === INIT ============================================================== */
waitForUmami().then(sendPageView);

/* Экспорт, если нужно вручную вызывать из SPA‑роутера */
window.sendPageView = sendPageView;
