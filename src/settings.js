// settings.js  —  ESM-модуль
import { initThemeSelector }   from './ThemeManager.js';
import { initializeAnalytics } from './widgets/charts.js';
import { FAQ_ITEMS }           from '../constants/faq-constants.js';
import { renderAchievementsList, getUnlockedAchievements } from './utils/achievements.js';
import { showTweak } from './utils/tweakSystem.js';
import { calculateAchievementContext } from './utils/achievementUtils.js';
import { refreshUserProfile } from './profileAnalytics.js';

let localBudgetManager = null;

/* ========================= FAQ ========================= */
function renderFAQ() {
    const box = document.getElementById('faq-container');
    if (!box) return;
    box.innerHTML = FAQ_ITEMS.map(({ question, answer }) => `
    <details class="faq-item">
      <summary>${question}</summary>
      <p>${answer}</p>
    </details>
  `).join('');
}

/* ====================== Навигация ====================== */
function openSubPage(pageId) {
    document.querySelectorAll('.bottom-sheet').forEach(el => el.classList.add('hidden'));

    const page = document.getElementById(pageId);
    if (!page) {
        showTweak(`❌ Страница «${pageId}» не найдена`, 'error', 2000);
        return;
    }

    if (pageId === 'region-page') renderRegionCards();

    page.classList.remove('hidden');
    document.getElementById('bottom-sheet-backdrop')?.classList.remove('hidden');

    if (pageId === 'faq-page')           renderFAQ();
    if (pageId === 'analytics-page')     initializeAnalytics(localBudgetManager);
    if (pageId === 'export-import-page') refreshExportAnalytics(localBudgetManager);
    if (pageId === 'achievements-page')  renderAchievementsList('achievements-container');
}

function goBackFromSubPage() {
    document.querySelectorAll('.bottom-sheet').forEach(el => el.classList.add('hidden'));
    document.getElementById('settings-page')?.classList.remove('hidden');
    document.getElementById('bottom-sheet-backdrop')?.classList.remove('hidden');
}

/* ============== Достижения после импорта ============== */
function checkAchievements(budgetManager) {
    const currentBudget = budgetManager.budgets[budgetManager.currentBudgetIndex];
    const transactions  = currentBudget?.transactions || [];
    const context       = calculateAchievementContext(transactions, currentBudget);
    const budgetCount   = budgetManager.budgets.length;

    const unlocked = getUnlockedAchievements({
        txCount: transactions.length,
        totals : context,
        budgetCount
    });
    if (unlocked.length) showTweak(`🏅 Достижения обновлены`, 'success', 2500);
}

