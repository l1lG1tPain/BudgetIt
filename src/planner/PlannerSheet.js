import { incomeCategories, expenseCategories } from '../../constants/index.js';
import { formatNumber } from '../utils/utils.js';

export class PlannerSheet {
    constructor({ plannerManager, plannerPage }) {
        this.plannerManager = plannerManager;
        this.plannerPage = plannerPage;

        this.sheet = document.getElementById('planner-sheet');
        this.backdrop = document.getElementById('bottom-sheet-backdrop');

        this.form = document.getElementById('planner-form');
        this.titleEl = document.getElementById('planner-sheet-title');

        this.nameInput = document.getElementById('planner-name');
        this.incomeCategory = document.getElementById('planner-income-category');
        this.incomeAmount = document.getElementById('planner-income-amount');
        this.incomeDate = document.getElementById('planner-income-date');
        this.startDate = document.getElementById('planner-start-date');
        this.periodDays = document.getElementById('planner-period-days');

        this.mainList = document.getElementById('planner-main-expenses-list');
        this.dailyList = document.getElementById('planner-daily-expenses-list');
        this.regularList = document.getElementById('planner-regular-expenses-list');
        this.depositsList = document.getElementById('planner-deposits-list');

        this.addMainBtn = document.getElementById('planner-add-main-expense');
        this.addDailyBtn = document.getElementById('planner-add-daily-expense');
        this.addRegularBtn = document.getElementById('planner-add-regular-expense');
        this.addDepositBtn = document.getElementById('planner-add-deposit');
        this.closeBtn = document.getElementById('planner-sheet-close');

        this.editingPlannerId = null;
    }

    get uiManager() {
        return window._budgetAppRef?.uiManager || null;
    }

