// BudgetManager.js
export class BudgetManager {
  constructor() {
    this.budgets = JSON.parse(localStorage.getItem('budgets')) || [];
    this.currentBudgetIndex = parseInt(localStorage.getItem('currentBudgetIndex'), 10) || 0;
    this.productNames = JSON.parse(localStorage.getItem('productNames')) || [];
  }

  loadFromStorage() {
    const b = localStorage.getItem('budgets');
    this.budgets = b ? JSON.parse(b) : [];
    const idx = localStorage.getItem('currentBudgetIndex');
    this.currentBudgetIndex = idx !== null ? parseInt(idx, 10) : 0;
    this.productNames = JSON.parse(localStorage.getItem('productNames')) || [];

    // Инициализация долгов при загрузке старых данных
    this.budgets.forEach(budget => {
      budget.transactions?.forEach(t => {
        // Нормализуем статус вкладов
        if (t.type === 'deposit' && t.status?.includes('Уже лежало')) {
          t.status = '💾 Уже лежало';
        }
        if (t.type === 'deposit' && t.status?.includes('Под подушкой')) {
          t.status = '🛏 Под подушкой';
        }
    
        if (t.type === 'debt') {
          if (t.initialAmount === undefined) {
            t.initialAmount = t.amount;
            t.remainingAmount = t.amount;
          }
          if (!Array.isArray(t.payments)) t.payments = [];
        }
      });
    });
    
  }

  saveToStorage() {
    localStorage.setItem('budgets', JSON.stringify(this.budgets));
    localStorage.setItem('currentBudgetIndex', String(this.currentBudgetIndex));
    localStorage.setItem('productNames', JSON.stringify(this.productNames));
  }

  switchBudget(index) {
    this.currentBudgetIndex = index;
    this.saveToStorage();
  }
  
  createBudget(name) {
    if (!this.validateBudgetName(name)) return false;
    this.budgets.push({ name, transactions: [] });
    this.currentBudgetIndex = this.budgets.length - 1;
    this.saveToStorage();
    return true;
  }

  deleteBudget(index) {
    this.budgets.splice(index, 1);
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

  addTransaction(transaction) {
    const budget = this.getCurrentBudget();
    if (!budget) return;
    if (!budget.transactions) budget.transactions = [];
    budget.transactions.push(transaction);
    this.saveToStorage();
  }

  deleteTransaction(transactionId) {
    const budget = this.getCurrentBudget();
    if (!budget?.transactions) return;
    const idx = budget.transactions.findIndex(t => t.id === transactionId);
    if (idx !== -1) {
      budget.transactions.splice(idx, 1);
      this.saveToStorage();
    }
  }

  markDebtPayment(id, payAmount) {
    const d = this.getCurrentBudget()?.transactions.find(t => t.id === id && t.type === 'debt');
    if (!d || isNaN(payAmount) || payAmount <= 0) return;
  
    // Инициализируем поля, если старый долг
    if (d.initialAmount === undefined) d.initialAmount = d.amount;
    if (d.remainingAmount === undefined) d.remainingAmount = d.initialAmount;
    if (!Array.isArray(d.payments)) d.payments = [];
  
    // Добавляем платёж
    d.payments.push({ date: new Date().toISOString(), amount: payAmount });
  
    // Списываем (даже если переплата)
    d.remainingAmount = Math.max(0, d.remainingAmount - payAmount);
  
    // Если остатков не осталось — долг закрыт
    if (d.remainingAmount <= 0) {
      d.paid = true;
      d.paidDate = new Date().toISOString();
    }
  
    this.saveToStorage();
  }

  validateBudgetName(name) {
    const regex = /^[\p{L}\p{N}\p{Emoji}\s]+$/u;
    return regex.test(name);
  }

  // Рассчитываем итоги с учётом фильтра по месяцу (формат 'MM' или 'all')
  calculateTotals(monthFilter = 'all') {
    const budget = this.getCurrentBudget();
    if (!budget) return {
      overallBudget: 0,
      monthlyIncome: 0,
      monthlyExpense: 0,
      depositBalance: 0,
      totalDebt: 0,
      carryOver: 0
    };
  
    const txs = budget.transactions || [];
  
    // --- Подготовка
    const isAll = monthFilter === 'all';
    const monthInt = parseInt(monthFilter, 10);
  
    // --- Перенос с предыдущего месяца
    let carryOver = 0;
    if (!isAll && !isNaN(monthInt) && monthInt > 1) {
      const prevMonth = String(monthInt - 1).padStart(2, '0');
      const prevTotals = this.calculateTotals(prevMonth);
      carryOver = Math.max(0, prevTotals.overallBudget);
    }
  
    // --- Фильтр транзакций за месяц
    const txsInMonth = txs.filter(t =>
      isAll || (t.date && t.date.slice(5, 7) === monthFilter)
    );
  
    // --- Доходы
    let monthlyIncome = txsInMonth
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
  
    // --- Расходы
    let baseExpense = txsInMonth
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
  
    // --- Вклады
    let depositBalance = 0;
  
    txs.filter(t => t.type === 'deposit' && t.date).forEach(t => {
      const status = (t.status || '').trim();
      const tMonth = t.date.slice(5, 7);
  
      // Баланс вкладов по состоянию на текущий месяц
      if (isAll || tMonth <= monthFilter) {
        if (status === '➖ Снятие') {
          depositBalance -= t.amount;
        } else {
          depositBalance += t.amount;
        }
      }
  
      // Влияние на бюджет в текущем месяце
      if (tMonth === monthFilter) {
        if (status === '➖ Снятие') {
          carryOver += t.amount;
        } else if (status === '➕ Пополнение') {
          baseExpense += t.amount;
          // carryOver -= t.amount;
        }
      }
    });
  
    // --- Долги
    let debtAsExpense = 0;
    let totalDebtRem = 0;
  
    txs.filter(t => t.type === 'debt').forEach(d => {
      const initAmt = d.initialAmount || d.amount || 0;
      const createdMonth = d.date?.slice(5, 7);
      const payments = d.payments || [];
  
      const paidThisMonth = payments
      .filter(p => isAll || p.date?.slice(5, 7) === monthFilter)
      .reduce((sum, p) => sum + p.amount, 0);

  
      const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
      const remaining = Math.max(0, initAmt - totalPaid);
      totalDebtRem += remaining;
  
      const createdInRange = isAll || createdMonth === monthFilter;

      if (d.direction === 'owe') {
        if (createdInRange) monthlyIncome += initAmt;
        debtAsExpense += paidThisMonth;
      } else {
        if (createdInRange) debtAsExpense += initAmt;
        monthlyIncome += paidThisMonth;
      }

    });
  
    // --- Финальный расчёт
    const monthlyExpense = baseExpense + debtAsExpense;
    const overallBudget = carryOver + monthlyIncome - monthlyExpense;
    const carryOverForNext = Math.max(0, overallBudget);
  
    return {
      overallBudget,
      monthlyIncome,
      monthlyExpense,
      depositBalance,
      totalDebt: totalDebtRem,
      carryOver: carryOverForNext
    };
  }
  

  getCurrentBudget() {
    return this.budgets[this.currentBudgetIndex];
  }
}
