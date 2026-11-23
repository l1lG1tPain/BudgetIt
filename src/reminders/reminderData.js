// ===============================
//   reminderData.js — сборка данных для planReminder
//   buildReminderData — чистая функция (всё приходит аргументами), collectReminderData — тонкая обёртка
//   над BudgetManager / PlannerManager / Акулкой. Даты — строки YYYY-MM-DD по местному времени.
// ===============================

import {
    getSharkSettings, getLimitInfo, getSpentOnDay, getNoSpendDays, planStatus, planAverageLimit, planIncomeWaiting, isoDay
} from '../shark/SharkMood.js';

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const KEEP_DAYS = 90;   // в снимок идут только последние 90 дней операций — этого хватает для всех напоминаний

export function currencyLabel(storage = globalThis.localStorage) {
    let r = 'UZ';
    try { r = storage?.getItem('region') || 'UZ'; } catch { /* ignore */ }
    return { RU: 'руб', KZ: 'тенге', KG: 'сом' }[r] || 'сум';
}

/** Дата окончания вклада: дата открытия + termMonths (в конце месяца — последний день месяца). */
export function depositEndDate(startIso, termMonths) {
    if (!YMD_RE.test(String(startIso)) || !(Number(termMonths) > 0)) return '';
    const y = Number(startIso.slice(0, 4));
    const m = Number(startIso.slice(5, 7)) - 1 + Number(termMonths);
    const d = Number(startIso.slice(8, 10));
    const last = new Date(y, m + 1, 0).getDate();
    const end = new Date(y, m, Math.min(d, last));
    return isoDay(end);
}

/** Вклады с известным сроком: из плана ({title, endDate}) и из операций (корень вклада с termMonths). */
export function collectDeposits({ transactions = [], planners = [] } = {}) {
    const out = [];
    const seen = new Set();
    const push = (title, endDate) => {
        if (!YMD_RE.test(String(endDate))) return;
        const key = `${title}|${endDate}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ title: title || 'Вклад', endDate });
    };
    for (const p of planners) {
        if (!p || p.archived) continue;
        for (const d of p.plannedDeposits || []) {
            if (d?.termDays > 0) push(d.title, d.endDate);
        }
    }
    const roots = new Map();
    for (const t of transactions) {
        if (t.type !== 'deposit' || !(Number(t.termMonths) > 0)) continue;
        const k = t.depositId || t.id;
        if (!roots.has(k) || String(t.date) < String(roots.get(k).date)) roots.set(k, t);
    }
    for (const t of roots.values()) push(t.title || t.category || t.note || 'Вклад', depositEndDate(t.date, t.termMonths));
    return out;
}

/** Урезает операции до полей, нужных напоминаниям, и до последних дней. */
export function slimTransactions(transactions = [], today = isoDay()) {
    const d = new Date(`${today}T00:00:00`);
    d.setDate(d.getDate() - KEEP_DAYS);
    const from = isoDay(d);
    return transactions
        .filter(t => t && t.date && t.date >= from)
        .map(t => ({
            type: t.type, date: t.date, amount: Number(t.amount) || 0, category: t.category || ''
        }));
}

/**
 * Чистая сборка data для planReminder.
 * @param {object} a { transactions, allTransactions, planner, planners, noSpend, limit, spentToday, currency, character, incomeOverdue, today }
 */
export function buildReminderData(a = {}) {
    const today = a.today || isoDay();
    const planner = a.planner || null;
    return {
        transactions: a.transactions || [],
        noSpend: a.noSpend || [],
        planner: planner ? {
            archived: !!planner.archived,
            mainExpenses: (planner.mainExpenses || []).map(i => ({ category: i.category, note: i.note, date: i.date, amount: i.amount })),
            incomePlan: planner.incomePlan
                ? { category: planner.incomePlan.category, incomeDate: planner.incomePlan.incomeDate, amount: planner.incomePlan.amount }
                : null
        } : null,
        limit: Number(a.limit) || 0,
        spentToday: Number(a.spentToday) || 0,
        currency: a.currency || '',
        character: a.character || 'normal',
        plannerIncomeOverdue: a.incomeOverdue || null,
        deposits: collectDeposits({ transactions: a.allTransactions || a.transactions || [], planners: a.planners || [] }),
        today
    };
}

/** Собирает data из живых менеджеров. Текст сюда не попадает: «Акулу» его склоняет forShark при показе. */
export function collectReminderData({ bm, pm, storage = globalThis.localStorage, now = new Date() } = {}) {
    const budget = bm?.getCurrentBudget?.();
    const all = budget?.transactions || [];
    const today = isoDay(now);
    const planners = pm?.getAllPlanners?.() || [];
    const bid = pm?.getCurrentBudgetId?.() || budget?.id;
    const status = planStatus(planners, bid, today);
    const planner = status.state === 'active' ? status.planner : null;
    const normalize = c => pm?.normalizeCategory?.(c) ?? String(c || '').trim();
    const settings = getSharkSettings(storage);
    const planLimit = planner ? planAverageLimit(pm, planner) : 0;
    const planWaiting = planner ? planIncomeWaiting(pm, planner) : false;
    const info = getLimitInfo({ transactions: all, planner, today, settings, normalize, planLimit, planWaiting });
    const spentToday = getSpentOnDay({ transactions: all, planner, day: today, normalize });

    let incomeOverdue = null;
    try {
        const s = planner ? pm.calculatePlannerProjection(planner.id)?.summary : null;
        if (s?.incomeOverdue && !(s.incomeReceived > 0)) {
            incomeOverdue = { item: planner.incomePlan?.category || 'Доход', amount: s.incomeAmount };
        }
    } catch { /* без просрочки */ }

    return buildReminderData({
        transactions: slimTransactions(all, today),
        allTransactions: all,
        planner,
        planners: planners.filter(p => p.budgetId === bid),
        noSpend: getNoSpendDays(storage),
        limit: info.limit,
        spentToday,
        currency: currencyLabel(storage),
        character: settings.character,
        incomeOverdue,
        today
    });
}
