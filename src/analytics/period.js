// ===============================
//   period.js — единое состояние периода аналитики (без DOM)
//   Период = набор календарных месяцев (ключи 'YYYY-MM') либо «всё время».
//   Им пользуются: сегмент «Месяц / 3 мес / Год», шторка «Период», первый график и все расчёты.
// ===============================
export const MONTHS_FULL = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
export const MONTHS_SHORT = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];

const pad = n => String(n).padStart(2, '0');
const KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export const ymKey = (y, m) => `${y}-${pad(m)}`;
export const isKey = k => typeof k === 'string' && KEY_RE.test(k);
export const keyYear = k => Number(k.slice(0, 4));
export const keyMonth = k => Number(k.slice(5, 7));
export const keyOf = dateStr => String(dateStr || '').slice(0, 7);

/** Сдвиг ключа на n месяцев */
export function addMonths(key, n) {
    const t = keyYear(key) * 12 + (keyMonth(key) - 1) + n;
    return ymKey(Math.floor(t / 12), (t % 12 + 12) % 12 + 1);
}
/** Разница b − a в месяцах */
export function monthDiff(a, b) {
    return (keyYear(b) * 12 + keyMonth(b)) - (keyYear(a) * 12 + keyMonth(a));
}
/** Все ключи от a до b включительно */
export function monthRange(a, b) {
    const out = [];
    for (let k = a; monthDiff(k, b) >= 0; k = addMonths(k, 1)) out.push(k);
    return out;
}

/** Создать период. Пустой набор месяцев = «всё время». */
export function makePeriod({ all = false, keys = [] } = {}) {
    const clean = [...new Set((keys || []).filter(isKey))].sort();
    if (all || !clean.length) return { all: true, keys: [], set: new Set() };
    return { all: false, keys: clean, set: new Set(clean) };
}
export const allTime = () => makePeriod({ all: true });
export const monthPeriod = key => makePeriod({ keys: [key] });

export function inPeriod(p, dateStr) {
    if (!dateStr) return false;
    return p.all || p.set.has(keyOf(dateStr));
}

export function isContiguous(keys) {
    for (let i = 1; i < keys.length; i++) if (monthDiff(keys[i - 1], keys[i]) !== 1) return false;
    return true;
}

/** 'month' | '3m' | 'year' | 'custom' | 'all' */
export function presetOf(p) {
    if (p.all) return 'all';
    const k = p.keys;
    if (k.length === 1) return 'month';
    if (k.length === 3 && isContiguous(k)) return '3m';
    if (k.length === 12 && isContiguous(k) && keyMonth(k[0]) === 1) return 'year';
    return 'custom';
}

/** Период по пресету от опорного месяца (anchor — последний выбранный месяц) */
export function fromPreset(preset, anchor) {
    if (preset === 'all') return allTime();
    if (preset === 'month') return monthPeriod(anchor);
    if (preset === '3m') return makePeriod({ keys: monthRange(addMonths(anchor, -2), anchor) });
    if (preset === 'year') {
        const y = keyYear(anchor);
        return makePeriod({ keys: monthRange(ymKey(y, 1), ymKey(y, 12)) });
    }
    return monthPeriod(anchor);
}

/** Весь календарный год */
export const yearPeriod = y => fromPreset('year', ymKey(y, 1));

/** Опорный месяц: последний выбранный, а для «всё время» — текущий (но не позже последних данных) */
export function anchorOf(p, todayKey, lastDataKey) {
    if (!p.all) return p.keys[p.keys.length - 1];
    if (lastDataKey && monthDiff(lastDataKey, todayKey) > 0) return lastDataKey;
    return todayKey;
}

/** Нажали на столбец/месяц: переключаем его в выборе. viewYear — год, который сейчас на графике. */
export function toggleMonth(p, key, viewYear) {
    if (p.all) return monthPeriod(key);
    const has = p.set.has(key);
    const keys = has ? p.keys.filter(k => k !== key) : [...p.keys, key];
    if (!keys.length) return viewYear ? yearPeriod(viewYear) : allTime();
    return makePeriod({ keys });
}

/** Предыдущий период такой же длины (для сравнений). Для «всё время» — null. */
export function previousPeriod(p) {
    if (p.all) return null;
    const span = periodSpan(p);
    return { ...makePeriod({ keys: p.keys.map(k => addMonths(k, -span)) }), shift: span };
}
/** Длина «окна» в месяцах от первого до последнего выбранного */
export function periodSpan(p) {
    if (p.all || !p.keys.length) return 0;
    return monthDiff(p.keys[0], p.keys[p.keys.length - 1]) + 1;
}

/** Границы дат периода (для всех — null) */
export function periodBounds(p) {
    if (p.all) return null;
    const first = p.keys[0], last = p.keys[p.keys.length - 1];
    const dim = new Date(Date.UTC(keyYear(last), keyMonth(last), 0)).getUTCDate();
    return { from: `${first}-01`, to: `${last}-${pad(dim)}` };
}

/** Подпись периода: «Октябрь 2026», «авг–окт 2026», «2026 год», «Всё время», «янв, мар, июн 2026» */
export function periodLabel(p) {
    if (p.all) return 'Всё время';
    const k = p.keys;
    const pre = presetOf(p);
    if (pre === 'year') return `${keyYear(k[0])} год`;
    if (k.length === 1) return `${MONTHS_FULL[keyMonth(k[0]) - 1]} ${keyYear(k[0])}`;
    // группы подряд идущих месяцев
    const runs = [];
    for (const key of k) {
        const last = runs[runs.length - 1];
        if (last && monthDiff(last[last.length - 1], key) === 1) last.push(key); else runs.push([key]);
    }
    const sh = key => MONTHS_SHORT[keyMonth(key) - 1];
    const years = [...new Set(k.map(keyYear))];
    if (runs.length === 1) {
        const a = k[0], b = k[k.length - 1];
        return years.length === 1 ? `${sh(a)}–${sh(b)} ${years[0]}`
            : `${sh(a)} ${keyYear(a)} – ${sh(b)} ${keyYear(b)}`;
    }
    if (years.length === 1 && k.length <= 5) return `${k.map(sh).join(', ')} ${years[0]}`;
    return `${k.length} мес. · ${years.length === 1 ? years[0] : `${years[0]}–${years[years.length - 1]}`}`;
}

/** Короткая подпись для кнопки в шапке */
export function periodButtonLabel(p) {
    if (p.all) return 'Всё время';
    const pre = presetOf(p);
    if (pre === 'year') return String(keyYear(p.keys[0]));
    if (pre === 'month') return `${MONTHS_FULL[keyMonth(p.keys[0]) - 1]} ${keyYear(p.keys[0]) !== new Date().getFullYear() ? keyYear(p.keys[0]) : ''}`.trim();
    return periodLabel(p);
}

// ---------- сохранение ----------
export const PERIOD_STORAGE_KEY = 'budgetit:analytics:period:v2';
export function savePeriod(p, storage = globalThis.localStorage) {
    try { storage?.setItem(PERIOD_STORAGE_KEY, JSON.stringify({ all: p.all, keys: p.keys })); } catch (e) { /* noop */ }
}
export function loadPeriod(storage = globalThis.localStorage) {
    try {
        const raw = storage?.getItem(PERIOD_STORAGE_KEY);
        if (!raw) return null;
        const j = JSON.parse(raw);
        return makePeriod({ all: !!j.all, keys: Array.isArray(j.keys) ? j.keys : [] });
    } catch (e) { return null; }
}
