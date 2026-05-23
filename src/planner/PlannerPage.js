import { formatNumber } from '../utils/utils.js';

export class PlannerPage {
    constructor({ budgetManager, plannerManager, plannerSheet, uiManager }) {
        this.budgetManager = budgetManager;
        this.plannerManager = plannerManager;
        this.plannerSheet = plannerSheet;
        this.uiManager = uiManager;

        this.activePlannerId = null;
        this.dropdownOpen = false;

        this.page = document.getElementById('planner-page');
        this.empty = document.getElementById('planner-empty-state');
        this.content = document.getElementById('planner-content');
        this.cards = document.getElementById('planner-summary-cards');
        this.tables = document.getElementById('planner-tables');
        this.rowsWrap = document.getElementById('planner-rows');
        this.insights = document.getElementById('planner-insights');

        this.dropdown = document.getElementById('planner-dropdown');
        this.dropdownTrigger = document.getElementById('planner-dropdown-trigger');
        this.dropdownLabel = document.getElementById('planner-dropdown-label');
        this.dropdownMenu = document.getElementById('planner-dropdown-menu');

        this.createBtn = document.getElementById('planner-create-btn');
        this.quickCreateBtn = document.getElementById('planner-quick-create-btn');
        this.deleteBtn = document.getElementById('planner-delete-btn');
        this.editBtn = document.getElementById('planner-edit-btn');
    }

    cleanupBeforeClose() {
        this.closeDropdown();
        this.plannerSheet?.close?.();

        document.querySelectorAll('.bottom-sheet:not(.hidden)').forEach(el => {
            if (el.id !== 'budget-switch-sheet' && el.id !== 'category-sheet') {
                el.classList.add('hidden');
            }
        });

        document.querySelectorAll('.fullscreen-sheet:not(#planner-page)').forEach(el => {
            el.classList.add('hidden');
        });

        document.getElementById('bottom-sheet-backdrop')?.classList.add('hidden');
    }

    closeToBudget() {
        this.cleanupBeforeClose();
        this.page?.classList.add('hidden');

        if (window._navClosePage) {
            window._navClosePage('planner-page');
            window._navClosePage('settings-page');
            window._navClosePage('analytics-page');
        }

        window._navSetActiveTab?.('home');
    }

