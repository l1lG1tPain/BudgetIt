// src/planner/plannerUtils.js

export function plannerUid(prefix = 'planner') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function formatLocalISODate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function normalizeISODate(value) {
    if (!value) return '';

    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value;
    }

    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return formatLocalISODate(d);
}

export function addDays(dateStr, days) {
    const safe = normalizeISODate(dateStr);
    if (!safe) return '';

    const [year, month, day] = safe.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    if (Number.isNaN(d.getTime())) return '';

    d.setDate(d.getDate() + (Number(days) || 0));
    return formatLocalISODate(d);
}

export function buildPeriodDates(startDate, periodDays) {
    const safeStart = normalizeISODate(startDate);
    const safeDays = Math.max(1, Number(periodDays) || 1);

    if (!safeStart) return [];

    return Array.from({ length: safeDays }, (_, i) => ({
        dayIndex: i + 1,
        offsetDay: i,
        date: addDays(safeStart, i)
    }));
}

export function groupTransactionsByDate(transactions = []) {
    const map = new Map();

    for (const tx of transactions) {
        const date = normalizeISODate(tx?.date);
        if (!date) continue;

        if (!map.has(date)) map.set(date, []);
        map.get(date).push(tx);
    }

    return map;
}

export function sumAmount(list = []) {
    return list.reduce((sum, item) => sum + (Number(item?.amount) || 0), 0);
}

export function calculateSimpleDepositInterest(amount, annualRate, termDays) {
    const a = Number(amount) || 0;
    const r = Number(annualRate) || 0;
    const d = Number(termDays) || 0;

    if (a <= 0 || r <= 0 || d <= 0) return 0;
    return a * (r / 100) * (d / 365);
}

export function ensureBudgetId(budget) {
    if (!budget) return '';
    if (!budget.id) {
        budget.id = `budget_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    }
    return budget.id;
}

export function normalizePlanner(raw = {}, budgetId = '') {
    const startDate = normalizeISODate(raw.startDate) || formatLocalISODate(new Date());
    const periodDays = Math.max(1, Number(raw.periodDays) || 15);
    const endDate = normalizeISODate(raw.endDate) || addDays(startDate, periodDays - 1);
    const nowIso = new Date().toISOString();

    return {
        id: raw.id || plannerUid(),
        budgetId: raw.budgetId || budgetId || '',
        name: String(raw.name || '').trim(),

        incomePlan: {
            category: String(raw?.incomePlan?.category || '💼 Зарплата').trim(),
            amount: Number(raw?.incomePlan?.amount) || 0,
            incomeDate: normalizeISODate(raw?.incomePlan?.incomeDate) || startDate
        },

        startDate,
        periodDays,
        endDate,

        mainExpenses: Array.isArray(raw.mainExpenses)
            ? raw.mainExpenses.map(item => ({
                id: item.id || plannerUid('main'),
                category: String(item.category || '').trim(),
                amount: Number(item.amount) || 0,
                date: normalizeISODate(item.date) || startDate,
                note: String(item.note || '').trim()
            }))
            : [],

        dailyExpenses: Array.isArray(raw.dailyExpenses)
            ? raw.dailyExpenses.map(item => ({
                id: item.id || plannerUid('daily'),
                category: String(item.category || '').trim(),
                amountPerDay: Number(item.amountPerDay) || 0,
                note: String(item.note || '').trim()
            }))
            : [],

        regularExpenses: Array.isArray(raw.regularExpenses)
            ? raw.regularExpenses.map(item => ({
                id: item.id || plannerUid('regular'),
                category: String(item.category || '').trim(),
                amount: Number(item.amount) || 0,
                everyNDays: Math.max(1, Number(item.everyNDays) || 1),
                startOffsetDay: Math.max(0, Number(item.startOffsetDay) || 0),
                note: String(item.note || '').trim()
            }))
            : [],

        plannedDeposits: Array.isArray(raw.plannedDeposits)
            ? raw.plannedDeposits.map(item => {
                const depStart = normalizeISODate(item.startDate) || startDate;
                const termDays = Math.max(0, Number(item.termDays) || 0);

                return {
                    id: item.id || plannerUid('deposit'),
                    title: String(item.title || 'Вклад').trim(),
                    amount: Number(item.amount) || 0,
                    annualRate: Number(item.annualRate) || 0,
                    startDate: depStart,
                    termDays,
                    endDate: termDays > 0
                        ? normalizeISODate(item.endDate) || addDays(depStart, termDays - 1)
                        : depStart,
                    payoutMode: item.payoutMode === 'at_end' ? 'at_end' : 'manual'
                };
            })
            : [],

        createdAt: raw.createdAt || nowIso,
        updatedAt: nowIso,
        archived: Boolean(raw.archived)
    };
}

export function validatePlannerPayload(payload = {}) {
    const errors = {};

    const name = String(payload.name || '').trim();
    if (!name) errors.name = 'Введите название планирования';

    const incomeAmount = Number(payload?.incomePlan?.amount) || 0;
    if (incomeAmount <= 0) errors.incomeAmount = 'Введите сумму дохода';

    const incomeDate = normalizeISODate(payload?.incomePlan?.incomeDate);
    if (!incomeDate) errors.incomeDate = 'Выберите дату дохода';

    const startDate = normalizeISODate(payload.startDate);
    if (!startDate) errors.startDate = 'Выберите дату начала периода';

    const periodDays = Number(payload.periodDays) || 0;
    if (periodDays <= 0) errors.periodDays = 'Введите длину периода';

    (payload.mainExpenses || []).forEach((item, index) => {
        if (!String(item.category || '').trim()) {
            errors[`mainExpenses.${index}.category`] = 'Выберите категорию';
        }
        if ((Number(item.amount) || 0) <= 0) {
            errors[`mainExpenses.${index}.amount`] = 'Введите сумму';
        }
        if (!normalizeISODate(item.date)) {
            errors[`mainExpenses.${index}.date`] = 'Выберите дату';
        }
    });

    (payload.dailyExpenses || []).forEach((item, index) => {
        if (!String(item.category || '').trim()) {
            errors[`dailyExpenses.${index}.category`] = 'Выберите категорию';
        }
        if ((Number(item.amountPerDay) || 0) <= 0) {
            errors[`dailyExpenses.${index}.amountPerDay`] = 'Введите сумму';
        }
    });

    (payload.regularExpenses || []).forEach((item, index) => {
        if (!String(item.category || '').trim()) {
            errors[`regularExpenses.${index}.category`] = 'Выберите категорию';
        }
        if ((Number(item.amount) || 0) <= 0) {
            errors[`regularExpenses.${index}.amount`] = 'Введите сумму';
        }
        if ((Number(item.everyNDays) || 0) <= 0) {
            errors[`regularExpenses.${index}.everyNDays`] = 'Введите период';
        }
    });

    (payload.plannedDeposits || []).forEach((item, index) => {
        if (!String(item.title || '').trim()) {
            errors[`plannedDeposits.${index}.title`] = 'Введите название вклада';
        }
        if ((Number(item.amount) || 0) <= 0) {
            errors[`plannedDeposits.${index}.amount`] = 'Введите сумму';
        }
        if ((Number(item.termDays) || 0) < 0) {
            errors[`plannedDeposits.${index}.termDays`] = 'Срок не может быть отрицательным';
        }
    });

    return {
        isValid: Object.keys(errors).length === 0,
        errors
    };
}