/**
 * umami-events.js  —  BudgetIt analytics layer
 *
 * Что делает:
 *  1. trackSafe()      — безопасная обёртка + очередь пока умами не загрузился
 *  2. sendPageView()   — page-view для текущего pathname
 *  3. SPA-навигация    — слушает budgetit:page-open + lnav клики → page-view на каждый таб
 *  4. Онбординг        — трекает ключевые действия на onboarding.html
 *  5. App-трекинг      — все ключевые действия в index.html
 */

/* ─── 1. ОЧЕРЕДЬ + SAFE WRAPPER ──────────────────────────────────────── */

const _umamiQueue = [];
let   _umamiReady = false;

window.trackSafe = function trackSafe(event, props = {}) {
  try {
    if (_umamiReady && typeof umami?.track === 'function') {
      umami.track(event, props);
    } else {
      _umamiQueue.push({ event, props });
    }
  } catch (err) {
    console.warn('[Umami] trackSafe error:', err);
  }
};

function _flushQueue() {
  while (_umamiQueue.length) {
    const { event, props } = _umamiQueue.shift();
    try { umami.track(event, props); } catch (_) {}
  }
}

/* ─── 2. WAIT FOR UMAMI ──────────────────────────────────────────────── */

function waitForUmami(timeout = 10_000) {
  return new Promise(resolve => {
    if (typeof umami?.track === 'function') {
      _umamiReady = true;
      return resolve();
    }
    const started = Date.now();
    const poll = setInterval(() => {
      if (typeof umami?.track === 'function') {
        clearInterval(poll);
        _umamiReady = true;
        _flushQueue();
        resolve();
      } else if (Date.now() - started > timeout) {
        clearInterval(poll);
        resolve();
      }
    }, 100);
  });
}

/* ─── 3. PAGE-VIEW ───────────────────────────────────────────────────── */

function sendPageView(virtualPath) {
  try {
    const path = virtualPath || location.pathname;
    umami.track({ url: path, referrer: document.referrer || '' });
  } catch (err) {
    console.warn('[Umami] sendPageView error:', err);
  }
}

window.sendPageView = sendPageView;

/* ─── 4. SPA-НАВИГАЦИЯ ───────────────────────────────────────────────── */

const NAV_PATHS = {
  home:      '/app/home',
  analytics: '/app/analytics',
  planner:   '/app/planner',
  profile:   '/app/profile',
};

const PAGE_PATHS = {
  'analytics-page': '/app/analytics',
  'planner-page':   '/app/planner',
  'settings-page':  '/app/profile',
};

function initSPATracking() {
  // Кастомные события страниц (openPage диспатчит budgetit:page-open)
  window.addEventListener('budgetit:page-open', function (e) {
    const path = PAGE_PATHS[e.detail?.id];
    if (path) sendPageView(path);
  });

  // Клики по навбару — capture чтобы поймать до обработчиков навигации
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('.lnav-item[data-nav]');
    if (!btn) return;
    const tab  = btn.dataset.nav;
    const path = NAV_PATHS[tab];
    if (!path) return;
    sendPageView(path);
    trackSafe('nav-tab', { tab });
  }, true);
}

/* ─── 5. ОНБОРДИНГ ───────────────────────────────────────────────────── */

function initOnboardingTracking() {
  if (!location.pathname.includes('onboarding')) return;

  document.addEventListener('click', function (e) {
    if (e.target.closest('#ob-create-btn'))  trackSafe('onboarding-create-click');
    if (e.target.closest('.ob-help'))        trackSafe('onboarding-help-open');
    if (e.target.closest('.shark-btn'))      trackSafe('onboarding-cta-click');
  });

  const fileInput = document.getElementById('file-input');
  if (fileInput) {
    fileInput.addEventListener('change', function () {
      if (fileInput.files?.length) {
        trackSafe('onboarding-import-click', { filename: fileInput.files[0].name });
      }
    });
  }

  window.addEventListener('pagehide', function () {
    trackSafe('onboarding-complete');
  });
}

/* ─── 6. APP-ТРЕКИНГ ─────────────────────────────────────────────────── */

