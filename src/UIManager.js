// UIManager.js
import { formatNumber, formatDate, getTypeColor, getTypeName } from './utils/utils.js';
import {
  getBudgetEmoji,
  getIncomeEmoji,
  getExpenseEmoji,
  getDebtEmoji,
  getDepositEmoji
} from './utils/emojiMap.js';
import { monthNames } from '../constants/constants.js';

export class UIManager {
  constructor(budgetManager) {
    this.budgetManager     = budgetManager;
    this.transactionFilter = 'all';
    this.monthFilter       = 'all';
    this.monthNames        = monthNames;
    this.formatNumber      = formatNumber;
    this.formatDate        = formatDate;
    this.getTypeName       = getTypeName;
    this.getTypeColor      = getTypeColor;
  }

    initialize() {
    this.budgetManager.loadFromStorage();

    // Защита от запуска без бюджета
    if (!this.budgetManager.budgets.length) return;

    this.updateHeader();
    this.initializeMonthFilter();
    this.updateUI();
    this.attachEventListeners();
    this.bindNumericFormats();
    this.initializeBannerCarousel();
  }

  initializeMonthFilter() {
    const container = document.getElementById('month-filter-container');
    if (!container) return;

    const button = container.querySelector('.custom-select-button');
    const optionsContainer = container.querySelector('.custom-select-options');
    const options = optionsContainer.querySelectorAll('div');

    // Установка текущего месяца по умолчанию
    const today = new Date();
    const currentMonth = String(today.getMonth() + 1).padStart(2, '0');
    const defaultOption = Array.from(options).find(opt => opt.getAttribute('data-value') === currentMonth) || options[0];
    button.textContent = defaultOption.textContent;
    button.setAttribute('data-value', defaultOption.getAttribute('data-value'));
    this.monthFilter = defaultOption.getAttribute('data-value');

    // Обработчик клика по кнопке для показа/скрытия списка
    button.addEventListener('click', () => {
        optionsContainer.classList.toggle('hidden');
    });

    // Обработчик выбора опции
    options.forEach(option => {
        option.addEventListener('click', () => {
            button.textContent = option.textContent;
            button.setAttribute('data-value', option.getAttribute('data-value'));
            this.monthFilter = option.getAttribute('data-value');
            optionsContainer.classList.add('hidden');
            this.updateUI(); // Обновляем UI при выборе месяца
        });
    });

    // Закрытие списка при клике вне селекта
    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            optionsContainer.classList.add('hidden');
        }
    });
  }

  updateHeader() {
    const headerEl = document.getElementById('current-budget');
    headerEl.textContent = this.budgetManager.getCurrentBudget()?.name || 'BudgetIt';
  }

  updateUI() {
    const selectButton = document.querySelector('#month-filter-container .custom-select-button');
    this.monthFilter = selectButton?.getAttribute('data-value') || 'all';

    const totals = this.budgetManager.calculateTotals(this.monthFilter);
    ['budget', 'income', 'expense', 'deposit', 'debt'].forEach(type => {
        const value = totals[{
            budget: 'overallBudget', income: 'monthlyIncome', expense: 'monthlyExpense',
            deposit: 'depositBalance', debt: 'totalDebt'
        }[type]];
        const el = document.querySelector(`#block-${type} .block-value`);
        this.animateValue(el, value, 800);
        document.querySelector(`#block-${type} .emoji`).textContent = {
            budget: getBudgetEmoji, income: getIncomeEmoji, expense: getExpenseEmoji,
            deposit: getDepositEmoji, debt: getDebtEmoji
        }[type](value);
    });

    const allTx = this.budgetManager.getCurrentBudget().transactions || [];
    const filtered = allTx.filter(tx =>
        (this.transactionFilter === 'all' || tx.type === this.transactionFilter)
        && (this.monthFilter === 'all' || tx.date.slice(5, 7) === this.monthFilter)
    );
    this.updateTransactionList(filtered);
  }

  updateTransactionList(transactions) {
    console.log('updateTransactionList called, count =', transactions.length);
    const list = document.getElementById('transaction-list');
    list.innerHTML = '';
  
    transactions.sort((a, b) => new Date(b.date) - new Date(a.date))
      .forEach(t => {
        const li = document.createElement('li');
        li.style.borderLeftColor = this.getTypeColor(t.type);
  
        let debtTag = '';
        if (t.type === 'debt') {
          debtTag = t.direction === 'owe'
            ? ' <span style="color:#e82a2a;font-size:.9em">#Должен</span>'
            : ' <span style="color:#2be82a;font-size:.9em">#Мне должны</span>';
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
  
        const displayAmount = t.type === 'debt'
          ? (t.direction === 'owe' ? '-' : '+') + this.formatNumber(t.remainingAmount || t.initialAmount)
          : amountSign + this.formatNumber(t.amount);
  
        const displayDate = this.formatDate(t.date);
  
        li.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:nowrap;">
            <div style="max-width:75%;overflow:hidden;word-break:break-word;">
              <strong>${this.getTypeName(t.type)}: </strong>${t.category||t.name}${debtTag}
            </div>
            <div style="font-weight:bold;white-space:nowrap;margin-left:10px;">
              ${displayAmount}
            </div>
          </div>
          <div style="font-size:.8em;color:gray;text-align:right;">
            ${displayDate}
          </div>
          ${t.type==='debt'
            ? t.paid
              ? '<span style="color:green;font-weight:bold">✅ Оплачено</span>'
              : `<button class="pay-debt" data-id="${t.id}">Оплатить</button>`
            : ''}
        `;
  
        li.addEventListener('click', () => this.openTransactionDetail(t));
        list.appendChild(li);
      });
  
    list.querySelectorAll('.pay-debt').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = +btn.dataset.id;
        const tx = this.budgetManager.getCurrentBudget().transactions.find(t => t.id === id);
        const remaining = tx.remainingAmount || tx.initialAmount || tx.amount;
        this.openDebtPaymentModal(id, remaining);
      });
    });
  }
  
  openModal(id) {
    const m = document.getElementById(id);
    if (!m) return;
    if (m.classList.contains('bottom-sheet'))
      document.getElementById('bottom-sheet-backdrop').classList.remove('hidden');
    m.classList.remove('hidden');
  }

  closeModal(id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.classList.add('hidden');
    if (!document.querySelector('.bottom-sheet:not(.hidden)'))
      document.getElementById('bottom-sheet-backdrop').classList.add('hidden');
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

  initializeBannerCarousel() {
    const container = document.querySelector('.banner-carousel .slides-container');
    if (!container) return;
    const slides = Array.from(container.querySelectorAll('.banner-slide'));
    container.style.display = 'flex';
    container.style.transition = 'transform 0.5s ease';
    container.style.touchAction = 'pan-y';
    slides.forEach(slide => slide.style.minWidth = '100%');
    let current = 0, startX = 0, isDragging = false, translateX = 0;
    container.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      isDragging = true;
      container.style.transition = 'none';
      translateX = current * -100;
    });
    container.addEventListener('touchmove', (e) => {
      if (!isDragging) return;
      const diff = e.touches[0].clientX - startX;
      container.style.transform = `translateX(${translateX + diff / container.offsetWidth * 100}%)`;
    });
    container.addEventListener('touchend', (e) => {
      if (!isDragging) return;
      isDragging = false;
      container.style.transition = 'transform 0.5s ease';
      const diff = e.changedTouches[0].clientX - startX;
      if (diff > 50) current = Math.max(current - 1, 0);
      else if (diff < -50) current = Math.min(current + 1, slides.length - 1);
      container.style.transform = `translateX(-${current * 100}%)`;
    });
    const autoScroll = setInterval(() => {
      if (!isDragging) {
        current = (current + 1) % slides.length;
        container.style.transform = `translateX(-${current * 100}%)`;
      }
    }, 5000);
    slides.forEach(slide => {
      const url = slide.dataset.link;
      if (url) {
        slide.style.cursor = 'pointer';
        slide.addEventListener('click', () => window.open(url, '_blank'));
      }
    });
    container.dataset.intervalId = autoScroll;
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
    const detailType = document.getElementById('detail-type');
    const detailName = document.getElementById('detail-name');
    const detailAmount = document.getElementById('detail-amount');
    const detailDate = document.getElementById('detail-date');
    const detailStatus = document.getElementById('detail-status');
    const prodDiv = document.getElementById('detail-products');
    const payDebtBtn = document.getElementById('pay-debt-detail');
    const paidLabel = document.getElementById('debt-paid-label');
    const debtProgress = document.getElementById('detail-debt-progress');
    const debtRemaining = document.getElementById('detail-debt-remaining');
    const debtPayments = document.getElementById('detail-debt-payments');
    const payAgainBtn = document.getElementById('detail-pay-again');

    if (!detailType || !detailName || !detailAmount || !detailDate || !detailStatus) {
      console.error('Один или несколько элементов деталей транзакции не найдены');
      return;
    }

    detailType.textContent = this.getTypeName(transaction.type) || 'Неизвестный тип';
    detailName.textContent = transaction.type === 'debt'
      ? `${transaction.name || transaction.category || 'Без названия'} ${transaction.direction === 'owe' ? '#Должен' : '#Мне должны'}`
      : transaction.category || transaction.name || 'Без категории';

    if (transaction.type === 'debt') {
      const paidSum = (transaction.payments || []).reduce((s, p) => s + p.amount, 0);
      const total = transaction.initialAmount || transaction.amount || 0;
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
        debtPayments.innerHTML = `<strong>Платежи:</strong><br>` +
          (transaction.payments || []).map(p => `• ${this.formatDate(p.date)} — ${this.formatNumber(p.amount)}`).join('<br>');
      }
      if (payAgainBtn) {
        if (!transaction.paid) {
          payAgainBtn.classList.remove('hidden');
          payAgainBtn.onclick = () => {
            this.closeModal('transaction-detail-sheet');
            const r = transaction.remainingAmount || transaction.initialAmount || transaction.amount;
            this.openDebtPaymentModal(transaction.id, r);
          };
        } else {
          payAgainBtn.classList.add('hidden');
        }
      }
    } else {
      detailAmount.textContent = `Сумма: ${this.formatNumber(transaction.amount || 0)}`;
      if (debtProgress) debtProgress.classList.add('hidden');
      if (debtPayments) debtPayments.classList.add('hidden');
      if (debtRemaining) debtRemaining.classList.add('hidden');
      if (payAgainBtn) payAgainBtn.classList.add('hidden');
    }

    detailDate.textContent = `Дата: ${this.formatDate(transaction.date || new Date())}`;
    if (transaction.type === 'deposit' && transaction.status) {
      detailStatus.classList.remove('hidden');
      detailStatus.textContent = `Статус: ${transaction.status}`;
    } else {
      detailStatus.classList.add('hidden');
    }

    if (transaction.type === 'expense' && transaction.products?.length) {
      prodDiv.classList.remove('hidden');
      prodDiv.innerHTML = `<strong>Товары:</strong><br>` +
        transaction.products.map(p => `${p.name} (${p.quantity} x ${this.formatNumber(p.price)})`).join('<br>');
    } else {
      prodDiv.classList.add('hidden');
    }

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

    document.getElementById('delete-transaction').onclick = () => {
      this.budgetManager.deleteTransaction(transaction.id);
      this.closeModal('transaction-detail-sheet');
      this.updateUI();
    };

    this.openModal('transaction-detail-sheet');
  }
  
  populateBudgetList() {
    const listDiv = document.querySelector('#budget-switch-sheet .budget-list');
    listDiv.innerHTML = '';
    this.budgetManager.budgets.forEach((b, index) => {
      const div = document.createElement('div');
      div.classList.add('budget-item');
      div.innerHTML = `<span>${b.name}</span><button class="delete-budget-btn" data-index="${index}">🗑️</button>`;
      div.addEventListener('click', () => {
        this.budgetManager.switchBudget(index);
        this.updateHeader();
        this.updateUI();
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
      this.budgetManager.deleteBudget(index);
      modal.classList.add('hidden');
      document.getElementById('bottom-sheet-backdrop').classList.add('hidden');

      if (this.budgetManager.budgets.length === 0) {
        // Очистка интерфейса перед редиректом
        document.getElementById('transaction-list').innerHTML = '';
        document.querySelectorAll('.summary-block .block-value').forEach(el => el.textContent = '0');
        document.getElementById('current-budget').textContent = 'BudgetIt';
        // Немедленный редирект на страницу онбординга
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

    document.getElementById('export-before-delete').onclick = () => this.exportData();
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

    document.getElementById('close-budget-sheet')?.addEventListener('click', () => this.closeModal('budget-switch-sheet'));

    document.getElementById('add-budget-btn')?.addEventListener('click', () => {
      const newNameInput = document.getElementById('new-budget-name');
      this.clearInlineError(newNameInput);
      const newName = newNameInput.value.trim();
      if (this.budgetManager.createBudget(newName)) {
        this.populateBudgetList();
        newNameInput.value = '';
      } else {
        this.showInlineError(newNameInput, 'Некорректное название бюджета!');
      }
    });

    ['budget', 'income', 'expense', 'deposit', 'debt'].forEach(type => {
      document.getElementById(`block-${type}`)?.addEventListener('click', () => {
        this.transactionFilter = type === 'budget' ? 'all' : type;
        this.updateUI();
      });
    });

    document.getElementById('add-btn')?.addEventListener('click', () => {
      const today = new Date().toLocaleDateString('en-CA');
      ['income-date', 'expense-date', 'debt-date', 'deposit-date'].forEach(id => {
        document.getElementById(id).value = today;
      });
      this.hideAllForms();
      this.openForm('income-form');
      document.querySelectorAll('.transaction-type-chips .chip-btn').forEach(btn => btn.classList.remove('active'));
      document.querySelector('.transaction-type-chips .chip-btn[data-type="income"]').classList.add('active');
      this.openModal('transaction-sheet');
    });

    document.querySelectorAll('.transaction-type-chips .chip-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.transaction-type-chips .chip-btn').forEach(b => b.classList.remove('active'));
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

    document.getElementById('close-settings')?.addEventListener('click', () => this.closeModal('settings-page'));
    document.getElementById('export-btn')?.addEventListener('click', () => this.exportData());
    document.getElementById('import-file')?.addEventListener('change', e => this.importData(e));
    document.getElementById('close-detail')?.addEventListener('click', () => this.closeModal('transaction-detail-sheet'));

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
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(() => {
          deferredPrompt = null;
          document.getElementById('install-btn').style.display = 'none';
        });
      } else console.warn('deferredPrompt не инициализирован');
    });

    document.getElementById('bottom-sheet-backdrop')?.addEventListener('click', e => {
      if (e.target === e.currentTarget) {
        document.querySelectorAll('.bottom-sheet').forEach(sheet => sheet.classList.add('hidden'));
        e.target.classList.add('hidden');
      }
    });

    this.initializeCategoryButtons();
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
      id: Date.now(),
      type: 'income',
      date: form['income-date'].value,
      category: hiddenCategoryInput.value,
      amount
    };
    this.budgetManager.addTransaction(transaction);
    form.reset();
    this.closeModal('transaction-sheet');
    this.updateUI();
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
      id: Date.now(),
      type: 'expense',
      date: form['expense-date'].value,
      category: hiddenCategoryInput.value,
      amount: totalAmount,
      products
    };
    this.budgetManager.addTransaction(transaction);
    this.updateProductDatalist();
    form.reset();
    document.getElementById('products-list').innerHTML = `
      <div class="product-item">
        <input type="text" class="product-name" placeholder="Название" maxlength="16" list="product-names-list">
        <input type="tel" class="product-quantity numeric-format" placeholder="Кол-во" required maxlength="4">
        <input type="tel" class="product-price numeric-format" placeholder="Цена" required maxlength="11" inputmode="numeric">
      </div>
    `;
    this.bindNumericFormats();
    this.closeModal('transaction-sheet');
    this.updateUI();
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
      id: Date.now(),
      type: 'debt',
      date: dateInput.value,
      name: nameInput.value.trim(),
      initialAmount: amount,
      remainingAmount: amount,
      paid: false,
      direction: directionSelect.value,
      payments: []
    };
    this.budgetManager.addTransaction(transaction);
    dateInput.value = '';
    nameInput.value = '';
    amountInput.value = '';
    directionSelect.value = '';
    this.closeModal('transaction-sheet');
    this.updateUI();
  }

  submitDeposit(e) {
    e.preventDefault();
    const dateInput = document.getElementById('deposit-date');
    const nameInput = document.getElementById('deposit-name');
    const amountInput = document.getElementById('deposit-amount');
    const statusInput = document.getElementById('deposit-status');
    this.clearInlineError(dateInput);
    this.clearInlineError(nameInput);
    this.clearInlineError(amountInput);
    this.clearInlineError(statusInput);
    const amount = parseInt(amountInput.value.replace(/\D/g, ''), 10) || 0;
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
    if (!statusInput.value) {
      this.showInlineError(statusInput, 'Выберите статус');
      return;
    }
    const transaction = {
      id: Date.now(),
      type: 'deposit',
      date: dateInput.value,
      name: nameInput.value.trim(),
      amount,
      status: statusInput.value
    };
    this.budgetManager.addTransaction(transaction);
    dateInput.value = '';
    nameInput.value = '';
    amountInput.value = '';
    statusInput.value = '';
    this.closeModal('transaction-sheet');
    this.updateUI();
  }

  addProduct() {
    const productsList = document.getElementById('products-list');
    const container = document.createElement('div');
    container.classList.add('product-item');
    container.innerHTML = `
      <input type="text" class="product-name" placeholder="Название" maxlength="16" list="product-names-list">
      <input type="tel" class="product-quantity numeric-format" placeholder="Кол-во" required maxlength="4">
      <input type="tel" class="product-price numeric-format" placeholder="Цена" required maxlength="11" inputmode="numeric">
      <button type="button" class="delete-product" title="Удалить товар">×</button>
    `;
    productsList.appendChild(container);
    const quantityInput = container.querySelector('.product-quantity');
    const priceInput = container.querySelector('.product-price');
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
    container.querySelector('.delete-product')?.addEventListener('click', () => container.remove());
  }

  hideAllForms() {
    document.querySelectorAll('.transaction-form').forEach(form => form.classList.add('hidden'));
  }

  openForm(formId) {
    document.getElementById(formId)?.classList.remove('hidden');
  }

  initializeCategoryButtons() {
    document.querySelectorAll('select[id$="-category"], select[id$="-status"], select[id$="-direction"]').forEach(select => {
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

  openCategorySheet(currentSheet, currentSelect) {
    const categorySheet = document.getElementById('category-sheet');
    const categoryList = categorySheet.querySelector('.category-list');
    if (!categorySheet || !categoryList) {
      console.error('Не найден category-sheet или category-list');
      return;
    }
    this.currentSelectForCategory = currentSelect;
    const allOptions = Array.from(currentSelect.querySelectorAll('option'))
      .filter(opt => opt.value)
      .map(opt => ({ value: opt.value, text: opt.text }));
    const isExpense = currentSelect.id === 'expense-category';
    let searchInput = null;
    if (isExpense) {
      searchInput = categorySheet.querySelector('#category-search');
      if (!searchInput) {
        searchInput = document.createElement('input');
        searchInput.id = 'category-search';
        searchInput.type = 'text';
        searchInput.placeholder = 'Поиск категории...';
        Object.assign(searchInput.style, { width: '100%', padding: '8px', margin: '0 0 8px', boxSizing: 'border-box' });
        categorySheet.insertBefore(searchInput, categoryList);
      }
      searchInput.value = '';
    } else {
      const old = categorySheet.querySelector('#category-search');
      if (old) old.remove();
    }
    const buildGrouped = () => {
      categoryList.innerHTML = '';
      Array.from(currentSelect.children).forEach(child => {
        if (child.tagName === 'OPTGROUP') {
          const wrapper = document.createElement('div');
          wrapper.className = 'optgroup-wrapper';
          const groupLabel = document.createElement('div');
          groupLabel.className = 'category-group-label dropdown-toggle';
          groupLabel.textContent = `▶ ${child.label}`;
          wrapper.appendChild(groupLabel);
          const optionsContainer = document.createElement('div');
          optionsContainer.className = 'group-options hidden';
          Array.from(child.children).forEach(opt => {
            if (!opt.value) return;
            const li = document.createElement('li');
            li.className = 'category-item';
            li.textContent = opt.text;
            li.dataset.value = opt.value;
            optionsContainer.appendChild(li);
          });
          groupLabel.addEventListener('click', () => {
            const hidden = optionsContainer.classList.toggle('hidden');
            groupLabel.textContent = `${hidden ? '▶' : '▼'} ${child.label}`;
          });
          wrapper.appendChild(optionsContainer);
          categoryList.appendChild(wrapper);
        } else if (child.tagName === 'OPTION' && child.value) {
          const li = document.createElement('li');
          li.className = 'category-item';
          li.textContent = child.text;
          li.dataset.value = child.value;
          categoryList.appendChild(li);
        }
      });
    };
    buildGrouped();
    const attachClickHandlers = () => {
      categoryList.querySelectorAll('.category-item').forEach(item => {
        item.onclick = () => this.selectCategory(item.dataset.value, item.textContent);
      });
    };
    attachClickHandlers();
    if (isExpense && searchInput) {
      searchInput.oninput = () => {
        const filter = searchInput.value.trim().toLowerCase();
        categoryList.innerHTML = '';
        if (!filter) buildGrouped();
        else {
          allOptions.forEach(opt => {
            if (opt.text.toLowerCase().includes(filter)) {
              const li = document.createElement('li');
              li.className = 'category-item';
              li.textContent = opt.text;
              li.dataset.value = opt.value;
              categoryList.appendChild(li);
            }
          });
        }
        attachClickHandlers();
      };
    }
    const backdrop = document.getElementById('bottom-sheet-backdrop');
    if (backdrop) backdrop.classList.remove('hidden');
    else console.warn('Backdrop не найден');
    categorySheet.classList.remove('hidden');
    currentSheet.style.zIndex = '1100';
    categorySheet.style.zIndex = '1101';
    const closeBtn = categorySheet.querySelector('.close-category-sheet');
    if (closeBtn) {
      closeBtn.onclick = null;
      closeBtn.onclick = () => categorySheet.classList.add('hidden');
    } else console.warn('Кнопка закрытия (.close-category-sheet) не найдена');
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

  selectCategory(value, text) {
    const select = this.currentSelectForCategory;
    if (!select) return;
    select.value = value;
    const button = select.closest('.transaction-form')?.querySelector('.category-select-button');
    if (button) button.textContent = text;
    const hiddenInput = select.closest('.transaction-form')?.querySelector('input[type="hidden"]');
    if (hiddenInput) hiddenInput.value = value;
    document.getElementById('category-sheet')?.classList.add('hidden');
    document.getElementById('selected-category-preview').textContent = `Выбрано: ${text}`;
  }
}