// summary.js — подсчёт ответа на query_summary. Использует существующие чистые функции проекта
// (isConsumption/isPlainIncome: «потребление», как считает акулка; без вкладов, переводов, долгов и «без учёта»).
import { isConsumption, isPlainIncome } from '../../utils/insightsMath.js';
import { historyTexts, matchesKeywords } from './categories.js';
import { netSavings } from '../../utils/savingsFlow.js';

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
    const kw = intent.keywords?.length ? intent.keywords : null;
    const all = Array.isArray(transactions) ? transactions : [];
    // накопления: пополнения вкладов минус снятия за период (как «Накопления» у Акулки и в «Счетах»)
    if (intent.metric === 'savings') {
        const { net, topups } = netSavings(all, p.from || '', p.to || '9999-12-31');
        return { metric: 'savings', period: p, income: 0, expense: 0, net, total: net, byCategory: [], count: topups, items: [] };
    }
    let income = 0, expense = 0, count = 0;
    const by = new Map();
    const items = [];
    for (const t of all) {
        if (!t || !inRange(t.date)) continue;
        const isExp = isConsumption(t), isInc = isPlainIncome(t);
        if (!isExp && !isInc) continue;
        if (cats || kw) {
            const byCat = !!cats && cats.has(t.category);
            if (!byCat && !(kw && matchesKeywords(historyTexts(t), kw))) continue;   // категория ИЛИ название позиции/заметка
        }
        const a = num(t.amount);
        if (isExp) expense += a; else income += a;
        // число операций — того вида, о котором спросили: «траты за октябрь» не считают поступления
        if (intent.metric === 'income' ? isInc : intent.metric === 'expense' ? isExp : true) count++;
        if (cats || kw) items.push({ date: t.date, name: String(t.name || '').trim() || String(t.note || '').trim() || catOf(t), category: catOf(t), amount: a, income: isInc });
        const wantType = intent.metric === 'income' ? isInc : (intent.metric === 'expense' ? isExp : true);
        if (wantType) { const e = by.get(catOf(t)) || { sum: 0, count: 0 }; e.sum += a; e.count++; by.set(catOf(t), e); }
    }
    let byCategory = [...by.entries()].map(([category, e]) => ({ category, sum: e.sum, count: e.count }));
    // rank: чаще/реже встречающиеся категории (по числу операций), иначе по сумме
    if (intent.rank === 'most') byCategory.sort((a, b) => b.count - a.count || b.sum - a.sum);
    else if (intent.rank === 'least') byCategory.sort((a, b) => a.count - b.count || a.sum - b.sum);
    else byCategory.sort((a, b) => b.sum - a.sum);
    if (intent.limit) byCategory = byCategory.slice(0, intent.limit);
    const total = intent.metric === 'income' ? income : intent.metric === 'expense' ? expense : income - expense;
    const out = { metric: intent.metric, period: p, income, expense, net: income - expense, total, byCategory, count, items: items.sort((x, y) => String(y.date).localeCompare(String(x.date))) };
    if (intent.metric === 'remaining' && typeof opts.balance === 'function') out.remaining = opts.balance(p);
    return out;
}
