// summary.js — подсчёт ответа на query_summary. Использует существующие чистые функции проекта
// (isConsumption/isPlainIncome: «потребление», как считает акулка; без вкладов, переводов, долгов и «без учёта»).
import { isConsumption, isPlainIncome } from '../../utils/insightsMath.js';

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const catOf = t => String(t.category || '').trim() || 'Без категории';

/**
 * @param {object} intent  query_summary из parseUtterance
 * @param {Array} transactions все операции текущего бюджета
 * @param {{balance?: (period) => number}} opts  balance — колбэк «сколько осталось» (главный экран считает его в BudgetManager)
 * @returns {{metric, period, income, expense, net, total, byCategory, count, remaining?}}
 */
export function runSummary(intent, transactions, opts = {}) {
    const p = intent.period || {};
    const inRange = d => !!d && (!p.from || d >= p.from) && (!p.to || d <= p.to);
    const cats = intent.categories?.length ? new Set(intent.categories) : null;
    const all = Array.isArray(transactions) ? transactions : [];
    let income = 0, expense = 0, count = 0;
    const by = new Map();
    for (const t of all) {
        if (!t || !inRange(t.date)) continue;
        const isExp = isConsumption(t), isInc = isPlainIncome(t);
        if (!isExp && !isInc) continue;
        if (cats && !cats.has(t.category)) continue;
        const a = num(t.amount);
        if (isExp) expense += a; else income += a;
        count++;
        const wantType = intent.metric === 'income' ? isInc : (intent.metric === 'expense' ? isExp : true);
        if (wantType) by.set(catOf(t), (by.get(catOf(t)) || 0) + a);
    }
    let byCategory = [...by.entries()].map(([category, sum]) => ({ category, sum })).sort((a, b) => b.sum - a.sum);
    if (intent.limit) byCategory = byCategory.slice(0, intent.limit);
    const total = intent.metric === 'income' ? income : intent.metric === 'expense' ? expense : income - expense;
    const out = { metric: intent.metric, period: p, income, expense, net: income - expense, total, byCategory, count };
    if (intent.metric === 'remaining' && typeof opts.balance === 'function') out.remaining = opts.balance(p);
    return out;
}
