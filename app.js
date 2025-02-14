// Функция анимации числового значения с опциональным суффиксом (например, смайликом)
function animateValue(element, start, end, duration, suffix = '') {
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    let currentVal = Math.floor(progress * (end - start) + start);
    element.textContent = formatNumber(currentVal) + (progress === 1 && suffix ? ` ${suffix}` : '');
    if (progress < 1) {
      window.requestAnimationFrame(step);
    }
  };
  window.requestAnimationFrame(step);
}

// Глобальные переменные
let budgets = [];
let currentBudgetIndex = 0;
let productNames = [];

// Отладочные логи, чтобы понять, кто открывает настройки
function openModal(id) {
  console.log('openModal called for:', id);
  // Если открываются настройки — закрываем все bottom-sheet
  if (id === 'settings-page') {
    closeBottomSheets();
  } else if (document.getElementById(id).classList.contains('bottom-sheet')) {
    // Если открывается конкретный bottom-sheet, закрываем остальные
    closeBottomSheets(id);
  }
  document.getElementById(id).classList.remove('hidden');
}

function closeBottomSheets(exceptId) {
  const sheets = document.querySelectorAll('.bottom-sheet');
  sheets.forEach(sheet => {
    if (!exceptId || sheet.id !== exceptId) {
      sheet.classList.add('hidden');
    }
  });
}

function closeModal(id) {
  console.log('closeModal called for:', id);
  document.getElementById(id).classList.add('hidden');
}

// Загрузка DOM
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOMContentLoaded -> Start initialization.');

  // Пробуем считать из localStorage
  const localData = localStorage.getItem('budgets');
  if (localData) {
    try {
      budgets = JSON.parse(localData);
    } catch(e) {
      console.log('Ошибка чтения localStorage, сбрасываем budgets.');
      budgets = [];
    }
  }
  currentBudgetIndex = localStorage.getItem('currentBudgetIndex');
  
  // Если нет бюджетов, закрываем «Настройки» на всякий случай и открываем «Добавить бюджет»
  if (!Array.isArray(budgets) || budgets.length === 0) {
    console.log('No budgets found -> Forcing close settings & open budget-modal.');
    closeModal('settings-page'); 
    budgets = [];
    localStorage.removeItem('budgets');
    localStorage.removeItem('currentBudgetIndex');
    openModal('budget-modal');
  } else {
    console.log('Budgets found -> length:', budgets.length);
    // Проверяем currentBudgetIndex
    if (currentBudgetIndex === null || isNaN(currentBudgetIndex)) {
      currentBudgetIndex = 0;
      localStorage.setItem('currentBudgetIndex', currentBudgetIndex);
    } else {
      currentBudgetIndex = parseInt(currentBudgetIndex, 10);
    }
    updateHeader();
    updateUI();
  }

  attachEventListeners();
  applyInputRestrictions();

  console.log('DOMContentLoaded -> Initialization finished.');
});

// ===========================
// ФУНКЦИИ ОБНОВЛЕНИЯ ШАПКИ И UI
// ===========================
function updateHeader() {
  const headerEl = document.getElementById('current-budget');
  if (budgets[currentBudgetIndex]) {
    headerEl.textContent = budgets[currentBudgetIndex].name;
  } else {
    headerEl.textContent = 'BudgetIt';
  }
}

// ==============================
// ФУНКЦИИ ДЛЯ ЭМОДЖИ
// ==============================
function getBudgetEmoji(value) {
  if (value < -10_000_000) return "💀💀💀"; // Полный банкрот
  if (value < 0) return "🥶📉";           // Финансовый кризис
  if (value < 1_000_000) return "🐟";     // Маленький бюджет
  if (value < 10_000_000) return "🦀";    // Средний бюджет
  if (value < 15_000_000) return "🐙";
  if (value < 25_000_000) return "🐬";
  if (value < 40_000_000) return "🦈";
  return "🐋";                            // Топовый бюджет
}

function getIncomeEmoji(value) {
  if (value < 1_000_000) return "🤔💸";
  if (value < 10_000_000) return "😊💲";
  if (value < 50_000_000) return "😎💵";
  return "🏦💰";
}

