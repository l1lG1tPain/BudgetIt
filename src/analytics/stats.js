// ===============================
//   stats.js — чистые расчёты аналитики (без DOM, без Chart.js)
//   Все суммы — только операции типа income/expense (вклады и долги считаются отдельно в приложении).
//   Даты — строки 'YYYY-MM-DD' (никогда не парсим через new Date(str)).
// ===============================
import { num, median, isSystemExcludedCategory, isFinancialCategory } from '../utils/insightsMath.js';
import { inPeriod, keyOf, monthRange, addMonths, previousPeriod, periodSpan, keyYear, keyMonth, ymKey, makePeriod } from './period.js';

export const WEEKDAYS_SHORT = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const dayOf = d => Number(String(d).slice(8, 10)) || 0;
const dimOf = key => new Date(Date.UTC(keyYear(key), keyMonth(key), 0)).getUTCDate();
/** день недели, понедельник = 0 (без часовых поясов) */
export function weekdayMon(dateStr) {
    const y = Number(dateStr.slice(0, 4)), m = Number(dateStr.slice(5, 7)), d = Number(dateStr.slice(8, 10));
    const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = вс
    return (js + 6) % 7;
}

export const catName = t => String(t.category || '').trim() || 'Без категории';
/** Только доходы/расходы с датой; системные «без учёта» категории отброшены */
export const baseTx = all => (all || []).filter(t =>
    (t.type === 'income' || t.type === 'expense') && t.date && !isSystemExcludedCategory(t.category));

export function dataRange(tx) {
    let a = null, b = null;
    for (const t of tx) { const k = keyOf(t.date); if (!a || k < a) a = k; if (!b || k > b) b = k; }
    return { first: a, last: b };
}
export function availableYears(tx, thisYear) {
    const s = new Set(tx.map(t => keyYear(keyOf(t.date))));
    if (thisYear) s.add(thisYear);
    return [...s].filter(Number.isFinite).sort((a, b) => a - b);
}

/** cut = {key, day}: в месяце key берём только дни ≤ day (честное сравнение неполного месяца) */
export function sumTx(tx, p, type, cut = null) {
    let s = 0;
    for (const t of tx) {
        if (type && t.type !== type) continue;
        if (!inPeriod(p, t.date)) continue;
        if (cut && keyOf(t.date) === cut.key && dayOf(t.date) > cut.day) continue;
        s += num(t.amount);
    }
    return s;
}

/** Помесячные суммы для набора ключей */
export function monthlyTotals(tx, keys) {
    const map = new Map(keys.map(k => [k, { key: k, income: 0, expense: 0, net: 0, count: 0 }]));
    for (const t of tx) {
        const r = map.get(keyOf(t.date)); if (!r) continue;
        const a = num(t.amount);
        if (t.type === 'income') r.income += a; else if (t.type === 'expense') r.expense += a;
        r.count++;
    }
    for (const r of map.values()) r.net = r.income - r.expense;
    return keys.map(k => map.get(k));
}

/**
 * Сравнение периода с предыдущим такой же длины.
 * Если период заканчивается текущим неполным месяцем — сравниваем «на то же число».
 */
export function comparison(tx, p, type, todayISO) {
    if (p.all) return { cur: sumTx(tx, p, type), prev: null, delta: null, partial: false };
    const prevP = previousPeriod(p);
    const todayKey = String(todayISO).slice(0, 7);
    const last = p.keys[p.keys.length - 1];
    const day = dayOf(todayISO);
    const partial = last === todayKey && day < dimOf(todayKey);
    const cutCur = partial ? { key: todayKey, day } : null;
    const cutPrev = partial ? { key: addMonths(todayKey, -prevP.shift), day } : null;
    const cur = sumTx(tx, p, type, cutCur);
    const prev = sumTx(tx, prevP, type, cutPrev);
    return { cur, prev, delta: prev > 0 ? (cur - prev) / prev : null, partial, prevKeys: prevP.keys };
}

/** Разбивка по категориям за период */
export function categoryBreakdown(tx, p, type = 'expense') {
    const map = new Map();
    let total = 0;
    for (const t of tx) {
        if (t.type !== type || !inPeriod(p, t.date)) continue;
        const a = num(t.amount); if (a <= 0) continue;
        const n = catName(t);
        const r = map.get(n) || { name: n, sum: 0, count: 0, financial: isFinancialCategory(n) };
        r.sum += a; r.count++; map.set(n, r); total += a;
    }
    const rows = [...map.values()].sort((a, b) => b.sum - a.sum);
    rows.forEach(r => { r.share = total > 0 ? r.sum / total : 0; });
    return { rows, total };
}

