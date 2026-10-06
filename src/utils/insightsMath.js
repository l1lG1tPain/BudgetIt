// ═══════════════════════════════════════════════════════════════
// insightsMath.js — чистые (без DOM) расчёты для Analyticsinsights.js
// Даты — строки 'YYYY-MM-DD'; никогда не парсим через new Date(str).
// ═══════════════════════════════════════════════════════════════

export const SYSTEM_EXCLUDED_CATEGORIES = [
    'Не знаю на что потратил (без учёта)',
    'Другая категория (без учёта)',
];

// Единый список «финансовых» (не бытовых) категорий.
// Ядро — переводы / вклады / долги: исключается и из расходов, и из поступлений
// (иначе «Перевод с вклада» раздувает доход, а «Перевод на вклад» не попадает в расход).
const CORE_FIN = 'вклад|депозит|перевод|p2p|transfer|долг|кредит|ипотек|займ|заём|погашен|рефинанс|накопл';
// Только для расходов: у поступлений такие слова — обычный доход
// («Комиссионные», «Налоговый вычет», «Доход от инвестиций», «Проценты на остаток»).
const EXPENSE_FIN = 'налог|комисс|инвести|брокер|облигац|пенсион|(?<![а-яё])акци(?:и|й|я|ях)(?![а-яё])';

export const FINANCIAL_RE = new RegExp(`${CORE_FIN}|${EXPENSE_FIN}`, 'i');
export const FINANCIAL_INCOME_RE = new RegExp(CORE_FIN, 'i');

export const isFinancialCategory = cat => !!cat && FINANCIAL_RE.test(String(cat));
export const isFinancialIncomeCategory = cat => !!cat && FINANCIAL_INCOME_RE.test(String(cat));
export const isSystemExcludedCategory = cat => !!cat && SYSTEM_EXCLUDED_CATEGORIES.includes(String(cat).trim());

// ── числа ────────────────────────────────────────────────────
export const num = v => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};
export const sumAmount = arr => arr.reduce((s, t) => s + num(t.amount), 0);

export function median(arr) {
    if (!arr.length) return 0;
    const a = [...arr].sort((x, y) => x - y);
    const mid = Math.floor(a.length / 2);
    return a.length % 2 === 0 ? (a[mid - 1] + a[mid]) / 2 : a[mid];
}

export function percentile(arr, p = 0.9) {
    if (!arr.length) return 0;
    const a = [...arr].sort((x, y) => x - y);
    const idx = Math.min(a.length - 1, Math.max(0, Math.floor((a.length - 1) * p)));
    return a[idx];
}

// ── даты ─────────────────────────────────────────────────────
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;
export function parseYmd(s) {
    const m = DATE_RE.exec(String(s || ''));
    return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
}
export const monthKey = s => (DATE_RE.test(String(s || '')) ? String(s).slice(0, 7) : null);
export const dayOfMonth = s => parseYmd(s)?.d ?? 0;
export const daysInMonth = ym => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
export function prevMonthKey(ym) {
    const [y, m] = ym.split('-').map(Number);
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}
// день недели (0=Вс) без зависимости от часового пояса
export function weekdayOf(s) {
    const p = parseYmd(s);
    return p ? new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay() : null;
}
export function daysBetween(a, b) {
    const pa = parseYmd(a), pb = parseYmd(b);
    if (!pa || !pb) return 0;
    return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000);
}
export const localToday = () => new Date().toLocaleDateString('en-CA');

// ── регулярные расходы ───────────────────────────────────────
// Категория регулярна, если есть минимум в 75% месяцев (и не меньше 2).
export function findRegularExpenses(exp, months) {
    if (months.length < 2 || !exp.length) return [];
    const allowed = new Set(months);
    const catMonths = {};
    exp.forEach(t => {
        const m = monthKey(t.date);
        if (!m || !allowed.has(m)) return;
        const c = t.category || '🗿 Прочее';
        (catMonths[c] ||= {})[m] = (catMonths[c][m] || 0) + num(t.amount);
    });
    const threshold = Math.max(2, Math.ceil(months.length * 0.75));
    const result = [];
    Object.entries(catMonths).forEach(([cat, mths]) => {
        const values = Object.values(mths);
        if (values.length < threshold) return;
        const avg = values.reduce((s, v) => s + v, 0) / values.length;
        const stability = avg > 0 ? 1 - ((Math.max(...values) - Math.min(...values)) / avg) * 0.35 : 0;
        result.push({ cat, avg, months: values.length, stability: Math.max(0, Math.min(1, stability)) });
    });
    return result
        .filter(r => r.avg > 0)
        .sort((a, b) => b.months - a.months || b.stability - a.stability || b.avg - a.avg);
}

