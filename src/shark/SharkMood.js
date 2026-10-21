// ===============================
//   SharkMood.js — настроение и реакции Акулки
//   Чистая логика без DOM (кроме localStorage), чтобы её можно было тестировать.
//   Формулы перенесены из прототипа дизайна (react / planCalc / thr).
// ===============================

import { MOOD_TEXTS, TOAST_TEXTS, FLAVOR } from './texts/index.js';
import { EMOTION_TEXTS, EMOTION_TITLES } from './texts/emotion.js';
import { RUDE_TEXTS, RUDE_TITLES } from './texts/rude.js';
import { LIVE_TEXTS, EMOTION_MORE } from './texts/live.js';
import { LIVE_MORE } from './texts/live2.js';

export const LIMIT_MODES = ['auto', 'median', 'plan', 'custom'];

// ───────── привязка к бюджету ─────────
// Лимит и его режим, цель, челлендж, значки и события хранятся отдельно для каждого бюджета.
// Приложение регистрирует провайдер { id, first } текущего бюджета; без него (тесты) ключи обычные.
let scopeProvider = null;
export function setSharkScopeProvider(fn) { scopeProvider = typeof fn === 'function' ? fn : null; }
export function sharkScope() {
    try { return scopeProvider ? (scopeProvider() || null) : null; } catch (e) { return null; }
}
const scopedKey = base => { const s = sharkScope(); return s?.id ? `${base}:${s.id}` : base; };
// Данные, сохранённые до разделения по бюджетам, достаются первому бюджету
export function readScoped(base, storage = globalThis.localStorage) {
    try {
        const s = sharkScope();
        let v = storage?.getItem(scopedKey(base));
        if (v == null && (!s?.id || s.first)) v = storage?.getItem(base);
        return v ?? null;
    } catch (e) { return null; }
}
export function writeScoped(base, value, storage = globalThis.localStorage) {
    try {
        const s = sharkScope();
        // «удалено» пишем как null: иначе старые общие данные вернулись бы в первый бюджет
        if (value == null) { if (s?.id) storage?.setItem(scopedKey(base), 'null'); else storage?.removeItem(base); }
        else storage?.setItem(scopedKey(base), typeof value === 'string' ? value : JSON.stringify(value));
    } catch (e) { /* ignore */ }
}
const LIMIT_KEY = 'budgetit:shark:limit';
export const SHARK_SETTINGS_KEY = 'budgetit:shark';
const TEXT_HISTORY_KEY = 'budgetit:shark:texts';

// [порог «насторожилась», порог «злится»] как доля дневного лимита
export const CHARACTER_THRESHOLDS = {
    kind  : [0.9, 99],
    normal: [0.8, 1],
    strict: [0.7, 1]
};

export const CHARACTER_LABELS = { kind: 'Добрая', normal: 'Обычная', strict: 'Строгая' };

// ───────── какая Акулка ─────────
// hoodie — «Акулка» (основная, 27 эмоций), classic — «Акул» (прежняя, 5 картинок настроений).
export const SHARK_IDS = ['hoodie', 'classic'];
export const SHARK_NAMES = { hoodie: 'Акулка', classic: 'Акул' };

// Картинки classic под настроение (ok и new — базовая)
export const MOOD_IMAGES = {
    new  : 'assets/shark.png',
    ok   : 'assets/shark.png',
    tense: 'assets/wary-shark.png',
    angry: 'assets/angry-shark.png',
    proud: 'assets/proud-shark.png'
};

// Эмоции hoodie = имена файлов assets/hoodie/hoodie-<эмоция>.webp
export const HOODIE_EMOTIONS = [
    'smile', 'calm', 'welcome', 'laugh', 'proud', 'count-happy', 'count-cold', 'blank', 'think', 'stern-smile', 'bored',
    'shock', 'angry', 'fist', 'grim-fist', 'cheeky', 'gopnik', 'rage-squat', 'rage-flip-serious', 'rage-flip-stand',
    'smart', 'idea', 'broke', 'sympathy', 'celebrate', 'sleep', 'tired'
];
export const RUDE_EMOTIONS = ['rage-flip-serious', 'rage-flip-stand'];   // «очень сильно злится» (rage-squat — ещё выше)
const HOODIE_DIR = 'assets/hoodie/hoodie-';

