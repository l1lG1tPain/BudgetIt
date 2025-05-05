
function trackSafe(event, props) {
  if (typeof umami?.track === 'function') {
    console.log('[Umami] Tracking:', event, props || {});
    umami.track(event, props);
  } else {
    console.warn('[Umami] Not available:', event);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  if (location.href.includes('index.html') && document.referrer === '') {
    trackSafe('open-index-direct');
  }

  // Отслеживание названия бюджета
  document.getElementById('budget-name')?.addEventListener('input', (e) => {
    trackSafe('input-budget-name', { value: e.target.value });
  });

  // Кнопка "Создать бюджет"
  document.querySelector('button[onclick="createBudget()"]')?.addEventListener('click', () => {
    trackSafe('click-create-budget');
  });

  // Импорт JSON-файла
  document.getElementById('file-input')?.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      trackSafe('import-budget-json', { value: e.target.files[0].name });
    }
  });

  // Клик по "Как это работает?"
  document.querySelector('.link')?.addEventListener('click', () => {
    trackSafe('open-help-modal');
  });

  // Закрытие модалки "Как это работает?"
  document.querySelector('.close-modal')?.addEventListener('click', () => {
    trackSafe('close-help-modal');
  });

  // Показ кастомной модалки
  const originalShowModal = window.showModal;
  window.showModal = function (message) {
    trackSafe('show-warning-modal', { value: message });
    originalShowModal(message);
  };

  // Переход на index.html
  window.addEventListener('beforeunload', () => {
    if (document.referrer.includes('onboarding.html') && location.href.includes('index.html')) {
      trackSafe('navigate-to-index');
    }
  });

  // ======================
  // === index.html часть =
  // ======================

  // Переключение бюджета
  document.querySelector('#budget-selector')?.addEventListener('change', (e) => {
    trackSafe('switch-budget', { value: e.target.value });
  });

  // Кнопка "Добавить транзакцию"
  document.querySelector('#add-transaction')?.addEventListener('click', () => {
    trackSafe('click-add-transaction');
  });

  // Тип транзакции
  document.querySelector('#transaction-type')?.addEventListener('change', (e) => {
    trackSafe('select-transaction-type', { value: e.target.value });
  });

  // Ввод суммы
  document.querySelector('#transaction-amount')?.addEventListener('input', () => {
    trackSafe('input-amount');
  });

  // Кастомный выбор категории
  document.querySelectorAll('.custom-option')?.forEach(opt => {
    opt.addEventListener('click', () => {
      trackSafe('select-category', { value: opt.dataset.value });
    });
  });

  // Подтверждение транзакции
  document.querySelector('#submit-transaction')?.addEventListener('click', () => {
    trackSafe('submit-transaction');
  });

  // Навигация по вкладкам
  document.querySelectorAll('[data-tab]')?.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      trackSafe(`open-tab-${tab}`);
    });
  });

  // Экспорт / Импорт
  document.querySelector('[data-action="export"]')?.addEventListener('click', () => {
    trackSafe('export-budget');
  });

  document.querySelector('[data-action="import"]')?.addEventListener('click', () => {
    trackSafe('import-budget-manual');
  });
});