// ── нетипичная трата ─────────────────────────────────────────
export function findAnomaly(realExp, stats, confirmed = []) {
    if (!realExp || realExp.length < 6) return null;
    const byCatMonths = {};
    realExp.forEach(t => {
        const m = monthKey(t.date);
        if (!m) return;
        (byCatMonths[t.category || '🗿 Прочее'] ||= new Set()).add(m);
    });
    const cand = realExp
        .filter(t => !confirmed.includes(String(t.id)) && num(t.amount) > 0)
        .map(t => {
            const cat = t.category || '🗿 Прочее';
            const amount = num(t.amount);
            const overMedian = stats.med > 0 ? amount / stats.med : 0;
            const overAvg = stats.avg > 0 ? amount / stats.avg : 0;
            const overP90 = stats.p90 > 0 ? amount / stats.p90 : 0;
            const repeated = (byCatMonths[cat]?.size || 0) >= 2;
            return { ...t, amount, overMedian, overAvg, repeated,
                score: overMedian * 1.5 + overAvg * 1.2 + overP90 * 1.1 - (repeated ? 3 : 0) };
        })
        .filter(t => t.overMedian >= 2.8 && t.overAvg >= 2.2 && !t.repeated)
        .sort((a, b) => b.score - a.score);
    const top = cand[0];
    if (!top) return null;
    return {
        id: String(top.id), category: top.category || '—', amount: top.amount, date: top.date || '',
        timesAvg: Math.round(top.overAvg * 10) / 10, timesMedian: Math.round(top.overMedian * 10) / 10,
    };
}

// ── категория-утечка ─────────────────────────────────────────
export function findLeakingCategory(realExp) {
    if (!realExp.length) return null;
    const map = {};
    realExp.forEach(t => {
        const c = t.category || '🗿 Прочее';
        const e = (map[c] ||= { total: 0, count: 0 });
        e.total += num(t.amount); e.count += 1;
    });
    const overallAvg = sumAmount(realExp) / realExp.length;
    return Object.entries(map)
        .map(([cat, v]) => ({ cat, total: v.total, count: v.count, avg: v.total / v.count }))
        .filter(v => v.count >= 4 && v.avg <= overallAvg * 1.15)
        .sort((a, b) => b.count - a.count || b.total - a.total)[0] || null;
}

// ── самая изменившаяся категория ─────────────────────────────
// prevMonth — календарный предыдущий месяц; если lastMonth ещё идёт,
// prevCutoffDay ограничивает прошлый месяц тем же числом (честное сравнение).
export function findGrowthCategory(realExp, lastMonth, prevCutoffDay = null) {
    if (!lastMonth) return null;
    const prevMonth = prevMonthKey(lastMonth);
    const map = {};
    let prevTotal = 0;
    realExp.forEach(t => {
        const m = monthKey(t.date);
        if (m !== lastMonth && m !== prevMonth) return;
        if (m === prevMonth && prevCutoffDay && dayOfMonth(t.date) > prevCutoffDay) return;
        const e = (map[t.category || '🗿 Прочее'] ||= { prev: 0, last: 0 });
        if (m === prevMonth) { e.prev += num(t.amount); prevTotal += num(t.amount); } else e.last += num(t.amount);
    });
    return Object.entries(map)
        .map(([cat, v]) => (v.prev > 0 && v.last > 0)
            ? { cat, prevMonth, lastMonth, prev: v.prev, last: v.last, delta: (v.last - v.prev) / v.prev * 100 } : null)
        .filter(Boolean)
        // шум: отсекаем мелочь (разница меньше 3% расходов прошлого периода)
        .filter(v => Math.abs(v.delta) >= 15 && Math.abs(v.last - v.prev) >= prevTotal * 0.03)
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0] || null;
}

