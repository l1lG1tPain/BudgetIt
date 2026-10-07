// ===============================
//   SharkTalk.js — «разговорчивая» Акулка (чистая логика без DOM)
//   • советы дня в карточке (утро / итог дня / серия / конец месяца / мотивация),
//   • ответы на быстрые вопросы («Сколько осталось?», «Куда ушли деньги?» …),
//   • объяснение, как считается лимит.
// ===============================
import { fmt, getSpentOnDay, getThresholds, isoDay, shiftDay, CHARACTER_LABELS } from './SharkMood.js';

import {
    MOTIVATION, CHEER_TASKS, REMINDERS, VERDICT_OK, VERDICT_OVER, GREETINGS, ANSWERS, BACKUP_NUDGES, PROACTIVE, FUN, FLAVOR, ANSWERS_C, GLOSSARY,
    WELCOME_BACK as WB_TEXTS, STREAK as STREAK_TEXTS, MONTH_END as ME_TEXTS, MORNING as MORNING_TEXTS
} from './texts/index.js';

import {
    CHALLENGES, getChallenge, evaluateChallenge, countDaysInLimit, rankInfo, RANKS, topCategories, weekCompare, forecastDay,
    debtSummary, oldestDebt, savingsMonth, incomeToday, detectSpike, weekRecapData, holidayKey
} from './SharkPlus.js';
import { goalCalc, parseGoalDate, formatGoalDate, wasteCategory, monthSummary, ruleCheck, BADGES } from './SharkExtra.js';
import { HELP_TOPICS, TIPS_TOPICS, HELP_INTRO, TIPS_INTRO, HELP_OUTRO, TIPS_OUTRO, MENU_EXPLAIN } from './texts/help.js';

export { CHALLENGES, RANKS, evaluateChallenge, countDaysInLimit, rankInfo };
export { HELP_TOPICS, TIPS_TOPICS, HELP_INTRO, TIPS_INTRO, HELP_OUTRO, TIPS_OUTRO, MENU_EXPLAIN };
export { MOTIVATION, CHEER_TASKS, REMINDERS, VERDICT_OK, VERDICT_OVER, GREETINGS, ANSWERS, BACKUP_NUDGES };

// Шаблон {a} {b} → функция, подставляющая значения по именам
const fill = tpl => vars => tpl.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
const compile = byChar => Object.fromEntries(Object.entries(byChar).map(([ch, list]) => [ch, list.map(fill)]));

export const WELCOME_BACK = compile(WB_TEXTS);
export const STREAK = compile(STREAK_TEXTS);
export const MONTH_END = compile(ME_TEXTS);
export const MORNING = Object.fromEntries(Object.entries(MORNING_TEXTS).map(([k, v]) => [k, compile(v)]));
export const VERDICT = { ok: VERDICT_OK, over: VERDICT_OVER };

// Подстановка из FUN
const fillFun = (key, ch, seed, vars) => fillAns(pickBy(FUN[key][ch], `${seed}:${key}`), vars);

// Подстановка в ответы; {lim} (если есть) идёт через пробел
const fillAns = (tpl, vars) => tpl.replace(/\s?\{lim\}/, vars.lim ? ` ${vars.lim}` : '').replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);

function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}
const seeded = (seed, n) => hash(seed) % n;
const pickBy = (list, seed) => list[seeded(seed, list.length)];
const charOf = c => (MOTIVATION[c] ? c : 'normal');
// ───────── болтливость: реплики по времени суток, дню недели и сезону, редкие реплики, «хвостики» ─────────
export const TALK_MODES = ['quiet', 'normal', 'chatty'];
const partOf = h => (h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 17 ? 'day' : h >= 17 && h < 23 ? 'evening' : 'night');
const seasonOf = m => (m === 11 || m <= 1 ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'autumn');
const weekdayOf = d => (d === 1 ? 'mon' : d === 5 ? 'fri' : d === 0 || d === 6 ? 'weekend' : 'mid');

