// BudgetManager.js — финальная версия с planner support
export class BudgetManager {
    constructor(storageManager = null) {
        this.storageManager = storageManager;
        this.loadFromStorage();
    }

    /* ───────────── 1. Загрузка ───────────── */
    loadFromStorage() {
        const rawBudgets = localStorage.getItem('budgets');
        const rawIdx = localStorage.getItem('currentBudgetIndex');

        let parsed = [];
        try {
            parsed = rawBudgets ? JSON.parse(rawBudgets) : [];
        } catch {
            parsed = [];
        }

        // Поддержка расширенного бэкапа:
        // { budgets: [], userId, currentBudgetIndex, productNames, planners }
        if (
            !Array.isArray(parsed) &&
            parsed &&
            typeof parsed === 'object' &&
            Array.isArray(parsed.budgets)
        ) {
            try { localStorage.setItem('budgets', JSON.stringify(parsed.budgets)); } catch {}

            if (Number.isInteger(parsed.currentBudgetIndex)) {
                try { localStorage.setItem('currentBudgetIndex', String(parsed.currentBudgetIndex)); } catch {}
            }

            if (Array.isArray(parsed.productNames)) {
                try { localStorage.setItem('productNames', JSON.stringify(parsed.productNames)); } catch {}
            }

            if (Array.isArray(parsed.planners)) {
                try { localStorage.setItem('planners', JSON.stringify(parsed.planners)); } catch {}
            }

            if (parsed.userId) {
                try { localStorage.setItem('budgetit-user-id', parsed.userId); } catch {}
            }

            parsed = parsed.budgets;
        }

        this.budgets = Array.isArray(parsed) ? parsed : [];
        this.currentBudgetIndex = rawIdx ? parseInt(rawIdx, 10) : 0;

        let pn = [];
        try {
            pn = JSON.parse(localStorage.getItem('productNames') || '[]') || [];
        } catch {
            pn = [];
        }
        this.productNames = Array.isArray(pn) ? pn : [];

        let planners = [];
        try {
            planners = JSON.parse(localStorage.getItem('planners') || '[]') || [];
        } catch {
            planners = [];
        }
        this.planners = Array.isArray(planners) ? planners : [];

        let needsSave = false;

        this.budgets.forEach(budget => {
            budget.transactions?.forEach(t => {
                if (t.date && !/^\d{4}-\d{2}-\d{2}$/.test(t.date)) {
                    const d = new Date(t.date);
                    if (!Number.isNaN(d.getTime())) {
                        t.date = d.toISOString().slice(0, 10);
                        needsSave = true;
                    }
                }

                if (t.type === 'deposit') {
                    if (t.status?.includes('Уже лежало')) t.status = '💾 Уже лежало';
                    if (t.status?.includes('Под подушкой')) t.status = '🛏 Под подушкой';
                }

                if (t.type === 'debt') {
                    if (t.initialAmount === undefined) t.initialAmount = t.amount ?? 0;
                    if (t.remainingAmount === undefined) t.remainingAmount = t.initialAmount;
                    if (!Array.isArray(t.payments)) t.payments = [];
                }
            });
        });

        if (needsSave) this.saveToStorage();
    }

    /* ───────────── 2. Сохранение ───────────── */
    saveToStorage() {
        const snapshot = {
            budgets: this.budgets,
            currentBudgetIndex: this.currentBudgetIndex,
            productNames: this.productNames,
            planners: this.planners
        };

        if (this.storageManager && typeof this.storageManager.saveState === 'function') {
            this.storageManager.saveState(snapshot).catch(err => {
                console.warn('[BudgetManager] Failed to save via StorageManager', err);
            });
        } else {
            try { localStorage.setItem('budgets', JSON.stringify(this.budgets)); } catch {}
            try { localStorage.setItem('currentBudgetIndex', String(this.currentBudgetIndex)); } catch {}
            try { localStorage.setItem('productNames', JSON.stringify(this.productNames)); } catch {}
            try { localStorage.setItem('planners', JSON.stringify(this.planners)); } catch {}
        }
    }

    /* ───────────── 3. Операции с бюджетами ───────────── */
    switchBudget(idx) {
        this.currentBudgetIndex = Math.max(
            0,
            Math.min(idx, Math.max(0, this.budgets.length - 1))
        );
        this.saveToStorage();
    }