function getExpenseEmoji(value) {
  if (value < 500_000) return "🤏💵";
  if (value < 1_000_000) return "😬🛒";
  if (value < 10_000_000) return "🤯💸";
  return "🚀🔥💳";
}

function getDebtEmoji(value) {
  if (value < 1_000_000) return "😅💳";
  if (value < 10_000_000) return "😓📉";
  return "🆘💀";
}

function getDepositEmoji(value) {
  if (value < 1_000_000) return "🐖💰";
  if (value < 10_000_000) return "🏦📈";
  return "💎💎";
}

function updateSelectedCategory() {
  const select = document.getElementById("expense-category");
  const selectedOption = select.options[select.selectedIndex].text;
  select.setAttribute("data-display", selectedOption);
}

// Вызовем функцию при загрузке, чтобы учесть уже выбранное значение
document.addEventListener("DOMContentLoaded", updateSelectedCategory);


function markDebtAsPaid(debtId) {
  const budget = budgets[currentBudgetIndex];
  if (!budget) return;

  const debt = budget.transactions.find(t => t.id === debtId && t.type === 'debt');
  if (!debt) {
      console.error("Долг не найден!");
      return;
  }

  debt.paid = true;
  debt.paidDate = new Date().toISOString(); // Устанавливаем текущую дату

  saveBudgets();  // Сохранение в localStorage
  updateUI();     // Обновление интерфейса

  console.log("Долг оплачен:", debt);
}


// ==============================
// Глобальная переменная для фильтрации по типу транзакций
// ==============================
let transactionFilter = 'all'; // 'all' – без фильтрации по типу

