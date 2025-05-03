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
    totalDebt: 0
  };

  const txs = budget.transactions || [];

  // Вспомогательная: дата <= выбранного месяца
  const upTo = dateStr =>
    monthFilter === 'all' || dateStr.slice(5, 7) <= monthFilter;

  // --- 1) Кумулятивный доход/расход с начала года до фильтруемого месяца ---
  const cumulativeIncome = txs
    .filter(t => t.type === 'income' && upTo(t.date))
    .reduce((s, t) => s + t.amount, 0);

  const cumulativeExpense = txs
    .filter(t => t.type === 'expense' && upTo(t.date))
    .reduce((s, t) => s + t.amount, 0);

  // --- 2) Баланс по вкладам ---
  const withdrawalStatus = '➖ Снятие';
  const specialStatuses = ['🛏 Под подушкой', '💾 Уже лежало'];

  let depositBalance = 0;
  let specialDepositEffect = 0;

  txs.filter(t => t.type === 'deposit').forEach(t => {
    const cleanStatus = (t.status || '').trim();
    if (specialStatuses.includes(cleanStatus)) {
      depositBalance += t.amount; // Увеличиваем баланс вкладов
      specialDepositEffect += t.amount; // Увеличиваем бюджет
    } else if (cleanStatus === withdrawalStatus) {
      depositBalance -= t.amount; // Уменьшаем баланс вкладов
    } else {
      depositBalance += t.amount; // Увеличиваем баланс вкладов для пополнения
    }
  });

  // --- 3) Учёт долгов ---
  let debtAsExpense = 0;
  let debtInitEffect = 0;
  let debtPayEffect = 0;
  let totalDebtRem = 0;

  txs.filter(t => t.type === 'debt').forEach(d => {
    const initAmt = d.initialAmount || 0;

    if (upTo(d.date)) {
      if (d.direction === 'owe') {
        debtInitEffect += initAmt;
      } else {
        debtInitEffect -= initAmt;
        debtAsExpense += initAmt;
      }
    }

    (d.payments || []).forEach(p => {
      if (upTo(p.date)) {
        if (d.direction === 'owe') {
          debtPayEffect -= p.amount;
          debtAsExpense += p.amount;
        } else {
          debtPayEffect += p.amount;
        }
      }
    });

    const paidSum = (d.payments || [])
      .filter(p => upTo(p.date))
      .reduce((s, p) => s + p.amount, 0);

    totalDebtRem += Math.max(0, initAmt - paidSum);
  });

  // --- 4) Доходы/расходы за фильтруемый месяц (в том числе долги) ---
  const monthlyIncome = txs
    .filter(t => t.type === 'income' && (monthFilter === 'all' || t.date.slice(5, 7) === monthFilter))
    .reduce((s, t) => s + t.amount, 0);

  const monthlyExpense = txs
    .filter(t => t.type === 'expense' && (monthFilter === 'all' || t.date.slice(5, 7) === monthFilter))
    .reduce((s, t) => s + t.amount, 0) + debtAsExpense;

  // --- 5) Общий итоговый бюджет ---
  const overallBudget =
    cumulativeIncome
    - cumulativeExpense
    + debtInitEffect
    + debtPayEffect
    - depositBalance
    + specialDepositEffect; // Добавляем спец. вклады напрямую

  return {
    overallBudget,
    monthlyIncome,
    monthlyExpense,
    depositBalance,
    totalDebt: totalDebtRem
  };
}
  

  getCurrentBudget() {
    return this.budgets[this.currentBudgetIndex];
  }
}
