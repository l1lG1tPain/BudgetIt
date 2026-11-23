// parseUtterance.js — главный вход локального парсера акулки.
//   parseUtterance(text, ctx) → { intents, unparsed, needsClarification, meta }
// Чистая функция: без DOM, без записи, без сети. Парсер только описывает намерения и честно говорит об уверенности;
// что делать с неразобранным (спросить, отправить в LLM, проигнорировать) решает вызывающий код.
import { prepare, tokenize, maskRanges, detectLang, MAX_INPUT } from './normalize.js';
import { scanAmounts } from './numbers.js';
import { scanDates, todayStr, DEFAULT_TZ } from './dates.js';
import { indexCategories, buildLearned, resolveCategory, contentWords, catKey } from './categories.js';
import { looksLikeQuery, parseQuery } from './queries.js';
import { TYPE_WORDS, TYPE_PHRASES, STOPWORDS } from './lexicon.js';
import { fold } from './normalize.js';
import { cleanText } from '../../utils/sanitize.js';
import { clarificationFor } from './messages.js';

export { MAX_INPUT };
export const HUGE_AMOUNT = 1_000_000_000;      // с такой суммы UI обязан переспросить
const NOTE_MAX = 100;
const EMOJI_RE = /\p{Extended_Pictographic}|[️‍⃣]|\p{Regional_Indicator}/gu;

