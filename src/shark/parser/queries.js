// queries.js — вопросы пользователя («сколько я потратил на еду в этом месяце», «итог за неделю»).
// Парсер только ОПИСЫВАЕТ запрос; считает summary.js.
import { tokenize } from './normalize.js';
import { scanDates, addDays, addMonthsClamp, weekdayMon, parseYmd, fmtYmd, daysInMonth, monthOfWord } from './dates.js';
import { resolveCategoryGroup, resolveCategory, queryKeywords } from './categories.js';
import { STOPWORDS } from './lexicon.js';

const hasPhrase = (norm, list) => list.some(p => norm.includes(p));
const anyWord = (words, re) => words.some(w => re.test(w));

const RE = {
    ask: /^(?:сколько|итог\p{L}*|сводк\p{L}*|баланс\p{L}*|остал\p{L}*|остат\p{L}*|топ|qancha|necha|jami|qoldi\p{L}*|qoldiq\p{L}*|how|total|summary|balance|remaining|left|top|natija\p{L}*|доступно|на что)$/u,
    expense: /^(?:потратил\p{L}*|потрач\p{L}*|истратил\p{L}*|израсходова\p{L}*|трачу|трат\p{L}*|тратил\p{L}*|слил\p{L}*|спустил\p{L}*|просадил\p{L}*|профукал\p{L}*|промотал\p{L}*|растратил\p{L}*|затрат\p{L}*|расход\p{L}*|списан\p{L}*|ушло|ушел|ушли|spent|spend|xarajat\p{L}*|sarflad\p{L}*|chiqim\p{L}*|expens\p{L}*)$/u,
    income: /^(?:заработал\p{L}*|заработок|заработк\p{L}*|получил\p{L}*|доход\p{L}*|приход\p{L}*|поступил\p{L}*|поступлен\p{L}*|пополнен\p{L}*|выручк\p{L}*|прибыл\p{L}*|начислен\p{L}*|зарплат\p{L}*|пришл\p{L}*|зп|зпшк\p{L}*|аванс\p{L}*|получк\p{L}*|преми[яиюей]|бонус\p{L}*|кэшб[эе]к\p{L}*|кешб[эе]к\p{L}*|стипенди\p{L}*|пенси[яиюей]|income|earned|earnings|revenue|daromad\p{L}*|kirim\p{L}*|tushum\p{L}*)$/u,
    overview: /^(?:итог\p{L}*|сводк\p{L}*|total|summary|jami|natija\p{L}*)$/u,
    savings: /^(?:накоплен\p{L}*|накопил\p{L}*|накопила|накоплено|отложил\p{L}*|отложено|отложенн\p{L}*|сбережен\p{L}*|вклад\p{L}*|депозит\p{L}*|копилк\p{L}*|сэкономил\p{L}*|jamg'arma\p{L}*|omonat\p{L}*|savings|saved)$/u,
    remaining: /^(?:остал\p{L}*|остат\p{L}*|баланс\p{L}*|доступно|qoldi\p{L}*|qoldiq\p{L}*|balance|remaining|left)$/u
};
// «сколько денег на карте / у меня есть»: это остаток, а не поиск трат по слову «карта»
const REMAIN_PHRASES = ['на карте', 'на карточке', 'на счету', 'на счёте', 'на счете', 'в кошельке', 'в кармане', 'денег есть', 'есть денег', 'у меня денег', 'денег у меня', 'на руках', 'в наличии'];
// «траты», «расходы», «доходы» во множественном числе без суммы — это вопрос («траты на продукты», «расходы с 1 ноября»)
const PLURAL_MONEY = /^(?:траты|трат|тратам|тратах|расходы|расходов|расходам|расходах|затраты|затрат|затратам|доходы|доходов|доходам|доходах|поступления|поступлений|покупки|покупок)$/u;
// слова, которые не могут быть категорией в вопросе («куда ушли деньги» — не категория «Деньги женщины»)
const NOT_CATEGORY = /^(?:деньг\p{L}*|денег|денежк\p{L}*|бабк\p{L}*|бабл\p{L}*|бабос\p{L}*|лавэ|куда|откуда|делись|ушли|ушло|уходят|уходит|всего|сумм\p{L}*|мне|меня|есть|был\p{L}*|карт[аеуы]|карточк\p{L}*|счет\p{L}*|счёт\p{L}*|кошел\p{L}*|кармане|руках|наличии|покупк\p{L}*|покупок)$/u;
const TOP_PHRASES = ['больше всего', 'чаще всего', 'больше трачу', 'на что', "eng ko'p", 'eng kop', 'most', 'top ', 'топ '];
// слова периода — не название покупки: «траты за 10 дней», «траты позавчера»
const PERIOD_WORD = /^(?:дн[яеи]й?|дней|день|сутк\p{L}*|суток|недел\p{L}*|месяц\p{L}*|год|года|году|годы|лет|квартал\p{L}*|полгода|полугоди\p{L}*|позавчера|вчера|сегодня|прошл\p{L}*|последн\p{L}*|текущ\p{L}*|время|времени)$/u;
// доход, который сам себе категория: «кешбэк», «зарплата», «аванс», «премия»
const INCOME_CAT_WORD = /^(?:зарплат\p{L}*|зп|зпшк\p{L}*|получк\p{L}*|аванс\p{L}*|преми[яиюей]|бонус\p{L}*|кэшб[эе]к\p{L}*|кешб[эе]к\p{L}*|стипенди\p{L}*|пенси[яиюей]|выручк\p{L}*)$/u;
const CAT_PREPS = new Set(['на', 'по', 'for', 'on', 'uchun', 'ga', 'категории', 'категорию', 'категория', 'category']);
const PERIOD_NOISE = new Set(['этом', 'этот', 'эта', 'той', 'позапрошлой', 'позапрошлая', 'позапрошлую', 'предыдущей', 'предыдущая', 'предыдущую', 'эту', 'этой', 'прошлом', 'прошлый', 'прошлая', 'прошлую', 'прошлой', 'месяце', 'месяц', 'месяца', 'неделе', 'неделю', 'неделя', 'недели',
    'год', 'году', 'года', 'квартал', 'квартала', 'триместр', 'триместра', 'полгода', 'полугодие', 'последние', 'последних', 'последний', 'последнюю', 'период', 'между', 'сегодня', 'вчера', 'всего', 'всё', 'все', 'время', 'bu', 'oy', 'oyda', 'hafta', 'haftada', 'yil', 'yilda', "o'tgan", 'otgan', 'this', 'last', 'month', 'week', 'year', 'today', 'yesterday', 'я', 'мои', 'мои', 'мне',
    'тратил', 'тратила', 'потратил', 'потратила', 'заработал', 'заработала', 'получил', 'получила', 'сколько', 'итог', 'итого', 'осталось', 'остаток', 'баланс', 'qancha', 'necha', 'jami', 'much', 'how', 'did', 'i', 'my', 'spend', 'spent', 'earn', 'earned', 'total', 'summary']);

/* ───────── периоды ───────── */
const monthStart = (y, m) => fmtYmd(y, m, 1);
const monthEnd = (y, m) => fmtYmd(y, m, daysInMonth(y, m));

const NUM_WORDS = { один: 1, одну: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10, одиннадцать: 11, двенадцать: 12 };
const UNITS = [[/^(?:месяц\p{L}*|oy|month\p{L}*)$/u, 'm'], [/^(?:недел\p{L}*|hafta\p{L}*|week\p{L}*)$/u, 'w'], [/^(?:дн\p{L}*|день|kun\p{L}*|day\p{L}*)$/u, 'd'], [/^(?:год\p{L}*|лет|yil\p{L}*|year\p{L}*)$/u, 'y']];

/** Срок «за 2 месяца», «последние 3 недели», «на 10 дней»: перед числом обязательно «за/последние/на…» (так «через 3 дня» не путается) */
export const SPAN_RE = /(?:^|\s)(?:за|последн\p{L}*|прошедш\p{L}*|на|for|last|past)\s+((?:\d{1,3}|один|одну|два|две|три|четыре|пять|шесть|семь|восемь|девять|десять|одиннадцать|двенадцать)\s+(?:месяц\p{L}*|недел\p{L}*|дн(?:я|ей|и)|день|год(?:а|ов)?|лет))(?=\s|$|[.,!?])/giu;

/** «за 2 месяца», «последние 3 недели», «полгода», «квартал»: период назад от сегодня (месяцы считаются календарными, включая текущий) */
function parseSpan(ws, T, today, prev, norm) {
    const back = (n, u) => {
        if (u === 'm') return { kind: 'n_months', from: addMonthsClamp(monthStart(T.y, T.m), -(n - 1)), to: today, explicit: true };
        if (u === 'w') return { kind: 'n_weeks', from: addDays(today, -(7 * n - 1)), to: today, explicit: true };
        if (u === 'd') return { kind: 'n_days', from: addDays(today, -(n - 1)), to: today, explicit: true };
        return { kind: 'n_years', from: addDays(addMonthsClamp(today, -12 * n), 1), to: today, explicit: true };
    };
    for (const m of norm.matchAll(SPAN_RE)) {
        const [a, b] = m[1].split(/\s+/);
        const n = /^\d+$/.test(a) ? +a : NUM_WORDS[a];
        const u = UNITS.find(([re]) => re.test(b));
        if (n && n <= 120 && u) return back(n, u[1]);
    }
    if (ws.some(w => /^(?:полгода|полугоди\p{L}*|yarim|half)$/u.test(w))) return back(6, 'm');
    // триместр — это 3 месяца (включая текущий), а не календарный квартал
    if (ws.some(w => /^триместр\p{L}*$/u.test(w))) {
        if (prev) { const f = addMonthsClamp(monthStart(T.y, T.m), -5); const p = parseYmd(addMonthsClamp(monthStart(T.y, T.m), -3)); return { kind: 'last_quarter', from: f, to: monthEnd(p.y, p.m), explicit: true }; }
        return back(3, 'm');
    }
    if (ws.some(w => /^(?:квартал\p{L}*|chorak|quarter)$/u.test(w))) {
        const q0 = Math.floor((T.m - 1) / 3) * 3 + 1;
        if (prev) { const f = addMonthsClamp(monthStart(T.y, q0), -3); const p = parseYmd(f); return { kind: 'last_quarter', from: f, to: monthEnd(p.y, p.m + 2), explicit: true }; }
        return { kind: 'quarter', from: monthStart(T.y, q0), to: today, explicit: true };
    }
    return null;
}

/** Названия месяцев: «октябрь», «октябрь ноябрь», «июль и ноябрь» (от самого раннего до самого позднего), «с октября по июль» */
function parseMonths(toks, T, today, hasRangeWord, norm) {
    const mons = [];
    toks.forEach((t, i) => { const m = monthOfWord(t.w); if (m) mons.push({ i, m }); });
    if (!mons.length) return null;
    const pw = mons[0].i ? toks[mons[0].i - 1].w : '';
    const nw = toks[mons[0].i + 1]?.w || '';
    const okFirst = ['в', 'за', 'на', 'с', 'со', 'от', 'между', 'in', 'during', 'for', 'from'].includes(pw) || /^(?:oyida|oy|месяц\p{L}*)$/u.test(nw);
    if (mons.length < 2 && !okFirst) return null;
    const yt = /(?:^|\s)(20\d\d)(?=\s|$|[.,!?])/.exec(norm);
    const yr = yt ? +yt[1] : null;
    const yOf = m => (yr ?? (m > T.m ? T.y - 1 : T.y));
    let from, to;
    if (hasRangeWord && mons.length >= 2) {
        const sm = mons[0].m, em = mons[mons.length - 1].m;
        let ey = yr ?? yOf(sm) + (em >= sm ? 0 : 1);
        let sy = yr ? (em >= sm ? yr : yr - 1) : yOf(sm);
        while (!yr && monthStart(ey, em) > today) { ey--; sy--; }
        from = monthStart(sy, sm); to = monthEnd(ey, em);
    } else {
        const starts = mons.map(x => monthStart(yOf(x.m), x.m)).sort();
        const ends = mons.map(x => monthEnd(yOf(x.m), x.m)).sort();
        from = starts[0]; to = ends[ends.length - 1];
    }
    // «с октября» без «по»: от начала месяца до сегодня
    if (mons.length === 1 && !hasRangeWord && ['с', 'со', 'от', 'from'].includes(pw) && from < today) return { kind: 'since', from, to: today, explicit: true };
    const single = from.slice(0, 7) === to.slice(0, 7);
    return { kind: single ? 'month' : 'months', from, to, explicit: true };
}

export function parsePeriod(norm, today, dates = null) {
    const words = tokenize(norm).map(t => t.w);
    const hasRangeWord = anyWord(words, /^(?:с|со|от|from|dan|дан)$/) && anyWord(words, /^(?:по|до|to|gacha|until)$/);
    // «с 3 до 10 ноября»: «до» здесь граница периода, а не срок долга
    const ds = (dates || scanDates(norm, today)).filter(d => (hasRangeWord || !d.due) && d.date && !d.invalid);
    const T = parseYmd(today);
    const has = re => anyWord(words, re);

    if (ds.length >= 2 && (hasRangeWord || ds.every(d => d.kind !== 'relative'))) {
        const [a, b] = [ds[0].date, ds[1].date].sort();
        return { kind: 'range', from: a, to: b, explicit: true };
    }
    const prev = has(/^(?:прошл\p{L}*|предыдущ\p{L}*|той|o'tgan|otgan|last|previous|past)$/u);
    const prev2 = has(/^позапрошл\p{L}*$/u);
    const cur = has(/^(?:эт\p{L}*|текущ\p{L}*|bu|this|current)$/u);
    if (ds.length === 1) {
        const d = ds[0].date;
        // «с 5 ноября» без «по»: от этого дня до сегодня
        if (!hasRangeWord && d < today && anyWord(words, /^(?:с|со|от|from|dan)$/)) return { kind: 'since', from: d, to: today, explicit: true };
        if (d === today) return { kind: 'today', from: d, to: d, explicit: true };
        if (d === addDays(today, -1)) return { kind: 'yesterday', from: d, to: d, explicit: true };
        return { kind: 'day', from: d, to: d, explicit: true };
    }
    { const sp = parseSpan(words, T, today, prev, norm); if (sp) return sp; }
    { const mp = parseMonths(tokenize(norm), T, today, hasRangeWord, norm); if (mp) return mp; }
    if (has(/^(?:недел\p{L}*|hafta\p{L}*|week)$/u)) {
        const monday = addDays(today, -weekdayMon(today));
        if (prev2) { const from = addDays(monday, -14); return { kind: 'last_week', from, to: addDays(from, 6), explicit: true }; }
        if (prev) { const from = addDays(monday, -7); return { kind: 'last_week', from, to: addDays(from, 6), explicit: true }; }
        // «за неделю», «на этой неделе» — текущая неделя (пн — сегодня); «на прошлой/той» — прошлая, «позапрошлая» — на неделю раньше
        return { kind: 'this_week', from: monday, to: today, explicit: true };
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
/** «На что я трачу чаще всего / реже всего»: 'most' | 'least' | null. Нужны слово «чаще/больше» или «реже/меньше» и обращение «на что / куда / какие категории». */
export function rankOf(norm, words) {
    // «самые частые траты», «чаще всего покупаю» — по числу операций
    if (hasPhrase(norm, ['самые частые', 'самая частая', 'самых частых', 'частые траты', 'частые покупки', 'чаще всего'])) return 'most';
    if (hasPhrase(norm, ['самые редкие', 'самая редкая', 'редкие траты', 'реже всего'])) return 'least';
    if (!hasPhrase(norm, ['на что', 'на чем', 'куда', 'где ', 'какие категор', 'какая категор', 'что я трачу', 'что трачу', 'что покупаю'])) return null;
    if (anyWord(words, /^(?:меньш?е|реже|редко)$/u)) return 'least';
    if (anyWord(words, /^(?:больш?е|чаще|чаш?е|часто)$/u)) return 'most';
    return null;
}

/** true, если фраза — вопрос (признак вопроса и нет суммы) */
export function looksLikeQuery(norm, words, amountCount, hasSpan = false, hasDate = false) {
    if (amountCount > 0) return false;
    if (anyWord(words, RE.ask) || hasPhrase(norm, TOP_PHRASES) || rankOf(norm, words)) return true;
    if (anyWord(words, PLURAL_MONEY)) return true;
    // «расходы с октября по июль», «доходы за полгода»: слово про деньги и признак периода
    const periodWord = hasSpan || words.some(w => monthOfWord(w) || /^(?:месяц\p{L}*|недел\p{L}*|квартал\p{L}*|триместр\p{L}*|полгода|полугоди\p{L}*|год\p{L}*)$/u.test(w));
    // «накопления с 1 ноября»: у накоплений годится и дата; трата без суммы с датой («потратил вчера на такси») — это запись без суммы
    return ((anyWord(words, RE.expense) || anyWord(words, RE.income)) && periodWord) || (anyWord(words, RE.savings) && (periodWord || hasDate));
}

export function parseQuery(norm, orig, ctx) {
    const { today, cIdx, dates } = ctx;
    const toks = tokenize(norm);
    const words = toks.map(t => t.w);
    const flags = [];

    let metric;
    let groupBy = null, limit = null;
    const rank = rankOf(norm, words);
    if (rank || hasPhrase(norm, TOP_PHRASES)) { metric = 'expense'; groupBy = 'category'; limit = 10; }
    else if (anyWord(words, RE.savings) && !anyWord(words, RE.expense) && !anyWord(words, RE.income)) metric = 'savings';
    else if (anyWord(words, RE.remaining)) metric = 'remaining';
    else if (hasPhrase(norm, REMAIN_PHRASES) && !anyWord(words, RE.expense) && !anyWord(words, RE.income)) metric = 'remaining';
    else if (anyWord(words, RE.expense)) metric = 'expense';
    else if (anyWord(words, RE.income)) metric = 'income';
    else if (anyWord(words, RE.overview)) metric = 'overview';
    else metric = 'expense';
    if (/(?:по категори|по статьям|в разрезе|kategoriya bo'yicha|by category)/.test(norm)) groupBy = 'category';

    let period = parsePeriod(norm, today, dates);
    if (rank && !period.explicit) period = { kind: 'this_year', from: `${parseYmd(today).y}-01-01`, to: today, explicit: false };   // без периода — с начала года

    // категория: слово после «на/по/for…»
    let categories = null, clarification = null, keywords = null, subject = null, byPrep = false;
    const catType = metric === 'income' ? 'income' : 'expense';
    if ((metric === 'expense' || metric === 'income') && !limit) {
        let target = null;
        for (let i = 0; i < toks.length - 1; i++) {
            if (!CAT_PREPS.has(toks[i].w)) continue;
            const nxt = toks.slice(i + 1).find(t => !STOPWORDS.has(t.w) && !PERIOD_NOISE.has(t.w));
            if (nxt && !monthOfWord(nxt.w) && !NOT_CATEGORY.test(nxt.w) && toks.indexOf(nxt) - i <= 3) { target = nxt.w; break; }
        }
        if (target) {
            const got = resolveCategoryGroup([target], target, catType, cIdx);
            keywords = queryKeywords([target], target); subject = target; byPrep = true;
            if (got.length) categories = got;
            else flags.push('name_match');                 // категории нет — ищем по названиям позиций и заметкам
        } else if (!groupBy) {
            let cand = words.filter(w => w.length >= 3 && !STOPWORDS.has(w) && !PERIOD_NOISE.has(w) && !PERIOD_WORD.test(w) && !NOT_CATEGORY.test(w) && !RE.ask.test(w) && !RE.expense.test(w) && !RE.income.test(w) && !monthOfWord(w) && !/^(?:сто(?:ил|ит|имост)\p{L}*|потрачен\p{L}*)$/u.test(w));
            // «кешбэк за год», «доходы с зарплаты»: слово дохода само называет категорию
            // «кешбек» и «кэшбэк» пишут по-разному — пробуем оба написания
            if (!cand.length && metric === 'income') cand = words.filter(w => INCOME_CAT_WORD.test(w)).flatMap(w => (/^(?:зп|зпшк\p{L}*|получк\p{L}*)$/u.test(w) ? ['зарплата'] : /^к[еэ]шб/u.test(w) ? ['кэшбек', 'кешбек', 'кэшбэк'] : [w]));
            if (cand.length) { const got = resolveCategoryGroup(cand, norm, catType, cIdx); if (got.length) categories = got; else flags.push('name_match'); keywords = queryKeywords(cand, norm); subject = cand.join(' '); }
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
        keywords,
        subject,
        byPrep,
        rank,
        groupBy,
        limit,
        flags,
        confidence: Math.round(Math.min(confidence, 0.95) * 100) / 100,
        missing: clarification ? ['category'] : [],
        clarification
    };
}