/* ===================== Инициализация ==================== */
export function initSettings(budgetManager, ui) {
    localBudgetManager = budgetManager;

    document.querySelector('#user-profile-block .user-profile-card')
        ?.addEventListener('click', () => openSubPage('achievements-page'));

    // 📤 Экспорт
    document.getElementById('export-btn')?.addEventListener('click', () => {
        try { trackSafe?.('export-from-settings'); } catch {}

        // Экспортируем не только бюджеты, но и индекс + productNames
        const exportState = {
            budgets: localBudgetManager.budgets,
            currentBudgetIndex: localBudgetManager.currentBudgetIndex,
            productNames: localBudgetManager.productNames
        };

        const blob = new Blob([JSON.stringify(exportState, null, 2)], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        Object.assign(document.createElement('a'), { href: url, download: 'budgetit_data.json' }).click();
        URL.revokeObjectURL(url);
        showTweak('📁 Данные экспортированы', 'success', 2000);
    });

    // 📥 Импорт
    document.getElementById('import-file')?.addEventListener('change', (e) => {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(reader.result);
                let budgets, importedUserId, currentBudgetIndex, productNames;

                if (Array.isArray(parsed)) {
                    // Старый формат: просто массив бюджетов
                    budgets = parsed;
                    currentBudgetIndex = 0;
                    importedUserId = null;
                    productNames = [];
                } else if (parsed && typeof parsed === 'object') {
                    budgets            = parsed.budgets || [];
                    currentBudgetIndex = Number.isInteger(parsed.currentBudgetIndex)
                        ? parsed.currentBudgetIndex
                        : 0;
                    productNames       = Array.isArray(parsed.productNames) ? parsed.productNames : [];
                    importedUserId     = (typeof parsed.userId === 'string' && parsed.userId.trim())
                        ? parsed.userId.trim()
                        : null;
                } else {
                    throw new Error('Invalid format');
                }

                budgetManager.budgets = budgets;
                budgetManager.currentBudgetIndex =
                    Math.min(Math.max(0, currentBudgetIndex), Math.max(0, budgets.length - 1));
                budgetManager.productNames = productNames;

                // Сохраняем в сторедж (IndexedDB + зеркало в localStorage)
                budgetManager.saveToStorage();

                // userId: не затираем существующий, если его нет в файле
                const existingUserId = localStorage.getItem('budgetit-user-id');
                const finalUserId    = importedUserId ?? existingUserId;
                if (finalUserId) {
                    localStorage.setItem('budgetit-user-id', finalUserId);
                }

                ui.updateHeader(); ui.updateUI();
                refreshExportAnalytics(budgetManager);
                checkAchievements(budgetManager);
                refreshUserProfile(budgetManager);
                showTweak('✅ Данные импортированы', 'success', 2500);
            } catch {
                showTweak('❌ Ошибка при чтении файла', 'error', 4000);
            }
        };
        reader.readAsText(file);
    });

    // Очистка кэша
    document.getElementById('clear-cache-btn')?.addEventListener('click', () => {
        document.getElementById('clear-cache-modal')?.classList.remove('hidden');
        document.getElementById('bottom-sheet-backdrop')?.classList.remove('hidden');
    });
    document.getElementById('cancel-clear-cache')?.addEventListener('click', () => {
        document.getElementById('clear-cache-modal')?.classList.add('hidden');
        document.getElementById('bottom-sheet-backdrop')?.classList.add('hidden');
    });
    document.getElementById('confirm-clear-cache')?.addEventListener('click', () => {
        document.getElementById('clear-cache-modal')?.classList.add('hidden');
        document.getElementById('bottom-sheet-backdrop')?.classList.add('hidden');

        showTweak('🧹 Кэш очищен, перезагружаем...', 'success', 1500);
        ['appTheme','currentBudgetIndex','productNames','theme','umami-disabled']
            .forEach(k => localStorage.removeItem(k));

        setTimeout(() => {
            if (!('caches' in window)) { location.reload(); return; }
            caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).finally(() => location.reload());
        }, 1500);
    });

    // Полная очистка
    document.getElementById('clear-data-btn')?.addEventListener('click', () => {
        document.getElementById('clear-data-modal')?.classList.remove('hidden');
        document.getElementById('bottom-sheet-backdrop')?.classList.remove('hidden');
    });
    document.getElementById('cancel-clear-data')?.addEventListener('click', () => {
        document.getElementById('clear-data-modal')?.classList.add('hidden');
        document.getElementById('bottom-sheet-backdrop')?.classList.add('hidden');
    });
    document.getElementById('confirm-clear-data')?.addEventListener('click', () => {
        showTweak('🗑️ Все данные бэкапированы и удаляются...', 'success', 1500);

        const backup = new Blob([JSON.stringify(localBudgetManager.budgets)], { type: 'application/json' });
        const url = URL.createObjectURL(backup);
        Object.assign(document.createElement('a'), { href: url, download: 'budgets_backup_before_delete.json' }).click();
        URL.revokeObjectURL(url);

        setTimeout(() => {
            localStorage.clear();
            indexedDB.databases?.().then(dbs => {
                dbs.forEach(db => indexedDB.deleteDatabase(db.name));
                location.reload();
            });
        }, 10000);

        document.getElementById('clear-data-modal')?.classList.add('hidden');
        document.getElementById('bottom-sheet-backdrop')?.classList.add('hidden');
    });

    // Навигация
    document.querySelectorAll('.bottom-sheet .close-settings-btn')
        .forEach(btn => btn.addEventListener('click', goBackFromSubPage));
    document.getElementById('close-settings-btn')
        ?.addEventListener('click', () => {
            document.getElementById('settings-page')?.classList.add('hidden');
            document.getElementById('bottom-sheet-backdrop')?.classList.add('hidden');
        });

    // Тема
    initThemeSelector();

    // Страница/пункт «Регион и валюты»
    ensureRegionPage();
    ensureRegionNavButton();

    if (!localStorage.getItem('region')) localStorage.setItem('region', 'UZ');

    // порядок меню
    reorderSettingsMenu();

    // применить текущую видимость чипсов
    applyChipsVisibility();

    document.querySelectorAll('.open-subpage-btn[data-page]')
        .forEach(btn => btn.addEventListener('click', () => openSubPage(btn.dataset.page)));
}