    createBudget(name) {
        if (!this.validateBudgetName(name)) return false;

        this.budgets.push({
            id: `budget_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name,
            transactions: []
        });

        this.currentBudgetIndex = this.budgets.length - 1;
        this.saveToStorage();
        return true;
    }

    deleteBudget(idx) {
        const budgetToDelete = this.budgets[idx];
        this.budgets.splice(idx, 1);

        if (budgetToDelete?.id && Array.isArray(this.planners)) {
            this.planners = this.planners.filter(p => p.budgetId !== budgetToDelete.id);
        }

        if (this.budgets.length === 0) {
            this.currentBudgetIndex = 0;
            try { localStorage.removeItem('budgets'); } catch {}
            try { localStorage.removeItem('currentBudgetIndex'); } catch {}
        } else if (this.currentBudgetIndex >= this.budgets.length) {
            this.currentBudgetIndex = this.budgets.length - 1;
        }

        this.saveToStorage();
        return true;
    }

    /* ───────────── 4. Транзакции ───────────── */
    addTransaction(tx) {
        const budget = this.getCurrentBudget();
        if (!budget) return;

        if (tx.date) {
            const d = new Date(tx.date);
            if (!Number.isNaN(d.getTime())) {
                tx.date = d.toISOString().slice(0, 10);
            }
        }

        budget.transactions ??= [];
        budget.transactions.push(tx);

        tx.products?.forEach(p => {
            if (p?.name && !this.productNames.includes(p.name)) {
                this.productNames.push(p.name);
            }
        });

        this.saveToStorage();
    }

    deleteTransaction(id) {
        const budget = this.getCurrentBudget();
        if (!budget?.transactions) return;

        const idx = budget.transactions.findIndex(t => t.id === id);
        if (idx !== -1) {
            budget.transactions.splice(idx, 1);
            this.saveToStorage();
        }
    }

    updateTransaction(id, updatedData) {
        const budget = this.getCurrentBudget();
        if (!budget || !budget.transactions) return false;

        const idx = budget.transactions.findIndex(t => t.id === id);
        if (idx === -1) return false;

        const tx = budget.transactions[idx];

        tx.date = updatedData.date ?? tx.date;
        tx.category = updatedData.category ?? tx.category;
        tx.amount = updatedData.amount ?? tx.amount;

        if (tx.type === 'expense' && updatedData.products) {
            tx.products = updatedData.products;
            tx.amount = updatedData.products.reduce(
                (s, p) => s + (Number(p.quantity) || 0) * (Number(p.price) || 0),
                0
            );
        }

        this.saveToStorage();
        return true;
    }

    /* ───────────── 5. Погашение долгов ───────────── */
    markDebtPayment(id, amt) {
        const d = this.getCurrentBudget()?.transactions.find(
            t => t.id === id && t.type === 'debt'
        );
        if (!d || Number.isNaN(amt) || amt <= 0) return;

        d.initialAmount ??= d.amount ?? 0;
        d.remainingAmount ??= d.initialAmount;
        d.payments ??= [];

        d.payments.push({ date: new Date().toISOString(), amount: amt });
        d.remainingAmount = Math.max(0, d.remainingAmount - amt);

        if (d.remainingAmount === 0) {
            d.paid = true;
            d.paidDate = new Date().toISOString();
        }

        this.saveToStorage();
    }

    /* ───────────── 6. Валидация имени ───────────── */
    validateBudgetName(name) {
        const n = (name ?? '').trim();
        if (!n) return false;

        try {
            return /^[\p{L}\p{N}\p{Emoji_Presentation}\s-]+$/u.test(n);
        } catch {
            return /^[\p{L}\p{N}\s-]+$/u.test(n);
        }
    }

    /* ───────────── 7. Статистика ───────────── */
    getTotalTransactions() {
        return this.budgets.reduce((s, b) => s + (b.transactions?.length || 0), 0);
    }

    /* ───────────── 8. Главный расчёт ───────────── */
    calculateTotals(monthFilter = 'all', yearFilter = 'all') {
        const budget = this.getCurrentBudget();

        const emptyTotals = {
            overallBudget: 0,
            monthlyIncome: 0,
            monthlyExpense: 0,
            depositBalance: 0,
            totalDebt: 0,
            carryOver: 0,
            openingBalance: 0,
            closingBalance: 0,
            periodMeta: {
                mode: 'empty',
                monthsCount: 0,
                from: null,
                to: null,
                selectedMonth: null
            }
        };

        if (!budget) return emptyTotals;

        const txs = Array.isArray(budget.transactions) ? budget.transactions : [];

        const toNumber = value => {
            const n = Number(value);
            return Number.isFinite(n) ? n : 0;
        };

        const getDateInfo = dateStr => {
            if (!dateStr) return null;

            const raw = String(dateStr);
            const match = raw.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);

            if (!match) return null;

            const year = Number(match[1]);
            const month = Number(match[2]);
            const day = Number(match[3] || 1);

            if (!year || !month || month < 1 || month > 12) return null;

            return {
                year,
                month,
                day,
                monthKey: `${year}-${String(month).padStart(2, '0')}`,
                dateKey: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            };
        };

        const parseTarget = () => {
            const rawMonth = monthFilter === 'all' ? null : Number.parseInt(monthFilter, 10);
            const rawYear =
                yearFilter === undefined ||
                yearFilter === null ||
                yearFilter === 'all'
                    ? null
                    : Number.parseInt(yearFilter, 10);

            const month =
                Number.isInteger(rawMonth) && rawMonth >= 1 && rawMonth <= 12
                    ? rawMonth
                    : null;

            const year =
                Number.isInteger(rawYear) && rawYear > 1900
                    ? rawYear
                    : null;

            return {
                month,
                year,
                isAll: !month && !year,
                isSingleMonth: !!month && !!year,
                monthKey: month && year
                    ? `${year}-${String(month).padStart(2, '0')}`
                    : null
            };
        };

        const target = parseTarget();

        const compareMonthKey = (a, b) => String(a).localeCompare(String(b));

        const isBeforeMonth = (monthKey, targetMonthKey) =>
            compareMonthKey(monthKey, targetMonthKey) < 0;

        const isBeforeOrSameMonth = (monthKey, targetMonthKey) =>
            compareMonthKey(monthKey, targetMonthKey) <= 0;

        const shouldIncludeInVisiblePeriod = monthKey => {
            if (!monthKey) return false;

            if (target.isAll) return true;

            if (target.isSingleMonth) {
                return monthKey === target.monthKey;
            }

            // calculateTotals('all', 2026)
            if (target.year && !target.month) {
                return monthKey.startsWith(`${target.year}-`);
            }

            // calculateTotals(4, 'all') — все апрели разных лет
            if (!target.year && target.month) {
                return monthKey.slice(5, 7) === String(target.month).padStart(2, '0');
            }

            return false;
        };

        const shouldIncludeUntilPeriodEnd = monthKey => {
            if (!monthKey) return false;

            if (target.isAll) return true;

            if (target.isSingleMonth) {
                return isBeforeOrSameMonth(monthKey, target.monthKey);
            }

            if (target.year && !target.month) {
                return compareMonthKey(monthKey, `${target.year}-12`) <= 0;
            }

            return shouldIncludeInVisiblePeriod(monthKey);
        };

        const createMonthBucket = () => ({
            income: 0,
            expense: 0,

            baseIncome: 0,
            baseExpense: 0,

            debtIncome: 0,
            debtExpense: 0,

            depositTopup: 0,
            depositWithdraw: 0
        });

        const monthMap = new Map();
        const touchedMonths = new Set();

        const getBucket = monthKey => {
            if (!monthKey) return null;

            if (!monthMap.has(monthKey)) {
                monthMap.set(monthKey, createMonthBucket());
            }

            touchedMonths.add(monthKey);
            return monthMap.get(monthKey);
        };

        const touchMonthByDate = dateStr => {
            const info = getDateInfo(dateStr);
            if (info?.monthKey) touchedMonths.add(info.monthKey);
            return info;
        };

        // 1. Обычные доходы, расходы и движения вкладов.
        txs.forEach(tx => {
            const info = touchMonthByDate(tx.date);
            if (!info?.monthKey) return;

            const amount = toNumber(tx.amount);
            if (!amount) return;

            const bucket = getBucket(info.monthKey);
            if (!bucket) return;

            if (tx.type === 'income') {
                bucket.income += amount;
                bucket.baseIncome += amount;
                return;
            }

            if (tx.type === 'expense') {
                bucket.expense += amount;
                bucket.baseExpense += amount;
                return;
            }

            if (tx.type === 'deposit') {
                const isWithdraw = String(tx.status || '').trim() === '➖ Снятие';

                if (isWithdraw) {
                    // Снятие вклада возвращает деньги в бюджет.
                    bucket.income += amount;
                    bucket.depositWithdraw += amount;
                } else {
                    // Создание/пополнение вклада уводит деньги из бюджета.
                    bucket.expense += amount;
                    bucket.depositTopup += amount;
                }
            }
        });

        // 2. Долги.
        txs.forEach(tx => {
            if (tx.type !== 'debt') return;

            const createdInfo = touchMonthByDate(tx.date);
            const init = toNumber(tx.initialAmount ?? tx.amount);

            if (createdInfo?.monthKey && init > 0) {
                const bucket = getBucket(createdInfo.monthKey);

                if (bucket) {
                    if (tx.direction === 'owe') {
                        // Я должен: получил деньги, значит это приток в бюджет.
                        bucket.income += init;
                        bucket.debtIncome += init;
                    } else {
                        // Мне должны: я отдал деньги, значит это расход бюджета.
                        bucket.expense += init;
                        bucket.debtExpense += init;
                    }
                }
            }

            const payments = Array.isArray(tx.payments) ? tx.payments : [];

            payments.forEach(payment => {
                const paymentInfo = touchMonthByDate(payment.date);
                const paymentAmount = toNumber(payment.amount);

                if (!paymentInfo?.monthKey || paymentAmount <= 0) return;

                const bucket = getBucket(paymentInfo.monthKey);
                if (!bucket) return;

                if (tx.direction === 'owe') {
                    // Я возвращаю свой долг — это расход.
                    bucket.expense += paymentAmount;
                    bucket.debtExpense += paymentAmount;
                } else {
                    // Мне вернули долг — это доход.
                    bucket.income += paymentAmount;
                    bucket.debtIncome += paymentAmount;
                }
            });
        });

        if (target.isSingleMonth) {
            touchedMonths.add(target.monthKey);
        }

        const sortedMonths = [...touchedMonths].sort(compareMonthKey);

        const getMonthNet = monthKey => {
            const bucket = monthMap.get(monthKey) || createMonthBucket();
            return bucket.income - bucket.expense;
        };

        // 3. Перенос остатка из месяца в месяц.
        // Если месяц закрылся в минус — следующий месяц начинается с 0.
        let rollingBalance = 0;
        let openingBalance = 0;
        let selectedMonthNet = 0;
        let selectedClosingBalance = 0;

        if (target.isSingleMonth) {
            sortedMonths
                .filter(monthKey => isBeforeMonth(monthKey, target.monthKey))
                .forEach(monthKey => {
                    const rawClosing = rollingBalance + getMonthNet(monthKey);
                    rollingBalance = Math.max(0, rawClosing);
                });

            openingBalance = rollingBalance;
            selectedMonthNet = getMonthNet(target.monthKey);
            selectedClosingBalance = openingBalance + selectedMonthNet;
        }

        // 4. Доходы и расходы видимого периода.
        let visibleIncome = 0;
        let visibleExpense = 0;

        sortedMonths.forEach(monthKey => {
            if (!shouldIncludeInVisiblePeriod(monthKey)) return;

            const bucket = monthMap.get(monthKey);
            if (!bucket) return;

            visibleIncome += bucket.income;
            visibleExpense += bucket.expense;
        });

        // 5. Баланс вкладов на конец выбранного периода.
        let depositBalance = 0;

        txs.forEach(tx => {
            if (tx.type !== 'deposit') return;

            const info = getDateInfo(tx.date);
            if (!info?.monthKey) return;
            if (!shouldIncludeUntilPeriodEnd(info.monthKey)) return;

            const amount = toNumber(tx.amount);
            if (!amount) return;

            const isWithdraw = String(tx.status || '').trim() === '➖ Снятие';
            depositBalance += isWithdraw ? -amount : amount;
        });

        depositBalance = Math.max(0, depositBalance);

        // 6. Остаток долгов на конец выбранного периода.
        let totalDebt = 0;

        txs.forEach(tx => {
            if (tx.type !== 'debt') return;

            const createdInfo = getDateInfo(tx.date);
            if (!createdInfo?.monthKey) return;
            if (!shouldIncludeUntilPeriodEnd(createdInfo.monthKey)) return;

            const init = toNumber(tx.initialAmount ?? tx.amount);
            if (init <= 0) return;

            const paidUntilPeriodEnd = (Array.isArray(tx.payments) ? tx.payments : [])
                .filter(payment => {
                    const paymentInfo = getDateInfo(payment.date);
                    return paymentInfo?.monthKey && shouldIncludeUntilPeriodEnd(paymentInfo.monthKey);
                })
                .reduce((sum, payment) => sum + toNumber(payment.amount), 0);

            const remaining = Math.max(0, init - paidUntilPeriodEnd);
            totalDebt += remaining;
        });

        // 7. Бюджет Акулки.
        let overallBudget = 0;
        let carryOver = 0;
        let closingBalance = 0;

        if (target.isSingleMonth) {
            // UIManager добавляет carryOver к overallBudget.
            overallBudget = selectedMonthNet;
            carryOver = openingBalance;
            closingBalance = selectedClosingBalance;
        } else {
            // Все месяцы / 1 год:
            // считаем доступный бюджет как накопительный остаток.
            // Для режима 1 год останавливаемся на декабре выбранного года,
            // но стартовый перенос из прошлых лет сохраняем.
            let allRollingBalance = 0;
            const endMonthKey = target.year && !target.month ? `${target.year}-12` : null;

            sortedMonths
                .filter(monthKey => !endMonthKey || compareMonthKey(monthKey, endMonthKey) <= 0)
                .forEach(monthKey => {
                    const rawClosing = allRollingBalance + getMonthNet(monthKey);
                    allRollingBalance = Math.max(0, rawClosing);
                });

            overallBudget = allRollingBalance;
            carryOver = 0;
            openingBalance = 0;
            closingBalance = allRollingBalance;
        }

        const visibleMonths = sortedMonths.filter(shouldIncludeInVisiblePeriod);

        return {
            overallBudget,
            monthlyIncome: visibleIncome,
            monthlyExpense: visibleExpense,
            depositBalance,
            totalDebt,
            carryOver,

            openingBalance,
            closingBalance,
            periodMeta: {
                mode: target.isSingleMonth ? 'month' : 'all',
                monthsCount: visibleMonths.length,
                from: visibleMonths[0] || null,
                to: visibleMonths[visibleMonths.length - 1] || null,
                selectedMonth: target.monthKey || null
            }
        };
    }


    /* ───────────── 8.1. Данные для мини-графиков summary ───────────── */
    getSummaryTrend(mode = 'month', yearFilter = 'all', monthFilter = 'all') {
        const budget = this.getCurrentBudget();
        const txs = Array.isArray(budget?.transactions) ? budget.transactions : [];

        const toNumber = value => {
            const n = Number(value);
            return Number.isFinite(n) ? n : 0;
        };

        const getDateInfo = dateStr => {
            if (!dateStr) return null;

            const raw = String(dateStr);
            const match = raw.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
            if (!match) return null;

            const year = Number(match[1]);
            const month = Number(match[2]);

            if (!year || !month || month < 1 || month > 12) return null;

            return {
                year,
                month,
                monthKey: `${year}-${String(month).padStart(2, '0')}`
            };
        };

        const monthLabel = monthKey => {
            const [y, m] = String(monthKey).split('-');
            return `${m}.${String(y).slice(2)}`;
        };

        const addMonths = (monthKey, delta) => {
            const [year, month] = String(monthKey).split('-').map(Number);
            const d = new Date(year, month - 1 + delta, 1);

            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        };

        const getAllHistoryMonths = () => {
            const set = new Set();

            txs.forEach(tx => {
                const info = getDateInfo(tx.date);
                if (info?.monthKey) set.add(info.monthKey);

                if (tx.type === 'debt' && Array.isArray(tx.payments)) {
                    tx.payments.forEach(payment => {
                        const paymentInfo = getDateInfo(payment.date);
                        if (paymentInfo?.monthKey) set.add(paymentInfo.monthKey);
                    });
                }
            });

            return [...set].sort((a, b) => a.localeCompare(b));
        };

        const getMonthsForMode = () => {
            const year = Number.parseInt(yearFilter, 10);
            const month = Number.parseInt(monthFilter, 10);

            if (mode === 'year' && Number.isInteger(year)) {
                return Array.from({ length: 12 }, (_, i) => {
                    return `${year}-${String(i + 1).padStart(2, '0')}`;
                });
            }

            if (mode === 'all') {
                return getAllHistoryMonths();
            }

            if (
                mode === 'month' &&
                Number.isInteger(year) &&
                Number.isInteger(month) &&
                month >= 1 &&
                month <= 12
            ) {
                const endKey = `${year}-${String(month).padStart(2, '0')}`;
                return Array.from({ length: 6 }, (_, i) => addMonths(endKey, i - 5));
            }

            return getAllHistoryMonths().slice(-6);
        };

        const visibleMonths = getMonthsForMode();

        const createBucket = monthKey => ({
            monthKey,
            label: monthLabel(monthKey),

            income: 0,
            expense: 0,

            depositTopup: 0,
            depositWithdraw: 0,
            depositBalance: 0,

            debtCreated: 0,
            debtPaid: 0,
            debtBalance: 0,

            budgetNet: 0,
            budgetClosing: 0
        });

        const buckets = new Map();
        visibleMonths.forEach(monthKey => buckets.set(monthKey, createBucket(monthKey)));

        const ensureBucket = monthKey => {
            if (!buckets.has(monthKey)) buckets.set(monthKey, createBucket(monthKey));
            return buckets.get(monthKey);
        };

        // Доходы / расходы / вклады / создание долгов.
        txs.forEach(tx => {
            const info = getDateInfo(tx.date);
            if (!info?.monthKey) return;

            const amount = toNumber(tx.amount ?? tx.initialAmount);
            if (!amount) return;

            const bucket = ensureBucket(info.monthKey);

            if (tx.type === 'income') {
                bucket.income += amount;
                return;
            }

            if (tx.type === 'expense') {
                bucket.expense += amount;
                return;
            }

            if (tx.type === 'deposit') {
                const isWithdraw = String(tx.status || '').trim() === '➖ Снятие';

                if (isWithdraw) {
                    bucket.income += amount;
                    bucket.depositWithdraw += amount;
                } else {
                    bucket.expense += amount;
                    bucket.depositTopup += amount;
                }

                return;
            }

            if (tx.type === 'debt') {
                const init = toNumber(tx.initialAmount ?? tx.amount);
                if (init <= 0) return;

                if (tx.direction === 'owe') {
                    bucket.income += init;
                } else {
                    bucket.expense += init;
                }

                bucket.debtCreated += init;
            }
        });

        // Платежи по долгам.
        txs.forEach(tx => {
            if (tx.type !== 'debt') return;

            const payments = Array.isArray(tx.payments) ? tx.payments : [];

            payments.forEach(payment => {
                const info = getDateInfo(payment.date);
                if (!info?.monthKey) return;

                const amount = toNumber(payment.amount);
                if (amount <= 0) return;

                const bucket = ensureBucket(info.monthKey);

                if (tx.direction === 'owe') {
                    bucket.expense += amount;
                } else {
                    bucket.income += amount;
                }

                bucket.debtPaid += amount;
            });
        });

        const allKnownMonths = [...buckets.keys()].sort((a, b) => a.localeCompare(b));

        // Накопительный баланс бюджета:
        // если месяц ушёл в минус, следующий месяц начинается с 0.
        let rollingBudget = 0;
        allKnownMonths.forEach(monthKey => {
            const bucket = buckets.get(monthKey);
            if (!bucket) return;

            bucket.budgetNet = bucket.income - bucket.expense;

            const rawClosing = rollingBudget + bucket.budgetNet;
            bucket.budgetClosing = rawClosing;
            rollingBudget = Math.max(0, rawClosing);
        });

        // Накопительный баланс вкладов.
        let rollingDeposit = 0;
        allKnownMonths.forEach(monthKey => {
            const bucket = buckets.get(monthKey);
            if (!bucket) return;

            rollingDeposit += bucket.depositTopup - bucket.depositWithdraw;
            bucket.depositBalance = Math.max(0, rollingDeposit);
        });

        // Остаток долгов.
        let rollingDebt = 0;
        allKnownMonths.forEach(monthKey => {
            const bucket = buckets.get(monthKey);
            if (!bucket) return;

            rollingDebt += bucket.debtCreated - bucket.debtPaid;
            bucket.debtBalance = Math.max(0, rollingDebt);
        });

        const rows = visibleMonths.map(monthKey => buckets.get(monthKey) || createBucket(monthKey));

        return {
            labels: rows.map(x => x.label),
            monthKeys: rows.map(x => x.monthKey),

            budget: rows.map(x => x.budgetClosing),
            income: rows.map(x => x.income),
            expense: rows.map(x => x.expense),
            deposit: rows.map(x => x.depositBalance),
            debt: rows.map(x => x.debtBalance),

            rows
        };
    }

    /* ───────────── 9. Текущий бюджет ───────────── */
    getCurrentBudget() {
        return this.budgets[this.currentBudgetIndex];
    }
}