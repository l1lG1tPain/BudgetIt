// UIManager.js
import { formatNumber, formatDate, getTypeColor, getTypeName } from './utils/utils.js';
import {
    getBudgetEmoji,
    getIncomeEmoji,
    getExpenseEmoji,
    getDebtEmoji,
    getDepositEmoji,
    emojiProfiles
} from './utils/emojiMap.js';
import {
    incomeCategories,
    expenseCategories,
    depositCategories,
    debtCategories
} from '../constants/index.js';

import { monthNames } from '../constants/constants.js';
import { refreshExportAnalytics } from './settings.js';
import { refreshUserProfile, normalizeEmoji, getFirstGraphemeCluster } from './profileAnalytics.js';
import { initBannerCarousel } from './widgets/bannerCarousel.js';
import { EditManager } from './EditManager.js';
import { ExcelImportManager } from './Excelimportmanager.js';
import { initAnalyticsInsights } from './Analyticsinsights.js';



/* ── Shared HTML escaping (XSS prevention) ──────────────────────────── */
function escapeHtml(value = '') {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

const categoryMap = {
    'income-category': incomeCategories,
    'expense-category': expenseCategories,
    'deposit-status': depositCategories,
    'debt-direction': debtCategories
};

function updateHeaderAvatar(userEmoji = '❔') {
    const btn = document.getElementById('open-profile-btn');
    if (!btn) return;

    const normalized = normalizeEmoji(userEmoji);
    const profile = emojiProfiles.find(p => normalizeEmoji(p.emoji) === normalized);

    if (!profile?.img) {
        btn.innerHTML = `<span style="font-size:24px;line-height:32px">${userEmoji}</span>`;
        return;
    }
    btn.innerHTML = `
    <img
      src="${profile.img}"
      alt="${userEmoji}"
      onerror="this.onerror=null;this.src='${profile.fallbackImg}'"
    >
  `;
}


export class UIManager {
    constructor(budgetManager) {
        this.budgetManager     = budgetManager;
        this.editManager = new EditManager(this.budgetManager, this);
        this.transactionFilter = 'all';

        const now = new Date();
        this.monthFilter       = String(now.getMonth() + 1).padStart(2, '0'); // дефолт — текущий месяц
        this.yearFilter        = now.getFullYear();
        this.activeYearForMonthFilter = this.yearFilter; // год, для которого выбран monthFilter
        this.minYear           = 2024;
        this.maxYear           = 2030;

        this.monthNames        = monthNames;
        this.formatNumber      = formatNumber;
        this.formatDate        = formatDate;
        this.getTypeName       = getTypeName;
        this.getTypeColor      = getTypeColor;

        this.excelImportManager = new ExcelImportManager(budgetManager, this);
    }

    initialize() {
        // this.budgetManager.loadFromStorage();

        if (typeof window.trackSafe === 'function') {
            trackSafe('ui-initialized', {
                tag: 'session',
                hasBudgets   : this.budgetManager.budgets.length > 0,
                budgetsCount : this.budgetManager.budgets.length,
            });
        }

        const userIdText = localStorage.getItem('budgetit-user-id');
        const userIdEl = document.getElementById('user-id');
        if (userIdText && userIdEl) {
            userIdEl.textContent = `ID: ${userIdText}`;
        }

        const userIdElement = document.getElementById('user-id');
        const userId = userIdElement?.textContent?.trim().replace('ID:', '').trim()
            || localStorage.getItem('budgetit-user-id');

        const emoji = getFirstGraphemeCluster(userId) || '❔';
        updateHeaderAvatar(emoji);

        const totalTx = this.budgetManager.getTotalTransactions?.() || 0; // пока не используется, но пусть будет

        document.getElementById('open-profile-btn')
            ?.addEventListener('click', () => this.openModal('settings-page'));

        if (!this.budgetManager.budgets.length) {
            location.replace('onboarding.html');
            return;
        }

        this.updateHeader();
        this.initializeHeaderMonthPicker(); // новый month-picker в хедере
        this.updateUI();
        this.attachEventListeners();
        this.excelImportManager.init();
        this.bindNumericFormats();
        this.bannerCleanup = initBannerCarousel('.banner-carousel .slides-container');
        refreshUserProfile(this.budgetManager);
        if (document.getElementById('analytics-page')) {  // Проверка, чтобы не ломалось без страницы
            initAnalyticsInsights(this.budgetManager);
        }
    }

    updateHeader() {
        const headerEl = document.getElementById('current-budget');
        const nameEl   = document.getElementById('current-budget-name') || headerEl;
        let budgetName = this.budgetManager.getCurrentBudget()?.name || 'BudgetIt';

        // Проверка на новогодний период (с 15 декабря по 20 января)
        const now = new Date();
        const month = now.getMonth() + 1;
        const day = now.getDate();
        const isNewYear = (month === 12 && day >= 15) || (month === 1 && day <= 20);

        if (isNewYear) {
            budgetName = `🎄 ${budgetName}`;
        }

        nameEl.textContent = budgetName;
        this.adjustHeaderTitleFont();
    }

    updateUI() {
        const activeYear = this.activeYearForMonthFilter || this.yearFilter;

        let totals;

        if (this.monthFilter === 'all') {
            totals = this.budgetManager.calculateTotals('all') || {
                overallBudget : 0,
                monthlyIncome : 0,
                monthlyExpense: 0,
                depositBalance: 0,
                totalDebt     : 0,
                carryOver     : 0
            };
        } else if (this.monthFilter === 'year') {
            totals = this.budgetManager.calculateTotals('all', activeYear) || {
                overallBudget : 0,
                monthlyIncome : 0,
                monthlyExpense: 0,
                depositBalance: 0,
                totalDebt     : 0,
                carryOver     : 0
            };
        } else {
            const yearFilter = activeYear || 'all';

            totals = this.budgetManager.calculateTotals(this.monthFilter, yearFilter) || {
                overallBudget : 0,
                monthlyIncome : 0,
                monthlyExpense: 0,
                depositBalance: 0,
                totalDebt     : 0,
                carryOver     : 0
            };
        }

        const isSingleMonth = this.monthFilter !== 'all';
        const carryOver = Number(totals.carryOver) || 0;

        // ⬇️ дальше оставляешь как есть — блоки summary, фильтрация, список и т.д.
        ['budget', 'income', 'expense', 'deposit', 'debt'].forEach(type => {
            const keyByType = {
                budget : 'overallBudget',
                income : 'monthlyIncome',
                expense: 'monthlyExpense',
                deposit: 'depositBalance',
                debt   : 'totalDebt'
            };

            let value = totals[keyByType[type]] ?? 0;

            // Для бюджета в конкретном месяце добавляем перенос с прошлого месяца
            if (type === 'budget' && isSingleMonth) {
                value += carryOver;
            }

            const el = document.querySelector(`#block-${type} .block-value`);
            this.animateValue(el, value, 800);

            const emojiFnByType = {
                budget : getBudgetEmoji,
                income : getIncomeEmoji,
                expense: getExpenseEmoji,
                deposit: getDepositEmoji,
                debt   : getDebtEmoji
            };

            const emojiEl = document.querySelector(`#block-${type} .emoji`);
            if (emojiEl) {
                emojiEl.textContent = emojiFnByType[type](value);
            }
        });

        // ⬇️ И тут уже твой существующий код: allTx, filtered, renderEmptyState / updateTransactionList и т.д.
        const allTx = this.budgetManager.getCurrentBudget().transactions || [];
        const mf = this.monthFilter;
        const fy = activeYear;
        const isAllMonth = mf === 'all';
        const isYearMode = mf === 'year';

        const filtered = allTx.filter(tx => {
            if (this.transactionFilter !== 'all' && tx.type !== this.transactionFilter)
                return false;

            const dateStr = tx.date || '';
            const txMonth = dateStr.slice(5, 7);
            const txYear  = parseInt(dateStr.slice(0, 4), 10) || null;

            if (isAllMonth) return true;
            if (isYearMode) return txYear === fy;
            if (!txYear) return false;

            if (tx.type !== 'deposit') {
                return txMonth === mf && txYear === fy;
            }

            // ... твоя логика по вкладам (как была)
            const group = this.getDepositGroup(tx);
            const root  = group[0] || tx;
            const isRoot = tx.id === root.id;
            const isLegacy = !this.isNewDepositRoot(root);

            if (isLegacy) {
                return txMonth === mf && txYear === fy;
            }

            const rootDateStr = root.date || '';
            const rootMonth   = parseInt(rootDateStr.slice(5, 7), 10);
            const rootYear    = parseInt(rootDateStr.slice(0, 4), 10);

            const filterMonth = parseInt(mf, 10);
            const filterYear  = fy;

            if (!rootMonth || !rootYear || isNaN(filterMonth) || isNaN(filterYear)) {
                return txMonth === mf && txYear === fy;
            }

            const term      = root.termMonths || 0;
            const maxMonths = term > 0 ? term : 12;

            const offsetMonths =
                (filterYear - rootYear) * 12 +
                (filterMonth - rootMonth);

            if (!isRoot) {
                return txMonth === mf && txYear === fy;
            }

            return offsetMonths >= 0 && offsetMonths < maxMonths;
        });

        if (filtered.length === 0) {
            this.renderEmptyState(this.transactionFilter === 'all' ? 'all' : this.transactionFilter);
            return;
        }

        this.updateTransactionList(filtered);
    }


    updateTransactionList(transactions) {
        const list   = document.getElementById('transaction-list');
        const header = document.getElementById('transactions-header');

        if (!list) return;

        list.innerHTML = '';

        if (header) {
            header.classList.toggle('hidden', !transactions || transactions.length === 0);
        }

        const mf = this.monthFilter;
        const isAllMonth = mf === 'all' || mf === 'year';

        transactions
            .sort((a, b) => {
                const dateDiff = new Date(b.date) - new Date(a.date);
                if (dateDiff !== 0) return dateDiff;
                return b.id - a.id;
            })
            .forEach(t => {
                const li = document.createElement('li');
                li.classList.add('tx-item');
                li.style.borderLeftColor = this.getTypeColor(t.type);

                let debtTag = '';
                if (t.type === 'debt') {
                    debtTag = t.direction === 'owe'
                        ? ' <span class="tx-debt-tag tx-debt-tag-owe">#Я должен</span>'
                        : ' <span class="tx-debt-tag tx-debt-tag-lent">#Мне должны</span>';
                }

                // 💎 бриллиант для корневого НОВОГО вклада
                let titleName = t.category || t.name || '';
                if (t.type === 'deposit') {
                    const group = this.getDepositGroup(t);
                    const root  = group[0] || t;
                    const isRoot = t.id === root.id;
                    const isLegacy = !this.isNewDepositRoot(root);

                    if (!isLegacy && isRoot) {
                        titleName = `💎 ${titleName || 'Вклад'}`;
                    }
                }

                // 🧿 Эмодзи категории слева + очищенный заголовок
                let emoji = '';
                let cleanTitle = titleName || this.getTypeName(t.type);

                const emojiMatch = (titleName || '').match(/^(\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Emoji}\ufe0f?)\s*(.*)$/u);
                if (emojiMatch) {
                    emoji = emojiMatch[1];
                    cleanTitle = emojiMatch[2] || cleanTitle;
                } else {
                    switch (t.type) {
                        case 'income':
                            emoji = '💸';
                            break;
                        case 'expense':
                            emoji = '🛒';
                            break;
                        case 'debt':
                            emoji = t.direction === 'owe' ? '📉' : '📈';
                            break;
                        case 'deposit':
                            emoji = '🏦';
                            break;
                        default:
                            emoji = '💠';
                    }
                }

                let amountSign = '';
                if (t.type === 'deposit') {
                    const status = t.status?.trim();
                    if (status === '➖ Снятие') {
                        amountSign = '-';
                    } else {
                        amountSign = '+';
                    }
                } else if (t.type === 'debt') {
                    amountSign = t.direction === 'owe' ? '-' : '+';
                } else if (t.type === 'expense') {
                    amountSign = '-';
                } else if (t.type === 'income') {
                    amountSign = '+';
                }

                let displayAmount;
                if (t.type === 'debt') {
                    displayAmount = (t.direction === 'owe' ? '-' : '+') +
                        this.formatNumber(t.remainingAmount || t.initialAmount);
                } else {
                    displayAmount = amountSign + this.formatNumber(t.amount);
                }

                // 📊 Для корневого НОВОГО вклада в месячном режиме — показываем СТАРТ месяца
                if (t.type === 'deposit') {
                    const group = this.getDepositGroup(t);
                    const root  = group[0] || t;
                    const isRoot = t.id === root.id;
                    const isLegacy = !this.isNewDepositRoot(root);

                    if (!isLegacy && isRoot && !isAllMonth && mf !== 'all') {
                        const rootDateStr = root.date || '';
                        const rootMonth   = parseInt(rootDateStr.slice(5, 7), 10);
                        const rootYear    = parseInt(rootDateStr.slice(0, 4), 10);
                        const filterMonth = parseInt(mf, 10);
                        const filterYear  = this.activeYearForMonthFilter || this.yearFilter;
                        const term        = root.termMonths || 0;
                        const maxMonths   = term > 0 ? term : 12;

                        if (
                            rootMonth && rootYear &&
                            !isNaN(filterMonth) && !isNaN(filterYear)
                        ) {
                            const offsetMonths =
                                (filterYear - rootYear) * 12 +
                                (filterMonth - rootMonth);

                            if (offsetMonths >= 0 && offsetMonths < maxMonths) {
                                const { rows } = this.buildDepositSchedule(root);
                                if (rows[offsetMonths]) {
                                    const base = rows[offsetMonths].startBalance;
                                    displayAmount = (amountSign || '+') + this.formatNumber(base);
                                }
                            }
                        }
                    }
                }

                const displayDate = this.formatDate(t.date);

                li.innerHTML = `
          <div class="tx-card-inner">
            <div class="tx-emoji">${emoji}</div>
            <div class="tx-main">
              <div class="tx-top-row">
                <span class="tx-amount ${amountSign === '-' ? 'tx-amount-minus' : 'tx-amount-plus'}">
                  ${displayAmount}
                </span>
                <span class="tx-date">${displayDate}</span>
              </div>
              <div class="tx-bottom-row">
                <div class="tx-title-wrap">
                  <span class="tx-title">${escapeHtml(cleanTitle)}</span>
                  ${debtTag || ''}
                </div>
                ${t.type === 'income' && t.name ? `<div class="tx-income-name">${escapeHtml(t.name)}</div>` : ''}
                ${t.type === 'debt' ? `
                  ${t.paid
                    ? '<div class="tx-debt-status">✅ Оплачен</div>'
                    : `<button class="tx-debt-pay pay-debt" data-id="${t.id}">Оплатить</button>`}
                ` : ''}
              </div>
            </div>
          </div>
        `;

                li.addEventListener('click', () => this.openTransactionDetail(t));

                list.appendChild(li);
            });

        list.querySelectorAll('.pay-debt').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const id = +btn.dataset.id;
                const tx = this.budgetManager.getCurrentBudget().transactions.find(t => t.id === id);
                if (!tx) return;
                const remaining = tx.remainingAmount || tx.initialAmount || tx.amount;
                this.openDebtPaymentModal(id, remaining);
            });
        });
    }

    renderEmptyState(type) {
        const list   = document.getElementById('transaction-list');
        const header = document.getElementById('transactions-header');

        if (!list) return;

        if (header) {
            header.classList.add('hidden');
        }
        const msgByType = {
            all    : 'У вас пока нет операций. <br />Добавьте первую транзакцию — и она появится в списке.',
            income : 'У вас пока ещё нет добавленных доходов. Добавьте доход — и он появится здесь. <br />Чтобы увидеть все операции, нажмите «Бюджет».',
            expense: 'У вас пока ещё нет добавленных расходов. Добавьте расход — и он появится здесь. <br />Чтобы увидеть все операции, нажмите «Бюджет».',
            deposit: 'Вклады пока пустуют. Пополните копилку — и мы отобразим операции тут. <br />Вернуться к полному списку можно нажатием на «Бюджет».',
            debt   : 'У вас нет добавленных долгов в этом месяце — и это отлично! <br />Чтобы увидеть все операции, нажмите «Бюджет».'
        };
        list.innerHTML = `
      <li style="
        list-style:none; padding:14px 12px; border-radius:12px;
        background:var(--main-ground); color:var(--secondary-color);
        border:1px dashed var(--border-color); text-align:center">
        <div style="font-size:32px; line-height:1; margin-bottom:6px">🦈</div>
        <div style="font-size:14px">${msgByType[type] || msgByType.all}</div>
      </li>
    `;
    }

    openModal(id) {
        const m = document.getElementById(id);
        if (!m) return;

        // Fullscreen pages (settings, analytics) — синхронизируем с навбаром
        if (id === 'settings-page' || id === 'analytics-page') {
            if (window._navOpenPage) window._navOpenPage(id);
            if (window._navSetActiveTab) {
                window._navSetActiveTab(id === 'settings-page' ? 'profile' : 'analytics');
            }
            if (id === 'analytics-page') {
                window.dispatchEvent(new CustomEvent('budgetit:analytics-open'));
            }
            return;
        }

        // Обычные bottom-sheets
        if (m.classList.contains('bottom-sheet')) {
            const bd = document.getElementById('bottom-sheet-backdrop');
            if (bd) bd.classList.remove('hidden');
        }
        m.classList.remove('hidden');
    }

    closeModal(id) {
        const m = document.getElementById(id);
        if (!m) return;

        // Fullscreen pages — синхронизируем с навбаром
        if (id === 'settings-page' || id === 'analytics-page') {
            if (window._navClosePage) window._navClosePage(id);
            if (window._navSetActiveTab) window._navSetActiveTab('home');
            return;
        }

        // Обычные bottom-sheets
        m.classList.add('hidden');

        // Backdrop прячем если больше нет открытых шитов
        const anyOpen = document.querySelector(
            '.bottom-sheet:not(.hidden):not(#settings-page):not(#analytics-page)'
        );
        if (!anyOpen) {
            const bd = document.getElementById('bottom-sheet-backdrop');
            if (bd) bd.classList.add('hidden');
        }
    }

    showInlineError(el, message) {
        this.clearInlineError(el);
        if (el.classList.contains('category-select-button')) {
            el.classList.add('error');
        } else {
            el.style.borderColor = 'red';
        }
        const errorDiv = document.createElement('div');
        errorDiv.className = 'inline-error-message';
        errorDiv.textContent = message;
        el.insertAdjacentElement('afterend', errorDiv);
    }

    clearInlineError(el) {
        if (!el) return;
        if (el.classList.contains('category-select-button')) {
            el.classList.remove('error');
        } else {
            el.style.borderColor = '';
        }
        const next = el.nextElementSibling;
        if (next && next.classList.contains('inline-error-message')) {
            next.remove();
        }
    }

    animateValue(el, end, duration) {
        if (!el) return;
        const start = parseInt(el.textContent.replace(/\D/g, '')) || 0;
        let timestampStart = null;
        const step = now => {
            if (!timestampStart) timestampStart = now;
            const progress = Math.min((now - timestampStart) / duration, 1);
            el.textContent = formatNumber(Math.floor(progress * (end - start) + start));
            if (progress < 1) window.requestAnimationFrame(step);
        };
        window.requestAnimationFrame(step);
    }

    setDefaultMonthFilter() {
        const today = new Date();
        const currentMonth = String(today.getMonth() + 1).padStart(2, '0');
        const input = document.getElementById('month-filter-input');
        if (input) {
            input.value = this.monthNames[currentMonth] || 'Неизвестно';
            input.setAttribute('data-value', currentMonth);
        }
    }

    checkIfSameMonth(dateStr, filterValue) {
        if (!dateStr || filterValue === 'all') return false;
        return new Date(dateStr).toISOString().slice(5, 7) === filterValue;
    }

    openTransactionDetail(transaction) {
        if (!transaction || !transaction.type) {
            console.error('Транзакция пуста или не содержит тип:', transaction);
            return;
        }

        const detailType    = document.getElementById('detail-type');
        const detailName    = document.getElementById('detail-name');
        const detailAmount  = document.getElementById('detail-amount');
        const detailDate    = document.getElementById('detail-date');
        const detailStatus  = document.getElementById('detail-status');
        const prodDiv       = document.getElementById('detail-products');

        const payDebtBtn    = document.getElementById('pay-debt-detail');
        const paidLabel     = document.getElementById('debt-paid-label');
        const debtProgress  = document.getElementById('detail-debt-progress');
        const debtRemaining = document.getElementById('detail-debt-remaining');
        const debtPayments  = document.getElementById('detail-debt-payments');
        const payAgainBtn   = document.getElementById('detail-pay-again'); // может не быть — ок

        // Вклады
        const depositMeta     = document.getElementById('detail-deposit-meta');
        const depositTable    = document.getElementById('detail-deposit-table');
        const depositTopup    = document.getElementById('deposit-topup-btn');
        const depositWithdraw = document.getElementById('deposit-withdraw-btn');

        if (!detailType || !detailName || !detailAmount || !detailDate || !detailStatus) {
            console.error('Один или несколько элементов деталей транзакции не найдены');
            return;
        }

        // 🧹 Сброс вкладов
        if (depositMeta) {
            depositMeta.classList.add('hidden');
            depositMeta.innerHTML = '';
        }
        if (depositTable) {
            depositTable.classList.add('hidden');
            depositTable.innerHTML = '';
        }
        if (depositTopup)    depositTopup.classList.add('hidden');
        if (depositWithdraw) depositWithdraw.classList.add('hidden');

        // 🧹 Сброс долгов
        if (debtProgress)  { debtProgress.classList.add('hidden');  debtProgress.innerHTML = ''; }
        if (debtRemaining) { debtRemaining.classList.add('hidden'); debtRemaining.textContent = ''; }
        if (debtPayments)  { debtPayments.classList.add('hidden');  debtPayments.innerHTML = ''; }
        if (payAgainBtn)   payAgainBtn.classList.add('hidden');

        detailType.textContent = this.getTypeName(transaction.type) || 'Неизвестный тип';

        // 🧿 Эмодзи + заголовок (как в списке транзакций)
        let titleName = transaction.category || transaction.name || '';

        // 💎 Для корневого НОВОГО вклада используем бриллиант, как в списке
        if (transaction.type === 'deposit') {
            const group    = this.getDepositGroup(transaction);
            const root     = group[0] || transaction;
            const isRoot   = transaction.id === root.id;
            const isLegacy = !this.isNewDepositRoot(root);

            if (!isLegacy && isRoot) {
                titleName = `💎 ${titleName || 'Вклад'}`;
            }
        }

        let emoji = '';
        let cleanTitle = '';

        if (transaction.type === 'debt') {
            // Для долгов сохраняем «Я должен / Мне должны» в тексте,
            // а эмодзи берём такие же, как в списке (#Я должен / #Мне должны)
            const baseTitle = transaction.name || transaction.category || 'Без названия';
            cleanTitle = `${transaction.direction === 'owe' ? 'Я должен' : 'Мне должны'} — ${baseTitle}`;
            emoji = transaction.direction === 'owe' ? '📉' : '📈';
        } else {
            cleanTitle = titleName || this.getTypeName(transaction.type);

            // Если в названии уже есть эмоджи — отделяем его
            const emojiMatch = (titleName || '').match(
                /^(\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Emoji}\ufe0f?)\s*(.*)$/u
            );

            if (emojiMatch) {
                emoji = emojiMatch[1];
                cleanTitle = emojiMatch[2] || cleanTitle;
            } else {
                // Фолбэки по типу, как в списке транзакций
                switch (transaction.type) {
                    case 'income':
                        emoji = '💸';
                        break;
                    case 'expense':
                        emoji = '🛒';
                        break;
                    case 'debt':
                        emoji = transaction.direction === 'owe' ? '📉' : '📈';
                        break;
                    case 'deposit':
                        emoji = '🏦';
                        break;
                    default:
                        emoji = '💠';
                }
            }
        }

        detailName.innerHTML = `
          <span class="tx-detail-emoji">${emoji}</span>
          <span class="tx-detail-title">${escapeHtml(cleanTitle)}</span>
        `;

        // Название из импорта — отдельная строка между заголовком и суммой
        const existingNameRow = document.getElementById('detail-income-name');
        if (transaction.type === 'income' && transaction.name) {
            if (existingNameRow) {
                existingNameRow.textContent = transaction.name;
                existingNameRow.classList.remove('hidden');
            } else {
                const nameRow = document.createElement('div');
                nameRow.id = 'detail-income-name';
                nameRow.className = 'tx-detail-income-name';
                nameRow.textContent = transaction.name;
                document.getElementById('detail-amount')?.insertAdjacentElement('beforebegin', nameRow);
            }
        } else if (existingNameRow) {
            existingNameRow.classList.add('hidden');
        }


        // ====== ДОЛГИ ======
        if (transaction.type === 'debt') {
            const paidSum = (transaction.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
            const total   = transaction.initialAmount || transaction.amount || 0;
            const percent = total > 0 ? Math.round((paidSum / total) * 100) : 0;
            const remaining = Math.max(0, total - paidSum);

            detailAmount.textContent = `Оплачено: ${this.formatNumber(paidSum)} / ${this.formatNumber(total)} (${percent}%)`;

            if (debtProgress) {
                debtProgress.classList.remove('hidden');
                debtProgress.innerHTML = `
          <div style="background:#eee;border-radius:8px;overflow:hidden;height:12px;margin-top:8px">
            <div style="width:${percent}%;height:100%;background:#2be82a"></div>
          </div>
        `;
            }

            if (debtRemaining) {
                debtRemaining.classList.remove('hidden');
                debtRemaining.textContent = `Осталось: ${this.formatNumber(remaining)}`;
            }

            if (debtPayments) {
                debtPayments.classList.remove('hidden');
                debtPayments.innerHTML =
                    `<strong>Платежи:</strong><br>` +
                    (transaction.payments || [])
                        .map(p => `• ${this.formatDate(p.date)} — ${this.formatNumber(p.amount)}`)
                        .join('<br>');
            }

            if (payAgainBtn && !transaction.paid) {
                payAgainBtn.classList.remove('hidden');
                payAgainBtn.onclick = () => {
                    this.closeModal('transaction-detail-sheet');
                    const r = transaction.remainingAmount || transaction.initialAmount || transaction.amount;
                    this.openDebtPaymentModal(transaction.id, r);
                };
            }
        } else {
            detailAmount.textContent = `Сумма: ${this.formatNumber(transaction.amount || 0)}`;
        }

        detailDate.textContent = `Дата: ${this.formatDate(transaction.date || new Date())}`;

        // ====== ВКЛАДЫ ======
        if (transaction.type === 'deposit') {
            const group = this.getDepositGroup(transaction);
            const root  = group[0] || transaction;
            const isLegacy = !this.isNewDepositRoot(root);

            if (isLegacy) {
                // Старый вклад — ведём себя как обычная транзакция (без графиков и кнопок)
                if (transaction.status) {
                    detailStatus.classList.remove('hidden');
                    detailStatus.textContent = `Статус: ${transaction.status}`;
                } else {
                    detailStatus.classList.add('hidden');
                }
            } else if (depositMeta && depositTable) {
                detailStatus.classList.add('hidden');

                const { rows, meta } = this.buildDepositSchedule(root);

                depositMeta.classList.remove('hidden');
                depositMeta.innerHTML = `
          <div><strong>Вклад:</strong> ${escapeHtml(root.name || 'Без названия')}</div>
          <div><strong>Годовой процент:</strong> ${meta.annualRate.toFixed(2)}%</div>
          <div><strong>Срок:</strong> ${meta.termMonths ? meta.termMonths + ' мес.' : 'Б/С'}</div>
          <div><strong>Стартовая сумма:</strong> ${this.formatNumber(meta.initialAmount)}</div>
          <div><strong>Общее накопление:</strong> ${this.formatNumber(meta.totalInterest)}</div>
          <div><strong>Ожидаемый итог:</strong> ${this.formatNumber(meta.currentBalance)}</div>
        `;

                depositTable.classList.remove('hidden');
                depositTable.innerHTML = rows.length
                    ? `
            <table class="deposit-schedule-table">
              <thead>
                <tr>
                  <th>Месяц</th>
                  <th>Старт</th>
                  <th>➕</th>
                  <th>➖</th>
                  <th>% за мес.</th>
                  <th>Итог</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(r => `
                  <tr>
                    <td>${r.label}</td>
                    <td>${this.formatNumber(r.startBalance)}</td>
                    <td>${r.topups ? this.formatNumber(r.topups) : '—'}</td>
                    <td>${r.withdrawals ? this.formatNumber(r.withdrawals) : '—'}</td>
                    <td>${r.interest ? this.formatNumber(r.interest) : '—'}</td>
                    <td>${this.formatNumber(r.endBalance)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `
                    : '<div style="margin-top:6px;font-size:0.9rem;color:#777;">Нет данных по месяцам</div>';

                if (depositTopup && depositWithdraw) {
                    depositTopup.classList.remove('hidden');
                    depositWithdraw.classList.remove('hidden');

                    depositTopup.onclick = () => this.handleDepositOperation(root, 'topup');
                    depositWithdraw.onclick = () => this.handleDepositOperation(root, 'withdraw');
                }
            }
        } else {
            if (transaction.status) {
                detailStatus.classList.remove('hidden');
                detailStatus.textContent = `Статус: ${transaction.status}`;
            } else {
                detailStatus.classList.add('hidden');
            }
        }

        // ====== ТОВАРЫ ======
        if (transaction.type === 'expense' && transaction.products?.length) {
            prodDiv.classList.remove('hidden');
            prodDiv.innerHTML = `
        <strong>Товары:</strong>
        <div class="detail-products-list">
          ${transaction.products.map(p => `
            <div class="detail-product-row">
              <span class="product-title">${escapeHtml(p.name)}</span>
              <span class="product-meta">${p.quantity} × ${this.formatNumber(p.price)}</span>
            </div>
          `).join('')}
        </div>
      `;
        } else {
            prodDiv.classList.add('hidden');
        }

        // ====== Кнопки по долгам ======
        if (transaction.type === 'debt') {
            if (transaction.paid) {
                paidLabel?.classList.remove('hidden');
                payDebtBtn?.classList.add('hidden');
            } else {
                paidLabel?.classList.add('hidden');
                payDebtBtn?.classList.remove('hidden');
                payDebtBtn.onclick = () => {
                    this.closeModal('transaction-detail-sheet');
                    const r = transaction.remainingAmount || transaction.initialAmount || transaction.amount;
                    this.openDebtPaymentModal(transaction.id, r);
                };
            }
        } else {
            payDebtBtn?.classList.add('hidden');
            paidLabel?.classList.add('hidden');
        }

        document.getElementById('edit-transaction').onclick = () => {
            this.closeModal('transaction-detail-sheet');
            this.editManager.open(transaction);
        };


        // ====== Удаление транзакции ======
        document.getElementById('delete-transaction').onclick = () => {
            this.closeModal('transaction-detail-sheet');
            const modal = document.getElementById('delete-transaction-modal');
            if (!modal) return;

            modal.classList.remove('hidden');
            document.getElementById('bottom-sheet-backdrop')?.classList.remove('hidden');

            const confirmBtn = document.getElementById('confirm-delete-transaction');
            const cancelBtn  = document.getElementById('cancel-delete-transaction');

            confirmBtn.onclick = cancelBtn.onclick = null;

            confirmBtn.onclick = () => {
                // 🟢 Простая логика удаления вкладов:
                if (transaction.type === 'deposit') {
                    const group = this.getDepositGroup(transaction);
                    const root  = group[0] || transaction;
                    const isRoot = transaction.id === root.id;

                    if (isRoot) {
                        // 💎 Удаляем ВСЕ связанные транзакции по этому вкладу
                        const budget = this.budgetManager.getCurrentBudget();
                        if (budget?.transactions) {
                            const depositId = root.depositId || root.id;
                            budget.transactions = budget.transactions.filter(
                                t => !(t.type === 'deposit' && (t.depositId || t.id) === depositId)
                            );
                            this.budgetManager.saveToStorage();
                        }

                        trackSafe?.('delete-full-deposit', {
                            tag      : 'transaction',
                            depositId: root.depositId || root.id,
                            name     : root.name,
                            totalTx  : group.length
                        });

                        modal.classList.add('hidden');
                        document.getElementById('bottom-sheet-backdrop')?.classList.add('hidden');
                        this.updateUI();
                        refreshExportAnalytics(this.budgetManager);
                        refreshUserProfile(this.budgetManager);
                        return;
                    }
                }

                // стандартное удаление для других типов
                if (typeof window.trackSafe === 'function') {
                    trackSafe('delete-transaction', {
                        id    : transaction.id,
                        type  : transaction.type,
                        amount: transaction.amount || transaction.initialAmount || 0
                    });
                }

                this.budgetManager.deleteTransaction(transaction.id);
                modal.classList.add('hidden');
                document.getElementById('bottom-sheet-backdrop')?.classList.add('hidden');
                this.updateUI();
                refreshExportAnalytics(this.budgetManager);
                refreshUserProfile(this.budgetManager);
            };

            cancelBtn.onclick = () => {
                modal.classList.add('hidden');
                document.getElementById('bottom-sheet-backdrop')?.classList.add('hidden');
            };
        };

        const editBtn = document.getElementById('edit-transaction');

        if (transaction.type === 'income' || transaction.type === 'expense') {
            editBtn.classList.remove('hidden');
            editBtn.onclick = () => {
                this.closeModal('transaction-detail-sheet');
                this.editManager?.open(transaction);
            };
        } else {
            editBtn.classList.add('hidden');
            editBtn.onclick = null;
        }

        const sheet = document.getElementById('transaction-detail-sheet');
        sheet.classList.remove('hidden');

        this.openModal('transaction-detail-sheet');
    }

    populateBudgetList() {
        const listDiv = document.querySelector('#budget-switch-sheet .budget-list');
        if (!listDiv) return;

        listDiv.innerHTML = '';

        const currentIndex = this.budgetManager.currentBudgetIndex ?? 0;

        this.budgetManager.budgets.forEach((b, index) => {
            const div = document.createElement('div');
            div.classList.add('budget-item');
            if (index === currentIndex) {
                div.classList.add('budget-item-active');
            }

            const emoji = getFirstGraphemeCluster(b.name) || '🦈';

            div.innerHTML = `
        <div class="budget-item-main">
          <div class="budget-emoji">${emoji}</div>
          <div class="budget-info">
            <div class="budget-name">${escapeHtml(b.name)}</div>
            <div class="budget-meta">
              ${index === currentIndex ? 'Текущий бюджет' : `Бюджет #${index + 1}`}
            </div>
          </div>
        </div>
        <button class="delete-budget-btn" data-index="${index}" title="Удалить бюджет">
          🗑
        </button>
      `;

            div.addEventListener('click', () => {
                if (typeof window.trackSafe === 'function') {
                    trackSafe('switch-budget', {
                        index,
                        name: b.name
                    });
                }

                this.budgetManager.switchBudget(index);
                this.updateHeader();
                this.updateUI();
                refreshExportAnalytics(this.budgetManager);
                refreshUserProfile(this.budgetManager);
                this.closeModal('budget-switch-sheet');
            });

            listDiv.appendChild(div);
        });

        document.querySelectorAll('.delete-budget-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const index = +btn.dataset.index;
                this.openDeleteConfirmation(index);
            });
        });
    }

    openDeleteConfirmation(index) {
        const modal = document.getElementById('delete-budget-modal');
        if (!modal) return;
        this.closeModal('budget-switch-sheet');
        modal.classList.remove('hidden');
        document.getElementById('bottom-sheet-backdrop').classList.remove('hidden');

        document.getElementById('confirm-delete-budget').onclick = () => {
            const name = this.budgetManager.budgets[index]?.name || 'Unnamed';
            trackSafe?.('delete-budget', { tag: 'transaction', index, name });

            this.budgetManager.deleteBudget(index);
            modal.classList.add('hidden');
            document.getElementById('bottom-sheet-backdrop').classList.add('hidden');

            if (this.budgetManager.budgets.length === 0) {
                document.getElementById('transaction-list').innerHTML = '';
                document.querySelectorAll('.summary-block .block-value')
                    .forEach(el => el.textContent = '0');
                (document.getElementById('current-budget-name') || document.getElementById('current-budget')).textContent = 'BudgetIt';
                window.location.href = 'onboarding.html';
            } else {
                this.updateHeader();
                this.updateUI();
                this.populateBudgetList();
            }
        };

        document.getElementById('cancel-delete-budget').onclick = () => {
            modal.classList.add('hidden');
            document.getElementById('bottom-sheet-backdrop').classList.add('hidden');
        };

        document.getElementById('export-before-delete').onclick = () => {
            trackSafe?.('export-before-delete', { name: this.budgetManager.budgets[index]?.name });
            this.exportData();
        };
    }

    exportData() {
        const dataStr = JSON.stringify(this.budgetManager.budgets);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'budgets.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    importData(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                this.budgetManager.budgets = JSON.parse(reader.result);
                this.budgetManager.currentBudgetIndex = 0;
                this.budgetManager.saveToStorage();
                this.updateHeader();
                this.updateUI();
                alert('Данные успешно импортированы!');
            } catch (err) {
                alert('Ошибка при чтении файла!');
            }
        };
        reader.readAsText(file);
    }

    updateProductDatalist() {
        const dataList = document.getElementById('product-names-list');
        dataList.innerHTML = '';
        this.budgetManager.productNames.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            dataList.appendChild(option);
        });
    }

    bindNumericFormats() {
        document.querySelectorAll('input.numeric-format').forEach(input => {
            input.addEventListener('input', () => {
                const rawValue = input.value;
                const cursorPos = input.selectionStart;
                const cleaned = rawValue.replace(/[^0-9.,]/g, '').replace(',', '.');
                const parsed = parseFloat(cleaned) || 0;
                const isQuantity = input.classList.contains('product-quantity');
                const formatted = isQuantity ? cleaned : formatNumber(parsed);
                const offset = formatted.length - rawValue.length;
                input.value = formatted;
                const newPos = cursorPos + offset;
                input.setSelectionRange(newPos, newPos);
            });
            input.addEventListener('blur', () => {
                const isQuantity = input.classList.contains('product-quantity');
                if (isQuantity) return;
                const parsed = parseFloat(input.value.replace(/[^0-9.]/g, '')) || 0;
                input.value = formatNumber(parsed);
            });
        });
    }

    attachEventListeners() {
        document.getElementById('budget-form')?.addEventListener('submit', e => {
            e.preventDefault();
            const nameInput = e.target['budget-name'];
            this.clearInlineError(nameInput);
            const name = nameInput.value.trim();
            if (this.budgetManager.createBudget(name)) {
                this.updateHeader();
                this.updateUI();
                this.closeModal('budget-modal');
                this.bindNumericFormats();
                nameInput.value = '';
            } else {
                this.showInlineError(nameInput, 'Некорректное название бюджета!');
            }
        });

        document.getElementById('current-budget')?.addEventListener('click', () => {
            this.populateBudgetList();
            this.openModal('budget-switch-sheet');
        });

        document.getElementById('close-budget-sheet')
            ?.addEventListener('click', () => this.closeModal('budget-switch-sheet'));

        document.getElementById('add-budget-btn')?.addEventListener('click', () => {
            const newNameInput = document.getElementById('new-budget-name');
            this.clearInlineError(newNameInput);
            const newName = newNameInput.value.trim();
            if (this.budgetManager.createBudget(newName)) {
                if (typeof window.trackSafe === 'function') {
                    trackSafe('create-budget', { name: newName });
                }
                this.populateBudgetList();
                newNameInput.value = '';
            } else {
                this.showInlineError(newNameInput, 'Некорректное название бюджета!');
            }
        });

        ['budget', 'income', 'expense', 'deposit', 'debt'].forEach(type => {
            document.getElementById(`block-${type}`)?.addEventListener('click', () => {
                this.transactionFilter = type === 'budget' ? 'all' : type;
                if (typeof window.trackSafe === 'function') {
                    trackSafe('filter-type', { type: this.transactionFilter });
                }
                this.updateUI();
            });
        });

        document.getElementById('add-btn')?.addEventListener('click', () => {
            const today = new Date().toLocaleDateString('en-CA');
            ['income-date', 'expense-date', 'debt-date', 'deposit-date'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = today;
            });
            this.hideAllForms();
            this.openForm('income-form');
            document.querySelectorAll('.transaction-type-chips .chip-btn')
                .forEach(btn => btn.classList.remove('active'));
            document.querySelector('.transaction-type-chips .chip-btn[data-type="income"]')
                ?.classList.add('active');
            this.openModal('transaction-sheet');
        });

        document.querySelectorAll('.transaction-type-chips .chip-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.transaction-type-chips .chip-btn')
                    .forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.hideAllForms();
                this.openForm(`${btn.getAttribute('data-type')}-form`);
            });
        });

        document.querySelectorAll('.close-form').forEach(btn => {
            btn.addEventListener('click', () => this.closeModal('transaction-sheet'));
        });

        document.getElementById('income-form')?.addEventListener('submit', e => this.submitIncome(e));
        document.getElementById('expense-form')?.addEventListener('submit', e => this.submitExpense(e));
        document.getElementById('debt-form')?.addEventListener('submit', e => this.submitDebt(e));
        document.getElementById('deposit-form')?.addEventListener('submit', e => this.submitDeposit(e));

        document.getElementById('add-product')?.addEventListener('click', () => this.addProduct());

        document.getElementById('close-settings')
            ?.addEventListener('click', () => this.closeModal('settings-page'));

        document.getElementById('close-detail')
            ?.addEventListener('click', () => this.closeModal('transaction-detail-sheet'));

        // Чипсы срока вклада
        const termChips = document.querySelectorAll('#deposit-term-chips .term-chip');
        if (termChips.length) {
            termChips.forEach(chip => {
                chip.addEventListener('click', () => {
                    termChips.forEach(c => c.classList.remove('active'));
                    chip.classList.add('active');
                    const hiddenTerm = document.getElementById('deposit-term');
                    if (hiddenTerm) {
                        hiddenTerm.value = chip.dataset.term || '0';
                    }
                });
            });
        }

        let deferredPrompt;
        window.addEventListener('beforeinstallprompt', e => {
            e.preventDefault();
            deferredPrompt = e;
            const installBtn = document.getElementById('install-btn');
            if (installBtn) installBtn.style.display = 'block';
            else console.warn('Кнопка установки (#install-btn) не найдена в DOM');
        });

        document.getElementById('install-btn')?.addEventListener('click', () => {
            if (deferredPrompt) {
                trackSafe?.('pwa-install-clicked');

                deferredPrompt.prompt();
                deferredPrompt.userChoice.then(() => {
                    trackSafe?.('pwa-installed');

                    deferredPrompt = null;
                    document.getElementById('install-btn').style.display = 'none';
                });
            } else console.warn('deferredPrompt не инициализирован');
        });

        document.getElementById('bottom-sheet-backdrop')?.addEventListener('click', e => {
            const backdrop = e.currentTarget;

            // ── Month-picker особый случай: он использует .show класс, не :not(.hidden) ──
            const monthPicker = document.getElementById('month-picker-sheet');
            if (monthPicker && monthPicker.classList.contains('show')) {
                monthPicker.classList.remove('show');
                monthPicker.classList.add('hidden');
                // Проверяем есть ли ещё открытые шиты (кроме month-picker)
                const stillOpen = document.querySelector(
                    '.bottom-sheet.show:not(#month-picker-sheet), ' +
                    '.bottom-sheet:not(.hidden):not(#settings-page):not(#analytics-page):not(#month-picker-sheet)'
                );
                if (!stillOpen) backdrop.classList.add('hidden');
                return;
            }

            // ── Обычные bottom-sheets — закрываем верхний по z-index ──
            const openSheets = Array.from(document.querySelectorAll(
                '.bottom-sheet:not(.hidden):not(#settings-page):not(#analytics-page)'
            )).filter(el => {
                // Исключаем скрытые через CSS (display:none или нулевой opacity)
                const style = getComputedStyle(el);
                return style.display !== 'none' && parseFloat(style.opacity) > 0;
            });

            if (openSheets.length === 0) {
                backdrop.classList.add('hidden');
                return;
            }

            openSheets.sort((a, b) => {
                const za = parseInt(a.style.zIndex) || parseInt(getComputedStyle(a).zIndex) || 0;
                const zb = parseInt(b.style.zIndex) || parseInt(getComputedStyle(b).zIndex) || 0;
                return zb - za;
            });

            const top = openSheets[0];
            top.classList.add('hidden');
            top.style.zIndex = '';

            const remaining = document.querySelectorAll(
                '.bottom-sheet:not(.hidden):not(#settings-page):not(#analytics-page)'
            );
            if (!remaining.length) backdrop.classList.add('hidden');
        });

        window.addEventListener('resize', () => this.adjustHeaderTitleFont());

        this.initializeCategoryButtons();

        // Плавный скролл полей форм создания над клавиатурой
        this.setupTransactionFormFocusScroll();
    }

    // Поднимаем поля форм создания транзакций над клавиатурой (как в EditManager)
    setupTransactionFormFocusScroll() {
        if (!this.editManager || typeof this.editManager.attachFocusScroll !== 'function') return;

        const ids = [
            'income-date', 'income-amount',
            'expense-date',
            'debt-date', 'debt-amount',
            'deposit-date', 'deposit-amount'
        ];

        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) this.editManager.attachFocusScroll(el);
        });

        // Начальный набор строк товаров
        document.querySelectorAll('#products-list input').forEach(el => {
            this.editManager.attachFocusScroll(el);
        });

        // Кнопки выбора категории (кастомный селект)
        document.querySelectorAll('.category-select-button').forEach(btn => {
            this.editManager.attachFocusScroll(btn);
        });
    }


    submitIncome(e) {
        e.preventDefault();
        const form = e.target;
        const hiddenCategoryInput = form.querySelector('input[name="income-category"]');
        const categoryButton = form.querySelector('.category-select-button');
        const amountInput = form['income-amount'];
        this.clearInlineError(categoryButton);
        this.clearInlineError(amountInput);

        if (!hiddenCategoryInput.value) {
            this.showInlineError(categoryButton, 'Без категории — как без души 😢');
            return;
        }
        const amount = parseInt(amountInput.value.replace(/\D/g, ''), 10) || 0;
        if (amount <= 0) {
            this.showInlineError(amountInput, 'Введите корректную сумму');
            return;
        }
        const transaction = {
            id      : Date.now(),
            type    : 'income',
            date    : form['income-date'].value,
            category: hiddenCategoryInput.value,
            amount
        };
        this.budgetManager.addTransaction(transaction);
        trackSafe('create-income', {
            tag     : 'transaction',
            category: hiddenCategoryInput.value,
            amount,
            date    : form['income-date'].value
        });

        form.reset();
        this.closeModal('transaction-sheet');
        this.updateUI();
        refreshExportAnalytics(this.budgetManager);
        refreshUserProfile(this.budgetManager, true);
    }

    submitExpense(e) {
        e.preventDefault();
        const form = e.target;
        const hiddenCategoryInput = form.querySelector('input[name="expense-category"]');
        const categoryButton = form.querySelector('.category-select-button');
        this.clearInlineError(categoryButton);
        if (!hiddenCategoryInput.value) {
            this.showInlineError(categoryButton, 'Без категории — как без души 😢');
            return;
        }
        const products = [];
        let isValid = true;
        document.querySelectorAll('#products-list .product-item').forEach(item => {
            const nameInput = item.querySelector('.product-name');
            const quantityInput = item.querySelector('.product-quantity');
            const priceInput = item.querySelector('.product-price');
            this.clearInlineError(nameInput);
            this.clearInlineError(quantityInput);
            this.clearInlineError(priceInput);
            const name = nameInput.value.trim();
            const quantity = parseFloat(quantityInput.value.replace(',', '.')) || 0;
            const price = parseFloat(priceInput.value.replace(/[^0-9.]/g, '')) || 0;
            if (!name) {
                this.showInlineError(nameInput, 'Введите название товара');
                isValid = false;
            }
            if (quantity <= 0) {
                this.showInlineError(quantityInput, 'Укажите корректное количество');
                isValid = false;
            }
            if (price <= 0) {
                this.showInlineError(priceInput, 'Укажите корректную цену');
                isValid = false;
            }
            if (name && quantity > 0 && price > 0) {
                products.push({ name, quantity, price });
                if (!this.budgetManager.productNames.includes(name)) {
                    this.budgetManager.productNames.push(name);
                }
            }
        });
        if (!isValid || products.length === 0) return;
        const totalAmount = products.reduce((sum, p) => sum + p.quantity * p.price, 0);
        const transaction = {
            id      : Date.now(),
            type    : 'expense',
            date    : form['expense-date'].value,
            category: hiddenCategoryInput.value,
            amount  : totalAmount,
            products
        };
        this.budgetManager.addTransaction(transaction);
        this.updateProductDatalist();
        trackSafe('create-expense', {
            category: hiddenCategoryInput.value,
            amount  : totalAmount,
            products_count: products.length
        });
        form.reset();
        document.getElementById('products-list').innerHTML = `
      <div class="product-item">
        <input type="text" class="product-name" placeholder="Название" maxlength="25" list="product-names-list">
        <input type="tel" class="product-quantity numeric-format" placeholder="Кол-во" required maxlength="5">
        <input type="tel" class="product-price numeric-format" placeholder="Цена" required maxlength="12" inputmode="numeric">
      </div>
    `;
        this.bindNumericFormats();
        this.closeModal('transaction-sheet');
        this.updateUI();
        refreshExportAnalytics(this.budgetManager);
        refreshUserProfile(this.budgetManager, true);
    }

    submitDebt(e) {
        e.preventDefault();
        const dateInput = document.getElementById('debt-date');
        const nameInput = document.getElementById('debt-name');
        const amountInput = document.getElementById('debt-amount');
        const directionSelect = document.getElementById('debt-direction');
        this.clearInlineError(dateInput);
        this.clearInlineError(nameInput);
        this.clearInlineError(amountInput);
        this.clearInlineError(directionSelect);
        const amount = parseInt(amountInput.value.replace(/\D/g, ''), 10) || 0;
        if (!dateInput.value) {
            this.showInlineError(dateInput, 'Укажите дату');
            return;
        }
        if (!nameInput.value.trim()) {
            this.showInlineError(nameInput, 'Введите имя');
            return;
        }
        if (amount <= 0) {
            this.showInlineError(amountInput, 'Введите корректную сумму');
            return;
        }
        if (!directionSelect.value) {
            this.showInlineError(directionSelect, 'Выберите тип долга');
            return;
        }
        const transaction = {
            id             : Date.now(),
            type           : 'debt',
            date           : dateInput.value,
            name           : nameInput.value.trim(),
            initialAmount  : amount,
            remainingAmount: amount,
            paid           : false,
            direction      : directionSelect.value,
            payments       : []
        };
        this.budgetManager.addTransaction(transaction);
        dateInput.value = '';
        nameInput.value = '';
        amountInput.value = '';
        directionSelect.value = '';
        trackSafe('create-debt', {
            name     : transaction.name,
            amount,
            direction: transaction.direction,
            date     : transaction.date
        });
        this.closeModal('transaction-sheet');
        this.updateUI();
        refreshExportAnalytics(this.budgetManager);
        refreshUserProfile(this.budgetManager, true);
    }

    // ---------- ХЕЛПЕРЫ ДЛЯ ВКЛАДОВ (НОВЫЕ/СТАРЫЕ) ----------

    getDepositRoots() {
        const budget = this.budgetManager.getCurrentBudget();
        if (!budget?.transactions) return [];
        const deposits = budget.transactions.filter(t => t.type === 'deposit');
        const map = new Map();

        deposits.forEach(tx => {
            const key = tx.depositId || tx.id;
            const existing = map.get(key);
            if (!existing) {
                map.set(key, tx);
                return;
            }
            const existingDate = new Date(existing.date || 0);
            const txDate = new Date(tx.date || 0);
            if (
                txDate < existingDate ||
                (txDate.getTime() === existingDate.getTime() && tx.id < existing.id)
            ) {
                map.set(key, tx);
            }
        });

        return Array.from(map.values());
    }

    isNewDepositRoot(tx) {
        if (!tx || tx.type !== 'deposit') return false;
        if (!tx.depositId) return false;
        if (typeof tx.annualRate !== 'number' || !(tx.annualRate > 0)) return false;
        if (typeof tx.status !== 'string') return false;
        return tx.status.includes('Вклад'); // '📥 Вклад'
    }

    hasLegacyDeposits() {
        const roots = this.getDepositRoots();
        return roots.some(root => !this.isNewDepositRoot(root));
    }

    // ---------- НОВАЯ ЛОГИКА ВКЛАДОВ ----------

    getDepositGroup(tx) {
        const budget = this.budgetManager.getCurrentBudget();
        if (!budget?.transactions) return [];

        const depositId = tx.depositId || tx.id;

        return budget.transactions
            .filter(t => t.type === 'deposit' && (t.depositId || t.id) === depositId)
            .sort((a, b) => {
                const d = new Date(a.date) - new Date(b.date);
                if (d !== 0) return d;
                return a.id - b.id;
            });
    }

    buildDepositSchedule(tx) {
        const group = this.getDepositGroup(tx);
        if (!group.length) {
            const rate = tx.annualRate || 0;
            return {
                rows: [],
                meta: {
                    annualRate    : rate,
                    termMonths    : tx.termMonths || 0,
                    initialAmount : tx.amount || 0,
                    totalInterest : 0,
                    currentBalance: tx.amount || 0
                }
            };
        }

        const root = group[0];
        const annualRate  = root.annualRate || 0;
        const termMonths  = root.termMonths || 0;
        const monthlyRate = annualRate > 0 ? (annualRate / 100) / 12 : 0;

        const startDate       = new Date(root.date);
        const startYear       = startDate.getFullYear();
        const startMonthIndex = startDate.getMonth(); // 0-11

        const maxMonths = termMonths > 0 ? termMonths : 12;

        const initialAmount = root.amount || 0;
        let balance = initialAmount;

        const rows = [];
        let totalInterest = 0;

        for (let i = 0; i < maxMonths; i++) {
            const year       = startYear + Math.floor((startMonthIndex + i) / 12);
            const monthIndex = (startMonthIndex + i) % 12;
            const monthKey   = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
            const label      = `${this.monthNames[String(monthIndex + 1).padStart(2, '0')] || ''} ${year}`;

            const ops = group.filter(t => (t.date || '').slice(0, 7) === monthKey);

            const startBalance = balance;
            let topups = 0;
            let withdrawals = 0;

            ops.forEach(op => {
                if (op === root) return;

                const status = (op.status || '').trim();
                const amount = op.amount || 0;
                if (status === '➖ Снятие') {
                    withdrawals += amount;
                    balance -= amount;
                } else {
                    topups += amount;
                    balance += amount;
                }
            });

            const interest = monthlyRate > 0 ? Math.floor(balance * monthlyRate) : 0;
            balance += interest;
            totalInterest += interest;

            rows.push({
                label,
                monthKey,
                startBalance,
                topups,
                withdrawals,
                interest,
                endBalance: balance
            });
        }

        return {
            rows,
            meta: {
                annualRate,
                termMonths,
                initialAmount,
                totalInterest,
                currentBalance: balance
            }
        };
    }

    calculateDepositBalanceForMonth(monthFilter, yearFilter) {
        const budget = this.budgetManager.getCurrentBudget();
        if (!budget?.transactions) return 0;

        const mf = parseInt(monthFilter, 10);
        const yf = parseInt(yearFilter, 10);
        if (isNaN(mf) || isNaN(yf)) return 0;

        const roots = this.getDepositRoots().filter(root => this.isNewDepositRoot(root));

        let total = 0;

        roots.forEach(root => {
            const rootDateStr = root.date || '';
            const rootMonth   = parseInt(rootDateStr.slice(5, 7), 10);
            const rootYear    = parseInt(rootDateStr.slice(0, 4), 10);

            if (!rootMonth || !rootYear) return;

            const term      = root.termMonths || 0;
            const maxMonths = term > 0 ? term : 12;

            const offsetMonths =
                (yf - rootYear) * 12 +
                (mf - rootMonth);

            if (offsetMonths < 0 || offsetMonths >= maxMonths) return;

            const { rows } = this.buildDepositSchedule(root);
            if (!rows.length || !rows[offsetMonths]) return;

            const row = rows[offsetMonths];

            // 🌟 Берём баланс на НАЧАЛО месяца, чтобы совпадало с суммой в транзакции
            const monthBalance = row.startBalance ?? row.endBalance;

            total += monthBalance;
        });

        return total;
    }



    closeDepositAtIndex(rootDepositTx, index, existingRows) {
        const rows = existingRows || this.buildDepositSchedule(rootDepositTx).rows;
        if (!rows.length) return;

        const safeIndex = Math.min(index, rows.length - 1);
        const row = rows[safeIndex];

        const withdrawAmount = row.endBalance || 0;
        if (withdrawAmount <= 0) {
            return;
        }

        const monthKey = row.monthKey || (rootDepositTx.date || '').slice(0, 7) || '';
        const date = monthKey ? `${monthKey}-01` : rootDepositTx.date;

        const tx = {
            id        : Date.now(),
            type      : 'deposit',
            date      : date,
            name      : rootDepositTx.name,
            amount    : withdrawAmount,
            status    : '➖ Снятие',
            depositId : rootDepositTx.depositId || rootDepositTx.id,
            annualRate: rootDepositTx.annualRate,
            termMonths: rootDepositTx.termMonths
        };

        this.budgetManager.addTransaction(tx);

        rootDepositTx.termMonths = safeIndex + 1;
        this.budgetManager.saveToStorage?.();

        trackSafe?.('close-deposit', {
            tag      : 'transaction',
            name     : tx.name,
            amount   : withdrawAmount,
            depositId: tx.depositId,
            monthKey
        });
    }

    handleDepositOperation(rootDepositTx, mode) {
        const modal      = document.getElementById('deposit-op-modal');
        const titleEl    = document.getElementById('deposit-op-title');
        const dateInput  = document.getElementById('deposit-op-date');
        const amountInput= document.getElementById('deposit-op-amount');
        const confirmBtn = document.getElementById('deposit-op-confirm');
        const cancelBtn  = document.getElementById('deposit-op-cancel');
        const backdrop   = document.getElementById('bottom-sheet-backdrop');

        if (!modal || !titleEl || !dateInput || !amountInput || !confirmBtn || !cancelBtn) {
            console.error('deposit-op-modal: не все элементы найдены');
            return;
        }

        const { meta } = this.buildDepositSchedule(rootDepositTx);

        titleEl.textContent = mode === 'topup'
            ? 'Пополнение вклада'
            : 'Снятие со вклада';

        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        const todayStr = now.toISOString().slice(0, 10);

        dateInput.value = todayStr;
        dateInput.min = todayStr;

        amountInput.value = '';
        this.clearInlineError(amountInput);
        this.clearInlineError(dateInput);

        const closeModal = () => {
            modal.classList.add('hidden');
            if (!document.querySelector('.bottom-sheet:not(.hidden)') && backdrop) {
                backdrop.classList.add('hidden');
            }
        };

        modal.classList.remove('hidden');
        if (backdrop) backdrop.classList.remove('hidden');

        confirmBtn.onclick = null;
        cancelBtn.onclick  = null;

        cancelBtn.onclick = () => {
            closeModal();
        };

        confirmBtn.onclick = () => {
            this.clearInlineError(amountInput);
            this.clearInlineError(dateInput);

            const rawAmount = amountInput.value.replace(/\D/g, '');
            const amount = parseInt(rawAmount, 10) || 0;

            if (!dateInput.value) {
                this.showInlineError(dateInput, 'Укажите дату');
                return;
            }

            const txDate = dateInput.value;
            if (dateInput.min && txDate < dateInput.min) {
                this.showInlineError(dateInput, 'Нельзя ставить операцию на прошедшую дату');
                return;
            }

            if (amount <= 0) {
                this.showInlineError(amountInput, 'Введите корректную сумму');
                return;
            }

            if (mode === 'withdraw' && amount > meta.currentBalance) {
                this.showInlineError(amountInput, 'Нельзя снять больше, чем есть на вкладе');
                return;
            }

            const tx = {
                id        : Date.now(),
                type      : 'deposit',
                date      : txDate,
                name      : rootDepositTx.name,
                amount    : amount,
                status    : mode === 'topup' ? '➕ Пополнение' : '➖ Снятие',
                depositId : rootDepositTx.depositId || rootDepositTx.id,
                annualRate: rootDepositTx.annualRate,
                termMonths: rootDepositTx.termMonths
            };

            this.budgetManager.addTransaction(tx);

            trackSafe?.(mode === 'topup' ? 'deposit-topup' : 'deposit-withdraw', {
                tag      : 'transaction',
                name     : tx.name,
                amount   : amount,
                depositId: tx.depositId,
                date     : txDate
            });

            closeModal();
            this.updateUI();
            refreshExportAnalytics(this.budgetManager);
            refreshUserProfile(this.budgetManager, true);

            const budget = this.budgetManager.getCurrentBudget();
            const updatedRoot = budget.transactions.find(t =>
                t.type === 'deposit' && (t.depositId || t.id) === (rootDepositTx.depositId || rootDepositTx.id)
            ) || rootDepositTx;

            this.openTransactionDetail(updatedRoot);
        };
    }

    submitDeposit(e) {
        e.preventDefault();

        const dateInput   = document.getElementById('deposit-date');
        const nameInput   = document.getElementById('deposit-name');
        const amountInput = document.getElementById('deposit-amount');
        const rateInput   = document.getElementById('deposit-rate');
        const termInput   = document.getElementById('deposit-term');

        this.clearInlineError(dateInput);
        this.clearInlineError(nameInput);
        this.clearInlineError(amountInput);
        this.clearInlineError(rateInput);

        const amount = parseInt(amountInput.value.replace(/\D/g, ''), 10) || 0;
        const rate   = parseFloat(rateInput.value.replace(',', '.')) || 0;
        const term   = termInput ? parseInt(termInput.value, 10) || 0 : 0;

        if (!dateInput.value) {
            this.showInlineError(dateInput, 'Укажите дату');
            return;
        }
        if (!nameInput.value.trim()) {
            this.showInlineError(nameInput, 'Введите название вклада');
            return;
        }
        if (amount <= 0) {
            this.showInlineError(amountInput, 'Введите корректную сумму');
            return;
        }
        if (rate <= 0) {
            this.showInlineError(rateInput, 'Введите корректный процент');
            return;
        }

        const id = Date.now();
        const depositId = id;

        const transaction = {
            id,
            type      : 'deposit',
            depositId,
            date      : dateInput.value,
            name      : nameInput.value.trim(),
            amount,
            status    : '📥 Вклад',
            annualRate: rate,
            termMonths: term
        };

        this.budgetManager.addTransaction(transaction);

        trackSafe?.('create-deposit', {
            tag       : 'transaction',
            name      : transaction.name,
            amount,
            rate,
            termMonths: term,
            date      : transaction.date
        });

        const form = e.target;
        form.reset();

        const termChips = document.querySelectorAll('#deposit-term-chips .term-chip');
        termChips.forEach(c => c.classList.remove('active'));
        termChips[0]?.classList.add('active');
        if (termInput) termInput.value = '0';

        this.closeModal('transaction-sheet');
        this.updateUI();
        refreshExportAnalytics(this.budgetManager);
        refreshUserProfile(this.budgetManager, true);
    }

    // ---------- /НОВАЯ ЛОГИКА ВКЛАДОВ ----------

    addProduct() {
        const productsList = document.getElementById('products-list');
        const container = document.createElement('div');
        container.classList.add('product-item');
        container.innerHTML = `
      <input type="text" class="product-name" placeholder="Название" maxlength="25" list="product-names-list">
      <input type="tel" class="product-quantity numeric-format" placeholder="Кол-во" required maxlength="5">
      <input type="tel" class="product-price numeric-format" placeholder="Цена" required maxlength="12" inputmode="numeric">
      <button type="button" class="delete-product" title="Удалить товар">✖</button>
    `;
        productsList.appendChild(container);

        const nameInput     = container.querySelector('.product-name');
        const quantityInput = container.querySelector('.product-quantity');
        const priceInput    = container.querySelector('.product-price');

        // Поднимаем поля над клавиатурой при фокусе — та же логика, что в EditManager
        if (this.editManager && typeof this.editManager.attachFocusScroll === 'function') {
            [nameInput, quantityInput, priceInput].forEach(el =>
                this.editManager.attachFocusScroll(el)
            );
        }

        [quantityInput, priceInput].forEach(input => {
            input.addEventListener('input', e => {
                const cursorPosition = input.selectionStart;
                let value = input.value.replace(/[^0-9.,]/g, '').replace(',', '.');
                const num = parseFloat(value) || 0;
                input.value = input === quantityInput ? value : formatNumber(num);
                input.setSelectionRange(
                    cursorPosition + (input.value.length - value.length),
                    cursorPosition + (input.value.length - value.length)
                );
            });
            input.addEventListener('blur', () => {
                const num = parseFloat(input.value.replace(/[^0-9.]/g, '')) || 0;
                input.value = input === quantityInput ? input.value : formatNumber(num);
            });
        });

        container.querySelector('.delete-product')
            ?.addEventListener('click', () => container.remove());
    }


    hideAllForms() {
        document.querySelectorAll('.transaction-form').forEach(form => form.classList.add('hidden'));
    }

    openForm(formId) {
        document.getElementById(formId)?.classList.remove('hidden');
    }

    initializeCategoryButtons() {
        document.querySelectorAll('select[id$="-category"], select[id$="-status"], select[id$="-direction"]').forEach(select => {
            const categories = categoryMap[select.id];
            if (!categories) return;

            select.innerHTML = '';

            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.disabled = true;
            placeholder.selected = true;

            if (select.id === 'expense-category') {
                placeholder.textContent = '🛒 Выберите категорию';
            } else if (select.id === 'income-category') {
                placeholder.textContent = '🛠️ Выберите категорию';
            } else if (select.id === 'debt-direction') {
                placeholder.textContent = '🔄 Выберите тип долга';
            } else if (select.id === 'deposit-status') {
                placeholder.textContent = '🔄 Выберите статус';
            } else {
                placeholder.textContent = 'Выберите...';
            }

            select.appendChild(placeholder);

            if (select.id === 'expense-category' && Array.isArray(categories) && typeof categories[0] === 'object') {
                categories.forEach(group => {
                    const optgroup = document.createElement('optgroup');
                    optgroup.label = group.label;
                    group.options.forEach(opt => {
                        const option = document.createElement('option');
                        option.value = opt;
                        option.textContent = opt;
                        optgroup.appendChild(option);
                    });
                    select.appendChild(optgroup);
                });
            } else {
                categories.forEach(opt => {
                    const option = document.createElement('option');
                    if (typeof opt === 'object') {
                        option.value = opt.value;
                        option.textContent = opt.label;
                    } else {
                        option.value = opt;
                        option.textContent = opt;
                    }
                    select.appendChild(option);
                });
            }

            if (select.previousElementSibling?.classList.contains('category-select-container')) return;
            const container = document.createElement('div');
            container.className = 'category-select-container';
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'category-select-button';
            button.textContent = select.options[select.selectedIndex]?.text || 'Выберите';
            select.addEventListener('change', () => {
                const option = select.options[select.selectedIndex];
                button.textContent = option?.text || 'Выберите';
            });
            button.dataset.selectId = select.id;
            button.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                const currentSheet = select.closest('.bottom-sheet');
                this.openCategorySheet(currentSheet, select);
            });

            const hiddenInput = document.createElement('input');
            hiddenInput.type = 'hidden';
            hiddenInput.name = select.name;
            hiddenInput.value = select.value;
            container.appendChild(button);
            container.appendChild(hiddenInput);
            select.parentNode.insertBefore(container, select);
            select.style.display = 'none';
        });
    }

    /**
     * Подсчёт частоты использования категорий по типу транзакции
     * txType: 'income' | 'expense'
     * Считает по полю tx.category
     */
    getCategoryUsageStats(txType) {
        const stats = new Map();
        const budgets = this.budgetManager?.budgets || [];

        for (const budget of budgets) {
            const txs = budget.transactions || [];
            for (const tx of txs) {
                if (!tx || tx.type !== txType) continue;
                const key = tx.category;
                if (!key) continue;
                stats.set(key, (stats.get(key) || 0) + 1);
            }
        }

        return stats;
    }


    openCategorySheet(currentSheet, currentSelect) {
        const categorySheet = document.getElementById('category-sheet');
        const categoryList = categorySheet?.querySelector('.category-list');
        const backdrop = document.getElementById('bottom-sheet-backdrop');

        if (!categorySheet || !categoryList) {
            console.error('Не найден category-sheet или category-list');
            return;
        }

        this.currentSelectForCategory = currentSelect;

        const allOptions = Array.from(currentSelect.querySelectorAll('option'))
            .filter(opt => opt.value)
            .map(opt => ({ value: opt.value, text: opt.text }));

        let usageStats = null;
        let optionsForSearch = allOptions;

        const id = currentSelect.id;
        const selectType = currentSelect.dataset.categoryType || '';

        const isIncomeSelect =
            id === 'income-category' ||
            id === 'edit-income-category' ||
            selectType === 'income';

        const isExpenseSelect =
            id === 'expense-category' ||
            id === 'edit-expense-category' ||
            selectType === 'expense';

        if (isIncomeSelect || isExpenseSelect) {
            const txType = isIncomeSelect ? 'income' : 'expense';
            usageStats = this.getCategoryUsageStats(txType);

            if (isIncomeSelect && usageStats?.size) {
                optionsForSearch = [...allOptions].sort((a, b) => {
                    const ca = usageStats.get(a.value) || 0;
                    const cb = usageStats.get(b.value) || 0;
                    if (cb !== ca) return cb - ca;
                    return a.text.localeCompare(b.text, 'ru');
                });
            }
        }

        const isSearchable =
            currentSelect.id === 'expense-category' ||
            currentSelect.id === 'income-category' ||
            currentSelect.id === 'edit-expense-category' ||
            currentSelect.id === 'edit-income-category' ||
            currentSelect.dataset.searchable === 'true' ||
            currentSelect.dataset.categoryType === 'income' ||
            currentSelect.dataset.categoryType === 'expense';

        let searchInput = categorySheet.querySelector('#category-search');

        if (isSearchable) {
            if (!searchInput) {
                searchInput = document.createElement('input');
                searchInput.id = 'category-search';
                searchInput.type = 'text';
                searchInput.placeholder = 'Поиск категории';
                Object.assign(searchInput.style, {
                    width: '100%',
                    padding: '10px 12px',
                    margin: '0 0 10px',
                    boxSizing: 'border-box'
                });
                categorySheet.insertBefore(searchInput, categoryList);
            }
            searchInput.value = '';
        } else if (searchInput) {
            searchInput.remove();
            searchInput = null;
        }

        const escapeHtml = (value = '') =>
            String(value)
                .replaceAll('&', '&amp;')
                .replaceAll('<', '&lt;')
                .replaceAll('>', '&gt;')
                .replaceAll('"', '&quot;');

        const renderPlainList = (items) => {
            categoryList.innerHTML = items.map(opt => `
            <li class="category-item" data-value="${escapeHtml(opt.value)}">
                ${escapeHtml(opt.text)}
            </li>
        `).join('');
        };

        const renderGroupedList = () => {
            let html = '';

            if (isExpenseSelect && usageStats?.size) {
                const aggregateMap = new Map();

                for (const [value, rawCount] of usageStats.entries()) {
                    if (!rawCount) continue;

                    const opt = allOptions.find(o => o.value === value);
                    if (!opt) continue;

                    const titleKey = opt.text.trim();
                    const existing = aggregateMap.get(titleKey);

                    if (!existing) {
                        aggregateMap.set(titleKey, {
                            text: titleKey,
                            value,
                            count: rawCount
                        });
                    } else {
                        existing.count += rawCount;
                    }
                }

                const aggregated = Array.from(aggregateMap.values())
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 8);

                if (aggregated.length) {
                    html += `
                    <div class="optgroup-wrapper popular-optgroup">
                        <div class="category-group-label">✨ Часто используемые</div>
                        <div class="group-options">
                            ${aggregated.map(opt => `
                                <li class="category-item" data-value="${escapeHtml(opt.value)}">
                                    <span>${escapeHtml(opt.text)}</span>
                                    <span class="category-usage-badge">${opt.count}x</span>
                                </li>
                            `).join('')}
                        </div>
                    </div>
                `;
                }
            }

            Array.from(currentSelect.children).forEach(child => {
                if (child.tagName === 'OPTGROUP') {
                    const optionsHtml = Array.from(child.children)
                        .filter(opt => opt.value)
                        .map(opt => `
                        <li class="category-item" data-value="${escapeHtml(opt.value)}">
                            ${escapeHtml(opt.text)}
                        </li>
                    `)
                        .join('');

                    html += `
                    <div class="optgroup-wrapper">
                        <div class="category-group-label dropdown-toggle">▶ ${escapeHtml(child.label)}</div>
                        <div class="group-options hidden">${optionsHtml}</div>
                    </div>
                `;
                } else if (child.tagName === 'OPTION' && child.value) {
                    html += `
                    <li class="category-item" data-value="${escapeHtml(child.value)}">
                        ${escapeHtml(child.text)}
                    </li>
                `;
                }
            });

            categoryList.innerHTML = html;
        };

        const render = (filter = '') => {
            if (filter) {
                const normalized = filter.trim().toLowerCase();
                const filtered = (optionsForSearch || allOptions).filter(opt =>
                    opt.text.toLowerCase().includes(normalized)
                );
                renderPlainList(filtered);
                return;
            }

            if (isIncomeSelect) {
                renderPlainList(optionsForSearch || allOptions);
                return;
            }

            renderGroupedList();
        };

        render('');

        if (!categoryList.dataset.boundDelegation) {
            categoryList.addEventListener('click', (e) => {
                const toggle = e.target.closest('.dropdown-toggle');
                if (toggle) {
                    const optionsContainer = toggle.nextElementSibling;
                    const hidden = optionsContainer.classList.toggle('hidden');
                    toggle.textContent = `${hidden ? '▶' : '▼'} ${toggle.textContent.replace(/^[▶▼]\s*/, '')}`;
                    return;
                }

                const item = e.target.closest('.category-item');
                if (!item) return;

                const value = item.dataset.value;
                const labelNode = item.querySelector('span');
                const labelText = labelNode ? labelNode.textContent : item.textContent;

                this.selectCategory(value, labelText.trim());
            });

            categoryList.dataset.boundDelegation = 'true';
        }

        if (searchInput) {
            let searchRaf = 0;
            searchInput.oninput = () => {
                const value = searchInput.value || '';

                if (searchRaf) cancelAnimationFrame(searchRaf);
                searchRaf = requestAnimationFrame(() => {
                    render(value);
                });
            };
        }

        if (backdrop) backdrop.classList.remove('hidden');

        categorySheet.style.zIndex = '';
        categorySheet.classList.remove('hidden');

        const closeCategory = () => {
            categorySheet.classList.add('hidden');
            const anyOpen = document.querySelector('.bottom-sheet:not(.hidden):not(#category-sheet)');
            if (!anyOpen && backdrop) backdrop.classList.add('hidden');
        };

        const closeBtn = categorySheet.querySelector('.close-category-sheet');
        if (closeBtn) {
            closeBtn.onclick = null;
            closeBtn.onclick = closeCategory;
        }

        if (backdrop) {
            backdrop.onclick = () => {
                if (!categorySheet.classList.contains('hidden')) {
                    closeCategory();
                }
            };
        }
    }

    openDebtPaymentModal(id, remainingAmount) {
        const modal = document.getElementById('debt-pay-modal');
        const input = document.getElementById('debt-pay-amount');
        input.value = '';
        input.focus();
        modal.classList.remove('hidden');
        document.getElementById('bottom-sheet-backdrop').classList.remove('hidden');
        const confirmBtn = document.getElementById('pay-debt-confirm');
        const cancelBtn = document.getElementById('cancel-debt-pay');
        confirmBtn.onclick = cancelBtn.onclick = null;
        confirmBtn.onclick = () => {
            const raw = input.value.replace(/\s/g, '').replace(',', '.');
            const amount = parseFloat(raw);
            if (isNaN(amount) || amount <= 0) {
                this.showInlineError(input, 'Введите корректную сумму');
                return;
            }
            this.clearInlineError(input);
            if (navigator.vibrate) navigator.vibrate(30);
            this.budgetManager.markDebtPayment(id, amount);
            modal.classList.add('hidden');
            document.getElementById('bottom-sheet-backdrop').classList.add('hidden');
            this.updateUI();
        };
        cancelBtn.onclick = () => {
            modal.classList.add('hidden');
            document.getElementById('bottom-sheet-backdrop').classList.add('hidden');
        };
        input.addEventListener('focus', () => this.clearInlineError(input));
    }

    selectCategory(value, labelText = '') {
        if (!this.currentSelectForCategory) return;

        const select = this.currentSelectForCategory;
        select.value = value;

        // форма может быть как .transaction-form (создание), так и .tx-form (редактирование)
        const form =
            select.closest('.tx-form, .transaction-form') ||
            document;

        const button =
            form.querySelector(`[data-select-id="${select.id}"]`) ||
            document.querySelector(`[data-select-id="${select.id}"]`);

        const hiddenInput =
            form.querySelector(`input[type="hidden"][name="${select.name}"]`) ||
            document.querySelector(`input[type="hidden"][name="${select.name}"]`);

        const label = (labelText || '').trim() || 'Выберите';

        if (button) button.textContent = label;
        if (hiddenInput) hiddenInput.value = value;

        // отдаём событие change — и для создания, и для редактирования
        select.dispatchEvent(new Event('change'));

        const categorySheet = document.getElementById('category-sheet');
        categorySheet?.classList.add('hidden');

        // если это редактирование — помечаем форму как изменённую
        if (select.id.startsWith('edit-') && this.editManager) {
            this.editManager.markChanged?.();
        }

        this.currentSelectForCategory = null;
    }



    // ---------- НОВЫЙ MONTH-PICKER В ХЕДЕРЕ ----------

    initializeHeaderMonthPicker() {
        const now = new Date();
        const currentMonthKey = String(now.getMonth() + 1).padStart(2, '0');
        const currentYear = now.getFullYear();

        if (!this.monthFilter) {
            this.monthFilter = currentMonthKey;
        }
        if (!this.yearFilter) {
            this.yearFilter = currentYear;
        }
        if (!this.activeYearForMonthFilter) {
            this.activeYearForMonthFilter = this.yearFilter;
        }

        let btn = document.getElementById('month-picker-btn');
        if (!btn) {
            const profileBtn = document.getElementById('open-profile-btn');
            if (profileBtn && profileBtn.parentElement) {
                const container = profileBtn.parentElement;
                btn = document.createElement('button');
                btn.id = 'month-picker-btn';
                btn.className = 'month-picker-btn';
                btn.type = 'button';
                container.insertBefore(btn, profileBtn);
            }
        }

        if (!btn) {
            console.warn('month-picker-btn не найден и не удалось создать');
            return;
        }

        btn.addEventListener('click', () => this.openMonthPickerSheet());
        this.updateMonthPickerButton();
        this.adjustHeaderTitleFont();
    }

    openMonthPickerSheet() {
        const sheet        = document.getElementById('month-picker-sheet');
        const grid         = document.getElementById('months-grid');
        const yearDisplay  = document.getElementById('year-display');
        const prevBtn      = document.getElementById('prev-year-btn');
        const nextBtn      = document.getElementById('next-year-btn');
        const backdrop     = document.getElementById('bottom-sheet-backdrop');
        const allMonthsBtn = document.getElementById('all-months-btn');

        if (!sheet || !grid || !yearDisplay || !prevBtn || !nextBtn) {
            console.error('Элементы month-picker-sheet не найдены');
            return;
        }

        const render = () => {
            // границы годов
            if (this.yearFilter < this.minYear) this.yearFilter = this.minYear;
            if (this.yearFilter > this.maxYear) this.yearFilter = this.maxYear;

            yearDisplay.textContent = this.yearFilter;
            prevBtn.disabled = this.yearFilter <= this.minYear;
            nextBtn.disabled = this.yearFilter >= this.maxYear;

            grid.innerHTML = '';

            // наполняем месяцы
            for (let i = 1; i <= 12; i++) {
                const key = String(i).padStart(2, '0');
                const div = document.createElement('div');
                div.className = 'month-item';

                if (
                    this.monthFilter !== 'all' &&
                    key === this.monthFilter &&
                    this.yearFilter === this.activeYearForMonthFilter
                ) {
                    div.classList.add('active');
                }

                div.textContent = this.monthNames[key] || key;

                div.addEventListener('click', () => {
                    this.monthFilter = key;
                    this.activeYearForMonthFilter = this.yearFilter;

                    this.updateMonthPickerButton();

                    sheet.classList.remove('show');
                    sheet.classList.add('hidden');
                    // Проверяем по .show (не по .hidden) — т.к. CSS делает hidden-sheets display:block
                    const anySheetOpen = document.querySelector(
                        '.bottom-sheet.show, ' +
                        '.bottom-sheet:not(.hidden):not(#settings-page):not(#analytics-page):not(#month-picker-sheet)'
                    );
                    if (!anySheetOpen && backdrop) backdrop.classList.add('hidden');

                    this.updateUI();
                });

                grid.appendChild(div);
            }

            // состояние для "Все месяцы"
            if (allMonthsBtn) {
                if (this.monthFilter === 'all') {
                    allMonthsBtn.classList.add('active');
                } else {
                    allMonthsBtn.classList.remove('active');
                }
            }

            // состояние для "1 год"
            const yearMonthsBtn = document.getElementById('year-months-btn');
            if (yearMonthsBtn) {
                if (this.monthFilter === 'year' && this.yearFilter === this.activeYearForMonthFilter) {
                    yearMonthsBtn.classList.add('active');
                } else {
                    yearMonthsBtn.classList.remove('active');
                }
            }

            // 🔄 перезапуск анимации сетки
            grid.classList.remove('months-grid-anim');
            // форсим рефлоу, чтобы браузер реально "забыл" анимацию
            // eslint-disable-next-line no-unused-expressions
            grid.offsetHeight;
            grid.classList.add('months-grid-anim');
        };

        // стрелки года
        prevBtn.onclick = () => {
            if (this.yearFilter > this.minYear) {
                this.yearFilter--;
                if (this.monthFilter === 'year') {
                    this.activeYearForMonthFilter = this.yearFilter;
                    this.updateUI();
                }
                render();
                this.updateMonthPickerButton();
            }
        };

        nextBtn.onclick = () => {
            if (this.yearFilter < this.maxYear) {
                this.yearFilter++;
                if (this.monthFilter === 'year') {
                    this.activeYearForMonthFilter = this.yearFilter;
                    this.updateUI();
                }
                render();
                this.updateMonthPickerButton();
            }
        };

        // "Все месяцы"
        if (allMonthsBtn && !allMonthsBtn._bound) {
            allMonthsBtn._bound = true;
            allMonthsBtn.addEventListener('click', () => {
                this.monthFilter = 'all';
                this.updateMonthPickerButton();

                sheet.classList.remove('show');
                sheet.classList.add('hidden');
                const anySheetOpen2 = document.querySelector(
                    '.bottom-sheet.show, ' +
                    '.bottom-sheet:not(.hidden):not(#settings-page):not(#analytics-page):not(#month-picker-sheet)'
                );
                if (!anySheetOpen2 && backdrop) backdrop.classList.add('hidden');

                this.updateUI();
            });
        }

        // "1 год"
        const yearMonthsBtn = document.getElementById('year-months-btn');
        if (yearMonthsBtn && !yearMonthsBtn._bound) {
            yearMonthsBtn._bound = true;
            yearMonthsBtn.addEventListener('click', () => {
                this.monthFilter = 'year';
                this.activeYearForMonthFilter = this.yearFilter;
                this.updateMonthPickerButton();
                render(); // обновить active-состояние кнопок

                sheet.classList.remove('show');
                sheet.classList.add('hidden');
                const anySheetOpen3 = document.querySelector(
                    '.bottom-sheet.show, ' +
                    '.bottom-sheet:not(.hidden):not(#settings-page):not(#analytics-page):not(#month-picker-sheet)'
                );
                if (!anySheetOpen3 && backdrop) backdrop.classList.add('hidden');

                this.updateUI();
            });
        }

        // свайпы по шторке
        if (!this._monthPickerSwipeInited) {
            this._monthPickerSwipeInited = true;
            let startX = null;

            const onTouchStart = e => {
                if (!e.touches || !e.touches.length) return;
                startX = e.touches[0].clientX;
            };

            const onTouchEnd = e => {
                if (startX == null || !e.changedTouches || !e.changedTouches.length) return;
                const dx = e.changedTouches[0].clientX - startX;
                startX = null;

                if (Math.abs(dx) < 50) return;

                if (dx < 0) {
                    nextBtn.click();
                } else {
                    prevBtn.click();
                }
            };

            sheet.addEventListener('touchstart', onTouchStart, { passive: true });
            sheet.addEventListener('touchend', onTouchEnd);
        }

        // открытие
        if (backdrop) backdrop.classList.remove('hidden');
        sheet.classList.remove('hidden');
        sheet.classList.add('show');

        render();
    }


    updateMonthPickerButton() {
        const btn = document.getElementById('month-picker-btn');
        if (!btn) return;

        if (this.monthFilter === 'all') {
            btn.textContent = 'Все месяцы ▾';
            return;
        }

        if (this.monthFilter === 'year') {
            const yearForLabel = this.activeYearForMonthFilter || this.yearFilter || (new Date()).getFullYear();
            btn.textContent = `${yearForLabel} год ▾`;
            return;
        }

        const monthName = this.monthNames[this.monthFilter] || '';
        const currentYear = (new Date()).getFullYear();

        const yearForLabel = this.activeYearForMonthFilter || this.yearFilter || currentYear;

        const label = (yearForLabel && yearForLabel !== currentYear)
            ? `${monthName} ${yearForLabel}`
            : monthName;

        btn.textContent = `${label} ▾`;
    }

    adjustHeaderTitleFont() {
        const titleEl = document.getElementById('current-budget-name')
                     || document.getElementById('current-budget');
        if (!titleEl) return;
        const header = titleEl.closest('header');
        if (!header) return;

        const maxFont = 20;
        const minFont = 12;
        titleEl.style.fontSize = maxFont + 'px';

        const headerWidth = header.clientWidth || 0;
        if (!headerWidth) return;

        const profileBtn = document.getElementById('open-profile-btn');
        const monthBtn   = document.getElementById('month-picker-btn');

        const rightWidth =
            (profileBtn?.offsetWidth || 0) +
            (monthBtn?.offsetWidth || 0) +
            32;

        const available = headerWidth - rightWidth;
        if (available <= 0) return;

        titleEl.style.maxWidth = available + 'px';

        let font = maxFont;
        while (font > minFont && titleEl.scrollWidth > titleEl.clientWidth) {
            font -= 1;
            titleEl.style.fontSize = font + 'px';
        }
    }

    wrapCategorySelect(select) {
        // Если уже обёрнут – ничего не делаем
        if (select.previousElementSibling?.classList.contains('category-select-container')) {
            return;
        }

        const container = document.createElement('div');
        container.className = 'category-select-container';

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'category-select-button';
        button.textContent = select.options[select.selectedIndex]?.text || 'Выберите';

        // обновление текста при смене
        select.addEventListener('change', () => {
            const option = select.options[select.selectedIndex];
            button.textContent = option?.text || 'Выберите';
        });

        // кастомное открытие шит-а
        button.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            this.openCategorySheet(null, select);
        });

        // скрытый input для формы
        const hiddenInput = document.createElement('input');
        hiddenInput.type = 'hidden';
        hiddenInput.name = select.name;
        hiddenInput.value = select.value;

        // меняем hiddenInput при выборе категории
        select.addEventListener('change', () => {
            hiddenInput.value = select.value;
        });

        container.appendChild(button);
        container.appendChild(hiddenInput);

        select.parentNode.insertBefore(container, select);
        select.style.display = 'none';
    }

}