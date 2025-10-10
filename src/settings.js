// settings.js  —  ESM-модуль без глобальных window-утечек
// -----------------------------------------------------------------
import { initThemeSelector }   from './ThemeManager.js';
import { initializeAnalytics } from './widgets/charts.js';
import { FAQ_ITEMS }           from '../constants/faq-constants.js';
import { renderAchievementsList, getUnlockedAchievements } from './utils/achievements.js';
import { showTweak } from './utils/tweakSystem.js';
import { calculateAchievementContext } from './utils/achievementUtils.js';
import { refreshUserProfile } from './profileAnalytics.js';



/* =================================================================
   Локальные переменные
   ================================================================= */
let localBudgetManager = null;
let exportChartInstance = null;

/* =================================================================
   FAQ renderer
   ================================================================= */
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

/* =================================================================
   Навигация между подстраницами (без window.*)
   ================================================================= */
function openSubPage(pageId) {
    document.querySelectorAll('.bottom-sheet').forEach(el => el.classList.add('hidden'));

    const page = document.getElementById(pageId);
    if (!page) {
        console.warn(`[Settings] Не найдена страница: ${pageId}`);
        showTweak(`❌ Страница «${pageId}» не найдена`, 'error', 2000);
        return;
    }

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

/* =================================================================
   Проверка достижений после импорта
   ================================================================= */
function checkAchievements(budgetManager) {
    const currentBudget = budgetManager.budgets[budgetManager.currentBudgetIndex];
    const transactions = currentBudget?.transactions || [];
    const context = calculateAchievementContext(transactions, currentBudget);
    const budgetCount = budgetManager.budgets.length;

    const unlocked = getUnlockedAchievements({
        txCount: transactions.length,
        totals : context,
        budgetCount
    });

    if (unlocked.length) {
        showTweak(`🏅 Достижения обновлены`, 'success', 2500);
    }
}

/* =================================================================
   Инициализация настроек
   ================================================================= */
export function initSettings(budgetManager, ui) {
    localBudgetManager = budgetManager;

    document.querySelector('#user-profile-block .user-profile-card')
        ?.addEventListener('click', () => {
            openSubPage('achievements-page');
        });

    document.getElementById('export-btn')
        ?.addEventListener('click', () => {
            trackSafe?.('export-from-settings');

            const blob = new Blob([JSON.stringify(budgetManager.budgets)], {
                type: 'application/json'
            });
            const url = URL.createObjectURL(blob);

            Object.assign(document.createElement('a'), {
                href: url,
                download: 'budgets.json'
            }).click();

            URL.revokeObjectURL(url);
            showTweak('📁 Бюджеты экспортированы', 'success', 2000);
        });

    // settings.js — внутри initSettings(...)
    document.getElementById('import-file')
    ?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
        try {
            const parsed = JSON.parse(reader.result);

            let budgets, userId, currentBudgetIndex, productNames;

            if (Array.isArray(parsed)) {
            // старый формат
            budgets = parsed;
            currentBudgetIndex = 0;
            } else if (parsed && typeof parsed === 'object') {
            // новый расширенный формат
            budgets            = parsed.budgets || [];
            userId             = parsed.userId || null;
            currentBudgetIndex = Number.isInteger(parsed.currentBudgetIndex) ? parsed.currentBudgetIndex : 0;
            productNames       = Array.isArray(parsed.productNames) ? parsed.productNames : [];
            } else {
            throw new Error('Invalid format');
            }

            // применяем в менеджер
            budgetManager.budgets = budgets;
            budgetManager.currentBudgetIndex = Math.min(Math.max(0, currentBudgetIndex), Math.max(0, budgets.length - 1));
            if (productNames) budgetManager.productNames = productNames;
            budgetManager.saveToStorage();  // сохранит budgets/currentBudgetIndex/productNames в LS :contentReference[oaicite:4]{index=4}

            // восстанавливаем userId
            if (userId) {
            localStorage.setItem('budgetit-user-id', userId); // ← критично для твоих спец.ID :contentReference[oaicite:5]{index=5}
            }

            ui.updateHeader();
            ui.updateUI();
            refreshExportAnalytics(budgetManager);
            // ачивки/профиль как раньше
            // checkAchievements(budgetManager); refreshUserProfile(budgetManager);
            // (оставь твой текущий код если он уже есть)

            showTweak('✅ Данные импортированы', 'success', 2500);
        } catch {
            showTweak('❌ Ошибка при чтении файла', 'error', 4000);
        }
        };
        reader.readAsText(file);
    });


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

        showTweak('🧹 Кэш очищен, сейчас перезагружаемся', 'success', 1500);

        ['appTheme','currentBudgetIndex','productNames','theme','umami-disabled']
            .forEach(key => localStorage.removeItem(key));

        setTimeout(() => {
            if (!('caches' in window)) {
                location.reload();
                return;
            }

            caches.keys()
                .then(keys => Promise.all(keys.map(key => caches.delete(key))))
                .then(() => location.reload())
                .catch(() => location.reload());
        }, 1500);
    });

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

        const backup = new Blob([JSON.stringify(localBudgetManager.budgets)], {
            type: 'application/json'
        });
        const url = URL.createObjectURL(backup);
        Object.assign(document.createElement('a'), {
            href: url,
            download: 'budgets_backup_before_delete.json'
        }).click();
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

    document.querySelectorAll('.bottom-sheet .close-settings-btn')
        ?.forEach(btn => btn.addEventListener('click', goBackFromSubPage));

    document.getElementById('close-settings-btn')
        ?.addEventListener('click', () => {
            document.getElementById('settings-page')?.classList.add('hidden');
            document.getElementById('bottom-sheet-backdrop')?.classList.add('hidden');
        });

    initThemeSelector();

    document.querySelectorAll('.open-subpage-btn[data-page]')
        .forEach(btn => btn.addEventListener('click', () => openSubPage(btn.dataset.page)));
}

/* =================================================================
   Аналитика экспорта
   ================================================================= */
export function refreshExportAnalytics(budgetManager) {
    const exportPage  = document.getElementById('export-import-page');
    const chartCanvas = document.getElementById('chartContainerId');
    if (!exportPage || !chartCanvas) return;

    exportChartInstance?.destroy();

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

    exportChartInstance = new Chart(ctx, {
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
                title : {
                    display: true,
                    text   : `Всего транзакций: ${totalTx}`,
                    font   : { size: 16 }
                }
            }
        }
    });

    const txEl    = document.getElementById('tx-total');
    const countEl = document.getElementById('budget-count');

    if (txEl)    txEl.textContent    = String(totalTx);
    if (countEl) countEl.textContent = String(budgets.length);

    document.querySelector('.budget-list-grid')?.remove();

    const list = document.createElement('div');
    list.className = 'budget-list-grid';
    list.style.cssText = `
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 16px;
    max-height: 90px;
    overflow-y: auto;
  `;

    budgetSummary.forEach(b => {
        const left  = Object.assign(document.createElement('div'), { textContent: b.name });
        const right = Object.assign(document.createElement('div'), {
            textContent: b.count,
            style      : 'text-align:right'
        });
        list.append(left, right);
    });

    const infoBlock = document.getElementById('budget-info-block')
        ?? document.getElementById('budget-count')?.parentElement;

    infoBlock?.parentNode
        ? infoBlock.parentNode.insertBefore(list, infoBlock.nextSibling)
        : exportPage.appendChild(list);
}

export { openSubPage, goBackFromSubPage };
