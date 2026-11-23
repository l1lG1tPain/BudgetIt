// queries.js — вопросы пользователя («сколько я потратил на еду в этом месяце», «итог за неделю»).
// Парсер только ОПИСЫВАЕТ запрос; считает summary.js.
import { tokenize } from './normalize.js';
import { scanDates, addDays, addMonthsClamp, weekdayMon, parseYmd, fmtYmd, daysInMonth, monthOfWord } from './dates.js';
import { resolveCategoryGroup, resolveCategory } from './categories.js';
import { STOPWORDS } from './lexicon.js';

const hasPhrase = (norm, list) => list.some(p => norm.includes(p));
const anyWord = (words, re) => words.some(w => re.test(w));

const RE = {
    ask: /^(?:сколько|итог\p{L}*|сводк\p{L}*|баланс\p{L}*|остал\p{L}*|остат\p{L}*|топ|qancha|necha|jami|qoldi\p{L}*|qoldiq\p{L}*|how|total|summary|balance|remaining|left|top|natija\p{L}*|доступно|на что)$/u,
    expense: /^(?:потратил\p{L}*|трачу|трат\p{L}*|расход\p{L}*|ушло|ушел|spent|spend|xarajat\p{L}*|sarflad\p{L}*|chiqim\p{L}*|expens\p{L}*)$/u,
    income: /^(?:заработал\p{L}*|получил\p{L}*|доход\p{L}*|приход\p{L}*|поступил\p{L}*|income|earned|daromad\p{L}*|kirim\p{L}*|tushum\p{L}*)$/u,
    overview: /^(?:итог\p{L}*|сводк\p{L}*|total|summary|jami|natija\p{L}*)$/u,
    remaining: /^(?:остал\p{L}*|остат\p{L}*|баланс\p{L}*|доступно|qoldi\p{L}*|qoldiq\p{L}*|balance|remaining|left)$/u
};
const TOP_PHRASES = ['больше всего', 'чаще всего', 'больше трачу', 'на что', "eng ko'p", 'eng kop', 'most', 'top '];
const CAT_PREPS = new Set(['на', 'по', 'for', 'on', 'uchun', 'ga', 'категории', 'категорию', 'категория', 'category']);
const PERIOD_NOISE = new Set(['этом', 'этот', 'эта', 'эту', 'этой', 'прошлом', 'прошлый', 'прошлая', 'прошлую', 'прошлой', 'месяце', 'месяц', 'месяца', 'неделе', 'неделю', 'неделя', 'недели',
    'год', 'году', 'года', 'сегодня', 'вчера', 'всего', 'всё', 'все', 'время', 'bu', 'oy', 'oyda', 'hafta', 'haftada', 'yil', 'yilda', "o'tgan", 'otgan', 'this', 'last', 'month', 'week', 'year', 'today', 'yesterday', 'я', 'мои', 'мои', 'мне',
    'тратил', 'тратила', 'потратил', 'потратила', 'заработал', 'заработала', 'получил', 'получила', 'сколько', 'итог', 'итого', 'осталось', 'остаток', 'баланс', 'qancha', 'necha', 'jami', 'much', 'how', 'did', 'i', 'my', 'spend', 'spent', 'earn', 'earned', 'total', 'summary']);

/* ───────── периоды ───────── */
const monthStart = (y, m) => fmtYmd(y, m, 1);
const monthEnd = (y, m) => fmtYmd(y, m, daysInMonth(y, m));

