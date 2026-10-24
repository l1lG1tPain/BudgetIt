// ===============================
//   recapPeriods.js — итоги недели и года, список доступных итогов и «просмотрено»
//   Единая точка для UI: availableRecaps(), buildAnyRecap(kind, ...).
// ===============================
import { keyOf, keyYear, keyMonth, MONTHS_FULL, monthRange } from '../analytics/period.js';
import { weekdayMon, baseTx, catName } from '../analytics/stats.js';
import { num } from '../utils/insightsMath.js';
import {
    buildRecap, recapAvailability, recapMood, splitCat, monthName, spendOnly, incomeOnly, groupSum, activeDaysOf, dayOf, monthTx, ioTx, totalsOf, MIN_ACTIVE_DAYS, RECAP_PREVIEW
} from './recapStats.js';
import { monthMetrics, monthRecords, yearRecords } from './recapRecords.js';
import { readScoped } from '../shark/SharkMood.js';
import { goalCalc } from '../shark/SharkExtra.js';

// ---------- «против прошлого года» и цель накопления ----------
const catMove = (curCats, prevCats) => {
    let move = null;
    for (const [name, amount] of curCats) {
        const before = prevCats.get(name) || 0, d = amount - before;
        if (before > 0 && (!move || Math.abs(d) > Math.abs(move.diff))) move = { ...splitCat(name), name, diff: d, pct: d / before };
    }
    return move;
};
const sumBy = (list) => list.reduce((s, t) => s + num(t.amount), 0);
const catMap = exp => new Map(groupSum(exp, catName).map(c => [c.name, c.amount]));

/** Этот месяц против того же месяца год назад. null, если там мало записей (меньше полного месяца). */
export function vsLastYearMonth(all, key, curExpense, curIncome, curTx) {
    const pKey = `${keyYear(key) - 1}-${key.slice(5, 7)}`;
    const pTx = baseTx(all).filter(t => keyOf(t.date) === pKey);
    const active = activeDaysOf(pTx);
    if (active < MIN_ACTIVE_DAYS) return null;
    const pExp = spendOnly(pTx);
    const { expense: pe, income: pi } = totalsOf(ioTx(all).filter(t => keyOf(t.date) === pKey));
    return {
        scope: 'month', name: monthName(pKey), year: keyYear(pKey), curYear: keyYear(key), expense: pe, income: pi,
        expenseDelta: pe > 0 ? (curExpense - pe) / pe : null, incomeDelta: pi > 0 ? (curIncome - pi) / pi : null,
        move: catMove(catMap(spendOnly(curTx)), catMap(pExp))
    };
}

/** Этот год против прошлого. null, если в прошлом году данных мало. */
export function vsLastYearYear(all, year, curExpense, curIncome, curTx) {
    const pTx = txIn(all, `${year - 1}-01-01`, `${year - 1}-12-31`);
    if (activeDaysOf(pTx) < YEAR_MIN_DAYS || new Set(pTx.map(t => keyOf(t.date))).size < YEAR_MIN_MONTHS) return null;
    const pExp = spendOnly(pTx);
    const { expense: pe, income: pi } = totalsOf(ioTx(all).filter(t => t.date >= `${year - 1}-01-01` && t.date <= `${year - 1}-12-31`));
    return {
        scope: 'year', year: year - 1, curYear: year, expense: pe, income: pi,
        expenseDelta: pe > 0 ? (curExpense - pe) / pe : null, incomeDelta: pi > 0 ? (curIncome - pi) / pi : null,
        move: catMove(catMap(spendOnly(curTx)), catMap(pExp))
    };
}

/** Активная цель накопления из Акулки (если есть и ещё не достигнута). */
export function activeGoal(all, todayISO) {
    try {
        const g = JSON.parse(readScoped('budgetit:shark:goal') || 'null');
        if (!g || g.status === 'done') return null;
        const c = goalCalc(g, all, todayISO);
        return c && c.status !== 'done' ? { ...c, start: g.start || todayISO } : null;
    } catch (e) { return null; }
}

export const WEEK_MIN_DAYS = RECAP_PREVIEW ? 1 : 2;
export const YEAR_MIN_DAYS = RECAP_PREVIEW ? 1 : 60;
export const YEAR_MIN_MONTHS = RECAP_PREVIEW ? 1 : 3;
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