// ── прогноз: по трём последним ЗАВЕРШЁННЫМ календарным месяцам ─
export function calcForecast(mMap, closedMonths) {
    if (closedMonths.length < 3) return null;
    const k2 = closedMonths.at(-1), k1 = prevMonthKey(k2), k0 = prevMonthKey(k1);
    const last3 = [k0, k1, k2].map(m => mMap[m]?.e || 0);
    const avg3 = last3.reduce((s, v) => s + v, 0) / 3;
    const t1 = last3[1] > 0 ? (last3[2] - last3[1]) / last3[1] : 0;
    const t2 = last3[0] > 0 ? (last3[1] - last3[0]) / last3[0] : 0;
    const blended = Math.max(-0.3, Math.min(0.3, (t1 * 0.65 + t2 * 0.35) * 0.45));
    const predicted = Math.max(0, avg3 * (1 + blended));
    return { predicted, delta: avg3 > 0 ? (predicted - avg3) / avg3 * 100 : 0 };
}

// ── финансовое здоровье 0..100 ───────────────────────────────
// Непрерывная функция нормы сбережений: 0% → 45, 10% → 60, 20% → 75, 30% → 90, 36.7%+ → 100, -30% → 0.
// Нет поступлений при наличии расходов → 30 (данных для оценки мало).
export function scoreHealth(sav, totI, totE) {
    if (!(totI > 0)) return totE > 0 ? 30 : 45;
    const s = 45 + Math.max(-30, Math.min(40, sav)) * 1.5;
    return Math.max(0, Math.min(100, s));
}

