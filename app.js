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
  const modal = document.getElementById(id);
  if (!modal) return;
  
  // Показываем backdrop для всех bottom-sheet'ов
  if (modal.classList.contains('bottom-sheet')) {
    const backdrop = document.getElementById('bottom-sheet-backdrop');
    backdrop.classList.remove('hidden');
  }
  
  modal.classList.remove('hidden');
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
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add('hidden');
  }
  
  // Скрываем блур, если нет других открытых модалок
  const hasOpenModals = document.querySelectorAll('.bottom-sheet:not(.hidden)').length > 0;
  if (!hasOpenModals) {
    document.getElementById('bottom-sheet-backdrop').classList.add('hidden');
  }
}

// ======================
// Устанавливаем дефолтный месяц (текущий)
// ======================
function setDefaultMonthFilter() {
  const today = new Date();
  const currentMonth = String(today.getMonth() + 1).padStart(2, '0'); // "01" - "12"

  // Русские названия месяцев
  const monthNames = {
    "01": "Январь",
    "02": "Февраль",
    "03": "Март",
    "04": "Апрель",
    "05": "Май",
    "06": "Июнь",
    "07": "Июль",
    "08": "Август",
    "09": "Сентябрь",
    "10": "Октябрь",
    "11": "Ноябрь",
    "12": "Декабрь"
  };

  // Ставим отображаемое название + значение
  const input = document.getElementById('month-filter-input');
  input.value = monthNames[currentMonth] || "Неизвестно";
  input.setAttribute('data-value', currentMonth);
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
  }

  // Ставим дефолтный месяц (сразу после того, как определили budgets)
  setDefaultMonthFilter();
  // Теперь формируем UI
  updateUI();

  attachEventListeners();
  applyInputRestrictions();
  initializeCategoryButtons();

  // Инициализируем аналитику при открытии страницы настроек
  document.getElementById('settings-btn').addEventListener('click', function() {
    // Даем время для рендеринга DOM перед инициализацией графиков
    setTimeout(() => {
      initializeAnalyticsCarousel();
    }, 300);
  });
  
  console.log('DOMContentLoaded -> Initialization finished.');
});

// Функции обновления шапки и UI
function updateHeader() {
  const headerEl = document.getElementById('current-budget');
  headerEl.textContent = budgets[currentBudgetIndex] ? budgets[currentBudgetIndex].name : 'BudgetIt';
}

// Функции для эмоджи (бюджет, доход, расход, долг, вклад)
function getBudgetEmoji(value) {
  if (value < -100000000) return "🔥🕳️💀";   // <- меньше -100 млн
  if (value < -10000000)  return "💀💀💀";    // <- меньше -10 млн
  if (value < 0)          return "🥶📉";     // < 0
  if (value < 500000)     return "🪱";       // < 500k
  if (value < 2000000)    return "🐟";       // < 2 млн
  if (value < 10000000)   return "🦀";       // < 10 млн
  if (value < 15000000)   return "🐙";       // < 15 млн
  if (value < 25000000)   return "🐬";       // < 25 млн
  if (value < 40000000)   return "🦈";       // < 40 млн
  if (value < 100000000)  return "🐋";       // < 100 млн
  return "🪐🚀";                         // 100 млн+
}

function getIncomeEmoji(value) {
  if (value < 0)          return "❓❗";       // если вдруг отрицательно
  if (value < 200000)     return "🤔💸"; 
  if (value < 1000000)    return "😊💲";
  if (value < 5000000)    return "😎💵";
  if (value < 10000000)   return "🤑💰";
  if (value < 50000000)   return "🏦💰";
  return "🚀🤑"; // свыше 50 млн
}

function getExpenseEmoji(value) {
  if (value <= 0)         return "😶";       // может быть 0
  if (value < 300000)     return "🤏💵";
  if (value < 800000)     return "😬🛒";
  if (value < 5000000)    return "🤯💸";
  if (value < 20000000)   return "💸🥵";
  if (value < 50000000)   return "🔥💳";
  return "🔥🕳️";  // 50 млн+
}

function getDebtEmoji(value) {
  if (value < 0)          return "❓💳"; // бывает ли такое
  if (value < 500000)     return "😅💳";
  if (value < 5000000)    return "😓📉";
  if (value < 20000000)   return "🆘💀";
  return "💣💥"; // сверхогромный долг
}