function initAppTracking() {
  if (location.pathname.includes('onboarding')) return;

  /* ── Все клики через одну делегацию ──────────────────────────────── */
  document.addEventListener('click', function (e) {

    // FAB — открытие шита добавления транзакции
    if (e.target.closest('#add-btn')) {
      trackSafe('fab-open');
    }

    // Выбор типа транзакции (Доходы / Расходы / Долги / Вклады)
    const txChip = e.target.closest('.chip-btn[data-type]');
    if (txChip && txChip.closest('#transaction-sheet')) {
      trackSafe('tx-type-select', { type: txChip.dataset.type });
    }

    // Переключение бюджета через контекстное меню
    if (e.target.closest('.budget-ctx-item')) {
      trackSafe('budget-switch');
    }

    // Открытие поиска
    if (e.target.closest('#search-btn, .search-open-btn')) {
      trackSafe('search-open');
    }

    // Фильтр по типу в поиске
    const searchChip = e.target.closest('.search-type-chip[data-type]');
    if (searchChip) {
      trackSafe('search-filter', { type: searchChip.dataset.type });
    }

    // Открытие редактирования транзакции
    if (e.target.closest('#edit-transaction')) {
      trackSafe('tx-edit-open');
    }

    // Оплата долга — кнопка в детальном шите (открытие модалки)
    if (e.target.closest('#pay-debt-detail')) {
      trackSafe('debt-pay-open');
    }

    // Подтверждение оплаты долга
    if (e.target.closest('#pay-debt-confirm')) {
      trackSafe('debt-pay-confirm');
    }

    // Экспорт данных
    if (e.target.closest('#export-btn')) {
      trackSafe('export-data');
    }

    // Очистка кэша
    if (e.target.closest('#clear-cache-btn')) {
      trackSafe('clear-cache');
    }

    // Удаление всех данных — попытка (модалка подтверждения ещё не открылась)
    if (e.target.closest('#clear-data-btn')) {
      trackSafe('clear-data-attempt');
    }

    // Пикер месяца на главной
    if (e.target.closest('#month-picker-btn')) {
      trackSafe('month-picker-open');
    }

    // Планировщик — создать новый план
    if (e.target.closest('#planner-quick-create-btn')) {
      trackSafe('planner-create-open');
    }

    // Планировщик — редактировать план
    if (e.target.closest('#planner-edit-btn')) {
      trackSafe('planner-edit-open');
    }

    // Планировщик — удалить план (попытка, до подтверждения)
    if (e.target.closest('#planner-delete-btn')) {
      trackSafe('planner-delete-attempt');
    }

    // Настройки — переход в подстраницу
    // data-page: theme-page | region-page | export-import-page | faq-page | about-page
    const subpageBtn = e.target.closest('.open-subpage-btn[data-page]');
    if (subpageBtn) {
      trackSafe('settings-subpage', { page: subpageBtn.dataset.page });
    }

  });

  /* ── Сабмиты форм ────────────────────────────────────────────────── */
  document.addEventListener('submit', function (e) {
    const form = e.target;
    if (!form) return;

    // Редактирование транзакций
    // (create-* уже трекаются в UIManager с деталями суммы/категории — не дублируем)
    if (form.id === 'edit-income-form')  trackSafe('tx-edit-save', { type: 'income' });
    if (form.id === 'edit-expense-form') trackSafe('tx-edit-save', { type: 'expense' });

    // Сохранение плана
    if (form.id === 'planner-form') trackSafe('planner-save');
  });

  /* ── Поиск — дебаунс чтобы не спамить на каждый символ ─────────── */
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    let _searchTimer = null;
    searchInput.addEventListener('input', function () {
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(function () {
        const q = searchInput.value.trim();
        if (q.length >= 2) trackSafe('search-query', { length: q.length });
      }, 800);
    });
  }

  /* ── Кастомные события из приложения ─────────────────────────────── */
  window.addEventListener('budgetit:analytics-open', function () {
    trackSafe('analytics-open');
  });
}

/* ─── INIT ────────────────────────────────────────────────────────────── */

waitForUmami().then(function () {
  const isOnboarding = location.pathname.includes('onboarding');
  sendPageView(isOnboarding ? '/onboarding' : '/app/home');

  if (!isOnboarding) {
    initSPATracking();
    initAppTracking();
  } else {
    initOnboardingTracking();
  }
});