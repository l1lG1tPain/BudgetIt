// ===============================
//   reminderSettings.js — настройки и состояние напоминаний
//   Настройки интерфейса (не данные пользователя): отдельные ключи localStorage,
//   основное состояние бюджета не трогаем.
//   Даты — строки YYYY-MM-DD по местному времени, без UTC.
// ===============================

export const REMINDER_SETTINGS_KEY = 'budgetit:reminders';
export const REMINDER_STATE_KEY = 'budgetit:reminders:state';

export const REMINDER_TYPES = ['evening', 'gap', 'planner', 'deposit', 'weekly', 'monthly'];
export const IGNORED_LIMIT = 7;   // столько уведомлений подряд без открытия приложения — и Акулка затихает

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const REMINDER_DEFAULTS = {
    enabled: false,
    eveningTime: '21:00',
    quietHours: true,   // тихие часы 23:00–08:00
    types: { evening: true, gap: true, planner: true, deposit: true, weekly: true, monthly: true }
};

export const REMINDER_STATE_DEFAULTS = {
    shown: {},            // { 'YYYY-MM-DD': ['morning', 'evening'] } — что уже показано по дням (хранятся последние дни)
    lastShownAt: 0,       // мс, когда показали последнее уведомление
    lastActiveAt: 0,      // мс, когда пользователь последний раз открывал приложение
    ignored: 0,           // сколько уведомлений подряд остались без открытия приложения
    paused: false,        // Акулка затихла после IGNORED_LIMIT игнорирований
    gapSent: 0,           // сколько напоминаний о пропуске отправлено без новых записей
    lastGapDay: '',       // когда последний раз напоминали о пропуске
    weekly: '',           // для какого понедельника уже отправлен недельный итог
    monthly: ''           // для какого месяца (YYYY-MM) уже отправлен месячный итог
};

export function toMinutes(hhmm) {
    const m = TIME_RE.exec(String(hhmm || ''));
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function normalizeReminderSettings(raw = {}) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const types = { ...REMINDER_DEFAULTS.types };
    for (const k of REMINDER_TYPES) {
        if (typeof src.types?.[k] === 'boolean') types[k] = src.types[k];
    }
    let eveningTime = TIME_RE.test(String(src.eveningTime || '')) ? src.eveningTime : REMINDER_DEFAULTS.eveningTime;
    // итог дня не позже 22:30 (дальше тихие часы) и не раньше 18:00
    const mins = toMinutes(eveningTime);
    if (mins < 18 * 60) eveningTime = '18:00';
    if (mins > 22 * 60 + 30) eveningTime = '22:30';
    return {
        enabled: src.enabled === true,
        eveningTime,
        quietHours: src.quietHours !== false,
        types
    };
}

export function normalizeReminderState(raw = {}) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const num = v => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
    const shown = {};
    if (src.shown && typeof src.shown === 'object') {
        for (const [day, slots] of Object.entries(src.shown)) {
            if (/^\d{4}-\d{2}-\d{2}$/.test(day) && Array.isArray(slots)) {
                shown[day] = slots.filter(s => s === 'morning' || s === 'evening');
            }
        }
    }
    return {
        shown,
        lastShownAt: num(src.lastShownAt),
        lastActiveAt: num(src.lastActiveAt),
        ignored: Math.floor(num(src.ignored)),
        paused: src.paused === true,
        gapSent: Math.floor(num(src.gapSent)),
        lastGapDay: /^\d{4}-\d{2}-\d{2}$/.test(String(src.lastGapDay || '')) ? src.lastGapDay : '',
        weekly: /^\d{4}-\d{2}-\d{2}$/.test(String(src.weekly || '')) ? src.weekly : '',
        monthly: /^\d{4}-\d{2}$/.test(String(src.monthly || '')) ? src.monthly : ''
    };
}

function read(key, storage) {
    try { return JSON.parse(storage?.getItem(key) || '{}'); } catch { return {}; }
}
function write(key, value, storage) {
    try { storage?.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

export function getReminderSettings(storage = globalThis.localStorage) {
    return normalizeReminderSettings(read(REMINDER_SETTINGS_KEY, storage));
}

export function saveReminderSettings(patch = {}, storage = globalThis.localStorage) {
    const cur = getReminderSettings(storage);
    const next = normalizeReminderSettings({
        ...cur, ...patch,
        types: { ...cur.types, ...(patch.types || {}) }
    });
    write(REMINDER_SETTINGS_KEY, next, storage);
    return next;
}

export function getReminderState(storage = globalThis.localStorage) {
    return normalizeReminderState(read(REMINDER_STATE_KEY, storage));
}

export function saveReminderState(state, storage = globalThis.localStorage) {
    const next = normalizeReminderState(state);
    // храним только последние 7 дней, чтобы ключ не рос
    const days = Object.keys(next.shown).sort().slice(-7);
    next.shown = Object.fromEntries(days.map(d => [d, next.shown[d]]));
    write(REMINDER_STATE_KEY, next, storage);
    return next;
}
