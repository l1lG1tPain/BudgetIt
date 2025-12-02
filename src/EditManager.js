// ===============================
//   EditManager.js
//   Редактирование доходов/расходов
// ===============================

import { incomeCategories, expenseCategories } from '../constants/index.js';
import { formatNumber } from './utils/utils.js';

export class EditManager {
    constructor(budgetManager, uiManager) {
        this.budgetManager = budgetManager;
        this.uiManager = uiManager;

        this.sheet    = document.getElementById('edit-transaction-sheet');
        this.backdrop = document.getElementById('bottom-sheet-backdrop');

        this.formIncome  = document.getElementById('edit-income-form');
        this.formExpense = document.getElementById('edit-expense-form');

        this.setupCloseButton();
        this.bindEvents();

        // 🔢 такие же ограничения, как при создании
        const incomeAmount = document.getElementById('edit-income-amount');
        if (incomeAmount) {
            incomeAmount.setAttribute('maxlength', '15');
            incomeAmount.setAttribute('inputmode', 'numeric');
        }
    }



    setupCloseButton() {
        const close = document.getElementById('edit-close-btn');
        if (close) {
            close.addEventListener('click', () => this.close());
        }
    }

    bindEvents() {
        if (this.formIncome) {
            this.formIncome.addEventListener('submit', e => {
                e.preventDefault();
                this.saveIncome();
            });
        }

        if (this.formExpense) {
            this.formExpense.addEventListener('submit', e => {
                e.preventDefault();
                this.saveExpense();
            });
        }
    }

    open(transaction) {
        this.transaction = structuredClone(transaction);
        this.original    = structuredClone(transaction);
        this.isChanged   = false;

        this.sheet.classList.remove('hidden');
        this.backdrop.classList.remove('hidden');

        this.formIncome.classList.add('hidden');
        this.formExpense.classList.add('hidden');

        if (transaction.type === 'income') {
            this.openIncome(transaction);
        } else if (transaction.type === 'expense') {
            this.openExpense(transaction);
        }
    }

    close() {
        this.sheet.classList.add('hidden');

        const anyVisible = document.querySelector('.bottom-sheet:not(.hidden)');
        if (!anyVisible) this.backdrop.classList.add('hidden');
    }

    // ----------- хелпер для "клавиатура подняла поле" ----------
    attachFocusScroll(el) {
        if (!el) return;
        el.addEventListener('focus', () => {
            // Даем клаве подняться и потом скроллим
            setTimeout(() => {
                try {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                } catch (e) {
                    // на десктопе можно забить
                }
            }, 250);
        });
    }

    markChanged() {
        this.isChanged = true;
    }