// ---------- даты без часовых поясов ----------
const pad = n => String(n).padStart(2, '0');
const toUTC = iso => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
export const isoOf = ms => { const d = new Date(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
export const addDays = (iso, n) => isoOf(toUTC(iso) + n * 86400000);
export const daysBetween = (a, b) => Math.round((toUTC(b) - toUTC(a)) / 86400000);
const inRange = (d, from, to) => d >= from && d <= to;
const plural = (n, a, b, c) => { const m = Math.abs(n) % 100, d = m % 10; return m > 10 && m < 20 ? c : d > 1 && d < 5 ? b : d === 1 ? a : c; };
export const shortDate = iso => `${Number(iso.slice(8, 10))} ${MONTHS_GEN[Number(iso.slice(5, 7)) - 1]}`;

// ---------- какие периоды предлагать сегодня ----------
/** Неделя: в воскресенье — текущая (пн–вс), в понедельник — только что закончившаяся. Иначе null. */
export function weekWindow(todayISO, force = false) {
    const wd = weekdayMon(todayISO);
    if (wd === 6) return { from: addDays(todayISO, -6), to: todayISO };
    if (wd === 0) return { from: addDays(todayISO, -7), to: addDays(todayISO, -1) };
    if (force) return { from: addDays(todayISO, -wd - 7), to: addDays(todayISO, -wd - 1) }; // последняя полная неделя
    if (RECAP_PREVIEW) return { from: addDays(todayISO, -6), to: todayISO };
    return null;
}
/** Год: в декабре — текущий, в январе — только что закончившийся. Иначе null. */
export function yearWindow(todayISO, force = false) {
    const m = keyMonth(keyOf(todayISO)), y = keyYear(keyOf(todayISO));
    if (m === 12) return { year: y };
    if (m === 1) return { year: y - 1 };
    if (RECAP_PREVIEW || force) return { year: y }; // force: год «на сегодня»
    return null;
}

const txIn = (all, from, to) => baseTx(all).filter(t => inRange(t.date, from, to));

export function rangeLabel(from, to) {
    return from.slice(5, 7) === to.slice(5, 7) ? `${Number(from.slice(8, 10))}–${shortDate(to)}` : `${shortDate(from)} — ${shortDate(to)}`;
}

function labelOf(kind, w) {
    if (kind === 'month') return { title: `Каким был твой ${w.name}`, short: `Твой ${w.name}`, sub: 'История за месяц · листай как сторис', icon: '🦈', chip: w.name.charAt(0).toUpperCase() + w.name.slice(1) };
    if (kind === 'week') return { title: 'Какой была твоя неделя', short: 'Твоя неделя', sub: `Итоги недели · ${rangeLabel(w.from, w.to)}`, icon: '📅', chip: 'Неделя' };
    return { title: `Твой ${w.year} год`, short: `Твой ${w.year} год`, sub: 'Итоги года · весь год в одной истории', icon: '🏆', chip: String(w.year) };
}

/**
 * Какие итоги можно показать сегодня.
 * entry — карточка в Аналитике, banner — баннер на главной (в своём окне дат).
 */
export function availableRecaps(all, todayISO) {
    const out = [];
    const day = Number(todayISO.slice(8, 10)), mon = keyMonth(keyOf(todayISO));

    const m = recapAvailability(all, todayISO);
    if (m.eligible) out.push({ kind: 'month', key: m.key, entry: true, banner: RECAP_PREVIEW || day <= 5, ...labelOf('month', m) });

    let w = weekWindow(todayISO);
    if (RECAP_PREVIEW && (!w || activeDaysOf(txIn(all, w.from, w.to)) < WEEK_MIN_DAYS)) {
        // предпросмотр: если на этой неделе записей нет — берём последнюю неделю, где они есть
        const last = baseTx(all).map(t => t.date).filter(Boolean).sort().pop();
        if (last) w = { from: addDays(last, -6), to: last };
    }
    if (w && activeDaysOf(txIn(all, w.from, w.to)) >= WEEK_MIN_DAYS) {
        out.push({ kind: 'week', key: `W${w.from}`, entry: true, banner: true, ...labelOf('week', w) });
    }

    const yw = yearWindow(todayISO);
    if (yw) {
        const ytx = txIn(all, `${yw.year}-01-01`, `${yw.year}-12-31`);
        const months = new Set(ytx.map(t => keyOf(t.date))).size;
        if (activeDaysOf(ytx) >= YEAR_MIN_DAYS && months >= YEAR_MIN_MONTHS) {
            const bannerOn = RECAP_PREVIEW || (mon === 12 && day >= 25) || (mon === 1 && day <= 7);
            out.push({ kind: 'year', key: `Y${yw.year}`, entry: true, banner: bannerOn, ...labelOf('year', yw) });
        }
    }
    return out;
}

// ---------- «просмотрено» (хранится только на устройстве) ----------
const SEEN_KEY = 'budgetit:recap:seen';
function seenSet() { try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch (e) { return new Set(); } }
export const recapId = r => `${r.kind}:${r.key}`;
const previewSeen = new Set(); // в режиме просмотра «просмотрено» живёт только до перезагрузки
export const isRecapSeen = r => (RECAP_PREVIEW ? previewSeen.has(recapId(r)) : seenSet().has(recapId(r)));
export function markRecapSeen(r) {
    if (RECAP_PREVIEW) { previewSeen.add(recapId(r)); return; }
    try { const s = seenSet(); s.add(recapId(r)); localStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-40))); } catch (e) { /* ignore */ }
}