export function flavorLine(ctx = {}) {
    const now = ctx.now || new Date();
    const today = ctx.today || isoDay(now);
    const character = charOf(ctx.character);
    const seed = ctx.seed ?? `${today}:${Math.floor(now.getHours() / 4)}:${character}`;
    const opts = [
        ['part', FLAVOR.part[partOf(now.getHours())]],
        ['weekday', FLAVOR.weekday[weekdayOf(now.getDay())]],
        ['season', FLAVOR.season[seasonOf(now.getMonth())]]
    ];
    if ((ctx.streak || 0) >= 3) opts.push(['tone', FLAVOR.toneHappy], ['tone', FLAVOR.toneHappy]);
    else if (ctx.limit && ctx.transactions) {
        const over = i => {
            const d = shiftDay(today, -i);
            return ctx.transactions.some(t => t.date === d) && getSpentOnDay({ transactions: ctx.transactions, planner: ctx.planner, day: d, normalize: ctx.normalize }) > ctx.limit;
        };
        if (over(1) && over(2)) opts.push(['tone', FLAVOR.toneGentle], ['tone', FLAVOR.toneGentle]);
    }
    const [name, pool] = opts[seeded(`fl:${seed}`, opts.length)];
    return { kind: 'flavor', sub: name, text: pickBy(pool[character], `${name}:${seed}`) };
}
export const rareLine = (character = 'normal', seed = String(Math.random())) => pickBy(FLAVOR.rare[charOf(character)], seed);
export const tailLine = (character = 'normal', seed = String(Math.random())) => pickBy(FLAVOR.tail[charOf(character)], seed);
const sayC = (key, character, seed, vars = {}) => pickFill(ANSWERS_C[key][charOf(character)], `${seed}:${key}`, vars);
export const badgeText = (character, title, seed = String(Math.random())) => sayC('badgeNew', character, seed, { title });

export const greeting = (character = 'normal', seed = String(Math.random())) => pickBy(GREETINGS[charOf(character)], seed);

export const motivation = (character = 'normal', seed = String(Math.random())) =>
    pickBy(MOTIVATION[charOf(character)], seed);

const endMark = t => (/[.!?…]$|\p{Extended_Pictographic}$/u.test(t) ? t : `${t}.`);

export function daysLeftInMonth(now = new Date()) {
    const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return dim - now.getDate();
}

// ───────── совет дня в карточке ─────────
// ctx: { now, today, character, limit, spent, transactions, planner, normalize, streak }
// Стабилен в течение дня/блока часов (без мерцания при обновлении карточки).
// Берём вариант, в котором все {плейсхолдеры} известны (иначе пропускаем строку)
const pickFill = (list, seed, vars) => {
    const ok = list.filter(t => [...t.matchAll(/\{(\w+)\}/g)].every(m => vars[m[1]] !== undefined && vars[m[1]] !== null));
    return fillAns(pickBy(ok.length ? ok : list, seed), vars);
};