// ==============================
// ОСНОВНАЯ ФУНКЦИЯ UPDATEUI
// ==============================
function updateUI() {
  console.log('updateUI called.');
  const budget = budgets[currentBudgetIndex];
  if (!budget) return;

  const transactions = budget.transactions || [];
  const monthFilter = document.getElementById('month-filter-input').getAttribute('data-value') || 'all';

  // Фильтрация по месяцу (долги НЕ фильтруем)
  let filtered = transactions.filter(t => {
      if (t.type === 'debt') return true; 
      if (monthFilter === 'all') return true;
      const tMonth = new Date(t.date).toISOString().slice(5, 7);
      return tMonth === monthFilter;
  });

  // Подсчёты сумм
  const totalIncome = filtered.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = filtered.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  const totalDeposit = filtered.filter(t => t.type === 'deposit')
      .reduce((sum, t) => sum + (t.status === '➕ Пополнение' ? t.amount : -t.amount), 0);
  const totalDebt = transactions.filter(t => t.type === 'debt' && !t.paid).reduce((sum, t) => sum + t.amount, 0);

  const overallBudget = totalIncome - totalExpense;

  // ✅ **Добавляем оплаченные долги в расходы**
  const paidDebts = transactions
    .filter(t => t.type === 'debt' && t.paid && t.paidDate) // Только оплаченные долги с датой
    .filter(t => {
        if (monthFilter === 'all') return true; // Если фильтр "все", учитываем все оплаченные долги
        const paidMonth = new Date(t.paidDate).toISOString().slice(5, 7);
        return paidMonth === monthFilter; // Учитываем только долги, оплаченные в выбранном месяце
    })
    .reduce((sum, t) => sum + t.amount, 0);

  console.log("Оплаченные долги, учтенные в расходах:", paidDebts);

// 📌 **Расходы = Обычные расходы + Снятие вкладов + Оплаченные долги + Пополнение вкладов**
  const depositWithdrawals = filtered
    .filter(t => t.type === 'deposit' && t.status === '➖ Снятие')
    .reduce((sum, t) => sum -t.amount, 0);

  // ✅ **Добавляем пополнение вкладов в расход**
  const depositAdditions = filtered
    .filter(t => t.type === 'deposit' && t.status === '➕ Пополнение')
    .reduce((sum, t) => sum + t.amount, 0);

  const expenseBlockValue = totalExpense + depositWithdrawals + paidDebts + depositAdditions;

  console.log("Общий расход (с учетом вкладов и долгов):", expenseBlockValue);



  // Получаем элементы блоков
  const budgetEl  = document.querySelector('#block-budget .block-value');
  const incomeEl  = document.querySelector('#block-income .block-value');
  const expenseEl = document.querySelector('#block-expense .block-value');
  const depositEl = document.querySelector('#block-deposit .block-value');
  const debtEl    = document.querySelector('#block-debt .block-value');

  // Получаем элементы для эмоджи
  const budgetEmojiEl  = document.querySelector('#block-budget .emoji');
  const expenseEmojiEl = document.querySelector('#block-expense .emoji');
  const debtEmojiEl    = document.querySelector('#block-debt .emoji');

  const incomeEmojiEl  = document.querySelector('#block-income .emoji');
  const depositEmojiEl = document.querySelector('#block-deposit .emoji');

  // Парсим предыдущие значения (убираем разделители)
  const oldBudget  = parseInt(budgetEl.textContent.replace(/\D/g, '')) || 0;
  const oldIncome  = parseInt(incomeEl.textContent.replace(/\D/g, '')) || 0;
  const oldExpense = parseInt(expenseEl.textContent.replace(/\D/g, '')) || 0;
  const oldDeposit = parseInt(depositEl.textContent.replace(/\D/g, '')) || 0;
  const oldDebt    = parseInt(debtEl.textContent.replace(/\D/g, '')) || 0;

  // Анимация изменения числовых значений
  animateValue(budgetEl,  oldBudget,  overallBudget,    800);
  animateValue(incomeEl,  oldIncome,  totalIncome,      800);
  animateValue(expenseEl, oldExpense, expenseBlockValue,800);
  animateValue(depositEl, oldDeposit, totalDeposit,     800);
  animateValue(debtEl,    oldDebt,    totalDebt,        800);

  // Устанавливаем эмоджи
  budgetEmojiEl.textContent  = getBudgetEmoji(overallBudget);
  if (incomeEmojiEl)  incomeEmojiEl.textContent  = getIncomeEmoji(totalIncome);
  expenseEmojiEl.textContent = getExpenseEmoji(expenseBlockValue);
  debtEmojiEl.textContent    = getDebtEmoji(totalDebt);
  if (depositEmojiEl) depositEmojiEl.textContent = getDepositEmoji(totalDeposit);

  // Фильтр по типу транзакций
  let finalFiltered = filtered.filter(t => {
      if (transactionFilter !== 'all' && t.type !== transactionFilter) return false;
      return true;
  });
  updateTransactionList(finalFiltered);

  // Привязываем обработчики клика к блокам для быстрого переключения фильтра
  document.getElementById('block-budget').addEventListener('click', () => {
      transactionFilter = 'all';
      updateUI();
  });
  document.getElementById('block-income').addEventListener('click', () => {
      transactionFilter = 'income';
      updateUI();
  });
  document.getElementById('block-expense').addEventListener('click', () => {
      transactionFilter = 'expense';
      updateUI();
  });
  document.getElementById('block-deposit').addEventListener('click', () => {
      transactionFilter = 'deposit';
      updateUI();
  });
  document.getElementById('block-debt').addEventListener('click', () => {
      transactionFilter = 'debt';
      updateUI();
  });
}