// ═══════════════════════════════════════════════════════════════
// Главный расчёт
// ═══════════════════════════════════════════════════════════════
export function computeMetrics(allTx, opts = {}) {
    const today = opts.today || localToday();
    const userExcluded = opts.userExcluded || [];
    const confirmed = opts.confirmed || [];
    const isExcludedExp = c => isFinancialCategory(c) || isSystemExcludedCategory(c) || userExcluded.includes(c);

    const expenseTx = allTx.filter(t => t.type === 'expense');
    const incomeTx = allTx.filter(t => t.type === 'income'
        && !isFinancialIncomeCategory(t.category) && !isSystemExcludedCategory(t.category));
    const realExp = expenseTx.filter(t => !isExcludedExp(t.category));
    const excludedExp = expenseTx.filter(t => isExcludedExp(t.category));

    const totI = sumAmount(incomeTx);
    const totE = sumAmount(realExp);
    const totExcluded = sumAmount(excludedExp);
    const bal = totI - totE;
    const sav = totI > 0 ? bal / totI * 100 : 0;

    const months = [...new Set(allTx.map(t => monthKey(t.date)).filter(Boolean))].sort();
    const lastMonth = months.at(-1) || null;

    // текущий месяц ещё идёт?
    const todayMonth = today.slice(0, 7);
    const todayDay = dayOfMonth(today);
    const partialMonth = lastMonth && lastMonth === todayMonth && todayDay < daysInMonth(todayMonth) ? lastMonth : null;
    const closedMonths = months.filter(m => m !== partialMonth);

    const mMap = {};
    months.forEach(m => { mMap[m] = { i: 0, e: 0, txCount: 0 }; });
    incomeTx.forEach(t => { const m = monthKey(t.date); if (m) mMap[m].i += num(t.amount); });
    realExp.forEach(t => { const m = monthKey(t.date); if (m) { mMap[m].e += num(t.amount); mMap[m].txCount += 1; } });

    const cutoff = partialMonth ? todayDay : null; // для честного сравнения с прошлым месяцем
    const prevKey = lastMonth ? prevMonthKey(lastMonth) : null;
    const lastE = lastMonth ? mMap[lastMonth].e : 0;
    let prevE = 0, prevCount = 0, lastCount = 0;
    realExp.forEach(t => {
        const m = monthKey(t.date);
        if (m === lastMonth) lastCount += 1;
        else if (m === prevKey && (!cutoff || dayOfMonth(t.date) <= cutoff)) { prevE += num(t.amount); prevCount += 1; }
    });
    const trend = prevE > 0 ? (lastE - prevE) / prevE * 100 : null;
    const freqTrend = prevCount > 0 ? Math.round((lastCount - prevCount) / prevCount * 100) : null;
    const growth = findGrowthCategory(realExp, lastMonth, cutoff);

    // день недели
    const dW = Array(7).fill(0), dWCount = Array(7).fill(0);
    realExp.forEach(t => {
        const idx = weekdayOf(t.date);
        if (idx === null) return;
        dW[idx] += num(t.amount); dWCount[idx] += 1;
    });
    const hotD = dW.indexOf(Math.max(...dW));
    const busyD = dWCount.indexOf(Math.max(...dWCount));

    const dMap = {};
    realExp.forEach(t => { const d = parseYmd(t.date) && String(t.date).slice(0, 10); if (d) dMap[d] = (dMap[d] || 0) + num(t.amount); });
    const pricey = Object.entries(dMap).sort((a, b) => b[1] - a[1])[0];

    const amounts = realExp.map(t => num(t.amount)).filter(v => v > 0).sort((a, b) => a - b);
    const avg = amounts.length ? amounts.reduce((s, v) => s + v, 0) / amounts.length : 0;
    const med = median(amounts);
    const p90 = percentile(amounts, 0.9);

    // покупок в день: по реальному числу календарных дней (от первой траты до последней / до сегодня)
    const dates = realExp.map(t => String(t.date || '').slice(0, 10)).filter(d => parseYmd(d)).sort();
    let tpd = '0.0';
    if (dates.length) {
        const end = partialMonth && today > dates.at(-1) ? today : dates.at(-1);
        tpd = (realExp.length / Math.max(1, daysBetween(dates[0], end) + 1)).toFixed(1);
    }

    // стоимость жизни: среднее по ЗАВЕРШЁННЫМ месяцам с расходами (иначе — по всем)
    const withExp = ms => ms.filter(m => mMap[m].e > 0);
    const lifeMonths = withExp(closedMonths).length ? withExp(closedMonths) : withExp(months);
    const lifeCostAvg = lifeMonths.length ? lifeMonths.reduce((s, m) => s + mMap[m].e, 0) / lifeMonths.length : 0;

    const regularCats = findRegularExpenses(realExp, closedMonths.length >= 2 ? closedMonths : months);
    const regularSum = regularCats.reduce((s, r) => s + r.avg, 0);
    const mandatoryShare = lifeCostAvg > 0 ? Math.min(100, regularSum / lifeCostAvg * 100) : 0;

    // лучший/худший месяц — только завершённые (иначе недожитый месяц всегда «лучший»)
    const cmp = closedMonths.length ? closedMonths : months;
    const worst = cmp.map(m => [m, mMap[m]]).sort((a, b) => b[1].e - a[1].e)[0];
    const best = cmp.map(m => [m, mMap[m]]).filter(([, v]) => v.e > 0).sort((a, b) => a[1].e - b[1].e)[0];

    const expenseCatMap = {};
    realExp.forEach(t => { const c = t.category || '🗿 Прочее'; expenseCatMap[c] = (expenseCatMap[c] || 0) + num(t.amount); });
    const cats = Object.entries(expenseCatMap).sort((a, b) => b[1] - a[1]);
    const incomeCatMap = {};
    incomeTx.forEach(t => { const c = t.category || '💰 Прочие доходы'; incomeCatMap[c] = (incomeCatMap[c] || 0) + num(t.amount); });
    const incCats = Object.entries(incomeCatMap).sort((a, b) => b[1] - a[1]);

    return {
        incomeTx, expenseTx, realExp, excludedExp, totI, totE, totExcluded, bal, sav,
        months, closedMonths, partialMonth, lastMonth, prevKey, mMap, lastM: mMap[lastMonth] || { i: 0, e: 0, txCount: 0 },
        trend, freqTrend, lastCount, prevCount, growth,
        dW, dWCount, hotD, busyD, pricey, avg, med, p90, tpd,
        lifeCostAvg, regularCats, regularSum, mandatoryShare, worst, best,
        cats, incCats,
        anomaly: findAnomaly(realExp, { avg, med, p90 }, confirmed),
        leaking: findLeakingCategory(realExp),
        forecast: calcForecast(mMap, closedMonths),
        health: scoreHealth(sav, totI, totE),
    };
}
