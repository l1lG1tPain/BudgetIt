// ===============================
//   SharkMood.js — настроение и реакции Акулки
//   Чистая логика без DOM (кроме localStorage), чтобы её можно было тестировать.
//   Формулы перенесены из прототипа дизайна (react / planCalc / thr).
// ===============================

export const SHARK_SETTINGS_KEY = 'budgetit:shark';
const TEXT_HISTORY_KEY = 'budgetit:shark:texts';

// [порог «насторожилась», порог «злится»] как доля дневного лимита
export const CHARACTER_THRESHOLDS = {
    kind  : [0.9, 99],
    normal: [0.8, 1],
    strict: [0.7, 1]
};

export const CHARACTER_LABELS = { kind: 'Добрая', normal: 'Обычная', strict: 'Строгая' };

const DEFAULTS = { character: 'normal', reactions: true, vibration: true, quietHours: true, dailyTip: true };

export function getSharkSettings(storage = globalThis.localStorage) {
    try {
        const raw = JSON.parse(storage?.getItem(SHARK_SETTINGS_KEY) || '{}');
        const s = { ...DEFAULTS, ...raw };
        if (!CHARACTER_THRESHOLDS[s.character]) s.character = 'normal';
        return s;
    } catch (e) {
        return { ...DEFAULTS };
    }
}

export function saveSharkSettings(patch, storage = globalThis.localStorage) {
    const next = { ...getSharkSettings(storage), ...patch };
    try { storage?.setItem(SHARK_SETTINGS_KEY, JSON.stringify(next)); } catch (e) { /* ignore */ }
    return next;
}

export function getThresholds(character) {
    return CHARACTER_THRESHOLDS[character] || CHARACTER_THRESHOLDS.normal;
}

// ───────── даты ─────────
export function isoDay(date = new Date()) {
    const d = new Date(date);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
}

function shiftDay(iso, delta) {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    return isoDay(d);
}

