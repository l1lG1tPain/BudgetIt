import { BudgetManager } from './src/BudgetManager.js';
import { UIManager } from './src/UIManager.js';
import { initThemeSelector } from './src/ThemeManager.js';

const budgetManager = new BudgetManager();
const uiManager = new UIManager(budgetManager);
const raw = localStorage.getItem('budgets');
let list = [];

try {
  list = raw ? JSON.parse(raw) : [];
} catch (error) {
  console.error('[BudgetIt] Ошибка при парсинге бюджетов:', error);
  list = [];
}

const isOnboarding = window.location.pathname.includes('onboarding.html');

if (!Array.isArray(list) || list.length === 0) {
  if (!isOnboarding) {
    console.warn('[BudgetIt] Нет бюджетов, переход на onboarding...');
    location.href = `${window.location.origin}/onboarding.html`;
  }
} else {
  document.addEventListener('DOMContentLoaded', () => {
    initThemeSelector();  
    uiManager.initialize();
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        uiManager.openModal('settings-page');
        setTimeout(() => {
          if (typeof initializeAnalytics === 'function') {
            initializeAnalytics(budgetManager);
          } else {
            console.warn('[BudgetIt] Функция initializeAnalytics не определена');
          }
        }, 100);
      });
    } else {
      console.warn('[BudgetIt] Элемент с id "settings-btn" не найден');
    }
  });
}