function getDepositEmoji(value) {
  if (value < 0)          return "❗🏦"; 
  if (value < 500000)     return "🐖💰";
  if (value < 2000000)    return "💰💰";
  if (value < 10000000)   return "🏦📈";
  if (value < 50000000)   return "💎💎";
  return "💎🚀";
}

// При смене категории расходов
function updateSelectedCategory() {
  const select = document.getElementById("expense-category");
  if (!select) return;
  const selectedOption = select.options[select.selectedIndex].text;
  select.setAttribute("data-display", selectedOption);
}
document.addEventListener("DOMContentLoaded", updateSelectedCategory);

// Отметить долг как оплаченный
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

// Дополнительная функция для проверки, совпадает ли месяц даты с выбранным monthFilter
function checkIfSameMonth(dateStr, filterValue) {
  if (!dateStr) return false;
  // Если 'all', считаем, что оплаченный долг не даёт эффекта (итог = 0)
  if (filterValue === 'all') return false;
  const mm = new Date(dateStr).toISOString().slice(5,7);
  return mm === filterValue;
}

// Фильтр по кликам на блоки Доход, Расход, Долг и т.д.
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

// Основная функция обновления UI
function updateUI() {
  console.log('updateUI called.');
  const budget = budgets[currentBudgetIndex];
  if (!budget) return;
  const transactions = budget.transactions || [];
  
  // Фильтр по месяцу (строка "Все" => data-value="all")
  const monthFilter = document.getElementById('month-filter-input').getAttribute('data-value') || 'all';
  
  // Сначала фильтруем общий набор транзакций по месяцу
  let filtered = transactions.filter(t => {
    // Для долга тоже возвращаем true, чтобы была видна запись в списке
    if (t.type === 'debt') return true;
    
    if (monthFilter === 'all') return true;
    // Смотрим месяц транзакции
    const tMonth = new Date(t.date).toISOString().slice(5, 7);
    return tMonth === monthFilter;
  });

  // Считаем суммарные доходы, расходы, вклады (без учёта долгов!)
  const totalIncome = filtered
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpense = filtered
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalDeposit = filtered
    .filter(t => t.type === 'deposit')
    .reduce((sum, t) => {
      return sum + (t.status === '➕ Пополнение' ? t.amount : -t.amount);
    }, 0);

  // Начальный бюджет (до учёта долгов)
  let overallBudget = totalIncome - totalExpense - totalDeposit;

  // Считаем «объём» активных долгов + корректируем бюджет
  let totalDebt = 0; 

  // Проходимся по ВСЕМ (уже отфильтрованным по месяцу) долговым транзакциям 
  filtered
    .filter(t => t.type === 'debt')
    .forEach(t => {
      // Если долг не оплачен => действует «текущий» эффект
      if (!t.paid) {
        if (t.direction === 'owe') {
          // я должен => сейчас эти деньги у меня (пока не заплатил)
          // +Budget, +Debt
          overallBudget += t.amount;
          totalDebt += t.amount;
        } else {
          // мне должны => я отдал деньги
          // -Budget, +Debt
          overallBudget -= t.amount;
          totalDebt += t.amount;
        }
      } else {
        // Долг оплачен => смотрим, в каком месяце он закрыт (paidDate)
        if (checkIfSameMonth(t.paidDate, monthFilter)) {
          // direction='owe' => именно в этом месяце я заплатил => -Budget
          // direction='owed' => в этом месяце мне вернули => +Budget
          if (t.direction === 'owe') {
            overallBudget -= t.amount;
          } else {
            overallBudget += t.amount;
          }
        }
      }
    });

  console.log("totalDebt =", totalDebt, "overallBudget =", overallBudget);

  // Анимированно отображаем в блоках
  const budgetEl  = document.querySelector('#block-budget .block-value');
  const incomeEl  = document.querySelector('#block-income .block-value');
  const expenseEl = document.querySelector('#block-expense .block-value');
  const depositEl = document.querySelector('#block-deposit .block-value');
  const debtEl    = document.querySelector('#block-debt .block-value');

  animateValue(budgetEl,  parseInt(budgetEl.textContent.replace(/\D/g, '')) || 0,  overallBudget,    800);
  animateValue(incomeEl,  parseInt(incomeEl.textContent.replace(/\D/g, '')) || 0,  totalIncome,      800);
  animateValue(expenseEl, parseInt(expenseEl.textContent.replace(/\D/g, '')) || 0, totalExpense,     800);
  animateValue(depositEl, parseInt(depositEl.textContent.replace(/\D/g, '')) || 0, totalDeposit,     800);
  animateValue(debtEl,    parseInt(debtEl.textContent.replace(/\D/g, '')) || 0,    totalDebt,        800);

  document.querySelector('#block-budget .emoji').textContent  = getBudgetEmoji(overallBudget);
  const incomeEmojiEl = document.querySelector('#block-income .emoji');
  if (incomeEmojiEl) incomeEmojiEl.textContent = getIncomeEmoji(totalIncome);
  document.querySelector('#block-expense .emoji').textContent = getExpenseEmoji(totalExpense);
  document.querySelector('#block-debt .emoji').textContent    = getDebtEmoji(totalDebt);
  const depositEmojiEl = document.querySelector('#block-deposit .emoji');
  if (depositEmojiEl) depositEmojiEl.textContent = getDepositEmoji(totalDeposit);

  // Дополнительно фильтруем транзакции, чтобы показать нужные типы (transactionFilter)
  let finalFiltered = filtered.filter(t => {
    if (transactionFilter !== 'all' && t.type !== transactionFilter) {
      return false;
    }
    return true;
  });

  // Обновляем список транзакций
  updateTransactionList(finalFiltered);
}