// ---------- общие куски ----------
function topCatsOf(exp, expense, n) {
    return groupSum(exp, catName).slice(0, n).map(c => ({ ...splitCat(c.name), name: c.name, amount: c.amount, count: c.count, share: expense ? c.amount / expense : 0 }));
}
function bigOf(exp) {
    let b = null; for (const t of exp) if (!b || num(t.amount) > num(b.amount)) b = t;
    if (!b) return null;
    const title = String((b.products && b.products[0] && b.products[0].name) || b.name || '').trim();
    return { amount: num(b.amount), date: b.date, category: catName(b), ...splitCat(catName(b)), title };
}
const sum = (list) => list.reduce((s, t) => s + num(t.amount), 0);

// ---------- неделя ----------
function weekPersona(r) {
    if (r.spend === 0) return { emoji: '🧊', title: 'Режим сейфа', text: 'Ни одной траты за неделю. Кошелёк в целости.' };
    if (r.vsPrev && r.vsPrev.delta !== null) {
        if (r.vsPrev.delta <= -0.2) return { emoji: '✂️', title: 'Неделя экономии', text: `Трат меньше на ${Math.round(-r.vsPrev.delta * 100)}%, чем неделей раньше.` };
        if (r.vsPrev.delta >= 0.3) return { emoji: '🚀', title: 'Неделя на разгоне', text: `Трат больше на ${Math.round(r.vsPrev.delta * 100)}%, чем неделей раньше.` };
    }
    if (r.weekendShare >= 0.55) return { emoji: '🎉', title: 'Выходной загул', text: 'Больше половины недели ушло на субботу и воскресенье.' };
    if (r.noSpendDays >= 3) return { emoji: '🧘', title: 'Мастер пауз', text: `${r.noSpendDays} ${plural(r.noSpendDays, 'день', 'дня', 'дней')} без единой траты.` };
    return { emoji: '🦈', title: 'Ровная неделя', text: 'Без сюрпризов: траты шли спокойно и предсказуемо.' };
}
function weekMood(r) {
    if (r.spend === 0) return { emotion: 'calm', line: 'Ни одной траты, Акулка спокойна' };
    const d = r.vsPrev ? r.vsPrev.delta : null;
    if (d !== null) {
        if (d <= -0.2) return { emotion: 'proud', line: 'Неделя экономнее прошлой, Акулка гордится' };
        if (d <= 0.1) return { emotion: 'count-happy', line: 'Всё ровно, Акулка довольно считает' };
        if (d <= 0.4) return { emotion: 'count-cold', line: 'Потратил больше обычного, Акулка присматривается' };
        return { emotion: 'shock', line: 'Траты подскочили, Акулка в шоке' };
    }
    return { emotion: r.noSpendDays >= 2 ? 'calm' : 'count-happy', line: r.noSpendDays >= 2 ? 'Были и тихие дни, Акулка довольна' : 'Первая неделя в статистике, Акулка присматривается' };
}

