// ═══════════════════════════════════════════════════════════════
// insightsNew.js — новые тренды (чистые функции, без DOM).
// exp / inc — траты и поступления в той же базе, что тренды (все деньги, как на главной).
// Даты — строки 'YYYY-MM-DD'.
// ═══════════════════════════════════════════════════════════════
import { num, median, parseYmd, daysInMonth, prevMonthKey } from './insightsMath.js';
import { netSavings } from './savingsFlow.js';

const ymd = s => String(s || '').slice(0, 10);
const addDays = (s, n) => {
    const p = parseYmd(s);
    return new Date(Date.UTC(p.y, p.m - 1, p.d + n)).toISOString().slice(0, 10);
};
const inRange = (d, a, b) => d >= a && d <= b;
const lastDayOf = ym => `${ym}-${String(daysInMonth(ym)).padStart(2, '0')}`;

/** Крупные траты за `days` дней: операции дороже 10 медиан; сколько их и какую долю трат они забрали. */
export function calcBigPurchases(exp, today, days = 90) {
    const from = addDays(today, -(days - 1));
    const list = exp.filter(t => inRange(ymd(t.date), from, today) && num(t.amount) > 0);
    if (list.length < 10) return null;
    const total = list.reduce((s, t) => s + num(t.amount), 0);
    const med = median(list.map(t => num(t.amount)));
    const threshold = med * 10;
    const big = list.filter(t => num(t.amount) >= threshold).sort((a, b) => num(b.amount) - num(a.amount));
    if (!big.length || !(total > 0)) return null;
    const sum = big.reduce((s, t) => s + num(t.amount), 0);
    const share = sum / total;
    if (share < 0.15) return null;
    const restPerMonth = (total - sum) / (days / 30);
    return { count: big.length, sum, share, total, threshold, restPerMonth, top: big.slice(0, 3) };
}

/** Год к году: прошлый полный месяц против того же месяца год назад. */
export function calcYearOverYear(exp, inc, today) {
    const month = prevMonthKey(today.slice(0, 7));
    const [y, m] = month.split('-');
    const lastYear = `${+y - 1}-${m}`;
    const sum = (list, ym) => list.reduce((s, t) => (ymd(t.date).startsWith(ym) ? s + num(t.amount) : s), 0);
    const e = sum(exp, month), e0 = sum(exp, lastYear);
    const i = sum(inc, month), i0 = sum(inc, lastYear);
    if (!(e > 0) || !(e0 > 0)) return null;
    return { month, lastYear, exp: e, expPrev: e0, expGrowth: (e - e0) / e0, inc: i, incPrev: i0, incGrowth: i0 > 0 ? (i - i0) / i0 : null };
}

/** Сколько откладывается: пополнения вкладов минус снятия за последние `months` полных месяцев. */
export function calcSavingsPace(rawTx, today, months = 3) {
    const end = prevMonthKey(today.slice(0, 7));
    let start = end;
    for (let k = 1; k < months; k++) start = prevMonthKey(start);
    const { net, topups } = netSavings(rawTx, `${start}-01`, lastDayOf(end));
    if (!topups && net === 0) return null;
    const avg = net / months;
    return { net, avg, yearly: avg * 12, months, from: start, to: end };
}

/** Дни без трат: прошлый полный месяц (число дней и самая длинная пауза) и текущий месяц до сегодня. */
export function calcNoSpendDays(exp, today) {
    const spentDays = new Set(exp.filter(t => num(t.amount) > 0).map(t => ymd(t.date)));
    const count = (ym, lastDay) => {
        let days = 0, run = 0, best = 0;
        for (let d = 1; d <= lastDay; d++) {
            const key = `${ym}-${String(d).padStart(2, '0')}`;
            if (spentDays.has(key)) { run = 0; continue; }
            days++; run++; best = Math.max(best, run);
        }
        return { days, best };
    };
    const prev = prevMonthKey(today.slice(0, 7));
    const hasPrev = [...spentDays].some(d => d.startsWith(prev));
    if (!hasPrev) return null;
    const p = count(prev, daysInMonth(prev));
    const cur = count(today.slice(0, 7), parseYmd(today).d - 1); // сегодняшний день ещё идёт
    return { month: prev, days: p.days, best: p.best, curDays: cur.days, curPassed: parseYmd(today).d - 1 };
}

/** Обычный день: медиана трат за дни с тратами (30 дней) и «дорогие» дни дороже 3 медиан. */
export function calcTypicalDay(exp, today, days = 30) {
    const from = addDays(today, -(days - 1));
    const byDay = new Map();
    for (const t of exp) {
        const d = ymd(t.date);
        if (!inRange(d, from, today) || !(num(t.amount) > 0)) continue;
        byDay.set(d, (byDay.get(d) || 0) + num(t.amount));
    }
    const vals = [...byDay.values()];
    if (vals.length < 10) return null;
    const med = median(vals);
    const total = vals.reduce((s, v) => s + v, 0);
    const heavy = vals.filter(v => v > med * 3);
    const heavySum = heavy.reduce((s, v) => s + v, 0);
    return { median: med, avg: total / vals.length, daysWithSpend: vals.length, heavyDays: heavy.length, heavyShare: total > 0 ? heavySum / total : 0 };
}

/**
 * Первые дни после поступления: какая доля трат цикла (от поступления до следующего) уходит за `days` дня.
 * Поступления — крупные (≥ 30% медианного месячного дохода), без процентов и возвратов со вклада.
 */
export function calcAfterPayday(inc, exp, today, days = 3) {
    const NOT_PAY = /процент|вклад|депозит|interest/i;
    const byMonth = new Map();
    for (const t of inc) { const m = ymd(t.date).slice(0, 7); byMonth.set(m, (byMonth.get(m) || 0) + num(t.amount)); }
    const monthly = median([...byMonth.values()]);
    if (!(monthly > 0)) return null;
    const pays = [...new Set(inc.filter(t => !NOT_PAY.test(String(t.category || '')) && num(t.amount) >= monthly * 0.3).map(t => ymd(t.date)))]
        .filter(d => d <= today).sort();
    if (pays.length < 3) return null;
    const cycles = [];
    for (let i = 0; i < pays.length - 1; i++) {
        const a = pays[i], b = pays[i + 1];
        const firstEnd = addDays(a, days - 1);
        if (b <= firstEnd) continue;                       // поступления подряд — один цикл
        let total = 0, first = 0; const cats = new Map();
        for (const t of exp) {
            const d = ymd(t.date); if (d < a || d >= b) continue;
            const v = num(t.amount); total += v;
            if (d <= firstEnd) { first += v; const c = t.category || 'Без категории'; cats.set(c, (cats.get(c) || 0) + v); }
        }
        if (total > 0) cycles.push({ from: a, to: b, total, first, cats, len: daysBetweenStr(a, b) });
    }
    const recent = cycles.slice(-6);
    if (recent.length < 2) return null;
    const share = recent.reduce((s, c) => s + c.first / c.total, 0) / recent.length;
    const avgLen = recent.reduce((s, c) => s + c.len, 0) / recent.length;
    const catSum = new Map();
    recent.forEach(c => c.cats.forEach((v, k) => catSum.set(k, (catSum.get(k) || 0) + v)));
    const top = [...catSum.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k]) => k);
    const avgFirst = recent.reduce((s, c) => s + c.first, 0) / recent.length;
    return { share, uniform: Math.min(1, days / avgLen), avgLen, cycles: recent.length, top, avgFirst, days };
}

function daysBetweenStr(a, b) {
    const pa = parseYmd(a), pb = parseYmd(b);
    return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000);
}
