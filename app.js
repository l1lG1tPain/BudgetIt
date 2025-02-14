// Утилиты для отображения inline-ошибок (обновлённые)
function showInlineError(input, message) {
  let errorElem = input.parentElement.querySelector('.error-message');
  if (!errorElem) {
    errorElem = document.createElement('div');
    errorElem.className = 'error-message';
    input.parentElement.appendChild(errorElem);
  }
  errorElem.textContent = message;
  // Делаем подсказку видимой
  errorElem.classList.add('visible');
  
  // Красная обводка самого поля
  input.style.borderColor = 'red';
}

function clearInlineError(input) {
  const errorElem = input.parentElement.querySelector('.error-message');
  if (errorElem) {
    errorElem.textContent = '';
    errorElem.classList.remove('visible');
  }
  input.style.borderColor = '';
}


// Функция анимации числового значения с опциональным суффиксом
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

// Функция открытия модального окна (закрывает dropdown и все bottom-sheet, кроме указанного, если требуется)
function openModal(id) {
  console.log('openModal called for:', id);
  // Закрываем dropdown фильтра
  document.getElementById('month-filter-dropdown').classList.add('hidden');
  
  // Если открываются настройки – закрываем все bottom-sheet
  if (id === 'settings-page') {
    closeBottomSheets();
  } else if (document.getElementById(id).classList.contains('bottom-sheet')) {
    // Если открывается конкретный bottom-sheet, закрываем остальные
    closeBottomSheets(id);
  }
  // Удаляем класс hidden — элемент плавно выедет за счет CSS перехода
  document.getElementById(id).classList.remove('hidden');
}