/** Топ-N самых крупных операций */
export function topTransactions(tx, p, n = 7, type = 'expense') {
    return tx.filter(t => t.type === type && inPeriod(p, t.date) && num(t.amount) > 0)
        .sort((a, b) => num(b.amount) - num(a.amount) || (a.date < b.date ? 1 : -1))
        .slice(0, n)
        .map(t => ({
            id: t.id, date: t.date, category: catName(t), amount: num(t.amount), financial: isFinancialCategory(catName(t)),
            name: String(t.products?.[0]?.name || t.description || t.category || 'Без названия').trim()
        }));
}

/**
 * Подробности по одной категории (для нижней шторки).
 * othersNames — если нажали «Прочее»: набор имён категорий, которые в него входят.
 */
export function categoryDetail(tx, p, name, { type = 'expense', todayISO, othersNames = null, trendMonths = 6 } = {}) {
    const match = othersNames ? (t => othersNames.has(catName(t))) : (t => catName(t) === name);
    const inType = tx.filter(t => t.type === type && num(t.amount) > 0);
    const mine = inType.filter(t => inPeriod(p, t.date) && match(t));
    const all = inType.filter(t => inPeriod(p, t.date));
    const total = mine.reduce((s, t) => s + num(t.amount), 0);
    const typeTotal = all.reduce((s, t) => s + num(t.amount), 0);
    const amounts = mine.map(t => num(t.amount));
    const biggest = [...mine].sort((a, b) => num(b.amount) - num(a.amount))[0] || null;

    // месяцы с тратами — для среднего «в месяц»
    const monthsWith = new Set(mine.map(t => keyOf(t.date)));
    const spanMonths = p.all ? Math.max(1, monthsWith.size) : p.keys.length;

    // дни недели
    const weekday = Array(7).fill(0);
    mine.forEach(t => { weekday[weekdayMon(t.date)] += num(t.amount); });

    // тренд по месяцам — шесть месяцев, заканчивая концом периода (для «всё время» — последним месяцем с данными)
    const lastKey = p.all ? (inType.reduce((m, t) => keyOf(t.date) > m ? keyOf(t.date) : m, '') || ymKey(1970, 1)) : p.keys[p.keys.length - 1];
    const tKeys = monthRange(addMonths(lastKey, -(trendMonths - 1)), lastKey);
    const tMap = new Map(tKeys.map(k => [k, 0]));
    inType.filter(match).forEach(t => { const k = keyOf(t.date); if (tMap.has(k)) tMap.set(k, tMap.get(k) + num(t.amount)); });
    const trend = tKeys.map(k => ({ key: k, value: tMap.get(k) }));

    // сравнение с предыдущим периодом (с учётом неполного месяца)
    let cmp = null;
    if (!p.all) {
        const prevP = previousPeriod(p);
        const todayKey = String(todayISO || '').slice(0, 7);
        const day = dayOf(todayISO || '');
        const partial = !!todayISO && p.keys[p.keys.length - 1] === todayKey && day < dimOf(todayKey);
        const cutCur = partial ? { key: todayKey, day } : null;
        const cutPrev = partial ? { key: addMonths(todayKey, -prevP.shift), day } : null;
        const side = (pp, cut) => inType.filter(t => inPeriod(pp, t.date) && match(t) && !(cut && keyOf(t.date) === cut.key && dayOf(t.date) > cut.day))
            .reduce((s, t) => s + num(t.amount), 0);
        const cur = side(p, cutCur), prev = side(prevP, cutPrev);
        cmp = { cur, prev, delta: prev > 0 ? (cur - prev) / prev : null, partial };
    }

    // позиции (товары) внутри категории
    const items = new Map();
    for (const t of mine) {
        const list = Array.isArray(t.products) && t.products.length ? t.products : [{ name: t.description || catName(t), price: num(t.amount), quantity: 1 }];
        const sumP = list.reduce((s, x) => s + num(x.price) * (num(x.quantity) || 1), 0);
        for (const x of list) {
            const nm = String(x.name || '—').trim() || '—';
            // если сумма позиций не сходится с суммой операции — масштабируем, чтобы итог совпал
            const raw = num(x.price) * (num(x.quantity) || 1);
            const v = sumP > 0 ? raw * (num(t.amount) / sumP) : num(t.amount) / list.length;
            const r = items.get(nm) || { name: nm, sum: 0, count: 0 };
            r.sum += v; r.count += 1; items.set(nm, r);
        }
    }

    return {
        name, total, count: mine.length, share: typeTotal > 0 ? total / typeTotal : 0,
        avg: mine.length ? total / mine.length : 0,
        median: median(amounts),
        perMonth: total / spanMonths,
        biggest: biggest ? { amount: num(biggest.amount), date: biggest.date, name: String(biggest.products?.[0]?.name || biggest.description || catName(biggest)) } : null,
        weekday, trend, cmp,
        items: [...items.values()].sort((a, b) => b.sum - a.sum).slice(0, 6),
        recent: [...mine].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 5)
            .map(t => ({ id: t.id, date: t.date, amount: num(t.amount), name: String(t.products?.[0]?.name || t.description || catName(t)) })),
        financial: isFinancialCategory(name)
    };
}

