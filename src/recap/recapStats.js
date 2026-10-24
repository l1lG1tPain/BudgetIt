// ===============================
//   recapStats.js — чистые расчёты для «Каким был твой прошлый месяц» (без DOM)
//   Считаем только income/expense; вклады, долги и переводы между своими счетами в итог не попадают.
//   Даты — строки 'YYYY-MM-DD' (никогда не парсим через new Date(str)).
// ===============================
import { addMonths, keyOf, keyYear, keyMonth, MONTHS_FULL } from '../analytics/period.js';
import { weekdayMon, baseTx, catName } from '../analytics/stats.js';
import { num, isFinancialCategory, isFinancialIncomeCategory } from '../utils/insightsMath.js';

/** Сколько дней с записями нужно, чтобы показывать рассказ */
export const MIN_ACTIVE_DAYS = 15;
// ВРЕМЕННО (просмотр): true = показываем все итоги сразу, без окон дат и порогов по данным.
// Чтобы вернуть обычную логику, поставь false. Тесты включают строгий режим сами (globalThis.__RECAP_STRICT__).
export const RECAP_PREVIEW = false && !globalThis.__RECAP_STRICT__;
/** Кнопка в чате Акулки видна только в первые дни месяца, дальше остаётся вход из Аналитики */
export const RECAP_CHAT_DAYS = 10;
export const recapChatVisible = todayISO => RECAP_PREVIEW || (Number(String(todayISO).slice(8, 10)) || 99) <= RECAP_CHAT_DAYS;
export const WEEKDAYS_LONG = ['понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу', 'воскресенье'];
export const WEEKDAYS_NOM = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

export const dayOf = d => Number(String(d).slice(8, 10)) || 0;
export const daysIn = key => new Date(Date.UTC(keyYear(key), keyMonth(key), 0)).getUTCDate();

/** «🥦 Продукты» → { emoji, text } */
export function splitCat(name) {
    const m = String(name || '').match(/^((?:\p{Extended_Pictographic}|\p{Emoji_Component})+)\s*(.*)$/u);
    return m && m[2] ? { emoji: m[1], text: m[2] } : { emoji: '🗂️', text: String(name || '').trim() };
}

export function prevMonthKey(todayISO) { return addMonths(keyOf(todayISO), -1); }
export const monthName = key => MONTHS_FULL[keyMonth(key) - 1].toLowerCase();

export function monthTx(all, key) { return baseTx(all).filter(t => keyOf(t.date) === key); }
export const activeDaysOf = txs => new Set(txs.map(t => t.date)).size;

/** Лёгкая проверка для кнопок: хватает ли данных за прошлый месяц */
export function recapAvailability(all, todayISO) {
    const key = prevMonthKey(todayISO);
    const active = activeDaysOf(monthTx(all, key));
    return {
        key, name: monthName(key), activeDays: active, daysInMonth: daysIn(key),
        eligible: active >= (RECAP_PREVIEW ? 1 : MIN_ACTIVE_DAYS), missingDays: Math.max(0, MIN_ACTIVE_DAYS - active)
    };
}

// «Деньги ушли / пришли» — как на главном экране и в выборе периода: ВСЕ доходы и расходы с датой,
// включая переводы, вклады, долги и траты «без учёта» (деньги всё равно потрачены).
export const ioTx = all => (all || []).filter(t => (t.type === 'income' || t.type === 'expense') && t.date);
export const totalsOf = list => list.reduce((r, t) => { const a = num(t.amount); if (t.type === 'income') r.income += a; else if (t.type === 'expense') r.expense += a; return r; }, { income: 0, expense: 0 });

export function spendOnly(txs) { return txs.filter(t => t.type === 'expense' && !isFinancialCategory(t.category)); }
export function incomeOnly(txs) { return txs.filter(t => t.type === 'income' && !isFinancialIncomeCategory(t.category)); }

export function groupSum(list, nameFn) {
    const m = new Map();
    for (const t of list) {
        const n = nameFn(t); const e = m.get(n) || { name: n, amount: 0, count: 0 };
        e.amount += num(t.amount); e.count++; m.set(n, e);
    }
    return [...m.values()].sort((a, b) => b.amount - a.amount);
}