// Список транзакций
function updateTransactionList(transactions) {
  console.log('updateTransactionList called, count =', transactions.length);
  const list = document.getElementById('transaction-list');
  list.innerHTML = '';

  transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
  transactions.forEach(t => {
      const li = document.createElement('li');
      li.style.borderLeftColor = getTypeColor(t.type);
      li.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div><strong>${getTypeName(t.type)}: </strong>${t.category || t.name}</div>
        <div style="font-weight: bold;">${formatNumber(t.amount)}</div>
      </div>
      <div style="font-size: 0.8em; color: gray; text-align: right;">${formatDate(t.date)}</div>
      ${t.type === 'debt' ? (t.paid ? `<span style="color: green; font-weight: bold;">✅ Оплачено</span>` : `<button class="pay-debt" data-id="${t.id}">Оплатить</button>`) : ""}

      `;


      li.addEventListener('click', () => openTransactionDetail(t));
      list.appendChild(li);
  });

  // Добавляем обработчики для кнопок "Оплачено"
  document.querySelectorAll('.pay-debt').forEach(button => {
      button.addEventListener('click', (event) => {
          event.stopPropagation(); // Чтобы клик не открывал детали
          const debtId = parseInt(event.target.dataset.id, 10);
          markDebtAsPaid(debtId);
      });
  });
}


// ===========================
// ФУНКЦИИ ОТКРЫТИЯ ДЕТАЛЕЙ ТРАНЗАКЦИИ
// ===========================
function openTransactionDetail(transaction) {
  document.getElementById('detail-type').textContent = getTypeName(transaction.type);
  document.getElementById('detail-name').textContent = transaction.category || transaction.name;
  document.getElementById('detail-amount').textContent = 'Сумма: ' + formatNumber(transaction.amount);
  document.getElementById('detail-date').textContent = 'Дата: ' + formatDate(transaction.date);

  document.getElementById('delete-transaction').onclick = () => {
    deleteTransaction(transaction.id);
    closeModal('transaction-detail-sheet');
  };

  // Статус вкладов
  const detailStatus = document.getElementById('detail-status');
  if (transaction.type === 'deposit') {
    detailStatus.classList.remove('hidden');
    detailStatus.textContent = 'Статус: ' + transaction.status;
  } else {
    detailStatus.classList.add('hidden');
  }

  // Товары
  const prodDiv = document.getElementById('detail-products');
  if (transaction.type === 'expense' && transaction.products && transaction.products.length) {
    prodDiv.classList.remove('hidden');
    prodDiv.innerHTML = '<strong>Товары:</strong><br>' +
      transaction.products.map(p => `${p.name} (${p.quantity} x ${formatNumber(p.price)})`).join('<br>');
  } else {
    prodDiv.classList.add('hidden');
  }

  // Долг
  const payDebtBtn = document.getElementById('pay-debt');
  if (transaction.type === 'debt' && !transaction.paid) {
      payDebtBtn.classList.remove('hidden');
      payDebtBtn.onclick = () => markDebtAsPaid(transaction.id);
  } else {
      payDebtBtn.classList.add('hidden');
  }


  openModal('transaction-detail-sheet');
}

function payDebt(transaction) {
  transaction.paid = true;
  saveBudgets();
  updateUI();
  closeModal('transaction-detail-sheet');
}

function deleteTransaction(transactionId) {
  const transactions = budgets[currentBudgetIndex].transactions;
  const index = transactions.findIndex(t => t.id === transactionId);
  if (index !== -1) {
    transactions.splice(index, 1);
    saveBudgets();
    updateUI();
  }
}

// ===========================
// ОБРАБОТЧИКИ СОБЫТИЙ
// ===========================
function attachEventListeners() {
  console.log('attachEventListeners called.');

  // Форма создания бюджета
  document.getElementById('budget-form').addEventListener('submit', e => {
    e.preventDefault();
    const name = e.target['budget-name'].value.trim();
    console.log('budget-form submitted with name:', name);
    if (name && /^[A-Za-zА-Яа-я0-9+\-/\s]+$/.test(name)) {
      budgets.push({ name, transactions: [] });
      currentBudgetIndex = budgets.length - 1;
      saveBudgets();
      updateHeader();
      updateUI();
      closeModal('budget-modal');
    } else {
      alert('Некорректное название бюджета! (только буквы, цифры, +, -, /, пробел)');
    }
  });

  // Переключение бюджета
  document.getElementById('current-budget').addEventListener('click', () => {
    console.log('current-budget clicked -> open budget-switch-sheet');
    populateBudgetList();
    openModal('budget-switch-sheet');
  });
  document.getElementById('close-budget-sheet').addEventListener('click', () => {
    closeModal('budget-switch-sheet');
  });
  document.querySelector('#budget-switch-sheet .budget-list').addEventListener('click', e => {
    if (e.target.dataset.index !== undefined) {
      console.log('Switching to budget index:', e.target.dataset.index);
      currentBudgetIndex = parseInt(e.target.dataset.index, 10);
      saveBudgets();
      updateHeader();
      updateUI();
      closeModal('budget-switch-sheet');
    }
  });
  document.getElementById('add-budget-btn').addEventListener('click', () => {
    const newName = document.getElementById('new-budget-name').value.trim();
    console.log('add-budget-btn clicked, newName =', newName);
    if (newName && /^[A-Za-zА-Яа-я0-9+\-/\s]+$/.test(newName)) {
      budgets.push({ name: newName, transactions: [] });
      saveBudgets();
      populateBudgetList();
      document.getElementById('new-budget-name').value = '';
    } else {
      alert('Некорректное название бюджета!');
    }
  });

  // Фильтр по месяцу
  document.getElementById('month-filter-input').addEventListener('click', function(){
    document.getElementById('month-filter-dropdown').classList.toggle('hidden');
  });
  document.querySelectorAll('#month-filter-dropdown li').forEach(li => {
    li.addEventListener('click', function(){
      const value = this.getAttribute('data-value');
      document.getElementById('month-filter-input').value = this.textContent;
      document.getElementById('month-filter-input').setAttribute('data-value', value);
      document.getElementById('month-filter-dropdown').classList.add('hidden');
      updateUI(); // Обновление интерфейса с новым фильтром
    });
  });

  // Кнопка + (добавление транзакции)
  document.getElementById('add-btn').addEventListener('click', () => {
    const today = new Date().toISOString().split('T')[0];
    ['income-date','expense-date','debt-date','deposit-date'].forEach(id => {
      document.getElementById(id).value = today;
    });
    // Устанавливаем значение по умолчанию — "income" (Доходы)
    document.getElementById('transaction-type').value = 'income';
    hideAllForms();
    openForm('income-form'); // Открываем именно форму доходов
    openModal('transaction-sheet');
  });
  
  // Смена типа транзакции
  document.getElementById('transaction-type').addEventListener('change', e => {
    hideAllForms();
    const type = e.target.value;
    console.log('transaction-type changed to:', type);
    if (type === 'income') openForm('income-form');
    if (type === 'expense') openForm('expense-form');
    if (type === 'debt') openForm('debt-form');
    if (type === 'deposit') openForm('deposit-form');
  });

  // Закрытие форм транзакций
  document.querySelectorAll('.close-form').forEach(btn => {
    btn.addEventListener('click', () => {
      console.log('close-form clicked -> close transaction-sheet');
      closeModal('transaction-sheet');
    });
  });

  // Отправка форм
  document.getElementById('income-form').addEventListener('submit', submitIncome);
  document.getElementById('expense-form').addEventListener('submit', submitExpense);
  document.getElementById('debt-form').addEventListener('submit', submitDebt);
  document.getElementById('deposit-form').addEventListener('submit', submitDeposit);

  // Добавить ещё товар (форма расходов)
  document.getElementById('add-product').addEventListener('click', () => {
    console.log('add-product clicked -> create new product-item');
    const container = document.createElement('div');
    container.classList.add('product-item');
    container.innerHTML = `
      <input type="text" class="product-name" placeholder="Название" maxlength="16" list="product-names-list">
      <input type="tel" class="product-quantity" placeholder="Кол-во" required maxlength="3">
      <input type="tel" class="product-price numeric-format" placeholder="Цена" required maxlength="11" inputmode="numeric">
    `;
    document.getElementById('products-list').appendChild(container);
  });

  // Настройки
  document.getElementById('settings-btn').addEventListener('click', () => {
    console.log('settings-btn clicked -> open settings-page');
    openModal('settings-page');
  });
  document.getElementById('close-settings').addEventListener('click', () => {
    closeModal('settings-page');
  });
  document.getElementById('export-btn').addEventListener('click', exportData);
  document.getElementById('import-file').addEventListener('change', importData);

  // Bottom-sheet с деталями
  document.getElementById('close-detail').addEventListener('click', () => {
    closeModal('transaction-detail-sheet');
  });

  // Установка PWA
  let deferredPrompt;
  window.addEventListener('beforeinstallprompt', e => {
    console.log('beforeinstallprompt event triggered.');
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('install-btn').style.display = 'block';
  });
  document.getElementById('install-btn').addEventListener('click', () => {
    console.log('install-btn clicked -> prompt PWA');
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(() => {
      deferredPrompt = null;
      document.getElementById('install-btn').style.display = 'none';
    });
  });
}

// ===========================
// ФУНКЦИИ ДЛЯ ФОРМ ТРАНЗАКЦИЙ
// ===========================
function hideAllForms() {
  console.log('hideAllForms called.');
  document.querySelectorAll('.transaction-form').forEach(form => form.classList.add('hidden'));
}
function openForm(formId) {
  console.log('openForm called for:', formId);
  document.getElementById(formId).classList.remove('hidden');
}

function submitIncome(e) {
  e.preventDefault();
  console.log('submitIncome called.');
  const form = e.target;
  if (!form['income-category'].value) {
    form['income-category'].style.borderColor = 'red';
    return;
  }
  const amount = parseInt(form['income-amount'].value.replace(/\D/g, ''), 10) || 0;
  const transaction = {
    id: Date.now(),
    type: 'income',
    date: form['income-date'].value,
    category: form['income-category'].value,
    amount
  };
  addTransaction(transaction);
  form.reset();
  closeModal('transaction-sheet');
}

function submitExpense(e) {
  e.preventDefault();
  console.log('submitExpense called.');
  const form = e.target;
  if (!form['expense-category'].value) {
    form['expense-category'].style.borderColor = 'red';
    return;
  }
  const products = Array.from(document.querySelectorAll('#products-list .product-item')).map(item => {
    const name = item.querySelector('.product-name').value.trim();
    const quantity = parseInt(item.querySelector('.product-quantity').value, 10) || 0;
    const price = parseInt(item.querySelector('.product-price').value.replace(/\D/g, ''), 10) || 0;
    return { name, quantity, price };
  });
  const totalAmount = products.reduce((sum, p) => sum + (p.quantity * p.price), 0);
  if (totalAmount <= 0) {
    alert('Заполните корректно данные о товарах!');
    return;
  }
  const transaction = {
    id: Date.now(),
    type: 'expense',
    date: form['expense-date'].value,
    category: form['expense-category'].value,
    amount: totalAmount,
    products
  };
  addTransaction(transaction);

  // Обновляем автоподсказки
  products.forEach(p => {
    if (p.name && !productNames.includes(p.name)) {
      productNames.push(p.name);
    }
  });
  updateProductDatalist();

  form.reset();
  document.getElementById('products-list').innerHTML = `
  <div class="product-item">
    <input type="text" class="product-name" placeholder="Название" maxlength="16" list="product-names-list">
    <input type="tel" class="product-quantity" placeholder="Кол-во" required maxlength="3">
    <input type="tel" class="product-price numeric-format" placeholder="Цена" required maxlength="11" inputmode="numeric">
  </div>
  `;

  // Назначаем обработчик для всех полей с классом "numeric-format"
  document.querySelectorAll('input.numeric-format').forEach(input => {
    input.addEventListener('input', function() {
      let numericValue = this.value.replace(/\D/g, '');
      this.value = numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    });
  });

  closeModal('transaction-sheet');
}

function submitDebt(e) {
  e.preventDefault();
  console.log('submitDebt called.');
  const form = e.target;
  const amount = parseInt(form['debt-amount'].value.replace(/\D/g, ''), 10) || 0;
  const transaction = {
    id: Date.now(),
    type: 'debt',
    date: form['debt-date'].value,
    name: form['debt-name'].value.trim(),
    amount,
    paid: false
  };
  addTransaction(transaction);
  form.reset();
  closeModal('transaction-sheet');
}

function submitDeposit(e) {
  e.preventDefault();
  console.log('submitDeposit called.');
  const form = e.target;
  if (!form['deposit-status'].value) {
    form['deposit-status'].style.borderColor = 'red';
    return;
  }
  const amount = parseInt(form['deposit-amount'].value.replace(/\D/g, ''), 10) || 0;
  const transaction = {
    id: Date.now(),
    type: 'deposit',
    date: form['deposit-date'].value,
    name: form['deposit-name'].value.trim(),
    amount,
    status: form['deposit-status'].value
  };
  addTransaction(transaction);
  form.reset();
  closeModal('transaction-sheet');
}

// Добавляем транзакцию в текущий бюджет
function addTransaction(transaction) {
  console.log('addTransaction called:', transaction);
  if (!budgets[currentBudgetIndex].transactions) {
    budgets[currentBudgetIndex].transactions = [];
  }
  budgets[currentBudgetIndex].transactions.push(transaction);
  saveBudgets();
  updateUI();
}

// Прослушка всех инпутов numeric
document.querySelectorAll('input.numeric-format').forEach(input => {
  input.addEventListener('input', function() {
    // Удаляем всё, кроме цифр
    let numericValue = this.value.replace(/\D/g, '');
    // Вставляем точки в качестве разделителя каждых трёх цифр (слева направо)
    this.value = numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  });
});

// ===========================
// ЭКСПОРТ/ИМПОРТ
// ===========================
function exportData() {
  console.log('exportData called.');
  const dataStr = JSON.stringify(budgets);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'budgets.json';
  a.click();
}
function importData(e) {
  console.log('importData called.');
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      budgets = JSON.parse(reader.result);
      currentBudgetIndex = 0;
      saveBudgets();
      updateHeader();
      updateUI();
      alert('Данные успешно импортированы!');
    } catch (err) {
      alert('Ошибка при чтении файла!');
    }
  };
  reader.readAsText(file);
}

// ===========================
// ПОЛЕЗНЫЕ УТИЛИТЫ
// ===========================
function saveBudgets() {
  localStorage.setItem('budgets', JSON.stringify(budgets));
  localStorage.setItem('currentBudgetIndex', currentBudgetIndex);
}
function formatNumber(num) {
  return num.toLocaleString('ru-RU');
}
function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit'
  });
}
function getTypeName(type) {
  const map = { income: 'Доход', expense: 'Расход', debt: 'Долг', deposit: 'Вклад' };
  return map[type] || 'Неизвестно';
}
function getTypeColor(type) {
  const rootStyles = getComputedStyle(document.documentElement);

  const map = {
    income: rootStyles.getPropertyValue('--income-color').trim(),
    expense: rootStyles.getPropertyValue('--expense-color').trim(),
    debt: rootStyles.getPropertyValue('--debt-color').trim(),
    deposit: rootStyles.getPropertyValue('--deposit-color').trim()
  };
  return map[type] || 'black';
}
function getBudgetEmoji(value) {
  if(value < 1e6) return '🐟';
  if(value < 1e7) return '🦀';
  if(value >= 1e7 && value < 1.5e7) return '🐙';
  if(value >= 1.5e7 && value < 2.5e7) return '🐬';
  if(value >= 2.5e7 && value < 4e7) return '🦈';
  if(value >= 4e7) return '🐋';
  return '';
}

// Автоподсказки для названий товаров
function updateProductDatalist() {
  const dataList = document.getElementById('product-names-list');
  dataList.innerHTML = '';
  productNames.forEach(name => {
    const option = document.createElement('option');
    option.value = name;
    dataList.appendChild(option);
  });
}

// Ограничения ввода
function applyInputRestrictions() {
  console.log('applyInputRestrictions called.');
  // Текстовые поля
  document.querySelectorAll('input[type="text"]').forEach(input => {
    input.addEventListener('input', e => {
      e.target.value = e.target.value.replace(/[^A-Za-zА-Яа-я0-9+\-/\s]/g, '').slice(0,16);
    });
  });
  // Форматирование числовых
  document.querySelectorAll('input[inputmode="numeric"]').forEach(input => {
    input.addEventListener('input', e => {
      const raw = e.target.value.replace(/\D/g, '');
      e.target.value = raw.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1.');
    });
  });
}

// Заполняем список бюджетов
function populateBudgetList() {
  console.log('populateBudgetList called.');
  const listDiv = document.querySelector('#budget-switch-sheet .budget-list');
  listDiv.innerHTML = '';
  budgets.forEach((b, index) => {
    const div = document.createElement('div');
    div.textContent = b.name;
    div.dataset.index = index;
    listDiv.appendChild(div);
  });
}

