// BudgetManager.js — финальная версия (с поддержкой расширенного бэкапа)
export class BudgetManager {
    constructor (storageManager = null) {
        this.storageManager = storageManager;
        this.loadFromStorage();
    }

    /* ───────────── 1. Загрузка ───────────── */
    loadFromStorage () {
        const rawBudgets = localStorage.getItem('budgets');
        const rawIdx     = localStorage.getItem('currentBudgetIndex');

        // 1) Пытаемся распарсить то, что лежит в LS
        let parsed = [];
        try { parsed = rawBudgets ? JSON.parse(rawBudgets) : []; } catch { parsed = []; }

        // 2) Поддержка расширенного бэкапа:
        //    { budgets: [], userId, currentBudgetIndex, productNames }
        if (!Array.isArray(parsed) && parsed && typeof parsed === 'object' &&
            Array.isArray(parsed.budgets)) {
            // Перекладываем данные в обычные ключи LS для обратной совместимости
            try { localStorage.setItem('budgets', JSON.stringify(parsed.budgets)); } catch {}
            if (Number.isInteger(parsed.currentBudgetIndex)) {
                try { localStorage.setItem('currentBudgetIndex', String(parsed.currentBudgetIndex)); } catch {}
            }
            if (Array.isArray(parsed.productNames)) {
                try { localStorage.setItem('productNames', JSON.stringify(parsed.productNames)); } catch {}
            }
            if (parsed.userId) {
                try { localStorage.setItem('budgetit-user-id', parsed.userId); } catch {}
            }
            parsed = parsed.budgets;
        }

        // 3) Итоговые поля менеджера
        this.budgets            = Array.isArray(parsed) ? parsed : [];
        this.currentBudgetIndex = rawIdx ? parseInt(rawIdx, 10) : 0;

        // productNames парсим безопасно
        let pn = [];
        try { pn = JSON.parse(localStorage.getItem('productNames') || '[]') || []; } catch { pn = []; }
        this.productNames = Array.isArray(pn) ? pn : [];

        let needsSave = false;

        // ── нормализация старых/разных записей ───────────────────────
        this.budgets.forEach(budget => {
            budget.transactions?.forEach(t => {
                /* 🗓 дата в ISO-формат «YYYY-MM-DD» */
                if (t.date && !/^\d{4}-\d{2}-\d{2}$/.test(t.date)) {
                    const d = new Date(t.date);
                    if (!isNaN(d)) {
                        t.date = d.toISOString().slice(0, 10);
                        needsSave = true;
                    }
                }

                /* вклад: выравниваем статус-эмодзи (старые данные) */
                if (t.type === 'deposit') {
                    if (t.status?.includes('Уже лежало'))   t.status = '💾 Уже лежало';
                    if (t.status?.includes('Под подушкой')) t.status = '🛏 Под подушкой';
                }

                /* долг: гарантия полей */
                if (t.type === 'debt') {
                    if (t.initialAmount   === undefined) t.initialAmount   = t.amount ?? 0;
                    if (t.remainingAmount === undefined) t.remainingAmount = t.initialAmount;
                    if (!Array.isArray(t.payments))       t.payments       = [];
                }
            });
        });

        if (needsSave) this.saveToStorage();
    }

    /* ───────────── 2. Сохранение ───────────── */
    saveToStorage () {
        const snapshot = {
            budgets           : this.budgets,
            currentBudgetIndex: this.currentBudgetIndex,
            productNames      : this.productNames
        };

        if (this.storageManager && typeof this.storageManager.saveState === 'function') {
            this.storageManager.saveState(snapshot).catch(err => {
                console.warn('[BudgetManager] Failed to save via StorageManager', err);
            });
        } else {
            try { localStorage.setItem('budgets', JSON.stringify(this.budgets)); } catch {}
            try { localStorage.setItem('currentBudgetIndex', String(this.currentBudgetIndex)); } catch {}
            try { localStorage.setItem('productNames', JSON.stringify(this.productNames)); } catch {}
        }
    }

    /* ───────────── 3. Операции с бюджетами ───────────── */
    switchBudget (idx) {
        this.currentBudgetIndex = Math.max(0, Math.min(idx, Math.max(0, this.budgets.length - 1)));
        this.saveToStorage();
    }

    createBudget (name) {
        if (!this.validateBudgetName(name)) return false;
        this.budgets.push({ name, transactions: [] });
        this.currentBudgetIndex = this.budgets.length - 1;
        this.saveToStorage();
        return true;
    }