function closeBottomSheets(exceptId) {
  const sheets = document.querySelectorAll('.bottom-sheet');
  sheets.forEach(sheet => {
    if (!exceptId || sheet.id !== exceptId) {
      // Добавляем класс hidden, и благодаря переходу элемент плавно скроется
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
  if (!Array.isArray(budgets) || budgets.length === 0) {
    console.log('No budgets found -> Forcing close settings & open budget-modal.');
    closeModal('settings-page');
    budgets = [];
    localStorage.removeItem('budgets');
    localStorage.removeItem('currentBudgetIndex');
    openModal('budget-modal');
  } else {
    console.log('Budgets found -> length:', budgets.length);
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

// Функции обновления шапки и UI
function updateHeader() {
  const headerEl = document.getElementById('current-budget');
  headerEl.textContent = budgets[currentBudgetIndex] ? budgets[currentBudgetIndex].name : 'BudgetIt';
}

// Функции для эмоджи
function getBudgetEmoji(value) {
  if (value < -10000000) return "💀💀💀";
  if (value < 0) return "🥶📉";
  if (value < 1000000) return "🐟";
  if (value < 10000000) return "🦀";
  if (value < 15000000) return "🐙";
  if (value < 25000000) return "🐬";
  if (value < 40000000) return "🦈";
  return "🐋";
}
function getIncomeEmoji(value) {
  if (value < 1000000) return "🤔💸";
  if (value < 10000000) return "😊💲";
  if (value < 50000000) return "😎💵";
  return "🏦💰";
}
function getExpenseEmoji(value) {
  if (value < 500000) return "🤏💵";
  if (value < 1000000) return "😬🛒";
  if (value < 10000000) return "🤯💸";
  return "🚀🔥💳";
}
function getDebtEmoji(value) {
  if (value < 1000000) return "😅💳";
  if (value < 10000000) return "😓📉";
  return "🆘💀";
}
function getDepositEmoji(value) {
  if (value < 1000000) return "🐖💰";
  if (value < 10000000) return "🏦📈";
  return "💎💎";
}
function updateSelectedCategory() {
  const select = document.getElementById("expense-category");
  const selectedOption = select.options[select.selectedIndex].text;
  select.setAttribute("data-display", selectedOption);
}
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
  debt.paidDate = new Date().toISOString();
  saveBudgets();
  updateUI();
  console.log("Долг оплачен:", debt);
}


// Добавляем обработчики фильтров один раз при инициализации
function attachFilterEventListeners() {
  const blockBudget = document.getElementById('block-budget');
  const blockIncome = document.getElementById('block-income');
  const blockExpense = document.getElementById('block-expense');
  const blockDeposit = document.getElementById('block-deposit');
  const blockDebt = document.getElementById('block-debt');

  blockBudget.addEventListener('click', () => {
      transactionFilter = 'all';
      updateUI();
  });
  blockIncome.addEventListener('click', () => {
      transactionFilter = 'income';
      updateUI();
  });
  blockExpense.addEventListener('click', () => {
      transactionFilter = 'expense';
      updateUI();
  });
  blockDeposit.addEventListener('click', () => {
      transactionFilter = 'deposit';
      updateUI();
  });
  blockDebt.addEventListener('click', () => {
      transactionFilter = 'debt';
      updateUI();
  });
}

let transactionFilter = 'all';

// В функции updateUI удаляем повторное добавление обработчиков:
function updateUI() {
  console.log('updateUI called.');
  const budget = budgets[currentBudgetIndex];
  if (!budget) return;
  const transactions = budget.transactions || [];
  const monthFilter = document.getElementById('month-filter-input').getAttribute('data-value') || 'all';
  
  let filtered = transactions.filter(t => {
      if (t.type === 'debt') return true;
      if (monthFilter === 'all') return true;
      const tMonth = new Date(t.date).toISOString().slice(5, 7);
      return tMonth === monthFilter;
  });

  const totalIncome = filtered.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = filtered.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  const totalDeposit = filtered.filter(t => t.type === 'deposit')
      .reduce((sum, t) => sum + (t.status === '➕ Пополнение' ? t.amount : -t.amount), 0);
  const totalDebt = transactions.filter(t => t.type === 'debt' && !t.paid).reduce((sum, t) => sum + t.amount, 0);
  const overallBudget = totalIncome - totalExpense;
  
  const paidDebts = transactions
    .filter(t => t.type === 'debt' && t.paid && t.paidDate)
    .filter(t => {
        if (monthFilter === 'all') return true;
        const paidMonth = new Date(t.paidDate).toISOString().slice(5, 7);
        return paidMonth === monthFilter;
    })
    .reduce((sum, t) => sum + t.amount, 0);
  
  console.log("Оплаченные долги, учтенные в расходах:", paidDebts);
  
  const depositWithdrawals = filtered
    .filter(t => t.type === 'deposit' && t.status === '➖ Снятие')
    .reduce((sum, t) => sum - t.amount, 0);
  const depositAdditions = filtered
    .filter(t => t.type === 'deposit' && t.status === '➕ Пополнение')
    .reduce((sum, t) => sum + t.amount, 0);
  
  const expenseBlockValue = totalExpense + depositWithdrawals + paidDebts + depositAdditions;
  console.log("Общий расход (с учетом вкладов и долгов):", expenseBlockValue);
  
  // Обновляем значения блоков и эмоджи
  const budgetEl  = document.querySelector('#block-budget .block-value');
  const incomeEl  = document.querySelector('#block-income .block-value');
  const expenseEl = document.querySelector('#block-expense .block-value');
  const depositEl = document.querySelector('#block-deposit .block-value');
  const debtEl    = document.querySelector('#block-debt .block-value');

  animateValue(budgetEl,  parseInt(budgetEl.textContent.replace(/\D/g, '')) || 0,  overallBudget,    800);
  animateValue(incomeEl,  parseInt(incomeEl.textContent.replace(/\D/g, '')) || 0,  totalIncome,      800);
  animateValue(expenseEl, parseInt(expenseEl.textContent.replace(/\D/g, '')) || 0, expenseBlockValue,800);
  animateValue(depositEl, parseInt(depositEl.textContent.replace(/\D/g, '')) || 0, totalDeposit,     800);
  animateValue(debtEl,    parseInt(debtEl.textContent.replace(/\D/g, '')) || 0,    totalDebt,        800);

  document.querySelector('#block-budget .emoji').textContent  = getBudgetEmoji(overallBudget);
  const incomeEmojiEl = document.querySelector('#block-income .emoji');
  if (incomeEmojiEl) incomeEmojiEl.textContent = getIncomeEmoji(totalIncome);
  document.querySelector('#block-expense .emoji').textContent = getExpenseEmoji(expenseBlockValue);
  document.querySelector('#block-debt .emoji').textContent    = getDebtEmoji(totalDebt);
  const depositEmojiEl = document.querySelector('#block-deposit .emoji');
  if (depositEmojiEl) depositEmojiEl.textContent = getDepositEmoji(totalDeposit);

  let finalFiltered = filtered.filter(t => {
      if (transactionFilter !== 'all' && t.type !== transactionFilter) return false;
      return true;
  });
  updateTransactionList(finalFiltered);
}

// Вызов attachFilterEventListeners один раз при инициализации
document.addEventListener('DOMContentLoaded', () => {
  attachFilterEventListeners();
});


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
  document.querySelectorAll('.pay-debt').forEach(button => {
      button.addEventListener('click', (event) => {
          event.stopPropagation();
          const debtId = parseInt(event.target.dataset.id, 10);
          markDebtAsPaid(debtId);
      });
  });
}

// Открытие деталей транзакции
function openTransactionDetail(transaction) {
  document.getElementById('detail-type').textContent = getTypeName(transaction.type);
  document.getElementById('detail-name').textContent = transaction.category || transaction.name;
  document.getElementById('detail-amount').textContent = 'Сумма: ' + formatNumber(transaction.amount);
  document.getElementById('detail-date').textContent = 'Дата: ' + formatDate(transaction.date);
  document.getElementById('delete-transaction').onclick = () => {
    deleteTransaction(transaction.id);
    closeModal('transaction-detail-sheet');
  };
  const detailStatus = document.getElementById('detail-status');
  if (transaction.type === 'deposit') {
    detailStatus.classList.remove('hidden');
    detailStatus.textContent = 'Статус: ' + transaction.status;
  } else {
    detailStatus.classList.add('hidden');
  }
  const prodDiv = document.getElementById('detail-products');
  if (transaction.type === 'expense' && transaction.products && transaction.products.length) {
    prodDiv.classList.remove('hidden');
    prodDiv.innerHTML = '<strong>Товары:</strong><br>' +
      transaction.products.map(p => `${p.name} (${p.quantity} x ${formatNumber(p.price)})`).join('<br>');
  } else {
    prodDiv.classList.add('hidden');
  }
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

// Обработчики событий
function attachEventListeners() {
  console.log('attachEventListeners called.');
  // Форма создания бюджета
  document.getElementById('budget-form').addEventListener('submit', e => {
    e.preventDefault();
    const nameInput = e.target['budget-name'];
    clearInlineError(nameInput);
    const name = nameInput.value.trim();
    if (name && validateBudgetName(name)) {
        budgets.push({ name, transactions: [] });
        currentBudgetIndex = budgets.length - 1;
        saveBudgets();
        updateHeader();
        updateUI();
        closeModal('budget-modal');
    } else {
        showInlineError(nameInput, 'Некорректное название бюджета!');
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
    const newNameInput = document.getElementById('new-budget-name');
    clearInlineError(newNameInput);
    const newName = newNameInput.value.trim();
    console.log('add-budget-btn clicked, newName =', newName);
    if (newName && validateBudgetName(newName)) {
        budgets.push({ name: newName, transactions: [] });
        saveBudgets();
        populateBudgetList();
        newNameInput.value = '';
    } else {
        showInlineError(newNameInput, 'Некорректное название бюджета!');
    }
  });
  // Фильтр по месяцу
  document.getElementById('month-filter-input').addEventListener('click', function(){
    closeBottomSheets();
    this.nextElementSibling.classList.toggle('hidden');
  });
  document.querySelectorAll('#month-filter-dropdown li').forEach(li => {
    li.addEventListener('click', function(){
      const value = this.getAttribute('data-value');
      document.getElementById('month-filter-input').value = this.textContent;
      document.getElementById('month-filter-input').setAttribute('data-value', value);
      document.getElementById('month-filter-dropdown').classList.add('hidden');
      updateUI();
    });
  });
  // Кнопка добавления транзакции
  document.getElementById('add-btn').addEventListener('click', () => {
    const today = new Date().toISOString().split('T')[0];
    ['income-date','expense-date','debt-date','deposit-date'].forEach(id => {
      document.getElementById(id).value = today;
    });
    document.getElementById('transaction-type').value = 'income';
    hideAllForms();
    openForm('income-form');
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

  // Добавление нового товара (в форме расходов)
  document.getElementById('add-product').addEventListener('click', () => {
    console.log('add-product clicked -> create new product-item');
    const productsList = document.getElementById('products-list');
    const productCount = productsList.children.length; // если уже есть хотя бы один товар
    const container = document.createElement('div');
    container.classList.add('product-item');
    
    // Добавляем delete-кнопку, если это не первый товар
    container.innerHTML = `
      <input type="text" class="product-name numeric-format" placeholder="Название" maxlength="16" list="product-names-list">
      <input type="tel" class="product-quantity" placeholder="Кол-во" required maxlength="3">
      <input type="tel" class="product-price numeric-format" placeholder="Цена" required maxlength="11" inputmode="numeric">
      ${ productCount >= 1 ? `<button type="button" class="delete-product" title="Удалить товар">×</button>` : '' }
    `;
    
    productsList.appendChild(container);
    
    // Привязываем обработчик форматирования для нового поля "Цена"
    const priceInput = container.querySelector('.product-price');
    priceInput.addEventListener('input', function() {
        let numericValue = this.value.replace(/\D/g, '');
        this.value = numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    });
    
    // Если кнопка удаления присутствует, привязываем её обработчик
    const deleteBtn = container.querySelector('.delete-product');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            container.remove();
        });
    }
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
  // Bottom-sheet с деталями транзакции
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

// Функции для форм транзакций
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
  const categoryInput = form['income-category'];
  clearInlineError(categoryInput);
  if (!categoryInput.value) {
    showInlineError(categoryInput, 'Выберите категорию');
    return;
  }
  const amountInput = form['income-amount'];
  clearInlineError(amountInput);
  const amount = parseInt(amountInput.value.replace(/\D/g, ''), 10) || 0;
  if (amount <= 0) {
    showInlineError(amountInput, 'Введите корректную сумму');
    return;
  }
  const transaction = {
    id: Date.now(),
    type: 'income',
    date: form['income-date'].value,
    category: categoryInput.value,
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
  const categoryInput = form['expense-category'];
  clearInlineError(categoryInput);
  if (!categoryInput.value) {
    showInlineError(categoryInput, 'Выберите категорию');
    return;
  }
  let isFormValid = true;
  const productElements = Array.from(document.querySelectorAll('#products-list .product-item'));
  const products = [];
  productElements.forEach(item => {
    const nameInput = item.querySelector('.product-name');
    const quantityInput = item.querySelector('.product-quantity');
    const priceInput = item.querySelector('.product-price');
    clearInlineError(nameInput);
    clearInlineError(quantityInput);
    clearInlineError(priceInput);
    const name = nameInput.value.trim();
    const quantity = parseInt(quantityInput.value, 10) || 0;
    const price = parseInt(priceInput.value.replace(/\D/g, ''), 10) || 0;
    // Если все поля пусты – удаляем этот блок
    if (name === '' && quantity === 0 && price === 0) {
      item.remove();
      return;
    }
    if (name === '') {
      showInlineError(nameInput, 'Введите название товара');
      isFormValid = false;
    }
    if (quantity <= 0) {
      showInlineError(quantityInput, 'Укажите количество');
      isFormValid = false;
    }
    if (price <= 0) {
      showInlineError(priceInput, 'Укажите цену');
      isFormValid = false;
    }
    if (isFormValid) {
      products.push({ name, quantity, price });
    }
  });
  if (!isFormValid || products.length === 0) {
    return;
  }
  const totalAmount = products.reduce((sum, p) => sum + (p.quantity * p.price), 0);
  const transaction = {
    id: Date.now(),
    type: 'expense',
    date: form['expense-date'].value,
    category: categoryInput.value,
    amount: totalAmount,
    products
  };
  addTransaction(transaction);
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
      <input type="tel" class="product-price" placeholder="Цена" required maxlength="11" inputmode="numeric">
    </div>
  `;
  document.querySelectorAll('input.numeric-format').forEach(input => {
    input.addEventListener('input', function() {
      let numericValue = this.value.replace(/\D/g, '');
      this.value = numericValue.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1.');
    });
  });
  
  closeModal('transaction-sheet');
}

function submitDebt(e) {
  e.preventDefault();
  console.log('submitDebt called.');
  const form = e.target;
  const nameInput = form['debt-name'];
  clearInlineError(nameInput);
  const amountInput = form['debt-amount'];
  clearInlineError(amountInput);
  const amount = parseInt(amountInput.value.replace(/\D/g, ''), 10) || 0;
  if (nameInput.value.trim() === '') {
    showInlineError(nameInput, 'Введите имя');
    return;
  }
  if (amount <= 0) {
    showInlineError(amountInput, 'Введите корректную сумму');
    return;
  }
  const transaction = {
    id: Date.now(),
    type: 'debt',
    date: form['debt-date'].value,
    name: nameInput.value.trim(),
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
  const statusInput = form['deposit-status'];
  clearInlineError(statusInput);
  if (!statusInput.value) {
    showInlineError(statusInput, 'Выберите статус');
    return;
  }
  const amountInput = form['deposit-amount'];
  clearInlineError(amountInput);
  const amount = parseInt(amountInput.value.replace(/\D/g, ''), 10) || 0;
  if (amount <= 0) {
    showInlineError(amountInput, 'Введите корректную сумму');
    return;
  }
  const transaction = {
    id: Date.now(),
    type: 'deposit',
    date: form['deposit-date'].value,
    name: form['deposit-name'].value.trim(),
    amount,
    status: statusInput.value
  };
  addTransaction(transaction);
  form.reset();
  closeModal('transaction-sheet');
}

function addTransaction(transaction) {
  console.log('addTransaction called:', transaction);
  if (!budgets[currentBudgetIndex].transactions) {
    budgets[currentBudgetIndex].transactions = [];
  }
  budgets[currentBudgetIndex].transactions.push(transaction);
  saveBudgets();
  updateUI();
}

document.querySelectorAll('input.numeric-format').forEach(input => {
  input.addEventListener('input', function() {
    let numericValue = this.value.replace(/\D/g, '');
    this.value = numericValue.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1.');
  });
});

// Экспорт/импорт
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
function validateBudgetName(name) {
  const regex = /^[\p{L}\p{N}\p{Emoji}\s]+$/u;
  return regex.test(name);
}
function updateProductDatalist() {
  const dataList = document.getElementById('product-names-list');
  dataList.innerHTML = '';
  productNames.forEach(name => {
    const option = document.createElement('option');
    option.value = name;
    dataList.appendChild(option);
  });
}
function applyInputRestrictions() {
  console.log('applyInputRestrictions called.');
  document.querySelectorAll('input[type="text"]').forEach(input => {
      input.addEventListener('input', e => {
          e.target.value = e.target.value.replace(/[^\p{L}\p{N}\p{Emoji}\s]/gu, '').slice(0, 20);
      });
  });
  document.querySelectorAll('input[inputmode="numeric"]').forEach(input => {
    input.addEventListener('input', e => {
      const raw = e.target.value.replace(/\D/g, '');
      e.target.value = raw.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1.');
    });
  });
}
function populateBudgetList() {
  console.log('populateBudgetList called.');
  const listDiv = document.querySelector('#budget-switch-sheet .budget-list');
  listDiv.innerHTML = '';
  budgets.forEach((b, index) => {
      const div = document.createElement('div');
      div.classList.add('budget-item');
      div.innerHTML = `
          <span>${b.name}</span>
          <button class="delete-budget-btn" data-index="${index}">🗑️</button>
      `;
      div.addEventListener('click', () => switchBudget(index));
      listDiv.appendChild(div);
  });
  document.querySelectorAll('.delete-budget-btn').forEach(button => {
      button.addEventListener('click', event => {
          event.stopPropagation();
          const index = parseInt(event.target.dataset.index, 10);
          openDeleteConfirmation(index);
      });
  });
}

let budgetToDelete = null;

function openDeleteConfirmation(index) {
  budgetToDelete = index;
  console.log(`Попытка удалить бюджет с индексом: ${budgetToDelete}`);
  // Закрываем все открытые bottom-sheet перед открытием модалки удаления
  closeBottomSheets();
  const modal = document.getElementById('delete-budget-modal');
  if (!modal) {
      console.error("Ошибка: Модальное окно удаления не найдено!");
      return;
  }
  modal.classList.remove('hidden');
}


document.addEventListener("DOMContentLoaded", () => {
  document.getElementById('confirm-delete-budget').addEventListener('click', () => {
      if (budgetToDelete !== null) {
          deleteBudget(budgetToDelete);
          budgetToDelete = null;
          document.getElementById('delete-budget-modal').classList.add('hidden');
      }
  });
  document.getElementById('cancel-delete-budget').addEventListener('click', () => {
      budgetToDelete = null;
      document.getElementById('delete-budget-modal').classList.add('hidden');
  });
  document.getElementById('export-before-delete').addEventListener('click', exportData);
});
function deleteBudget(index) {
  if (index < 0 || index >= budgets.length) {
      console.error("Ошибка: Неверный индекс бюджета!");
      return;
  }
  console.log(`Удаляем бюджет: ${budgets[index].name}`);
  budgets.splice(index, 1);
  if (budgets.length === 0) {
      localStorage.removeItem('budgets');
      localStorage.removeItem('currentBudgetIndex');
      openModal('budget-modal');
  } else {
      if (currentBudgetIndex === index) {
          currentBudgetIndex = 0;
      } else if (currentBudgetIndex > index) {
          currentBudgetIndex--;
      }
      saveBudgets();
      updateHeader();
      updateUI();
  }
  saveBudgets();
  populateBudgetList();
}
function switchBudget(index) {
  if (index < 0 || index >= budgets.length) {
      console.error("Ошибка: Некорректный индекс бюджета!");
      return;
  }
  console.log(`Переключаемся на бюджет: ${budgets[index].name}`);
  currentBudgetIndex = index;
  saveBudgets();
  updateHeader();
  updateUI();
  closeModal('budget-switch-sheet');
}