function persona(r) {
    if (r.income > 0 && r.saveRate >= 0.3) return { emoji: '🐷', title: 'Копилка', text: `Ты отложил ${Math.round(r.saveRate * 100)}% от поступлений. Так держать.` };
    if (r.noSpendDays >= 8) return { emoji: '🧘', title: 'Мастер пауз', text: `${r.noSpendDays} дней вообще без трат. Это уже стиль.` };
    if (r.vsPrev && r.vsPrev.expenseDelta <= -0.15) return { emoji: '✂️', title: 'Экономист', text: `Траты упали на ${Math.round(-r.vsPrev.expenseDelta * 100)}% к прошлому месяцу.` };
    if (r.topCats[0] && r.topCats[0].share >= 0.4) return { emoji: r.topCats[0].emoji, title: `Фанат категории «${r.topCats[0].text}»`, text: `${Math.round(r.topCats[0].share * 100)}% всех трат ушло в одну категорию.` };
    if (r.weekendShare >= 0.5) return { emoji: '🎉', title: 'Король выходных', text: 'Больше половины денег ушло в субботу и воскресенье.' };
    if (r.vsPrev && r.vsPrev.expenseDelta >= 0.2) return { emoji: '🚀', title: 'Месяц на разгоне', text: `Трат стало больше на ${Math.round(r.vsPrev.expenseDelta * 100)}%.` };
    return { emoji: '🦈', title: 'Ровный курс', text: 'Без резких движений: деньги шли спокойно и предсказуемо.' };
}

/**
 * Итог прошлого месяца. Возвращает { ok:false, ...availability } если записей меньше MIN_ACTIVE_DAYS.
 */