export function buildWeekRecap(all, todayISO, force = false) {
    let w = weekWindow(todayISO, force);
    if (RECAP_PREVIEW && (!w || activeDaysOf(txIn(all, w.from, w.to)) < WEEK_MIN_DAYS)) {
        // предпросмотр: если на этой неделе записей нет — берём последнюю неделю, где они есть
        const last = baseTx(all).map(t => t.date).filter(Boolean).sort().pop();
        if (last) w = { from: addDays(last, -6), to: last };
    }
    if (!w) return { ok: false, kind: 'week', reason: 'window' };
    const tx = txIn(all, w.from, w.to);
    const active = activeDaysOf(tx);
    if (active < WEEK_MIN_DAYS) return { ok: false, kind: 'week', reason: 'data', activeDays: active, missingDays: WEEK_MIN_DAYS - active };
    const exp = spendOnly(tx), inc = incomeOnly(tx);
    const spend = sum(exp), realIncome = sum(inc);
    const { expense: totExpense, income: totIncome } = totalsOf(ioTx(all).filter(t => t.date >= w.from && t.date <= w.to));
    const expense = spend;
    const days = Array.from({ length: 7 }, (_, i) => { const date = addDays(w.from, i); return { date, wd: weekdayMon(date), expense: 0, count: 0, future: date > (RECAP_PREVIEW ? w.to : todayISO) }; });
    for (const t of exp) { const d = days[daysBetween(w.from, t.date)]; if (d) { d.expense += num(t.amount); d.count++; } }
    const counted = days.filter(d => !d.future);
    let priciest = null; for (const d of counted) if (d.expense > 0 && (!priciest || d.expense > priciest.expense)) priciest = d;
    const noSpendDays = counted.filter(d => d.expense === 0).length;
    const weekend = days.filter(d => d.wd >= 5).reduce((s, d) => s + d.expense, 0);

    const pFrom = addDays(w.from, -7), pTo = addDays(w.from, -1);
    const ptx = txIn(all, pFrom, pTo);
    let vsPrev = null;
    if (activeDaysOf(ptx) >= 3) {
        const pe = totalsOf(ioTx(all).filter(t => t.date >= pFrom && t.date <= pTo)).expense;
        vsPrev = { from: pFrom, to: pTo, expense: pe, delta: pe > 0 ? (totExpense - pe) / pe : null };
    }
    const r = {
        ok: true, kind: 'week', key: `W${w.from}`, from: w.from, to: w.to, activeDays: active, daysCounted: counted.length,
        income: totIncome, expense: totExpense, net: totIncome - totExpense, saveRate: totIncome > 0 ? (totIncome - totExpense) / totIncome : 0,
        spend, realIncome, fin: { expense: totExpense - spend, income: totIncome - realIncome },
        expenseCount: exp.length, incomeCount: inc.length, avgPerDay: counted.length ? spend / counted.length : 0,
        topCats: topCatsOf(exp, spend, 4), bigTx: bigOf(exp), days, priciest, noSpendDays,
        weekendShare: spend ? weekend / spend : 0, vsPrev
    };
    r.persona = weekPersona(r); r.mood = weekMood(r);
    r.goal = activeGoal(all, todayISO);
    return r;
}

// ---------- год ----------
function yearPersona(r) {
    if (r.income > 0 && r.saveRate >= 0.25) return { emoji: '🐷', title: 'Год накоплений', text: `За год отложено ${Math.round(r.saveRate * 100)}% от поступлений.` };
    if (r.vsPrev && r.vsPrev.delta !== null && r.vsPrev.delta <= -0.1) return { emoji: '✂️', title: 'Год экономии', text: `Трат стало меньше на ${Math.round(-r.vsPrev.delta * 100)}% к прошлому году.` };
    if (r.vsPrev && r.vsPrev.delta !== null && r.vsPrev.delta >= 0.2) return { emoji: '🚀', title: 'Год роста', text: `Траты выросли на ${Math.round(r.vsPrev.delta * 100)}% к прошлому году.` };
    if (r.steady) return { emoji: '🧭', title: 'Стабильный курс', text: 'Траты по месяцам почти не прыгали. Это редкое умение.' };
    if (r.topCats[0] && r.topCats[0].share >= 0.35) return { emoji: r.topCats[0].emoji, title: `Год «${r.topCats[0].text}»`, text: `${Math.round(r.topCats[0].share * 100)}% трат ушло на одну категорию.` };
    return { emoji: '🦈', title: 'Акулий год', text: 'Ты вёл бюджет весь год, и это уже достижение.' };
}

