function waitForUmami(timeout = 10000) {
  return new Promise((resolve) => {
    if (typeof umami?.track === 'function') {
      console.log('[Umami] Already loaded');
      resolve();
    } else {
      console.log('[Umami] Waiting...');
      const interval = setInterval(() => {
        if (typeof umami?.track === 'function') {
          console.log('[Umami] Loaded');
          clearInterval(interval);
          resolve();
        }
      }, 100);
      setTimeout(() => {
        clearInterval(interval);
        console.warn('[Umami] Timeout: Umami not loaded');
        resolve();
      }, timeout);
    }
  });
}

function trackSafe(event, props) {
  if (typeof umami?.track === 'function') {
    console.log('[Umami] Tracking:', event, props || {});
    umami.track(event, props);
  } else {
    console.warn('[Umami] Not available:', event);
  }
}

function initUmamiEvents() {
  if (location.href.includes('index.html') && document.referrer === '') {
    trackSafe('open-index-direct');
  }

  document.getElementById('budget-name')?.addEventListener('input', (e) => {
    trackSafe('input-budget-name', { value: e.target.value });
  });

  document.querySelector('button[onclick="createBudget()"]')?.addEventListener('click', () => {
    trackSafe('click-create-budget');
  });

  document.getElementById('file-input')?.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      trackSafe('import-budget-json', { value: e.target.files[0].name });
    }
  });

  document.querySelector('.link')?.addEventListener('click', () => {
    trackSafe('open-help-modal');
  });

  document.querySelector('.close-modal')?.addEventListener('click', () => {
    trackSafe('close-help-modal');
  });

  const originalShowModal = window.showModal;
  window.showModal = function (message) {
    trackSafe('show-warning-modal', { value: message });
    originalShowModal(message);
  };

  window.addEventListener('beforeunload', () => {
    if (document.referrer.includes('onboarding.html') && location.href.includes('index.html')) {
      trackSafe('navigate-to-index');
    }
  });

  document.querySelector('#budget-selector')?.addEventListener('change', (e) => {
    trackSafe('switch-budget', { value: e.target.value });
  });

  document.querySelector('#add-transaction')?.addEventListener('click', () => {
    trackSafe('click-add-transaction');
  });

  document.querySelector('#transaction-type')?.addEventListener('change', (e) => {
    trackSafe('select-transaction-type', { value: e.target.value });
  });

  document.querySelector('#transaction-amount')?.addEventListener('input', () => {
    trackSafe('input-amount');
  });

  document.querySelectorAll('.custom-option')?.forEach(opt => {
    opt.addEventListener('click', () => {
      trackSafe('select-category', { value: opt.dataset.value });
    });
  });

  document.querySelector('#submit-transaction')?.addEventListener('click', () => {
    trackSafe('submit-transaction');
  });

  document.querySelectorAll('[data-tab]')?.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      trackSafe(`open-tab-${tab}`);
    });
  });

  document.querySelector('[data-action="export"]')?.addEventListener('click', () => {
    trackSafe('export-budget');
  });

  document.querySelector('[data-action="import"]')?.addEventListener('click', () => {
    trackSafe('import-budget-manual');
  });
}

if (typeof umami?.track === 'function') {
  initUmamiEvents();
} else {
  const checkUmami = setInterval(() => {
    if (typeof umami?.track === 'function') {
      clearInterval(checkUmami);
      initUmamiEvents();
    }
  }, 100);
}