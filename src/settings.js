// settings.js  —  ESM-модуль
import { initThemeSelector }   from './ThemeManager.js';
import { initializeAnalytics } from './widgets/charts.js';
import { FAQ_ITEMS }           from '../constants/faq-constants.js';
import { renderAchievementsList, getUnlockedAchievements } from './utils/achievements.js';
import { showTweak } from './utils/tweakSystem.js';
import { calculateAchievementContext } from './utils/achievementUtils.js';
import { refreshUserProfile } from './profileAnalytics.js';
import { openProfilePage, refreshHeroName } from './profilePage.js';

let localBudgetManager = null;
let localUI = null;

const DATA_TOOLS_ROOT_ID = 'eip-data-tools-root';
const BACKUP_KEY = 'budgetit_auto_backups_v1';
const MAX_BACKUPS = 5;

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
    if (pageId === 'analytics-page') {
        if (window._navClosePage)    window._navClosePage('settings-page');
        if (window._navOpenPage)     window._navOpenPage('analytics-page');
        if (window._navSetActiveTab) window._navSetActiveTab('analytics');

        initializeAnalytics(localBudgetManager);
        window.dispatchEvent(new CustomEvent('budgetit:analytics-open'));
        return;
    }

    const page = document.getElementById(pageId);
    if (!page) {
        showTweak(`❌ Страница «${pageId}» не найдена`, 'error', 2000);
        return;
    }

    document.querySelectorAll(
        '.fullscreen-sheet:not(#settings-page):not(#analytics-page):not(.hidden)'
    ).forEach(el => el.classList.add('hidden'));

    if (pageId === 'region-page') {
        renderRegionCards();
    }

    if (pageId === 'faq-page') {
        renderFAQ();
    }

    if (pageId === 'export-import-page') {
        ensureDataToolsUI();
        refreshExportAnalytics(localBudgetManager);
        refreshDataToolsUI(localBudgetManager);
    }

    if (pageId === 'achievements-page') {
        renderAchievementsList('achievements-container');
    }

    if (pageId === 'planner-page') {
        const plannerRef = window._budgetPlannerRef;

        if (plannerRef?.plannerPage) {
            plannerRef.plannerPage.open();
            return;
        }

        showTweak('❌ Планировщик пока не инициализирован', 'error', 2000);
        return;
    }

    page.classList.remove('hidden');
}

function goBackFromSubPage() {
    document.querySelectorAll(
        '.fullscreen-sheet:not(#settings-page):not(#analytics-page)'
    ).forEach(el => el.classList.add('hidden'));

    const sp = document.getElementById('settings-page');
    if (sp) sp.classList.remove('hidden');

    if (window._navSetActiveTab) window._navSetActiveTab('profile');
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

    if (unlocked.length) {
        showTweak('🏅 Достижения обновлены', 'success', 2500);
    }
}

/* ===================== Инициализация ==================== */

(function exposeChartsInit() {
    window._initCharts = function(bm) {
        try {
            initializeAnalytics(bm || localBudgetManager);
        } catch (e) {
            console.warn('[Charts] init error', e);
        }
    };
})();

