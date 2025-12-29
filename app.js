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

function isNewYearPeriod() {
    const now = new Date();
    const month = now.getMonth() + 1; // getMonth() возвращает 0-11
    const day = now.getDate();

    // Декабрь (12), начиная с 15-го числа
    const isDecember = (month === 12 && day >= 15);
    // Январь (1), до 20-го числа включительно
    const isJanuary = (month === 1 && day <= 20);

    return isDecember || isJanuary;
}

function createSnow() {
    // Проверка периода: если не праздники, просто выходим
    if (!isNewYearPeriod()) return;

    const container = document.getElementById('snow-overlay');
    if (!container) return;

    container.innerHTML = '';
    const snowflakesCount = 45;
    const symbols = ['❄', '❅', '❆', '•'];

    for (let i = 0; i < snowflakesCount; i++) {
        const span = document.createElement('span');
        const rand = Math.random();

        let layer = 'far';
        if (rand > 0.8) layer = 'near';
        else if (rand > 0.4) layer = 'mid';

        span.className = `snowflake ${layer}`;
        span.innerText = symbols[Math.floor(Math.random() * symbols.length)];

        // Длительность падения (чем ближе, тем быстрее)
        const fallDuration = layer === 'near' ? Math.random() * 5 + 5 : Math.random() * 10 + 15;
        // Скорость раскачивания (независимо от падения)
        const swayDuration = Math.random() * 2 + 3;
        // На сколько пикселей отклоняется в сторону (от 20 до 70)
        const swayAmount = Math.random() * 50 + 20;

        Object.assign(span.style, {
            left: Math.random() * 100 + '%',
            fontSize: (layer === 'near' ? 20 : 12) + Math.random() * 10 + 'px',
            // Задаем время для каждой анимации через запятую (согласно CSS)
            animationDuration: `${fallDuration}s, ${swayDuration}s`,
            animationDelay: `${Math.random() * -20}s, ${Math.random() * -5}s`
        });

        // Передаем силу раскачивания в CSS
        span.style.setProperty('--sway-amount', swayAmount + 'px');

        container.appendChild(span);
    }
}
createSnow();