// Настроение → эмоция hoodie по умолчанию
export const MOOD_TO_EMOTION = { new: 'welcome', ok: 'smile', tense: 'stern-smile', angry: 'angry', proud: 'proud' };
// Эмоция → ближайшее настроение (для classic, у которой картинок меньше)
export const EMOTION_TO_MOOD = {
    welcome: 'new', smile: 'ok', calm: 'ok', laugh: 'ok', 'count-happy': 'ok', 'count-cold': 'ok', blank: 'ok', think: 'ok',
    bored: 'ok', smart: 'ok', idea: 'ok', sleep: 'ok', tired: 'ok', cheeky: 'ok', gopnik: 'ok',
    'stern-smile': 'tense', broke: 'tense', sympathy: 'tense',
    angry: 'angry', shock: 'angry', fist: 'angry', 'grim-fist': 'angry', 'rage-squat': 'angry', 'rage-flip-serious': 'angry', 'rage-flip-stand': 'angry',
    proud: 'proud', celebrate: 'proud'
};

export function currentShark(storage = globalThis.localStorage) {
    try { return getSharkSettings(storage).shark; } catch (e) { return 'hoodie'; }
}


// ───────── «Акул» (classic) говорит в мужском роде ─────────
// Тексты написаны от лица Акулки; для classic склоняем только то, что точно относится к самой акуле:
// её имя и глаголы/прилагательные о себе. Слова, которые могут относиться к другому подлежащему («неделя стала…»), не трогаем.
const FEM_SELF = {"записала": "записал", "учла": "учёл", "посчитала": "посчитал", "сохранила": "сохранил", "внесла": "внёс", "нашла": "нашёл", "добавила": "добавил", "поняла": "понял", "отметила": "отметил", "запомнила": "запомнил", "разобрала": "разобрал", "проверила": "проверил", "заглянула": "заглянул", "заметила": "заметил", "сказала": "сказал", "подвела": "подвел", "зафиксировала": "зафиксировал", "занесла": "занёс", "предупреждала": "предупреждал", "скучала": "скучал", "поймала": "поймал", "дополнила": "дополнил", "исправила": "исправил", "спросила": "спросил", "прикинула": "прикинул", "сравнила": "сравнил", "порадовала": "порадовал", "приняла": "принял", "заскучала": "заскучал", "обняла": "обнял", "включила": "включил", "ждала": "ждал", "умела": "умел", "пересчитала": "пересчитал", "прибавила": "прибавил", "достала": "достал", "пробовала": "пробовал", "пыталась": "пытался", "улыбнулась": "улыбнулся", "выучила": "выучил", "съела": "съел", "приплыла": "приплыл", "открыла": "открыл", "вписала": "вписал", "предупредила": "предупредил", "попала": "попал", "поставила": "поставил", "соскучилась": "соскучился", "сжала": "сжал", "заработала": "заработал", "запуталась": "запутался", "уловила": "уловил", "вычла": "вычел", "расшифровала": "расшифровал", "старалась": "старался", "прочитала": "прочитал", "настроилась": "настроился", "забрала": "забрал", "обрадовалась": "обрадовался", "спрогнозировала": "спрогнозировал", "построила": "построил", "хотела": "хотел", "тратила": "тратил", "уточнила": "уточнил", "подметила": "подметил", "насчитала": "насчитал", "объяснила": "объяснил", "собрала": "собрал", "устроилась": "устроился", "подсчитала": "подсчитал", "оставила": "оставил", "полежала": "полежал", "замёрзла": "замёрз", "проверяла": "проверял", "перепутала": "перепутал", "решила": "решил", "поздоровалась": "поздоровался", "встречала": "встречал", "попыталась": "попытался", "думала": "думал", "видела": "видел", "прилипала": "прилипал", "присосалась": "присосался", "аплодировала": "аплодировал", "услышала": "услышал", "поспорила": "поспорил", "проиграла": "проиграл", "обиделась": "обиделся", "ответила": "ответил", "почувствовала": "почувствовал", "запустила": "запустил", "схватила": "схватил", "занырнула": "занырнул", "прокомментировала": "прокомментировал", "насторожилась": "насторожился", "надулась": "надулся", "забеспокоилась": "забеспокоился", "вспомнила": "вспомнил", "нарисовала": "нарисовал", "постаралась": "постарался", "приготовила": "приготовил", "накопила": "накопил", "вывела": "вывел", "помахала": "помахал", "вздохнула": "вздохнул", "нырнула": "нырнул", "обновила": "обновил", "дописала": "дописал", "перенесла": "перенёс", "переключила": "переключил", "вернула": "вернул", "считала": "считал", "берегла": "берёг", "красила": "красил", "тренировала": "тренировал", "выбила": "выбил", "удивилась": "удивился", "устроила": "устроил", "мурлыкала": "мурлыкал", "успела": "успел", "нахмурилась": "нахмурился", "говорила": "говорил", "согрела": "согрел", "прижала": "прижал", "испекла": "испёк", "загордилась": "загордился", "расстроилась": "расстроился", "проснулась": "проснулся", "подумала": "подумал", "узнала": "узнал", "увидела": "увидел", "могла": "могл", "легла": "лёг", "вошла": "вошёл", "принесла": "принёс", "рада": "рад", "готова": "готов", "довольна": "доволен", "недовольна": "недоволен", "счастлива": "счастлив", "удивлена": "удивлён", "уверена": "уверен", "впечатлена": "впечатлён", "огорчена": "огорчён", "вдохновлена": "вдохновлён", "влюблена": "влюблён", "неласкова": "неласков", "горда": "горд"};
const SELF_RE = new RegExp('(?<![А-Яа-яЁё])(' + Object.keys(FEM_SELF).join('|') + ')(?![А-Яа-яЁё])', 'gi');
const NAME_FORMS = [[/Акулк(а|у|и|е|ой)(?![а-яё])/g, (m, e) => ({ а: 'Акул', у: 'Акула', и: 'Акула', е: 'Акулу', ой: 'Акулом' }[e])]];

