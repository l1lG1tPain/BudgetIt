// ===============================
//   recapRecords.js — рекорды: сравнение месяца (или года) со всей историей пользователя
//   Сравниваем только «полные» месяцы (записи минимум за 15 дней). Нужно минимум 3 таких месяца.
// ===============================
import { addMonths, keyOf, keyYear, keyMonth, monthRange } from '../analytics/period.js';
import { baseTx, catName } from '../analytics/stats.js';
import { num } from '../utils/insightsMath.js';
import { MIN_ACTIVE_DAYS, activeDaysOf, spendOnly, incomeOnly, splitCat, monthName, ioTx, totalsOf } from './recapStats.js';

export const MIN_RECORD_MONTHS = 3;
const plural = (n, a, b, c) => { const m = Math.abs(n) % 100, d = m % 10; return m > 10 && m < 20 ? c : d > 1 && d < 5 ? b : d === 1 ? a : c; };

/** Метрики всех месяцев, где есть данные: Map key → { key, expense, income, net, saveRate, active, cats } */
export function monthMetrics(all) {
    const tx = baseTx(all);
    const by = new Map();
    for (const t of tx) { const k = keyOf(t.date); if (!by.has(k)) by.set(k, []); by.get(k).push(t); }
    const rawBy = new Map();
    for (const t of ioTx(all)) { const k = keyOf(t.date); if (!rawBy.has(k)) rawBy.set(k, []); rawBy.get(k).push(t); }
    const out = new Map();
    for (const [key, list] of by) {
        const exp = spendOnly(list), inc = incomeOnly(list);
        const expense = exp.reduce((s, t) => s + num(t.amount), 0);
        const income = inc.reduce((s, t) => s + num(t.amount), 0);
        const cats = new Map();
        for (const t of exp) cats.set(catName(t), (cats.get(catName(t)) || 0) + num(t.amount));
        // деньги месяца — как на главном экране: все доходы и расходы, включая переводы, вклады, долги и «без учёта»
        const { expense: totE, income: totI } = totalsOf(rawBy.get(key) || []);
        out.set(key, { key, expense: totE, income: totI, net: totI - totE, saveRate: totI > 0 ? (totI - totE) / totI : null, active: activeDaysOf(list), cats });
    }
    return out;
}

const fullMonths = metrics => [...metrics.values()].filter(m => m.active >= MIN_ACTIVE_DAYS);

/**
 * Рекорды месяца key относительно всех полных месяцев до него включительно.
 * Возвращает до 4 штук: [{ emoji, title, text, tone }]
 */
export function monthRecords(all, key, metrics = monthMetrics(all)) {
    const cur = metrics.get(key);
    if (!cur || cur.active < MIN_ACTIVE_DAYS) return [];
    const hist = fullMonths(metrics).filter(m => m.key < key);
    if (hist.length < MIN_RECORD_MONTHS - 1) return [];
    const n = hist.length + 1;
    const scope = `из ${n} ${plural(n, 'месяца', 'месяцев', 'месяцев')} в истории`;
    const recs = [];
    const lowest = (v, pick) => hist.every(m => v < pick(m));
    const highest = (v, pick) => hist.every(m => v > pick(m));

    if (cur.expense > 0 && lowest(cur.expense, m => m.expense)) recs.push({ p: 90, emoji: '🧘', title: 'Самый экономный месяц', text: `Тратил меньше, чем в любом другом месяце — это лучший результат ${scope}.`, tone: 'good' });
    if (cur.expense > 0 && highest(cur.expense, m => m.expense)) recs.push({ p: 80, emoji: '🔥', title: 'Рекордные траты', text: `Больше ещё не тратил: это максимум ${scope}.`, tone: 'bad' });
    if (cur.income > 0 && highest(cur.income, m => m.income)) recs.push({ p: 85, emoji: '🚀', title: 'Рекордные поступления', text: `Больше денег ещё не приходило: максимум ${scope}.`, tone: 'good' });
    if (cur.saveRate !== null && cur.saveRate > 0 && hist.every(m => m.saveRate === null || cur.saveRate > m.saveRate) && hist.some(m => m.saveRate !== null)) recs.push({ p: 88, emoji: '🐷', title: 'Рекорд накоплений', text: `Отложено ${Math.round(cur.saveRate * 100)}% от поступлений — лучше любого другого месяца.`, tone: 'good' });
    else if (cur.net > 0 && highest(cur.net, m => m.net)) recs.push({ p: 70, emoji: '💰', title: 'Лучший остаток', text: `Остаток — самый большой ${scope}.`, tone: 'good' });

    // категории: берём только заметные (≥ 5% трат) и регулярные (были минимум в 2 прошлых месяцах)
    for (const [cat, amount] of cur.cats) {
        if (!cur.expense || amount / cur.expense < 0.05) continue;
        const past = hist.map(m => m.cats.get(cat) || 0);
        if (past.filter(v => v > 0).length < 2) continue;
        const { emoji, text } = splitCat(cat);
        if (amount > Math.max(...past)) recs.push({ p: 60 + Math.min(20, amount / cur.expense * 40), emoji, title: `Рекорд: ${text}`, text: `Столько на «${text}» ещё не уходило: максимум ${scope}.`, tone: 'bad' });
        else if (amount < Math.min(...past.filter(v => v > 0)) && past.filter(v => v > 0).length >= 3) recs.push({ p: 55, emoji, title: `Меньше всего на «${text}»`, text: `Минимум ${scope}. Заметно сократил.`, tone: 'good' });
    }
    return recs.sort((a, b) => b.p - a.p).slice(0, 4).map(({ p, ...r }) => r);
}

/** Рекорды внутри года: лучший/худший месяц, самая длинная пауза. */
export function yearRecords(all, year, metrics = monthMetrics(all)) {
    const months = monthRange(`${year}-01`, `${year}-12`).map(k => metrics.get(k)).filter(m => m && m.active >= MIN_ACTIVE_DAYS);
    if (months.length < 3) return [];
    const recs = [];
    const by = (arr, f, dir) => arr.reduce((a, b) => (dir * (f(b) - f(a)) > 0 ? b : a));
    const calm = by(months, m => m.expense, -1), loud = by(months, m => m.expense, 1);
    const best = by(months, m => m.net, 1);
    if (calm.key !== loud.key) {
        recs.push({ emoji: '🧘', title: `Самый экономный — ${monthName(calm.key)}`, text: 'Меньше всего трат за год.', tone: 'good' });
        recs.push({ emoji: '🔥', title: `Самый дорогой — ${monthName(loud.key)}`, text: 'Больше всего трат за год.', tone: 'bad' });
    }
    if (best.net > 0) recs.push({ emoji: '💰', title: `Лучший остаток — ${monthName(best.key)}`, text: 'Больше всего удалось сохранить.', tone: 'good' });
    return recs.slice(0, 4);
}
