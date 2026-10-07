// ===============================
//   SharkPlus.js — расчёты для «болтливой» Акулки (чистая логика без DOM):
//   челленджи, звания, статистика для ответов в чате и инициативные реплики в карточке.
// ===============================
import { isoDay, shiftDay, getSpentOnDay } from './SharkMood.js';

const dayDiff = (a, b) => Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000);
const num = v => Number(v) || 0;
const median = arr => {
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ───────── челленджи ─────────
export const CHALLENGES = [
    { id: 'nospend', icon: '🧘', title: 'День без трат', days: 7, need: 1, measure: 'noSpend', note: 'один день недели без единой траты' },
    { id: 'limit3', icon: '🎯', title: '3 дня в лимите', days: 7, need: 3, measure: 'inLimit', note: 'три дня за неделю в рамках лимита' },
    { id: 'limit5', icon: '🏅', title: '5 дней в лимите', days: 7, need: 5, measure: 'inLimit', note: 'пять дней за неделю в рамках лимита' },
    { id: 'log7', icon: '📝', title: '7 дней с записями', days: 7, need: 7, measure: 'records', note: 'записи каждый день недели' },
    { id: 'save', icon: '🐷', title: 'Отложить на неделе', days: 7, need: 1, measure: 'deposit', note: 'хотя бы одно накопление за неделю' },
    { id: 'nocafe', icon: '☕', title: 'Неделя без кафе', days: 7, need: 7, measure: 'noCafe', note: 'неделя без трат на кафе, кофе и доставку' },
    { id: 'limit20', icon: '🏆', title: '20 дней в лимите за месяц', days: 30, need: 20, measure: 'inLimit', note: 'двадцать дней из тридцати в рамках лимита' },
    { id: 'save3', icon: '💰', title: 'Три накопления за две недели', days: 14, need: 3, measure: 'deposit', note: 'три пополнения накоплений за две недели' },
    { id: 'calm7', icon: '🌊', title: 'Неделя без перерасхода', days: 7, need: 7, measure: 'calm', note: 'каждый день недели в лимите' }
];
export const getChallenge = id => CHALLENGES.find(c => c.id === id) || null;

// state: { id, start, status?: 'active'|'done'|'fail', seenOn? }
export function evaluateChallenge(state, ctx = {}) {
    const def = state && getChallenge(state.id);
    if (!def) return null;
    const today = ctx.today || isoDay();
    const tx = ctx.transactions || [];
    const limit = ctx.limit || 0;
    const end = shiftDay(state.start, def.days - 1);
    const base = { def, id: def.id, title: def.title, icon: def.icon, need: def.need, start: state.start, seenOn: state.seenOn || null };
    if (state.status === 'done' || state.status === 'fail') {
        return { ...base, status: state.status, done: state.done ?? 0, daysLeft: 0 };
    }
    const days = [];
    for (let d = state.start; d <= today && d <= end; d = shiftDay(d, 1)) days.push(d);
    const complete = days.filter(d => d < today);
    const spentOn = d => getSpentOnDay({ transactions: tx, planner: ctx.planner, day: d, normalize: ctx.normalize });
    const hasExpense = d => tx.some(t => t.type === 'expense' && t.date === d);
    let done = 0, broken = false;
    if (def.measure === 'noSpend') {
        const activeUser = tx.some(t => t.type === 'expense' && t.date >= shiftDay(state.start, -14) && t.date < state.start);
        done = activeUser ? complete.filter(d => !hasExpense(d)).length : 0;
    } else if (def.measure === 'inLimit') {
        done = limit ? complete.filter(d => { const s = spentOn(d); return s > 0 && s <= limit; }).length : 0;
    } else if (def.measure === 'records') {
        done = days.filter(d => tx.some(t => t.date === d)).length;
    } else if (def.measure === 'deposit') {
        done = tx.filter(t => t.type === 'deposit' && t.date >= state.start && t.date <= today).length;
    } else if (def.measure === 'noCafe') {
        const re = /кафе|ресторан|кофе|фастфуд|доставк|кофейн|бар\b/i;
        const cafeOn = d => tx.some(t => t.type === 'expense' && t.date === d && re.test(String(t.category || '')));
        const activeUser = tx.some(t => t.type === 'expense' && t.date >= shiftDay(state.start, -14) && t.date < state.start);
        done = activeUser ? complete.filter(d => !cafeOn(d)).length : 0;
        broken = days.some(cafeOn);
    } else if (def.measure === 'calm') {
        done = limit ? complete.filter(d => spentOn(d) <= limit).length : 0;
        broken = !!limit && complete.some(d => spentOn(d) > limit);
    }
    done = Math.min(done, def.need);
    const daysLeft = Math.max(0, dayDiff(today, end) + 1);
    let status = 'active';
    if (done >= def.need) status = 'done';
    else if (broken || today > end) status = 'fail';
    return { ...base, status, done, daysLeft };
}

// ───────── звания ─────────
export const RANKS = [
    { min: 0, name: 'Малёк', emoji: '🐟' },
    { min: 3, name: 'Рыбка', emoji: '🐠' },
    { min: 8, name: 'Дельфин', emoji: '🐬' },
    { min: 15, name: 'Акулёнок', emoji: '🦈' },
    { min: 25, name: 'Акула', emoji: '🦈' },
    { min: 40, name: 'Кит', emoji: '🐋' },
    { min: 52, name: 'Легенда океана', emoji: '👑' }
];

// Сколько из последних 60 дней (кроме сегодняшнего) уложились в лимит и записывали траты
export function countDaysInLimit({ transactions = [], planner = null, limit = 0, today = isoDay(), normalize } = {}) {
    if (!limit) return 0;
    let n = 0;
    for (let i = 1; i <= 60; i++) {
        const day = shiftDay(today, -i);
        if (!transactions.some(t => t.type === 'expense' && t.date === day)) continue;
        const s = getSpentOnDay({ transactions, planner, day, normalize });
        if (s > 0 && s <= limit) n++;
    }
    return n;
}

export function rankInfo(days) {
    let idx = 0;
    RANKS.forEach((r, i) => { if (days >= r.min) idx = i; });
    const next = RANKS[idx + 1] || null;
    return { days, idx, rank: RANKS[idx], next, need: next ? next.min - days : 0, top: !next };
}

// ───────── статистика для ответов ─────────
export function topCategories(tx, today, days = 30) {
    const from = shiftDay(today, -(days - 1));
    const by = new Map();
    let total = 0;
    for (const t of tx) {
        if (t.type !== 'expense' || !t.date || t.date < from || t.date > today) continue;
        const a = num(t.amount);
        total += a;
        const c = t.category || 'Без категории';
        by.set(c, (by.get(c) || 0) + a);
    }
    const list = [...by.entries()].sort((a, b) => b[1] - a[1]);
    return { total, list, count: list.length };
}

export function weekCompare({ transactions = [], planner = null, today = isoDay(), normalize } = {}) {
    let cur = 0, prev = 0, prevHas = false;
    for (let i = 0; i < 14; i++) {
        const day = shiftDay(today, -i);
        const s = getSpentOnDay({ transactions, planner, day, normalize });
        if (i < 7) cur += s; else { prev += s; if (transactions.some(t => t.date === day)) prevHas = true; }
    }
    return { cur, prev, prevHas };
}

// Прогноз на конец дня по текущему темпу (активные часы 8–22)
export function forecastDay({ spent = 0, limit = 0, now = new Date() } = {}) {
    if (!limit) return { state: 'none' };
    if (spent > limit) return { state: 'over' };
    const h = now.getHours() + now.getMinutes() / 60;
    if (spent <= 0 || h < 9) return { state: 'early' };
    const elapsed = Math.max(h - 8, 1);
    const proj = h >= 22 ? spent : Math.round(spent * (14 / elapsed));
    const projected = Math.max(proj, spent);
    return { state: projected <= limit ? 'safe' : 'risk', proj: projected };
}

const openDebts = tx => tx.filter(t => t.type === 'debt' && !t.paid && num(t.remainingAmount ?? t.initialAmount ?? t.amount) > 0);
const debtLeft = t => num(t.remainingAmount ?? t.initialAmount ?? t.amount);

export function debtSummary(tx) {
    const list = openDebts(tx);
    const owe = list.filter(t => t.direction === 'owe');
    const owed = list.filter(t => t.direction !== 'owe');
    const sum = a => a.reduce((s, t) => s + debtLeft(t), 0);
    return { oweSum: sum(owe), owedSum: sum(owed), oweCount: owe.length, owedCount: owed.length };
}

// Самый давний открытый долг (не моложе minDays) в заданном направлении
export function oldestDebt(tx, today, direction, minDays = 14) {
    const list = openDebts(tx)
        .filter(t => (direction === 'owe' ? t.direction === 'owe' : t.direction !== 'owe') && t.date)
        .map(t => ({ name: t.name || 'Долг', sum: debtLeft(t), days: dayDiff(t.date, today) }))
        .filter(d => d.days >= minDays)
        .sort((a, b) => b.days - a.days);
    return list[0] || null;
}

export function savingsMonth(tx, today) {
    const ym = today.slice(0, 7);
    const list = tx.filter(t => t.type === 'deposit' && (t.date || '').startsWith(ym));
    return { sum: list.reduce((s, t) => s + num(t.amount), 0), count: list.length };
}

export const incomeToday = (tx, today) => tx.filter(t => t.type === 'income' && t.date === today).reduce((s, t) => s + num(t.amount), 0);

// Сегодняшняя трата заметно больше обычной (минимум в 3 раза от медианы за 30 дней)
export function detectSpike(tx, today) {
    const from = shiftDay(today, -30);
    const past = tx.filter(t => t.type === 'expense' && t.date >= from && t.date < today).map(t => num(t.amount)).filter(a => a > 0);
    if (past.length < 8) return null;
    const m = median(past);
    if (!(m > 0)) return null;
    const todays = tx.filter(t => t.type === 'expense' && t.date === today).sort((a, b) => num(b.amount) - num(a.amount));
    const big = todays[0];
    if (!big) return null;
    const times = Math.floor(num(big.amount) / m);
    return times >= 3 ? { sum: num(big.amount), cat: big.category || 'Без категории', times } : null;
}

// Итог прошлой недели (7 дней до сегодняшнего дня)
export function weekRecapData({ transactions = [], planner = null, today = isoDay(), limit = 0, normalize } = {}) {
    let total = 0, daysWith = 0, inLimit = 0;
    const by = new Map();
    for (let i = 1; i <= 7; i++) {
        const day = shiftDay(today, -i);
        if (!transactions.some(t => t.date === day)) continue;
        const s = getSpentOnDay({ transactions, planner, day, normalize });
        total += s; daysWith++;
        if (limit && s <= limit) inLimit++;
        for (const t of transactions) {
            if (t.type === 'expense' && t.date === day) by.set(t.category || 'Без категории', (by.get(t.category || 'Без категории') || 0) + num(t.amount));
        }
    }
    const top = [...by.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    return { total, daysWith, inLimit, avg: daysWith ? Math.round(total / daysWith) : 0, top };
}

// Праздники (ключи соответствуют PROACTIVE.holiday_*)
export function holidayKey(now = new Date()) {
    const m = now.getMonth() + 1, d = now.getDate();
    if ((m === 12 && d >= 26) || (m === 1 && d <= 1)) return 'newyear';
    if (m === 2 && d >= 13 && d <= 14) return 'valentine';
    if (m === 3 && d >= 6 && d <= 8) return 'womensday';
    if (m === 3 && d >= 20 && d <= 22) return 'navruz';
    return null;
}