export function buildExtra(ctx = {}) {
    const now = ctx.now || new Date();
    const today = ctx.today || isoDay(now);
    const character = charOf(ctx.character);
    const tx = ctx.transactions || [];
    const limit = ctx.limit || 0;
    const hour = now.getHours();
    const hasData = tx.length > 0;
    const hasToday = tx.some(t => t.date === today);
    const seed = `${today}:${Math.floor(hour / 4)}:${character}`;
    const say = (key, vars = {}) => pickFill(PROACTIVE[key][character], `${key}:${seed}`, vars);
    const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);

    if (!hasData) return null;

    // 0. Давно не заходили
    const last = tx.map(t => t.date).filter(d => d && d <= today).sort().pop();
    if (last && !hasToday) {
        const away = daysBetween(last, today);
        if (away >= 7) return { kind: 'away', text: pickBy(WELCOME_BACK[character], seed)({ n: away }) };
    }
    // 1. Вечерний итог
    if (limit && hour >= 21 && hasToday) {
        const ok = (ctx.spent || 0) <= limit;
        return { kind: 'recap', text: `Итог дня: ${fmt(ctx.spent || 0)} из ${fmt(limit)}. ${pickBy(VERDICT[ok ? 'ok' : 'over'][character], seed)}` };
    }
    // 2. Челлендж завершён или не удался (показываем в день события)
    const chl = ctx.challenge;
    if (chl && (chl.status === 'done' || chl.status === 'fail') && chl.seenOn === today) {
        const key = chl.status === 'done' ? 'chDone' : 'chFail';
        return { kind: key, text: fillAns(pickBy(FUN[key][character], `${key}:${seed}`), { title: chl.title }) };
    }
    // 2b. Цель накопления достигнута (в день события)
    const gl = ctx.goal;
    if (gl && gl.status === 'done' && gl.seenOn === today) return { kind: 'goalDone', text: sayC('goalDone', character, seed, { sum: fmt(gl.sum) }) };
    // 3. Пришли деньги (чередуется с другими строками)
    const pay = incomeToday(tx, today);
    if (pay > 0 && seeded(`pd:${seed}`, 2) === 0) return { kind: 'payday', text: say('payday', { sum: fmt(pay) }) };
    // 4. Напоминание записать траты
    if (hour >= 17 && !hasToday) return { kind: 'reminder', text: pickBy(REMINDERS[character], seed) };
    // 5. Итог прошлой недели — по понедельникам утром и днём
    if (now.getDay() === 1 && hour >= 5 && hour < 15) {
        const w = weekRecapData({ transactions: tx, planner: ctx.planner, today, limit, normalize: ctx.normalize });
        if (!w.daysWith) return { kind: 'weekly', text: say('weeklyRecapEmpty') };
        return { kind: 'weekly', text: say('weeklyRecap', {
            total: fmt(w.total), avg: fmt(w.avg), top: w.top || 'разное',
            inLimit: limit ? String(w.inLimit) : undefined, daysWith: limit ? String(w.daysWith) : undefined
        }) };
    }
    // 6. Праздники
    const hol = holidayKey(now);
    if (hol && hour < 16 && seeded(`h:${seed}`, 2) === 0) return { kind: 'holiday', text: say(`holiday_${hol}`) };
    // 7. Необычно крупная трата
    const spike = detectSpike(tx, today);
    if (spike && seeded(`sp:${seed}`, 2) === 0) return { kind: 'spike', text: say('spike', { sum: fmt(spike.sum), cat: spike.cat, times: String(spike.times) }) };
    // 8. Давние долги (раз в несколько блоков)
    if (seeded(`d:${seed}`, 3) === 0) {
        const owe = oldestDebt(tx, today, 'owe'), owed = oldestDebt(tx, today, 'owed');
        const d = owe || owed;
        if (d) return { kind: 'debt', text: say(owe ? 'debtOld' : 'debtOwedOld', { name: d.name, sum: fmt(d.sum), days: String(d.days) }) };
    }
    // 9. Серия
    if ([3, 5, 7, 10, 14, 21, 30].includes(ctx.streak || 0) && !hasToday) {
        return { kind: 'streak', text: pickBy(STREAK[character], seed)({ n: ctx.streak }) };
    }
    // 10. Конец месяца
    const left = daysLeftInMonth(now);
    if (limit && left <= 3) {
        return { kind: 'month', text: pickBy(MONTH_END[character], seed)({ n: left, limit: fmt(limit) }) };
    }
    // 11. Утро: вчерашний итог и лимит на сегодня
    if (limit && hour >= 5 && hour < 12 && !hasToday) {
        const y = shiftDay(today, -1);
        const sy = getSpentOnDay({ transactions: tx, planner: ctx.planner, day: y, normalize: ctx.normalize });
        const yHas = tx.some(t => t.date === y);
        if (yHas && sy > limit && seeded(`ao:${seed}`, 2) === 0) {
            return { kind: 'afterOver', text: say('afterOver', { y: fmt(sy), limit: fmt(limit), over: fmt(sy - limit) }) };
        }
        const group = yHas ? (sy <= limit ? 'yesOk' : 'yesOver') : 'no';
        return { kind: 'morning', text: pickBy(MORNING[group][character], seed)({ y: fmt(sy), limit: fmt(limit) }) };
    }
    // 12. Напоминание про экспорт данных: редко (раз в 2 недели), когда записей уже накопилось
    if (tx.length >= 10) {
        const lastNudge = ctx.backupNudgeLast || null;
        const gap = lastNudge ? daysBetween(lastNudge, today) : 99;
        if (gap >= 14 || lastNudge === today) return { kind: 'backup', text: pickBy(BACKUP_NUDGES[character], `b:${today}:${character}`) };
    }
    // 13. Прогресс челленджа
    if (chl && chl.status === 'active' && seeded(`ch:${seed}`, 2) === 0) {
        return { kind: 'chProgress', text: fillAns(pickBy(FUN.chProgress[character], `chp:${seed}`), { title: chl.title, done: String(chl.done), need: String(chl.need), daysLeft: String(chl.daysLeft) }) };
    }
    // 13b. Прогресс цели накопления
    if (gl && gl.status !== 'done' && seeded(`gl:${seed}`, 3) === 0) {
        const vars = { sum: fmt(gl.sum), saved: fmt(gl.saved), left: fmt(gl.left), pct: String(gl.pct), daysLeft: String(gl.daysLeft), perDay: fmt(gl.perDay) };
        return { kind: 'goal', text: sayC(gl.status === 'behind' ? 'goalBehind' : 'goalProgress', character, seed, vars) };
    }
    // 14. Болтливость: в тихом режиме молчим; иначе мотивация, редкая «странность» или реплика по времени/дню/сезону
    const talk = ctx.talk || 'normal';
    if (talk === 'quiet') return null;
    if (seeded(`m:${seed}`, 3) === 0) return { kind: 'motivation', text: motivation(character, seed) };
    if (seeded(`rare:${seed}`, talk === 'chatty' ? 6 : 20) === 0) return { kind: 'rare', text: rareLine(character, `rare:${seed}`) };
    if (talk === 'chatty' || seeded(`fl:${seed}`, 2) === 0) { const f = flavorLine({ ...ctx, now, today, character, seed }); return { kind: 'flavor', text: f.text }; }
    return null;
}

