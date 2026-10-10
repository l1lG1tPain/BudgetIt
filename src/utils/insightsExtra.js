// ═══════════════════════════════════════════════════════════════
// insightsExtra.js — дополнительные инсайты для карусели «Тренды» (чистые функции, без DOM).
// realExp — бытовые расходы (без вкладов/переводов/долгов), incomeTx — доходы без финансовых категорий.
// Даты — строки 'YYYY-MM-DD'.
// ═══════════════════════════════════════════════════════════════
import { num, median, parseYmd, daysBetween, weekdayOf, daysInMonth, monthKey } from './insightsMath.js';

const ymd = s => String(s || '').slice(0, 10);
const addDays = (s, n) => {
    const p = parseYmd(s);
    return new Date(Date.UTC(p.y, p.m - 1, p.d + n)).toISOString().slice(0, 10);
};

/** 1. «Хватит на N дней»: остаток «Доступно» / средний дневной расход за последние 14 дней. */
export function calcRunway(available, realExp, today) {
    const from = addDays(today, -13);
    const sum = realExp.reduce((s, t) => { const d = ymd(t.date); return d >= from && d <= today ? s + num(t.amount) : s; }, 0);
    const perDay = sum / 14;
    if (!(perDay > 0)) return null;
    if (available <= 0) return { perDay, days: 0, until: today, empty: true };
    const days = Math.floor(available / perDay);
    return { perDay, days, until: addDays(today, days), empty: false };
}

/** 2. «Можно тратить в день»: «Доступно» / оставшиеся дни месяца (с сегодняшним), плюс сколько потрачено сегодня. */
export function calcSafePerDay(available, realExp, today) {
    const ym = today.slice(0, 7);
    const left = daysInMonth(ym) - parseYmd(today).d + 1;
    const todaySpent = realExp.reduce((s, t) => ymd(t.date) === today ? s + num(t.amount) : s, 0);
    // «Доступно» уже учитывает сегодняшние траты, поэтому лимит на сегодня = (доступно + потрачено сегодня) / оставшиеся дни
    const base = available + todaySpent;
    return { left, todaySpent, perDay: base > 0 ? base / left : 0, over: available <= 0 };
}

/** 3. «Неделя после поступления»: какая доля трат цикла (от зарплаты до следующей) приходится на первые 7 дней. */
export function calcPaydayWeek(incomeTx, realExp, today) {
    const best = new Map(); // месяц → самое крупное поступление
    for (const t of incomeTx) {
        const m = monthKey(t.date); if (!m) continue;
        if (!best.has(m) || num(t.amount) > num(best.get(m).amount)) best.set(m, t);
    }
    const arr = [...best.values()];
    if (arr.length < 3) return null;
    const med = median(arr.map(t => num(t.amount)));
    const paydays = arr.filter(t => num(t.amount) >= med * 0.5).map(t => ymd(t.date)).sort();
    const cycles = [];
    for (let i = 0; i + 1 < paydays.length; i++) {
        const a = paydays[i], b = paydays[i + 1], len = daysBetween(a, b);
        if (len < 20 || len > 45 || b > today) continue;
        const w = addDays(a, 6);
        let all = 0, first = 0;
        for (const t of realExp) { const d = ymd(t.date); if (d < a || d >= b) continue; all += num(t.amount); if (d <= w) first += num(t.amount); }
        if (all > 0) cycles.push({ share: first / all, len });
    }
    const use = cycles.slice(-6);
    if (use.length < 2) return null;
    const share = use.reduce((s, c) => s + c.share, 0) / use.length * 100;
    const even = use.reduce((s, c) => s + 7 / c.len, 0) / use.length * 100;
    return { share, even, cycles: use.length };
}

/** 4. «Будни и выходные»: средний расход за день по будням и по сб/вс. */
export function calcWeekdayWeekend(realExp, today) {
    const dates = realExp.map(t => ymd(t.date)).filter(d => parseYmd(d)).sort();
    if (dates.length < 14) return null;
    const first = dates[0], last = dates.at(-1) > today ? today : dates.at(-1);
    let wdN = 0, weN = 0;
    for (let d = first; d <= last; d = addDays(d, 1)) { const w = weekdayOf(d); if (w === 0 || w === 6) weN++; else wdN++; }
    let wd = 0, we = 0;
    for (const t of realExp) { const d = ymd(t.date); if (d < first || d > last) continue; const w = weekdayOf(d); if (w === 0 || w === 6) we += num(t.amount); else wd += num(t.amount); }
    if (wdN < 5 || weN < 2 || wd + we <= 0) return null;
    const wdPer = wd / wdN, wePer = we / weN;
    return { wdPer, wePer, ratio: wdPer > 0 ? wePer / wdPer : null };
}

// не «привычки»: обязательные платежи, продукты/магазины у дома и обобщённые категории (способ оплаты, «Прочее»)
const NOT_HABIT = /жиль|аренд|коммун|электр|интернет|связь|вода|газ|отоплен|налог|кредит|ипотек|подписк|терминал|qr|прочее|без учёта|оплата|продукт|korzinka|магазин|магнит|fix ?price|olma|аптек|здоровь/i;

/** 5. «Цена привычек за год»: частые категории за последние 90 дней, помноженные на год. */
export function calcHabits(realExp, today, limit = 3) {
    const from = addDays(today, -89);
    const by = new Map();
    for (const t of realExp) {
        const d = ymd(t.date); if (d < from || d > today) continue;
        const c = (t.category || '').trim(); if (!c || NOT_HABIT.test(c)) continue;
        const e = by.get(c) || { n: 0, sum: 0 }; e.n += 1; e.sum += num(t.amount); by.set(c, e);
    }
    return [...by.entries()].filter(([, e]) => e.n >= 8)
        .map(([cat, e]) => ({ cat, n: e.n, perMonth: e.sum / 3, yearly: e.sum / 90 * 365 }))
        .sort((a, b) => b.yearly - a.yearly).slice(0, limit);
}

const merchantOf = t => String(t.products?.[0]?.name || t.description || t.name || '').toLowerCase().replace(/[\d№#*_.,-]+/g, ' ').replace(/\s+/g, ' ').trim();

/** 6. «Подписки»: один получатель, ~одна сумма, раз в месяц, минимум 3 месяца подряд-ish. */
export function findSubscriptions(realExp, today) {
    const g = new Map();
    for (const t of realExp) {
        const m = merchantOf(t); if (m.length < 3) continue;
        const a = num(t.amount); if (a <= 0) continue;
        (g.get(m) || g.set(m, []).get(m)).push({ d: ymd(t.date), a });
    }
    const out = [];
    for (const [name, list] of g) {
        if (list.length < 3) continue;
        list.sort((x, y) => x.d < y.d ? -1 : 1);
        const amt = median(list.map(x => x.a));
        const same = list.filter(x => Math.abs(x.a - amt) <= amt * 0.08);
        if (same.length < 3 || same.length < list.length * 0.7) continue; // большинство платежей — на одну и ту же сумму
        const months = new Set(same.map(x => x.d.slice(0, 7)));
        if (months.size < 3 || months.size < same.length * 0.8) continue; // не чаще раза в месяц
        const gaps = []; for (let i = 1; i < same.length; i++) gaps.push(daysBetween(same[i - 1].d, same[i].d));
        const gap = median(gaps);
        if (gap < 25 || gap > 36) continue;
        const last = same.at(-1).d;
        if (daysBetween(last, today) > 50) continue; // уже не платится
        out.push({ name, amount: amt, months: months.size, last });
    }
    return out.sort((a, b) => b.amount - a.amount);
}
