// dates.js — относительные и абсолютные даты (ru/uz/en). Всё на строках 'YYYY-MM-DD' и UTC-арифметике по компонентам:
// никаких new Date(строка) и toISOString — ловушка часовых поясов (правило проекта).
import { multiplierOf } from './numbers.js';

export const DEFAULT_TZ = 'Asia/Tashkent';
const pad = n => String(n).padStart(2, '0');
export const fmtYmd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

/** Сегодняшняя дата 'YYYY-MM-DD' в нужном часовом поясе. Принимает Date или уже готовую строку. */
export function todayStr(today, tz = DEFAULT_TZ) {
    if (typeof today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(today)) return today;
    const d = today instanceof Date && !Number.isNaN(today.getTime()) ? today : new Date();
    try {
        const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz || DEFAULT_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
        const g = t => parts.find(p => p.type === t).value;
        return `${g('year')}-${g('month')}-${g('day')}`;
    } catch {
        return fmtYmd(d.getFullYear(), d.getMonth() + 1, d.getDate());
    }
}

export const parseYmd = s => ({ y: +s.slice(0, 4), m: +s.slice(5, 7), d: +s.slice(8, 10) });
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const validYmd = (y, m, d) => y >= 1900 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);

export function addDays(s, n) {
    const { y, m, d } = parseYmd(s);
    const t = new Date(Date.UTC(y, m - 1, d + n));
    return fmtYmd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}