/* ================= Аналитика экспорта (fixed scope) ================= */
export function refreshExportAnalytics(budgetManager) {
    const exportPage  = document.getElementById('export-import-page');
    const chartCanvas = document.getElementById('chartContainerId');
    if (!exportPage || !chartCanvas) return;

    // УДАЛЯЕМ ТОЛЬКО В ПРЕДЕЛАХ exportPage
    exportPage.querySelector('.budget-list-grid')?.remove();

    if (chartCanvas.__chartInstance) {
        chartCanvas.__chartInstance.destroy();
        chartCanvas.__chartInstance = null;
    }

    const ctx           = chartCanvas.getContext('2d');
    const budgets       = budgetManager.budgets || [];
    const totalCounts   = { income: 0, expense: 0, deposit: 0, debt: 0 };
    const budgetSummary = [];

    budgets.forEach(budget => {
        const txs = budget.transactions || [];
        txs.forEach(tx => totalCounts[tx.type] !== undefined && totalCounts[tx.type]++);
        budgetSummary.push({ name: budget.name, count: txs.length });
    });

    const chartData = [
        totalCounts.income,
        totalCounts.expense,
        totalCounts.deposit,
        totalCounts.debt
    ];
    const totalTx = chartData.reduce((s, v) => s + v, 0);

    const chart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Доходы', 'Расходы', 'Вклады', 'Долги'],
            datasets: [{
                data: chartData,
                backgroundColor: ['#2aace8', '#e82b2a', '#8a2be2', '#e8a22a'],
                borderWidth: 0
            }]
        },
        options: {
            plugins: {
                legend: { position: 'bottom' },
                title : { display: true, text: `Всего транзакций: ${totalTx}`, font: { size: 16 } }
            }
        }
    });
    chartCanvas.__chartInstance = chart;

    const list = document.createElement('div');
    list.className = 'budget-list-grid';
    list.style.cssText = `
    display:grid; grid-template-columns:1fr 1fr; gap:10px;
    margin-top:16px; max-height:90px; overflow-y:auto;
  `;
    budgetSummary.forEach(b => {
        const left  = Object.assign(document.createElement('div'), { textContent: b.name });
        const right = Object.assign(document.createElement('div'), { textContent: b.count, style: 'text-align:right' });
        list.append(left, right);
    });

    const infoBlock = document.getElementById('budget-info-block')
        ?? document.getElementById('budget-count')?.parentElement;
    infoBlock?.parentNode
        ? infoBlock.parentNode.insertBefore(list, infoBlock.nextSibling)
        : exportPage.appendChild(list);

    const txEl    = document.getElementById('tx-total');
    const countEl = document.getElementById('budget-count');
    if (txEl)    txEl.textContent    = String(totalTx);
    if (countEl) countEl.textContent = String(budgets.length);
}

/* ================= «Регион и валюты» ================= */
const REGIONS_LIST = [
    { code: 'UZ', name: 'Узбекистан', flag: '🇺🇿', base: 'UZS' },
    { code: 'RU', name: 'Россия',     flag: '🇷🇺', base: 'RUB' },
    { code: 'KZ', name: 'Казахстан',  flag: '🇰🇿', base: 'KZT' },
    { code: 'KG', name: 'Киргизия',   flag: '🇰🇬', base: 'KGS' },
];

export function getRegion()  { return localStorage.getItem('region') || 'UZ'; }
export function setRegion(c) {
    localStorage.setItem('region', c);
    window.dispatchEvent(new CustomEvent('budgetit:region-changed', { detail: { region: c } }));
    applyChipsVisibility();
}

/* --- общий переключатель видимости чипсов --- */
const CHIPS_HIDDEN_KEY = 'chipsHidden';
function areChipsHidden() { return localStorage.getItem(CHIPS_HIDDEN_KEY) === '1'; }
function setChipsHidden(v) { localStorage.setItem(CHIPS_HIDDEN_KEY, v ? '1' : '0'); }

function applyChipsVisibility() {
    const holder = document.getElementById('currency-chips-placeholder');
    if (!holder) return;
    holder.style.display = areChipsHidden() ? 'none' : '';
}

/* --- создание страницы --- */
function ensureRegionPage() {
    if (document.getElementById('region-page')) return;
    const page = document.createElement('div');
    page.id = 'region-page';
    page.className = 'bottom-sheet fullscreen-sheet hidden';
    page.innerHTML = `
    <h2>🌍 Регионы и валюты</h2>
    <p style="margin:6px 0 12px;color:var(--muted-color)">
      Выберите страну — базовая валюта приложения, расчёты и подписи на карточках
      будут автоматически переключены под выбранный регион.
    </p>
    <div id="region-grid" class="budget-list-grid"></div>
    <button class="close-settings-btn" data-close-region>Назад</button>
  `;
    document.body.appendChild(page);
    renderRegionCards();
    page.querySelector('[data-close-region]')?.addEventListener('click', goBackFromSubPage);
}