/* ───────── словари типов (компиляция один раз) ───────── */
const compileWords = list => {
    const exact = new Set(), prefix = [];
    for (const raw of list) {
        const k = fold(raw);
        if (k.endsWith('*')) prefix.push(k.slice(0, -1)); else exact.add(k);
    }
    return w => exact.has(w) || prefix.some(p => w.startsWith(p));
};
const IS = Object.fromEntries(Object.entries(TYPE_WORDS).map(([k, v]) => [k, compileWords(v)]));
const anyTok = (words, fn) => words.some(fn);
const phraseHit = (norm, key) => TYPE_PHRASES[key].some(re => re.test(norm));
const COUNT_RE = /(?:^|\s)(?:х|x|×)\s*(\d{1,2})(?![\d\p{L}])|(?<![\d.,])(\d{1,2}|два|две|три|четыре|пять|ikki|uch|to'rt|besh)\s*(?:раза|раз|marta|times)(?![\p{L}])/giu;
const COUNT_WORDS = { два: 2, две: 2, три: 3, четыре: 4, пять: 5, ikki: 2, uch: 3, "to'rt": 4, besh: 5 };
const PERCENT_RE = /(\d+(?:[.,]\d+)?)\s*(?:%|процент\p{L}*|foiz\p{L}*|percent|годовых)/gu;
const SEP_RE = /\s+(?:и|va|and|а|потом|затем|then)\s+|[;\n+]|(?<!\d),|,(?!\d)/g;
const ALL_TYPE_WORD = w => IS.income(w) || IS.expenseVerb(w) || IS.deposit(w) || IS.depositWithdraw(w) || IS.debt(w) || IS.repay(w);
const VERB_ONLY = /^(?:получил\p{L}*|пришл\p{L}*|пришел|заработал\p{L}*|поступил\p{L}*|зачислен\p{L}*|received|earned|got|paid)$/u;
const round2 = n => Math.round(n * 100) / 100;

/* ───────── разбиение на фрагменты ───────── */
function splitSegments(norm, sepText, amounts) {
    // 1) куски по разделителям
    const pieces = [];
    let last = 0;
    SEP_RE.lastIndex = 0;
    let m;
    while ((m = SEP_RE.exec(sepText))) {
        if (m[0].length === 0) { SEP_RE.lastIndex++; continue; }
        pieces.push([last, m.index]);
        last = m.index + m[0].length;
    }
    pieces.push([last, norm.length]);
    const inside = (a, [s, e]) => a.start >= s && a.end <= e;
    const items = pieces
        .map(p => ({ start: p[0], end: p[1], amounts: amounts.filter(a => inside(a, p)), sepBefore: p[0] }))
        .filter(p => norm.slice(p.start, p.end).trim() !== '');

    // 2) несколько сумм в одном куске без разделителя: «такси 45к обед 120»
    const split = [];
    for (const it of items) {
        if (it.amounts.length <= 1) { split.push(it); continue; }
        const lead = tokenize(maskRanges(norm.slice(it.start, it.amounts[0].start), [])).filter(t => !STOPWORDS.has(t.w) && !ALL_TYPE_WORD(t.w));
        let cursor = it.start;
        it.amounts.forEach((a, i) => {
            const isLast = i === it.amounts.length - 1;
            let end;
            if (lead.length) end = isLast ? it.end : a.end;                    // слова перед суммой: «такси 45к | обед 120»
            else end = isLast ? it.end : it.amounts[i + 1].start;              // сумма перед словами: «45к такси | 120 обед»
            split.push({ start: cursor, end, amounts: [a] });
            cursor = end;
        });
    }
    return split;
}

/* ───────── имя человека для долга ───────── */
const NAME_SKIP = new Set(['у', 'кому', 'для', 'мне', 'мне', 'to', 'from', 'до', 'на', 'в', 'и', 'я', 'за', 'по', 'bilan', 'ga']);
function extractName(origSeg, normSeg, dueRanges) {
    const masked = maskRanges(origSeg, dueRanges);
    const re = /[\p{L}][\p{L}'’-]*/gu;
    const cands = [];
    let m;
    while ((m = re.exec(masked))) {
        const w = fold(m[0]);
        if (STOPWORDS.has(w) || NAME_SKIP.has(w) || ALL_TYPE_WORD(w) || IS.debtOwed(w) || IS.debtOwe(w) || /^(?:дал\p{L}*|взял\p{L}*|qarz\p{L}*|мне|должн\p{L}*|долг\p{L}*)$/u.test(w)) continue;
        cands.push({ text: m[0], start: m.index, cap: /^\p{Lu}/u.test(m[0]) });
    }
    // имя — слово с заглавной буквы; иначе первое «непрозрачное» слово после глагола долга
    const capped = cands.filter(c => c.cap);
    let pick = capped[0] || null;
    if (!pick && cands.length) {
        const verb = /(?:одолжил\p{L}*|занял\p{L}*|ссудил\p{L}*|долг\p{L}*|должен|должна|qarz\p{L}*)/u.exec(fold(masked));
        pick = (verb && cands.find(c => c.start > verb.index)) || cands[0];
    }
    return pick ? { name: pick.text.replace(/['’-]+$/, ''), start: pick.start } : null;
}

/* ───────── уверенность ───────── */
function confidenceOf(it) {
    let c = it.missing.includes('amount') ? 0.15 : 0.45;
    if (it.tx.type === 'expense' || it.tx.type === 'income') {
        if (it.tx.category) c += it._catStrength * 0.4;
    } else c += 0.25;
    if (it._explicitType) c += 0.07;
    if (it._explicitDate) c += 0.05;
    c -= 0.12 * it.missing.filter(f => f !== 'amount').length;
    c -= 0.08 * it.flags.filter(f => f !== 'date_inferred' && f !== 'currency_hint').length;
    return round2(Math.max(0.05, Math.min(0.98, c)));
}

/* ───────── главная функция ───────── */
/**
 * @param {string} text
 * @param {{today?: Date|string, timezone?: string, categories?: Array|{expense?:Array,income?:Array}, history?: Array, locale?: string}} ctx
 */
export function parseUtterance(text, ctx = {}) {
    const { orig, norm, truncated } = prepare(text);
    const tz = ctx.timezone || DEFAULT_TZ;
    const today = todayStr(ctx.today ?? new Date(), tz);
    const lang = detectLang(norm, ctx.locale || 'ru');
    const result = { intents: [], unparsed: [], needsClarification: null, meta: { lang, today, truncated, empty: false } };
    if (!norm.trim()) { result.meta.empty = true; return result; }

    const cIdx = indexCategories(ctx.categories);
    const learned = buildLearned(ctx.history, cIdx);

    // проценты (ставка вклада) вырезаем до поиска сумм
    const percents = [];
    PERCENT_RE.lastIndex = 0;
    let pm;
    while ((pm = PERCENT_RE.exec(norm))) percents.push({ start: pm.index, end: pm.index + pm[0].length, rate: parseFloat(pm[1].replace(',', '.')) });
    // «×2», «2 раза»: множитель количества, вырезаем до поиска сумм
    const counts = [];
    COUNT_RE.lastIndex = 0;
    let cm;
    while ((cm = COUNT_RE.exec(norm))) {
        const raw = (cm[1] || cm[2] || '').toLowerCase();
        const n = /^\d+$/.test(raw) ? +raw : COUNT_WORDS[raw];
        const off = cm[0].length - cm[0].trimStart().length;
        if (n >= 2) counts.push({ start: cm.index + off, end: cm.index + cm[0].length, n });
    }
    const percentRanges = [...percents.map(p => [p.start, p.end]), ...counts.map(c => [c.start, c.end])];
    const noPercent = maskRanges(norm, percentRanges);

    const dates = scanDates(noPercent, today);
    const dateRanges = dates.map(d => [d.start, d.end]);
    const noDates = maskRanges(noPercent, dateRanges);
    const amounts = scanAmounts(noDates);
    const amountRanges = amounts.map(a => [a.start, a.end]);
    const maskedAll = maskRanges(noDates, amountRanges);
    const allWords = tokenize(maskedAll).map(t => t.w);

    /* ───── вопрос ───── */
    if (looksLikeQuery(maskedAll, allWords, amounts.length)) {
        const q = parseQuery(noPercent, orig, { today, cIdx, dates });
        result.intents.push(q);
        if (q.clarification) result.needsClarification = clarificationFor('category_query', lang, { word: q.clarification.word });
        return result;
    }

    /* ───── операции ───── */
    const sepText = maskRanges(norm, [...percentRanges, ...dateRanges, ...amountRanges], '#');
    const segs = amounts.length ? splitSegments(norm, sepText, amounts) : [{ start: 0, end: norm.length, amounts: [] }];

    // фрагменты без суммы: хвост без смысла — в заметку соседа; начало — к следующему; осмысленный фрагмент — отдельное намерение без суммы
    const groups = [];
    let pending = null;
    const meaningful = s => {
        const ws = contentWords(tokenize(maskRanges(norm.slice(s.start, s.end), [...dateRanges, ...amountRanges].map(([a, b]) => [a - s.start, b - s.start]))).map(t => t.w));
        if (!ws.length) return false;
        return !!resolveCategory(ws, ' ' + ws.join(' ') + ' ', 'expense', cIdx, learned).category || ws.some(IS.deposit) || ws.some(IS.debt);
    };
    for (const s of segs) {
        if (s.amounts.length) {
            const g = { ...s };
            if (pending) { g.start = pending.start; pending = null; }
            groups.push(g);
        } else if (!groups.length && segs.length > 1 && segs.some(x => x.amounts.length)) {
            pending = pending ? { start: pending.start, end: s.end } : { start: s.start, end: s.end };
        } else if (segs.length > 1 && meaningful(s)) {
            groups.push({ ...s, amounts: [] });
        } else if (groups.length) {
            groups[groups.length - 1].end = s.end;
        } else groups.push({ ...s, amounts: [] });
    }

    const unparsedParts = [];
    const items = [];

    for (const g of groups) {
        const segNorm = norm.slice(g.start, g.end);
        const segOrig = orig.slice(g.start, g.end);
        const segDates = dates.filter(d => d.start >= g.start && d.end <= g.end);
        const own = segDates.filter(d => !d.due);
        const due = segDates.filter(d => d.due);
        const a = g.amounts[0] || null;

        const rel = ([x, y]) => [x - g.start, y - g.start];
        const maskForWords = maskRanges(segNorm, [...segDates.map(d => [d.start, d.end]), ...amounts.filter(x => x.start >= g.start && x.end <= g.end).map(x => [x.start, x.end]), ...percents.filter(p => p.start >= g.start && p.end <= g.end).map(p => [p.start, p.end]), ...counts.filter(c => c.start >= g.start && c.end <= g.end).map(c => [c.start, c.end])].map(rel));
        const toks = tokenize(maskForWords);
        const words = toks.map(t => t.w);

        /* тип */
        let type = 'expense', explicitType = false;
        const repayVerb = anyTok(words, w => /^(?:вернул\p{L}*|отдал\p{L}*|погасил\p{L}*|qaytard\p{L}*|returned|repaid)$/u.test(w));
        const debtNames = (ctx.history || []).filter(t => t && t.type === 'debt' && t.name).map(t => fold(t.name));
        const caps = (segOrig.match(/\p{Lu}[\p{L}'’-]+/gu) || []).filter(w => !/^(?:вернул|отдал|погасил|qaytard|returned|repaid)/i.test(w));
        const namedDebtor = repayVerb && (caps.length > 0 || debtNames.some(n => n.length >= 3 && words.some(w => w.length >= 3 && (w.startsWith(n.slice(0, 4)) || n.startsWith(w.slice(0, 4))))));
        const isDebt = (repayVerb && (/долг|qarz|debt/.test(maskForWords) || namedDebtor)) || anyTok(words, IS.debt) || phraseHit(maskForWords, 'debtOwed') || phraseHit(maskForWords, 'debtOwe');
        const isDeposit = anyTok(words, IS.deposit);
        const isIncome = anyTok(words, IS.income);
        if (isDebt && !isDeposit) { type = 'debt'; explicitType = true; }
        else if (isDeposit) { type = 'deposit'; explicitType = true; }
        else if (isIncome) { type = 'income'; explicitType = true; }
        else if (anyTok(words, IS.expenseVerb)) explicitType = true;

        const flags = [], missing = [];
        const tx = { type, date: null, amount: null };
        let catStrength = 0, suggestions = [];

        /* дата */
        let explicitDate = false;
        const futureOwn = own.find(d => d.future);
        const firstOwn = own[0] || null;
        if (firstOwn) {
            explicitDate = true;
            if (firstOwn.invalid || !firstOwn.date) { flags.push('invalid_date'); missing.push('date'); }
            else tx.date = firstOwn.date;
            if (firstOwn.inferred) flags.push('date_inferred');
            if (firstOwn.ambiguous) flags.push('ambiguous_date');
            if (futureOwn) flags.push('future_date');
            const before = !a || firstOwn.start < a.start;
            if (!g._dateRole) g._dateRole = before ? 'lead' : 'trail';
        }

        /* сумма */
        if (!a) { missing.push('amount'); }
        else {
            if (a.currency) flags.push('currency_hint');
            if (a.tooLarge) { flags.push('amount_too_large'); missing.push('amount'); }
            else if (a.value === 0) { flags.push('zero_amount'); missing.push('amount'); }
            else {
                tx.amount = a.value;
                const cnt = counts.find(c => c.start >= g.start && c.end <= g.end);
                if (cnt && /(?:^|\s)(?:по|каждый|каждая|each|har\s+biri)\s*$/.test(norm.slice(Math.max(0, a.start - 12), a.start)) && a.value * cnt.n <= Number.MAX_SAFE_INTEGER) {
                    tx.amount = a.value * cnt.n; flags.push('amount_multiplied');
                }
                if (a.negative) flags.push('negative_amount');
                if (a.rounded) flags.push('amount_rounded');
                if (tx.amount >= HUGE_AMOUNT) flags.push('huge_amount');
                else if (ctx.history?.length >= 5) {
                    const same = ctx.history.filter(t => t && t.type === type && Number.isFinite(+t.amount)).map(t => +t.amount);
                    const mx = same.length >= 5 ? Math.max(...same) : 0;
                    if (mx > 0 && tx.amount > mx * 20) flags.push('unusual_amount');
                }
            }
        }

        /* заметка: оригинал без сумм/дат/процентов, срок («до пятницы») остаётся */
        const noteMask = maskRanges(segOrig, [...own.map(d => [d.start, d.end]), ...amounts.filter(x => x.start >= g.start && x.end <= g.end).map(x => [x.start, x.end]), ...percents.filter(p => p.start >= g.start && p.end <= g.end).map(p => [p.start, p.end]), ...counts.filter(c => c.start >= g.start && c.end <= g.end).map(c => [c.start, c.end])].map(rel));
        const makeNote = () => {
            const ws = noteMask.replace(EMOJI_RE, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
            const isVerb = w => { const f = fold(w).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''); return IS.expenseVerb(f) || VERB_ONLY.test(f); };
            const isEdgeStop = w => { const f = fold(w).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''); return !f || STOPWORDS.has(f); };
            let out = ws.filter(w => !isVerb(w));
            while (out.length && isEdgeStop(out[0])) out.shift();
            while (out.length && isEdgeStop(out[out.length - 1])) out.pop();
            const n = out.join(' ').replace(/^[\s,;.:+-]+|[\s,;.:+-]+$/g, '');
            return n ? cleanText(n, NOTE_MAX) : '';
        };

        if (type === 'debt') {
            const dueRanges = due.map(d => rel([d.start, d.end]));
            const nm = extractName(segOrig, segNorm, dueRanges);
            tx.name = nm ? cleanText(nm.name, 60) : null;
            const repay = repayVerb;
            let direction = null;
            if (repay) { flags.push('debt_repayment'); }
            const hasShouldBe = /(?:^|[^\p{L}])(?:должен|должна|должны)(?![\p{L}])/u.exec(maskForWords);
            if (phraseHit(maskForWords, 'debtOwed') && !(hasShouldBe && nm && nm.start > hasShouldBe.index && !/мне\s+должн|должн\p{L}*\s+мне/u.test(maskForWords))) direction = 'owed';
            if (anyTok(words, IS.debtOwed)) direction = 'owed';
            if (anyTok(words, IS.debtOwe) || /(?:^|[^\p{L}])я\s+должн/u.test(maskForWords) || phraseHit(maskForWords, 'debtOwe') && !direction) direction = direction || 'owe';
            if (!direction && hasShouldBe) {
                // «Али должен мне» → мне должны; «должен Али» → я должен
                direction = nm && nm.start < hasShouldBe.index ? 'owed' : 'owe';
                if (!nm) flags.push('direction_guess');
            }
            if (repay) {
                // «Али вернул» / «вернул мне» → мне вернули (долг передо мной); «вернул долг Али» / «я вернул» → я вернул
                const vm = /(?:вернул\p{L}*|отдал\p{L}*|погасил\p{L}*|qaytard\p{L}*|returned|repaid)/u.exec(maskForWords);
                direction = (nm && vm && nm.start < vm.index) || /(?:^|[^\p{L}])мне(?![\p{L}])/u.test(maskForWords) ? 'owed' : 'owe';
            }
            // имя: если в истории есть такой должник — берём его написание (убирает падежи: «у Бобура» → «Бобур»)
            const known = (ctx.history || []).filter(t => t && t.type === 'debt' && t.name);
            if (tx.name) {
                const f = fold(tx.name);
                const hit = known.find(t => { const n = fold(t.name); return n.length >= 3 && f.length >= 3 && (f.startsWith(n.slice(0, Math.max(3, n.length - 2))) || n.startsWith(f.slice(0, Math.max(3, f.length - 2)))); });
                if (hit) tx.name = hit.name;
            }
            tx.direction = direction;
            if (!direction) missing.push('direction');
            if (!tx.name) missing.push('name');
            if (repay) {
                const open = known.filter(t => !t.paid && Number(t.remainingAmount ?? t.initialAmount ?? t.amount) > 0 && fold(t.name) === fold(tx.name || '') && (!direction || t.direction === direction));
                if (open.length >= 1) { open.sort((a, b) => String(b.date).localeCompare(String(a.date))); tx.repaymentOf = open[0].id; tx.name = open[0].name; }
                else missing.push('debtTarget');
            }
            if (due.length) {
                const d0 = due[0];
                const from = Math.max(0, d0.start - g.start - 3);
                const piece = segOrig.slice(from, d0.end - g.start).replace(/^[\s,;.:+-]+/, '').trim();
                if (piece) tx.note = cleanText(piece, NOTE_MAX);
            }
        } else if (type === 'deposit') {
            const roots = (ctx.history || []).filter(t => t && t.type === 'deposit' && String(t.status || '').includes('Вклад') && !/Пополнение|Снятие/.test(String(t.status)));
            const withdraw = anyTok(words, IS.depositWithdraw);
            const opening = anyTok(words, w => /^(?:откр\p{L}*|ochdim|ochish|open\p{L}*)$/u.test(w));
            const rate = percents.find(p => p.start >= g.start && p.end <= g.end);
            let root = null;
            if (!opening && roots.length === 1) root = roots[0];
            else if (!opening && roots.length > 1) {
                root = roots.find(r => r.name && words.some(w => w.length >= 3 && fold(r.name).includes(w))) || null;
                if (!root) { missing.push('deposit'); suggestions = roots.map(r => r.name).filter(Boolean).slice(0, 4); }
            }
            if (root) {
                tx.depositId = root.depositId || root.id; tx.name = root.name;
                tx.status = withdraw ? '➖ Снятие' : '➕ Пополнение';
            } else if (!missing.includes('deposit')) {
                if (withdraw) { missing.push('deposit'); tx.status = '➖ Снятие'; }
                else {
                    tx.status = '📥 Вклад';
                    tx.name = 'Вклад';
                    if (rate && rate.rate > 0) tx.annualRate = rate.rate; else missing.push('rate');
                    tx.termMonths = 0;
                }
            }
        } else {
            // доход / расход
            const rest = contentWords(words.filter(w => !(IS.expenseVerb(w) || VERB_ONLY.test(w))));
            const catWords = rest.length ? rest : contentWords(words);
            let res = resolveCategory(catWords, ' ' + catWords.join(' ') + ' ', type, cIdx, learned);
            tx.category = res.category;
            catStrength = res.strength; suggestions = res.suggestions || [];
            if (!res.category) {
                missing.push('category');
                if (res.noCategories) flags.push('no_categories');
            }
            const note = makeNote();
            if (note) tx.note = note;
        }

        items.push({ g, words, tx, flags, missing, suggestions, catStrength, explicitType, explicitDate, ownDate: tx.date, dateRole: g._dateRole, hasDateFlag: !!firstOwn, amountPos: a ? a.start : null });
    }

    /* ───── «ещё 300к» без своего типа и категории наследует от предыдущей операции ───── */
    items.forEach((it, i) => {
        const prev = items[i - 1];
        if (!prev || it.tx.type !== 'expense' || it.explicitType || it.tx.category) return;
        if (!(prev.tx.type === 'income' || prev.tx.type === 'expense') || !prev.tx.category) return;
        if (!it.words.some(w => /^(?:еще|тоже|also|yana|ham|plus)$/.test(w))) return;
        it.tx.type = prev.tx.type; it.tx.category = prev.tx.category; it.catStrength = prev.catStrength * 0.8;
        it.missing = it.missing.filter(m => m !== 'category'); it.flags.push('inherited_from_previous');
    });

    /* ───── общая дата ───── */
    let lead = null, trail = null;
    for (let i = 0; i < items.length; i++) if (items[i].hasDateFlag && items[i].dateRole === 'lead') { lead = { i, it: items[i] }; break; }
    for (let i = items.length - 1; i >= 0; i--) if (items[i].hasDateFlag && items[i].dateRole === 'trail') { trail = { i, it: items[i] }; break; }
    items.forEach((it, i) => {
        if (it.hasDateFlag) return;
        const src = lead && i > lead.i ? lead.it : (trail && i < trail.i && !lead ? trail.it : null);
        if (src && src.ownDate) {
            it.tx.date = src.ownDate;
            it.explicitDate = true;
            if (src.flags.includes('future_date')) it.flags.push('future_date');
            if (src.flags.includes('date_inferred')) it.flags.push('date_inferred');
            it.flags.push('date_shared');
        } else if (src && !src.ownDate && src.missing.includes('date')) { it.missing.push('date'); }
    });

    /* ───── сборка намерений ───── */
    for (const it of items) {
        if (!it.tx.date && !it.missing.includes('date')) it.tx.date = today;
        const intent = {
            kind: 'add_transaction',
            tx: it.tx,
            confidence: 0,
            missing: [...new Set(it.missing)],
            flags: [...new Set(it.flags)],
            requiresConfirmation: false,
            suggestions: it.suggestions,
            _catStrength: it.catStrength, _explicitType: it.explicitType, _explicitDate: it.explicitDate
        };
        const a = it.g.amounts[0];
        if (a?.currency) intent.currencyHint = a.currency;
        // для отрицательной суммы: берём модуль, но UI обязан подтвердить
        intent.requiresConfirmation = intent.flags.some(f => ['negative_amount', 'huge_amount', 'unusual_amount', 'future_date', 'ambiguous_date', 'amount_rounded', 'amount_multiplied', 'inherited_from_previous', 'date_inferred', 'debt_repayment', 'direction_guess'].includes(f));
        intent.confidence = confidenceOf(intent);
        delete intent._catStrength; delete intent._explicitType; delete intent._explicitDate;
        // совсем пустое (нет суммы, нет категории, нет типа) — это не операция, а неразобранный текст
        const nothing = !it.g.amounts.length && intent.missing.includes('amount') && !it.tx.category && !it.explicitType && it.tx.type !== 'debt' && it.tx.type !== 'deposit';
        if (nothing) { unparsedParts.push(cleanText(orig.slice(it.g.start, it.g.end).trim(), NOTE_MAX * 2)); continue; }
        result.intents.push(intent);
    }
    result.unparsed = unparsedParts.filter(Boolean);

    /* ───── уточнение: первое, чего не хватает ───── */
    const order = ['amount', 'date', 'category', 'name', 'direction', 'deposit', 'rate', 'debtTarget'];
    outer: for (const f of order) {
        for (let i = 0; i < result.intents.length; i++) {
            const it = result.intents[i];
            if (it.kind === 'add_transaction' && it.missing.includes(f)) {
                result.needsClarification = { ...clarificationFor(f, lang, { intent: it }), intentIndex: i };
                break outer;
            }
        }
    }
    if (!result.needsClarification) {
        const fut = result.intents.findIndex(i => i.flags?.includes('future_date'));
        if (fut >= 0) result.needsClarification = { ...clarificationFor('future_date', lang, { intent: result.intents[fut] }), intentIndex: fut };
    }
    return result;
}
