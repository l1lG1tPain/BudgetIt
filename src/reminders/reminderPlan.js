// ===============================
//   reminderPlan.js — что и когда напомнить
//   Чистая логика: время, настройки, состояние и данные приходят аргументами, ничего не читает сама.
//   Возвращает одно напоминание для текущего слота или null.
//
//   Слоты: «утро» (09:00–20:00) и «вечер» (с времени итога дня до 23:00). В каждом слоте — не больше
//   одного уведомления, то есть не больше двух в сутки. Приоритет в утреннем слоте:
//   план на сегодня → просроченный доход → месячный итог → недельный итог → вклад → пропуск записей.
//   Даты — строки YYYY-MM-DD по местному времени, без UTC.
// ===============================

import { isConsumption, isPlainIncome } from '../utils/insightsMath.js';
import { toMinutes, IGNORED_LIMIT } from './reminderSettings.js';
import { renderReminderText, fmtMoney, nOps, nDays } from './reminderTexts.js';

const HOUR = 60;
const MORNING_FROM = 9 * HOUR;
const MORNING_TO = 20 * HOUR;
const EVENING_TO = 23 * HOUR;
const QUIET_TO = 8 * HOUR;
const ACTIVE_WINDOW_MS = 2 * 60 * 60 * 1000;   // пользователь только что был в приложении — не беспокоим
const GAP_MIN_DAYS = 2;
const GAP_REPEAT_DAYS = 3;
const GAP_MAX_SENT = 3;
const GAP_LOOKBACK = 60;

export const isoDay = (date = new Date()) => {
    const d = new Date(date);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
};

export const shiftDay = (iso, delta) => {
    const d = new Date(`${iso}T00:00:00`);
    d.setDate(d.getDate() + delta);
    return isoDay(d);
};

// ───────── факты по данным ─────────

const sum = arr => arr.reduce((s, t) => s + (Number(t.amount) || 0), 0);

function topCategory(list) {
    const by = new Map();
    for (const t of list) by.set(t.category || 'Без категории', (by.get(t.category || 'Без категории') || 0) + (Number(t.amount) || 0));
    let top = '', max = 0;
    for (const [cat, v] of by) if (v > max) { top = cat; max = v; }
    return top;
}

/** Сколько дней подряд до `beforeDay` (не включая) нет ни записей, ни отметки «день без трат». */
export function gapDaysBefore(beforeDay, transactions = [], noSpend = []) {
    // записей до этого дня нет вовсе (новичок) — это не «пропуск»
    if (!transactions.some(t => t.date && t.date < beforeDay)) return 0;
    const has = new Set(transactions.map(t => t.date));
    const marked = new Set(noSpend);
    let n = 0;
    for (let i = 1; i <= GAP_LOOKBACK; i++) {
        const d = shiftDay(beforeDay, -i);
        if (has.has(d) || marked.has(d)) return n;
        n++;
    }
    return n;
}

function isQuiet(minutes) {
    return minutes >= EVENING_TO || minutes < QUIET_TO;
}

const plannerItems = (planner, day) => {
    if (!planner || planner.archived) return { expenses: [], income: null };
    const expenses = (planner.mainExpenses || []).filter(i => i.date === day && Number(i.amount) > 0)
        .map(i => ({ item: i.category || i.note || 'Платёж', amount: Number(i.amount) }));
    const inc = planner.incomePlan;
    const income = inc && inc.incomeDate === day && Number(inc.amount) > 0
        ? { item: inc.category || 'Доход', amount: Number(inc.amount) }
        : null;
    return { expenses, income };
};

// ───────── сборка конкретных напоминаний ─────────

function build(type, slot, key, vars, ctx, extra = {}) {
    const { title, body } = renderReminderText(key, { cur: ctx.currency, ...vars }, { character: ctx.character, seed: `${ctx.today}:${type}` });
    return { type, slot, tag: `budgetit-${type}`, title, body, url: '/', day: ctx.today, actions: [], mark: {}, ...extra };
}

function plannerToday(ctx) {
    const { expenses, income } = plannerItems(ctx.data.planner, ctx.today);
    if (expenses.length) {
        const first = expenses[0];
        const more = expenses.length > 1 ? ` и ещё ${expenses.length - 1}` : '';
        return build('planner', 'morning', 'plannerExpense',
            { item: first.item + more, amount: fmtMoney(first.amount), when: 'сегодня' }, ctx, { url: '/?reminder=planner' });
    }
    if (income) {
        return build('planner', 'morning', 'plannerIncome',
            { item: income.item, amount: fmtMoney(income.amount), when: 'сегодня' }, ctx, { url: '/?reminder=planner' });
    }
    return null;
}

function plannerIncomeOverdue(ctx) {
    const o = ctx.data.plannerIncomeOverdue;
    if (!o) return null;
    return build('planner', 'morning', 'plannerIncomeOverdue',
        { item: o.item || 'Доход', amount: fmtMoney(o.amount) }, ctx, { url: '/?reminder=planner' });
}