export function buildYearRecap(all, todayISO, force = false) {
    const yw = yearWindow(todayISO, force);
    if (!yw) return { ok: false, kind: 'year', reason: 'window' };
    const year = yw.year, from = `${year}-01-01`, to = `${year}-12-31`;
    const tx = txIn(all, from, to);
    const active = activeDaysOf(tx), monthsWith = new Set(tx.map(t => keyOf(t.date))).size;
    if (active < YEAR_MIN_DAYS || monthsWith < YEAR_MIN_MONTHS) return { ok: false, kind: 'year', reason: 'data', activeDays: active, missingDays: Math.max(0, YEAR_MIN_DAYS - active) };
    const exp = spendOnly(tx), inc = incomeOnly(tx);
    const spend = sum(exp), realIncome = sum(inc);
    const { expense: totExpense, income: totIncome } = totalsOf(ioTx(all).filter(t => t.date >= from && t.date <= to));
    const expense = spend, income = realIncome;
    const yio = ioTx(all).filter(t => t.date >= from && t.date <= to);

    const months = monthRange(`${year}-01`, `${year}-12`).map(k => {
        const mt = totalsOf(yio.filter(t => keyOf(t.date) === k)), e = mt.expense, i = mt.income;
        return { key: k, expense: e, income: i, has: tx.some(t => keyOf(t.date) === k) };
    });
    const withData = months.filter(m => m.has);
    let top = null, low = null;
    for (const m of withData) { if (!top || m.expense > top.expense) top = m; if (!low || m.expense < low.expense) low = m; }
    const avgM = withData.length ? totExpense / withData.length : 0;
    const steady = withData.length >= 6 && avgM > 0 && withData.every(m => Math.abs(m.expense - avgM) / avgM <= 0.25);

    // дни без трат за весь год (только дни, которые уже наступили)
    const last = to < todayISO ? to : todayISO;
    const spendDays = new Set(exp.map(t => t.date));
    let noSpend = 0, run = 0, best = 0, bestEnd = null;
    const total = daysBetween(from, last) + 1;
    for (let i = 0; i < total; i++) {
        const d = addDays(from, i);
        if (spendDays.has(d)) run = 0; else { noSpend++; run++; if (run > best) { best = run; bestEnd = d; } }
    }
    const wd = Array(7).fill(0); for (const t of exp) wd[weekdayMon(t.date)] += num(t.amount);
    let topWd = 0; wd.forEach((v, i) => { if (v > wd[topWd]) topWd = i; });

    const pTx = txIn(all, `${year - 1}-01-01`, `${year - 1}-12-31`);
    let vsPrev = null;
    if (activeDaysOf(pTx) >= YEAR_MIN_DAYS) {
        const { expense: pe, income: pi } = totalsOf(ioTx(all).filter(t => t.date >= `${year - 1}-01-01` && t.date <= `${year - 1}-12-31`));
        vsPrev = { year: year - 1, expense: pe, income: pi, delta: pe > 0 ? (totExpense - pe) / pe : null };
    }
    const incCats = groupSum(inc, catName).slice(0, 3).map(c => ({ ...splitCat(c.name), amount: c.amount, share: income ? c.amount / income : 0 }));
    const r = {
        ok: true, kind: 'year', key: `Y${year}`, year, activeDays: active, monthsWith,
        income: totIncome, expense: totExpense, net: totIncome - totExpense, saveRate: totIncome > 0 ? (totIncome - totExpense) / totIncome : 0,
        spend, realIncome, fin: { expense: totExpense - spend, income: totIncome - realIncome },
        expenseCount: exp.length, incomeCount: inc.length, avgMonth: avgM, months, topMonth: top, lowMonth: low, steady,
        topCats: topCatsOf(exp, spend, 5), bigTx: bigOf(exp), noSpendDays: noSpend, bestStreak: best, bestStreakEnd: bestEnd,
        weekdays: wd, topWeekday: topWd, incCats, vsPrev, daysCounted: total
    };
    r.records = yearRecords(all, year);
    r.vsYear = vsLastYearYear(all, year, r.expense, r.income, tx);
    r.goal = activeGoal(all, todayISO);
    r.persona = yearPersona(r);
    r.mood = recapMood(r, 'year');
    return r;
}

// ---------- месяц + единая точка ----------
export function buildMonthRecap(all, todayISO) {
    const r = buildRecap(all, todayISO);
    r.kind = 'month';
    if (r.ok) {
        r.records = monthRecords(all, r.key); r.mood = recapMood(r);
        r.vsYear = vsLastYearMonth(all, r.key, r.expense, r.income, monthTx(all, r.key));
        r.goal = activeGoal(all, todayISO);
    }
    return r;
}

/** force = true: для кнопок в чате Акулки — можно открыть в любой день (последняя полная неделя, год на сегодня) */
export function buildAnyRecap(kind, all, todayISO, force = false) {
    if (kind === 'week') return buildWeekRecap(all, todayISO, force);
    if (kind === 'year') return buildYearRecap(all, todayISO, force);
    return buildMonthRecap(all, todayISO);
}
