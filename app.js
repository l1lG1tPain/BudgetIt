import { BudgetManager } from './src/BudgetManager.js';
import { UIManager } from './src/UIManager.js';
import { initThemeSelector } from './src/ThemeManager.js';

const budgetManager = new BudgetManager();
const uiManager = new UIManager(budgetManager);
const raw = localStorage.getItem('budgets');
const list = raw ? JSON.parse(raw) : [];

const isOnboarding = window.location.pathname.includes('onboarding.html');

if (!Array.isArray(list) || list.length === 0) {
  if (!isOnboarding) {
    location.replace('onboarding.html');
  }
}



document.addEventListener('DOMContentLoaded', () => {
  initThemeSelector();  
  uiManager.initialize();
  document
    .getElementById('settings-btn')
    ?.addEventListener('click', () => {
      uiManager.openModal('settings-page');
      setTimeout(
        () => initializeAnalytics(budgetManager),
        100
      );
    });
});