/** Месяцы с зажимом дня: 31 марта − 1 мес = 28/29 февраля */
export function addMonthsClamp(s, n) {
    const { y, m, d } = parseYmd(s);
    const idx = y * 12 + (m - 1) + n;
    const ny = Math.floor(idx / 12), nm = (idx % 12) + 1;
    return fmtYmd(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}
/** Понедельник = 0 */
export function weekdayMon(s) {
    const { y, m, d } = parseYmd(s);
    return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}
export const diffDays = (a, b) => {
    const A = parseYmd(a), B = parseYmd(b);
    return Math.round((Date.UTC(A.y, A.m - 1, A.d) - Date.UTC(B.y, B.m - 1, B.d)) / 86400000);
};

/* ───────── словари ───────── */
const WEEKDAY_RES = [
    [0, /^(?:понедельник\p{L}*|dushanba\p{L}*|душанба\p{L}*|monday|mon)$/u],
    [1, /^(?:вторник\p{L}*|seshanba\p{L}*|сешанба\p{L}*|tuesday|tue)$/u],
    [2, /^(?:среда|среду|среды|среде|средой|chorshanba\p{L}*|чоршанба\p{L}*|wednesday|wed)$/u],
    [3, /^(?:четверг\p{L}*|payshanba\p{L}*|пайшанба\p{L}*|thursday|thu)$/u],
    [4, /^(?:пятниц\p{L}*|juma|jumaga|juma'?da|жума|friday|fri)$/u],
    [5, /^(?:суббот\p{L}*|shanba\p{L}*|шанба\p{L}*|saturday|sat)$/u],
    [6, /^(?:воскресень\p{L}*|yakshanba\p{L}*|якшанба\p{L}*|sunday|sun)$/u]
];
const weekdayOfWord = w => { for (const [i, re] of WEEKDAY_RES) if (re.test(w)) return i; return -1; };

const MONTH_RES = [
    /^(?:январ[ьяюеи]?|yanvar\p{L}*|january|jan)$/u, /^(?:феврал[ьяюеи]?|fevral\p{L}*|february|feb)$/u, /^(?:март[ауе]?|mart\p{L}*|march|mar)$/u,
    /^(?:апрел[ьяюеи]?|aprel\p{L}*|april|apr)$/u, /^(?:ма[йяюе]|may\p{L}*)$/u, /^(?:июн[ьяюеи]?|iyun\p{L}*|june|jun)$/u,
    /^(?:июл[ьяюеи]?|iyul\p{L}*|july|jul)$/u, /^(?:август[ауе]?|avgust\p{L}*|august|aug)$/u, /^(?:сентябр[ьяюеи]?|sentabr\p{L}*|september|sept|sep)$/u,
    /^(?:октябр[ьяюеи]?|oktabr\p{L}*|october|oct)$/u, /^(?:ноябр[ьяюеи]?|noyabr\p{L}*|november|nov)$/u, /^(?:декабр[ьяюеи]?|dekabr\p{L}*|december|dec)$/u
];
/** номер месяца 1..12 по слову (строгие шаблоны, чтобы «маркет» не стал мартом) или 0 */
export function monthOfWord(w) {
    if (w.length < 3) return 0;
    for (let i = 0; i < 12; i++) if (MONTH_RES[i].test(w)) return i + 1;
    return 0;
}

const PREV_WORDS = new Set(['прошлой', 'прошлую', 'прошлый', 'прошлого', 'прошлом', 'прошлым', "o'tgan", 'otgan', 'утган', 'last', 'past', 'previous']);
const DUE_WORDS = new Set(['до', 'к', 'by', 'until', 'gacha', 'дo']);

/* ───────── разбор ───────── */
function tokens(norm) {
    const out = [];
    let m;
    const re = /[a-zа-я']+/g;
    while ((m = re.exec(norm))) out.push({ w: m[0].replace(/^'+|'+$/g, ''), start: m.index, end: m.index + m[0].length });
    return out;
}

/**
 * Находит в нормализованном тексте даты. Каждая: { start, end, date|null, kind, future, inferred, ambiguous, invalid, due }
 *  due = срок («до пятницы», «к 20-му»), а не дата операции.
 * Прошлое трактуется как «ближайшее прошедшее»: «20-го» в начале месяца — прошлый месяц, «10.11» в январе — ноябрь прошлого года.
 */
export function scanDates(norm, today) {
    const T = parseYmd(today);
    const found = [];
    const used = [];     // занятые диапазоны, чтобы не находить одну дату двумя шаблонами
    const free = (a, b) => !used.some(([x, y]) => a < y && b > x);
    const push = d => {
        if (!free(d.start, d.end)) return;
        used.push([d.start, d.end]);
        // «до …», «к …» непосредственно перед датой — срок
        const before = norm.slice(Math.max(0, d.start - 6), d.start);
        const pw = before.trim().split(/\s+/).pop();
        d.due = DUE_WORDS.has(pw) && /[ ]$/.test(before);
        d.future = !!d.date && d.date > today;
        found.push(d);
    };
    const nextMultiplier = end => {
        const m = /^ *([a-zа-я']+)/.exec(norm.slice(end, end + 20));
        return m ? multiplierOf(m[1]) > 0 : false;
    };

    let m;
    // 1) dd.mm.yyyy / dd/mm/yy
    const full = /(?<![\d.,/])(\d{1,2})([./])(\d{1,2})\2(\d{4}|\d{2})(?!\d)/g;
    while ((m = full.exec(norm))) {
        const dd = +m[1], mm = +m[3];
        let yy = +m[4]; if (m[4].length === 2) yy += 2000;
        const ok = validYmd(yy, mm, dd);
        push({ start: m.index, end: m.index + m[0].length, date: ok ? fmtYmd(yy, mm, dd) : null, kind: 'numeric', invalid: !ok, ambiguous: m[2] === '/' && dd <= 12 && mm <= 12 && dd !== mm });
    }
    // 2) dd.mm без года (месяц из двух цифр, чтобы «1.5 млн» не стало 1 мая)
    const short = /(?<![\d.,/])(\d{1,2})([./])(0[1-9]|1[0-2])(?![\d]|[./]\d)/g;
    while ((m = short.exec(norm))) {
        const end = m.index + m[0].length;
        if (nextMultiplier(end)) continue;
        const dd = +m[1], mm = +m[3];
        if (!free(m.index, end)) continue;
        if (!validYmd(T.y, mm, dd) && !(mm === 2 && dd === 29)) {
            push({ start: m.index, end, date: null, kind: 'numeric', invalid: true });
            continue;
        }
        let y = T.y;
        let date = validYmd(y, mm, dd) ? fmtYmd(y, mm, dd) : null;
        let inferred = false;
        if (!date || date > today) { y -= 1; if (validYmd(y, mm, dd)) { date = fmtYmd(y, mm, dd); inferred = true; } else date = null; }
        push({ start: m.index, end, date, kind: 'numeric', inferred, invalid: !date, ambiguous: m[2] === '/' && dd <= 12 && dd !== mm });
    }
    // 3а) диапазон с одним месяцем: «с 1 по 15 ноября», «1-15 ноября» — первое число тоже дата, а не сумма
    const span = /(?:(?<=(?:^|\s)(?:с|со|от)\s+)(\d{1,2})\s+(?:по|до)\s+|(?<![\d.,/])(\d{1,2})\s*[-–—]\s*)(\d{1,2})\s+([a-zа-я']{3,12})/gu;
    while ((m = span.exec(norm))) {
        const mm = monthOfWord(m[4]);
        const first = m[1] ?? m[2];
        if (!mm || +first > +m[3]) continue;
        const start = m.index, end = start + first.length;
        if (!free(start, end)) continue;
        const dd = +first;
        let y = T.y, date = validYmd(y, mm, dd) ? fmtYmd(y, mm, dd) : null, inferred = false;
        if (date && date > today) { y -= 1; date = validYmd(y, mm, dd) ? fmtYmd(y, mm, dd) : null; inferred = true; }
        push({ start, end, date, kind: 'named', inferred, invalid: !date });
        span.lastIndex = end;
    }
    // 3) «20 ноября», «20-noyabr», «20th of may»
    const named = /(?<![\d.,/])(\d{1,2})(?:\s*-?\s*(?:го|е|числа|число|th|st|nd|rd|chi|-?ого))?[\s-]*(?:of\s+)?([a-zа-я']{3,12})/g;
    while ((m = named.exec(norm))) {
        const mm = monthOfWord(m[2]);
        if (!mm) { named.lastIndex = m.index + String(m[1]).length + 1; continue; }
        const dd = +m[1];
        const start = m.index, end = m.index + m[0].length;
        if (!free(start, end)) continue;
        let y = T.y, date = validYmd(y, mm, dd) ? fmtYmd(y, mm, dd) : null, inferred = false;
        if (date && date > today) { y -= 1; date = validYmd(y, mm, dd) ? fmtYmd(y, mm, dd) : null; inferred = true; }
        push({ start, end, date, kind: 'named', inferred, invalid: !date });
        named.lastIndex = end;
    }
    // 4) «20-го», «20 числа», «20-sana», «20th»
    const ord = /(?<![\d.,/:])(\d{1,2})\s*-?\s*(?:го|числа|число|ого|chi|sana\p{L}*|th|st|nd|rd)(?![a-zа-я])/gu;
    while ((m = ord.exec(norm))) {
        const dd = +m[1], start = m.index, end = start + m[0].length;
        if (!free(start, end)) continue;
        // ближайшее прошедшее «dd-е»: в этом месяце, если день уже был, иначе в предыдущих (где такой день существует)
        let { y, m: mm } = T, inferred = false;
        if (dd > T.d) { inferred = true; mm -= 1; if (mm === 0) { mm = 12; y -= 1; } }
        for (let k = 0; k < 12 && dd >= 1 && dd <= 31 && !validYmd(y, mm, dd); k++) { inferred = true; mm -= 1; if (mm === 0) { mm = 12; y -= 1; } }
        const ok = validYmd(y, mm, dd);
        push({ start, end, date: ok ? fmtYmd(y, mm, dd) : null, kind: 'day', inferred, invalid: !ok });
    }
    // 5) слова
    const toks = tokens(norm);
    for (let i = 0; i < toks.length; i++) {
        const { w, start, end } = toks[i];
        const prev = i > 0 ? toks[i - 1] : null;
        if (!free(start, end)) continue;
        let rel = null;
        if (/^(?:сегодня|сегодняшн\p{L}*|bugun|бугун|today)$/u.test(w)) rel = 0;
        else if (/^(?:вчера|вчерашн\p{L}*|kecha|кеча|yesterday)$/u.test(w)) rel = -1;
        else if (/^(?:позавчера|позавчерашн\p{L}*)$/u.test(w)) rel = -2;
        else if (/^(?:завтра|ertaga|эртага|tomorrow)$/.test(w)) rel = 1;
        else if (/^(?:послезавтра|indinga|индинга)$/.test(w)) rel = 2;
        if (rel !== null) { push({ start, end, date: addDays(today, rel), kind: 'relative' }); continue; }

        const wd = weekdayOfWord(w);
        if (wd >= 0) {
            const prevWord = prev && norm.slice(prev.end, start).trim() === '' ? prev.w : '';
            const wasLast = PREV_WORDS.has(prevWord);
            const s = wasLast ? prev.start : start;
            if (!free(s, end)) continue;
            let date;
            if (wasLast) {
                const monday = addDays(today, -weekdayMon(today));
                date = addDays(monday, wd - 7);
            } else date = addDays(today, -((weekdayMon(today) - wd + 7) % 7));
            push({ start: s, end, date, kind: 'weekday', inferred: false, weekday: wd });
            continue;
        }

        // «N дней/недель назад», «неделю назад», «N kun oldin», «N days ago»
        const unit = /^(?:дн\p{L}*|ден\p{L}*|нед\p{L}*|мес\p{L}*|kun\p{L}*|hafta\p{L}*|oy\p{L}*|day\p{L}*|week\p{L}*|month\p{L}*)$/u.test(w) ? w : null;
        const nx = toks[i + 1];
        if (unit && nx && /^(?:назад|oldin|ago|avval)$/.test(nx.w) && norm.slice(end, nx.start).trim() === '') {
            let n = 1, s = start;
            const pm = /(\d{1,3})\s*$/.exec(norm.slice(Math.max(0, start - 6), start));
            if (pm) { n = +pm[1]; s = start - pm[0].length; }
            let date;
            if (/^(?:нед|hafta|week)/.test(unit)) date = addDays(today, -7 * n);
            else if (/^(?:мес|oy|month)/.test(unit)) date = addMonthsClamp(today, -n);
            else date = addDays(today, -n);
            push({ start: s, end: nx.end, date, kind: 'ago' });
            continue;
        }
        // «через N дней», «in N days» — будущее
        if (/^(?:через|in)$/.test(w)) {
            const mm2 = /^ *(\d{1,3})? *(дн\p{L}*|ден\p{L}*|нед\p{L}*|day\p{L}*|week\p{L}*)/u.exec(norm.slice(end, end + 24));
            if (mm2) {
                const n = mm2[1] ? +mm2[1] : 1;
                const date = addDays(today, /^(?:нед|week)/.test(mm2[2]) ? 7 * n : n);
                push({ start, end: end + mm2[0].length, date, kind: 'relative' });
            }
        }
    }
    return found.sort((a, b) => a.start - b.start);
}