    /* --------------------------
       РЕДАКТИРОВАНИЕ ДОХОДА
    -------------------------- */
    openIncome(tx) {
        document.getElementById('edit-title').textContent = '✏️ Редактирование дохода';

        const date   = document.getElementById('edit-income-date');
        const cat    = document.getElementById('edit-income-category');
        const amount = document.getElementById('edit-income-amount');

        this.transaction = tx;
        this.isChanged   = false;

        // дата
        date.value = tx.date;

        // категории
        cat.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = '💰 Выберите категорию';
        cat.appendChild(placeholder);

        incomeCategories.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            if (tx.category === c) opt.selected = true;
            cat.appendChild(opt);
        });

        // сумма
        amount.value = formatNumber(tx.amount);
        amount.setAttribute('maxlength', '15');
        amount.setAttribute('inputmode', 'numeric');

        const mark = () => this.markChanged();
        date.oninput   = mark;
        amount.oninput = mark;
        cat.onchange   = mark;

        [date, amount, cat].forEach(el => this.attachFocusScroll(el));

        this.uiManager.wrapCategorySelect(cat);
        cat.dispatchEvent(new Event('change'));

        this.uiManager.bindNumericFormats();

        this.formIncome.classList.remove('hidden');
    }


    saveIncome() {
        const dateInput   = document.getElementById('edit-income-date');
        const catSelect   = document.getElementById('edit-income-category');
        const amountInput = document.getElementById('edit-income-amount');
        const saveBtn     = this.formIncome.querySelector('.add-btn');

        if (!this.isChanged) {
            this.uiManager.showInlineError(saveBtn, 'Нет изменений для сохранения');
            return;
        }

        const amount = parseFloat((amountInput.value || '').replace(/\s/g, '')) || 0;

        if (!dateInput.value) {
            this.uiManager.showInlineError(dateInput, 'Выбери дату');
            return;
        }
        if (!catSelect.value) {
            this.uiManager.showInlineError(catSelect, 'Выбери категорию');
            return;
        }
        if (amount <= 0) {
            this.uiManager.showInlineError(amountInput, 'Введите корректную сумму');
            return;
        }

        const updated = {
            date    : dateInput.value,
            category: catSelect.value,
            amount
        };

        this.budgetManager.updateTransaction(this.transaction.id, updated);

        this.close();
        this.uiManager.updateUI();
    }

    /* --------------------------
       РЕДАКТИРОВАНИЕ РАСХОДА
    -------------------------- */
    openExpense(tx) {
        document.getElementById('edit-title').textContent = '🖍️ Редактирование расхода';

        const date   = document.getElementById('edit-expense-date');
        const cat    = document.getElementById('edit-expense-category');
        const list   = document.getElementById('edit-products-list');
        const addBtn = document.getElementById('edit-add-product');

        // на всякий: показываем форму расхода, скрываем доход
        this.formIncome.classList.add('hidden');
        this.formExpense.classList.remove('hidden');

        // дата
        date.value = tx.date || '';

        // --- КАТЕГОРИИ: как в форме создания расхода ---
        cat.innerHTML = '';

        // плейсхолдер
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.disabled = true;
        placeholder.textContent = '🛒 Выберите категорию';
        cat.appendChild(placeholder);

        // группы из expenseCategories (options — строки!)
        expenseCategories.forEach(group => {
            const optgroup = document.createElement('optgroup');
            optgroup.label = group.label;

            (group.options || []).forEach(opt => {
                const optionEl = document.createElement('option');

                if (typeof opt === 'object') {
                    // на будущее, если когда-то перейдёшь на объекты
                    optionEl.value = opt.value;
                    optionEl.textContent = opt.label;
                } else {
                    // ТЕКУЩИЙ случай — просто строка
                    optionEl.value = opt;
                    optionEl.textContent = opt;
                }

                // восстановить выбранную категорию расхода
                if (tx.category && tx.category === optionEl.value) {
                    optionEl.selected = true;
                }

                optgroup.appendChild(optionEl);
            });

            cat.appendChild(optgroup);
        });

        // --------- бинды изменений ----------
        const mark = () => this.markChanged();
        date.oninput = mark;
        cat.onchange = mark;

        this.attachFocusScroll(date);

        // кастомная обёртка селекта + подпись кнопки
        this.uiManager.wrapCategorySelect(cat);
        cat.dispatchEvent(new Event('change'));

        // --------- товары ----------
        list.innerHTML = '';
        (tx.products || []).forEach(p => this.addProductRow(list, p));

        addBtn.onclick = () => {
            this.addProductRow(list, { name: '', quantity: '', price: '' });
            this.uiManager.bindNumericFormats();
            this.markChanged();
        };

        // формат чисел для уже существующих полей
        this.uiManager.bindNumericFormats();

        this.formExpense.classList.remove('hidden');
    }


// строка товара с теми же ограничениями, что при создании
    addProductRow(list, product) {
        list.insertAdjacentHTML(
            'beforeend',
            `
      <div class="product-row">
        <input 
          type="text" 
          class="product-name input" 
          placeholder="Название" 
          maxlength="25"
          value="${product.name ?? ''}"
        >
        <input 
          type="tel"  
          class="product-quantity input numeric-format" 
          placeholder="Кол-во" 
          required 
          maxlength="5"
          inputmode="numeric"
          value="${product.quantity ?? ''}"
        >
        <input 
          type="tel"  
          class="product-price input numeric-format" 
          placeholder="Цена" 
          required 
          maxlength="12" 
          inputmode="numeric"
          value="${product.price ?? ''}"
        >
        <button type="button" class="remove-product">✖</button>
      </div>
    `
        );

        const row          = list.lastElementChild;
        const nameInput    = row.querySelector('.product-name');
        const qtyInput     = row.querySelector('.product-quantity');
        const priceInput   = row.querySelector('.product-price');
        const removeButton = row.querySelector('.remove-product');

        const mark = () => this.markChanged();

        [nameInput, qtyInput, priceInput].forEach(el => {
            el.addEventListener('input', mark);
            this.attachFocusScroll(el);
        });

        removeButton.addEventListener('click', () => {
            row.remove();
            this.markChanged();
        });
    }