    getLocalISODate(date = new Date()) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    init() {
        if (!this.sheet || !this.form) {
            console.warn('[PlannerSheet] sheet not found in DOM');
            return;
        }

        this.fillIncomeCategories();

        this.addMainBtn?.addEventListener('click', () => this.addMainExpenseRow());
        this.addDailyBtn?.addEventListener('click', () => this.addDailyExpenseRow());
        this.addRegularBtn?.addEventListener('click', () => this.addRegularExpenseRow());
        this.addDepositBtn?.addEventListener('click', () => this.addDepositRow());

        this.closeBtn?.addEventListener('click', () => this.close());
        this.backdrop?.addEventListener('click', () => {
            if (!this.sheet.classList.contains('hidden')) {
                this.close();
            }
        });

        this.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.submit();
        });

        this.sheet.addEventListener('click', (e) => {
            const removeBtn = e.target.closest('[data-remove-row]');
            if (removeBtn) {
                removeBtn.closest('.planner-form-row')?.remove();
            }
        });

        this.sheet.querySelectorAll('.planner-period-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                this.sheet.querySelectorAll('.planner-period-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                this.periodDays.value = chip.dataset.days || '15';
            });
        });

        this.bindNumericFormatsInsideSheet();
        this.enhancePlannerCategorySelects();
    }

    bindNumericFormatsInsideSheet() {
        this.sheet.addEventListener('input', (e) => {
            const input = e.target;
            if (!(input instanceof HTMLInputElement)) return;
            if (!input.classList.contains('numeric-format')) return;

            const rawValue = input.value;
            const cursorPos = input.selectionStart ?? rawValue.length;

            const isRate = input.classList.contains('planner-rate-input');
            const cleaned = isRate
                ? rawValue.replace(',', '.').replace(/[^0-9.]/g, '')
                : rawValue.replace(/\D/g, '');

            const formatted = isRate
                ? cleaned
                : (cleaned ? formatNumber(Number(cleaned)) : '');

            input.value = formatted;

            const offset = formatted.length - rawValue.length;
            const newPos = Math.max(0, cursorPos + offset);

            try {
                input.setSelectionRange(newPos, newPos);
            } catch {}
        });
    }

    escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;');
    }

    parseFormattedNumber(value) {
        return parseInt(String(value ?? '').replace(/\D/g, ''), 10) || 0;
    }

    parseRate(value) {
        return parseFloat(String(value ?? '').replace(',', '.').replace(/[^0-9.]/g, '')) || 0;
    }

    addDays(dateStr, days) {
        if (!dateStr) return '';
        const [year, month, day] = String(dateStr).split('-').map(Number);
        const d = new Date(year, (month || 1) - 1, day || 1);
        if (Number.isNaN(d.getTime())) return '';
        d.setDate(d.getDate() + days);
        return this.getLocalISODate(d);
    }

    fillIncomeCategories() {
        if (!this.incomeCategory) return;

        this.incomeCategory.innerHTML = '';
        this.incomeCategory.dataset.searchable = 'true';
        this.incomeCategory.dataset.categoryType = 'income';

        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.disabled = true;
        placeholder.selected = true;
        placeholder.textContent = '🛠️ Выберите категорию';
        this.incomeCategory.appendChild(placeholder);

        (incomeCategories || []).forEach(item => {
            const option = document.createElement('option');

            if (typeof item === 'object' && item !== null) {
                option.value = item.value ?? item.label ?? '';
                option.textContent = item.label ?? item.value ?? '';
            } else {
                option.value = item;
                option.textContent = item;
            }

            this.incomeCategory.appendChild(option);
        });

        const salaryOption = [...this.incomeCategory.options].find(o => o.value === '💼 Зарплата');
        if (salaryOption) {
            this.incomeCategory.value = '💼 Зарплата';
        }
    }

    getExpenseGroupedOptionsHtml(selected = '') {
        if (!Array.isArray(expenseCategories)) return '';

        return expenseCategories.map(group => {
            if (!group || typeof group !== 'object') return '';

            const label = this.escapeHtml(group.label || 'Без группы');
            const options = Array.isArray(group.options) ? group.options : [];

            const optionsHtml = options.map(opt => {
                const safe = this.escapeHtml(opt);
                const isSelected = selected === opt ? 'selected' : '';
                return `<option value="${safe}" ${isSelected}>${safe}</option>`;
            }).join('');

            return `<optgroup label="${label}">${optionsHtml}</optgroup>`;
        }).join('');
    }

    makePlannerSelectInteractive(select, placeholderText = 'Выберите') {
        if (!select) return;
        if (select.previousElementSibling?.classList.contains('category-select-container')) return;

        const container = document.createElement('div');
        container.className = 'category-select-container planner-category-select-container';

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'category-select-button planner-category-select-button';
        button.textContent = select.options[select.selectedIndex]?.text || placeholderText;
        button.dataset.selectId = select.id || '';

        select.addEventListener('change', () => {
            const option = select.options[select.selectedIndex];
            button.textContent = option?.text || placeholderText;
        });

        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (this.uiManager?.openCategorySheet) {
                this.uiManager.openCategorySheet(null, select);
            }
        });

        const hiddenInput = document.createElement('input');
        hiddenInput.type = 'hidden';
        hiddenInput.name = select.name || '';
        hiddenInput.value = select.value || '';

        select.addEventListener('change', () => {
            hiddenInput.value = select.value || '';
        });

        container.appendChild(button);
        container.appendChild(hiddenInput);
        select.parentNode.insertBefore(container, select);
        select.style.display = 'none';

        if (this.uiManager?.editManager?.attachFocusScroll) {
            this.uiManager.editManager.attachFocusScroll(button);
        }
    }

    enhancePlannerCategorySelects() {
        if (!this.sheet) return;

        if (this.incomeCategory) {
            this.makePlannerSelectInteractive(this.incomeCategory, '🛠️ Выберите категорию');
        }

        this.sheet.querySelectorAll('.planner-row-category').forEach(select => {
            select.dataset.searchable = 'true';
            select.dataset.categoryType = 'expense';
            this.makePlannerSelectInteractive(select, '🛒 Выберите категорию');
        });
    }

    openCreate() {
        this.editingPlannerId = null;
        this.titleEl.textContent = 'Новый план';
        this.resetForm();
        this.sheet.classList.remove('hidden');
        this.backdrop?.classList.remove('hidden');
    }

    openEdit(planner) {
        if (!planner) return;

        this.editingPlannerId = planner.id;
        this.titleEl.textContent = 'Редактирование плана';
        this.resetForm();

        this.nameInput.value = planner.name || '';
        this.incomeCategory.value = planner.incomePlan?.category || '';
        this.incomeAmount.value = planner.incomePlan?.amount ? formatNumber(planner.incomePlan.amount) : '';
        this.incomeDate.value = planner.incomePlan?.incomeDate || '';
        this.startDate.value = planner.startDate || '';
        this.periodDays.value = planner.periodDays || 15;

        this.sheet.querySelectorAll('.planner-period-chip').forEach(chip => {
            chip.classList.toggle('active', Number(chip.dataset.days) === Number(planner.periodDays));
        });

        this.mainList.innerHTML = '';
        this.dailyList.innerHTML = '';
        this.regularList.innerHTML = '';
        this.depositsList.innerHTML = '';

        (planner.mainExpenses || []).forEach(item => this.addMainExpenseRow(item));
        (planner.dailyExpenses || []).forEach(item => this.addDailyExpenseRow(item));
        (planner.regularExpenses || []).forEach(item => this.addRegularExpenseRow(item));
        (planner.plannedDeposits || []).forEach(item => this.addDepositRow(item));

        if (!planner.mainExpenses?.length) this.addMainExpenseRow();
        if (!planner.dailyExpenses?.length) this.addDailyExpenseRow();
        if (!planner.regularExpenses?.length) this.addRegularExpenseRow();

        this.enhancePlannerCategorySelects();

        this.sheet.classList.remove('hidden');
        this.backdrop?.classList.remove('hidden');
    }

    showValidationErrors(errors) {
        // Сбросить старые ошибки
        this.sheet.querySelectorAll('.planner-field-error').forEach(el => el.remove());
        this.sheet.querySelectorAll('.planner-input-error').forEach(el => el.classList.remove('planner-input-error'));

        const fieldMap = {
            name:          this.nameInput,
            incomeAmount:  this.incomeAmount,
            incomeDate:    this.incomeDate,
            startDate:     this.startDate,
            periodDays:    this.periodDays
        };

        let firstErrorEl = null;

        for (const [key, msg] of Object.entries(errors)) {
            let targetEl = fieldMap[key] || null;

            // Для ошибок вида "mainExpenses.0.amount" находим нужный input в списке
            if (!targetEl) {
                const match = key.match(/^(mainExpenses|dailyExpenses|regularExpenses|plannedDeposits)\.(\d+)\.(\w+)$/);
                if (match) {
                    const [, listKey, idx, field] = match;
                    const listEl = {
                        mainExpenses:    this.mainList,
                        dailyExpenses:   this.dailyList,
                        regularExpenses: this.regularList,
                        plannedDeposits: this.depositsList
                    }[listKey];

                    const rows = listEl?.querySelectorAll('.planner-form-row');
                    const row = rows?.[Number(idx)];
                    if (row) {
                        const fieldSel = {
                            category:   '.planner-row-category',
                            amount:     '.planner-row-amount',
                            amountPerDay: '.planner-row-amount',
                            date:       '.planner-row-date',
                            everyNDays: '.planner-row-every',
                            title:      '.planner-deposit-title'
                        }[field];
                        targetEl = fieldSel ? row.querySelector(fieldSel) : null;
                    }
                }
            }

            if (targetEl) {
                targetEl.classList.add('planner-input-error');
                const errEl = document.createElement('div');
                errEl.className = 'planner-field-error';
                errEl.textContent = msg;
                targetEl.parentNode.insertBefore(errEl, targetEl.nextSibling);
                if (!firstErrorEl) firstErrorEl = targetEl;
            }
        }

        if (firstErrorEl) {
            firstErrorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
            // Общая ошибка если поле не найдено
            const errEl = document.createElement('div');
            errEl.className = 'planner-field-error planner-field-error-global';
            errEl.textContent = Object.values(errors)[0] || 'Проверь поля планировщика';
            this.form.prepend(errEl);
        }
    }

    close() {
        this.sheet.classList.add('hidden');

        const anyVisibleBottomSheet = document.querySelector(
            '.bottom-sheet:not(.hidden):not(#planner-sheet)'
        );
        if (!anyVisibleBottomSheet) {
            this.backdrop?.classList.add('hidden');
        }
    }

    resetForm() {
        this.sheet.querySelectorAll('.planner-field-error').forEach(el => el.remove());
        this.sheet.querySelectorAll('.planner-input-error').forEach(el => el.classList.remove('planner-input-error'));
        this.form.reset();
        this.mainList.innerHTML = '';
        this.dailyList.innerHTML = '';
        this.regularList.innerHTML = '';
        this.depositsList.innerHTML = '';
        this.periodDays.value = '15';

        const today = this.getLocalISODate(new Date());
        if (this.incomeDate) this.incomeDate.value = today;
        if (this.startDate) this.startDate.value = today;

        this.sheet.querySelectorAll('.planner-period-chip').forEach((chip, index) => {
            chip.classList.toggle('active', index === 0);
        });

        const existingIncomeContainer = this.incomeCategory?.previousElementSibling;
        if (existingIncomeContainer?.classList.contains('category-select-container')) {
            existingIncomeContainer.remove();
            this.incomeCategory.style.display = '';
        }

        this.fillIncomeCategories();
        this.addMainExpenseRow();
        this.addDailyExpenseRow();
        this.addRegularExpenseRow();
        this.enhancePlannerCategorySelects();
    }

    addMainExpenseRow(data = {}) {
        const row = document.createElement('div');
        row.className = 'planner-form-row';
        row.innerHTML = `
            <select class="planner-row-category" data-searchable="true" data-category-type="expense">
                <option value="">🛒 Выберите категорию</option>
                ${this.getExpenseGroupedOptionsHtml(data.category || '')}
            </select>
            <input class="planner-row-amount numeric-format" type="tel" inputmode="numeric" maxlength="15" placeholder="Сумма" value="${data.amount ? formatNumber(data.amount) : ''}">
            <input class="planner-row-date" type="date" value="${data.date || ''}">
            <button type="button" class="planner-row-remove" data-remove-row>✕</button>
        `;
        this.mainList.appendChild(row);
        this.enhancePlannerCategorySelects();
    }

    addDailyExpenseRow(data = {}) {
        const row = document.createElement('div');
        row.className = 'planner-form-row';
        row.innerHTML = `
            <select class="planner-row-category" data-searchable="true" data-category-type="expense">
                <option value="">🛒 Выберите категорию</option>
                ${this.getExpenseGroupedOptionsHtml(data.category || '')}
            </select>
            <input class="planner-row-amount numeric-format" type="tel" inputmode="numeric" maxlength="15" placeholder="Сумма в день" value="${data.amountPerDay ? formatNumber(data.amountPerDay) : ''}">
            <button type="button" class="planner-row-remove" data-remove-row>✕</button>
        `;
        this.dailyList.appendChild(row);
        this.enhancePlannerCategorySelects();
    }

    addRegularExpenseRow(data = {}) {
        const row = document.createElement('div');
        row.className = 'planner-form-row planner-form-row-regular';
        row.innerHTML = `
            <select class="planner-row-category" data-searchable="true" data-category-type="expense">
                <option value="">🛒 Выберите категорию</option>
                ${this.getExpenseGroupedOptionsHtml(data.category || '')}
            </select>
            <input class="planner-row-amount numeric-format" type="tel" inputmode="numeric" maxlength="15" placeholder="Сумма" value="${data.amount ? formatNumber(data.amount) : ''}">
            <input class="planner-row-every" type="number" min="1" step="1" placeholder="Каждые N дней" value="${data.everyNDays ?? ''}">
            <input class="planner-row-offset" type="number" min="1" step="1" placeholder="Начать с дня" value="${(Number(data.startOffsetDay) || 0) + 1}">
            <button type="button" class="planner-row-remove" data-remove-row>✕</button>
        `;
        this.regularList.appendChild(row);
        this.enhancePlannerCategorySelects();
    }

    addDepositRow(data = {}) {
        const row = document.createElement('div');
        row.className = 'planner-form-row planner-form-row-deposit';
        // data.startDate может быть явно задан (при редактировании) — используем его
        const depositStart = data.startDate || '';
        row.innerHTML = `
            <input class="planner-deposit-title" type="text" maxlength="24" placeholder="Название вклада" value="${this.escapeHtml(data.title || '')}">
            <input class="planner-deposit-amount numeric-format" type="tel" inputmode="numeric" maxlength="15" placeholder="Сумма" value="${data.amount ? formatNumber(data.amount) : ''}">
            <input class="planner-deposit-rate numeric-format planner-rate-input" type="text" inputmode="decimal" maxlength="6" placeholder="% годовых" value="${data.annualRate ?? ''}">
            <input class="planner-deposit-start" type="date" value="${depositStart}" title="Дата открытия вклада">
            <select class="planner-deposit-term">
                <option value="0" ${Number(data.termDays) === 0 ? 'selected' : ''}>Б/С</option>
                <option value="365" ${Number(data.termDays) === 365 ? 'selected' : ''}>12 мес</option>
                <option value="730" ${Number(data.termDays) === 730 ? 'selected' : ''}>24 мес</option>
                <option value="1095" ${Number(data.termDays) === 1095 ? 'selected' : ''}>36 мес</option>
                <option value="1460" ${Number(data.termDays) === 1460 ? 'selected' : ''}>48 мес</option>
                <option value="1825" ${Number(data.termDays) === 1825 ? 'selected' : ''}>60 мес</option>
            </select>
            <button type="button" class="planner-row-remove" data-remove-row>✕</button>
        `;
        this.depositsList.appendChild(row);
    }

    collectMainExpenses() {
        return [...this.mainList.querySelectorAll('.planner-form-row')].map(row => ({
            category: row.querySelector('.planner-row-category')?.value?.trim() || '',
            amount: this.parseFormattedNumber(row.querySelector('.planner-row-amount')?.value),
            date: row.querySelector('.planner-row-date')?.value || ''
        })).filter(item => item.category || item.amount || item.date);
    }

    collectDailyExpenses() {
        return [...this.dailyList.querySelectorAll('.planner-form-row')].map(row => ({
            category: row.querySelector('.planner-row-category')?.value?.trim() || '',
            amountPerDay: this.parseFormattedNumber(row.querySelector('.planner-row-amount')?.value)
        })).filter(item => item.category || item.amountPerDay);
    }

    collectRegularExpenses() {
        return [...this.regularList.querySelectorAll('.planner-form-row')].map(row => ({
            category: row.querySelector('.planner-row-category')?.value?.trim() || '',
            amount: this.parseFormattedNumber(row.querySelector('.planner-row-amount')?.value),
            everyNDays: Number(row.querySelector('.planner-row-every')?.value) || 0,
            startOffsetDay: Math.max(0, (Number(row.querySelector('.planner-row-offset')?.value) || 1) - 1)
        })).filter(item => item.category || item.amount || item.everyNDays);
    }

    collectDeposits() {
        const planStartDate = this.startDate?.value || this.getLocalISODate(new Date());

        return [...this.depositsList.querySelectorAll('.planner-form-row')].map(row => {
            const termDays = Number(row.querySelector('.planner-deposit-term')?.value) || 0;
            // Каждый депозит может иметь собственную дату открытия;
            // если поле не заполнено — используем дату старта периода.
            const depositStart = row.querySelector('.planner-deposit-start')?.value || planStartDate;
            const endDate = termDays > 0
                ? this.addDays(depositStart, termDays - 1)
                : depositStart;

            return {
                title: row.querySelector('.planner-deposit-title')?.value?.trim() || '',
                amount: this.parseFormattedNumber(row.querySelector('.planner-deposit-amount')?.value),
                annualRate: this.parseRate(row.querySelector('.planner-deposit-rate')?.value),
                startDate: depositStart,
                termDays,
                endDate,
                payoutMode: termDays > 0 ? 'at_end' : 'manual'
            };
        }).filter(item => item.title || item.amount || item.annualRate);
    }

    submit() {
        const payload = {
            name: this.nameInput?.value?.trim() || '',
            incomePlan: {
                category: this.incomeCategory?.value || '',
                amount: this.parseFormattedNumber(this.incomeAmount?.value),
                incomeDate: this.incomeDate?.value || ''
            },
            startDate: this.startDate?.value || '',
            periodDays: Number(this.periodDays?.value) || 15,
            mainExpenses: this.collectMainExpenses(),
            dailyExpenses: this.collectDailyExpenses(),
            regularExpenses: this.collectRegularExpenses(),
            plannedDeposits: this.collectDeposits()
        };

        const result = this.editingPlannerId
            ? this.plannerManager.updatePlanner(this.editingPlannerId, payload)
            : this.plannerManager.createPlanner(payload);

        if (!result?.ok) {
            console.warn('[PlannerSheet] validation errors:', result?.errors);
            this.showValidationErrors(result?.errors || {});
            return;
        }

        this.plannerPage.activePlannerId = result.planner.id;
        this.plannerPage.render();
        this.close();
    }
}