export function masculine(text) {
    let out = String(text ?? '');
    out = out.replace(SELF_RE, w => {
        const base = FEM_SELF[w.toLowerCase()];
        return w[0] === w[0].toUpperCase() ? base[0].toUpperCase() + base.slice(1) : base;
    });
    for (const [re, fn] of NAME_FORMS) out = out.replace(re, fn);
    return out;
}
// Текст для выбранной Акулки: у «Акулки» без изменений, у «Акула» в мужском роде
export function forShark(text, sharkId = null) {
    const id = SHARK_IDS.includes(sharkId) ? sharkId : currentShark();
    return id === 'classic' ? masculine(text) : text;
}

// key — настроение (new/ok/tense/angry/proud) или эмоция hoodie
export function sharkImage(key, sharkId = null) {
    const id = SHARK_IDS.includes(sharkId) ? sharkId : currentShark();
    if (id === 'classic') {
        const mood = MOOD_IMAGES[key] ? key : (EMOTION_TO_MOOD[key] || 'ok');
        return MOOD_IMAGES[mood];
    }
    const emo = MOOD_TO_EMOTION[key] || (HOODIE_EMOTIONS.includes(key) ? key : 'smile');
    return `${HOODIE_DIR}${emo}.webp`;
}

const DEFAULTS = {
    character: 'normal', reactions: true, vibration: true, quietHours: true, dailyTip: true,
    talk: 'normal',      // болтливость: 'quiet' | 'normal' | 'chatty'
    shark: 'hoodie',     // какая Акулка: 'hoodie' («Акулка») | 'classic' («Акул»)
    rude: false,         // «Дерзкая»: грубые жесты при сильном перерасходе (только по желанию)
    limitMode: 'auto',   // 'auto' — план, а без плана медиана; 'median' — только медиана; 'plan' — только действующий план; 'custom' — своя сумма
    customLimit: 0
};

