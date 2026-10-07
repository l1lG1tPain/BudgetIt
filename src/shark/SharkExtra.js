// ===============================
//   SharkExtra.js — расчёты для новых «разговорных» функций Акулки (чистая логика без DOM):
//   цель накопления, «что я зря трачу», итог месяца, правило 50/30/20, значки, флаги событий.
// ===============================
import { isoDay, shiftDay } from './SharkMood.js';

const num = v => Number(v) || 0;
const dayDiff = (a, b) => Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000);

// ───────── флаги событий (экспорт, выполненный челлендж, достигнутая цель) ─────────
export const FLAGS_KEY = 'budgetit:shark:flags';
export function getFlags(storage = globalThis.localStorage) {
    try { return JSON.parse(storage?.getItem(FLAGS_KEY) || '{}') || {}; } catch (e) { return {}; }
}
export function markFlag(name, storage = globalThis.localStorage) {
    try {
        const f = getFlags(storage);
        if (f[name]) return;
        f[name] = isoDay();
        storage?.setItem(FLAGS_KEY, JSON.stringify(f));
    } catch (e) { /* ignore */ }
}

// ───────── цель накопления ─────────
// goal: { sum, date (ГГГГ-ММ-ДД), start }
export function parseGoalDate(str, today = isoDay()) {
    const s = String(str || '').trim();
    let iso = null;
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) iso = s;
    else if ((m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/))) iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    if (!iso || Number.isNaN(new Date(`${iso}T00:00:00`).getTime())) return null;
    return iso > today ? iso : null;
}

export function formatGoalDate(iso) {
    const [y, m, d] = String(iso).split('-');
    return `${d}.${m}.${y}`;
}

export function goalCalc(goal, tx = [], today = isoDay()) {
    if (!goal || !(goal.sum > 0) || !goal.date) return null;
    const start = goal.start || today;
    const saved = tx.filter(t => t.type === 'deposit' && t.date >= start && t.date <= today).reduce((s, t) => s + num(t.amount), 0);
    const total = Math.max(1, dayDiff(start, goal.date));
    const elapsed = Math.min(total, Math.max(0, dayDiff(start, today)));
    const daysLeft = Math.max(0, dayDiff(today, goal.date));
    const left = Math.max(0, goal.sum - saved);
    const plan = goal.sum * (elapsed / total);
    const perDay = Math.ceil(left / Math.max(daysLeft, 1));
    let status = 'ok';
    if (saved >= goal.sum) status = 'done';
    else if (daysLeft === 0 || (elapsed >= 3 && saved < plan * 0.9)) status = 'behind';
    return {
        status, saved, left, daysLeft, perDay, perWeek: perDay * 7, sum: goal.sum, date: goal.date,
        pct: Math.min(100, Math.floor((saved / goal.sum) * 100))
    };
}

// ───────── «что я зря трачу» ─────────
function sumByCat(tx, from, to) {
    const by = new Map();
    let total = 0;
    for (const t of tx) {
        if (t.type !== 'expense' || !t.date || t.date < from || t.date > to) continue;
        const a = num(t.amount);
        total += a;
        const c = t.category || 'Без категории';
        by.set(c, (by.get(c) || 0) + a);
    }
    return { by, total };
}

export function wasteCategory(tx, today = isoDay()) {
    const cur = sumByCat(tx, shiftDay(today, -13), today);
    const prev = sumByCat(tx, shiftDay(today, -27), shiftDay(today, -14));
    if (!cur.total || !prev.total) return { state: 'none' };
    let up = null, down = null;
    for (const [cat, c] of cur.by) {
        const p = prev.by.get(cat) || 0;
        if (!p) continue;
        const diff = c - p;
        if (diff > 0 && c >= cur.total * 0.05 && diff / p >= 0.2 && (!up || diff > up.diff)) up = { cat, cur: c, prev: p, diff, pct: Math.round((diff / p) * 100) };
    }
    for (const [cat, p] of prev.by) {
        const c = cur.by.get(cat) || 0;
        const diff = p - c;
        if (diff > 0 && p >= prev.total * 0.05 && diff / p >= 0.2 && (!down || diff > down.diff)) down = { cat, cur: c, prev: p, diff, pct: Math.round((diff / p) * 100) };
    }
    if (up) return { state: 'up', ...up };
    if (down) return { state: 'down', ...down };
    return { state: 'none' };
}

