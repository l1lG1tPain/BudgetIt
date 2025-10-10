// app.js — обновлён под новую кнопку‑аватар и UIManager
// =====================================================
import { BudgetManager } from './src/BudgetManager.js';
import { UIManager    } from './src/UIManager.js';
import { initThemeSelector } from './src/ThemeManager.js';
import { initSettings } from './src/settings.js';
import { showLoader } from './src/utils/loader.js';

const budgetManager = new BudgetManager();
const uiManager     = new UIManager(budgetManager);

// console.log('[APP] BudgetIt bootstrapping…');

// Быстрая проверка: есть ли бюджеты в localStorage (чтобы решить, нужен ли онбординг)
function needOnboarding() {
  try {
    const raw = localStorage.getItem('budgets');
    const arr = raw ? JSON.parse(raw) : [];
    return !Array.isArray(arr) || arr.length === 0;
  } catch (err) {
    console.error('[BudgetIt] Невалидный JSON бюджетов, очистка', err);
    localStorage.removeItem('budgets');
    return true;
  }
}

const isOnboardingPage = window.location.pathname.includes('onboarding.html');

if (needOnboarding() && !isOnboardingPage) {
  console.warn('[BudgetIt] Нет бюджетов → перенаправляем на onboarding…');
  window.location.href = `${window.location.origin}/onboarding.html`;
} else {
  // Стартуем приложение, когда DOM готов
  document.addEventListener('DOMContentLoaded', () => {
    initThemeSelector();            // сразу подключаем тему
    showLoader();
    uiManager.initialize();         // инициализируем UI
    initSettings(budgetManager, uiManager); // страница профиля / настроек
  });
}

// === Обработка событий от Service Worker ============================
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', event => {
    const { type } = event.data || {};
    if (type === 'SW_UPDATED') {
      console.log('[BudgetIt] Обнаружено обновление SW');

      const banner = document.getElementById('sw-update-banner');
      if (!banner) return;

      banner.classList.remove('hidden');
      banner.classList.add('show');

      setTimeout(() => {
        banner.classList.remove('show');
        banner.classList.add('hidden');
        window.location.reload(); // обновляем страницу
      }, 5000); // 5 сек до автообновления
    }
  });
}