    init() {
        if (!this.page) return;

        this.dropdownTrigger?.addEventListener('click', () => {
            this.dropdownOpen ? this.closeDropdown() : this.openDropdown();
        });

        document.addEventListener('click', (e) => {
            if (!this.dropdown) return;
            if (!this.dropdown.contains(e.target)) {
                this.closeDropdown();
            }
        });

        this.createBtn?.addEventListener('click', () => this.plannerSheet?.openCreate());
        this.quickCreateBtn?.addEventListener('click', () => this.plannerSheet?.openCreate());

        this.editBtn?.addEventListener('click', () => {
            if (!this.activePlannerId) return;
            const planner = this.plannerManager.getPlannerById(this.activePlannerId);
            if (!planner) return;
            this.plannerSheet?.openEdit(planner);
        });

        this.deleteBtn?.addEventListener('click', () => {
            if (!this.activePlannerId) return;
            document.getElementById('planner-delete-modal')?.classList.remove('hidden');
        });

        const deleteModal = document.getElementById('planner-delete-modal');

        document.getElementById('planner-delete-confirm')?.addEventListener('click', () => {
            deleteModal?.classList.add('hidden');
            if (!this.activePlannerId) return;
            const ok = this.plannerManager.deletePlanner(this.activePlannerId);
            if (!ok) return;
            const planners = this.plannerManager.getPlannersForCurrentBudget();
            this.activePlannerId = planners[0]?.id || null;
            this.render();
        });

        document.getElementById('planner-delete-cancel')?.addEventListener('click', () => {
            deleteModal?.classList.add('hidden');
        });

        deleteModal?.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) deleteModal.classList.add('hidden');
        });

        const closeBtn = this.page.querySelector('[data-close-planner]');
        closeBtn?.addEventListener('click', () => {
            this.closeToBudget();
        });

        this.render();
    }

    open() {
        if (!this.page) return;

        this.closeDropdown();
        this.plannerSheet?.close?.();

        document.querySelectorAll('.bottom-sheet:not(.hidden)').forEach(el => {
            if (el.id !== 'planner-sheet') {
                el.classList.add('hidden');
            }
        });

        document.querySelectorAll('.fullscreen-sheet').forEach(el => {
            if (el.id !== 'planner-page') {
                el.classList.add('hidden');
            }
        });

        document.getElementById('bottom-sheet-backdrop')?.classList.add('hidden');

        this.page.classList.remove('hidden');

        if (window._navOpenPage) window._navOpenPage('planner-page');
        window._navSetActiveTab?.('planner');

        this.render();
    }

    openDropdown() {
        if (!this.dropdownMenu) return;
        this.dropdownOpen = true;
        this.dropdownMenu.classList.remove('hidden');
        this.dropdownTrigger?.classList.add('is-open');
    }

    closeDropdown() {
        if (!this.dropdownMenu) return;
        this.dropdownOpen = false;
        this.dropdownMenu.classList.add('hidden');
        this.dropdownTrigger?.classList.remove('is-open');
    }

    formatPlannerLabel(planner) {
        if (!planner) return 'Выберите план';
        return `${planner.name} · ${planner.periodDays} дн. · ${this.fmtDate(planner.startDate)} → ${this.fmtDate(planner.endDate)}`;
    }

    fmtDate(iso) {
        if (!iso) return '';
        const [y, m, d] = iso.split('-');
        return `${d}.${m}.${y}`;
    }



    renderDropdown(planners) {
        if (!this.dropdownMenu || !this.dropdownLabel) return;

        if (!this.activePlannerId && planners.length) {
            this.activePlannerId = planners[0].id;
        }

        const activePlanner = planners.find(p => p.id === this.activePlannerId) || null;
        this.dropdownLabel.textContent = this.formatPlannerLabel(activePlanner);

        this.dropdownMenu.innerHTML = `
            <div class="planner-dropdown-group">
                ${planners.map(item => `
                    <button
                        type="button"
                        class="planner-dropdown-item ${item.id === this.activePlannerId ? 'active' : ''}"
                        data-planner-id="${item.id}"
                    >
                        <span class="planner-dropdown-item-title">${item.name} · ${item.periodDays} дн.</span>
                        <span class="planner-dropdown-item-meta">${item.startDate} → ${item.endDate}</span>
                    </button>
                `).join('')}
            </div>

            <div class="planner-dropdown-divider"></div>

            <button type="button" class="planner-dropdown-create" data-create-planner>
                ＋ Создать новый план
            </button>
        `;

        this.dropdownMenu.querySelectorAll('[data-planner-id]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.activePlannerId = btn.dataset.plannerId;
                this.closeDropdown();
                this.render();
            });
        });

        this.dropdownMenu.querySelector('[data-create-planner]')?.addEventListener('click', () => {
            this.closeDropdown();
            this.plannerSheet?.openCreate();
        });
    }

    renderEmptyState(planners) {
        const isEmpty = planners.length === 0;

        this.empty?.classList.toggle('hidden', !isEmpty);
        this.content?.classList.toggle('hidden', isEmpty);

        // Прячем весь topbar целиком (дропдаун + кнопка «Создать»)
        const topbar = this.page?.querySelector('.planner-topbar');
        topbar?.classList.toggle('hidden', isEmpty);

        if (!this.empty || !isEmpty) return;

        this.empty.innerHTML = `
            <div class="planner-ob-wrap">

                <div class="planner-ob-hero">
                    <img
                        class="planner-ob-shark"
                        src="./assets/planner.png"
                        alt="Акулка-плановик"
                        onerror="this.style.display='none';this.nextElementSibling.style.display='block'"
                    >
                    <span class="planner-ob-shark-fallback" style="display:none">🦈</span>
                </div>

                <div class="planner-ob-text">
                    <h2 class="planner-ob-title">Планируй — не уходи в минус</h2>
                    <p class="planner-ob-sub">
                        Задай доход и расходы на период,<br>
                        Акулка сама посчитает суточный лимит
                    </p>
                </div>

                <div class="planner-ob-steps">
                    <div class="planner-ob-step">
                        <div class="planner-ob-step-num">1</div>
                        <div class="planner-ob-step-body">
                            <div class="planner-ob-step-title">Укажи доход и период</div>
                            <div class="planner-ob-step-sub">Зарплата, дата, сколько дней до следующей</div>
                        </div>
                    </div>
                    <div class="planner-ob-step">
                        <div class="planner-ob-step-num">2</div>
                        <div class="planner-ob-step-body">
                            <div class="planner-ob-step-title">Добавь плановые расходы</div>
                            <div class="planner-ob-step-sub">Аренда, ежедневные траты, регулярные платежи</div>
                        </div>
                    </div>
                    <div class="planner-ob-step">
                        <div class="planner-ob-step-num">3</div>
                        <div class="planner-ob-step-body">
                            <div class="planner-ob-step-title">Следи за планом vs фактом</div>
                            <div class="planner-ob-step-sub">Видишь перерасход по каждому дню в реальном времени</div>
                        </div>
                    </div>
                </div>

                <div class="planner-ob-features">
                    <div class="planner-ob-feat"><span>📅</span><span>Суточный лимит</span></div>
                    <div class="planner-ob-feat"><span>📊</span><span>План vs факт</span></div>
                    <div class="planner-ob-feat"><span>🏦</span><span>Вклады в плане</span></div>
                    <div class="planner-ob-feat"><span>⚠️</span><span>Алерт перерасхода</span></div>
                </div>

                <button id="planner-ob-create-btn" class="planner-ob-create-btn" type="button">
                    Создать первый план
                </button>

                <p class="planner-ob-note">Займёт меньше минуты · бесплатно</p>

            </div>
        `;

        this.empty.querySelector('#planner-ob-create-btn')
            ?.addEventListener('click', () => this.plannerSheet?.openCreate());

    }

    renderSummary(projection) {
        if (!this.cards) return;

        const s = projection.summary;
        const todayIso = this.plannerManager.getTodayIso();

        let statusBanner = '';
        if (todayIso > s.endDate) {
            const diffDays = Math.round((new Date(todayIso) - new Date(s.endDate)) / 86400000);
            statusBanner = `
                <div class="planner-status-banner planner-status-past">
                    ✅ Период завершён · ${diffDays} ${this.pluralDays(diffDays)} назад
                </div>`;
        } else if (todayIso < s.startDate) {
            const diffDays = Math.round((new Date(s.startDate) - new Date(todayIso)) / 86400000);
            statusBanner = `
                <div class="planner-status-banner planner-status-future">
                    ⏳ Период начнётся через ${diffDays} ${this.pluralDays(diffDays)}
                </div>`;
        }

        this.cards.innerHTML = `${statusBanner}
            <div class="planner-summary-grid planner-summary-grid-main">
                <div class="planner-stat-card planner-stat-card-budget">
                    <div class="planner-stat-label">Бюджет</div>
                    <div class="planner-stat-value">${formatNumber(Math.floor(s.incomeAmount || 0))}</div>
                    <div class="planner-stat-note">Основной доход периода</div>
                </div>

                <div class="planner-stat-card planner-stat-card-start">
                    <div class="planner-stat-label">Стартовый остаток</div>
                    <div class="planner-stat-value">${formatNumber(Math.floor(s.openingBalance || 0))}</div>
                    <div class="planner-stat-note">После стартового дня</div>
                </div>

                <div class="planner-stat-card planner-stat-card-limit">
                    <div class="planner-stat-label">Средний лимит в день</div>
                    <div class="planner-stat-value">${formatNumber(Math.floor(s.dailyLimit || 0))}</div>
                    <div class="planner-stat-note">Со 2 дня периода</div>
                </div>

                <div class="planner-stat-card planner-stat-card-balance">
                    <div class="planner-stat-label">Ожидаемый остаток</div>
                    <div class="planner-stat-value">${formatNumber(Math.floor(s.finalBalance || 0))}</div>
                    <div class="planner-stat-note">На конец периода</div>
                </div>
            </div>

            <div class="planner-summary-grid planner-summary-grid-mini">
                <div class="planner-mini-card">
                    <div class="planner-mini-label">План расходов</div>
                    <div class="planner-mini-value">${formatNumber(Math.floor(s.totalPlannedExpense || 0))}</div>
                </div>

                <div class="planner-mini-card">
                    <div class="planner-mini-label">Факт расходов</div>
                    <div class="planner-mini-value">${formatNumber(Math.floor(s.totalFactExpense || 0))}</div>
                </div>

                <div class="planner-mini-card">
                    <div class="planner-mini-label">Во вклады</div>
                    <div class="planner-mini-value">${formatNumber(Math.floor(s.totalPlannedDeposits || 0))}</div>
                </div>
            </div>
        `;
    }

    renderTables(projection) {
        if (!this.tables) return;

        const planner = projection.planner;

        const renderList = (title, icon, items, formatter) => `
            <div class="planner-section-card">
                <div class="planner-section-head">
                    <div class="planner-section-title">${icon} ${title}</div>
                    <div class="planner-section-count">${items.length}</div>
                </div>
                <div class="planner-section-list">
                    ${items.length ? items.map(formatter).join('') : `<div class="planner-list-empty">Пока пусто</div>`}
                </div>
            </div>
        `;

        this.tables.innerHTML = `
            ${renderList('Основные расходы', '🏠', planner.mainExpenses || [], item => `
                <div class="planner-list-row">
                    <div class="planner-list-main">
                        <div class="planner-list-name">${item.category}</div>
                        <div class="planner-list-sub">${item.date}</div>
                    </div>
                    <div class="planner-list-amount">${formatNumber(item.amount)}</div>
                </div>
            `)}

            ${renderList('Ежедневные расходы', '📆', planner.dailyExpenses || [], item => `
                <div class="planner-list-row">
                    <div class="planner-list-main">
                        <div class="planner-list-name">${item.category}</div>
                        <div class="planner-list-sub">со 2 дня · ежедневно</div>
                    </div>
                    <div class="planner-list-amount">${formatNumber(item.amountPerDay)}<small>/день</small></div>
                </div>
            `)}

            ${renderList('Регулярные расходы', '🔁', planner.regularExpenses || [], item => {
            const count = Math.max(
                0,
                Math.floor((planner.periodDays - 1 - item.startOffsetDay) / item.everyNDays) + 1
            );

            return `
                    <div class="planner-list-row">
                        <div class="planner-list-main">
                            <div class="planner-list-name">${item.category}</div>
                            <div class="planner-list-sub">каждые ${item.everyNDays} дн. · с ${item.startOffsetDay + 1}-го дня · ${count} раз</div>
                        </div>
                        <div class="planner-list-amount">${formatNumber(item.amount)}</div>
                    </div>
                `;
        })}

            ${renderList('Вклады', '🏦', planner.plannedDeposits || [], item => `
                <div class="planner-list-row">
                    <div class="planner-list-main">
                        <div class="planner-list-name">${item.title}</div>
                        <div class="planner-list-sub">${item.termDays > 0 ? `до ${item.endDate}` : 'без срока'} · ${item.annualRate || 0}%</div>
                    </div>
                    <div class="planner-list-amount">${formatNumber(item.amount)}</div>
                </div>
            `)}
        `;
    }

    getFocusRow(projection) {
        if (!projection?.rows?.length) return null;

        const todayRow = projection.rows.find(row => row.isToday && !row.isStartDay);
        if (todayRow) return todayRow;

        return projection.rows.find(row => !row.isStartDay) || projection.rows[0] || null;
    }

    getDeviationMeta(row) {
        if (!row || row.isStartDay) {
            return {
                text: '',
                emoji: '',
                percent: 0,
                diff: 0,
                planRatio: 0,
                limitRatio: 0,
                status: 'start'
            };
        }

        if (row.riskMeta) {
            return {
                text: row.riskMeta.text || '',
                emoji: row.riskMeta.emoji || '👌',
                percent: row.riskMeta.overPlanPercent || 0,
                diff: row.riskMeta.diff || 0,
                planRatio: row.riskMeta.planRatio || 0,
                limitRatio: row.riskMeta.limitRatio || 0,
                status: row.riskMeta.status || 'ok'
            };
        }

        return {
            text: '',
            emoji: '👌',
            percent: 0,
            diff: 0,
            planRatio: 0,
            limitRatio: 0,
            status: 'ok'
        };
    }

    renderInsights(projection) {
        if (!this.insights) return;

        const row = this.getFocusRow(projection);
        if (!row) {
            this.insights.innerHTML = '';
            return;
        }

        const dailyLimit = Math.floor(projection.summary.dailyLimit || 0);
        const spent = Math.floor(row.totalExpenseDay || 0);
        const left = dailyLimit - spent;
        const deviationMeta = this.getDeviationMeta(row);

        const cards = [
            {
                tone: left >= 0 ? 'success' : 'danger',
                icon: left >= 0 ? '🟢' : '🔴',
                title: row.isToday ? 'Сегодня: лимит' : `День ${row.dayIndex}: лимит`,
                text: left >= 0
                    ? `Запас: ${formatNumber(left)}`
                    : `Перерасход: ${formatNumber(Math.abs(left))}`
            },
            {
                tone: 'info',
                icon: '💰',
                title: row.isToday ? 'Сегодня: изменение' : `День ${row.dayIndex}: изменение`,
                text: `${formatNumber(Math.floor(row.netDay || 0))}`
            },
            {
                tone: 'warning',
                icon: '📉',
                title: row.isToday ? 'Сегодня: остаток' : `День ${row.dayIndex}: остаток`,
                text: `${formatNumber(Math.floor(row.balanceEndOfDay || 0))}`
            },
            {
                tone: 'neutral',
                icon: deviationMeta.emoji || '📊',
                title: 'План / факт',
                text: deviationMeta.text || 'Без отклонений'
            }
        ];

        this.insights.innerHTML = cards.map(card => `
            <div class="planner-insight-card planner-insight-${card.tone}">
                <div class="planner-insight-icon">${card.icon}</div>
                <div class="planner-insight-body">
                    <div class="planner-insight-title">${card.title}</div>
                    <div class="planner-insight-text">${card.text}</div>
                </div>
            </div>
        `).join('');
    }

    getRelativeLabel(row, index) {
        if (index === 0 || row.isStartDay) return 'Старт периода';
        return `День ${row.dayIndex}`;
    }

    renderStartDayCard(row, index) {
        const b = row.startBreakdown || {};

        // Показываем только ненулевые строки — daily/regular на старте всегда 0
        const parts = [
            b.income   > 0 ? `<span>💸 ${formatNumber(Math.floor(b.income))}</span>`    : '',
            b.main     > 0 ? `<span>🏠 -${formatNumber(Math.floor(b.main))}</span>`     : '',
            b.deposits > 0 ? `<span>🏦 -${formatNumber(Math.floor(b.deposits))}</span>` : ''
        ].filter(Boolean).join('');

        return `
            <div class="planner-day-card ${row.isToday ? 'planner-day-card-today' : ''}">
                <div class="planner-day-top">
                    <div>
                        <div class="planner-day-title">
                            ${this.getRelativeLabel(row, index)}
                            ${row.isToday ? '<span class="planner-today-badge">Сегодня</span>' : ''}
                        </div>
                        <div class="planner-day-date">${row.date} · день периода ${row.dayIndex}</div>
                        <div class="planner-day-start-note">
                            Стартовый день формирует доступный остаток. Факт транзакций считается со 2 дня.
                        </div>
                    </div>
                    <div>
                        <div class="planner-day-balance-label">Стартовый остаток</div>
                        <div class="planner-day-balance">${formatNumber(Math.floor(row.balanceEndOfDay || 0))}</div>
                    </div>
                </div>
                ${parts ? `<div class="planner-day-extra planner-day-extra-start">${parts}</div>` : ''}
            </div>
        `;
    }

    renderActionDayCard(row, index) {
        const deviationMeta = this.getDeviationMeta(row);

        return `
            <div class="planner-day-card ${row.isToday ? 'planner-day-card-today' : ''}">
                <div class="planner-day-top">
                    <div>
                        <div class="planner-day-title">
                            ${this.getRelativeLabel(row, index)}
                            ${row.isToday ? '<span class="planner-today-badge">Сегодня</span>' : ''}
                        </div>
                        <div class="planner-day-date">${row.date} · день периода ${row.dayIndex}</div>
                    </div>
                    <div>
                        <div class="planner-day-balance-label">Остаток на конец дня</div>
                        <div class="planner-day-balance">${formatNumber(Math.floor(row.balanceEndOfDay || 0))}</div>
                    </div>
                </div>

                <div class="planner-day-grid">
                    <div class="planner-day-metric">
                        <span class="planner-day-label">Доходы</span>
                        <span class="planner-day-value planner-day-plus">${formatNumber(Math.floor(row.totalIncomeDay || 0))}</span>
                    </div>

                    <div class="planner-day-metric">
                        <span class="planner-day-label">Расходы</span>
                        <span class="planner-day-value planner-day-minus">${formatNumber(Math.floor(row.totalExpenseDay || 0))}</span>
                    </div>

                    <div class="planner-day-metric planner-day-metric-full">
                        <span class="planner-day-label">Изменение</span>
                        <span class="planner-day-value ${row.netDay >= 0 ? 'planner-day-plus' : 'planner-day-minus'}">
                            ${formatNumber(Math.floor(row.netDay || 0))}
                        </span>
                    </div>
                </div>

                ${deviationMeta.text ? `<div class="planner-day-hint">${deviationMeta.text}</div>` : ''}
            </div>
        `;
    }

    renderRows(projection) {
        if (!this.rowsWrap) return;

        const visibleRows = projection.rows;

        this.rowsWrap.innerHTML = `
            <div class="planner-days-block">
                <div class="planner-days-head">
                    <div class="planner-days-title">📅 График по дням</div>
                    <div class="planner-days-subtitle">Компактный план и факт по каждому дню периода</div>
                </div>

                <div class="planner-days-list">
                    ${visibleRows.map((row, index) => (
            row.isStartDay
                ? this.renderStartDayCard(row, index)
                : this.renderActionDayCard(row, index)
        )).join('')}
                </div>
            </div>
        `;
    }

    pluralDays(n) {
        const abs = Math.abs(n);
        if (abs % 10 === 1 && abs % 100 !== 11) return 'день';
        if (abs % 10 >= 2 && abs % 10 <= 4 && (abs % 100 < 10 || abs % 100 >= 20)) return 'дня';
        return 'дней';
    }

    render() {
        if (!this.page) return;

        const planners = this.plannerManager.getPlannersForCurrentBudget();
        this.renderDropdown(planners);
        this.renderEmptyState(planners);

        if (!planners.length || !this.activePlannerId) return;

        const projection = this.plannerManager.calculatePlannerProjection(this.activePlannerId);
        if (!projection) return;

        this.renderSummary(projection);
        this.renderTables(projection);
        this.renderInsights(projection);
        this.renderRows(projection);
    }
}