export function initSettings(budgetManager, ui) {
    localBudgetManager = budgetManager;
    localUI = ui;

    // Имя акулки в hero-карточке settings-page — обновляем сразу при инициализации
    refreshHeroName();

    document.getElementById('user-profile-card')?.addEventListener('click', () => {
        openProfilePage(budgetManager);
    });

    // 📤 Полный экспорт
    document.getElementById('export-btn')?.addEventListener('click', () => {
        try { trackSafe?.('export-from-settings'); } catch {}

        const exportState = buildFullExportPayload(budgetManager);

        downloadJSON(exportState, `budgetit_full_backup_${getDateStamp()}.json`);
        showTweak('📁 Данные экспортированы', 'success', 2000);
    });

    // 📥 Импорт
    document.getElementById('import-file')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();

        reader.onload = () => {
            try {
                createAutoBackup('before-import');

                const parsed = JSON.parse(reader.result);
                const normalized = normalizeImportedData(parsed, budgetManager);

                budgetManager.budgets = normalized.budgets;
                budgetManager.currentBudgetIndex = normalized.currentBudgetIndex;
                budgetManager.productNames = normalized.productNames;

                if (Array.isArray(normalized.planners)) {
                    budgetManager.planners = normalized.planners;
                }

                budgetManager.saveToStorage();

                const existingUserId = localStorage.getItem('budgetit-user-id');
                const finalUserId = normalized.userId || existingUserId;

                if (finalUserId) {
                    localStorage.setItem('budgetit-user-id', finalUserId);
                }

                ui?.updateHeader?.();
                ui?.updateUI?.();

                refreshExportAnalytics(budgetManager);
                refreshDataToolsUI(budgetManager);
                checkAchievements(budgetManager);
                refreshUserProfile(budgetManager);

                showTweak('✅ Данные импортированы', 'success', 2500);
            } catch (err) {
                console.warn('[Settings] Import error', err);
                showTweak('❌ Ошибка при чтении файла', 'error', 4000);
            } finally {
                e.target.value = '';
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

        ['appTheme', 'currentBudgetIndex', 'productNames', 'theme', 'umami-disabled']
            .forEach(k => localStorage.removeItem(k));

        setTimeout(() => {
            if (!('caches' in window)) {
                location.reload();
                return;
            }

            caches.keys()
                .then(keys => Promise.all(keys.map(k => caches.delete(k))))
                .finally(() => location.reload());
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
        const backupPayload = buildFullExportPayload(localBudgetManager);
        downloadJSON(backupPayload, `budgetit_before_full_delete_${getDateStamp()}.json`);

        showTweak('🗑️ Бэкап скачан, данные будут удалены...', 'success', 1800);

        setTimeout(() => {
            localStorage.clear();

            if (indexedDB.databases) {
                indexedDB.databases().then(dbs => {
                    dbs.forEach(db => indexedDB.deleteDatabase(db.name));
                    location.reload();
                });
            } else {
                location.reload();
            }
        }, 7000);

        document.getElementById('clear-data-modal')?.classList.add('hidden');
        document.getElementById('bottom-sheet-backdrop')?.classList.add('hidden');
    });

    // Навигация
    document.querySelectorAll('.bottom-sheet .close-settings-btn')
        .forEach(btn => btn.addEventListener('click', goBackFromSubPage));

    document.getElementById('close-settings-btn')
        ?.addEventListener('click', () => {
            document.querySelectorAll('.fullscreen-sheet:not(#analytics-page)')
                .forEach(el => el.classList.add('hidden'));

            document.getElementById('bottom-sheet-backdrop')?.classList.add('hidden');

            if (window._navSetActiveTab) window._navSetActiveTab('home');
            if (window._navClosePage) window._navClosePage('settings-page');
        });

    // Тема
    initThemeSelector();

    // Страница/пункт «Регион и валюты»
    ensureRegionPage();
    ensureRegionNavButton();

    if (!localStorage.getItem('region')) {
        localStorage.setItem('region', 'UZ');
    }

    // Работа с данными
    ensureDataToolsUI();
    initDataTools(budgetManager, ui);

    // Порядок меню
    reorderSettingsMenu();

    // Применить текущую видимость чипсов
    applyChipsVisibility();

    document.querySelectorAll('.open-subpage-btn[data-page]')
        .forEach(btn => {
            btn.onclick = () => openSubPage(btn.dataset.page);
        });
}

/* ================= Аналитика экспорта ================= */

export function refreshExportAnalytics(budgetManager) {
    const exportPage = document.getElementById('export-import-page');
    if (!exportPage || !budgetManager) return;

    const budgets = budgetManager.budgets || [];
    const allTx = budgets.flatMap(b => b.transactions || []);
    const totalTx = allTx.length;

    const counts = { income: 0, expense: 0, deposit: 0, debt: 0 };
    let incomeSum = 0;
    let expenseSum = 0;

    allTx.forEach(tx => {
        if (counts[tx.type] !== undefined) counts[tx.type]++;
        if (tx.type === 'income') incomeSum += Number(tx.amount) || 0;
        if (tx.type === 'expense') expenseSum += Number(tx.amount) || 0;
    });

    const budgetSummary = budgets.map(b => ({
        name : b.name || 'Без названия',
        count: (b.transactions || []).length
    }));

    const maxBudgetCount = Math.max(1, ...budgetSummary.map(b => b.count));

    _setText('budget-count', budgets.length);
    _setText('tx-total', totalTx);
    _setText('eip-income-sum', _fmtK(incomeSum));
    _setText('eip-expense-sum', _fmtK(expenseSum));

    const barsContainer = document.getElementById('eip-bars-container');
    const chartTotal = document.getElementById('eip-chart-total-label');

    if (barsContainer) {
        const barDefs = [
            { key: 'income',  label: 'Доходы',  color: '#27AE60' },
            { key: 'expense', label: 'Расходы', color: '#ff4b5c' },
            { key: 'deposit', label: 'Вклады',  color: '#9B59B6' },
            { key: 'debt',    label: 'Долги',   color: '#F1C40F' },
        ];

        const maxCount = Math.max(1, ...barDefs.map(d => counts[d.key]));

        barsContainer.innerHTML = barDefs.map(d => `
            <div class="eip-bar-row">
                <div class="eip-bar-label">
                    <span class="eip-bar-dot" style="background:${d.color}"></span>
                    ${d.label}
                </div>
                <div class="eip-bar-track">
                    <div class="eip-bar-fill"
                         data-pct="${(counts[d.key] / maxCount) * 100}"
                         style="background:${d.color};width:0%"></div>
                </div>
                <span class="eip-bar-count">${counts[d.key]}</span>
            </div>
        `).join('');

        if (chartTotal) {
            chartTotal.textContent = `всего ${totalTx}`;
        }

        requestAnimationFrame(() => {
            barsContainer.querySelectorAll('.eip-bar-fill').forEach(el => {
                el.style.width = el.dataset.pct + '%';
            });
        });
    }

    _renderSparkline(allTx);

    const budgetsList = document.getElementById('eip-budgets-list');

    if (budgetsList) {
        budgetsList.innerHTML = `
            <div class="eip-budgets-title">Бюджеты</div>
            ${budgetSummary.length === 0
            ? `<p style="font-size:.8rem;opacity:.4;text-align:center;margin:8px 0 0">Нет бюджетов</p>`
            : budgetSummary.map(b => `
                    <div class="eip-budget-row">
                        <span class="eip-budget-name">${escapeHTML(b.name)}</span>
                        <div class="eip-budget-bar-track">
                            <div class="eip-budget-bar-fill"
                                 style="width:${Math.round((b.count / maxBudgetCount) * 100)}%"></div>
                        </div>
                        <span class="eip-budget-count">${b.count}</span>
                    </div>
                `).join('')
        }
        `;
    }

    refreshDataToolsUI(budgetManager);
}

/* ================= Мощная работа с данными ================= */

function ensureDataToolsUI() {
    const exportPage = document.getElementById('export-import-page');
    if (!exportPage) return;

    if (document.getElementById(DATA_TOOLS_ROOT_ID)) return;

    const content = exportPage.querySelector('.subpage-content') || exportPage;
    const anchor = content.querySelector('.eip-actions-grid');

    const root = document.createElement('div');
    root.id = DATA_TOOLS_ROOT_ID;
    root.className = 'eip-data-tools';

    root.innerHTML = `
        <div class="eip-tools-head">
            <div>
                <h3>Работа с данными</h3>
                <p>Месяцы, импорты, дубли, бэкапы и чистка текущего бюджета</p>
            </div>
            <button id="eip-refresh-tools-btn" class="eip-mini-icon-btn" type="button" aria-label="Обновить">↻</button>
        </div>

        <div class="eip-tools-grid">
            <div class="eip-tool-card eip-tool-card-primary">
                <div class="eip-tool-card-title">Период</div>

                <label class="eip-tool-label" for="eip-month-select">Выбранный месяц</label>

                <div class="eip-month-row">
                    <input id="eip-month-select" class="eip-month-input" type="month">
                    <button id="eip-fill-current-month" class="eip-mini-btn" type="button">Текущий</button>
                </div>

                <div class="eip-type-row">
                    <label class="eip-tool-label" for="eip-type-filter">Тип для удаления</label>
                    <select id="eip-type-filter" class="eip-type-select">
                        <option value="all">Все типы</option>
                        <option value="income">Доходы</option>
                        <option value="expense">Расходы</option>
                        <option value="deposit">Вклады</option>
                        <option value="debt">Долги</option>
                    </select>
                </div>

                <div id="eip-month-summary" class="eip-month-summary">
                    Выберите месяц, чтобы увидеть данные.
                </div>

                <div class="eip-tool-actions">
                    <button id="eip-export-month-btn" class="eip-tool-btn eip-tool-btn-safe" type="button">
                        Экспорт месяца
                    </button>

                    <button id="eip-delete-month-btn" class="eip-tool-btn eip-tool-btn-danger" type="button">
                        Удалить выбранное
                    </button>
                </div>
            </div>

            <div class="eip-tool-card">
                <div class="eip-tool-card-title">Быстрый экспорт</div>

                <div class="eip-maintenance-grid eip-maintenance-grid-compact">
                    <button id="eip-export-budget-btn" class="eip-maintenance-btn" type="button">
                        <span>💼</span>
                        <b>Текущий бюджет</b>
                        <small>Экспорт без остальных бюджетов</small>
                    </button>

                    <button id="eip-download-last-backup-btn" class="eip-maintenance-btn" type="button">
                        <span>🛟</span>
                        <b>Последний бэкап</b>
                        <small>Скачать последний авто-снимок</small>
                    </button>
                </div>
            </div>
        </div>

        <div class="eip-maintenance-grid">
            <button id="eip-rebuild-products-btn" class="eip-maintenance-btn" type="button">
                <span>🧩</span>
                <b>Пересобрать товары</b>
                <small>Подсказки из реальных расходов</small>
            </button>

            <button id="eip-clean-broken-btn" class="eip-maintenance-btn" type="button">
                <span>🧼</span>
                <b>Очистить битые</b>
                <small>Без даты, типа или суммы</small>
            </button>

            <button id="eip-find-duplicates-btn" class="eip-maintenance-btn" type="button">
                <span>🕵️</span>
                <b>Найти дубли</b>
                <small>Похожие операции после импорта</small>
            </button>

            <button id="eip-delete-duplicates-btn" class="eip-maintenance-btn eip-maintenance-danger" type="button">
                <span>🧨</span>
                <b>Удалить дубли</b>
                <small>Оставить по одной операции</small>
            </button>
        </div>

        <div id="eip-duplicates-result" class="eip-duplicates-result hidden"></div>

        <div class="eip-import-batches">
            <div class="eip-import-head">
                <div>
                    <h4>Пачки импорта</h4>
                    <p>Можно откатить последнюю кривую загрузку</p>
                </div>
            </div>
            <div id="eip-import-batches-list" class="eip-import-batches-list"></div>
        </div>

        <div class="eip-backups-block">
            <div class="eip-import-head">
                <div>
                    <h4>Автобэкапы</h4>
                    <p>Создаются перед опасными действиями</p>
                </div>
            </div>
            <div id="eip-backups-list" class="eip-backups-list"></div>
        </div>
    `;

    if (anchor) {
        anchor.insertAdjacentElement('afterend', root);
    } else {
        content.appendChild(root);
    }
}

function initDataTools(budgetManager, ui) {
    ensureDataToolsUI();

    const monthInput = document.getElementById('eip-month-select');
    if (!monthInput) return;

    const setCurrentMonth = () => {
        const now = new Date();
        monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        refreshDataToolsUI(budgetManager);
    };

    document.getElementById('eip-fill-current-month').onclick = setCurrentMonth;
    document.getElementById('eip-refresh-tools-btn').onclick = () => refreshDataToolsUI(budgetManager);

    monthInput.onchange = () => refreshDataToolsUI(budgetManager);
    document.getElementById('eip-type-filter').onchange = () => refreshDataToolsUI(budgetManager);

    document.getElementById('eip-export-month-btn').onclick = () => {
        exportSelectedMonth(budgetManager);
    };

    document.getElementById('eip-delete-month-btn').onclick = async () => {
        await deleteSelectedMonthOrType(budgetManager, ui);
    };

    document.getElementById('eip-export-budget-btn').onclick = () => {
        exportCurrentBudget(budgetManager);
    };

    document.getElementById('eip-download-last-backup-btn').onclick = () => {
        downloadLastAutoBackup();
    };

    document.getElementById('eip-rebuild-products-btn').onclick = () => {
        const count = rebuildProductNames(budgetManager);
        budgetManager.saveToStorage();

        refreshExportAnalytics(budgetManager);
        refreshDataToolsUI(budgetManager);
        ui?.updateUI?.();

        showTweak(`🧩 Подсказки товаров пересобраны: ${count}`, 'success', 2200);
    };

    document.getElementById('eip-clean-broken-btn').onclick = () => {
        createAutoBackup('before-clean-broken');

        const removed = cleanBrokenTransactions(budgetManager);
        budgetManager.saveToStorage();

        refreshExportAnalytics(budgetManager);
        refreshDataToolsUI(budgetManager);
        ui?.updateUI?.();

        showTweak(
            removed > 0 ? `🧼 Удалено битых операций: ${removed}` : '🧼 Битых операций не найдено',
            removed > 0 ? 'success' : 'info',
            2400
        );
    };

    document.getElementById('eip-find-duplicates-btn').onclick = () => {
        renderDuplicateReport(budgetManager);
    };

    document.getElementById('eip-delete-duplicates-btn').onclick = async () => {
        await deleteDuplicateTransactions(budgetManager, ui);
    };

    if (!monthInput.value) {
        setCurrentMonth();
    }

    refreshDataToolsUI(budgetManager);
}

function refreshDataToolsUI(budgetManager) {
    updateMonthSummary(budgetManager);
    renderImportBatches(budgetManager);
    renderAutoBackups();
}

function getCurrentBudgetSafe(budgetManager) {
    return budgetManager?.getCurrentBudget?.()
        || budgetManager?.budgets?.[budgetManager.currentBudgetIndex]
        || null;
}

function getSelectedMonthKey() {
    const value = document.getElementById('eip-month-select')?.value || '';
    return /^\d{4}-\d{2}$/.test(value) ? value : '';
}

function getSelectedTypeFilter() {
    return document.getElementById('eip-type-filter')?.value || 'all';
}

function getMonthTransactions(budgetManager, monthKey, type = 'all') {
    const budget = getCurrentBudgetSafe(budgetManager);
    const txs = budget?.transactions || [];

    return txs.filter(tx => {
        const sameMonth = (tx.date || '').slice(0, 7) === monthKey;
        const sameType = type === 'all' || tx.type === type;
        return sameMonth && sameType;
    });
}

function updateMonthSummary(budgetManager) {
    const summaryEl = document.getElementById('eip-month-summary');
    if (!summaryEl) return;

    const monthKey = getSelectedMonthKey();
    const type = getSelectedTypeFilter();

    if (!monthKey) {
        summaryEl.textContent = 'Выберите месяц, чтобы увидеть сколько операций будет затронуто.';
        return;
    }

    const txs = getMonthTransactions(budgetManager, monthKey, type);
    const counts = txs.reduce((acc, tx) => {
        acc[tx.type] = (acc[tx.type] || 0) + 1;
        acc.total++;
        return acc;
    }, { total: 0, income: 0, expense: 0, deposit: 0, debt: 0 });

    const totalAmount = txs.reduce((sum, tx) => {
        return sum + (Number(tx.amount) || Number(tx.initialAmount) || 0);
    }, 0);

    const typeLabel = type === 'all' ? 'все типы' : getTypeLabel(type);

    summaryEl.innerHTML = `
        <b>${escapeHTML(monthKey)}</b> · ${escapeHTML(typeLabel)}<br>
        Операций: <b>${counts.total}</b><br>
        Доходы: ${counts.income || 0}, расходы: ${counts.expense || 0},
        вклады: ${counts.deposit || 0}, долги: ${counts.debt || 0}<br>
        Оборот по суммам: <b>${formatDataToolNumber(totalAmount)}</b>
    `;
}

function exportSelectedMonth(budgetManager) {
    const monthKey = getSelectedMonthKey();
    const type = getSelectedTypeFilter();

    if (!monthKey) {
        showTweak('Выберите месяц для экспорта', 'warning', 2200);
        return;
    }

    const budget = getCurrentBudgetSafe(budgetManager);
    if (!budget) {
        showTweak('Бюджет не найден', 'error', 2200);
        return;
    }

    const txs = getMonthTransactions(budgetManager, monthKey, type);

    if (!txs.length) {
        showTweak('Нет операций для экспорта', 'info', 2200);
        return;
    }

    const payload = {
        version: 4,
        exportType: 'month',
        exportedAt: new Date().toISOString(),
        month: monthKey,
        type,
        budgetName: budget.name || 'Без названия',
        budgetId: budget.id || null,
        transactions: txs
    };

    downloadJSON(
        payload,
        `budgetit_${safeFileName(budget.name || 'budget')}_${monthKey}_${type}.json`
    );

    showTweak(`📤 Экспортировано операций: ${txs.length}`, 'success', 2200);
}

function exportCurrentBudget(budgetManager) {
    const budget = getCurrentBudgetSafe(budgetManager);

    if (!budget) {
        showTweak('Бюджет не найден', 'error', 2200);
        return;
    }

    const payload = {
        version: 4,
        exportType: 'budget',
        exportedAt: new Date().toISOString(),
        currentBudgetIndex: budgetManager.currentBudgetIndex,
        productNames: budgetManager.productNames || [],
        budget
    };

    downloadJSON(
        payload,
        `budgetit_budget_${safeFileName(budget.name || 'budget')}_${getDateStamp()}.json`
    );

    showTweak('💼 Текущий бюджет экспортирован', 'success', 2200);
}

async function deleteSelectedMonthOrType(budgetManager, ui) {
    const monthKey = getSelectedMonthKey();
    const type = getSelectedTypeFilter();

    if (!monthKey) {
        showTweak('Выберите месяц для удаления', 'warning', 2200);
        return;
    }

    const budget = getCurrentBudgetSafe(budgetManager);
    if (!budget?.transactions) {
        showTweak('Бюджет не найден', 'error', 2200);
        return;
    }

    const txs = getMonthTransactions(budgetManager, monthKey, type);

    if (!txs.length) {
        showTweak('Нет операций для удаления', 'info', 2200);
        return;
    }

    createAutoBackup(`before-delete-${monthKey}-${type}`);

    const backup = {
        version: 4,
        exportType: 'backup-before-period-delete',
        exportedAt: new Date().toISOString(),
        month: monthKey,
        type,
        budgetName: budget.name || 'Без названия',
        budgetId: budget.id || null,
        transactions: txs
    };

    downloadJSON(
        backup,
        `backup_before_delete_${safeFileName(budget.name || 'budget')}_${monthKey}_${type}.json`
    );

    const typeText = type === 'all' ? 'Все операции' : getTypeLabel(type);

    const ok = await showDataConfirmModal({
        variant: 'danger',
        icon: '🗑️',
        title: 'Удалить данные за месяц?',
        message: `
            Будет удалено <b>${txs.length}</b> операций.<br>
            Период: <b>${escapeHTML(monthKey)}</b><br>
            Тип: <b>${escapeHTML(typeText)}</b><br><br>
            Бэкап уже скачан автоматически.
        `,
        confirmText: 'Удалить',
        cancelText: 'Отмена'
    });

    if (!ok) {
        showTweak('Удаление отменено', 'info', 1800);
        return;
    }

    const idsToDelete = new Set(txs.map(tx => tx.id));
    const before = budget.transactions.length;

    budget.transactions = budget.transactions.filter(tx => !idsToDelete.has(tx.id));

    const removed = before - budget.transactions.length;

    budgetManager.saveToStorage();

    refreshExportAnalytics(budgetManager);
    refreshDataToolsUI(budgetManager);
    ui?.updateUI?.();
    refreshUserProfile(budgetManager);

    showTweak(`🗑️ Удалено операций: ${removed}`, 'success', 2600);

    try {
        trackSafe?.('delete-period-data', {
            tag: 'data',
            month: monthKey,
            type,
            removed
        });
    } catch {}
}

function rebuildProductNames(budgetManager) {
    const names = new Set();

    (budgetManager.budgets || []).forEach(budget => {
        (budget.transactions || []).forEach(tx => {
            if (tx.type !== 'expense') return;

            (tx.products || []).forEach(product => {
                const name = String(product?.name || '').trim();
                if (name) names.add(name);
            });
        });
    });

    budgetManager.productNames = [...names].sort((a, b) => a.localeCompare(b, 'ru'));

    return budgetManager.productNames.length;
}

function cleanBrokenTransactions(budgetManager) {
    let removed = 0;
    const validTypes = new Set(['income', 'expense', 'deposit', 'debt']);

    (budgetManager.budgets || []).forEach(budget => {
        const before = budget.transactions?.length || 0;

        budget.transactions = (budget.transactions || []).filter(tx => {
            const hasValidType = validTypes.has(tx.type);
            const hasDate = /^\d{4}-\d{2}-\d{2}$/.test(tx.date || '');
            const hasAmount = Number(tx.amount) > 0 || Number(tx.initialAmount) > 0;

            return hasValidType && hasDate && hasAmount;
        });

        removed += before - budget.transactions.length;
    });

    return removed;
}

function getDuplicateGroups(budgetManager) {
    const budget = getCurrentBudgetSafe(budgetManager);
    const txs = budget?.transactions || [];
    const map = new Map();

    txs.forEach(tx => {
        const amount = Math.round(Number(tx.amount) || Number(tx.initialAmount) || 0);
        const title = normalizeTxText(
            tx.category ||
            tx.name ||
            tx.products?.[0]?.name ||
            tx.description ||
            ''
        );

        const key = [
            tx.type || '',
            tx.date || '',
            amount,
            title
        ].join('|');

        const list = map.get(key) || [];
        list.push(tx);
        map.set(key, list);
    });

    return [...map.values()].filter(list => list.length > 1);
}

function renderDuplicateReport(budgetManager) {
    const resultEl = document.getElementById('eip-duplicates-result');
    if (!resultEl) return;

    const groups = getDuplicateGroups(budgetManager);

    resultEl.classList.remove('hidden');

    if (!groups.length) {
        resultEl.innerHTML = '🕵️ Подозрительных дублей не найдено.';
        showTweak('Дубли не найдены', 'info', 2000);
        return;
    }

    const totalDuplicates = groups.reduce((sum, group) => sum + group.length, 0);
    const removable = groups.reduce((sum, group) => sum + Math.max(0, group.length - 1), 0);

    resultEl.innerHTML = `
        <b>Найдено групп дублей:</b> ${groups.length}<br>
        <b>Операций в этих группах:</b> ${totalDuplicates}<br>
        <b>Можно удалить дублей:</b> ${removable}<br><br>
        ${groups.slice(0, 8).map(group => {
        const tx = group[0];
        return `
                <div class="eip-duplicate-row">
                    <b>${escapeHTML(tx.date || '—')}</b> ·
                    ${escapeHTML(tx.category || tx.name || tx.type || 'Операция')} ·
                    ${formatDataToolNumber(tx.amount || tx.initialAmount || 0)}
                    <br>
                    <span>повторов: ${group.length}</span>
                </div>
            `;
    }).join('')}
        ${groups.length > 8 ? `<span style="opacity:.6">И ещё ${groups.length - 8} групп...</span>` : ''}
    `;

    showTweak(`🕵️ Найдено групп дублей: ${groups.length}`, 'warning', 2600);
}

async function deleteDuplicateTransactions(budgetManager, ui) {
    const budget = getCurrentBudgetSafe(budgetManager);

    if (!budget?.transactions) {
        showTweak('Бюджет не найден', 'error', 2200);
        return;
    }

    const groups = getDuplicateGroups(budgetManager);
    const idsToDelete = [];

    groups.forEach(group => {
        const sorted = [...group].sort((a, b) => {
            return Number(a.id || 0) - Number(b.id || 0);
        });

        sorted.slice(1).forEach(tx => idsToDelete.push(tx.id));
    });

    if (!idsToDelete.length) {
        showTweak('Дубли не найдены', 'info', 2200);
        return;
    }

    const ok = await showDataConfirmModal({
        variant: 'danger',
        icon: '🧨',
        title: 'Удалить дубли?',
        message: `
            Найдено дублей: <b>${idsToDelete.length}</b>.<br>
            В каждой группе останется самая ранняя операция.<br><br>
            Перед удалением будет создан автобэкап.
        `,
        confirmText: 'Удалить дубли',
        cancelText: 'Отмена'
    });

    if (!ok) {
        showTweak('Удаление дублей отменено', 'info', 1800);
        return;
    }

    createAutoBackup('before-delete-duplicates');

    const idsSet = new Set(idsToDelete);
    budget.transactions = budget.transactions.filter(tx => !idsSet.has(tx.id));

    budgetManager.saveToStorage();

    refreshExportAnalytics(budgetManager);
    refreshDataToolsUI(budgetManager);
    ui?.updateUI?.();
    refreshUserProfile(budgetManager);

    renderDuplicateReport(budgetManager);

    showTweak(`🧨 Удалено дублей: ${idsToDelete.length}`, 'success', 2600);
}

/* ================= Откат пачек импорта ================= */

function getImportBatches(budgetManager) {
    const budget = getCurrentBudgetSafe(budgetManager);
    const txs = budget?.transactions || [];

    const byExplicitId = new Map();
    const noBatch = [];

    txs.forEach(tx => {
        if (tx.importBatchId) {
            const key = String(tx.importBatchId);
            const list = byExplicitId.get(key) || [];
            list.push(tx);
            byExplicitId.set(key, list);
        } else {
            noBatch.push(tx);
        }
    });

    const explicitBatches = [...byExplicitId.entries()].map(([id, list]) => ({
        id,
        mode: 'explicit',
        title: id,
        transactions: list,
        confidence: 'точная пачка'
    }));

    const inferredBatches = inferImportBatchesFromIds(noBatch);

    return [...explicitBatches, ...inferredBatches]
        .filter(batch => batch.transactions.length >= 2)
        .sort((a, b) => {
            const aMax = Math.max(...a.transactions.map(tx => Number(tx.id) || 0));
            const bMax = Math.max(...b.transactions.map(tx => Number(tx.id) || 0));
            return bMax - aMax;
        })
        .slice(0, 12);
}

function inferImportBatchesFromIds(transactions) {
    const numericTxs = transactions
        .filter(tx => Number.isFinite(Number(tx.id)) && Number(tx.id) > 1_000_000_000_000)
        .sort((a, b) => Number(a.id) - Number(b.id));

    const groups = [];
    let current = [];

    numericTxs.forEach(tx => {
        const id = Number(tx.id);
        const prev = current[current.length - 1];

        if (!prev) {
            current.push(tx);
            return;
        }

        const prevId = Number(prev.id);
        const gap = id - prevId;

        if (gap >= 0 && gap <= 120_000) {
            current.push(tx);
        } else {
            if (current.length >= 3) groups.push(current);
            current = [tx];
        }
    });

    if (current.length >= 3) groups.push(current);

    return groups.map((list, index) => {
        const first = list[0];
        const date = new Date(Number(first.id));
        const stamp = Number.isNaN(date.getTime())
            ? `batch_${index + 1}`
            : date.toLocaleString('ru-RU');

        return {
            id: `inferred_${Number(first.id)}`,
            mode: 'inferred',
            title: `Импорт около ${stamp}`,
            transactions: list,
            confidence: 'предполагаемая пачка'
        };
    });
}

function renderImportBatches(budgetManager) {
    const box = document.getElementById('eip-import-batches-list');
    if (!box) return;

    const batches = getImportBatches(budgetManager);

    if (!batches.length) {
        box.innerHTML = `
            <div class="eip-empty-note">
                Пачки импорта пока не найдены. После массового импорта они появятся здесь.
            </div>
        `;
        return;
    }

    box.innerHTML = batches.map((batch, index) => {
        const txs = batch.transactions;
        const firstDate = txs.map(t => t.date).filter(Boolean).sort()[0] || '—';
        const lastDate = txs.map(t => t.date).filter(Boolean).sort().at(-1) || '—';
        const income = txs.filter(t => t.type === 'income').length;
        const expense = txs.filter(t => t.type === 'expense').length;
        const total = txs.reduce((sum, tx) => sum + (Number(tx.amount) || Number(tx.initialAmount) || 0), 0);

        return `
            <div class="eip-import-batch-card">
                <div class="eip-import-batch-main">
                    <b>${escapeHTML(batch.title)}</b>
                    <span>${escapeHTML(batch.confidence)} · ${txs.length} операций</span>
                    <small>${firstDate} — ${lastDate} · доходы ${income}, расходы ${expense} · ${formatDataToolNumber(total)}</small>
                </div>
                <div class="eip-import-batch-actions">
                    <button class="eip-batch-export" data-batch-index="${index}" type="button">Экспорт</button>
                    <button class="eip-batch-rollback" data-batch-index="${index}" type="button">Откатить</button>
                </div>
            </div>
        `;
    }).join('');

    box.querySelectorAll('.eip-batch-export').forEach(btn => {
        btn.onclick = () => {
            const batch = batches[Number(btn.dataset.batchIndex)];
            if (batch) exportImportBatch(batch, budgetManager);
        };
    });

    box.querySelectorAll('.eip-batch-rollback').forEach(btn => {
        btn.onclick = async () => {
            const batch = batches[Number(btn.dataset.batchIndex)];
            if (batch) await rollbackImportBatch(batch, budgetManager, localUI);
        };
    });
}

function exportImportBatch(batch, budgetManager) {
    const budget = getCurrentBudgetSafe(budgetManager);

    const payload = {
        version: 4,
        exportType: 'import-batch',
        exportedAt: new Date().toISOString(),
        budgetName: budget?.name || 'Без названия',
        budgetId: budget?.id || null,
        batchId: batch.id,
        mode: batch.mode,
        confidence: batch.confidence,
        transactions: batch.transactions
    };

    downloadJSON(
        payload,
        `budgetit_import_batch_${safeFileName(batch.id)}_${getDateStamp()}.json`
    );

    showTweak(`📤 Пачка экспортирована: ${batch.transactions.length}`, 'success', 2200);
}

async function rollbackImportBatch(batch, budgetManager, ui) {
    const budget = getCurrentBudgetSafe(budgetManager);

    if (!budget?.transactions) {
        showTweak('Бюджет не найден', 'error', 2200);
        return;
    }

    const ok = await showDataConfirmModal({
        variant: 'warning',
        icon: '↩️',
        title: 'Откатить пачку импорта?',
        message: `
            ${escapeHTML(batch.confidence)}<br>
            Операций в пачке: <b>${batch.transactions.length}</b><br><br>
            Перед откатом будет создан автобэкап.
        `,
        confirmText: 'Откатить',
        cancelText: 'Отмена'
    });

    if (!ok) {
        showTweak('Откат отменён', 'info', 1800);
        return;
    }

    createAutoBackup(`before-rollback-${batch.id}`);

    const ids = new Set(batch.transactions.map(tx => tx.id));
    const before = budget.transactions.length;

    budget.transactions = budget.transactions.filter(tx => !ids.has(tx.id));

    const removed = before - budget.transactions.length;

    budgetManager.saveToStorage();

    refreshExportAnalytics(budgetManager);
    refreshDataToolsUI(budgetManager);
    ui?.updateUI?.();
    refreshUserProfile(budgetManager);

    showTweak(`↩️ Откат импорта: удалено ${removed}`, 'success', 2600);
}

/* ================= Автобэкапы ================= */

function createAutoBackup(reason = 'manual') {
    if (!localBudgetManager) return null;

    const backup = {
        id: `backup_${Date.now()}`,
        reason,
        createdAt: new Date().toISOString(),
        state: buildFullExportPayload(localBudgetManager)
    };

    const backups = getAutoBackups();
    backups.unshift(backup);

    const sliced = backups.slice(0, MAX_BACKUPS);

    try {
        localStorage.setItem(BACKUP_KEY, JSON.stringify(sliced));
    } catch (err) {
        console.warn('[DataTools] Failed to save auto backup', err);
    }

    renderAutoBackups();

    return backup;
}

function getAutoBackups() {
    try {
        const parsed = JSON.parse(localStorage.getItem(BACKUP_KEY) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function renderAutoBackups() {
    const box = document.getElementById('eip-backups-list');
    if (!box) return;

    const backups = getAutoBackups();

    if (!backups.length) {
        box.innerHTML = `<div class="eip-empty-note">Автобэкапов пока нет.</div>`;
        return;
    }

    box.innerHTML = backups.map((backup, index) => {
        const date = backup.createdAt
            ? new Date(backup.createdAt).toLocaleString('ru-RU')
            : '—';

        const txCount = backup.state?.budgets
            ?.flatMap(b => b.transactions || [])
            ?.length || 0;

        return `
            <div class="eip-backup-card">
                <div class="eip-backup-main">
                    <b>${escapeHTML(date)}</b>
                    <span>${escapeHTML(backup.reason || 'backup')} · ${txCount} операций</span>
                </div>
                <div class="eip-backup-actions">
                    <button class="eip-backup-download" data-backup-index="${index}" type="button">Скачать</button>
                    <button class="eip-backup-restore" data-backup-index="${index}" type="button">Восстановить</button>
                </div>
            </div>
        `;
    }).join('');

    box.querySelectorAll('.eip-backup-download').forEach(btn => {
        btn.onclick = () => {
            const backup = backups[Number(btn.dataset.backupIndex)];
            if (!backup) return;

            downloadJSON(
                backup.state,
                `budgetit_auto_backup_${safeFileName(backup.reason)}_${getDateStamp()}.json`
            );
        };
    });

    box.querySelectorAll('.eip-backup-restore').forEach(btn => {
        btn.onclick = async () => {
            const backup = backups[Number(btn.dataset.backupIndex)];
            if (backup) await restoreAutoBackup(backup);
        };
    });
}

function downloadLastAutoBackup() {
    const backup = getAutoBackups()[0];

    if (!backup) {
        showTweak('Автобэкапов пока нет', 'info', 2200);
        return;
    }

    downloadJSON(
        backup.state,
        `budgetit_last_auto_backup_${getDateStamp()}.json`
    );

    showTweak('🛟 Последний автобэкап скачан', 'success', 2200);
}

async function restoreAutoBackup(backup) {
    if (!backup?.state || !localBudgetManager) {
        showTweak('Бэкап повреждён', 'error', 2200);
        return;
    }

    const backupDate = backup.createdAt
        ? new Date(backup.createdAt).toLocaleString('ru-RU')
        : '—';

    const ok = await showDataConfirmModal({
        variant: 'warning',
        icon: '🛟',
        title: 'Восстановить автобэкап?',
        message: `
            Дата: <b>${escapeHTML(backupDate)}</b><br>
            Причина: <b>${escapeHTML(backup.reason || 'backup')}</b><br><br>
            Текущее состояние будет заменено.<br>
            Перед восстановлением создадим ещё один бэкап.
        `,
        confirmText: 'Восстановить',
        cancelText: 'Отмена'
    });

    if (!ok) {
        showTweak('Восстановление отменено', 'info', 1800);
        return;
    }

    createAutoBackup('before-restore-backup');

    const normalized = normalizeImportedData(backup.state, localBudgetManager);

    localBudgetManager.budgets = normalized.budgets;
    localBudgetManager.currentBudgetIndex = normalized.currentBudgetIndex;
    localBudgetManager.productNames = normalized.productNames;

    if (Array.isArray(normalized.planners)) {
        localBudgetManager.planners = normalized.planners;
    }

    localBudgetManager.saveToStorage();

    if (normalized.userId) {
        localStorage.setItem('budgetit-user-id', normalized.userId);
    }

    localUI?.updateHeader?.();
    localUI?.updateUI?.();

    refreshExportAnalytics(localBudgetManager);
    refreshDataToolsUI(localBudgetManager);
    refreshUserProfile(localBudgetManager);
    refreshHeroName();

    showTweak('🛟 Бэкап восстановлен', 'success', 2600);
}

function ensureDataConfirmModal() {
    if (document.getElementById('data-confirm-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'data-confirm-modal';
    modal.className = 'data-confirm-modal hidden';

    modal.innerHTML = `
        <div class="data-confirm-backdrop" data-confirm-cancel></div>

        <div class="data-confirm-card" role="dialog" aria-modal="true" aria-labelledby="data-confirm-title">
            <div class="data-confirm-icon" id="data-confirm-icon">⚠️</div>

            <div class="data-confirm-content">
                <h3 id="data-confirm-title">Подтвердить действие</h3>
                <div id="data-confirm-message" class="data-confirm-message"></div>
            </div>

            <div class="data-confirm-actions">
                <button id="data-confirm-cancel" class="data-confirm-btn data-confirm-btn-cancel" type="button">
                    Отмена
                </button>
                <button id="data-confirm-ok" class="data-confirm-btn data-confirm-btn-ok" type="button">
                    Подтвердить
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

function showDataConfirmModal({
                                  variant = 'danger',
                                  icon = '⚠️',
                                  title = 'Подтвердить действие',
                                  message = '',
                                  confirmText = 'Подтвердить',
                                  cancelText = 'Отмена'
                              } = {}) {
    ensureDataConfirmModal();

    const modal = document.getElementById('data-confirm-modal');
    const iconEl = document.getElementById('data-confirm-icon');
    const titleEl = document.getElementById('data-confirm-title');
    const messageEl = document.getElementById('data-confirm-message');
    const okBtn = document.getElementById('data-confirm-ok');
    const cancelBtn = document.getElementById('data-confirm-cancel');

    if (!modal || !iconEl || !titleEl || !messageEl || !okBtn || !cancelBtn) {
        return Promise.resolve(false);
    }

    modal.classList.remove('data-confirm-danger', 'data-confirm-warning', 'data-confirm-safe');
    modal.classList.add(`data-confirm-${variant}`);

    iconEl.textContent = icon;
    titleEl.textContent = title;
    messageEl.innerHTML = message;
    okBtn.textContent = confirmText;
    cancelBtn.textContent = cancelText;

    modal.classList.remove('hidden');

    return new Promise(resolve => {
        const cleanup = (result) => {
            modal.classList.add('hidden');

            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            modal.removeEventListener('click', onBackdrop);
            document.removeEventListener('keydown', onKeydown);

            resolve(result);
        };

        const onOk = () => cleanup(true);
        const onCancel = () => cleanup(false);

        const onBackdrop = (event) => {
            if (event.target.closest('[data-confirm-cancel]')) {
                cleanup(false);
            }
        };

        const onKeydown = (event) => {
            if (event.key === 'Escape') cleanup(false);
            if (event.key === 'Enter') cleanup(true);
        };

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        modal.addEventListener('click', onBackdrop);
        document.addEventListener('keydown', onKeydown);

        setTimeout(() => okBtn.focus(), 30);
    });
}

/* ================= Экспорт / импорт helpers ================= */

function buildFullExportPayload(budgetManager) {
    return {
        version: 4,
        app: 'BudgetIt',
        exportType: 'full',
        exportedAt: new Date().toISOString(),
        budgets: budgetManager?.budgets || [],
        currentBudgetIndex: Number.isInteger(budgetManager?.currentBudgetIndex)
            ? budgetManager.currentBudgetIndex
            : 0,
        productNames: Array.isArray(budgetManager?.productNames)
            ? budgetManager.productNames
            : [],
        planners: Array.isArray(budgetManager?.planners)
            ? budgetManager.planners
            : [],
        userId: localStorage.getItem('budgetit-user-id') || null
    };
}

function normalizeImportedData(parsed, budgetManager) {
    let budgets = [];
    let importedUserId = null;
    let currentBudgetIndex = 0;
    let productNames = [];
    let planners = [];

    if (Array.isArray(parsed)) {
        budgets = parsed;
    } else if (parsed && typeof parsed === 'object') {
        if (parsed.exportType === 'budget' && parsed.budget) {
            budgets = [parsed.budget];
        } else if (parsed.exportType === 'month' && Array.isArray(parsed.transactions)) {
            const current = getCurrentBudgetSafe(budgetManager);
            const cloned = structuredCloneSafe(current || {
                id: `budget_${Date.now()}`,
                name: parsed.budgetName || 'Импорт месяца',
                transactions: []
            });

            cloned.transactions = [
                ...(cloned.transactions || []),
                ...parsed.transactions
            ];

            budgets = [...(budgetManager.budgets || [])];

            if (budgetManager.currentBudgetIndex >= 0 && budgets[budgetManager.currentBudgetIndex]) {
                budgets[budgetManager.currentBudgetIndex] = cloned;
                currentBudgetIndex = budgetManager.currentBudgetIndex;
            } else {
                budgets.push(cloned);
                currentBudgetIndex = budgets.length - 1;
            }
        } else {
            budgets = Array.isArray(parsed.budgets) ? parsed.budgets : [];
            currentBudgetIndex = Number.isInteger(parsed.currentBudgetIndex)
                ? parsed.currentBudgetIndex
                : 0;
            productNames = Array.isArray(parsed.productNames) ? parsed.productNames : [];
            planners = Array.isArray(parsed.planners) ? parsed.planners : [];
            importedUserId = typeof parsed.userId === 'string' && parsed.userId.trim()
                ? parsed.userId.trim()
                : null;
        }
    } else {
        throw new Error('Invalid import format');
    }

    currentBudgetIndex = Math.min(
        Math.max(0, currentBudgetIndex),
        Math.max(0, budgets.length - 1)
    );

    return {
        budgets,
        currentBudgetIndex,
        productNames,
        planners,
        userId: importedUserId
    };
}

function downloadJSON(payload, filename) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    Object.assign(document.createElement('a'), {
        href: url,
        download: filename
    }).click();

    URL.revokeObjectURL(url);
}

/* ================= Вспомогательные ================= */

function _setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
}

function _fmtK(n) {
    const value = Number(n) || 0;

    if (value >= 1_000_000) return (value / 1_000_000).toFixed(1).replace('.0', '') + 'M';
    if (value >= 1_000)     return (value / 1_000).toFixed(1).replace('.0', '') + 'K';

    return String(Math.round(value));
}

function _renderSparkline(allTx) {
    const canvas = document.getElementById('eip-sparkline-canvas');
    const label = document.getElementById('eip-sparkline-label');

    if (!canvas || typeof Chart === 'undefined') return;

    if (canvas.__chartInstance) {
        canvas.__chartInstance.destroy();
        canvas.__chartInstance = null;
    }

    const now = new Date();
    const months = [];

    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);

        months.push({
            key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
            label: d.toLocaleString('ru', { month: 'short' }),
            income: 0,
            expense: 0
        });
    }

    allTx.forEach(tx => {
        const monthKey = (tx.date || '').slice(0, 7);
        const m = months.find(item => item.key === monthKey);

        if (!m) return;

        if (tx.type === 'income') m.income += Number(tx.amount) || 0;
        if (tx.type === 'expense') m.expense += Number(tx.amount) || 0;
    });

    const totalActivity = months.reduce((s, m) => s + m.income + m.expense, 0);

    if (label) {
        label.textContent = totalActivity > 0 ? `≈ ${_fmtK(totalActivity)} оборот` : '';
    }

    const ctx = canvas.getContext('2d');

    canvas.__chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: months.map(m => m.label),
            datasets: [
                {
                    label: 'Доходы',
                    data: months.map(m => m.income),
                    backgroundColor: 'rgba(39, 174, 96, 0.75)',
                    borderRadius: 5,
                    borderSkipped: false,
                },
                {
                    label: 'Расходы',
                    data: months.map(m => m.expense),
                    backgroundColor: 'rgba(255, 75, 92, 0.65)',
                    borderRadius: 5,
                    borderSkipped: false,
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 500, easing: 'easeOutQuart' },
            plugins: {
                legend: { display: false },
                tooltip: { mode: 'index', intersect: false }
            },
            scales: {
                x: {
                    stacked: false,
                    grid: { display: false },
                    ticks: {
                        color: 'rgba(128,128,128,0.7)',
                        font: { size: 10, weight: '600' },
                        maxRotation: 0
                    },
                    border: { display: false }
                },
                y: {
                    display: false,
                    beginAtZero: true
                }
            }
        }
    });
}

function normalizeTxText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function safeFileName(value) {
    return String(value || 'budget')
        .replace(/[^\p{L}\p{N}_-]+/gu, '_')
        .replace(/_+/g, '_')
        .slice(0, 50);
}

function getDateStamp() {
    const d = new Date();

    return [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, '0'),
        String(d.getDate()).padStart(2, '0'),
        String(d.getHours()).padStart(2, '0'),
        String(d.getMinutes()).padStart(2, '0')
    ].join('-');
}

function formatDataToolNumber(value) {
    const n = Number(value) || 0;
    return new Intl.NumberFormat('ru-RU').format(Math.round(n));
}

function getTypeLabel(type) {
    const map = {
        all: 'Все типы',
        income: 'Доходы',
        expense: 'Расходы',
        deposit: 'Вклады',
        debt: 'Долги'
    };

    return map[type] || type;
}

function escapeHTML(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function structuredCloneSafe(value) {
    if (typeof structuredClone === 'function') {
        return structuredClone(value);
    }

    return JSON.parse(JSON.stringify(value));
}

/* ================= «Регион и валюты» ================= */

const REGIONS_LIST = [
    { code: 'UZ', name: 'Узбекистан', flag: '🇺🇿', base: 'UZS' },
    { code: 'RU', name: 'Россия',     flag: '🇷🇺', base: 'RUB' },
    { code: 'KZ', name: 'Казахстан',  flag: '🇰🇿', base: 'KZT' },
    { code: 'KG', name: 'Киргизия',   flag: '🇰🇬', base: 'KGS' },
];

export function getRegion() {
    return localStorage.getItem('region') || 'UZ';
}

export function setRegion(c) {
    localStorage.setItem('region', c);

    window.dispatchEvent(new CustomEvent('budgetit:region-changed', {
        detail: { region: c }
    }));

    applyChipsVisibility();
}

const CHIPS_HIDDEN_KEY = 'chipsHidden';

function areChipsHidden() {
    return localStorage.getItem(CHIPS_HIDDEN_KEY) === '1';
}

function setChipsHidden(v) {
    localStorage.setItem(CHIPS_HIDDEN_KEY, v ? '1' : '0');
}

function applyChipsVisibility() {
    const holder = document.getElementById('currency-chips-placeholder');
    if (!holder) return;

    holder.style.display = areChipsHidden() ? 'none' : '';
}

function ensureRegionPage() {
    if (document.getElementById('region-page')) return;

    const page = document.createElement('div');
    page.id = 'region-page';
    page.className = 'bottom-sheet fullscreen-sheet hidden';

    page.innerHTML = `
        <div class="subpage-header header">
            <button class="subpage-back-btn close-settings-btn" aria-label="Назад" data-close-region>
                <span class="subpage-back-icon">‹</span>
            </button>
            <h2 class="subpage-title page-title-with-icon"><svg class="budgetit-nav-svg budgetit-nav-region" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="currentColor" opacity="0.18"/><circle cx="12" cy="12" r="9.5" stroke="currentColor" stroke-width="1.4" fill="none" opacity="0.9"/><path d="M2.5 12H21.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.4"/><path d="M3.8 8H20.2" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.28"/><path d="M3.8 16H20.2" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.28"/><ellipse cx="12" cy="12" rx="4.2" ry="9.5" stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.52"/><circle cx="12" cy="9.5" r="1.7" fill="currentColor" opacity="0.8"/><path d="M12 11.2V13.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.65"/></svg><span>Регионы и валюты</span></h2>
            <div class="subpage-header-spacer"></div>
        </div>

        <div class="subpage-content">
            <p style="margin: 0 0 16px; color: var(--muted-color); font-size: 0.9em; line-height: 1.4;">
                Выберите страну — базовая валюта приложения, расчёты и подписи на карточках
                будут автоматически переключены под выбранный регион.
            </p>
            <div id="region-grid" class="budget-list-grid"></div>
        </div>
    `;

    document.body.appendChild(page);

    renderRegionCards();

    const backBtn = page.querySelector('[data-close-region]');
    if (backBtn) {
        backBtn.addEventListener('click', goBackFromSubPage);
    }
}

function ensureRegionNavButton() {
    // Регион рендерится через renderSettingsList — не нужно
}

function renderRegionCards() {
    const grid = document.getElementById('region-grid');
    if (!grid) return;

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
                    <div>
                        <b>${r.name}</b>
                        <div style="font-size:.85em;opacity:.7">Базовая валюта: ${r.base}</div>
                    </div>
                </div>

                <button class="choose-btn" style="
                    width:auto;padding:8px 12px;font-size:.95rem;border-radius:12px;margin-top:0;
                    border:0;background:${active ? 'rgba(0,0,0,.15)' : 'rgba(255,255,255,.06)'};
                    color:inherit;">
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
                <div>
                    <b>Курс валют</b>
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

            try {
                showTweak('Регион: ' + code, 'success', 1200);
            } catch {}
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

    const SVG_ICONS = {
        'theme-page':         `<svg class="budgetit-nav-svg budgetit-nav-theme" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C13.1 22 14 21.1 14 20C14 19.45 13.78 18.95 13.42 18.58C13.07 18.22 12.85 17.72 12.85 17.17C12.85 16.21 13.64 15.42 14.6 15.42H17C19.76 15.42 22 13.18 22 10.42C22 5.81 17.52 2 12 2Z" fill="currentColor" opacity="0.18"/><path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C13.1 22 14 21.1 14 20C14 19.45 13.78 18.95 13.42 18.58C13.07 18.22 12.85 17.72 12.85 17.17C12.85 16.21 13.64 15.42 14.6 15.42H17C19.76 15.42 22 13.18 22 10.42C22 5.81 17.52 2 12 2Z" stroke="currentColor" stroke-width="1.4" fill="none" opacity="0.9"/><circle cx="6.5" cy="11.5" r="1.5" fill="currentColor" opacity="0.7"/><circle cx="9" cy="7" r="1.5" fill="currentColor" opacity="0.55"/><circle cx="14" cy="6" r="1.5" fill="currentColor" opacity="0.4"/><circle cx="18" cy="9" r="1.5" fill="currentColor" opacity="0.65"/><circle cx="17" cy="17" r="1.2" fill="currentColor"/></svg>`,
        'region-page':        `<svg class="budgetit-nav-svg budgetit-nav-region" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="currentColor" opacity="0.18"/><circle cx="12" cy="12" r="9.5" stroke="currentColor" stroke-width="1.4" fill="none" opacity="0.9"/><path d="M2.5 12H21.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.4"/><path d="M3.8 8H20.2" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.28"/><path d="M3.8 16H20.2" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.28"/><ellipse cx="12" cy="12" rx="4.2" ry="9.5" stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.52"/><circle cx="12" cy="9.5" r="1.7" fill="currentColor" opacity="0.8"/><path d="M12 11.2V13.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.65"/></svg>`,
        'export-import-page': `<svg class="budgetit-nav-svg budgetit-nav-data" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="2" y="3" width="20" height="5" rx="1.5" fill="currentColor" opacity="0.18"/><rect x="2" y="3" width="20" height="5" rx="1.5" stroke="currentColor" stroke-width="1.35" fill="none" opacity="0.85"/><rect x="2" y="10" width="20" height="5" rx="1.5" fill="currentColor" opacity="0.13"/><rect x="2" y="10" width="20" height="5" rx="1.5" stroke="currentColor" stroke-width="1.35" fill="none" opacity="0.68"/><rect x="2" y="17" width="20" height="5" rx="1.5" fill="currentColor" opacity="0.08"/><rect x="2" y="17" width="20" height="5" rx="1.5" stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.52"/><circle cx="19" cy="5.5" r="1" fill="currentColor" opacity="0.8"/><circle cx="19" cy="12.5" r="1" fill="currentColor" opacity="0.55"/><circle cx="19" cy="19.5" r="1" fill="currentColor" opacity="0.35"/><path d="M5 5.5L6.5 4L8 5.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.7"/><path d="M5 12.5L6.5 14L8 12.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.7"/></svg>`,
        'planner-page': `<svg class="budgetit-nav-svg budgetit-nav-plan" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M6.35 5.85H17.65C19.25 5.85 20.55 7.15 20.55 8.75V17.05C20.55 18.65 19.25 19.95 17.65 19.95H6.35C4.75 19.95 3.45 18.65 3.45 17.05V8.75C3.45 7.15 4.75 5.85 6.35 5.85Z" fill="currentColor" opacity="0.2"/>
  <path d="M3.65 10.2H20.35" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" opacity="0.42"/>
  <path d="M8.05 4.05V7.25M15.95 4.05V7.25" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
  <rect x="6.7" y="12.35" width="3.05" height="3.05" rx="1" fill="currentColor" opacity="0.45"/>
  <rect x="11.05" y="12.35" width="6.25" height="1.15" rx="0.575" fill="currentColor" opacity="0.55"/>
  <rect x="11.05" y="15.1" width="4.4" height="1.15" rx="0.575" fill="currentColor" opacity="0.38"/>
  <path d="M7.38 13.85L8.05 14.52L9.48 13.05" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M6.35 5.85H17.65C19.25 5.85 20.55 7.15 20.55 8.75V17.05C20.55 18.65 19.25 19.95 17.65 19.95H6.35C4.75 19.95 3.45 18.65 3.45 17.05V8.75C3.45 7.15 4.75 5.85 6.35 5.85Z" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round" opacity="0.9"/>
</svg>`,
        'achievements-page':  `<svg class="budgetit-nav-svg budgetit-nav-trophy" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 3H17V12C17 15.31 14.76 18 12 18C9.24 18 7 15.31 7 12V3Z" fill="currentColor" opacity="0.18"/><path d="M7 3H17V12C17 15.31 14.76 18 12 18C9.24 18 7 15.31 7 12V3Z" stroke="currentColor" stroke-width="1.4" fill="none" opacity="0.9"/><path d="M7 5C7 5 3.5 5 3.5 8.5C3.5 11 6 12.5 7 12.5" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" opacity="0.68"/><path d="M17 5C17 5 20.5 5 20.5 8.5C20.5 11 18 12.5 17 12.5" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" opacity="0.68"/><path d="M12 18V21" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity="0.62"/><rect x="8" y="21" width="8" height="2" rx="1" fill="currentColor" opacity="0.52"/><path d="M12 7L12.9 9.6H15.7L13.4 11.2L14.3 13.8L12 12.2L9.7 13.8L10.6 11.2L8.3 9.6H11.1L12 7Z" fill="currentColor" opacity="0.58"/></svg>`,
        'faq-page':           `<svg class="budgetit-nav-svg budgetit-nav-faq" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 3H21C21.55 3 22 3.45 22 4V15C22 15.55 21.55 16 21 16H14L10 21V16H3C2.45 16 2 15.55 2 15V4C2 3.45 2.45 3 3 3Z" fill="currentColor" opacity="0.18"/><path d="M3 3H21C21.55 3 22 3.45 22 4V15C22 15.55 21.55 16 21 16H14L10 21V16H3C2.45 16 2 15.55 2 15V4C2 3.45 2.45 3 3 3Z" stroke="currentColor" stroke-width="1.4" fill="none" opacity="0.9"/><path d="M9.5 6.5C9.5 6.5 9.5 4.8 12 4.8C14.5 4.8 14.5 6.9 14.5 7.7C14.5 9 12 10 12 11.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none" opacity="0.78"/><circle cx="12" cy="13.5" r="1.1" fill="currentColor" opacity="0.78"/></svg>`,
        'about-page':         `<svg class="budgetit-nav-svg budgetit-nav-about" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="currentColor" opacity="0.18"/><circle cx="12" cy="12" r="9.5" stroke="currentColor" stroke-width="1.4" fill="none" opacity="0.9"/><circle cx="12" cy="7" r="1.1" fill="currentColor" opacity="0.78"/><path d="M12 10V17" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" opacity="0.72"/><path d="M9.8 10H14.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity="0.42"/><path d="M9.8 17H14.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity="0.42"/></svg>`,
    };

    const groups = [
        [
            { page: 'theme-page',         text: 'Темы оформления',    sub: 'Цвета, тёмная и светлая тема',    color: 'linear-gradient(135deg,#8b5cf6,#a78bfa)' },
            { page: 'region-page',        text: 'Регионы и валюты',    sub: 'Валюта и формат чисел',           color: 'linear-gradient(135deg,#0ea5e9,#38bdf8)' },
            { page: 'export-import-page', text: 'Работа с данными',    sub: 'Экспорт, импорт, бэкапы',        color: 'linear-gradient(135deg,#475569,#64748b)' },
            { page: 'planner-page',       text: 'Планировщик бюджета', sub: 'Суточный лимит и план по дням',   color: 'linear-gradient(135deg,#6366f1,#818cf8)' },
        ],
        [
            { page: 'achievements-page',  text: 'Достижения',          sub: 'Твои награды и прогресс',         color: 'linear-gradient(135deg,#f59e0b,#fbbf24)' },
            { page: 'faq-page',           text: 'Q&A',                  sub: 'Частые вопросы и ответы',         color: 'linear-gradient(135deg,#ec4899,#f472b6)' },
            { page: 'about-page',         text: 'О приложении',         sub: 'Версия, разработчик, контакты',  color: 'linear-gradient(135deg,#10b981,#34d399)' },
        ],
    ];

    settingsList.innerHTML = groups.map(group => `
        <div class="sp-nav-group">
            ${group.map(item => `
                <button class="open-subpage-btn sp-nav-btn" data-page="${item.page}">
                    <span class="sp-nav-icon" style="background:${item.color}">${SVG_ICONS[item.page] ?? ''}</span>
                    <span class="sp-nav-text-wrap">
                        <span class="sp-nav-text">${item.text}</span>
                        <span class="sp-nav-sub">${item.sub}</span>
                    </span>
                    <span class="sp-nav-arr">›</span>
                </button>
            `).join('')}
        </div>
    `).join('');

    settingsList.querySelectorAll('.open-subpage-btn[data-page]').forEach(btn => {
        btn.addEventListener('click', () => openSubPage(btn.dataset.page));
    });
}

function reorderSettingsMenu() {
    renderSettingsList();
}

export { openSubPage, goBackFromSubPage };