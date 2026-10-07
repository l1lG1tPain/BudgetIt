// ===============================
//   SharkMood.js — настроение и реакции Акулки
//   Чистая логика без DOM (кроме localStorage), чтобы её можно было тестировать.
//   Формулы перенесены из прототипа дизайна (react / planCalc / thr).
// ===============================

import { MOOD_TEXTS, TOAST_TEXTS, FLAVOR } from './texts/index.js';

export const SHARK_SETTINGS_KEY = 'budgetit:shark';
const TEXT_HISTORY_KEY = 'budgetit:shark:texts';

// [порог «насторожилась», порог «злится»] как доля дневного лимита
export const CHARACTER_THRESHOLDS = {
    kind  : [0.9, 99],
    normal: [0.8, 1],
    strict: [0.7, 1]
};

export const CHARACTER_LABELS = { kind: 'Добрая', normal: 'Обычная', strict: 'Строгая' };

// Картинка Акулки под настроение (ok и new — базовая)
export const MOOD_IMAGES = {
    new  : 'assets/shark.png',
    ok   : 'assets/shark.png',
    tense: 'assets/wary-shark.png',
    angry: 'assets/angry-shark.png',
    proud: 'assets/proud-shark.png'
};
export const sharkImage = key => MOOD_IMAGES[key] || MOOD_IMAGES.ok;

const DEFAULTS = {
    character: 'normal', reactions: true, vibration: true, quietHours: true, dailyTip: true,
    talk: 'normal',      // болтливость: 'quiet' | 'normal' | 'chatty'
    limitMode: 'auto',   // 'auto' — Акулка считает сама, 'custom' — своя сумма
    customLimit: 0
};