// ───────── как считается лимит ─────────
export function describeLimit({ info, planner = null, character = 'normal' } = {}) {
    const [warnAt, angryAt] = getThresholds(character);
    const lines = [];
    const src = info?.source || 'none';
    if (src === 'custom') {
        lines.push(`Лимит задан тобой: ${fmt(info.limit)} в день.`);
        if (info.auto?.limit) lines.push(`Сама Акулка насчитала бы ${fmt(info.auto.limit)} (${info.auto.source === 'plan' ? 'по плану' : 'по твоим тратам'}).`);
    } else if (src === 'plan') {
        lines.push(`Лимит из плана${planner?.name ? ` «${planner.name}»` : ''}: сумма «Ежедневных трат» за один день — ${fmt(info.limit)}.`);
    } else if (src === 'median') {
        lines.push(`Лимит — твой типичный день: медиана дневных трат за последние 30 дней — ${fmt(info.limit)}.`);
        lines.push('Дни без трат и разовые крупные покупки (в 3 раза больше обычного) не учитываются.');
    } else {
        lines.push('Лимита пока нет: нужен план месяца, хотя бы 3 дня с тратами за последние 30 дней или твоя собственная сумма.');
    }
    if (planner && src !== 'custom') lines.push('«Основные» и «Регулярные» платежи плана (аренда, связь) в дневные траты не входят.');
    else if (planner) lines.push('«Основные» и «Регулярные» платежи плана в дневные траты не входят.');
    const warnPct = Math.round(warnAt * 100);
    lines.push(angryAt > 50
        ? `Характер «${CHARACTER_LABELS[character] || 'Обычная'}»: насторожусь с ${warnPct}% лимита, ругаться не буду.`
        : `Характер «${CHARACTER_LABELS[character] || 'Обычная'}»: насторожусь с ${warnPct}% лимита, разозлюсь при превышении.`);
    return lines;
}