function monthly(ctx) {
    const dayNum = Number(ctx.today.slice(8, 10));
    if (dayNum > 2) return null;
    const prevMonth = shiftDay(ctx.today.slice(0, 8) + '01', -1).slice(0, 7);
    if (ctx.state.monthly === prevMonth) return null;
    const list = ctx.data.transactions.filter(t => String(t.date || '').startsWith(prevMonth));
    const exp = list.filter(isConsumption);
    if (!exp.length) return null;
    return build('monthly', 'morning', 'monthly',
        { total: fmtMoney(sum(exp)), income: fmtMoney(sum(list.filter(isPlainIncome))), top: topCategory(exp) },
        ctx, { url: '/?reminder=recap', mark: { monthly: prevMonth } });
}

function weekly(ctx) {
    const dow = new Date(`${ctx.today}T00:00:00`).getDay();   // 1 — понедельник
    if (dow !== 1 && dow !== 2) return null;
    const monday = dow === 1 ? ctx.today : shiftDay(ctx.today, -1);
    if (ctx.state.weekly === monday) return null;
    const from = shiftDay(monday, -7), to = shiftDay(monday, -1);
    const exp = ctx.data.transactions.filter(t => isConsumption(t) && t.date >= from && t.date <= to);
    if (!exp.length) return null;
    const total = sum(exp);
    return build('weekly', 'morning', 'weekly',
        { total: fmtMoney(total), avg: fmtMoney(total / 7), top: topCategory(exp) },
        ctx, { url: '/?reminder=recap', mark: { weekly: monday } });
}

function deposit(ctx) {
    const list = ctx.data.deposits || [];
    const today = list.find(d => d && d.endDate === ctx.today);
    const soon = list.find(d => d && d.endDate === shiftDay(ctx.today, 3));
    const hit = today || soon;
    if (!hit) return null;
    return build('deposit', 'morning', 'deposit',
        { item: hit.title || 'Вклад', when: today ? 'сегодня' : 'через 3 дня' }, ctx, { url: '/?reminder=deposit' });
}

function gap(ctx) {
    if (ctx.state.gapSent >= GAP_MAX_SENT) return null;
    if (ctx.state.lastGapDay && ctx.state.lastGapDay > shiftDay(ctx.today, -GAP_REPEAT_DAYS)) return null;
    const n = gapDaysBefore(ctx.today, ctx.data.transactions, ctx.data.noSpend || []);
    // сегодня тоже ничего нет и пропуск уже >= 2 дней
    const hasToday = ctx.data.transactions.some(t => t.date === ctx.today);
    if (hasToday || n < GAP_MIN_DAYS) return null;
    return build('gap', 'morning', 'gap', { days: nDays(n) }, ctx, { url: '/?reminder=add', mark: { lastGapDay: ctx.today, gapSent: ctx.state.gapSent + 1 } });
}

function eveningExtra(ctx, todayTx) {
    const parts = [];
    const income = todayTx.filter(isPlainIncome);
    const exp = todayTx.filter(isConsumption);
    if (income.length) {
        parts.push(`Поступило ${fmtMoney(sum(income))} ${ctx.currency}.`.replace(/\s+\./, '.'));
    } else {
        const gapBefore = gapDaysBefore(ctx.today, ctx.data.transactions, ctx.data.noSpend || []);
        if (gapBefore >= GAP_MIN_DAYS) parts.push(`Первая запись за ${nDays(gapBefore)}, так держать.`);
        else if (exp.length >= 2) {
            const big = exp.reduce((a, b) => (Number(b.amount) > Number(a.amount) ? b : a));
            parts.push(`Крупнее всего: «${big.category || 'Без категории'}», ${fmtMoney(big.amount)} ${ctx.currency}.`.replace(/\s+\./, '.'));
        }
    }
    const tomorrow = plannerItems(ctx.data.planner, shiftDay(ctx.today, 1));
    if (tomorrow.expenses.length) {
        const f = tomorrow.expenses[0];
        parts.push(`Завтра по плану: «${f.item}», ${fmtMoney(f.amount)} ${ctx.currency}.`.replace(/\s+\./, '.'));
    } else if (tomorrow.income) {
        parts.push(`Завтра ждём доход «${tomorrow.income.item}».`);
    }
    return parts.join(' ');
}