export function getSharkSettings(storage = globalThis.localStorage) {
    try {
        const raw = JSON.parse(storage?.getItem(SHARK_SETTINGS_KEY) || '{}');
        const s = { ...DEFAULTS, ...raw };
        if (!CHARACTER_THRESHOLDS[s.character]) s.character = 'normal';
        if (s.limitMode !== 'custom') s.limitMode = 'auto';
        if (!['quiet', 'normal', 'chatty'].includes(s.talk)) s.talk = 'normal';
        s.customLimit = Math.max(0, Math.round(Number(s.customLimit) || 0));
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

export function shiftDay(iso, delta) {
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

// Итоговый лимит с учётом ручной настройки.
// source: 'custom' | 'plan' | 'median' | 'none'; auto — что насчитала бы сама Акулка.
export function getLimitInfo({ transactions = [], planner = null, today = isoDay(), settings = null } = {}) {
    const auto = getDailyLimit({ transactions, planner, today });
    const custom = Math.round(Number(settings?.customLimit) || 0);
    if (settings?.limitMode === 'custom' && custom > 0) return { limit: custom, source: 'custom', auto };
    return { ...auto, auto };
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
export const fmt = n => Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

// Шаблоны {left} {over} {days} превращаем в функции (v) => строка
const fillMood = tpl => (v = {}) => tpl.replace(/\{(left|over|days)\}/g, (m, k) => k === 'days' ? v.days : fmt(v[k]));
const TEXTS = {};
for (const key of Object.keys(MOOD_TEXTS)) {
    TEXTS[key] = {};
    for (const ch of Object.keys(MOOD_TEXTS[key])) TEXTS[key][ch] = MOOD_TEXTS[key][ch].map(fillMood);
}

export const TEXT_VARIANTS = TEXTS; // для тестов

function textList(state, character) {
    const entry = TEXTS[state];
    if (Array.isArray(entry)) return entry;
    return entry[character] || entry.normal || Object.values(entry)[0];
}

// Антиповтор: не берём вариант, использованный за последние 3 дня (отдельно по настроению и характеру)
function pickText(state, vars, storage = globalThis.localStorage, today = isoDay(), character = 'normal') {
    const list = textList(state, character);
    const hkey = Array.isArray(TEXTS[state]) ? state : `${state}:${character}`;
    let hist = {};
    try { hist = JSON.parse(storage?.getItem(TEXT_HISTORY_KEY) || '{}'); } catch (e) { hist = {}; }
    const cutoff = shiftDay(today, -3);
    const used = new Set((hist[hkey] || []).filter(x => x.d > cutoff).map(x => x.i));
    let candidates = list.map((_, i) => i).filter(i => !used.has(i));
    if (!candidates.length) candidates = list.map((_, i) => i);
    const idx = candidates[Math.floor(Math.random() * candidates.length)];
    hist[hkey] = [...(hist[hkey] || []).filter(x => x.d > cutoff), { i: idx, d: today }];
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
export const TITLES_BY_CHARACTER = {
    kind: {
        new: 'Акулка знакомится 🦈', ok: 'Акулка довольна 💙', tense: 'Акулка насторожилась 🤔',
        angry: 'Акулка переживает 😟', proud: 'Акулка гордится! 🏆'
    },
    normal: MOOD_TITLES,
    strict: {
        new: 'Акулка требует данных', ok: 'Акулка в рамках', tense: 'Акулка предупреждает',
        angry: 'Акулка злится 🚫', proud: 'Акулка отмечает прогресс'
    }
};
const titleFor = (key, character) => (TITLES_BY_CHARACTER[character] || MOOD_TITLES)[key] || MOOD_TITLES[key];

// Дней подряд в лимите (по вчерашним и более ранним дням, до 30)
export function countStreakInLimit({ transactions = [], planner = null, limit, today = isoDay(), normalize } = {}) {
    if (!limit) return 0;
    let streak = 0;
    for (let i = 1; i <= 30; i++) {
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
        return { key: 'new', title: titleFor('new', character), text: pickText('new', {}, opts.storage, opts.today, character), ratio: 0, limit: 0 };
    }
    const ratio = spent / limit;
    let key = 'ok';
    if (ratio > angryAt) key = 'angry';
    else if (ratio > warnAt) key = 'tense';
    else if (streak >= 7 && ratio <= 1) key = 'proud';
    const left = Math.max(0, limit - spent);
    const over = Math.max(0, spent - limit);
    // «Добрая» при превышении лимита остаётся в «насторожилась», но говорит про перерасход
    const textKey = key === 'tense' && over > 0 ? 'tenseOver' : key;
    return {
        key, ratio, limit,
        title: titleFor(key, character),
        text: pickText(textKey, { left, over, days: streak }, opts.storage, opts.today, character)
    };
}

// ───────── реакции на сохранение (тосты) ─────────
const pick = list => list[Math.floor(Math.random() * list.length)];

const fillToast = tpl => (a, d = {}) => tpl.replace(/\{(\w+)\}/g, (m, k) => {
    if (k === 'sum') return fmt(a);
    if (k === 'date') return d.backdate;
    if (k === 'left' || k === 'over') return fmt(d[k]);
    return m;
});
const REACT = {};
for (const key of Object.keys(TOAST_TEXTS)) {
    if (key === 'limitCustom' || key === 'limitAuto') continue;
    REACT[key] = {};
    for (const ch of Object.keys(TOAST_TEXTS[key])) REACT[key][ch] = TOAST_TEXTS[key][ch].map(fillToast);
}

export const REACT_VARIANTS = REACT;
const forChar = (entry, character) => Array.isArray(entry) ? entry : (entry[character] || entry.normal || Object.values(entry)[0]);

// before/after — траты за сегодня (без плановых) до и после операции
function reactBase({ type, amount, before = 0, after = 0, limit = 0, character = 'normal', backdate = null, first = false }) {
    const [warnAt, angryAt] = getThresholds(character);
    const colors = { ok: 'var(--in)', warn: 'var(--debt)', bad: 'var(--out)', save: 'var(--save)', sys: 'var(--accent)' };
    const make = (entry, d = {}) => pick(forChar(entry, character))(amount, d);
    if (type === 'income') return { text: make(REACT.income), color: colors.ok, mood: 'ok' };
    if (type === 'deposit') return { text: make(REACT.deposit), color: colors.save, mood: 'proud' };
    if (type === 'debt') return { text: make(REACT.debt), color: colors.warn, mood: 'ok' };
    if (backdate) return { text: make(REACT.backdate, { backdate }), color: colors.sys, mood: 'ok' };
    if (first && type === 'expense') return { text: make(REACT.first), color: colors.sys, mood: 'ok' };
    if (!limit) return { text: make(REACT.noLimit), color: colors.sys, mood: 'ok' };
    if (after > limit * angryAt) {
        const d = { over: after - limit };
        return before > limit * angryAt
            ? { text: make(REACT.angryRepeat, d), color: colors.bad, mood: 'angry', repeat: true }
            : { text: make(REACT.angry, d), color: colors.bad, mood: 'angry' };
    }
    if (after > limit) return { text: make(REACT.over, { over: after - limit }), color: colors.warn, mood: 'tense' };
    if (before / limit < 0.9 && after / limit >= 0.9) return { text: make(REACT.ninety, { left: limit - after }), color: colors.warn, mood: 'tense' };
    if (before / limit < 0.5 && after / limit >= 0.5 && after / limit <= warnAt) return { text: make(REACT.half, { left: limit - after }), color: colors.ok, mood: 'ok' };
    if (after / limit > warnAt) return { text: make(REACT.warn, { left: limit - after }), color: colors.warn, mood: 'tense' };
    return { text: make(REACT.ok, { left: limit - after }), color: colors.ok, mood: 'ok' };
}

// Тихие часы: после 23:00 и до 6:00 без анимации и вибрации
export function isQuietNow(settings, now = new Date()) {
    if (!settings?.quietHours) return false;
    const h = now.getHours();
    return h >= 23 || h < 6;
}

// Тост после сохранения лимита
const compileLimit = list => list.map(t => l => t.replace('{limit}', fmt(l)));
const LIMIT_SET = { custom: {}, auto: {} };
for (const ch of Object.keys(TOAST_TEXTS.limitCustom)) {
    LIMIT_SET.custom[ch] = compileLimit(TOAST_TEXTS.limitCustom[ch]);
    LIMIT_SET.auto[ch] = TOAST_TEXTS.limitAuto[ch].map(t => () => t);
}
export function limitSetText(character, mode, limit) {
    const entry = LIMIT_SET[mode === 'custom' ? 'custom' : 'auto'];
    return pick(forChar(entry, character))(limit);
}

// Обёртка: в режимах «Обычная» и «Болтушка» иногда вместо спокойной реакции выпадает редкая реплика,
// а у «Болтушки» к реакции добавляется короткий хвостик. talk по умолчанию 'quiet' — без добавок.
export function reactToSave(args) {
    const r = reactBase(args);
    const talk = args.talk || 'quiet';
    if (talk === 'quiet' || !r || args.first || args.backdate) return r;
    const ch = FLAVOR.rare[args.character] ? args.character : 'normal';
    const calm = r.mood === 'ok' || r.mood === 'proud';
    if (calm && Math.random() < (talk === 'chatty' ? 1 / 12 : 1 / 30)) return { ...r, text: pick(FLAVOR.rare[ch]) };
    if (talk === 'chatty' && calm && Math.random() < 0.5) return { ...r, text: `${r.text} ${pick(FLAVOR.tail[ch])}` };
    return r;
}