// ───────── быстрые вопросы ─────────
export const QUESTIONS = [
    { id: 'left',  label: 'Сколько осталось?' },
    { id: 'today', label: 'Куда ушли деньги сегодня?' },
    { id: 'week',  label: 'Как моя неделя?' },
    { id: 'limit', label: 'Как считается лимит?' },
    { id: 'cheer', label: 'Подбодри меня' }
];

export function answerQuestion(id, ctx = {}) {
    const now = ctx.now || new Date();
    const today = ctx.today || isoDay(now);
    const character = charOf(ctx.character);
    const tx = ctx.transactions || [];
    const limit = ctx.limit || 0;
    const spent = ctx.spent || 0;

    const ch = character;
    const seed = ctx.seed ?? String(Math.random());
    const say = (key, vars = {}, k = ch) => fillAns(pickBy(ANSWERS[key][k], `${seed}:${key}`), vars);
    if (id === 'left') {
        if (!limit) return { text: say('leftNone'), action: 'limit' };
        if (spent <= limit) return { text: say('leftOk', { left: fmt(limit - spent), limit: fmt(limit) }) };
        return { text: say('leftOver', { over: fmt(spent - limit), spent: fmt(spent), limit: fmt(limit) }) };
    }
    if (id === 'today') {
        const byCat = new Map();
        let total = 0;
        for (const t of tx) {
            if (t.type !== 'expense' || t.date !== today) continue;
            const a = Number(t.amount) || 0;
            total += a;
            byCat.set(t.category || 'Без категории', (byCat.get(t.category || 'Без категории') || 0) + a);
        }
        if (!total) return { text: say('todayNone') };
        const top = [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
            .map(([c, v]) => `${c} — ${fmt(v)}`).join('; ');
        return { text: say('todaySome', { total: fmt(total), top }) };
    }
    if (id === 'week') {
        let total = 0, daysWith = 0, inLimit = 0;
        for (let i = 0; i < 7; i++) {
            const day = shiftDay(today, -i);
            if (!tx.some(t => t.date === day)) continue;
            const s = getSpentOnDay({ transactions: tx, planner: ctx.planner, day, normalize: ctx.normalize });
            total += s; daysWith++;
            if (limit && s <= limit) inLimit++;
        }
        if (!daysWith) return { text: say('weekNone') };
        const lim = limit ? `В лимите ${inLimit} из ${daysWith} дн.` : '';
        return { text: say('weekSome', { total: fmt(total), avg: fmt(Math.round(total / daysWith)), lim }).trim() };
    }
    if (id === 'limit') {
        return { text: describeLimit({ info: ctx.info, planner: ctx.planner, character }).join('\n'), action: 'limit' };
    }
    if (id === 'whatif') {
        const a = Math.round(Number(ctx.amount));
        if (ctx.amount === undefined || ctx.amount === null || ctx.amount === '') return { text: say('whatifAsk'), input: 'amount' };
        if (!(a > 0)) return { text: say('whatifBad'), input: 'amount' };
        if (!limit) return { text: say('whatifNoLimit', { sum: fmt(a) }), action: 'limit' };
        const after = spent + a;
        const note = spent > 0 ? `\n\nС учётом сегодняшних трат (${fmt(spent)}) выйдет ${fmt(after)}.` : '';
        return after <= limit
            ? { text: say('whatifOk', { sum: fmt(a), left: fmt(limit - after), limit: fmt(limit) }) + note, input: 'amount' }
            : { text: say('whatifOver', { sum: fmt(a), over: fmt(after - limit), limit: fmt(limit) }) + note, input: 'amount' };
    }
    if (id === 'topcat') {
        const t = topCategories(tx, today, 30);
        if (!t.total) return { text: say('topcatNone') };
        const top = t.list.slice(0, 3).map(([c, v]) => `${c} — ${fmt(v)}`).join('; ');
        return { text: say('topcatSome', { top, total: fmt(t.total) }) };
    }
    if (id === 'vsweek') {
        const w = weekCompare({ transactions: tx, planner: ctx.planner, today, normalize: ctx.normalize });
        if (!w.prevHas || (!w.cur && !w.prev)) return { text: say('vsweekNone') };
        const diff = Math.abs(w.cur - w.prev);
        const vars = { cur: fmt(w.cur), prev: fmt(w.prev), diff: fmt(diff) };
        if (w.prev > 0 && diff / w.prev < 0.05) return { text: say('vsweekSame', vars) };
        return { text: say(w.cur > w.prev ? 'vsweekUp' : 'vsweekDown', vars) };
    }
    if (id === 'runout') {
        const f = forecastDay({ spent, limit, now });
        if (f.state === 'none') return { text: say('runoutNone'), action: 'limit' };
        if (f.state === 'over') return { text: say('runoutOver', { limit: fmt(limit), spent: fmt(spent) }) };
        if (f.state === 'early') return { text: say('runoutEarly') };
        return { text: say(f.state === 'safe' ? 'runoutSafe' : 'runoutRisk', { proj: fmt(f.proj), limit: fmt(limit), spent: fmt(spent) }) };
    }
    if (id === 'debts') {
        const d = debtSummary(tx);
        if (!d.oweCount && !d.owedCount) return { text: say('debtsNone') };
        if (d.oweCount && d.owedCount) return { text: say('debtsBoth', { oweSum: fmt(d.oweSum), owedSum: fmt(d.owedSum) }) };
        return d.oweCount
            ? { text: say('debtsOwe', { sum: fmt(d.oweSum), count: String(d.oweCount) }) }
            : { text: say('debtsOwed', { sum: fmt(d.owedSum), count: String(d.owedCount) }) };
    }
    if (id === 'savings') {
        const m = savingsMonth(tx, today);
        return m.count ? { text: say('savingsSome', { sum: fmt(m.sum), count: String(m.count) }) } : { text: say('savingsNone') };
    }
    if (id === 'level') {
        const info = rankInfo(countDaysInLimit({ transactions: tx, planner: ctx.planner, limit, today, normalize: ctx.normalize }));
        const name = `${info.rank.emoji} ${info.rank.name}`;
        const txt = fillFun(info.top ? 'levelTop' : (info.days ? 'levelNext' : 'levelNone'), character, `${seed}:lv`, {
            rank: name, days: String(info.days), next: info.next ? `${info.next.emoji} ${info.next.name}` : '', need: String(info.need)
        });
        return { text: txt };
    }
    if (id === 'fact') return { text: pickBy(FUN.facts[character], seed + String(Math.random())) };
    if (id === 'challenge') {
        const c = ctx.challenge;
        if (!c || (c.status !== 'active' && c.seenOn !== today)) return { text: fillFun('chNone', character, seed, {}), challenges: true };
        if (c.status === 'active') return { text: fillFun('chProgress', character, seed, { title: c.title, done: String(c.done), need: String(c.need), daysLeft: String(c.daysLeft) }), canStop: true };
        return { text: fillFun(c.status === 'done' ? 'chDone' : 'chFail', character, seed, { title: c.title }), challenges: true };
    }
    if (id === 'chstop') return { text: 'Хорошо, челлендж остановлен. Когда захочется — начнём новый.', effect: { stopChallenge: true } };
    if (typeof id === 'string' && id.startsWith('ch:')) {
        const def = getChallenge(id.slice(3));
        if (def) return { text: `${fillFun('chStart', character, seed, { title: def.title })}\n\n${def.icon} ${def.note[0].toUpperCase()}${def.note.slice(1)}. Срок — ${def.days} дн.`, effect: { startChallenge: def.id } };
    }
    if (id === 'waste') {
        const w = wasteCategory(tx, today);
        if (w.state === 'up') return { text: sayC('wasteUp', ch, seed, { cat: w.cat, pct: String(w.pct), cur: fmt(w.cur), prev: fmt(w.prev), diff: fmt(w.diff) }) };
        if (w.state === 'down') return { text: sayC('wasteDown', ch, seed, { cat: w.cat, pct: String(w.pct) }) };
        return { text: sayC('wasteNone', ch, seed) };
    }
    if (id === 'month') {
        const m = monthSummary(tx, today);
        if (!m) return { text: sayC('monthNone', ch, seed) };
        const d = m.inc - m.exp;
        const bal = d > 0 ? `плюс ${fmt(d)}` : d < 0 ? `минус ${fmt(-d)}` : 'ноль';
        return { text: sayC('monthSome', ch, seed, { exp: fmt(m.exp), inc: fmt(m.inc), sav: fmt(m.sav), top: m.top, days: String(m.days), bal }) };
    }
    if (id === 'rule') {
        const r = ruleCheck(tx, today);
        if (r.state === 'none') return { text: sayC('ruleNone', ch, seed) };
        return { text: sayC(r.state === 'good' ? 'ruleGood' : r.state === 'mid' ? 'ruleMid' : 'ruleLow', ch, seed, { spentPct: String(r.spentPct), savePct: String(r.savePct) }) };
    }
    if (id === 'goal' || id === 'goalnew') {
        if (ctx.goalInput) {
            const sum = Math.round(Number(ctx.goalInput.sum));
            const date = parseGoalDate(ctx.goalInput.date, today);
            if (!(sum > 0) || !date) return { text: sayC('goalBad', ch, seed), input: 'goal' };
            const calc = goalCalc({ sum, date, start: today }, tx, today);
            return {
                text: sayC('goalSet', ch, seed, { sum: fmt(sum), date: formatGoalDate(date), daysLeft: String(calc.daysLeft), perDay: fmt(calc.perDay), perWeek: fmt(calc.perWeek) }),
                effect: { setGoal: { sum, date, start: today } }
            };
        }
        const calc = id === 'goal' ? goalCalc(ctx.goalState, tx, today) : null;
        if (!calc) return { text: sayC(id === 'goal' ? 'goalNone' : 'goalAsk', ch, seed), input: 'goal' };
        if (calc.status === 'done') return { text: sayC('goalDone', ch, seed, { sum: fmt(calc.sum) }), goalButtons: true };
        const vars = { sum: fmt(calc.sum), saved: fmt(calc.saved), left: fmt(calc.left), pct: String(calc.pct), daysLeft: String(calc.daysLeft), perDay: fmt(calc.perDay) };
        return { text: sayC(calc.status === 'behind' ? 'goalBehind' : 'goalProgress', ch, seed, vars), goalButtons: true };
    }
    if (id === 'goalstop') return { text: 'Хорошо, цель убрана. Когда захочется новую, начнём заново.', effect: { clearGoal: true } };
    if (id === 'badges') {
        const e = new Set(ctx.badges || []);
        const lines = BADGES.map(b => (e.has(b.id) ? `• ${b.icon} **${b.title}**` : `• 🔒 ${b.title}: ${b.note}`));
        return { text: `${sayC('badgesIntro', ch, seed)}\nОткрыто: ${e.size} из ${BADGES.length}.\n${lines.join('\n')}` };
    }
    if (id === 'joke') return { text: pickBy(FLAVOR.jokes[ch], seed + String(Math.random())) };
    if (id === 'dialog') {
        return {
            text: pickBy(FLAVOR.dialogAsk[ch], seed + String(Math.random())),
            choices: [{ id: 'dlg:good', label: 'Отлично 😊' }, { id: 'dlg:ok', label: 'Нормально 🙂' }, { id: 'dlg:hard', label: 'Тяжеловато 😕' }]
        };
    }
    if (id === 'dlg:good' || id === 'dlg:ok' || id === 'dlg:hard') {
        const key = { 'dlg:good': 'dialogGood', 'dlg:ok': 'dialogOk', 'dlg:hard': 'dialogHard' }[id];
        return { text: pickBy(FLAVOR[key][ch], seed + String(Math.random())) };
    }
    if (id === 'cheer') {
        const seed = String(Math.random());
        return { text: `${motivation(character, seed)}\n\n🎯 Мини-задание: ${endMark(pickBy(CHEER_TASKS[character], seed + 't'))}` };
    }
    return { text: say('unknown') };
}

// ───────── помощь и советы ─────────
export const STATS_ITEMS = [
    { id: 'topcat', label: '📊 Куда уходит больше всего' },
    { id: 'vsweek', label: '📈 Сравнить с прошлой неделей' },
    { id: 'runout', label: '⏱️ Хватит ли лимита до вечера' },
    { id: 'debts', label: '📋 Мои долги' },
    { id: 'savings', label: '🐷 Мои накопления' },
    { id: 'whatif', label: '🤔 А что если…' },
    { id: 'waste', label: '🧐 Что я зря трачу?' },
    { id: 'month', label: '🗓️ Итог месяца' },
    { id: 'rule', label: '📐 Правило 50/30/20' },
    { id: 'goal', label: '🎯 Цель накопления' }
];
export const FUN_ITEMS = [
    { id: 'level', label: '🏆 Моё звание' },
    { id: 'badges', label: '🏅 Мои значки' },
    { id: 'fact', label: '🎲 Случайный факт' },
    { id: 'joke', label: '😄 Шутка' },
    { id: 'dialog', label: '💬 Как прошёл день?' },
];

export const MENUS = {
    stats: { items: STATS_ITEMS, label: '🔢 Мои цифры', introKey: 'menuStats' },
    fun: { items: FUN_ITEMS, label: '😄 Шутки и значки', introKey: 'menuFun' },
    help: { topics: HELP_TOPICS, intro: HELP_INTRO, outro: HELP_OUTRO, ...MENU_EXPLAIN.help },
    glossary: { topics: GLOSSARY, intro: ANSWERS_C.glossIntro, outro: ANSWERS_C.glossOutro, label: '🔤 Словарик' },
    tips: { topics: TIPS_TOPICS, intro: TIPS_INTRO, outro: TIPS_OUTRO, ...MENU_EXPLAIN.tips }
};

export function menuIntro(kind, character = 'normal', seed = String(Math.random())) {
    const m = MENUS[kind];
    if (m?.introKey) return pickBy(FUN[m.introKey][charOf(character)], seed);
    return m ? pickBy(m.intro[charOf(character)], seed) : '';
}

export function topicAnswer(kind, topicId, character = 'normal', seed = String(Math.random())) {
    const m = MENUS[kind];
    const t = m?.topics?.find(x => x.id === topicId);
    if (!t) return null;
    return {
        title: `${t.icon} ${t.title}`,
        text: t.text.join('\n'),
        action: t.action || null,
        outro: pickBy(m.outro[charOf(character)], `${seed}:${topicId}`)
    };
}

const escH = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

// Мини-разметка ответа: **жирный**, строки «• …» — список, остальные строки — абзацы
export function richHtml(text) {
    let out = '', inList = false;
    for (const raw of String(text).split('\n')) {
        const line = escH(raw).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
        if (/^•\s/.test(raw)) {
            if (!inList) { out += '<ul class="sc-list">'; inList = true; }
            out += `<li>${line.replace(/^•\s*/, '')}</li>`;
        } else {
            if (inList) { out += '</ul>'; inList = false; }
            if (line.trim()) out += `<p>${line}</p>`;
        }
    }
    if (inList) out += '</ul>';
    return out;
}

// ───────── подсказки при первом открытии раздела и тексты челленджей ─────────
export const HINT_KEYS = ['import', 'planner', 'analytics', 'accounts', 'shark'];
export function hintText(key, character = 'normal', seed = String(Math.random())) {
    const pool = PROACTIVE[`hint_${key}`];
    return pool ? pickBy(pool[charOf(character)], `${seed}:${key}`) : '';
}
export function challengeText(kind, character, title, seed = String(Math.random())) {
    return fillFun(kind, charOf(character), seed, { title });
}

export const goalDoneText = (character, sum, seed = String(Math.random())) => sayC('goalDone', character, seed, { sum: fmt(sum) });