/**
 * Движения денег бюджета — ТЕ ЖЕ правила, что у «Доступно» на главной (BudgetManager.calculateTotals):
 * доход +, расход −, пополнение вклада −, снятие +, новый долг «я должен» +, «мне должны» −, платежи по долгам наоборот.
 */
/** ISO-метка времени → локальная дата YYYY-MM-DD (дата без времени остаётся как есть) */
function localYmd(s) {
    const r = String(s || '');
    if (!r.includes('T')) return r.slice(0, 10);
    const d = new Date(r);
    return Number.isNaN(d.getTime()) ? r.slice(0, 10) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function cashEvents(raw) {
    const ev = [];
    const push = (date, v) => { if (date && v) ev.push({ date: String(date).slice(0, 10), v }); };
    for (const t of raw || []) {
        const a = num(t.amount);
        if (t.type === 'income') push(t.date, a);
        else if (t.type === 'expense') push(t.date, -a);
        else if (t.type === 'deposit') {
            const st = String(t.status || '');
            if (!st.includes('Уже лежало')) push(t.date, st.trim() === '➖ Снятие' ? a : -a); // «Уже лежало» кошелёк не трогает
        }
        else if (t.type === 'debt') {
            const init = num(t.initialAmount ?? t.amount);
            if (init > 0) push(t.date, t.direction === 'owe' ? init : -init);
            let paid = 0; // платёж сверх остатка долга не считаем (как в «Доступно»)
            for (const pm of Array.isArray(t.payments) ? t.payments : []) {
                const pa = Math.min(num(pm.amount), Math.max(0, init - paid)); paid += pa;
                if (pa > 0) push(localYmd(pm.date), t.direction === 'owe' ? -pa : pa);
            }
        }
    }
    return ev;
}

/** Остаток на начало месяца `key`: перенос из месяца в месяц, ушедший в минус месяц дальше начинается с 0 (как «Доступно»). */
function openingFor(ev, key) {
    const net = new Map();
    for (const e of ev) { const k = keyOf(e.date); if (k < key) net.set(k, (net.get(k) || 0) + e.v); }
    let run = 0;
    for (const k of [...net.keys()].sort()) run = Math.max(0, run + net.get(k));
    return run;
}

/** Остаток на конец каждого месяца окна. Стартует с переноса (как «Доступно» на главной), конец последнего месяца = «Доступно». */
export function balanceSeries(raw, p) {
    const ev = cashEvents(raw);
    if (!ev.length) return { points: [], start: 0, end: 0, change: 0, min: null, max: null };
    const { first, last } = dataRange(ev);
    const a = p.all ? first : p.keys[0];
    const b = p.all ? last : p.keys[p.keys.length - 1];
    const keys = monthRange(a, b);
    const net = new Map(), plus = new Map(), minus = new Map();
    for (const e of ev) {
        const k = keyOf(e.date); if (k < a || k > b) continue;
        net.set(k, (net.get(k) || 0) + e.v);
        if (e.v > 0) plus.set(k, (plus.get(k) || 0) + e.v); else minus.set(k, (minus.get(k) || 0) - e.v);
    }
    const start = openingFor(ev, a);
    let run = start;
    const points = keys.map((k, i) => { if (i) run = Math.max(0, run); run += net.get(k) || 0; return { key: k, balance: run, net: net.get(k) || 0, plus: plus.get(k) || 0, minus: minus.get(k) || 0 }; });
    let min = points[0], max = points[0];
    points.forEach(pt => { if (pt.balance < min.balance) min = pt; if (pt.balance > max.balance) max = pt; });
    return { points, start, end: run, change: run - start, min, max };
}

/** Дневной остаток для коротких периодов: от 1-го числа первого месяца (с переносом) до последнего дня периода. Последняя точка = «Доступно». */
export function balanceDaily(raw, p, todayISO) {
    if (p.all || !p.keys.length) return { points: [], start: 0, end: 0, change: 0, min: null, max: null };
    const ev = cashEvents(raw);
    if (!ev.length) return { points: [], start: 0, end: 0, change: 0, min: null, max: null };
    const a = p.keys[0], b = p.keys[p.keys.length - 1];
    const from = `${a}-01`;
    const dim = new Date(Date.UTC(keyYear(b), keyMonth(b), 0)).getUTCDate();
    const monthEnd = `${b}-${String(dim).padStart(2, '0')}`;
    let to = monthEnd;
    if (todayISO && todayISO < to && todayISO >= from) to = todayISO;
    const net = new Map(), plus = new Map(), minus = new Map();
    let later = 0, laterPlus = 0, laterMinus = 0; // операции позже «сегодня» в последнем месяце — учитываем в последней точке, чтобы сошлось с «Доступно»
    for (const e of ev) {
        if (e.date < from) continue;
        if (e.date <= to) {
            net.set(e.date, (net.get(e.date) || 0) + e.v);
            if (e.v > 0) plus.set(e.date, (plus.get(e.date) || 0) + e.v); else minus.set(e.date, (minus.get(e.date) || 0) - e.v);
        } else if (e.date <= monthEnd) { later += e.v; if (e.v > 0) laterPlus += e.v; else laterMinus -= e.v; }
    }
    const start = openingFor(ev, a);
    const points = [];
    let run = start;
    const end = Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)));
    for (let ms = Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, 1); ms <= end; ms += 86400000) {
        const d = new Date(ms).toISOString().slice(0, 10);
        if (d.slice(8, 10) === '01' && d.slice(0, 7) !== a) run = Math.max(0, run);
        run += net.get(d) || 0;
        points.push({ date: d, balance: run, net: net.get(d) || 0, plus: plus.get(d) || 0, minus: minus.get(d) || 0 });
    }
    if (later && points.length) { const l = points[points.length - 1]; l.balance += later; l.net += later; l.plus += laterPlus; l.minus += laterMinus; run += later; }
    let min = points[0], max = points[0];
    points.forEach(pt => { if (pt.balance < min.balance) min = pt; if (pt.balance > max.balance) max = pt; });
    return { points, start, end: run, change: run - start, min, max };
}

