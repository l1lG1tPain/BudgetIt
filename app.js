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
    const month = now.getMonth() + 1;
    const day = now.getDate();
    return (month === 12 && day >= 15) || (month === 1 && day <= 20);
}

function createSnow() {
    if (!isNewYearPeriod()) return;

    const container = document.getElementById('snow-overlay');
    if (!container) return;

    // Создаем canvas вместо множества span
    container.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    const symbols = ['❄', '❅', '❆', '•'];
    const particles = [];
    const particleCount = /iPhone|iPad|iPod/.test(navigator.userAgent) ? 30 : 60; // Меньше частиц на iOS для оптимизации

    // Создание частиц
    for (let i = 0; i < particleCount; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * -canvas.height, // Стартуем выше экрана
            symbol: symbols[Math.floor(Math.random() * symbols.length)],
            size: Math.random() * 15 + 10, // Размер от 10 до 25px
            speedY: Math.random() * 2 + 1, // Скорость падения 1-3 px/frame
            amp: Math.random() * 30 + 10, // Амплитуда колебания 10-40px
            freq: Math.random() * 0.02 + 0.01, // Частота колебания
            phase: Math.random() * Math.PI * 2, // Случайная фаза
            rotSpeed: Math.random() * 0.02 - 0.01, // Скорость вращения -0.01 to 0.01 rad/frame
            angle: 0,
            layer: Math.random(), // 0-1 для симуляции глубины (opacity и blur)
        });
    }

    // Функция анимации
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        particles.forEach(p => {
            // Обновление позиции
            p.y += p.speedY;
            p.phase += p.freq;
            p.x += Math.sin(p.phase) * (p.amp / 10); // Синусоидальное колебание
            p.angle += p.rotSpeed;

            // Симуляция глубины: opacity и "blur" через размер/прозрачность
            const opacity = 0.2 + (1 - p.layer) * 0.8; // Ближе - ярче
            const blurSim = p.layer * 3; // Симулируем blur уменьшением размера или opacity

            // Если вышла за экран, респавн сверху
            if (p.y > canvas.height + p.size) {
                p.y = -p.size;
                p.x = Math.random() * canvas.width;
                p.phase = Math.random() * Math.PI * 2;
            }

            // Рисование
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.angle);
            ctx.font = `${p.size * (1 - p.layer * 0.3)}px serif`; // Меньший размер для "дальних"
            ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
            ctx.fillText(p.symbol, -p.size / 2, p.size / 2); // Центрируем
            ctx.restore();
        });

        requestAnimationFrame(animate);
    }

    animate();

    // Обработка ресайза
    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    });
}

createSnow();