// ───────── итог месяца ─────────
export function monthSummary(tx, today = isoDay()) {
    const ym = today.slice(0, 7);
    const list = tx.filter(t => (t.date || '').startsWith(ym));
    if (!list.length) return null;
    const sum = type => list.filter(t => t.type === type).reduce((s, t) => s + num(t.amount), 0);
    const by = new Map();
    for (const t of list) if (t.type === 'expense') by.set(t.category || 'Без категории', (by.get(t.category || 'Без категории') || 0) + num(t.amount));
    const top = [...by.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'разное';
    return { exp: sum('expense'), inc: sum('income'), sav: sum('deposit'), top, days: new Set(list.map(t => t.date)).size };
}

// ───────── правило 50/30/20 (упрощённо: доля трат и накоплений от дохода за 30 дней) ─────────
export function ruleCheck(tx, today = isoDay()) {
    const from = shiftDay(today, -29);
    const within = type => tx.filter(t => t.type === type && t.date >= from && t.date <= today).reduce((s, t) => s + num(t.amount), 0);
    const inc = within('income');
    if (!inc) return { state: 'none' };
    const exp = within('expense'), sav = within('deposit');
    const spentPct = Math.round((exp / inc) * 100), savePct = Math.round((sav / inc) * 100);
    return { state: spentPct > 100 ? 'low' : (spentPct <= 60 || (spentPct <= 80 && savePct >= 15)) ? 'good' : 'mid', spentPct, savePct };
}

// ───────── значки ─────────
export const BADGES = [
    { id: 'first', icon: '🥇', title: 'Первая запись', note: 'первая трата в бюджете' },
    { id: 'log7', icon: '📝', title: '7 дней подряд с записями', note: 'записи семь дней без пропусков' },
    { id: 'lim7', icon: '🎯', title: '7 дней в лимите', note: 'семь дней, уложенных в лимит' },
    { id: 'lim30', icon: '🏅', title: '30 дней в лимите', note: 'тридцать дней в рамках лимита' },
    { id: 'tx50', icon: '📒', title: '50 записей', note: 'пятьдесят записей в бюджете' },
    { id: 'tx200', icon: '📚', title: '200 записей', note: 'двести записей в бюджете' },
    { id: 'saver', icon: '🐷', title: 'Первое накопление', note: 'первое пополнение накоплений' },
    { id: 'debt', icon: '🤝', title: 'Закрытый долг', note: 'один долг закрыт полностью' },
    { id: 'dolphin', icon: '🐬', title: 'Звание «Дельфин»', note: 'звание Дельфин и выше' },
    { id: 'goal', icon: '🌟', title: 'Цель достигнута', note: 'цель накопления собрана' },
    { id: 'export', icon: '💾', title: 'Резервная копия', note: 'хотя бы один экспорт данных' }
];

function hasRun(tx, n) {
    const days = [...new Set(tx.map(t => t.date).filter(Boolean))].sort();
    let run = 1, best = days.length ? 1 : 0;
    for (let i = 1; i < days.length; i++) {
        run = dayDiff(days[i - 1], days[i]) === 1 ? run + 1 : 1;
        if (run > best) best = run;
    }
    return best >= n;
}

// ctx: { transactions, daysInLimit (число), rankIdx, flags }
export function earnedBadges({ transactions = [], daysInLimit = 0, rankIdx = 0, flags = {} } = {}) {
    const tx = transactions;
    const e = new Set();
    if (tx.some(t => t.type === 'expense')) e.add('first');
    if (hasRun(tx, 7)) e.add('log7');
    if (daysInLimit >= 7) e.add('lim7');
    if (daysInLimit >= 30) e.add('lim30');
    if (tx.length >= 50) e.add('tx50');
    if (tx.length >= 200) e.add('tx200');
    if (tx.some(t => t.type === 'deposit')) e.add('saver');
    if (tx.some(t => t.type === 'debt' && t.paid)) e.add('debt');
    if (rankIdx >= 2) e.add('dolphin');
    if (flags.goal) e.add('goal');
    if (flags.export) e.add('export');
    return e;
}