function median(nums) {
    if (!nums.length) return 0;
    const a = [...nums].sort((x, y) => x - y);
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

// ───────── план ─────────
// Активный план: план текущего бюджета, в период которого попадает сегодня.
export function findActivePlanner(planners = [], budgetId, today = isoDay()) {
    const mine = planners.filter(p => p && !p.archived && (!budgetId || p.budgetId === budgetId));
    return mine.find(p => p.startDate <= today && today <= (p.endDate || p.startDate)) || null;
}

// Лимит на день: сумма «Ежедневных трат» плана; без плана — медиана дневных трат за 30 дней
// (дни без трат не считаются, разовые покупки > 3× медианы отбрасываются).
export function getDailyLimit({ transactions = [], planner = null, today = isoDay() } = {}) {
    if (planner) {
        const daily = (planner.dailyExpenses || []).reduce((s, i) => s + (Number(i.amountPerDay) || 0), 0);
        if (daily > 0) return { limit: Math.round(daily), source: 'plan' };
    }
    const from = shiftDay(today, -30);
    const byDay = new Map();
    for (const t of transactions) {
        if (t.type !== 'expense' || !t.date || t.date < from || t.date >= today) continue;
        byDay.set(t.date, (byDay.get(t.date) || 0) + (Number(t.amount) || 0));
    }
    const sums = [...byDay.values()].filter(v => v > 0);
    if (sums.length < 3) return { limit: 0, source: 'none' };
    const med = median(sums);
    const regular = sums.filter(v => v <= med * 3);
    return { limit: Math.round(median(regular.length ? regular : sums)), source: 'median' };
}

// Траты за день без плановых «Основных» и «Регулярных» категорий активного плана
export function getSpentOnDay({ transactions = [], planner = null, day = isoDay(), normalize = c => c } = {}) {
    const planned = new Set();
    if (planner) {
        [...(planner.mainExpenses || []), ...(planner.regularExpenses || [])]
            .forEach(i => planned.add(normalize(i.category || i.name || '')));
    }
    return transactions
        .filter(t => t.type === 'expense' && t.date === day && !planned.has(normalize(t.category || '')))
        .reduce((s, t) => s + (Number(t.amount) || 0), 0);
}

// ───────── тексты ─────────
const fmt = n => Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

const TEXTS = {
    new: [
        () => 'Я Акулка. Добавь первую трату — начну следить за лимитом.',
        () => 'Пока знакомимся. Запиши пару трат, и я посчитаю твой дневной лимит.',
        () => 'Данных мало. Три дня с записями — и я скажу, сколько тебе можно в день.',
        () => 'Привет! Пиши траты, а я покажу, как ты тратишь деньги.',
        () => 'Пока без лимита: мне нужно хотя бы 3 дня твоих трат.',
        () => 'Только знакомлюсь с твоим бюджетом. Запиши сегодняшнюю покупку.'
    ],
    ok: [
        ({ left }) => `Всё спокойно. На сегодня в запасе ещё ${fmt(left)}.`,
        ({ left }) => `Ты в лимите, осталось ${fmt(left)}. Так держать.`,
        ({ left }) => `Довольна: до лимита ещё ${fmt(left)}.`,
        ({ left }) => `Траты в норме. На сегодня доступно ${fmt(left)}.`,
        ({ left }) => `Хороший день: можно потратить ещё ${fmt(left)}.`,
        ({ left }) => `Плыву спокойно — до лимита ${fmt(left)}.`
    ],
    tense: [
        ({ left }) => `Насторожилась: до лимита осталось ${fmt(left)}.`,
        ({ left }) => `Ты близко к лимиту — в запасе всего ${fmt(left)}.`,
        ({ left }) => `Почти упёрлись: осталось ${fmt(left)} на сегодня.`,
        ({ left }) => `Аккуратнее с тратами — до лимита ${fmt(left)}.`,
        ({ left }) => `Лимит рядом, осталось ${fmt(left)}. Подумай перед покупкой.`,
        ({ left }) => `Присматриваюсь: на сегодня ещё ${fmt(left)}, не больше.`
    ],
    angry: [
        ({ over }) => `Лимит пробит на ${fmt(over)}. Завтра поджмёмся.`,
        ({ over }) => `Ты вышла за лимит на ${fmt(over)}. Я недовольна.`,
        ({ over }) => `Перерасход ${fmt(over)}. Давай завтра потратим меньше.`,
        ({ over }) => `Злюсь: на ${fmt(over)} больше, чем можно сегодня.`,
        ({ over }) => `Сегодня перебор на ${fmt(over)}. Завтра — аккуратнее.`,
        ({ over }) => `Лимит превышен на ${fmt(over)}. Остановись на сегодня.`
    ],
    proud: [
        ({ days }) => `Горжусь тобой! ${days} дн. подряд в лимите.`,
        ({ days }) => `Неделя в лимите — ${days} дн. Ты молодец.`,
        ({ days }) => `Серия ${days} дн. без перерасхода. Так держать!`,
        ({ days }) => `${days} дн. в лимите. Я очень довольна тобой.`,
        ({ days }) => `Красота: ${days} дн. подряд без превышений.`,
        ({ days }) => `Ты держишься уже ${days} дн. Горжусь!`
    ]
};

// Антиповтор: не берём вариант, использованный за последние 3 дня
function pickText(state, vars, storage = globalThis.localStorage, today = isoDay()) {
    const list = TEXTS[state];
    let hist = {};
    try { hist = JSON.parse(storage?.getItem(TEXT_HISTORY_KEY) || '{}'); } catch (e) { hist = {}; }
    const cutoff = shiftDay(today, -3);
    const used = new Set((hist[state] || []).filter(x => x.d > cutoff).map(x => x.i));
    let candidates = list.map((_, i) => i).filter(i => !used.has(i));
    if (!candidates.length) candidates = list.map((_, i) => i);
    const idx = candidates[Math.floor(Math.random() * candidates.length)];
    hist[state] = [...(hist[state] || []).filter(x => x.d > cutoff), { i: idx, d: today }];
    try { storage?.setItem(TEXT_HISTORY_KEY, JSON.stringify(hist)); } catch (e) { /* ignore */ }
    return list[idx](vars);
}

// ───────── настроение ─────────
export const MOOD_TITLES = {
    new  : 'Акулка знакомится',
    ok   : 'Акулка довольна',
    tense: 'Акулка насторожилась',
    angry: 'Акулка злится',
    proud: 'Акулка гордится'
};

// Дней подряд в лимите (по вчерашним и более ранним дням, до 7)
export function countStreakInLimit({ transactions = [], planner = null, limit, today = isoDay(), normalize } = {}) {
    if (!limit) return 0;
    let streak = 0;
    for (let i = 1; i <= 7; i++) {
        const day = shiftDay(today, -i);
        const any = transactions.some(t => t.date === day);
        if (!any) break; // день без записей серию не продолжает
        const spent = getSpentOnDay({ transactions, planner, day, normalize });
        if (spent > limit) break;
        streak++;
    }
    return streak;
}

export function computeMood({ spent, limit, character = 'normal', hasData = true, streak = 0 }, opts = {}) {
    const [warnAt, angryAt] = getThresholds(character);
    if (!hasData || !limit) {
        return { key: 'new', title: MOOD_TITLES.new, text: pickText('new', {}, opts.storage, opts.today), ratio: 0, limit: 0 };
    }
    const ratio = spent / limit;
    let key = 'ok';
    if (ratio > angryAt) key = 'angry';
    else if (ratio > warnAt) key = 'tense';
    else if (streak >= 7 && ratio <= 1) key = 'proud';
    const left = Math.max(0, limit - spent);
    const over = Math.max(0, spent - limit);
    return {
        key, ratio, limit,
        title: MOOD_TITLES[key],
        text: pickText(key, { left, over, days: streak }, opts.storage, opts.today)
    };
}

// ───────── реакции на сохранение (тосты) ─────────
// before/after — траты за сегодня (без плановых) до и после операции
export function reactToSave({ type, amount, before = 0, after = 0, limit = 0, character = 'normal', backdate = null }) {
    const [warnAt, angryAt] = getThresholds(character);
    const colors = { ok: 'var(--in)', warn: 'var(--debt)', bad: 'var(--out)', save: 'var(--save)', sys: 'var(--accent)' };
    if (type === 'income') return { text: `+${fmt(amount)} пришло. Акулка довольна.`, color: colors.ok, mood: 'ok' };
    if (type === 'deposit') return { text: `Отложено ${fmt(amount)}. Акулка гордится тобой.`, color: colors.save, mood: 'proud' };
    if (type === 'debt') return { text: 'Долг записан. Напомню, когда подойдёт срок.', color: colors.warn, mood: 'ok' };
    if (backdate) return { text: `Записала задним числом — на ${backdate}.`, color: colors.sys, mood: 'ok' };
    if (!limit) return { text: `Записала трату на ${fmt(amount)}.`, color: colors.sys, mood: 'ok' };
    if (after > limit * angryAt) {
        return before > limit * angryAt
            ? { text: `Ещё ${fmt(amount)}. Перерасход уже ${fmt(after - limit)}.`, color: colors.bad, mood: 'angry', repeat: true }
            : { text: `Лимит пробит на ${fmt(after - limit)}. Завтра поджмёмся.`, color: colors.bad, mood: 'angry' };
    }
    if (after > limit) return { text: `Чуть выше лимита: +${fmt(after - limit)}. Ничего, бывает.`, color: colors.warn, mood: 'tense' };
    if (after / limit > warnAt) return { text: `Записала. До лимита осталось ${fmt(limit - after)}.`, color: colors.warn, mood: 'tense' };
    return { text: `Записала. В запасе ещё ${fmt(limit - after)}.`, color: colors.ok, mood: 'ok' };
}

// Тихие часы: после 23:00 и до 6:00 без анимации и вибрации
export function isQuietNow(settings, now = new Date()) {
    if (!settings?.quietHours) return false;
    const h = now.getHours();
    return h >= 23 || h < 6;
}
