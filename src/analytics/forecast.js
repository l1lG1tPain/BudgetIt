// ===============================
//   forecast.js — прогноз остатка до конца месяца (чистые функции, без DOM)
//   Регулярные поступления и платежи (зарплата, аванс, жильё) ищутся по последним 3 полным месяцам:
//   категория была в каждом из них 1–2 раза и на заметную сумму. Остальное — обычный темп трат.
// ===============================
import { moneyTx } from './stats.js';

const num = v => Number(v) || 0;
const ymd = s => String(s || '').slice(0, 10);
const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const prevMonth = ym => { const [y, m] = ym.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };
const daysIn = ym => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

/** Регулярные операции: [{ type, category, amount, day }] — по последним 3 полным месяцам до месяца today. */
export function findRecurring(raw, today) {
    const tx = moneyTx(raw);
    const months = []; let m = prevMonth(today.slice(0, 7));
    for (let i = 0; i < 3; i++) { months.push(m); m = prevMonth(m); }
    const allAmounts = tx.filter(t => t.type === 'expense').map(t => num(t.amount));
    const big = Math.max(median(allAmounts) * 10, 1);
    const groups = new Map();
    for (const t of tx) {
        const k = ymd(t.date).slice(0, 7);
        if (!months.includes(k)) continue;
        const key = `${t.type}|${t.category}`;
        const g = groups.get(key) || { type: t.type, category: t.category, byMonth: new Map() };
        const r = g.byMonth.get(k) || { sum: 0, count: 0, days: [] };
        r.sum += num(t.amount); r.count++; r.days.push(Number(ymd(t.date).slice(8, 10)));
        g.byMonth.set(k, r); groups.set(key, g);
    }
    const out = [];
    for (const g of groups.values()) {
        if (g.byMonth.size < 3) continue;
        const rows = [...g.byMonth.values()];
        if (rows.some(r => r.count > 2)) continue;          // много мелких операций — это не регулярный платёж
        const amount = median(rows.map(r => r.sum));
        if (amount < big) continue;                          // мелочь в темпе трат, а не отдельным событием
        const day = Math.round(median(rows.flatMap(r => r.days)));
        out.push({ type: g.type, category: g.category, amount, day });
    }
    return out.sort((a, b) => a.day - b.day);
}

/**
 * Прогноз от today (не включая) до end: старт = остаток на конец today.
 * pace — средний расход в день за 60 дней без регулярных категорий.
 */
export function forecastBalance(raw, today, end, startBalance) {
    if (!today || !end || end <= today) return null;
    const rec = findRecurring(raw, today);
    const recKeys = new Set(rec.map(r => `${r.type}|${r.category}`));
    const tx = moneyTx(raw);
    const from = addDays(today, -59);
    // обычный темп: без регулярных платежей и без разовых крупных операций (вклад, техника) — их не ждём каждый день
    const big = Math.max(median(tx.filter(t => t.type === 'expense').map(t => num(t.amount))) * 10, 1);
    const outflow = tx.filter(t => t.type === 'expense' && ymd(t.date) >= from && ymd(t.date) <= today
        && !recKeys.has(`expense|${t.category}`) && num(t.amount) < big)
        .reduce((s, t) => s + num(t.amount), 0);
    const pace = outflow / 60;
    const ym = today.slice(0, 7);
    const happened = new Set(tx.filter(t => ymd(t.date).slice(0, 7) === ym).map(t => `${t.type}|${t.category}`));
    const events = [];
    // ожидаемые регулярные операции текущего и (если прогноз уходит дальше) следующих месяцев
    let mk = ym;
    while (`${mk}-01` <= end) {
        for (const r of rec) {
            const key = `${r.type}|${r.category}`;
            if (mk === ym && happened.has(key)) continue;   // в этом месяце уже было
            const date = `${mk}-${String(Math.min(r.day, daysIn(mk))).padStart(2, '0')}`;
            if (date > today && date <= end) events.push({ ...r, date });
        }
        const [y, m] = mk.split('-').map(Number);
        mk = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    }
    // уже записанные операции на будущие даты — как есть
    for (const t of tx) {
        const d = ymd(t.date);
        if (d > today && d <= end) events.push({ type: t.type, category: t.category, amount: num(t.amount), date: d, recorded: true });
    }
    const points = [];
    let bal = startBalance, min = null;
    for (let d = addDays(today, 1); d <= end; d = addDays(d, 1)) {
        bal -= pace;
        for (const e of events) if (e.date === d) bal += e.type === 'income' ? e.amount : -e.amount;
        const p = { date: d, balance: bal };
        points.push(p);
        if (!min || bal < min.balance) min = p;
    }
    return { points, pace, events: events.sort((a, b) => (a.date < b.date ? -1 : 1)), end: bal, min };
}