export function parsePeriod(norm, today, dates = null) {
    const words = tokenize(norm).map(t => t.w);
    const ds = (dates || scanDates(norm, today)).filter(d => !d.due && d.date && !d.invalid);
    const T = parseYmd(today);
    const has = re => anyWord(words, re);
    const hasRangeWord = anyWord(words, /^(?:с|со|от|from|dan|дан)$/) && anyWord(words, /^(?:по|до|to|gacha|until)$/);

    if (ds.length >= 2 && (hasRangeWord || ds.every(d => d.kind !== 'relative'))) {
        const [a, b] = [ds[0].date, ds[1].date].sort();
        return { kind: 'range', from: a, to: b, explicit: true };
    }
    const prev = has(/^(?:прошл\p{L}*|o'tgan|otgan|last|previous|past)$/u);
    const cur = has(/^(?:эт\p{L}*|текущ\p{L}*|bu|this|current)$/u);
    if (ds.length === 1) {
        const d = ds[0].date;
        if (d === today) return { kind: 'today', from: d, to: d, explicit: true };
        if (d === addDays(today, -1)) return { kind: 'yesterday', from: d, to: d, explicit: true };
        return { kind: 'day', from: d, to: d, explicit: true };
    }
    if (has(/^(?:недел\p{L}*|hafta\p{L}*|week)$/u)) {
        const monday = addDays(today, -weekdayMon(today));
        if (prev) { const from = addDays(monday, -7); return { kind: 'last_week', from, to: addDays(from, 6), explicit: true }; }
        if (cur) return { kind: 'this_week', from: monday, to: today, explicit: true };
        // «за неделю» без уточнения = последняя законченная неделя (пн–вс)
        { const from = addDays(monday, -7); return { kind: 'last_week', from, to: addDays(from, 6), explicit: true }; }
    }
    if (has(/^(?:год\p{L}*|yil\p{L}*|year)$/u)) {
        const y = prev ? T.y - 1 : T.y;
        return { kind: prev ? 'last_year' : 'this_year', from: `${y}-01-01`, to: prev ? `${y}-12-31` : today, explicit: true };
    }
    if (has(/^(?:все?|всё|hamma|all)$/u) && has(/^(?:время|vaqt|time)$/u)) return { kind: 'all', from: null, to: null, explicit: true };
    // «в октябре», «за ноябрь»
    const toks = tokenize(norm);
    for (let i = 0; i < toks.length; i++) {
        const mm = monthOfWord(toks[i].w);
        if (!mm) continue;
        const pw = i ? toks[i - 1].w : '';
        const nw = toks[i + 1]?.w || '';
        if (!['в', 'за', 'in', 'during', 'на', 'for'].includes(pw) && !/^(?:oyida|oy|месяц\p{L}*)$/u.test(nw)) continue;
        const y = mm > T.m ? T.y - 1 : T.y;
        return { kind: 'month', from: monthStart(y, mm), to: monthEnd(y, mm), explicit: true };
    }
    if (has(/^(?:месяц\p{L}*|oy|oyida|month)$/u) || ds.length === 0) {
        if (prev) {
            const base = addMonthsClamp(`${T.y}-${String(T.m).padStart(2, '0')}-01`, -1);
            const { y, m } = parseYmd(base);
            return { kind: 'last_month', from: monthStart(y, m), to: monthEnd(y, m), explicit: true };
        }
        return { kind: 'this_month', from: monthStart(T.y, T.m), to: today, explicit: has(/^(?:месяц\p{L}*|oy|oyida|month)$/u) };
    }
    return { kind: 'this_month', from: monthStart(T.y, T.m), to: today, explicit: false };
}

/* ───────── определение запроса ───────── */
/** true, если фраза — вопрос (признак вопроса и нет суммы) */
export function looksLikeQuery(norm, words, amountCount) {
    if (amountCount > 0) return false;
    return anyWord(words, RE.ask) || hasPhrase(norm, TOP_PHRASES);
}

export function parseQuery(norm, orig, ctx) {
    const { today, cIdx, dates } = ctx;
    const toks = tokenize(norm);
    const words = toks.map(t => t.w);
    const flags = [];

    let metric;
    let groupBy = null, limit = null;
    if (hasPhrase(norm, TOP_PHRASES)) { metric = 'expense'; groupBy = 'category'; limit = 5; }
    else if (anyWord(words, RE.remaining)) metric = 'remaining';
    else if (anyWord(words, RE.expense)) metric = 'expense';
    else if (anyWord(words, RE.income)) metric = 'income';
    else if (anyWord(words, RE.overview)) metric = 'overview';
    else metric = 'expense';
    if (/(?:по категори|по статьям|в разрезе|kategoriya bo'yicha|by category)/.test(norm)) groupBy = 'category';

    const period = parsePeriod(norm, today, dates);

    // категория: слово после «на/по/for…»
    let categories = null, clarification = null;
    const catType = metric === 'income' ? 'income' : 'expense';
    if ((metric === 'expense' || metric === 'income') && !limit) {
        let target = null;
        for (let i = 0; i < toks.length - 1; i++) {
            if (!CAT_PREPS.has(toks[i].w)) continue;
            const nxt = toks.slice(i + 1).find(t => !STOPWORDS.has(t.w) && !PERIOD_NOISE.has(t.w));
            if (nxt && toks.indexOf(nxt) - i <= 3) { target = nxt.w; break; }
        }
        if (target) {
            const got = resolveCategoryGroup([target], target, catType, cIdx);
            if (got.length) categories = got;
            else { flags.push('unknown_category'); clarification = { field: 'category', word: target }; }
        } else if (!groupBy) {
            const cand = words.filter(w => w.length >= 3 && !STOPWORDS.has(w) && !PERIOD_NOISE.has(w) && !RE.ask.test(w) && !RE.expense.test(w) && !RE.income.test(w));
            if (cand.length) { const got = resolveCategoryGroup(cand, norm, catType, cIdx); if (got.length) categories = got; }
        }
    }

    let confidence = 0.55 + (period.explicit ? 0.15 : 0) + (categories ? 0.1 : 0) + (metric !== 'expense' || anyWord(words, RE.expense) ? 0.1 : 0);
    if (clarification) confidence = 0.35;
    return {
        kind: 'query_summary',
        metric,
        period,
        category: categories ? categories[0] : null,
        categories,
        groupBy,
        limit,
        flags,
        confidence: Math.round(Math.min(confidence, 0.95) * 100) / 100,
        missing: clarification ? ['category'] : [],
        clarification
    };
}