export function getSharkSettings(storage = globalThis.localStorage) {
    try {
        const raw = JSON.parse(storage?.getItem(SHARK_SETTINGS_KEY) || '{}');
        const s = { ...DEFAULTS, ...raw };
        if (!CHARACTER_THRESHOLDS[s.character]) s.character = 'normal';
        if (!SHARK_IDS.includes(s.shark)) s.shark = 'hoodie';
        s.rude = s.rude === true;
        // болтливость по умолчанию: «Акулка» болтает больше, «Акул» — обычно
        if (raw.talk === undefined) s.talk = s.shark === 'classic' ? 'normal' : 'chatty';
        if (!LIMIT_MODES.includes(s.limitMode)) s.limitMode = 'auto';
        if (!['quiet', 'normal', 'chatty'].includes(s.talk)) s.talk = 'normal';
        // режим лимита и свой лимит — отдельно для каждого бюджета (пока не заданы, действуют общие)
        if (sharkScope()?.id) {
            try {
                const own = JSON.parse(storage?.getItem(scopedKey(LIMIT_KEY)) || 'null');
                if (own && typeof own === 'object') {
                    if (LIMIT_MODES.includes(own.limitMode)) s.limitMode = own.limitMode;
                    if (own.customLimit !== undefined) s.customLimit = own.customLimit;
                }
            } catch (e) { /* ignore */ }
        }
        s.customLimit = Math.max(0, Math.round(Number(s.customLimit) || 0));
        return s;
    } catch (e) {
        return { ...DEFAULTS };
    }
}

