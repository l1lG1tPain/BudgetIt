// app.js — обновлён под новую кнопку‑аватар и UIManager
// =====================================================
import { BudgetManager } from './src/BudgetManager.js';
import { UIManager     } from './src/UIManager.js';
import { initThemeSelector } from './src/ThemeManager.js';
import { initSettings } from './src/settings.js';

const budgetManager = new BudgetManager();
const uiManager     = new UIManager(budgetManager);

console.log('[APP] BudgetIt bootstrapping…');

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
    uiManager.initialize();         // инициализируем UI
    initSettings(budgetManager, uiManager); // страница профиля / настроек
  });
}