// сохранение расхода с жёсткой валидацией
    saveExpense() {
        const dateInput = document.getElementById('edit-expense-date');
        const catSelect = document.getElementById('edit-expense-category');
        const rows      = Array.from(document.querySelectorAll('#edit-products-list .product-row'));
        const saveBtn   = this.formExpense.querySelector('.add-btn');

        if (!this.isChanged) {
            this.uiManager.showInlineError(saveBtn, 'Нет изменений для сохранения');
            return;
        }

        if (!dateInput.value) {
            this.uiManager.showInlineError(dateInput, 'Выбери дату');
            return;
        }

        if (!catSelect.value) {
            this.uiManager.showInlineError(catSelect, 'Выбери категорию');
            return;
        }

        if (!rows.length) {
            this.uiManager.showInlineError(saveBtn, 'Добавь хотя бы один товар');
            return;
        }

        const products = [];
        for (const row of rows) {
            const nameInput  = row.querySelector('.product-name');
            const qtyInput   = row.querySelector('.product-quantity');
            const priceInput = row.querySelector('.product-price');

            const name     = (nameInput.value || '').trim();
            const quantity = parseFloat((qtyInput.value || '').replace(/\s/g, '')) || 0;
            const price    = parseFloat((priceInput.value || '').replace(/\s/g, '')) || 0;

            if (!name || quantity <= 0 || price <= 0) {
                this.uiManager.showInlineError(
                    name ? (quantity <= 0 ? qtyInput : priceInput) : nameInput,
                    'Заполни все поля товара'
                );
                return;
            }

            products.push({ name, quantity, price });
        }

        const amount = products.reduce((sum, p) => sum + p.quantity * p.price, 0);

        const updated = {
            date    : dateInput.value,
            category: catSelect.value,
            products,
            amount
        };

        this.budgetManager.updateTransaction(this.transaction.id, updated);

        this.close();
        this.uiManager.updateUI();
    }



    addProductRow(list, product) {
        list.insertAdjacentHTML(
            'beforeend',
            `
      <div class="product-row">
        <input 
          type="text" 
          class="product-name input" 
          placeholder="Название" 
          maxlength="25"
          value="${product.name ?? ''}"
        >
        <input 
          type="tel"  
          class="product-quantity input numeric-format" 
          placeholder="Кол-во" 
          required 
          maxlength="5"
          value="${product.quantity ?? ''}"
        >
        <input 
          type="tel"  
          class="product-price input numeric-format" 
          placeholder="Цена" 
          required 
          maxlength="12" 
          inputmode="numeric"
          value="${product.price ?? ''}"
        >
        <button type="button" class="remove-product">✖</button>
      </div>
    `
        );

        const row          = list.lastElementChild;
        const nameInput    = row.querySelector('.product-name');
        const qtyInput     = row.querySelector('.product-quantity');
        const priceInput   = row.querySelector('.product-price');
        const removeButton = row.querySelector('.remove-product');

        const mark = () => this.markChanged();

        [nameInput, qtyInput, priceInput].forEach(el => {
            el.addEventListener('input', mark);
            this.attachFocusScroll(el);
        });

        removeButton.addEventListener('click', () => {
            row.remove();
            this.markChanged();
        });
    }


    saveExpense() {
        const dateInput = document.getElementById('edit-expense-date');
        const catSelect = document.getElementById('edit-expense-category');
        const rows      = Array.from(document.querySelectorAll('#edit-products-list .product-row'));
        const saveBtn   = this.formExpense.querySelector('.add-btn');

        if (!this.isChanged) {
            this.uiManager.showInlineError(saveBtn, 'Нет изменений для сохранения');
            return;
        }

        if (!dateInput.value) {
            this.uiManager.showInlineError(dateInput, 'Выбери дату');
            return;
        }

        if (!catSelect.value) {
            this.uiManager.showInlineError(catSelect, 'Выбери категорию');
            return;
        }

        if (!rows.length) {
            this.uiManager.showInlineError(saveBtn, 'Добавь хотя бы один товар');
            return;
        }

        const products = [];
        for (const row of rows) {
            const nameInput  = row.querySelector('.product-name');
            const qtyInput   = row.querySelector('.product-quantity');
            const priceInput = row.querySelector('.product-price');

            const name = (nameInput.value || '').trim();
            const quantity = parseFloat((qtyInput.value || '').replace(/\s/g, '')) || 0;
            const price    = parseFloat((priceInput.value || '').replace(/\s/g, '')) || 0;

            if (!name || quantity <= 0 || price <= 0) {
                // если хоть что-то пустое — ругаемся и не даём сохранить
                this.uiManager.showInlineError(
                    name ? (quantity <= 0 ? qtyInput : priceInput) : nameInput,
                    'Заполни все поля товара'
                );
                return;
            }

            products.push({ name, quantity, price });
        }

        const amount = products.reduce((sum, p) => sum + p.quantity * p.price, 0);

        const updated = {
            date    : dateInput.value,
            category: catSelect.value,
            products,
            amount
        };

        this.budgetManager.updateTransaction(this.transaction.id, updated);

        this.close();
        this.uiManager.updateUI();
    }
}