export function saveSharkSettings(patch, storage = globalThis.localStorage) {
    const next = { ...getSharkSettings(storage), ...patch };
    const perBudget = sharkScope()?.id && ('limitMode' in patch || 'customLimit' in patch);
    try {
        if (perBudget) {
            storage?.setItem(scopedKey(LIMIT_KEY), JSON.stringify({ limitMode: next.limitMode, customLimit: next.customLimit }));
        }
        // общие настройки: без режима лимита бюджета, чтобы он не просачивался в другие бюджеты
        const { limitMode, customLimit } = next;
        let toSave = next;
        if (perBudget) {
            const raw = JSON.parse(storage?.getItem(SHARK_SETTINGS_KEY) || '{}');
            toSave = { ...next, limitMode: raw.limitMode ?? DEFAULTS.limitMode, customLimit: raw.customLimit ?? DEFAULTS.customLimit };
        }
        storage?.setItem(SHARK_SETTINGS_KEY, JSON.stringify(toSave));
    } catch (e) { /* ignore */ }
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
const planEnd = p => p.endDate || p.startDate;

// Статус планов текущего бюджета относительно сегодняшнего дня:
// active — идёт сейчас; upcoming — ещё не начался; ended — уже завершён; none — планов нет.
export function planStatus(planners = [], budgetId, today = isoDay()) {
    const mine = planners.filter(p => p && !p.archived && p.startDate && (!budgetId || p.budgetId === budgetId));
    const active = mine.filter(p => p.startDate <= today && today <= planEnd(p))
        .sort((a, b) => (b.startDate > a.startDate ? 1 : -1))[0];
    if (active) return { state: 'active', planner: active };
    const upcoming = mine.filter(p => p.startDate > today).sort((a, b) => (a.startDate > b.startDate ? 1 : -1))[0];
    if (upcoming) return { state: 'upcoming', planner: upcoming };
    const ended = mine.filter(p => planEnd(p) < today).sort((a, b) => (planEnd(b) > planEnd(a) ? 1 : -1))[0];
    if (ended) return { state: 'ended', planner: ended };
    return { state: 'none', planner: null };
}

// Активный план: план текущего бюджета, в период которого попадает сегодня.
// Завершённые и ещё не начавшиеся планы в расчёте не участвуют.
export function findActivePlanner(planners = [], budgetId, today = isoDay()) {
    const st = planStatus(planners, budgetId, today);
    return st.state === 'active' ? st.planner : null;
}

// План действует сегодня? (у планов без дат проверка пропускается)
const planIsActive = (planner, today) =>
    !!planner && !planner.archived && (!planner.startDate || (planner.startDate <= today && today <= planEnd(planner)));

// Лимит по плану: «Средний лимит в день» самого плана месяца (остаток бюджета плана ÷ оставшиеся дни),
// тот же, что показан на странице плана. Его считает PlannerManager, сюда он приходит как planLimit.
// source: 'plan' | 'noplan' (нет действующего плана) | 'plan-empty' (по плану на оставшиеся дни ничего не остаётся)
export function getPlanLimit({ planner = null, today = isoDay(), planLimit = 0, planWaiting = false } = {}) {
    if (!planIsActive(planner, today)) return { limit: 0, source: 'noplan' };
    const v = Math.floor(Number(planLimit) || 0);
    if (v > 0) return { limit: v, source: 'plan' };
    // поступление «по факту» ещё не пришло: плану не на что опираться, это не «ничего не остаётся»
    return { limit: 0, source: 'plan-empty', waiting: !!planWaiting };
}

// Средний дневной лимит плана из менеджера планов (0, если посчитать не удалось).
export function planAverageLimit(plannerManager, planner) {
    try {
        const s = plannerManager?.calculatePlannerProjection?.(planner?.id)?.summary;
        return Math.max(0, Math.floor(Number(s?.dailyLimit) || 0));
    } catch (e) { return 0; }
}

// План с поступлением «по факту», а денег по нему ещё нет — Акулка «ждёт поступление»
export function planIncomeWaiting(plannerManager, planner) {
    try {
        const s = plannerManager?.calculatePlannerProjection?.(planner?.id)?.summary;
        return !!s?.incomeByFact && !(Number(s?.incomeReceived) > 0);
    } catch (e) { return false; }
}

// Лимит по медиане: типичный день за последние 30 дней.
// Считается теми же «дневными» тратами, что и расход дня (без плановых «Основных» и «Регулярных» категорий),
// дни без трат не считаются, разовые покупки > 3× медианы отбрасываются.
export function getMedianLimit({ transactions = [], planner = null, today = isoDay(), normalize } = {}) {
    const from = shiftDay(today, -30);
    const days = new Set();
    for (const t of transactions) {
        if (t.type === 'expense' && t.date && t.date >= from && t.date < today) days.add(t.date);
    }
    const sums = [];
    for (const day of days) {
        const v = getSpentOnDay({ transactions, planner: planIsActive(planner, today) ? planner : null, day, normalize });
        if (v > 0) sums.push(v);
    }
    if (sums.length < 3) return { limit: 0, source: 'none', days: sums.length };
    const med = median(sums);
    const regular = sums.filter(v => v <= med * 3);
    return { limit: Math.round(median(regular.length ? regular : sums)), source: 'median', days: sums.length };
}

// «Авто»: действующий план, а если плана нет (или по нему ничего не остаётся) — медиана.
export function getDailyLimit({ transactions = [], planner = null, today = isoDay(), normalize, planLimit = 0 } = {}) {
    const plan = getPlanLimit({ planner, today, planLimit });
    if (plan.source === 'plan') return plan;
    return getMedianLimit({ transactions, planner, today, normalize });
}

// Итоговый лимит с учётом режима из настроек.
// mode: 'auto' | 'median' | 'plan' | 'custom'.
// source: 'custom' | 'plan' | 'median' | 'none' | 'noplan' | 'plan-empty'; auto — что насчитала бы сама Акулка;
// plan / median — значения по каждому способу (для сравнения в шторке).
export function getLimitInfo({ transactions = [], planner = null, today = isoDay(), settings = null, normalize, planLimit = 0, planWaiting = false } = {}) {
    const plan = getPlanLimit({ planner, today, planLimit, planWaiting });
    const med = getMedianLimit({ transactions, planner, today, normalize });
    const auto = plan.source === 'plan' ? plan : med;
    const base = { auto, plan, median: med };
    const mode = settings?.limitMode;
    const custom = Math.round(Number(settings?.customLimit) || 0);
    if (mode === 'custom' && custom > 0) return { limit: custom, source: 'custom', ...base };
    if (mode === 'median') return { ...med, ...base };
    if (mode === 'plan') return { ...plan, ...base };
    return { ...auto, ...base };
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
const fillMood = tpl => (v = {}) => tpl.replace(/\{(left|over|days|spent|limit)\}/g, (m, k) => k === 'days' ? v.days : fmt(v[k]));
const TEXTS = {};
for (const key of Object.keys(MOOD_TEXTS)) {
    TEXTS[key] = {};
    for (const ch of Object.keys(MOOD_TEXTS[key])) TEXTS[key][ch] = MOOD_TEXTS[key][ch].map(fillMood);
}

// Тексты «особых» эмоций карточки: сон, утро, скука, шок, праздник
for (const key of Object.keys(EMOTION_TEXTS)) {
    TEXTS[key] = {};
    for (const ch of Object.keys(EMOTION_TEXTS[key])) TEXTS[key][ch] = EMOTION_TEXTS[key][ch].map(fillMood);
}

// Дополнительные реплики к особым эмоциям и «живые» реплики под остальные эмоции (Акулка в худи)
for (const key of Object.keys(EMOTION_MORE)) {
    for (const ch of Object.keys(EMOTION_MORE[key])) TEXTS[key][ch] = [...(TEXTS[key][ch] || []), ...EMOTION_MORE[key][ch].map(fillMood)];
}
for (const key of Object.keys(LIVE_TEXTS)) {
    TEXTS[`live:${key}`] = {};
    for (const ch of Object.keys(LIVE_TEXTS[key])) {
        TEXTS[`live:${key}`][ch] = [...LIVE_TEXTS[key][ch], ...(LIVE_MORE[key]?.[ch] || [])].map(fillMood);
    }
}

// «Дерзкая» (18+): отдельные наборы под каждую эмоцию, плоские списки без деления по характеру
for (const key of Object.keys(RUDE_TEXTS)) TEXTS[`rude:${key}`] = RUDE_TEXTS[key].map(fillMood);

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
        // как и в «днях в лимите» (звание): день считается только по записям о тратах, одни доходы серию не продолжают
        const any = transactions.some(t => t.type === 'expense' && t.date === day);
        if (!any) break; // день без трат серию не продолжает
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

// ───────── эмоция Акулки (какая картинка и особый текст) ─────────
const daySeed = (today, n) => {
    let h = 0; for (const ch of String(today)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h % n;
};

// Возвращает { emotion, textKey }: textKey — ключ особого текста (sleep/tired/bored/shock/celebrate) или null.
export function emotionFor({ mood = 'ok', ratio = 0, character = 'normal', streak = 0, hasData = true, hasToday = false,
    spent = 0, hour = 12, quietHours = true, rude = false, source = null, today = '' } = {}) {
    if (!hasData || mood === 'new') return { emotion: source === 'noplan' || source === 'plan-empty' ? 'think' : 'welcome', textKey: null };
    if (source === 'plan-empty') return { emotion: 'broke', textKey: null };   // по плану ничего не остаётся
    if (mood === 'angry') {
        // «Дерзкая»: чем сильнее перерасход, тем грубее жест (гопник → стойка/«серьёзно» → присед)
        if (rude && ratio >= 3) return { emotion: 'rage-squat', textKey: 'shock' };
        if (rude && ratio >= 2) return { emotion: RUDE_EMOTIONS[daySeed(today, RUDE_EMOTIONS.length)], textKey: 'shock' };
        if (rude && ratio >= 1.3) return { emotion: 'gopnik', textKey: ratio >= 1.6 ? 'shock' : null };
        if (ratio >= 1.6) return { emotion: 'shock', textKey: 'shock' };
        // злится: кулак при заметном перерасходе (у строгой — сразу), совсем слегка — обычная злая
        return { emotion: character === 'strict' || ratio > 1.2 ? 'fist' : 'angry', textKey: null };
    }
    if (mood === 'tense') {
        if (ratio >= 1.6) return { emotion: 'shock', textKey: 'shock' };   // «добрая» не злится, но в шоке от большого перерасхода
        if (character === 'strict' && ratio > 1) return { emotion: 'fist', textKey: null };   // строгая сжимает кулак уже на первом перерасходе
        return { emotion: character === 'kind' && ratio > 1 ? 'sympathy' : 'stern-smile', textKey: null };
    }
    if (mood === 'proud') return streak >= 30 ? { emotion: 'celebrate', textKey: 'celebrate' } : { emotion: 'proud', textKey: null };
    // ok
    if (quietHours && (hour >= 23 || hour < 4)) return { emotion: 'sleep', textKey: 'sleep' };
    if (hour >= 4 && hour < 8 && !hasToday) return { emotion: 'tired', textKey: 'tired' };
    if (!hasToday && spent === 0 && hour >= 19) return { emotion: 'bored', textKey: 'bored' };
    if (spent > 0 && ratio < 0.5) return { emotion: 'calm', textKey: null };
    return { emotion: 'smile', textKey: null };
}

// Настроение + эмоция: заголовок и текст подменяются на особые, когда у эмоции есть свои тексты
export function computeCard(args, opts = {}) {
    const m = computeMood(args, opts);
    const now = opts.now || new Date();
    const character = args.character || 'normal';
    const e = emotionFor({
        mood: m.key, ratio: m.ratio, character, streak: args.streak || 0, hasData: args.hasData !== false,
        hasToday: !!args.hasToday, spent: args.spent || 0, hour: now.getHours(), quietHours: args.quietHours !== false,
        rude: !!args.rude, source: args.source || null, today: opts.today || isoDay(now)
    });
    let { title, text } = m;
    if (e.textKey && TEXTS[e.textKey]) {
        const left = Math.max(0, (args.limit || 0) - (args.spent || 0));
        const over = Math.max(0, (args.spent || 0) - (args.limit || 0));
        title = EMOTION_TITLES[e.textKey]?.[character] || EMOTION_TITLES[e.textKey]?.normal || title;
        text = pickText(e.textKey, { left, over, days: args.streak || 0, spent: args.spent || 0, limit: args.limit || 0 }, opts.storage, opts.today, character);
    }
    // «Живая» реплика: у Акулки в худи часть карточек говорит не из общего набора, а из набора своей эмоции
    // (и по времени суток); доля подобрана так, чтобы общий набор тоже оставался в ходу.
    const sharkId = opts.shark || currentShark();
    if (!e.textKey && sharkId === 'hoodie' && opts.live !== false && m.key !== 'new') {
        const hour = now.getHours();
        const tod = hour < 11 ? 'morning' : hour < 17 ? 'day' : 'evening';
        const rnd = opts.random || Math.random;
        const todKey = `live:${e.emotion}@${tod}`;
        let liveKey = TEXTS[`live:${e.emotion}`] ? `live:${e.emotion}` : null;
        if (TEXTS[todKey] && (hour >= 5 && hour < 23) && rnd() < 0.5) liveKey = todKey;
        if (liveKey && rnd() < 0.7) {
            const left = Math.max(0, (args.limit || 0) - (args.spent || 0));
            const over = Math.max(0, (args.spent || 0) - (args.limit || 0));
            text = pickText(liveKey, { left, over, days: args.streak || 0, spent: args.spent || 0, limit: args.limit || 0 }, opts.storage, opts.today, character);
        }
    }
    // «Дерзкая»: только у Акулки в худи и только если пользователь включил режим сам
    if (args.rude && sharkId === 'hoodie' && m.key !== 'new' && TEXTS[`rude:${e.emotion}`] && (opts.random || Math.random)() < 0.85) {
        const left = Math.max(0, (args.limit || 0) - (args.spent || 0));
        const over = Math.max(0, (args.spent || 0) - (args.limit || 0));
        text = pickText(`rude:${e.emotion}`, { left, over, days: args.streak || 0, spent: args.spent || 0, limit: args.limit || 0 }, opts.storage, opts.today, character);
        const ts = RUDE_TITLES[e.emotion];
        if (ts) title = ts[daySeed(opts.today || isoDay(now), ts.length)];
    }
    return { ...m, emotion: e.emotion, title, text };
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
    if (type === 'income') return { text: make(REACT.income), color: colors.ok, mood: 'ok', emotion: 'count-happy' };
    if (type === 'deposit') return { text: make(REACT.deposit), color: colors.save, mood: 'proud', emotion: 'proud' };
    if (type === 'debt') return { text: make(REACT.debt), color: colors.warn, mood: 'ok', emotion: 'think' };
    if (backdate) return { text: make(REACT.backdate, { backdate }), color: colors.sys, mood: 'ok', emotion: 'think' };
    if (first && type === 'expense') return { text: make(REACT.first), color: colors.sys, mood: 'ok', emotion: 'welcome' };
    if (!limit) return { text: make(REACT.noLimit), color: colors.sys, mood: 'ok', emotion: 'blank' };
    if (after > limit * angryAt) {
        const d = { over: after - limit };
        const big = after >= limit * 1.6;
        return before > limit * angryAt
            ? { text: make(REACT.angryRepeat, d), color: colors.bad, mood: 'angry', repeat: true, emotion: character === 'strict' ? 'grim-fist' : 'angry' }
            : { text: make(REACT.angry, d), color: colors.bad, mood: 'angry', emotion: big ? 'shock' : character === 'strict' ? 'fist' : 'angry' };
    }
    if (after > limit) return { text: make(REACT.over, { over: after - limit }), color: colors.warn, mood: 'tense', emotion: character === 'kind' ? 'sympathy' : 'stern-smile' };
    if (before / limit < 0.9 && after / limit >= 0.9) return { text: make(REACT.ninety, { left: limit - after }), color: colors.warn, mood: 'tense', emotion: 'stern-smile' };
    if (before / limit < 0.5 && after / limit >= 0.5 && after / limit <= warnAt) return { text: make(REACT.half, { left: limit - after }), color: colors.ok, mood: 'ok', emotion: 'calm' };
    if (after / limit > warnAt) return { text: make(REACT.warn, { left: limit - after }), color: colors.warn, mood: 'tense', emotion: 'stern-smile' };
    return { text: make(REACT.ok, { left: limit - after }), color: colors.ok, mood: 'ok', emotion: after / limit < 0.5 ? 'calm' : 'smile' };
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
// «Дерзкая»: тост после операции говорит грубее (только по желанию и если Акулка не «тихая»)
function rudeToast(r, args) {
    const key = r && r.emotion && `rude:${r.emotion}`;
    if (!args.rude || !key || !TEXTS[key] || args.talk === 'quiet' || args.first || args.backdate || Math.random() >= 0.85) return r;
    const over = Math.max(0, (args.after || 0) - (args.limit || 0));
    const left = Math.max(0, (args.limit || 0) - (args.after || 0));
    return { ...r, text: pickText(key, { left, over, spent: args.after || 0, limit: args.limit || 0, days: 0 }, args.storage, args.today) };
}

export function reactToSave(args) {
    return rudeToast(reactToSaveBase(args), args);
}

function reactToSaveBase(args) {
    const r = reactBase(args);
    const talk = args.talk || 'quiet';
    if (talk === 'quiet' || !r || args.first || args.backdate) return r;
    const ch = FLAVOR.rare[args.character] ? args.character : 'normal';
    const calm = r.mood === 'ok' || r.mood === 'proud';
    if (calm && Math.random() < (talk === 'chatty' ? 1 / 12 : 1 / 30)) return { ...r, text: pick(FLAVOR.rare[ch]), emotion: Math.random() < 0.5 ? 'laugh' : 'cheeky' };
    if (talk === 'chatty' && calm && Math.random() < 0.5) return { ...r, text: `${r.text} ${pick(FLAVOR.tail[ch])}` };
    return r;
}
