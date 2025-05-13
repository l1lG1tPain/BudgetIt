// === GLOBAL SAFE WRAPPER ===
window.trackSafe = function trackSafe(event, props = {}) {
  if (typeof umami?.track === 'function') {
    umami.track(event, {
      userId: window.budgetItUserId || 'unknown',
      ...props
    });
  } else {
    console.warn('[Umami] Tracking skipped:', event, props);
  }
};


// === WAITER ===
function waitForUmami(timeout = 10000) {
  return new Promise(resolve => {
    if (typeof umami?.track === 'function') return resolve();
    const interval = setInterval(() => {
      if (typeof umami?.track === 'function') {
        clearInterval(interval);
        resolve();
      }
    }, 100);
    setTimeout(() => {
      clearInterval(interval);
      console.warn('[Umami] Timeout waiting');
      resolve();
    }, timeout);
  });
}

// === PAGE VISIT EVENT ===
function initUmamiEvents() {
  const path = location.pathname;
  const ref = document.referrer || 'direct';

  setTimeout(() => {
    if (path === '/' || path === '/index.html') {
      trackSafe('visit-index', { tag: 'pageview', ref });
    } else if (path.includes('onboarding.html')) {
      trackSafe('visit-onboarding', { tag: 'pageview', ref });
    } else {
      trackSafe('visit-other', { tag: 'pageview', path, ref });
    }
  }, 300); // задержка 300 мс для полной загрузки
}


waitForUmami().then(initUmamiEvents);


