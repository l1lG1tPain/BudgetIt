import { BudgetManager } from './src/BudgetManager.js';
import { UIManager } from './src/UIManager.js';

const budgetManager = new BudgetManager();
const uiManager = new UIManager(budgetManager);

document.addEventListener('DOMContentLoaded', () => {
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