function ensureRegionNavButton() {
    const nav = document.querySelector('.settings-nav-list');
    if (!nav) return;
    if (nav.querySelector('[data-page="region-page"]')) return;
    const btn = document.createElement('button');
    btn.className = 'open-subpage-btn';
    btn.dataset.page = 'region-page';
    btn.textContent = '🌍 Регионы и валюты';
    nav.insertBefore(btn, nav.firstChild);
}

/* --- карточки регионов + отдельная строка-кнопка скрытия чипсов --- */
function renderRegionCards() {
    const grid = document.getElementById('region-grid'); if (!grid) return;
    const current = getRegion();

    const regionsHtml = REGIONS_LIST.map(r => {
        const active = r.code === current;
        return `
      <div class="budget-item" data-region="${r.code}" style="
        display:flex;align-items:center;justify-content:space-between;
        padding:10px 12px;margin:8px 0;border-radius:12px;
        background:${active ? 'var(--primary-color)' : 'var(--main-ground)'};
        color:${active ? '#000' : 'var(--secondary-color)'};">
        <div style="display:flex;gap:10px;align-items:center;">
          <span style="font-size:1.4rem">${r.flag}</span>
          <div><b>${r.name}</b>
            <div style="font-size:.85em;opacity:.7">Базовая валюта: ${r.base}</div>
          </div>
        </div>
        <button class="choose-btn" style="
          width:auto;padding:8px 12px;font-size:.95rem;border-radius:12px; margin-top: 0;
          border:0;background:${active ? 'rgba(0,0,0,.15)' : 'rgba(255,255,255,.06)'};color:inherit;">
          ${active ? 'Выбрано' : 'Выбрать'}
        </button>
      </div>
    `;
    }).join('');

    const toggleHtml = `
    <div class="budget-item" data-toggle-chips style="
      display:flex;align-items:center;justify-content:space-between;
      padding:10px 12px;margin:12px 0 4px;border-radius:12px;
      background:var(--main-ground);color:var(--secondary-color);">
      <div style="display:flex;gap:10px;align-items:center;">
        <span>💱</span>
        <div><b>Курс валют</b>
          <div style="font-size:.85em;opacity:.7">Показывать/скрывать виджет с курсами</div>
        </div>
      </div>
      <button class="chips-toggle-btn" style="
        width:auto;padding:8px 12px;font-size:.95rem;border-radius:10px;
        border:1px solid var(--border-color, rgba(255,255,255,.15));
        background:transparent;color:var(--secondary-color);
        backdrop-filter:saturate(120%);">
        ${areChipsHidden() ? 'Показать курс валют' : 'Скрыть курс валют'}
      </button>
    </div>
  `;

    grid.innerHTML = regionsHtml + toggleHtml;

    grid.querySelectorAll('.choose-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const code = btn.closest('.budget-item').getAttribute('data-region');
            setRegion(code);
            renderRegionCards();
            try { showTweak('Регион: ' + code, 'success', 1200); } catch {}
        });
    });

    grid.querySelector('.chips-toggle-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        setChipsHidden(!areChipsHidden());
        applyChipsVisibility();
        renderRegionCards();
    });
}

/* ============== Порядок пунктов меню настроек ============== */
function renderSettingsList() {
    const settingsList = document.querySelector('.settings-nav-list');
    if (!settingsList) return;

    settingsList.innerHTML = '';

    const desired = [
        { page: 'analytics-page',     text: '📊 Аналитика' },
        { page: 'theme-page',         text: '🎨 Темы оформления' },
        { page: 'region-page',        text: '🌍 Регионы и валюты' },
        { page: 'export-import-page', text: '🗄️ Работа с Данными' },
        { page: 'faq-page',           text: '❓ Q&A' },
        { page: 'about-page',         text: 'ℹ️ О приложении' },
    ];

    desired.forEach(item => {
        const btn = document.createElement('button');
        btn.className = 'open-subpage-btn';

        btn.dataset.page = item.page;
        btn.innerHTML = `
      <span class="settings-icon">${item.text.split(' ')[0]}</span>
      <span class="settings-text">${item.text.slice(item.text.indexOf(' ') + 1)}</span>
    `;

        btn.addEventListener('click', () => openSubPage(item.page));
        settingsList.appendChild(btn);
    });
}

// вызвать рендер при старте
renderSettingsList();

function reorderSettingsMenu() {
    // сейчас реодер делается через renderSettingsList — оставлено для совместимости,
    // если будешь дорабатывать, можно подвязать сюда доп.логику
}

export { openSubPage, goBackFromSubPage };