/** Ключи месяцев для таблицы «Сводка»: год на графике (или все месяцы данных для «всё время») */
export function summaryKeys(p, viewYear, first, last) {
    if (p.all) return first && last ? monthRange(first, last) : [];
    return monthRange(ymKey(viewYear, 1), ymKey(viewYear, 12));
}

/** Строки сводки: поступления / траты / итог / доля сбережений */
export function summaryRows(tx, keys) {
    const rows = monthlyTotals(tx, keys);
    rows.forEach(r => { r.rate = r.income > 0 ? r.net / r.income : null; });
    const totals = rows.reduce((s, r) => ({ income: s.income + r.income, expense: s.expense + r.expense }), { income: 0, expense: 0 });
    return { rows, totals: { ...totals, net: totals.income - totals.expense, rate: totals.income > 0 ? (totals.income - totals.expense) / totals.income : null } };
}

/** Данные для первого графика: ключи на оси и значение метрики */
export function heroSeries(tx, p, viewYear, metric, first, last) {
    const keys = p.all ? (first && last ? monthRange(first, last) : []) : monthRange(ymKey(viewYear, 1), ymKey(viewYear, 12));
    const rows = monthlyTotals(tx, keys);
    const value = r => metric === 'income' ? r.income : metric === 'net' ? r.net : r.expense;
    return rows.map(r => ({ key: r.key, value: value(r), selected: inPeriod(p, r.key + '-01') }));
}
export { makePeriod };