    deleteBudget (idx) {
        this.budgets.splice(idx, 1);
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
    addTransaction (tx) {
        const budget = this.getCurrentBudget();
        if (!budget) return;

        /* 🗓 нормализуем дату сразу */
        if (tx.date) {
            const d = new Date(tx.date);
            if (!isNaN(d)) tx.date = d.toISOString().slice(0, 10);
        }

        budget.transactions ??= [];
        budget.transactions.push(tx);

        /* datalist продуктов */
        tx.products?.forEach(p => {
            if (p?.name && !this.productNames.includes(p.name)) this.productNames.push(p.name);
        });

        this.saveToStorage();
    }

    deleteTransaction (id) {
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

        // Обновляем поля
        tx.date = updatedData.date ?? tx.date;
        tx.category = updatedData.category ?? tx.category;
        tx.amount = updatedData.amount ?? tx.amount;

        // Только для расходов: товары → пересчёт суммы
        if (tx.type === 'expense' && updatedData.products) {
            tx.products = updatedData.products;
            tx.amount = updatedData.products.reduce((s, p) => s + p.quantity * p.price, 0);
        }

        this.saveToStorage();
        return true;
    }


    /* ───────────── 5. Погашение долгов ───────────── */
    markDebtPayment (id, amt) {
        const d = this.getCurrentBudget()?.transactions.find(t => t.id === id && t.type === 'debt');
        if (!d || isNaN(amt) || amt <= 0) return;

        d.initialAmount   ??= d.amount ?? 0;
        d.remainingAmount ??= d.initialAmount;
        d.payments        ??= [];

        d.payments.push({ date: new Date().toISOString(), amount: amt });
        d.remainingAmount = Math.max(0, d.remainingAmount - amt);

        if (d.remainingAmount === 0) {
            d.paid     = true;
            d.paidDate = new Date().toISOString();
        }
        this.saveToStorage();
    }

    /* ───────────── 6. Валидация имени ───────────── */
    validateBudgetName (name) {
        const n = (name ?? '').trim();
        if (!n) return false;
        try {
            return /^[\p{L}\p{N}\p{Emoji_Presentation}\s-]+$/u.test(n);
        } catch {
            return /^[\p{L}\p{N}\s-]+$/u.test(n);
        }
    }

    /* ───────────── 7. Статистика ───────────── */
    getTotalTransactions () {
        return this.budgets.reduce((s, b) => s + (b.transactions?.length || 0), 0);
    }

    /* ───────────── 8. Главный расчёт ─────────────
     * monthFilter: 'all' | '01'..'12'
     * yearFilter : 'all' | 2024 | 2025 | ...
     */
    calculateTotals (monthFilter = 'all', yearFilter = 'all') {
        const budget = this.getCurrentBudget();
        if (!budget) {
            return {
                overallBudget : 0,
                monthlyIncome : 0,
                monthlyExpense: 0,
                depositBalance: 0,
                totalDebt     : 0,
                carryOver     : 0
            };
        }

        const txs = budget.transactions || [];

        // Нормализуем фильтр
        const filter = (() => {
            const mRaw = monthFilter === 'all' ? null : parseInt(monthFilter, 10);
            let y = null;
            if (yearFilter !== undefined && yearFilter !== null && yearFilter !== 'all') {
                const parsed = parseInt(yearFilter, 10);
                y = isNaN(parsed) ? null : parsed;
            }
            return {
                month: !isNaN(mRaw) && mRaw >= 1 && mRaw <= 12 ? mRaw : null,
                year : y
            };
        })();

        const getYM = dateStr => {
            if (!dateStr) return { year: null, month: null };
            const d = new Date(dateStr);
            if (isNaN(d)) return { year: null, month: null };
            return { year: d.getFullYear(), month: d.getMonth() + 1 };
        };

        // Входит ли дата в выбранный период (строго этот месяц/год)
        const inRange = dateStr => {
            const { year, month } = getYM(dateStr);
            if (!filter.year && !filter.month) return !!(year || month); // режим "все месяцы/годы"
            if (!filter.year && filter.month)  return month === filter.month;
            if (filter.year && !filter.month)  return year === filter.year;
            // и год, и месяц уже заданы
            return year === filter.year && month === filter.month;
        };

        // Дата <= конца выбранного периода (для баланса вкладов)
        const inOrBefore = dateStr => {
            const { year, month } = getYM(dateStr);
            if (!filter.year && !filter.month) return !!(year || month); // берём всё
            if (!filter.year && filter.month) {
                if (!month) return false;
                return month <= filter.month;
            }
            if (filter.year && !filter.month) {
                if (!year) return false;
                return year <= filter.year;
            }
            if (!year || !month) return false;
            if (year < filter.year) return true;
            if (year > filter.year) return false;
            return month <= filter.month;
        };

        // Дата строго до выбранного периода (для carryOver)
        const isBeforePeriod = dateStr => {
            if (!filter.year || !filter.month) return false;
            const { year, month } = getYM(dateStr);
            if (!year || !month) return false;
            if (year < filter.year) return true;
            if (year > filter.year) return false;
            return month < filter.month;
        };

        /* 1. Доходы / базовые расходы (без вкладов и долгов) */
        let income           = 0;
        let expense          = 0;
        let carryIncome      = 0;
        let carryBaseExpense = 0;

        txs.forEach(tx => {
            const amount = tx.amount || 0;
            if (!amount) return;

            const inCurrent = inRange(tx.date);
            const before    = isBeforePeriod(tx.date);

            if (!inCurrent && !before) return;

            if (tx.type === 'income') {
                if (inCurrent) income      += amount;
                else           carryIncome += amount;
            } else if (tx.type === 'expense') {
                if (inCurrent) expense          += amount;
                else           carryBaseExpense += amount;
            }
        });

        /* 2. Вклады — переносы между Бюджетом и Вкладами */
        let depositBalance          = 0; // баланс вкладов на конец периода
        let netDepositTransfer      = 0; // >0 — деньги ушли во вклад, <0 — вернулись в бюджет (в выбранном периоде)
        let carryNetDepositTransfer = 0; // чистый перенос по вкладам ДО периода

        txs.forEach(tx => {
            if (tx.type !== 'deposit' || !tx.date) return;
            const amount = tx.amount || 0;
            if (!amount) return;

            const isWithdraw = (tx.status || '').trim() === '➖ Снятие';
            const delta      = isWithdraw ? -amount : amount;

            // Баланс вкладов на конец периода
            if (inOrBefore(tx.date)) {
                depositBalance += delta;
            }

            const inCurrent = inRange(tx.date);
            const before    = isBeforePeriod(tx.date);

            if (inCurrent) {
                netDepositTransfer += delta;
            } else if (before) {
                carryNetDepositTransfer += delta;
            }
        });

        /* 3. Долги */
        let debtExpense      = 0;
        let totalDebtRem     = 0;
        let carryDebtExpense = 0;

        txs.forEach(d => {
            if (d.type !== 'debt') return;

            const init = d.initialAmount ?? d.amount ?? 0;
            const paid = (d.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
            const remaining = Math.max(0, init - paid);
            totalDebtRem += remaining; // всегда считаем общий остаток долга "на сейчас"

            const paidInRange = (d.payments || [])
                .filter(p => inRange(p.date))
                .reduce((s, p) => s + (p.amount || 0), 0);

            const paidBefore = (d.payments || [])
                .filter(p => isBeforePeriod(p.date))
                .reduce((s, p) => s + (p.amount || 0), 0);

            const createdInRange = inRange(d.date);
            const createdBefore  = isBeforePeriod(d.date);

            if (d.direction === 'owe') {
                // Я занял деньги
                if (createdInRange && init > 0) {
                    income += init;       // получил займ как доход в этом месяце
                }
                if (createdBefore && init > 0) {
                    carryIncome += init;  // займ, полученный раньше — в перенос
                }
                if (paidInRange > 0) {
                    debtExpense += paidInRange; // погашения — расход в текущем периоде
                }
                if (paidBefore > 0) {
                    carryDebtExpense += paidBefore; // погашения до периода — в перенос
                }
            } else {
                // Я дал в долг
                if (createdInRange && init > 0) {
                    debtExpense += init;       // выдал — как расход в этом периоде
                }
                if (createdBefore && init > 0) {
                    carryDebtExpense += init;  // выдал раньше — перенос
                }
                if (paidInRange > 0) {
                    income += paidInRange;     // возврат — доход в этом периоде
                }
                if (paidBefore > 0) {
                    carryIncome += paidBefore; // возврат до периода — в перенос
                }
            }
        });

        const monthlyExpense    = expense + debtExpense;
        const carryTotalExpense = carryBaseExpense + carryDebtExpense;

        // Бюджет: доходы - (расходы + долг) - чистый перенос во вклад (за выбранный период)
        const overallBudget = income - monthlyExpense - netDepositTransfer;

        // Перенос: всё, что произошло ДО выбранного месяца (доходы, расходы, долги, вклады)
        const carryOver =
            (filter.year && filter.month)
                ? (carryIncome - carryTotalExpense - carryNetDepositTransfer)
                : 0;

        return {
            overallBudget,
            monthlyIncome : income,
            monthlyExpense,
            depositBalance,
            totalDebt     : totalDebtRem,
            carryOver
        };
    }

    /* ───────────── 9. Текущий бюджет ───────────── */
    getCurrentBudget () {
        return this.budgets[this.currentBudgetIndex];
    }
}
