// app.js — полностью исправленный под StorageManager, миграцию и planner
// ====================================================================
import { BudgetManager } from './src/BudgetManager.js';
import { UIManager } from './src/UIManager.js';
import { StorageManager } from './src/StorageManager.js';
import { initThemeSelector } from './src/ThemeManager.js';
import { initSettings } from './src/settings.js';
import { showLoader } from './src/utils/loader.js';
import { SearchManager } from './src/Searchmanager.js';
import { PlannerManager } from './src/planner/PlannerManager.js';
import { PlannerPage } from './src/planner/PlannerPage.js';
import { PlannerSheet } from './src/planner/PlannerSheet.js';

// ===============================================================
// 1. Создаём StorageManager (если есть IndexedDB)
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
// 2. Onboarding checker
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
// 3. Основная инициализация
// ===============================================================
document.addEventListener('DOMContentLoaded', async () => {
    showLoader();
    initThemeSelector();

    let initialState = null;

    if (storageManager) {
        try {
            initialState = await storageManager.loadInitialState();
            console.log('[BudgetIt] Initial state loaded (IDB migration OK):', initialState);
        } catch (e) {
            console.warn('[BudgetIt] Failed loadInitialState → fallback LS', e);
        }
    }

    const budgetManager = new BudgetManager(storageManager);

    if (initialState) {
        budgetManager.budgets = Array.isArray(initialState.budgets) ? initialState.budgets : [];
        budgetManager.currentBudgetIndex = Number.isInteger(initialState.currentBudgetIndex)
            ? initialState.currentBudgetIndex
            : 0;
        budgetManager.productNames = Array.isArray(initialState.productNames)
            ? initialState.productNames
            : [];
        budgetManager.planners = Array.isArray(initialState.planners)
            ? initialState.planners
            : [];
    }

    const uiManager = new UIManager(budgetManager);
    uiManager.initialize();

    window._budgetAppRef = { budgetManager, uiManager };

    const plannerManager = new PlannerManager(budgetManager);

    const plannerPage = new PlannerPage({
        budgetManager,
        plannerManager,
        plannerSheet: null,
        uiManager
    });

    const plannerSheet = new PlannerSheet({
        plannerManager,
        plannerPage
    });

    plannerPage.plannerSheet = plannerSheet;

    plannerSheet.init();
    plannerPage.init();

    window._budgetPlannerRef = { plannerManager, plannerPage, plannerSheet };

    initSettings(budgetManager, uiManager);

    const searchManager = new SearchManager(budgetManager, uiManager);
    searchManager.init();
});

// ===============================================================
// 4. Service Worker
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
    const month = now.getMonth() + 1;
    const day = now.getDate();
    return (month === 12 && day >= 15) || (month === 1 && day <= 20);
}

function createSnow() {
    if (!isNewYearPeriod()) return;

    const container = document.getElementById('snow-overlay');
    if (!container) return;

    container.innerHTML = '';

    const canvas = document.createElement('canvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';

    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const symbols = ['❄', '❅', '❆', '•'];
    const particles = [];
    const particleCount = /iPhone|iPad|iPod/.test(navigator.userAgent) ? 30 : 60;

    for (let i = 0; i < particleCount; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * -canvas.height,
            symbol: symbols[Math.floor(Math.random() * symbols.length)],
            size: Math.random() * 15 + 10,
            speedY: Math.random() * 2 + 1,
            amp: Math.random() * 30 + 10,
            freq: Math.random() * 0.02 + 0.01,
            phase: Math.random() * Math.PI * 2,
            rotSpeed: Math.random() * 0.02 - 0.01,
            angle: 0,
            layer: Math.random(),
        });
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        particles.forEach(p => {
            p.y += p.speedY;
            p.phase += p.freq;
            p.x += Math.sin(p.phase) * (p.amp / 10);
            p.angle += p.rotSpeed;

            const opacity = 0.2 + (1 - p.layer) * 0.8;

            if (p.y > canvas.height + p.size) {
                p.y = -p.size;
                p.x = Math.random() * canvas.width;
                p.phase = Math.random() * Math.PI * 2;
            }

            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.angle);
            ctx.font = `${p.size * (1 - p.layer * 0.3)}px serif`;
            ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
            ctx.fillText(p.symbol, -p.size / 2, p.size / 2);
            ctx.restore();
        });

        requestAnimationFrame(animate);
    }

    animate();

    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    });
}

createSnow();