export function buildRecap(all, todayISO) {
    const av = recapAvailability(all, todayISO);
    if (!av.eligible) return { ok: false, ...av };

    const key = av.key, dim = av.daysInMonth;
    const txs = monthTx(all, key);
    const exp = spendOnly(txs), inc = incomeOnly(txs);
    // spend / realIncome — «бытовые» траты и доходы (без переводов, вкладов, долгов): для привычек и категорий.
    // totExpense / totIncome — все операции месяца, как в «Итоге» Аналитики: именно от них зависит плюс или минус.
    const spend = exp.reduce((s, t) => s + num(t.amount), 0);
    const realIncome = inc.reduce((s, t) => s + num(t.amount), 0);
    const { income: totIncome, expense: totExpense } = totalsOf(ioTx(all).filter(t => keyOf(t.date) === key));
    const expense = spend, income = realIncome;
    const net = totIncome - totExpense;

    const cats = groupSum(exp, catName).map(c => ({ ...splitCat(c.name), name: c.name, amount: c.amount, count: c.count, share: spend ? c.amount / spend : 0 }));
    const topCats = cats.slice(0, 5);
    const byCount = [...cats].sort((a, b) => b.count - a.count)[0] || null;

    const daily = Array.from({ length: dim }, () => 0);
    const dailyCount = Array.from({ length: dim }, () => 0);
    for (const t of exp) { const d = dayOf(t.date); if (d >= 1 && d <= dim) { daily[d - 1] += num(t.amount); dailyCount[d - 1]++; } }

    let bigTx = null;
    for (const t of exp) if (!bigTx || num(t.amount) > num(bigTx.amount)) bigTx = t;
    const bigName = bigTx ? String((bigTx.products && bigTx.products[0] && bigTx.products[0].name) || bigTx.name || '').trim() : '';

    let priciest = null;
    daily.forEach((v, i) => { if (v > 0 && (!priciest || v > priciest.amount)) priciest = { day: i + 1, amount: v, count: dailyCount[i] }; });
    if (priciest) priciest.weekday = weekdayMon(`${key}-${String(priciest.day).padStart(2, '0')}`);

    // дни без трат и самая длинная серия
    let noSpendDays = 0, streak = 0, bestStreak = 0, bestStart = 0, curStart = 0;
    daily.forEach((v, i) => {
        if (v === 0) { if (streak === 0) curStart = i + 1; noSpendDays++; streak++; if (streak > bestStreak) { bestStreak = streak; bestStart = curStart; } } else streak = 0;
    });

    const wd = Array.from({ length: 7 }, () => 0), wdDays = Array.from({ length: 7 }, () => 0);
    daily.forEach((v, i) => { const w = weekdayMon(`${key}-${String(i + 1).padStart(2, '0')}`); wd[w] += v; wdDays[w]++; });
    let topWd = 0; wd.forEach((v, i) => { if (v > wd[topWd]) topWd = i; });
    const weekendShare = spend ? (wd[5] + wd[6]) / spend : 0;

    const sources = groupSum(inc, t => String(t.name || '').trim() || catName(t)).slice(0, 3).map(s => ({ ...s, share: income ? s.amount / income : 0 }));
    const incCats = groupSum(inc, catName).slice(0, 3).map(c => ({ ...splitCat(c.name), amount: c.amount, share: income ? c.amount / income : 0 }));

    // сравнение с предыдущим месяцем (если там вообще что-то было)
    let vsPrev = null;
    const pKey = addMonths(key, -1);
    const pTx = monthTx(all, pKey);
    if (pTx.length) {
        const pExp = spendOnly(pTx);
        const { expense: pe, income: pi } = totalsOf(ioTx(all).filter(t => keyOf(t.date) === pKey));
        const prevCats = new Map(groupSum(pExp, catName).map(c => [c.name, c.amount]));
        let move = null;
        for (const c of cats) {
            const before = prevCats.get(c.name) || 0;
            const d = c.amount - before;
            if (before > 0 && (!move || Math.abs(d) > Math.abs(move.diff))) move = { ...splitCat(c.name), name: c.name, diff: d, pct: d / before };
        }
        vsPrev = {
            key: pKey, name: monthName(pKey), expense: pe, income: pi, activeDays: activeDaysOf(pTx),
            expenseDelta: pe > 0 ? (totExpense - pe) / pe : null, incomeDelta: pi > 0 ? (totIncome - pi) / pi : null, move,
            comparable: activeDaysOf(pTx) >= 10
        };
        if (!vsPrev.comparable) { vsPrev.expenseDelta = null; vsPrev.incomeDelta = null; vsPrev.move = null; }
    }

    const r = {
        ok: true, key, name: av.name, year: keyYear(key), daysInMonth: dim, activeDays: av.activeDays,
        income: totIncome, expense: totExpense, net, saveRate: totIncome > 0 ? net / totIncome : 0,
        spend, realIncome, fin: { expense: totExpense - spend, income: totIncome - realIncome },
        expenseCount: exp.length, incomeCount: inc.length,
        avgPerDay: dim ? spend / dim : 0, avgTx: exp.length ? spend / exp.length : 0,
        topCats, topCatByCount: byCount, bigTx: bigTx ? { amount: num(bigTx.amount), date: bigTx.date, category: catName(bigTx), ...splitCat(catName(bigTx)), title: bigName } : null,
        daily, priciest, noSpendDays, bestStreak, bestStreakStart: bestStart,
        weekdays: wd, topWeekday: topWd, weekendShare,
        sources, incCats, vsPrev
    };
    r.persona = persona(r);
    return r;
}

/** Какая Акулка встречает на первом слайде: эмоция = файл assets/hoodie/hoodie-<эмоция>.webp */
export function recapMood(r, period = 'month') {
    const w = period === 'year' ? { good: 'Год удался', fine: 'Хороший год', plus: 'Год в плюсе', tight: 'Год впритык', hard: 'Год вышел тяжёлым' }
        : { good: 'Месяц удался', fine: 'Хороший месяц', plus: 'Вышел в плюс', tight: 'Почти впритык', hard: 'Месяц вышел тяжёлым' };
    if (!(r.income > 0)) return { emotion: 'count-cold', line: 'Поступлений в записях нет, Акулка просто считает траты' };
    const deficit = r.income > 0 ? -r.net / r.income : (r.expense > 0 ? 1 : 0);
    if (r.net >= 0) {
        if (r.saveRate >= 0.4) return { emotion: 'celebrate', line: `${w.good}, Акулка празднует` };
        if (r.saveRate >= 0.2) return { emotion: 'proud', line: `${w.fine}, Акулка гордится` };
        return { emotion: 'count-happy', line: `${w.plus}, Акулка довольно считает` };
    }
    if (deficit <= 0.15) return { emotion: 'count-cold', line: `${w.tight}, Акулка нервно пересчитывает` };
    if (deficit <= 0.4) return { emotion: 'shock', line: 'Трат больше, чем денег, Акулка в шоке' };
    return { emotion: 'broke', line: `${w.hard}, Акулка на мели` };
}
