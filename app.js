// app.js — полностью исправленный под StorageManager и миграцию
// ====================================================================
import { BudgetManager } from './src/BudgetManager.js';
import { UIManager } from './src/UIManager.js';
import { StorageManager } from './src/StorageManager.js';
import { initThemeSelector } from './src/ThemeManager.js';
import { initSettings } from './src/settings.js';
import { showLoader } from './src/utils/loader.js';
// import { initAnalyticsPage } from './src/analytics/ui/analyticsPage.js';

// ===============================================================
// 🔥 1. Создаём StorageManager (если есть IndexedDB)
// ===============================================================
let storageManager = null;

try {
    if (typeof window !== 'undefined' && 'indexedDB' in window) {
        storageManager = new StorageManager();
    }
} catch (e) {
    console.warn('[BudgetIt] StorageManager init failed → fallback to localStorage', e);
    storageManager = null;
}

// ===============================================================
// 🔥 2. Onboarding checker (оставляем как есть)
// ===============================================================
function needOnboarding() {
    try {
        const raw = localStorage.getItem('budgets');
        const arr = raw ? JSON.parse(raw) : [];
        return !Array.isArray(arr) || arr.length === 0;
    } catch (err) {
        console.error('[BudgetIt] Невалидный JSON бюджетов → сбрасываю LS', err);
        localStorage.removeItem('budgets');
        return true;
    }
}

const isOnboardingPage = window.location.pathname.includes('onboarding.html');

if (needOnboarding() && !isOnboardingPage) {
    console.warn('[BudgetIt] Нет бюджетов → redirect на onboarding');
    window.location.href = `${window.location.origin}/onboarding.html`;
}

// ===============================================================
// 🔥 3. Основная инициализация (DOM Loaded)
// ===============================================================
document.addEventListener('DOMContentLoaded', async () => {
    showLoader();
    initThemeSelector();

    // 3.1. Загружаем state через StorageManager (с миграцией)
    let initialState = null;

    if (storageManager) {
        try {
            initialState = await storageManager.loadInitialState();
            console.log('[BudgetIt] Initial state loaded (IDB migration OK):', initialState);
        } catch (e) {
            console.warn('[BudgetIt] Failed loadInitialState → fallback LS', e);
        }
    }

    // 3.2. Создаём BudgetManager с StorageManager как сингл-стораджем
    const budgetManager = new BudgetManager(storageManager);

    // Если migration дала состояние — подкидываем его менеджеру
    if (initialState) {
        budgetManager.budgets            = initialState.budgets;
        budgetManager.currentBudgetIndex = initialState.currentBudgetIndex;
        budgetManager.productNames       = initialState.productNames;
    }

    // 3.3. UIManager
    const uiManager = new UIManager(budgetManager);
    uiManager.initialize();

    // 3.4. Settings page
    initSettings(budgetManager, uiManager);
});

// ===============================================================
// 🔥 4. Service Worker (как было)
// ===============================================================
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', event => {
        const { type } = event.data || {};
        if (type === 'SW_UPDATED') {
            const banner = document.getElementById('sw-update-banner');
            if (!banner) return;

            banner.classList.remove('hidden');
            banner.classList.add('show');

            setTimeout(() => {
                banner.classList.remove('show');
                banner.classList.add('hidden');
                window.location.reload();
            }, 5005);
        }
    });
}