// Вызов attachFilterEventListeners один раз
document.addEventListener('DOMContentLoaded', () => {
  attachFilterEventListeners();
});

// Список транзакций
function updateTransactionList(transactions) {
  console.log('updateTransactionList called, count =', transactions.length);
  const list = document.getElementById('transaction-list');
  list.innerHTML = '';
  
  // Сортируем по дате убыв. (свежие сверху)
  transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
  
  transactions.forEach(t => {
    const li = document.createElement('li');
    li.style.borderLeftColor = getTypeColor(t.type);

    // Если это долг, сформируем тег #Должен / #Мне должны
    let debtTag = '';
    if (t.type === 'debt') {
      if (t.direction === 'owe') {
        debtTag = ' <span style="color: #e82b2a; font-size: 0.9em;">#Должен</span>';
      } else {
        debtTag = ' <span style="color: #2be82a; font-size: 0.9em;">#Мне должны</span>';
      }
    }

    // Добавляем знак для вкладов
    let amountSign = '';
    if (t.type === 'deposit') {
      amountSign = t.status === '➕ Пополнение' ? '+' : '-';
    }

    li.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: nowrap;">
      <div style="max-width: 75%; overflow: hidden; word-break: break-word;">
        <strong>${getTypeName(t.type)}: </strong>${t.category || t.name}${debtTag}
      </div>
      <div style="font-weight: bold; white-space: nowrap; margin-left: 10px;">
        ${amountSign}${formatNumber(t.amount)}
      </div>
    </div>
    <div style="font-size: 0.8em; color: gray; text-align: right;">
      ${formatDate(t.date)}
    </div>
    ${
      t.type === 'debt'
        ? t.paid
          ? `<span style="color: green; font-weight: bold;">✅ Оплачено</span>`
          : `<button class="pay-debt" data-id="${t.id}">Оплатить</button>`
        : ''
    }
  `;

    // Переход к деталям по клику на элемент
    li.addEventListener('click', () => openTransactionDetail(t));
    list.appendChild(li);
  });

  // Кнопка "Оплатить" (для долгов)
  document.querySelectorAll('.pay-debt').forEach(button => {
    button.addEventListener('click', (event) => {
      event.stopPropagation(); // чтобы не открывались детали
      const debtId = parseInt(event.target.dataset.id, 10);
      markDebtAsPaid(debtId);
    });
  });
}

// Открытие деталей транзакции
function openTransactionDetail(transaction) {
  document.getElementById('detail-type').textContent = getTypeName(transaction.type);

  // Если это долг, добавим тег #Должен / #Мне должны к названию
  if (transaction.type === 'debt') {
    const directionTag = transaction.direction === 'owe' ? ' #Должен' : ' #Мне должны';
    document.getElementById('detail-name').textContent = (transaction.name || transaction.category) + directionTag;
  } else {
    document.getElementById('detail-name').textContent = transaction.category || transaction.name;
  }

  document.getElementById('detail-amount').textContent = 'Сумма: ' + formatNumber(transaction.amount);
  document.getElementById('detail-date').textContent = 'Дата: ' + formatDate(transaction.date);

  // Показать/скрыть статус (для вкладов)
  const detailStatus = document.getElementById('detail-status');
  if (transaction.type === 'deposit') {
    detailStatus.classList.remove('hidden');
    detailStatus.textContent = 'Статус: ' + transaction.status;
  } else {
    detailStatus.classList.add('hidden');
  }

  // Показать/скрыть список товаров (для расходов)
  const prodDiv = document.getElementById('detail-products');
  if (transaction.type === 'expense' && transaction.products && transaction.products.length) {
    prodDiv.classList.remove('hidden');
    prodDiv.innerHTML = '<strong>Товары:</strong><br>' +
      transaction.products.map(p => `${p.name} (${p.quantity} x ${formatNumber(p.price)})`).join('<br>');
  } else {
    prodDiv.classList.add('hidden');
  }

  // Кнопка "Оплатить долг" (если это debt и ещё не оплачено)
  const payDebtBtn = document.getElementById('pay-debt');
  if (transaction.type === 'debt' && !transaction.paid) {
    payDebtBtn.classList.remove('hidden');
    payDebtBtn.onclick = () => markDebtAsPaid(transaction.id);
  } else {
    payDebtBtn.classList.add('hidden');
  }

  // Кнопка "Удалить транзакцию"
  document.getElementById('delete-transaction').onclick = () => {
    deleteTransaction(transaction.id);
    closeModal('transaction-detail-sheet');
  };

  openModal('transaction-detail-sheet');
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

  // Кнопка добавления транзакции => открываем bottom-sheet
  document.getElementById('add-btn').addEventListener('click', () => {
    const today = new Date().toISOString().split('T')[0];
    ['income-date','expense-date','debt-date','deposit-date'].forEach(id => {
      document.getElementById(id).value = today;
    });

    // По умолчанию показываем форму доходов (и чипсу доходов)
    hideAllForms();
    openForm('income-form');
    // Можно дополнительно сбросить "active" на чипсах и подсветить "Доходы"
    document.querySelectorAll('.transaction-type-chips .chip-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    const incomeBtn = document.querySelector('.transaction-type-chips .chip-btn[data-type="income"]');
    if (incomeBtn) incomeBtn.classList.add('active');

    openModal('transaction-sheet');
  });

  // Переключение форм внутри bottom-sheet (чипсы)
  document.querySelectorAll('.transaction-type-chips .chip-btn').forEach(button => {
    button.addEventListener('click', () => {
      // 1. Снимаем "active" со всех чипсов
      document.querySelectorAll('.transaction-type-chips .chip-btn').forEach(btn => {
        btn.classList.remove('active');
      });
      // 2. Подсвечиваем текущую нажатую
      button.classList.add('active');
      
      // 3. Прячем все формы
      hideAllForms();
      
      // 4. Открываем нужную форму
      const type = button.getAttribute('data-type'); 
      if (type === 'income')  openForm('income-form');
      if (type === 'expense') openForm('expense-form');
      if (type === 'debt')    openForm('debt-form');
      if (type === 'deposit') openForm('deposit-form');
    });
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
    const productCount = productsList.children.length;
    const container = document.createElement('div');
    container.classList.add('product-item');
    
    container.innerHTML = `
      <input type="text" class="product-name" placeholder="Название" maxlength="16" list="product-names-list">
      <input type="tel" class="product-quantity numeric-format" placeholder="Кол-во" required maxlength="4">
      <input type="tel" class="product-price numeric-format" placeholder="Цена" required maxlength="11" inputmode="numeric">
      ${ productCount >= 1 ? `<button type="button" class="delete-product" title="Удалить товар">×</button>` : '' }
    `;
    
    productsList.appendChild(container);

    // Добавляем обработчики для новых полей ввода
    const quantityInput = container.querySelector('.product-quantity');
    const priceInput = container.querySelector('.product-price');
    
    // Обработчик для поля количества
    quantityInput.addEventListener('input', (e) => {
      const cursorPosition = quantityInput.selectionStart;
      let value = quantityInput.value.replace(/[^0-9.,]/g, '');
      quantityInput.value = value;
      quantityInput.setSelectionRange(cursorPosition, cursorPosition);
    });

    quantityInput.addEventListener('blur', () => {
      const rawValue = quantityInput.value.replace(',', '.').replace(/\s/g, '');
      let num = parseFloat(rawValue);
      if (isNaN(num)) {
        num = 0;
      }
      quantityInput.value = rawValue;
    });

    // Обработчик для поля цены
    priceInput.addEventListener('input', (e) => {
      const cursorPosition = priceInput.selectionStart;
      let value = priceInput.value.replace(/[^0-9.,]/g, '');
      const rawValue = value.replace(',', '.');
      let num = parseFloat(rawValue);
      if (isNaN(num)) {
        num = 0;
      }
      
      let formatted = num.toLocaleString('ru-RU', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3
      });
      formatted = formatted.replace(/\u00A0/g, ' ');
      
      priceInput.value = formatted;
      const newCursorPosition = cursorPosition + (formatted.length - value.length);
      priceInput.setSelectionRange(newCursorPosition, newCursorPosition);
    });

    priceInput.addEventListener('blur', () => {
      const rawValue = priceInput.value.replace(',', '.').replace(/\s/g, '');
      let num = parseFloat(rawValue);
      if (isNaN(num)) {
        num = 0;
      }
      
      let formatted = num.toLocaleString('ru-RU', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3
      });
      formatted = formatted.replace(/\u00A0/g, ' ');
      
      priceInput.value = formatted;
    });

    const deleteBtn = container.querySelector('.delete-product');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        container.remove();
      });
    }
  });

  // Страница настроек
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

  // Заменяем все select на кастомные кнопки
  document.querySelectorAll('select').forEach(select => {
    // Проверяем, не был ли уже создан контейнер для этого select
    if (select.parentNode.querySelector('.category-select-container')) {
      return; // Пропускаем, если контейнер уже существует
    }

    // Создаем контейнер для кнопки и скрытого input
    const container = document.createElement('div');
    container.className = 'category-select-container';
    
    // Создаем кастомную кнопку
    const button = document.createElement('button');
    button.className = 'category-select-button';
    button.textContent = select.options[select.selectedIndex]?.text || 'Выберите категорию';
    
    // Создаем скрытый input для хранения значения
    const hiddenInput = document.createElement('input');
    hiddenInput.type = 'hidden';
    hiddenInput.name = 'category';
    hiddenInput.value = select.value;
    
    // Добавляем обработчик клика на кнопку
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const currentSheet = document.getElementById('transaction-sheet');
      if (currentSheet && !currentSheet.classList.contains('hidden')) {
        openCategorySheet(currentSheet);
      }
    });
    
    // Вставляем элементы в DOM
    container.appendChild(button);
    container.appendChild(hiddenInput);
    select.style.display = 'none';
    select.parentNode.insertBefore(container, select);
  });

  // Обработчик клика по backdrop для закрытия модальных окон
  const backdrop = document.getElementById('bottom-sheet-backdrop');
  if (backdrop) {
    backdrop.addEventListener('click', function(e) {
      if (e.target === e.currentTarget) {
        // Закрываем все модальные окна
        document.querySelectorAll('.bottom-sheet').forEach(sheet => {
          sheet.classList.add('hidden');
        });
        // Скрываем backdrop
        this.classList.add('hidden');
      }
    });
  }
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

// Доход
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

// Расход
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
    const rawQuantity = quantityInput.value.trim();
    // Если пользователь ввёл запятую — заменим на точку
    const preparedQuantity = rawQuantity.replace(',', '.');

    // Парсим как число с плавающей точкой
    const quantity = parseFloat(preparedQuantity);

    // Аналогично для цены
    const rawPrice = priceInput.value.replace(/\s+/g, '').replace(',', '.');
    const onlyDigitsAndDot = rawPrice.replace(/[^0-9.]/g, ''); 
    const price = parseFloat(onlyDigitsAndDot) || 0;

    // Проверяем валидность
    if (isNaN(quantity) || quantity <= 0) {
      showInlineError(quantityInput, 'Укажите корректное количество, например 0.5');
      isFormValid = false;
    }
    if (isNaN(price) || price <= 0) {
      showInlineError(priceInput, 'Укажите корректную цену');
      isFormValid = false;
    }

    // Если всё корректно, считаем подытог
    const itemTotal = quantity * price;

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

  // Сохраним новые названия товаров в общий список для автокомплита
  products.forEach(p => {
    if (p.name && !productNames.includes(p.name)) {
      productNames.push(p.name);
    }
  });
  updateProductDatalist();

  form.reset();
  // Сброс формы: один «пустой» товар
  document.getElementById('products-list').innerHTML = `
    <div class="product-item">
      <input type="text" class="product-name" placeholder="Название" maxlength="16" list="product-names-list">
      <input type="tel" class="product-quantity" placeholder="Кол-во" required maxlength="3">
      <input type="tel" class="product-price" placeholder="Цена" required maxlength="11" inputmode="numeric">
    </div>
  `;
  // Вызывем снова applyInputRestrictions или аналогичный подход, если нужно
  // но обработка blur для numeric-format сделана ниже

  closeModal('transaction-sheet');
}

// Долг
function submitDebt(e) {
  e.preventDefault();
  console.log('submitDebt called.');
  const form = e.target;
  const nameInput = form['debt-name'];
  clearInlineError(nameInput);
  const amountInput = form['debt-amount'];
  clearInlineError(amountInput);
  const directionSelect = form['debt-direction'];
  clearInlineError(directionSelect);

  const amount = parseInt(amountInput.value.replace(/\D/g, ''), 10) || 0;
  if (nameInput.value.trim() === '') {
    showInlineError(nameInput, 'Введите имя');
    return;
  }
  if (amount <= 0) {
    showInlineError(amountInput, 'Введите корректную сумму');
    return;
  }
  if (!directionSelect.value) {
    showInlineError(directionSelect, 'Выберите тип долга');
    return;
  }

  // ВАЖНО: сохраняем direction
  const transaction = {
    id: Date.now(),
    type: 'debt',
    date: form['debt-date'].value,
    name: nameInput.value.trim(),
    amount,
    paid: false,
    direction: directionSelect.value // 'owe' | 'owed'
  };
  addTransaction(transaction);
  form.reset();
  closeModal('transaction-sheet');
}

// Вклад
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

// Добавить транзакцию в текущий бюджет
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
  // 1. При вводе разрешаем только цифры, точку и запятую
  input.addEventListener('input', (e) => {
    // Сохраняем позицию курсора
    const cursorPosition = input.selectionStart;
    
    // Убираем всё, кроме цифр, точек и запятых
    let value = input.value.replace(/[^0-9.,]/g, '');
    
    // Заменяем запятую на точку для парсинга
    const rawValue = value.replace(',', '.');
    let num = parseFloat(rawValue);
    if (isNaN(num)) {
      num = 0;
    }
    
    // Для поля количества в форме расходов используем другой формат
    if (input.classList.contains('product-quantity')) {
      // Оставляем дробную часть как есть, без форматирования тысяч
      input.value = value;
      // Восстанавливаем позицию курсора
      input.setSelectionRange(cursorPosition, cursorPosition);
    } else {
      // Для остальных полей (включая цену) форматируем с разделителями тысяч
      let formatted = num.toLocaleString('ru-RU', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3
      });
      
      // Меняем неразрывные пробелы на обычные
      formatted = formatted.replace(/\u00A0/g, ' ');
      
      // Обновляем значение
      input.value = formatted;
      
      // Восстанавливаем позицию курсора с учетом добавленных пробелов
      const newCursorPosition = cursorPosition + (formatted.length - value.length);
      input.setSelectionRange(newCursorPosition, newCursorPosition);
    }
  });

  // 2. При потере фокуса форматируем с разделением на тысячи
  input.addEventListener('blur', () => {
    // Заменяем запятую на точку, чтоб parseFloat корректно понял дробь
    const rawValue = input.value.replace(',', '.').replace(/\s/g, '');
    let num = parseFloat(rawValue);
    if (isNaN(num)) {
      num = 0;
    }

    // Для поля количества в форме расходов используем другой формат
    if (input.classList.contains('product-quantity')) {
      // Оставляем дробную часть как есть, без форматирования тысяч
      input.value = rawValue;
    } else {
      // Для остальных полей (включая цену) форматируем с разделителями тысяч
      let formatted = num.toLocaleString('ru-RU', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3
      });
      
      // Меняем неразрывные пробелы на обычные
      formatted = formatted.replace(/\u00A0/g, ' ');
      
      input.value = formatted;
    }
  });
});


// Экспорт / Импорт
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

// Утилиты форматирования
function formatNumber(num) {
  return num.toLocaleString('ru-RU', {
    minimumFractionDigits: 0, // или 2, если нужны всегда две копейки
    maximumFractionDigits: 2  // ограничить максимум 2 знаками
  });
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
    income:  rootStyles.getPropertyValue('--income-color').trim(),
    expense: rootStyles.getPropertyValue('--expense-color').trim(),
    debt:    rootStyles.getPropertyValue('--debt-color').trim(),
    deposit: rootStyles.getPropertyValue('--deposit-color').trim()
  };
  return map[type] || 'black';
}
function validateBudgetName(name) {
  // Разрешаем буквы, цифры, пробелы, emoji
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
  // Для обычных текстовых полей оставляем ограничение символов
  document.querySelectorAll('input[type="text"]').forEach(input => {
    input.addEventListener('input', e => {
      // Убираем недопустимые символы
      e.target.value = e.target.value.replace(/[^\p{L}\p{N}\p{Emoji}\s]/gu, '').slice(0, 20);
    });
  });

  // Если вы хотите убрать логику для inputmode="numeric",
  // можете раскомментировать или удалить её.
  // Но в целом, ниже — лишний код, раз у нас уже есть "Вариант B" для .numeric-format
  /*
  document.querySelectorAll('input[inputmode="numeric"]').forEach(input => {
    input.addEventListener('input', e => {
      const raw = e.target.value.replace(/\D/g, '');
      e.target.value = raw.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1.');
    });
  });
  */
}

// Список бюджетов (для bottom-sheet переключения)
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
      const idx = parseInt(event.target.dataset.index, 10);
      openDeleteConfirmation(idx);
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
      document.getElementById('bottom-sheet-backdrop').classList.add('hidden');
    }
  });
  document.getElementById('cancel-delete-budget').addEventListener('click', () => {
    budgetToDelete = null;
    document.getElementById('delete-budget-modal').classList.add('hidden');
    document.getElementById('bottom-sheet-backdrop').classList.add('hidden');
  });
  document.getElementById('export-before-delete').addEventListener('click', exportData);
});

document.addEventListener('DOMContentLoaded', () => {
  const slidesContainer = document.querySelector('.slides-container');
  if (!slidesContainer) return; // если нет баннеров, выходим

  const slides = document.querySelectorAll('.banner-slide');
  let slideIndex = 0;

  // Функция, которая сдвигает контейнер на нужный слайд
  function showSlide(index) {
    slidesContainer.style.transform = `translateX(-${index * 100}%)`;
  }

  // Функция, переключающаяся на следующий слайд
  function nextSlide() {
    slideIndex = (slideIndex + 1) % slides.length;
    showSlide(slideIndex);
  }

  // Запускаем автоскролл (каждые 3 секунды)
  const intervalId = setInterval(nextSlide, 6000);

  // При клике на слайд — проверяем data-link
  slides.forEach(slide => {
    slide.addEventListener('click', () => {
      const link = slide.dataset.link;
      if (link) {
        // Открываем ссылку в новой вкладке
        window.open(link, '_blank');
      }
      // Если data-link нет, значит баннер неактивный
    });
  });
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

// Функция для открытия bottom-sheet с категориями
function openCategorySheet(currentSheet) {
  // Находим активную форму в текущем bottom-sheet
  const activeForm = currentSheet.querySelector('.transaction-form:not(.hidden)');
  if (!activeForm) {
    console.error('No active form found in current sheet');
    return;
  }

  // Находим select элемент в активной форме
  const currentSelect = activeForm.querySelector('select[id$="-category"], select[id$="-status"], select[id$="-direction"]');
  if (!currentSelect) {
    console.error('No select element found in active form');
    return;
  }

  // Находим список категорий
  const categoryList = document.querySelector('#category-sheet .category-list');
  if (!categoryList) {
    console.error('No category list found');
    return;
  }

  // Очищаем список категорий
  categoryList.innerHTML = '';

 // Добавляем категории с раскрывающимися optgroup
Array.from(currentSelect.children).forEach(child => {
  if (child.tagName === 'OPTGROUP') {
    const wrapper = document.createElement('div');
    wrapper.className = 'optgroup-wrapper';

    // Заголовок группы
    const groupLabel = document.createElement('div');
    groupLabel.className = 'category-group-label dropdown-toggle';
    groupLabel.textContent = `▶ ${child.label}`;
    wrapper.appendChild(groupLabel);

    // Контейнер опций
    const optionsContainer = document.createElement('div');
    optionsContainer.className = 'group-options hidden';

    // Добавляем option в контейнер
    Array.from(child.children).forEach(option => {
      if (!option.value) return;
      const li = document.createElement('li');
      li.className = 'category-item';
      li.textContent = option.text;
      li.addEventListener('click', () => {
        currentSelect.value = option.value;

        const button = activeForm.querySelector('.category-select-button');
        if (button) button.textContent = option.text;

        const hiddenInput = activeForm.querySelector('input[type="hidden"][name="category"]');
        if (hiddenInput) hiddenInput.value = option.value;

        document.getElementById('category-sheet').classList.add('hidden');
      });
      optionsContainer.appendChild(li);
    });

    // Клик по заголовку — сворачивает/разворачивает
    groupLabel.addEventListener('click', () => {
      const isHidden = optionsContainer.classList.contains('hidden');
      optionsContainer.classList.toggle('hidden', !isHidden);
      groupLabel.textContent = `${isHidden ? '▼' : '▶'} ${child.label}`;
    });

    wrapper.appendChild(optionsContainer);
    categoryList.appendChild(wrapper);

  } else if (child.tagName === 'OPTION' && child.value) {
    const li = document.createElement('li');
    li.className = 'category-item';
    li.textContent = child.text;
    li.addEventListener('click', () => {
      currentSelect.value = child.value;

      const button = activeForm.querySelector('.category-select-button');
      if (button) button.textContent = child.text;

      const hiddenInput = activeForm.querySelector('input[type="hidden"][name="category"]');
      if (hiddenInput) hiddenInput.value = child.value;

      document.getElementById('category-sheet').classList.add('hidden');
    });
    categoryList.appendChild(li);
  }
});


  // Показываем backdrop и bottom-sheet с категориями
  const backdrop = document.getElementById('bottom-sheet-backdrop');
  const categorySheet = document.getElementById('category-sheet');
  
  if (backdrop && categorySheet) {
    backdrop.classList.remove('hidden');
    categorySheet.classList.remove('hidden');
    
    // Устанавливаем z-index для правильного отображения
    backdrop.style.zIndex = '1099';
    currentSheet.style.zIndex = '1100';
    categorySheet.style.zIndex = '1101';
  } else {
    console.error('Backdrop or category sheet not found');
  }
}

// Обработчик закрытия bottom-sheet с категориями
const closeButton = document.querySelector('.close-category-sheet');
if (closeButton) {
  closeButton.addEventListener('click', () => {
    const categorySheet = document.getElementById('category-sheet');
    if (categorySheet) categorySheet.classList.add('hidden');
  });
}

// Функция для инициализации кнопок выбора категорий
function initializeCategoryButtons() {
  // Находим все select элементы для категорий и статусов
  const categorySelects = document.querySelectorAll('select[id$="-category"], select[id$="-status"]');
  
  categorySelects.forEach(select => {
    // Проверяем, не создан ли уже контейнер для этого select
    if (select.previousElementSibling && select.previousElementSibling.classList.contains('category-select-container')) {
      return; // Пропускаем, если контейнер уже существует
    }

    // Создаем контейнер для кнопки
    const container = document.createElement('div');
    container.className = 'category-select-container';

    // Создаем кнопку
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'category-select-button';
    button.textContent = select.options[select.selectedIndex]?.text || 'Выберите категорию';

    // Создаем скрытый input для хранения значения
    const hiddenInput = document.createElement('input');
    hiddenInput.type = 'hidden';
    hiddenInput.name = 'category';
    hiddenInput.value = select.value;

    // Добавляем обработчик клика на кнопку
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Находим ближайший bottom-sheet
      const currentSheet = select.closest('.bottom-sheet');
      if (currentSheet && !currentSheet.classList.contains('hidden')) {
        openCategorySheet(currentSheet);
      } else {
        console.error('No visible bottom sheet found');
      }
    });

    // Добавляем элементы в контейнер
    container.appendChild(button);
    container.appendChild(hiddenInput);

    // Вставляем контейнер перед select
    select.parentNode.insertBefore(container, select);

    // Скрываем оригинальный select
    select.style.display = 'none';
  });
}


