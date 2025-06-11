// BudgetManager.js — финальная версия
export class BudgetManager {
  constructor () {
    this.loadFromStorage();

  }

  /* ───────────── 1. Загрузка ───────────── */
  loadFromStorage () {
    const b   = localStorage.getItem('budgets');
    const idx = localStorage.getItem('currentBudgetIndex');

    this.budgets            = b   ? JSON.parse(b) : [];
    this.currentBudgetIndex = idx ? parseInt(idx, 10) : 0;
    this.productNames       = JSON.parse(localStorage.getItem('productNames')) || [];

    let needsSave = false;

    // ── нормализация старых записей ──────────────────────────────
    this.budgets.forEach(budget => {
      budget.transactions?.forEach(t => {
        /* 🗓 дата в ISO-формат «YYYY-MM-DD» */
        if (t.date && !/^\d{4}-\d{2}-\d{2}$/.test(t.date)) {
          t.date = new Date(t.date).toISOString().slice(0, 10);
          needsSave = true;
        }

        /* вклад: выравниваем статус-эмодзи */
        if (t.type === 'deposit') {
          if (t.status?.includes('Уже лежало'))   t.status = '💾 Уже лежало';
          if (t.status?.includes('Под подушкой')) t.status = '🛏 Под подушкой';
        }

        /* долг: гарантия полей */
        if (t.type === 'debt') {
          if (t.initialAmount   === undefined) t.initialAmount   = t.amount;
          if (t.remainingAmount === undefined) t.remainingAmount = t.amount;
          if (!Array.isArray(t.payments))       t.payments       = [];
        }
      });
    });

    if (needsSave) this.saveToStorage();
  }

  /* ───────────── 2. Сохранение ───────────── */
  saveToStorage () {
    localStorage.setItem('budgets', JSON.stringify(this.budgets));
    localStorage.setItem('currentBudgetIndex', String(this.currentBudgetIndex));
    localStorage.setItem('productNames', JSON.stringify(this.productNames));
  }

  /* ───────────── 3. Операции с бюджетами ───────────── */
  switchBudget (idx) {
    this.currentBudgetIndex = idx;
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
      localStorage.removeItem('budgets');
      localStorage.removeItem('currentBudgetIndex');
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
    if (tx.date) tx.date = new Date(tx.date).toISOString().slice(0, 10);

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

  /* ───────────── 5. Погашение долгов ───────────── */
  markDebtPayment (id, amt) {
    const d = this.getCurrentBudget()?.transactions.find(t => t.id === id && t.type === 'debt');
    if (!d || isNaN(amt) || amt <= 0) return;

    d.initialAmount   ??= d.amount;
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
    try {
      return /^[\p{L}\p{N}\p{Emoji_Presentation}\s-]+$/u.test(name.trim());
    } catch {
      return /^[\p{L}\p{N}\s-]+$/u.test(name.trim());
    }
  }

  /* ───────────── 7. Статистика ───────────── */
  getTotalTransactions () {
    return this.budgets.reduce((s, b) => s + (b.transactions?.length || 0), 0);
  }

  /* ───────────── 8. Главный расчёт ───────────── */
  calculateTotals (monthFilter = 'all') {
    const budget = this.getCurrentBudget();
    if (!budget) return {
      overallBudget : 0, monthlyIncome : 0, monthlyExpense : 0,
      depositBalance: 0, totalDebt     : 0, carryOver      : 0
    };

    const txs   = budget.transactions || [];
    const isAll = monthFilter === 'all';
    const mInt  = parseInt(monthFilter, 10);

    /* helper: '2025-04-08' → '04' */
    const monthOf = d => String(new Date(d).getMonth() + 1).padStart(2, '0');

    /* 1. Перенос */
    let carryOver = 0;
    if (!isAll && !isNaN(mInt) && mInt > 1) {
      const prev   = this.calculateTotals(String(mInt - 1).padStart(2, '0'));
      carryOver    = Math.max(0, prev.overallBudget);
    }

    /* 2. Фильтр текущего месяца */
    const txInMonth = txs.filter(t => isAll || monthOf(t.date) === monthFilter);

    /* 3. Доходы / расходы */
    let income  = txInMonth.filter(t => t.type === 'income' ).reduce((s,t)=>s+t.amount,0);
    let expense = txInMonth.filter(t => t.type === 'expense').reduce((s,t)=>s+t.amount,0);

    /* 4. Вклады */
    let depositBalance = 0;
    txs.filter(t => t.type === 'deposit' && t.date).forEach(t => {
      const tMonth = monthOf(t.date);
      const isDraw = t.status?.trim() === '➖ Снятие';

      if (isAll || tMonth <= monthFilter) {
        depositBalance += isDraw ? -t.amount : t.amount;
      }
      if (tMonth === monthFilter) {
        if (isDraw) carryOver += t.amount;
        else        expense   += t.amount;
      }
    });

    /* 5. Долги */
    let debtExpense = 0, totalDebtRem = 0;
    txs.filter(t => t.type === 'debt').forEach(d => {
      const init = d.initialAmount ?? d.amount ?? 0;
      const paid = (d.payments || []).reduce((s,p)=>s+p.amount,0);
      totalDebtRem += Math.max(0, init - paid);

      const paidThisMonth = (d.payments || [])
          .filter(p => isAll || monthOf(p.date) === monthFilter)
          .reduce((s,p)=>s+p.amount,0);

      const createdInRange = isAll || monthOf(d.date) === monthFilter;

      if (d.direction === 'owe') {            // я должен
        if (createdInRange) income += init;   // получил заём
        debtExpense += paidThisMonth;         // плачу => расход
      } else {                               // мне должны
        if (createdInRange) debtExpense += init; // дал взаймы => «расход»
        income += paidThisMonth;                 // возврат => доход
      }
    });

    const monthlyExpense = expense + debtExpense;
    const overallBudget  = carryOver + income - monthlyExpense;

    return {
      overallBudget,
      monthlyIncome : income,
      monthlyExpense,
      depositBalance,
      totalDebt     : totalDebtRem,
      carryOver     : Math.max(0, overallBudget)
    };
  }

  /* ───────────── 9. Текущий бюджет ───────────── */
  getCurrentBudget () {
    return this.budgets[this.currentBudgetIndex];
  }
}