function evening(ctx) {
    const todayTx = ctx.data.transactions.filter(t => t.date === ctx.today);
    if (!todayTx.length) {
        if ((ctx.data.noSpend || []).includes(ctx.today)) return null;   // день уже отмечен как «без трат»
        if (!ctx.data.transactions.length) return null;                 // новичка записями не дёргаем
        return build('evening', 'evening', 'eveningEmpty', {}, ctx, {
            url: '/?reminder=add',
            actions: [{ action: 'add', title: 'Записать трату' }, { action: 'nospend', title: 'Без трат' }]
        });
    }
    const extra = eveningExtra(ctx, todayTx);
    const count = `Записано: ${nOps(todayTx.length)}`;
    const spentFact = Number.isFinite(Number(ctx.data.spentToday))
        ? Number(ctx.data.spentToday)
        : sum(todayTx.filter(isConsumption));
    const hasExpenses = todayTx.some(isConsumption);
    const limit = Number(ctx.data.limit) || 0;
    const base = { spent: fmtMoney(spentFact), count, extra };
    if (!hasExpenses) return build('evening', 'evening', 'eveningNoSpend', base, ctx, { url: '/' });
    if (limit > 0) {
        const left = limit - spentFact;
        return left >= 0
            ? build('evening', 'evening', 'eveningLeft', { ...base, left: fmtMoney(left) }, ctx, { url: '/' })
            : build('evening', 'evening', 'eveningOver', { ...base, over: fmtMoney(-left) }, ctx, { url: '/' });
    }
    return build('evening', 'evening', 'eveningPlain', base, ctx, { url: '/' });
}

function tomorrowPlanOnly(ctx) {
    const t = plannerItems(ctx.data.planner, shiftDay(ctx.today, 1));
    if (t.expenses.length) {
        return build('planner', 'evening', 'plannerExpense',
            { item: t.expenses[0].item, amount: fmtMoney(t.expenses[0].amount), when: 'завтра' }, ctx, { url: '/?reminder=planner' });
    }
    if (t.income) {
        return build('planner', 'evening', 'plannerIncome',
            { item: t.income.item, amount: fmtMoney(t.income.amount), when: 'завтра' }, ctx, { url: '/?reminder=planner' });
    }
    return null;
}

// ───────── главная функция ─────────

/**
 * @param {object} args
 * @param {Date}   args.now
 * @param {object} args.settings  нормализованные настройки (reminderSettings)
 * @param {object} args.state     нормализованное состояние (reminderSettings)
 * @param {object} args.data      { transactions, noSpend, planner, limit, spentToday, currency, character,
 *                                  plannerIncomeOverdue, deposits: [{title, endDate}] }
 * @returns {object|null} { type, slot, tag, title, body, url, day, actions, mark }
 */
export function planReminder({ now = new Date(), settings, state, data = {} } = {}) {
    if (!settings?.enabled || !state) return null;
    const today = isoDay(now);
    const minutes = now.getHours() * HOUR + now.getMinutes();
    const ms = now.getTime();

    if (state.paused) return null;
    if (settings.quietHours && isQuiet(minutes)) return null;
    if (state.lastActiveAt && ms - state.lastActiveAt < ACTIVE_WINDOW_MS) return null;

    const eveningFrom = toMinutes(settings.eveningTime) ?? 21 * HOUR;
    const inEvening = minutes >= eveningFrom && minutes < EVENING_TO;
    const inMorning = minutes >= MORNING_FROM && minutes < MORNING_TO && !inEvening;
    const slot = inEvening ? 'evening' : inMorning ? 'morning' : null;
    if (!slot) return null;
    if ((state.shown[today] || []).includes(slot)) return null;

    const tx = Array.isArray(data.transactions) ? data.transactions : [];
    const ctx = {
        today, state, settings,
        data: { ...data, transactions: tx },
        currency: data.currency || '',
        character: data.character || 'normal'
    };

    // Акулка прощается один раз и затихает
    if (state.ignored >= IGNORED_LIMIT) {
        return build('farewell', slot, 'farewell', {}, ctx, { mark: { paused: true } });
    }

    const on = settings.types || {};
    if (slot === 'morning') {
        const steps = [
            on.planner && plannerToday,
            on.planner && plannerIncomeOverdue,
            on.monthly && monthly,
            on.weekly && weekly,
            on.deposit && deposit,
            on.gap && gap
        ].filter(Boolean);
        for (const step of steps) {
            const r = step(ctx);
            if (r) return r;
        }
        return null;
    }

    if (on.evening) return evening(ctx);
    return on.planner ? tomorrowPlanOnly(ctx) : null;
}

// ───────── изменения состояния ─────────

/** Вызвать, когда уведомление показано. Возвращает новое состояние (исходное не меняет). */
export function registerShown(state, item, now = new Date()) {
    const ms = now.getTime();
    const prevIgnored = state.lastShownAt > 0 && state.lastActiveAt < state.lastShownAt;
    const slots = [...(state.shown[item.day] || [])];
    if (!slots.includes(item.slot)) slots.push(item.slot);
    return {
        ...state,
        ...item.mark,
        shown: { ...state.shown, [item.day]: slots },
        lastShownAt: ms,
        ignored: state.ignored + (prevIgnored ? 1 : 0)
    };
}

/** Вызвать, когда пользователь открыл приложение. gapDays — текущий пропуск (gapDaysBefore). */
export function registerOpen(state, now = new Date(), { gapDays = 0 } = {}) {
    return {
        ...state,
        lastActiveAt: now.getTime(),
        ignored: 0,
        paused: false,
        gapSent: gapDays < GAP_MIN_DAYS ? 0 : state.gapSent
    };
}
