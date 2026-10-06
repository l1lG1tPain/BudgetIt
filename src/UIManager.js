// UIManager.js
import { formatNumber, formatDate, getTypeColor, getTypeName, getNumberFormat } from './utils/utils.js';
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
import { addCustomCategory, removeCustomCategory } from './utils/customCategories.js';
import { openDateSheet, formatDateLabel } from './ui/DateSheet.js';
import { refreshExportAnalytics, createAutoBackup } from './settings.js';
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
        try { this.setupAddSheet(); } catch (e) { console.warn('setupAddSheet:', e); }
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

        this.updateAkulkaCard(totals, carryOver, isSingleMonth);
        this.desktopWidgets?.refresh();

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
            this.syncFilterUI();
            return;
        }

        this.updateTransactionList(filtered);
        this.syncFilterUI();
    }

    // Подсветка активной карточки-фильтра и чип «Все операции ✕»
    syncFilterUI() {
        const active = this.transactionFilter;
        ['income', 'expense', 'deposit', 'debt'].forEach(type => {
            document.getElementById(`block-${type}`)?.classList.toggle('is-active-filter', active === type);
        });

        const header = document.getElementById('transactions-header');
        if (!header) return;
        let chip = document.getElementById('clear-filter-chip');
        if (active === 'all') { chip?.remove(); return; }
        if (!chip) {
            chip = document.createElement('button');
            chip.id = 'clear-filter-chip';
            chip.type = 'button';
            chip.className = 'clear-filter-chip';
            chip.addEventListener('click', () => {
                this.transactionFilter = 'all';
                this.updateUI();
            });
            header.appendChild(chip);
        }
        chip.textContent = 'Все операции ✕';
        header.classList.remove('hidden');
    }


    updateTransactionList(transactions) {
        const list   = document.getElementById('transaction-list');
        const header = document.getElementById('transactions-header');

        if (!list) return;

        // Длинные списки (тысячи операций) рисуем порциями по мере прокрутки — иначе главный поток замирает.
        const mf = this.monthFilter;
        const listKey = `${mf}|${this.activeYearForMonthFilter || this.yearFilter}|${this.transactionFilter}`;
        const keep = this._txListKey === listKey ? Math.min(Math.max(this._txRendered || 0, 0), 600) : 0;
        this._txListKey = listKey;
        this._txObserver?.disconnect();
        this._txObserver = null;

        list.innerHTML = '';
        this._bindTxListEvents(list);

        if (header) {
            header.classList.toggle('hidden', !transactions || transactions.length === 0);
        }

        const isAllMonth = mf === 'all' || mf === 'year';

        // даты — ISO-строки, сравниваем как строки (без new Date на каждое сравнение)
        transactions.sort((a, b) => {
            const da = a.date || '', db = b.date || '';
            if (da !== db) return da < db ? 1 : -1;
            return b.id - a.id;
        });

        // Итог дня: поступления и снятия со вклада +, траты и пополнения вклада −, долги не считаем
        const dayParts = {};
        transactions.forEach(t => {
            const amt = Number(t.amount) || 0;
            const dd = dayParts[t.date] || (dayParts[t.date] = { inc: 0, spent: 0 });
            if (t.type === 'income') dd.inc += amt;
            else if (t.type === 'expense') dd.spent += amt;
        });

        // плоский список строк: заголовок дня | операция (с признаками первой/последней в дне)
        const rows = [];
        let lastDay = null;
        transactions.forEach(t => {
            if (t.date !== lastDay) { lastDay = t.date; rows.push({ head: t.date }); }
            rows.push({ t });
        });
        rows.forEach((r, i) => {
            if (!r.t) return;
            r.first = !rows[i - 1] || !!rows[i - 1].head;
            r.last  = !rows[i + 1] || !!rows[i + 1].head;
        });

        // кэши на одну отрисовку: цвета темы, формат чисел, группы вкладов
        const colors = {};
        ['income', 'expense', 'debt', 'deposit'].forEach(k => { colors[k] = this.getTypeColor(k); });
        const fmtKey = getNumberFormat();
        const fmt = n => this.formatNumber(n, fmtKey);
        const groupCache = new Map();
        const groupOf = t => {
            const k = t.depositId || t.id;
            let g = groupCache.get(k);
            if (!g) { g = this.getDepositGroup(t); groupCache.set(k, g); }
            return g;
        };
        const schedCache = new Map();
        const filterYear = this.activeYearForMonthFilter || this.yearFilter;

        const buildRow = (r) => {
            if (r.head !== undefined) {
                const head = document.createElement('li');
                head.className = 'tx-day-head';
                const dp = dayParts[r.head] || { inc: 0, spent: 0 };
                const hp = this.formatDayParts(r.head);
                head.innerHTML = `<span class="tx-day-label"><b>${escapeHtml(hp.title)}</b><small>${escapeHtml(hp.sub)}</small></span>` +
                    `<span class="tx-day-total">${dp.inc > 0 ? `<i class="tx-day-inc">+${fmt(dp.inc)}</i>` : ''}${dp.spent > 0 ? `<b class="tx-day-spent">−${fmt(dp.spent)}</b>` : ''}</span>`;
                return head;
            }
            const t = r.t;
            const li = document.createElement('li');
            li.className = 'tx-item' + (r.first ? ' tx-first' : '') + (r.last ? ' tx-last' : '');
            li._tx = t;
            li.style.borderLeftColor = colors[t.type] || 'black';

            let debtTag = '';
            if (t.type === 'debt') {
                debtTag = t.direction === 'owe'
                    ? ' <span class="tx-debt-tag tx-debt-tag-owe">#Я должен</span>'
                    : ' <span class="tx-debt-tag tx-debt-tag-lent">#Мне должны</span>';
            }

            // 💎 бриллиант для корневого НОВОГО вклада
            let titleName = t.category || t.name || '';
            let depRoot = null, depIsRoot = false, depLegacy = true;
            if (t.type === 'deposit') {
                const group = groupOf(t);
                depRoot = group[0] || t;
                depIsRoot = t.id === depRoot.id;
                depLegacy = !this.isNewDepositRoot(depRoot);
                if (!depLegacy && depIsRoot) titleName = `💎 ${titleName || 'Накопление'}`;
            }

            // 🧿 Эмодзи категории слева + очищенный заголовок
            let emoji = '';
            let cleanTitle = titleName || this.getTypeName(t.type);

            const emojiMatch = (titleName || '').match(/^(\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Emoji}️?)\s*(.*)$/u);
            if (emojiMatch) {
                emoji = emojiMatch[1];
                cleanTitle = emojiMatch[2] || cleanTitle;
            } else {
                switch (t.type) {
                    case 'income':  emoji = '💸'; break;
                    case 'expense': emoji = '🛒'; break;
                    case 'debt':    emoji = t.direction === 'owe' ? '📉' : '📈'; break;
                    case 'deposit': emoji = '🏦'; break;
                    default:        emoji = '💠';
                }
            }

            let amountSign = '';
            if (t.type === 'deposit') {
                amountSign = t.status?.trim() === '➖ Снятие' ? '-' : '+';
            } else if (t.type === 'debt') {
                amountSign = t.direction === 'owe' ? '-' : '+';
            } else if (t.type === 'expense') {
                amountSign = '-';
            } else if (t.type === 'income') {
                amountSign = '+';
            }

            let displayAmount;
            if (t.type === 'debt') {
                displayAmount = (t.direction === 'owe' ? '-' : '+') + fmt(t.remainingAmount || t.initialAmount);
            } else {
                displayAmount = amountSign + fmt(t.amount);
            }

            // 📊 Для корневого НОВОГО вклада в месячном режиме — показываем СТАРТ месяца
            if (t.type === 'deposit' && !depLegacy && depIsRoot && !isAllMonth && mf !== 'all') {
                const rootDateStr = depRoot.date || '';
                const rootMonth   = parseInt(rootDateStr.slice(5, 7), 10);
                const rootYear    = parseInt(rootDateStr.slice(0, 4), 10);
                const filterMonth = parseInt(mf, 10);
                const term        = depRoot.termMonths || 0;
                const maxMonths   = term > 0 ? term : 12;

                if (rootMonth && rootYear && !isNaN(filterMonth) && !isNaN(filterYear)) {
                    const offsetMonths = (filterYear - rootYear) * 12 + (filterMonth - rootMonth);
                    if (offsetMonths >= 0 && offsetMonths < maxMonths) {
                        let sch = schedCache.get(depRoot.id);
                        if (!sch) { sch = this.buildDepositSchedule(depRoot); schedCache.set(depRoot.id, sch); }
                        const row = sch.rows[offsetMonths];
                        if (row) displayAmount = (amountSign || '+') + fmt(row.startBalance);
                    }
                }
            }

            const displayDate = this.formatDate(t.date);
            let subText = '';
            if (t.type === 'expense' && Array.isArray(t.products) && t.products.length) {
                const first = (t.products[0]?.name || '').trim();
                subText = t.products.length > 1 ? `${first ? first + ' · ' : ''}${t.products.length} поз.` : first;
                if (subText && subText.toLowerCase() === String(cleanTitle).toLowerCase()) subText = '';
            }

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
                ${subText ? `<div class="tx-sub">${escapeHtml(subText)}</div>` : ''}
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
            return li;
        };

        let pos = 0;
        const FIRST = 40, STEP = 60;
        const sentinel = document.createElement('li');
        sentinel.className = 'tx-sentinel';
        sentinel.setAttribute('aria-hidden', 'true');

        const renderMore = (n) => {
            const frag = document.createDocumentFragment();
            const end = Math.min(rows.length, pos + n);
            let i = pos;
            for (; i < end; i++) frag.appendChild(buildRow(rows[i]));
            // не обрываем группу «заголовок дня» без операций
            if (i < rows.length && rows[i - 1] && rows[i - 1].head !== undefined) frag.appendChild(buildRow(rows[i++]));
            pos = i;
            sentinel.remove();
            list.appendChild(frag);
            this._txRendered = pos;
            if (pos < rows.length) {
                list.appendChild(sentinel);
                if (this._txObserver) { this._txObserver.unobserve(sentinel); this._txObserver.observe(sentinel); }
            } else if (this._txObserver) {
                this._txObserver.disconnect();
                this._txObserver = null;
            }
        };

        if (typeof IntersectionObserver === 'function') {
            this._txObserver = new IntersectionObserver((entries) => {
                if (entries.some(e => e.isIntersecting)) renderMore(STEP);
            }, { rootMargin: '1800px 0px 1800px 0px' });
        }
        renderMore(Math.max(FIRST, keep));
        // без IntersectionObserver (очень старые браузеры) — дорисовываем остальное сразу
        if (!this._txObserver && pos < rows.length) renderMore(rows.length);
    }

    // Заголовок дня, который сейчас прилип к верху, получает класс is-stuck (ему включается подложка/размытие),
    // а все заголовки выше него — is-past (скрыты: иначе при прозрачном фоне они громоздились бы друг на друга)
    _bindStuckDayHead(list) {
        let raf = 0, current = null, heads = null;
        const scroller = () => {
            let e = list.parentElement;
            while (e && e !== document.body) {
                const o = getComputedStyle(e).overflowY;
                if ((o === 'auto' || o === 'scroll') && e.scrollHeight > e.clientHeight) return e;
                e = e.parentElement;
            }
            return null;
        };
        const clearAll = () => list.querySelectorAll('li.tx-day-head.is-stuck, li.tx-day-head.is-past')
            .forEach(h => h.classList.remove('is-stuck', 'is-past'));
        const update = () => {
            raf = 0;
            if (!list.isConnected || !list.offsetParent) return;
            const first = list.querySelector('li.tx-day-head');
            if (!first) return;
            const sc = scroller();
            const top = parseFloat(getComputedStyle(first).top);
            const stickyY = (sc ? sc.getBoundingClientRect().top + (parseFloat(getComputedStyle(sc).paddingTop) || 0) : 0) + (isNaN(top) ? 0 : top);
            // заголовки идут в порядке DOM, их top не убывает: ищем двоичным поиском последний, дошедший до липкой линии
            if (!heads) heads = Array.from(list.querySelectorAll('li.tx-day-head'));
            let lo = 0, hi = heads.length - 1, found = -1;
            while (lo <= hi) {
                const mid = (lo + hi) >> 1;
                if (heads[mid].getBoundingClientRect().top <= stickyY + 1.5) { found = mid; lo = mid + 1; } else hi = mid - 1;
            }
            const stuck = found >= 0 ? heads[found] : null;
            if (stuck === current) return;
            clearAll();
            current = stuck;
            if (!stuck) return;
            stuck.classList.add('is-stuck');
            for (let h = stuck.previousElementSibling; h; h = h.previousElementSibling) {
                if (h.classList.contains('tx-day-head')) h.classList.add('is-past');
            }
        };
        const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
        document.addEventListener('scroll', onScroll, { capture: true, passive: true });
        window.addEventListener('resize', onScroll, { passive: true });
        // после перерисовки списка состояние сбрасывается
        new MutationObserver(() => { current = null; heads = null; onScroll(); }).observe(list, { childList: true });
    }

    // Один набор обработчиков на весь список (а не по слушателю на каждую строку)
    _bindTxListEvents(list) {
        if (list._txBound) return;
        list._txBound = true;
        this._bindStuckDayHead(list);
        list.addEventListener('click', e => {
            const pay = e.target.closest?.('.pay-debt');
            if (pay && list.contains(pay)) {
                e.stopPropagation();
                const id = +pay.dataset.id;
                const tx = this.budgetManager.getCurrentBudget().transactions.find(t => t.id === id);
                if (!tx) return;
                const remaining = tx.remainingAmount || tx.initialAmount || tx.amount;
                this.openDebtPaymentModal(id, remaining);
                return;
            }
            const li = e.target.closest?.('li.tx-item');
            if (li && li._tx) this.openTransactionDetail(li._tx);
        });
    }

    // Карточка Акулки на главной. Этап 3 — простой статический вариант по доле трат;
    // полноценные настроения/лимит дня приедут в SharkMood (этап 6).
    updateAkulkaCard(totals, carryOver, isSingleMonth) {
        // новая логика (дневной лимит) — в src/shark; старый расчёт по месяцу остаётся запасным
        try { this.accountsHook?.refresh(); } catch (e) { /* строка «Счета» не критична */ }
        if (this.sharkHook) { this.sharkHook.refreshCard(); return; }
        const bar = document.getElementById('akulka-bar');
        if (!bar) return;
        const income = Number(totals.monthlyIncome) || 0;
        const expense = Number(totals.monthlyExpense) || 0;
        const base = income + (isSingleMonth ? Math.max(carryOver, 0) : 0);
        const ratio = base > 0 ? expense / base : (expense > 0 ? 1 : 0);

        let mood = ['ok', 'Акулка спокойна', 'Траты в норме. Так держать.'];
        if (ratio >= 0.9) mood = ['bad', 'Акулка встревожена', 'Почти всё потрачено. Пора притормозить.'];
        else if (ratio >= 0.8) mood = ['warn', 'Акулка напряглась', 'Трат уже много — следи за расходами.'];
        else if (ratio >= 0.7) mood = ['note', 'Акулка присматривается', 'Больше двух третей бюджета уже потрачено.'];
        else if (base === 0 && expense === 0) mood = ['ok', 'Акулка на посту', 'Добавь первую операцию — и я начну следить.'];

        const card = document.getElementById('akulka-card');
        if (card) card.dataset.mood = mood[0];
        const t = document.getElementById('akulka-title');
        const x = document.getElementById('akulka-text');
        if (t) t.textContent = mood[1];
        if (x) x.textContent = mood[2];
        bar.style.width = Math.min(100, Math.round(ratio * 100)) + '%';
    }

    formatDayParts(dateStr) {
        const d = new Date(dateStr + 'T00:00:00');
        if (!dateStr || isNaN(d)) return { title: dateStr || '', sub: '' };
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const diff = Math.round((today - d) / 86400000);
        const long = d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });
        if (diff === 0) return { title: 'Сегодня', sub: long };
        if (diff === 1) return { title: 'Вчера', sub: long };
        return { title: d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }), sub: d.toLocaleDateString('ru-RU', { weekday: 'long' }) };
    }

    formatDayHeading(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr + 'T00:00:00');
        if (isNaN(d)) return dateStr;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const diff = Math.round((today - d) / 86400000);
        if (diff === 0) return 'Сегодня';
        if (diff === 1) return 'Вчера';
        const day = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
        const wd = d.toLocaleDateString('ru-RU', { weekday: 'long' });
        return `${day}, ${wd}`;
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
            income : 'Поступлений пока нет. Добавьте поступление — и оно появится здесь. <br />Чтобы увидеть все операции, нажмите «Доступно».',
            expense: 'Трат пока нет. Добавьте трату — и она появится здесь. <br />Чтобы увидеть все операции, нажмите «Доступно».',
            deposit: 'Накопления пока пустуют. Пополните копилку — и мы отобразим операции тут. <br />Вернуться к полному списку можно нажатием на «Доступно».',
            debt   : 'У вас нет добавленных долгов в этом месяце — и это отлично! <br />Чтобы увидеть все операции, нажмите «Доступно».'
        };
        list.innerHTML = `
      <li class="empty-card">
        <img class="empty-shark" src="./assets/shark.png" alt="">
        <div class="empty-text">${msgByType[type] || msgByType.all}</div>
      </li>
    `;
    }

    openModal(id) {
        const m = document.getElementById(id);
        if (!m) return;

        if (id === 'settings-page') { try { window._renderSettingsList?.(); } catch (e) {} }
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
            '.bottom-sheet:not(.hidden):not(#settings-page):not(#analytics-page):not(#accounts-page):not(#planner-page)'
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
                titleName = `💎 ${titleName || 'Накопление'}`;
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
        const tile = document.getElementById('detail-emoji');
        if (tile) tile.textContent = emoji;

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
            const sign = transaction.type === 'expense' ? '−' : transaction.type === 'income' ? '+' : '';
            detailAmount.textContent = `${sign}${this.formatNumber(transaction.amount || 0)}`;
            detailAmount.dataset.kind = transaction.type;
        }
        if (transaction.type === 'debt') detailAmount.dataset.kind = 'debt';

        detailDate.textContent = `Дата: ${this.formatDate(transaction.date || new Date())}`;

        const info = document.getElementById('detail-info');
        if (info) {
            const catName = (transaction.type === 'debt')
                ? (transaction.direction === 'owe' ? 'Я должен' : 'Мне должны')
                : (transaction.type === 'deposit' ? 'Накопления' : (cleanTitle || ''));
            const when = this.formatDayHeading
                ? this.formatDayHeading(transaction.date || new Date())
                : this.formatDate(transaction.date || new Date());
            const budgetName = this.budgetManager.getCurrentBudget()?.name || '';
            info.classList.remove('hidden');
            info.innerHTML = `
              <div class="di-row"><span>Категория</span><b>${escapeHtml(catName)}</b></div>
              <div class="di-row"><span>Дата</span><b>${escapeHtml(String(when))}</b></div>
              <div class="di-row"><span>Бюджет</span><b>${escapeHtml(budgetName)}</b></div>`;
        }
        const x = document.getElementById('detail-x');
        if (x) x.onclick = () => this.closeModal('transaction-detail-sheet');

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
          <div><strong>Накопление:</strong> ${escapeHtml(root.name || 'Без названия')}</div>
          <div><strong>Ставка:</strong> ${meta.annualRate.toFixed(2)}% годовых</div>
          <div><strong>Срок:</strong> ${meta.termMonths ? meta.termMonths + ' мес.' : 'Бессрочно'}</div>
          <div><strong>Стартовая сумма:</strong> ${this.formatNumber(meta.initialAmount)}</div>
          <div><strong>Начислено:</strong> ${this.formatNumber(meta.totalInterest)}</div>
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
        <strong>Позиции:</strong>
        <div class="detail-products-list">
          ${transaction.products.map(p => `
            <div class="detail-product-row">
              <span class="product-title">${escapeHtml(p.name)}</span>
              <span class="product-meta">${p.quantity} × ${this.formatNumber(p.price)} = ${this.formatNumber((p.quantity || 0) * (p.price || 0))}</span>
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
                // страховка: автобэкап перед удалением (его можно восстановить в «Данные и бэкапы»)
                try { createAutoBackup('before-delete-transaction'); } catch (e) { console.warn('auto-backup:', e); }

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
            let bal = 0;
            try {
                const keep = this.budgetManager.currentBudgetIndex;
                this.budgetManager.currentBudgetIndex = index;
                bal = Number(this.budgetManager.calculateTotals('all')?.overallBudget) || 0;
                this.budgetManager.currentBudgetIndex = keep;
            } catch (_) {}

            div.innerHTML = `
        <div class="budget-item-main">
          <div class="budget-emoji">${emoji}</div>
          <div class="budget-info">
            <div class="budget-name">${escapeHtml(b.name)}</div>
            <div class="budget-meta">
              ${formatNumber(Math.floor(bal))} · ${(b.transactions?.length || 0)} опер.
            </div>
          </div>
        </div>
        ${index === currentIndex ? '<span class="budget-check" aria-label="Текущий">✓</span>' : ''}
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
            try { createAutoBackup('before-delete-budget'); } catch (e) { console.warn('auto-backup:', e); }
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
        document.getElementById('budget-sheet-x')
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
            this.openForm('expense-form');
            document.querySelectorAll('.transaction-type-chips .chip-btn')
                .forEach(btn => btn.classList.remove('active'));
            document.querySelector('.transaction-type-chips .chip-btn[data-type="expense"]')
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
        document.getElementById('tx-sheet-x')?.addEventListener('click', () => this.closeModal('transaction-sheet'));

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
                    '.bottom-sheet:not(.hidden):not(#settings-page):not(#analytics-page):not(#accounts-page):not(#planner-page):not(#month-picker-sheet)'
                );
                if (!stillOpen) backdrop.classList.add('hidden');
                return;
            }

            // ── Обычные bottom-sheets — закрываем верхний по z-index ──
            const openSheets = Array.from(document.querySelectorAll(
                '.bottom-sheet:not(.hidden):not(#settings-page):not(#analytics-page):not(#accounts-page):not(#planner-page)'
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
                '.bottom-sheet:not(.hidden):not(#settings-page):not(#analytics-page):not(#accounts-page):not(#planner-page)'
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
        // «Одной суммой»: без позиций, сумма из поля
        if (form.dataset.split !== 'true') {
            const amountEl = document.getElementById('expense-amount');
            this.clearInlineError(amountEl);
            const single = parseFloat(String(amountEl?.value || '').replace(/[^0-9.]/g, '')) || 0;
            if (single <= 0) {
                this.showInlineError(document.querySelector('#expense-form .amount-row') || amountEl, 'Введите сумму');
                return;
            }
            this.budgetManager.addTransaction({
                id      : Date.now(),
                type    : 'expense',
                date    : form['expense-date'].value,
                category: hiddenCategoryInput.value,
                amount  : single,
                products: []
            });
            try { window.trackSafe?.('create-expense', { category: hiddenCategoryInput.value, amount: single, products_count: 0 }); } catch (e) { /* аналитика не должна ломать сохранение */ }
            form.reset();
            if (amountEl) amountEl.value = '';
            this.syncSaveState(form);
            this.closeModal('transaction-sheet');
            this.updateUI();
            refreshExportAnalytics(this.budgetManager);
            refreshUserProfile(this.budgetManager, true);
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
                this.showInlineError(nameInput, 'Введите название позиции');
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
            this.showInlineError(directionSelect, 'Выберите направление долга');
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
                const da = a.date || '', db = b.date || '';
                if (da !== db) return da < db ? -1 : 1;
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
            this.showInlineError(nameInput, 'Введите название накопления');
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
      <button type="button" class="delete-product" title="Удалить позицию">✖</button>
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
            ?.addEventListener('click', () => { container.remove(); this.updatePositionsSummary(); });

        this.enhanceProductRow(container);
    }

    // Шаговый счётчик количества и сумма строки. Поля (.product-name/.product-quantity/.product-price)
    // остаются теми же — submitExpense читает их как раньше.
    enhanceProductRow(item) {
        if (!item || item.dataset.enhanced) return;
        item.dataset.enhanced = 'true';
        const qty = item.querySelector('.product-quantity');
        const price = item.querySelector('.product-price');
        if (!qty || !price) return;

        qty.placeholder = '0';
        const stepper = document.createElement('div');
        stepper.className = 'qty-stepper';
        const mk = (cls, txt, label) => {
            const b = document.createElement('button');
            b.type = 'button'; b.className = cls; b.textContent = txt; b.setAttribute('aria-label', label);
            return b;
        };
        const dec = mk('qty-dec', '−', 'Меньше');
        const inc = mk('qty-inc', '+', 'Больше');
        qty.parentNode.insertBefore(stepper, qty);
        stepper.append(dec, qty, inc);

        const sep = document.createElement('span');
        sep.className = 'pos-sep';
        sep.textContent = '×';
        stepper.after(sep);

        const total = document.createElement('span');
        total.className = 'pos-total';
        price.after(total);

        const num = el => parseFloat(String(el.value).replace(/[^0-9.,]/g, '').replace(',', '.')) || 0;
        const refresh = () => {
            const t = num(qty) * num(price);
            total.textContent = t > 0 ? this.formatNumber(t) : '';
            this.updatePositionsSummary();
        };
        dec.addEventListener('click', () => {
            const v = Math.max(0, Math.floor(num(qty)) - 1);
            qty.value = v > 0 ? String(v) : '';
            refresh();
        });
        inc.addEventListener('click', () => {
            qty.value = String(Math.floor(num(qty)) + 1);
            refresh();
        });
        [qty, price].forEach(el => el.addEventListener('input', refresh));
        refresh();
    }

    updatePositionsSummary() {
        const list = document.getElementById('products-list');
        if (!list) return;
        let box = document.getElementById('positions-summary');
        if (!box) {
            box = document.createElement('div');
            box.id = 'positions-summary';
            box.className = 'positions-summary';
            list.after(box);
        }
        let count = 0, sum = 0;
        list.querySelectorAll('.product-item').forEach(row => {
            const q = parseFloat(String(row.querySelector('.product-quantity')?.value || '').replace(',', '.')) || 0;
            const p = parseFloat(String(row.querySelector('.product-price')?.value || '').replace(/[^0-9.]/g, '')) || 0;
            if (q > 0 && p > 0) { count++; sum += q * p; }
        });
        box.textContent = count ? `Позиций: ${count} · Итого: ${this.formatNumber(sum)}` : '';
        const expForm = document.getElementById('expense-form');
        if (expForm?.dataset.split === 'true') {
            const amt = document.getElementById('expense-amount');
            if (amt) amt.value = sum > 0 ? this.formatNumber(sum) : '';
            this.syncSaveState(expForm);
        }
    }


    hideAllForms() {
        document.querySelectorAll('.transaction-form').forEach(form => form.classList.add('hidden'));
    }

    openForm(formId) {
        document.getElementById(formId)?.classList.remove('hidden');
        try { this.renderQuickPicks(formId); } catch (e) { console.warn('quick picks:', e); }
        if (formId === 'expense-form') {
            document.querySelectorAll('#products-list .product-item').forEach(r => this.enhanceProductRow(r));
            this.updatePositionsSummary();
        }
        if (formId === 'debt-form') {
            const dir = document.getElementById('debt-direction');
            if (dir && !dir.value) dir.value = 'owed';
            this.syncDebtSegment();
        }
        this.syncBudgetCells();
        this.syncSaveState(document.getElementById(formId));
    }

    getCurrencyLabel() {
        const r = localStorage.getItem('region') || 'UZ';
        return { RU: 'руб', KZ: 'тенге', KG: 'сом' }[r] || 'сум';
    }

    syncBudgetCells() {
        const name = this.budgetManager.getCurrentBudget()?.name || 'BudgetIt';
        document.querySelectorAll('.budget-cell b').forEach(b => { b.textContent = name; });
    }

    // Кнопка «Сохранить» выглядит неактивной, пока сумма не введена (нажатие всё равно покажет подсказку)
    syncSaveState(form) {
        if (!form) return;
        const btn = form.querySelector('.add-btn');
        if (!btn) return;
        const type = form.id.replace('-form', '');
        const el = document.getElementById(`${type}-amount`);
        const val = parseFloat(String(el?.value || '').replace(/[^0-9.]/g, '')) || 0;
        btn.classList.toggle('is-disabled', !(val > 0));
    }

    syncDebtSegment() {
        const dir = document.getElementById('debt-direction');
        document.querySelectorAll('#debt-direction-seg button').forEach(b => {
            b.classList.toggle('active', !!dir && b.dataset.value === dir.value);
        });
    }

    // Сумма сверху с валютой, режим «Разбить на позиции» у трат, сегмент направления у долгов
    setupAddSheet() {
        const cur = this.getCurrencyLabel();
        ['expense', 'income', 'deposit', 'debt'].forEach(type => {
            const form = document.getElementById(`${type}-form`);
            const amt = document.getElementById(`${type}-amount`);
            if (!form || !amt) return;
            form.noValidate = true; // проверки делают submit-обработчики; скрытые required-поля не должны блокировать отправку
            if (amt.parentElement.classList.contains('amount-row')) return;
            const row = document.createElement('div');
            row.className = 'amount-row';
            amt.parentNode.insertBefore(row, amt);
            row.appendChild(amt);
            const c = document.createElement('span');
            c.className = 'amount-cur';
            c.textContent = cur;
            row.appendChild(c);
            const hint = document.createElement('div');
            hint.className = 'amount-hint';
            row.after(hint);
            amt.addEventListener('input', () => this.syncSaveState(form));
        });

        // позиции: по умолчанию «одной суммой»
        const exp = document.getElementById('expense-form');
        if (exp) {
            exp.dataset.split = 'false';
            const setSplit = on => {
                exp.dataset.split = on ? 'true' : 'false';
                const amt = document.getElementById('expense-amount');
                const hint = exp.querySelector('.amount-hint');
                if (amt) amt.readOnly = on;
                if (hint) hint.textContent = on ? 'Сумма считается по позициям' : '';
                if (on) {
                    const hasValue = !!document.querySelector('#products-list .product-price')?.value;
                    const first = document.querySelector('#products-list .product-item .product-price');
                    if (first && !hasValue && amt?.value) {
                        first.value = amt.value;
                        first.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                    this.updatePositionsSummary();
                } else if (amt && !amt.value) {
                    // вернулись к одной сумме — оставляем посчитанное по позициям
                    const sum = this._positionsSum();
                    if (sum > 0) amt.value = this.formatNumber(sum);
                }
                this.syncSaveState(exp);
            };
            document.getElementById('split-start')?.addEventListener('click', () => setSplit(true));
            document.getElementById('split-stop')?.addEventListener('click', () => {
                const sum = this._positionsSum();
                const amt = document.getElementById('expense-amount');
                if (amt && sum > 0) amt.value = this.formatNumber(sum);
                setSplit(false);
            });
        }

        document.querySelectorAll('#debt-direction-seg button').forEach(b => {
            b.addEventListener('click', () => {
                const dir = document.getElementById('debt-direction');
                if (!dir) return;
                dir.value = b.dataset.value;
                dir.dispatchEvent(new Event('change'));
                this.syncDebtSegment();
            });
        });
        this.syncBudgetCells();
    }

    _positionsSum() {
        let sum = 0;
        document.querySelectorAll('#products-list .product-item').forEach(row => {
            const q = parseFloat(String(row.querySelector('.product-quantity')?.value || '').replace(',', '.')) || 0;
            const p = parseFloat(String(row.querySelector('.product-price')?.value || '').replace(/[^0-9.]/g, '')) || 0;
            if (q > 0 && p > 0) sum += q * p;
        });
        return sum;
    }

    // Поле-кнопка даты (шторка выбора) для форм редактирования; нативный input остаётся источником значения
    attachDateField(dateInput) {
        if (!dateInput) return;
        let field = dateInput.nextElementSibling?.classList?.contains('date-field') ? dateInput.nextElementSibling : null;
        const sync = () => {
            if (field) field.innerHTML = `<small>Дата</small><b>${formatDateLabel(dateInput.value)}</b><span class="date-field-arrow">▾</span>`;
        };
        if (!field) {
            field = document.createElement('button');
            field.type = 'button';
            field.className = 'date-field';
            dateInput.insertAdjacentElement('afterend', field);
            field.addEventListener('click', () => openDateSheet({
                value: dateInput.value,
                onPick: iso => {
                    dateInput.value = iso;
                    dateInput.dispatchEvent(new Event('input', { bubbles: true }));
                    dateInput.dispatchEvent(new Event('change', { bubbles: true }));
                    sync();
                }
            }));
            dateInput.addEventListener('change', sync);
            dateInput.tabIndex = -1;
        }
        dateInput._syncDateField = sync;
        sync();
    }

    // Быстрые чипы в форме новой операции: «Сегодня / Вчера» и самые частые категории.
    // Только добавляют удобство — значения проходят через те же поля и обработчики, что и раньше.
    renderQuickPicks(formId) {
        const form = document.getElementById(formId);
        if (!form) return;
        const type = formId.replace('-form', '');

        // дата: поле-кнопка открывает шторку; нативный <input type=date> остаётся источником значения
        const dateInput = document.getElementById(`${type}-date`);
        if (dateInput) {
            let field = form.querySelector('.date-field');
            const sync = () => {
                if (field) field.innerHTML = `<small>Дата</small><b>${formatDateLabel(dateInput.value)}</b><span class="date-field-arrow">▾</span>`;
            };
            if (!field) {
                field = document.createElement('button');
                field.type = 'button';
                field.className = 'date-field';
                const row = document.createElement('div');
                row.className = 'dt-row';
                dateInput.insertAdjacentElement('afterend', row);
                row.appendChild(field);

                field.addEventListener('click', () => openDateSheet({
                    value: dateInput.value,
                    onPick: iso => {
                        dateInput.value = iso;
                        dateInput.dispatchEvent(new Event('input', { bubbles: true }));
                        dateInput.dispatchEvent(new Event('change', { bubbles: true }));
                        sync();
                    }
                }));
                dateInput.addEventListener('change', sync);
                dateInput.tabIndex = -1;
            }
            sync();
        }

        // частые категории (только для поступлений и трат)
        if (type !== 'income' && type !== 'expense') return;
        const select = document.getElementById(`${type}-category`);
        if (!select) return;
        const top = [...this.getCategoryUsageStats(type).entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([name]) => name)
            .filter(name => [...select.options].some(o => o.value === name))
            .slice(0, 12);

        let box = form.querySelector('.quick-cats');
        if (!box) {
            box = document.createElement('div');
            box.className = 'quick-picks quick-cats';
            const anchor = form.querySelector(`[data-select-id="${select.id}"]`) || select;
            anchor.insertAdjacentElement('afterend', box);
        }
        // категория предвыбрана (как в макете): самая частая, иначе первая из списка
        if (!select.value) {
            const first = top[0] || [...select.options].find(o => o.value)?.value;
            if (first) {
                const o = [...select.options].find(x => x.value === first);
                this.currentSelectForCategory = select;
                this.selectCategory(first, (o?.textContent || first).trim());
            }
        }
        box.innerHTML = '';
        const chipValues = [...top];
        if (select.value && !chipValues.includes(select.value)) chipValues.unshift(select.value);
        chipValues.slice(0, 12).forEach(name => {
            const opt = [...select.options].find(o => o.value === name);
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'chip-btn quick-chip';
            b.dataset.value = name;
            b.textContent = (opt?.textContent || name).trim();
            b.addEventListener('click', () => {
                this.currentSelectForCategory = select;
                this.selectCategory(name, b.textContent);
            });
            box.appendChild(b);
        });
        box.hidden = chipValues.length === 0;
        const markActive = () => box.querySelectorAll('.quick-chip')
            .forEach(c => c.classList.toggle('active', c.dataset.value === select.value));
        markActive();
        if (!select.dataset.quickBound) {
            select.dataset.quickBound = '1';
            select.addEventListener('change', () => {
                form.querySelectorAll('.quick-cats .quick-chip')
                    .forEach(c => c.classList.toggle('active', c.dataset.value === select.value));
            });
        }
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
                placeholder.textContent = '🔄 Выберите направление';
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
        this.applyCustomCategories();
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

        const customType = isIncomeSelect ? 'income' : (isExpenseSelect ? 'expense' : null);
        const customSet = new Set(customType ? (this.budgetManager.customCategories?.[customType] || []) : []);
        const itemHtml = (value, text) => customSet.has(value)
            ? `<li class="category-item is-custom" data-value="${escapeHtml(value)}"><span>${escapeHtml(text)}</span><button type="button" class="cc-del" aria-label="Удалить свою категорию">✕</button></li>`
            : `<li class="category-item" data-value="${escapeHtml(value)}">
                ${escapeHtml(text)}
            </li>`;

        const renderPlainList = (items) => {
            categoryList.innerHTML = items.map(opt => itemHtml(opt.value, opt.text)).join('');
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
                        .map(opt => itemHtml(opt.value, opt.text))
                        .join('');

                    const isOpen = child.dataset.open === 'true';
                    html += `
                    <div class="optgroup-wrapper">
                        <div class="category-group-label dropdown-toggle">${isOpen ? '▼' : '▶'} ${escapeHtml(child.label)}</div>
                        <div class="group-options${isOpen ? '' : ' hidden'}">${optionsHtml}</div>
                    </div>
                `;
                } else if (child.tagName === 'OPTION' && child.value) {
                    html += itemHtml(child.value, child.text);
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

        this._renderCustomCategoryAdder(categorySheet, categoryList, currentSelect, customType);

        if (!categoryList.dataset.boundDelegation) {
            categoryList.addEventListener('click', (e) => {
                const toggle = e.target.closest('.dropdown-toggle');
                if (toggle) {
                    const optionsContainer = toggle.nextElementSibling;
                    const hidden = optionsContainer.classList.toggle('hidden');
                    toggle.textContent = `${hidden ? '▶' : '▼'} ${toggle.textContent.replace(/^[▶▼]\s*/, '')}`;
                    return;
                }

                const del = e.target.closest('.cc-del');
                if (del) {
                    e.stopPropagation();
                    const li = del.closest('.category-item');
                    if (!li) return;
                    if (!del.classList.contains('confirm')) {
                        // двойное нажатие: первое — «Удалить?», второе — удаление
                        del.classList.add('confirm');
                        del.textContent = 'Удалить?';
                        setTimeout(() => { del.classList.remove('confirm'); del.textContent = '✕'; }, 2500);
                        return;
                    }
                    this.removeCustomCategoryValue(li.dataset.value);
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

    // ── Свои категории ─────────────────────────────────────────────
    // Добавляют в селекты группу «✨ Свои»; значение — строка «эмодзи название», как у встроенных.
    applyCustomCategories() {
        const cc = this.budgetManager.customCategories || { income: [], expense: [] };
        document.querySelectorAll('select[id$="-category"]').forEach(select => {
            const type = select.id.includes('income') ? 'income' : (select.id.includes('expense') ? 'expense' : null);
            if (!type) return;
            const keep = select.value;
            select.querySelectorAll('optgroup[data-custom]').forEach(g => g.remove());
            const list = cc[type] || [];
            if (!list.length) return;
            const group = document.createElement('optgroup');
            group.label = '✨ Свои';
            group.dataset.custom = 'true';
            group.dataset.open = 'true';
            list.forEach(v => {
                const o = document.createElement('option');
                o.value = v;
                o.textContent = v;
                group.appendChild(o);
            });
            const first = select.querySelector('option[value=""]');
            if (first && first.nextSibling) select.insertBefore(group, first.nextSibling);
            else select.appendChild(group);
            if (keep) select.value = keep;
        });
    }

    _renderCustomCategoryAdder(sheet, list, select, type) {
        sheet.querySelector('#category-add-custom')?.remove();
        if (!type) return;
        const box = document.createElement('div');
        box.id = 'category-add-custom';
        box.className = 'category-add-custom';
        box.innerHTML = '<button type="button" class="cc-open">＋ Своя категория</button>';
        const search = sheet.querySelector('#category-search');
        sheet.insertBefore(box, search || list);

        box.querySelector('.cc-open').addEventListener('click', () => {
            box.innerHTML = `
                <div class="cc-form">
                    <input class="cc-emoji" type="text" inputmode="text" maxlength="4" placeholder="🏷️" aria-label="Эмодзи">
                    <input class="cc-name" type="text" maxlength="20" placeholder="Название" aria-label="Название категории">
                    <button type="button" class="cc-save">Добавить</button>
                </div>
                <div class="cc-error" role="alert"></div>`;
            const err = box.querySelector('.cc-error');
            const nameEl = box.querySelector('.cc-name');
            nameEl.focus();
            const save = () => {
                const existing = Array.from(select.querySelectorAll('option')).map(o => o.value).filter(Boolean);
                const res = addCustomCategory(this.budgetManager.customCategories, type,
                    box.querySelector('.cc-emoji').value, nameEl.value, existing);
                if (res.error) { err.textContent = res.error; return; }
                this.budgetManager.customCategories = res.categories;
                this.budgetManager.saveToStorage();
                this.applyCustomCategories();
                if (typeof window.trackSafe === 'function') trackSafe('custom-category-add', { type });
                this.currentSelectForCategory = select;
                this.selectCategory(res.value, res.value);
            };
            box.querySelector('.cc-save').addEventListener('click', save);
            nameEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
        });
    }

    removeCustomCategoryValue(value) {
        const cc = this.budgetManager.customCategories;
        const type = (cc?.income || []).includes(value) ? 'income' : 'expense';
        this.budgetManager.customCategories = removeCustomCategory(cc, type, value);
        this.budgetManager.saveToStorage();
        this.applyCustomCategories();
        const select = this.currentSelectForCategory;
        if (select) this.openCategorySheet(null, select); // перерисовать список
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

                const nowD = new Date();
                const isFuture = this.yearFilter > nowD.getFullYear() ||
                    (this.yearFilter === nowD.getFullYear() && i > nowD.getMonth() + 1);
                let spent = 0, earned = 0;
                try {
                    const t = this.budgetManager.calculateTotals(key, this.yearFilter);
                    spent = Number(t?.monthlyExpense) || 0;
                    earned = Number(t?.monthlyIncome) || 0;
                } catch (_) {}
                // доход месяца без переноса остатка: переносимый остаток в monthlyIncome не входит (carryOver отдельно)
                const compact = v => v >= 1e6 ? `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace('.0', '')}M`
                    : v >= 1e3 ? `${Math.round(v / 1e3)}K` : String(Math.round(v));
                div.innerHTML = `<span class="mi-name">${this.monthNames[key] || key}</span>${earned > 0 ? `<span class="mi-inc">+${compact(earned)}</span>` : ''}${spent > 0 ? `<span class="mi-sum">−${compact(spent)}</span>` : ''}${spent <= 0 && earned <= 0 ? '<span class="mi-none">—</span>' : ''}`;
                if (isFuture) div.classList.add('is-future');
                else if (spent <= 0 && earned <= 0) div.classList.add('is-empty');

                div.addEventListener('click', () => {
                    if (isFuture) return;
                    this.monthFilter = key;
                    this.activeYearForMonthFilter = this.yearFilter;

                    this.updateMonthPickerButton();

                    sheet.classList.remove('show');
                    sheet.classList.add('hidden');
                    // Проверяем по .show (не по .hidden) — т.к. CSS делает hidden-sheets display:block
                    const anySheetOpen = document.querySelector(
                        '.bottom-sheet.show, ' +
                        '.bottom-sheet:not(.hidden):not(#settings-page):not(#analytics-page):not(#accounts-page):not(#planner-page):not(#month-picker-sheet)'
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

        const closeSheet = () => {
            sheet.classList.remove('show');
            sheet.classList.add('hidden');
            const open = document.querySelector('.bottom-sheet.show, .bottom-sheet:not(.hidden):not(#settings-page):not(#analytics-page):not(#accounts-page):not(#planner-page):not(#month-picker-sheet)');
            if (!open && backdrop) backdrop.classList.add('hidden');
        };
        const xBtn = document.getElementById('month-sheet-x');
        if (xBtn) xBtn.onclick = closeSheet;

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
                    '.bottom-sheet:not(.hidden):not(#settings-page):not(#analytics-page):not(#accounts-page):not(#planner-page):not(#month-picker-sheet)'
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
                    '.bottom-sheet:not(.hidden):not(#settings-page):not(#analytics-page):not(#accounts-page):not(#planner-page):not(#month-picker-sheet)'
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