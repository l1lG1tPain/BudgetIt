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

// Проверка новой версии Service Worker и показ всплывашки
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistration().then((reg) => {
    if (reg && reg.waiting) {
      const updateModal = document.createElement('div');
      updateModal.style.position = 'fixed';
      updateModal.style.bottom = '20px';
      updateModal.style.left = '50%';
      updateModal.style.transform = 'translateX(-50%)';
      updateModal.style.background = '#000';
      updateModal.style.color = '#fff';
      updateModal.style.padding = '15px 20px';
      updateModal.style.borderRadius = '10px';
      updateModal.style.boxShadow = '0 4px 10px rgba(0,0,0,0.3)';
      updateModal.style.zIndex = '9999';
      updateModal.style.fontFamily = 'Poppins, sans-serif';
      updateModal.innerHTML = `
        Новая версия доступна <button style="margin-left: 10px; padding: 5px 10px; background: #2be82a; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">Обновить</button>
      `;
      updateModal.querySelector('button').onclick = () => {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        window.location.reload();
      };
      document.body.appendChild(updateModal);
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initThemeSelector();
  uiManager.initialize();
  document.getElementById('settings-btn')?.addEventListener('click', () => {
    uiManager.openModal('settings-page');
    setTimeout(() => initializeAnalytics(budgetManager), 100);
  });
});