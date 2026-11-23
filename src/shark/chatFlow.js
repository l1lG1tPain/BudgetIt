// chatFlow.js — чистая логика свободного ввода в чате акульки (без DOM): выбор ветки, карточка подтверждения,
// ответ на уточнение, запись после подтверждения. Показ и характер акульки — в SharkUI и texts/chat.js.
import { parseUtterance, buildTransaction, buildDebtPayment, clarificationFor } from './parser/index.js';
import { isLatin, translitRu, COMMANDS, SMALL_TALK } from './chatCommands.js';
import { buildVocab, fixTypos } from './typos.js';
import { CATEGORY_RULES, QUERY_GROUPS } from './parser/lexicon.js';
import { indexCategories, buildLearned, resolveCategory, catKey } from './parser/categories.js';
import { fold, tokenize } from './parser/normalize.js';
import { STOPWORDS } from './parser/lexicon.js';
import { addCustomCategory, buildCustomCategory, CUSTOM_CATEGORY_NAME_MAX } from '../utils/customCategories.js';
import { isConsumption } from '../utils/insightsMath.js';
import { addDays, diffDays, parseYmd, fmtYmd, daysInMonth, addMonthsClamp } from './parser/dates.js';
import { parsePeriod } from './parser/queries.js';
import { prepare } from './parser/normalize.js';
import { scanAmounts } from './parser/numbers.js';
import { scanDates } from './parser/dates.js';

export const CHAT_MAX = 500;

const money = n => Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const ruDate = d => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d.split('-').reverse().join('.') : '');
const TYPE_LABEL = { expense: 'Трата', income: 'Поступление', debt: 'Долг', deposit: 'Вклад' };
const DIR_LABEL = { owe: 'Я должен', owed: 'Мне должны' };

/** Предупреждения на карточке: ключ — флаг парсера. Тексты нейтральные, голос добавляет UI. */
export const FLAG_WARNINGS = {
    future_date: 'Дата в будущем.',
    huge_amount: 'Очень большая сумма. Проверь, нет ли лишних нулей.',
    unusual_amount: 'Сумма необычная для этой категории.',
    negative_amount: 'В фразе минус: беру сумму без знака.',
    amount_multiplied: 'Сумма умножена на количество.',
    amount_rounded: 'Сумма округлена.',
    inherited_from_previous: 'Тип взят из предыдущей части фразы.',
    date_inferred: 'Дату я угадала.',
    ambiguous_date: 'Дата неоднозначная.',
    debt_repayment: 'Это погашение существующего долга, новая запись не создаётся.',
    direction_guess: 'Не уверена, кто кому должен.'
};

const BRANCH_RANK = { empty: 0, unparsed: 1, clarify: 2, confirm: 3, summary: 3 };

/** Какая ветка чата отвечает на фразу. Ничего не пишет. Латиница без разбора — пробуем транслит («taksi 45k», «skolko potratil»). */
export function routeUtterance(text, ctx) {
    // «удали трату такси 30к» — это не новая трата: из чата удаляется только последняя запись (команда undo)
    if (/^(?:удали\p{L}*|удалить|отмени\p{L}*|убери|сотри)(?:\s|$)/u.test(fold(text).trim())) {
        return { branch: 'unparsed', result: parseUtterance('', ctx), deleteHint: true };
    }
    const r = routeResult(parseUtterance(text, ctx));
    if (r.branch === 'summary' || r.branch === 'confirm' || !isLatin(text)) return r;
    const alt = routeResult(parseUtterance(translitRu(text), ctx));
    return BRANCH_RANK[alt.branch] > BRANCH_RANK[r.branch] ? alt : r;
}

/**
 * Вопрос для парсера, а не для готовой команды: назван конкретный период («итог за октябрь», «топ расходов за 2 месяца»),
 * ранжирование или категория («сколько на еду за месяц», «траты на кафе за неделю»).
 */
export function periodQuery(text, ctx) {
    // «итоги года в сторис», «рекап за год»: просят сторис, а не сводку — отвечает команда
    if (/(?:сторис|сториз|stories|рекап|recap|wrapped)/iu.test(String(text || ''))) return false;
    const q = parseUtterance(text, ctx).intents.find(i => i.kind === 'query_summary');
    if (q?.rank || (q?.byPrep && q.categories?.length)) return true;
    // «накопления за неделю / за полгода»: у команды ответ только за месяц
    if (q?.metric === 'savings' && q.period?.explicit && q.period.kind !== 'this_month') return true;
    return !!q && !!q.period?.explicit && !['this_month', 'last_month', 'this_week', 'last_week', 'today', 'yesterday', 'day'].includes(q.period.kind);
}

/** То же по готовому результату парсера (после ответа на уточнение). */
export function routeResult(result) {
    if (result.meta.empty) return { branch: 'empty', result };
    const q = result.intents.find(i => i.kind === 'query_summary');
    if (q && !result.needsClarification) return { branch: 'summary', result, intent: q };
    const adds = result.intents.filter(i => i.kind === 'add_transaction');
    if (!q && !adds.length) return { branch: 'unparsed', result };
    if (result.needsClarification) return { branch: 'clarify', result, clarification: result.needsClarification };
    return { branch: 'confirm', result, intents: adds };
}

/* ───────── категория, которой нет: варианты, своя категория, ответ словами ───────── */
export const CAT_NEW = '__new__:';     // value кнопки «➕ Своя: «Арбуз»»
export const CAT_OTHER = '__other__';  // value кнопки «✏️ Другая»: просим написать название
const DEFAULT_CATS = { expense: ['продукты', 'кафе и рестораны', 'покупки', 'такси', 'транспорт', 'одежда'], income: ['зарплата', 'аванс', 'подработка', 'входящий перевод', 'подарок', 'премия'] };
// слова-ответы, которые говорят о типе, а не о категории («трата», «доход»): категорию по ним не ищем
const TYPE_ONLY = /^(?:трат\p{L}*|расход\p{L}*|покупк\p{L}*|доход\p{L}*|поступлен\p{L}*|приход\p{L}*|категори\p{L}*|операци\p{L}*|запис\p{L}*|купил\p{L}*|потратил\p{L}*|заработал\p{L}*|получил\p{L}*|своя|свою|новая|новую|другая|другую)$/u;
const answerWords = text => tokenize(fold(text)).map(t => t.w).filter(w => !STOPWORDS.has(w) && !TYPE_ONLY.test(w));

/** Название своей категории из текста: «арбуз» → «Арбуз». До двух слов и 20 символов, без предлогов и слов о типе. */
export function newCategoryName(text) {
    // «что-то», «кое-что», «что-нибудь» названием категории не бывают
    const vague = w => /-(?:то|нибудь|либо)$|^кое-/u.test(fold(w));
    const ws = String(text || '').replace(/[<>«»"{}]/g, ' ').split(/\s+/).filter(w => /\p{L}/u.test(w) && !STOPWORDS.has(fold(w)) && !TYPE_ONLY.test(fold(w)) && !vague(w));
    let name = '';
    for (const w of ws) {
        const next = name ? `${name} ${w}` : w;
        if (next.length > CUSTOM_CATEGORY_NAME_MAX) break;
        name = next;
        if (name.split(' ').length >= 2) break;
    }
    name = name.replace(/[^\p{L}\p{N}\s'-]/gu, '').trim();
    return name ? name[0].toUpperCase() + name.slice(1) : '';
}

/** Кнопки для вопроса о категории: похожие и частые категории, «➕ Своя» и «✏️ Другая». */
export function categoryOptions(intent, ctx, typed = '') {
    const type = intent?.tx?.type === 'income' ? 'income' : 'expense';
    const tIdx = indexCategories(ctx?.categories || {})[type];
    const names = [];
    const push = n => { if (n && tIdx.names.has(n) && !names.includes(n) && names.length < 4) names.push(n); };
    (intent?.suggestions || []).forEach(push);
    const counts = new Map();
    for (const t of ctx?.history || []) if (t?.type === type && typeof t.category === 'string') counts.set(t.category, (counts.get(t.category) || 0) + 1);
    [...counts].sort((a, b) => b[1] - a[1]).forEach(([n]) => push(n));
    // свои категории — сразу после частых: их пользователь создал сам
    [...(tIdx.custom || [])].reverse().slice(0, 2).forEach(e => push(e.name));
    DEFAULT_CATS[type].forEach(k => push(tIdx.byKey.get(k)?.name));
    const out = names.map(v => ({ value: v, label: v }));
    const nm = newCategoryName(typed || intent?.tx?.note || '');
    if (nm && !tIdx.byKey.has(catKey(nm))) out.push({ value: CAT_NEW + nm, label: `➕ Своя: «${nm}»` });
    out.push({ value: CAT_OTHER, label: '✏️ Другая' });
    return out;
}

/** Значение ответа «своя категория» после окна выбора: эмодзи и название. */
export const newCategoryAnswer = (emoji, name) => `${CAT_NEW}${String(emoji || '').replace(/\|/g, '').trim()}|${String(name || '').replace(/\|/g, ' ').trim()}`;

/** Наборы эмодзи для окна «Своя категория» */
export const EMOJI_GROUPS = [
    { id: 'food', label: '🍎 Еда', list: ['🛒', '🥦', '🍎', '🍉', '🍌', '🍇', '🥕', '🍞', '🧀', '🥩', '🍗', '🐟', '🥛', '🥚', '🍳', '🍕', '🍔', '🌯', '🍜', '🍣', '🍰', '🍫', '🍬', '☕', '🍵', '🥤', '🍺', '🍷'] },
    { id: 'move', label: '🚕 Транспорт', list: ['🚕', '🚖', '🚌', '🚇', '🚆', '🚗', '⛽', '🅿️', '🛞', '🔧', '🚲', '🛴', '✈️', '🧳'] },
    { id: 'home', label: '🏠 Дом', list: ['🏠', '🔑', '💡', '💧', '🔥', '🌐', '📱', '🛋️', '🧹', '🧺', '🧴', '🪴', '🐾', '🐶', '🐱', '🧰'] },
    { id: 'shop', label: '🛍️ Покупки', list: ['🛍️', '👕', '👗', '👟', '👜', '💄', '💍', '🎁', '💐', '📦', '💻', '🎧', '⌚', '📷', '🧸', '🪑'] },
    { id: 'fun', label: '🎉 Отдых', list: ['🎬', '🎮', '🎵', '🎨', '📚', '⚽', '🏋️', '🧘', '🏖️', '🏕️', '🎉', '🎂', '🎟️', '🎤', '🎲', '🚬'] },
    { id: 'care', label: '💊 Здоровье', list: ['💊', '🩺', '🦷', '🏥', '👓', '💇', '💅', '👶', '🍼', '🎓', '✏️', '🧠'] },
    { id: 'money', label: '💰 Деньги', list: ['🏷️', '💰', '💵', '💳', '🏦', '📈', '🪙', '💼', '🤝', '🧾', '🛠️', '⭐', '❤️', '🙏'] }
];

/** Эмодзи по умолчанию для своей категории: от похожей существующей категории («Арбуз» → эмодзи «Продуктов»), иначе 🏷️ */
export function suggestEmoji(name, type, ctx) {
    const ws = answerWords(name);
    if (ws.length && ctx?.categories) {
        const res = resolveCategory(ws, ` ${ws.join(' ')} `, type === 'income' ? 'income' : 'expense', indexCategories(ctx.categories), new Map());
        const m = /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}️?)*)/u.exec(res.category || '');
        if (m) return m[1];
    }
    return '🏷️';
}

/**
 * «⇄ Это доход / Это трата» в карточке: меняет тип и заново подбирает категорию нового типа по заметке.
 * Ничего не записывает. Категория не нашлась — category попадает в missing, и чат спрашивает её.
 * @returns {object|null} новое намерение или null (у долгов и вкладов тип не меняется)
 */
export function switchType(intent, ctx) {
    const t = intent?.tx;
    if (!t || (t.type !== 'expense' && t.type !== 'income')) return null;
    const type = t.type === 'expense' ? 'income' : 'expense';
    const next = { ...intent, tx: { ...t, type, category: null }, flags: [...(intent.flags || [])], missing: (intent.missing || []).filter(m => m !== 'category'), suggestions: [] };
    delete next.memory;
    delete next.newCategory;
    const ws = answerWords(t.note || '');
    if (ws.length && ctx) {
        const cIdx = indexCategories(ctx.categories || {});
        const res = resolveCategory(ws, ` ${ws.join(' ')} `, type, cIdx, buildLearned(ctx.history, cIdx));
        if (res.category) { next.tx.category = res.category; if (res.memory) next.memory = res.memory; }
        else next.suggestions = res.suggestions || [];
    }
    if (!next.tx.category) next.missing.push('category');
    return next;
}

/** Своя категория без операции («мало категорий» → окно): проверка и новое хранилище { value, categories } или { error } */
export function createCustomCategory(store, type, emoji, name, ctx) {
    const t = type === 'income' ? 'income' : 'expense';
    const existing = ctx?.categories ? [...indexCategories(ctx.categories)[t].names] : [];
    return addCustomCategory(store, t, emoji, name, existing);
}

/** Вопрос с предметом: «В какую категорию записать «арбуз»?» */
export function questionOf(nc, intent) {
    if (nc?.field !== 'category' || intent?.kind !== 'add_transaction') return nc?.question || '';
    if (nc.typed) return `Категории «${nc.typed}» пока нет. Выбери похожую или создай свою:`;
    const note = intent.tx?.note;
    if (intent.tx?.type === 'income') return `${note ? `Куда записать доход «${note}»?` : 'Куда записать этот доход?'} Выбери категорию или создай свою.`;
    return `${note ? `В какую категорию записать «${note}»?` : 'В какую категорию записать трату?'} Выбери или создай свою.`;
}

/** Данные карточки подтверждения: строки, предупреждения, можно ли сохранять. */
export function cardOf(intent) {
    const t = intent?.tx || {};
    const rows = [];
    const label = t.repaymentOf ? 'Погашение долга' : (TYPE_LABEL[t.type] || 'Операция');
    rows.push(['Что', label]);
    rows.push(['Сумма', money(t.amount)]);
    if (t.category) rows.push(['Категория', intent.newCategory ? `${t.category} (новая)` : t.category]);
    if (t.type === 'debt') {
        if (t.name) rows.push(['Кто', t.name]);
        if (DIR_LABEL[t.direction]) rows.push(['Направление', DIR_LABEL[t.direction]]);
    }
    if (ruDate(t.date)) rows.push(['Дата', ruDate(t.date)]);
    if (t.note) rows.push(['Заметка', t.note]);
    const warnings = (intent?.flags || []).filter(f => FLAG_WARNINGS[f]).map(f => FLAG_WARNINGS[f]);
    const canSave = !!(buildDebtPayment(intent) || buildTransaction(intent)) && !(intent?.flags || []).includes('future_date');
    return { rows, warnings, canSave, strong: (intent?.flags || []).some(f => f === 'huge_amount' || f === 'negative_amount'), isDebt: t.type === 'debt' };
}

/** Кнопки-варианты для уточнения: [{ value, label }]. С ctx вопрос о категории получает «➕ Своя» и «✏️ Другая». */
export function optionsOf(clarification, intent, today, ctx = null) {
    if (!clarification) return [];
    if (clarification.field === 'category' && intent?.kind === 'add_transaction' && ctx) return categoryOptions(intent, ctx, clarification.typed);
    if (clarification.field === 'direction') return Object.entries(DIR_LABEL).map(([value, label]) => ({ value, label }));
    if (clarification.field === 'future_date') return futureOptions(intent, today);
    return (clarification.options || []).map(o => ({ value: o, label: o }));
}
function futureOptions(intent, today) {
    return [{ value: 'keep', label: `На ${ruDate(intent.tx.date)}` }, { value: 'today', label: `На сегодня, ${ruDate(today)}` }];
}

const ORDER = ['amount', 'date', 'category', 'name', 'direction', 'deposit', 'rate', 'debtTarget'];
function nextClarification(result) {
    const lang = result.meta?.lang || 'ru';
    for (const f of ORDER) {
        for (let i = 0; i < result.intents.length; i++) {
            const it = result.intents[i];
            if (it.kind === 'add_transaction' && it.missing.includes(f)) return { ...clarificationFor(f, lang, { intent: it }), intentIndex: i };
        }
    }
    const fut = result.intents.findIndex(i => i.flags?.includes('future_date'));
    return fut >= 0 ? { ...clarificationFor('future_date', lang, { intent: result.intents[fut] }), intentIndex: fut } : null;
}

/**
 * Ответ пользователя на вопрос акульки. Варианты (категория, направление, будущая дата) правят намерение на месте,
 * остальное (сумма, дата, имя…) — досыпаем к исходной фразе и разбираем заново.
 * @returns {{kind:'reparse', text:string} | {kind:'result', result:object}}
 */
export function answerClarification(result, answer, origText, ctx = null) {
    const nc = result.needsClarification;
    const reparse = () => ({ kind: 'reparse', text: `${origText} ${answer}`.slice(0, CHAT_MAX) });
    if (!nc) return reparse();
    const it = result.intents[nc.intentIndex ?? 0];
    if (!it || it.kind !== 'add_transaction') return reparse();
    const next = { ...result, intents: result.intents.map(i => ({ ...i, tx: { ...i.tx }, flags: [...(i.flags || [])], missing: [...(i.missing || [])] })) };
    const cur = next.intents[nc.intentIndex ?? 0];
    const setCategory = (name, created = null) => {
        cur.tx.category = name;
        if (created) cur.newCategory = created; else delete cur.newCategory;
        cur.missing = cur.missing.filter(m => m !== 'category');
    };
    // Категория: ответ не дописываем к фразе (иначе он попадает в заметку: «арбуз за Трата»), а ищем отдельно
    const type = it.tx.type === 'income' ? 'income' : 'expense';
    const cIdx = ctx && nc.field === 'category' ? indexCategories(ctx.categories || {}) : null;
    const reask = typed => {
        next.needsClarification = typed ? { ...nc, typed } : { ...nc, typed: undefined };
        return { kind: 'result', result: next };
    };
    if (nc.field === 'category' && cIdx && String(answer).startsWith(CAT_NEW)) {
        // «__new__:Арбуз» (кнопка) или «__new__:🍉|Арбуз» (окно выбора эмодзи и названия)
        const raw = String(answer).slice(CAT_NEW.length);
        const [emoji, name] = raw.includes('|') ? [raw.slice(0, raw.indexOf('|')).trim(), raw.slice(raw.indexOf('|') + 1).trim()] : ['', raw.trim()];
        const built = buildCustomCategory(emoji, name, [...cIdx[type].names]);
        if (built.error) {
            const hit = cIdx[type].byKey.get(catKey(name));
            if (!hit) return reask(newCategoryName(name));
            setCategory(hit.name);
        } else setCategory(built.value, { type, emoji: emoji || '🏷️', name: built.value.slice(built.value.indexOf(' ') + 1), value: built.value });
    } else if (nc.field === 'category' && (it.suggestions?.includes(answer) || cIdx?.[type].names.has(answer))) {
        setCategory(answer);
    } else if (nc.field === 'category' && cIdx) {
        const ws = answerWords(answer);
        if (!ws.length) return reask();
        const res = resolveCategory(ws, ` ${ws.join(' ')} `, type, cIdx, buildLearned(ctx.history, cIdx));
        if (!res.category) {
            cur.suggestions = res.suggestions || [];
            return reask(newCategoryName(answer) || String(answer).trim().slice(0, CUSTOM_CATEGORY_NAME_MAX));
        }
        setCategory(res.category);
    } else if (nc.field === 'direction' && (answer === 'owe' || answer === 'owed')) {
        cur.tx.direction = answer;
        cur.missing = cur.missing.filter(m => m !== 'direction');
    } else if (it.flags.includes('future_date') && !it.missing.length && (answer === 'today' || answer === 'keep')) {
        if (answer === 'today') cur.tx.date = result.meta.today;
        cur.flags = cur.flags.filter(f => f !== 'future_date');
    } else return reparse();
    next.needsClarification = nextClarification(next);
    return { kind: 'result', result: next };
}

/* ───────── валюты: «курс доллара», «100$?», «1 млн сум в долларах» ───────── */
// Валюта по слову или знаку. «сом» — киргизский, «сум / so'm / сўм» — узбекский.
const FX_CUR = [
    ['USD', /\$|(?<![\p{L}])(?:usd|доллар\p{L}*|долл|бакс\p{L}*|dollar\p{L}*|dollor\p{L}*)(?![\p{L}])/gu],
    ['EUR', /€|(?<![\p{L}])(?:eur|евро|euro)(?![\p{L}])/gu],
    ['RUB', /₽|(?<![\p{L}])(?:rub|руб|рубл\p{L}*|rubl\p{L}*)(?![\p{L}])/gu],
    ['CNY', /¥|(?<![\p{L}])(?:cny|юан\p{L}*|yuan)(?![\p{L}])/gu],
    ['KZT', /₸|(?<![\p{L}])(?:kzt|тенге|tenge)(?![\p{L}])/gu],
    ['KGS', /(?<![\p{L}])(?:kgs|сом|сома|сомов|сомах)(?![\p{L}])/gu],
    ['UZS', /(?<![\p{L}])(?:uzs|сум|сума|сумов|сумах|суммов|so'm|сўм|sum)(?![\p{L}'])/gu]
];
const FX_MULT = { к: 1e3, k: 1e3, тыс: 1e3, тысяч: 1e3, тысячи: 1e3, тысяча: 1e3, млн: 1e6, миллион: 1e6, миллиона: 1e6, миллионов: 1e6, mln: 1e6, млрд: 1e9, миллиард: 1e9, миллиарда: 1e9 };
const FX_ASK = /(?:^|\s)(?:сколько|скок\p{L}*|переведи|перевести|конверт\p{L}*|посчитай|пересчитай|по курсу|это сколько|почем|почём|в сумах|в рублях|в долларах|в доллары|в евро|в тенге|в юанях|в сомах)(?:\s|$)/u;

/**
 * Запрос про валюту или null. Сумма с валютой без вопроса («100$ на такси») — это запись, не сюда.
 * @returns {{kind:'rates', code:string|null} | {kind:'convert', amount:number, from:string, to:string} | null}
 */
export function parseFxRequest(text, base = 'UZS') {
    const s = ` ${String(text || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()} `;
    if (s.trim().length > 80) return null;
    const curs = [];
    for (const [code, re] of FX_CUR) for (const m of s.matchAll(re)) curs.push({ code, at: m.index, end: m.index + m[0].length });
    curs.sort((a, b) => a.at - b.at);
    const num = /(\d[\d\s]*(?:[.,]\d+)?)\s*(к|k|тыс\p{L}*|млн|mln|миллион\p{L}*|млрд|миллиард\p{L}*)?(?![\p{L}\d])/u.exec(s);
    const isRate = /(?:^|\s)(?:курс\p{L}*|kurs\p{L}*|rate|rates)(?:\s|$)/u.test(s);
    if (!num) {
        // «доллар сколько стоит», «почём евро»: курс без слова «курс»
        const asksPrice = curs.length && /(?:^|\s)(?:сколько|почем|почём|стоит)(?:\s|$)/u.test(s);
        if (!isRate && !asksPrice) return null;
        return { kind: 'rates', code: (curs.find(c => c.code !== base) || curs[0])?.code || null };
    }
    // «1 млн сум в $», «100 usd to uzs»: две разные валюты через «в / to» — тоже пересчёт
    const twoWay = new Set(curs.map(c => c.code)).size >= 2 && /\s(?:в|во|to|in)\s/u.test(s);
    if (!curs.length || !(s.includes('?') || FX_ASK.test(s) || isRate || twoWay)) return null;
    const mult = num[2] ? (FX_MULT[num[2]] || FX_MULT[num[2].replace(/\p{L}*$/u, '')] || (/^тыс/.test(num[2]) ? 1e3 : /^милл?ион/.test(num[2]) ? 1e6 : /^миллиард/.test(num[2]) ? 1e9 : 1)) : 1;
    const amount = parseFloat(num[1].replace(/\s/g, '').replace(',', '.')) * mult;
    if (!(amount > 0)) return null;
    const numEnd = num.index + num[0].length;
    // «в / во / на / to / in» перед валютой — во что переводим; валюта рядом с числом — из чего
    const target = curs.find(c => /(?:^|\s)(?:в|во|на|to|in)\s*$/u.test(s.slice(Math.max(0, c.at - 4), c.at)) && c.at >= numEnd - 1);
    const from = curs.filter(c => c !== target).sort((a, b) => Math.min(Math.abs(a.at - numEnd), Math.abs(a.end - num.index)) - Math.min(Math.abs(b.at - numEnd), Math.abs(b.end - num.index)))[0];
    if (!from) return null;
    let to = target?.code || curs.find(c => c !== from && c.code !== from.code)?.code || null;
    if (!to || to === from.code) to = from.code === base ? 'USD' : base;
    return { kind: 'convert', amount, from: from.code, to };
}

/* ───────── темы: «смени тему» → выбор в чате, «смени на светлую», «тиффани» → сразу ───────── */
// Как называют темы словами. Длинные варианты важнее коротких: «тёмная классик» — не «тёмная».
export const THEME_ALIASES = {
    'light': ['светлая', 'светлую', 'светлой', 'светлый', 'светлый режим', 'белая', 'белую', 'light', 'лайт', 'дневная', 'дневную'],
    'light-classic': ['светлая классик', 'светлую классик', 'светлая classic', 'светлую classic', 'классическая светлая', 'классическую светлую', 'старая светлая', 'старую светлую', 'light classic', 'зеленая светлая', 'зелёная светлая'],
    'dark': ['темная', 'тёмная', 'темную', 'тёмную', 'темной', 'тёмной', 'темный режим', 'тёмный режим', 'ночной режим', 'черная', 'чёрная', 'черную', 'чёрную', 'dark', 'дарк', 'ночная', 'ночную'],
    'dark-classic': ['темная классик', 'тёмная классик', 'темную классик', 'тёмную классик', 'темная classic', 'тёмная classic', 'классическая темная', 'классическую тёмную', 'классическую темную', 'старая темная', 'старую тёмную', 'старую темную', 'dark classic'],
    'onyx': ['оникс', 'onyx', 'дискорд', 'discord'],
    'burgundy': ['бургунди', 'burgundy', 'бордо', 'бордовая', 'бордовую', 'вишневая', 'вишнёвая', 'вишневую', 'вишнёвую', 'винная', 'винную'],
    'mint': ['мята', 'мяту', 'мятная', 'мятную', 'mint'],
    'shark': ['акулья', 'акулью', 'фирменная', 'фирменную', 'shark', 'тема акулка', 'тему акулка', 'тему акулку', 'тема акулки', 'акулка', 'акулку', 'акулки', 'акульку', 'акулька'],
    'dolphin': ['дельфинчик', 'дельфин', 'дельфина', 'дельфинчика', 'голубая', 'голубую', 'морская', 'морскую', 'dolphin'],
    'monster': ['монстр', 'monster', 'неоновая', 'неоновую'],
    'yogurt': ['йогурт', 'йогуртовая', 'йогуртовую', 'розовая', 'розовую', 'yogurt'],
    'grape': ['грейп', 'grape', 'виноградная', 'виноградную', 'фиолетовая', 'фиолетовую'],
    'blackberry': ['ежевика', 'ежевику', 'ежевичная', 'ежевичную', 'blackberry'],
    'hookah': ['кальянчик', 'кальянная', 'кальянную', 'hookah'],
    'trackit': ['трекит', 'трек ит', 'trackit', 'track it'],
    'tiffany': ['тиффани', 'тифани', 'тиффани', 'tiffany', 'бирюзовая', 'бирюзовую'],
    'sage': ['шалфей', 'sage', 'sage green', 'зеленая', 'зелёная', 'зеленую', 'зелёную', 'природная', 'природную']
};
const THEME_WORD = /(?:^|\s)(?:тем[аыуе]|темку|темы|theme|оформлени\p{L}*|режим)(?:\s|$)/u;
const THEME_VERB = /(?:^|\s)(?:смени\p{L}*|сменить|поменя\p{L}*|помен\p{L}*|постав\p{L}*|включ\p{L}*|сдела\p{L}*|верни|вернуть|переключ\p{L}*|хочу|давай|выбер\p{L}*|выбра\p{L}*|установ\p{L}*|перекрас\p{L}*)(?:\s|$)/u;

/**
 * Запрос о теме или null.
 * { kind:'set', value } — названа тема («смени на светлую», «тиффани»); { kind:'pick' } — «смени тему» без названия;
 * { kind:'random' } — «случайную тему». Фразы с цифрами (записи) — не сюда.
 */
export function parseThemeRequest(text, themes = []) {
    const s = ` ${String(text || '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\s-]+/gu, ' ').replace(/\s+/g, ' ').trim()} `;
    if (/\d/.test(String(text || '')) || s.trim().length > 60) return null;
    const hasWord = THEME_WORD.test(s), hasVerb = THEME_VERB.test(s);
    // самое длинное совпавшее название
    let best = null;
    for (const [value, list] of Object.entries(THEME_ALIASES)) {
        const names = [...list, ...themes.filter(t => t.value === value).map(t => String(t.name || '').toLowerCase())];
        for (const n of names) {
            const a = ` ${n.replace(/ё/g, 'е')} `;
            if (n && s.includes(a) && (!best || a.length > best.len)) best = { value, len: a.length, alias: a.trim() };
        }
    }
    const words = s.trim().split(' ');
    // «Акулка» одним словом — это обращение к ней, а не тема; «другую акулку», «персонаж» — смена персонажа в настройках
    if (best && /^акул/u.test(best.alias)) {
        if (!hasWord && !hasVerb) return null;
        if (/(?:^|\s)(?:друг\p{L}*|персонаж\p{L}*|характер\p{L}*|вид|внешн\p{L}*|худи|классическ\p{L}*)(?:\s|$)/u.test(s)) return null;
    }
    if (best) {
        // название без глагола и слова «тема» — только если больше ничего не написано («тиффани», «тёмная»)
        const alone = s.trim() === best.alias;
        if (hasWord || hasVerb) return { kind: 'set', value: best.value };
        if (alone) return { kind: 'set', value: best.value, alone: true };   // одно название: если так зовут и продукт («trackit») — продукт важнее
        return null;
    }
    if (hasWord && /(?:^|\s)(?:случайн\p{L}*|любую|рандом\p{L}*)(?:\s|$)/u.test(s)) return { kind: 'random' };
    if (hasWord && (hasVerb || words.length <= 3 || /(?:^|\s)(?:другую|другая|новую|какие|какая|выбор|список|покажи)(?:\s|$)/u.test(s))) return { kind: 'pick' };
    return null;
}

/* ───────── настройки персонажа из чата: маскот, характер, болтливость ───────── */
export const SHARK_OPTIONS = {
    shark: [{ value: 'hoodie', icon: '🦈', label: 'Акулка', hint: 'в худи, 27 эмоций' }, { value: 'classic', icon: '🦈', label: 'Акул', hint: 'классический, спокойнее' }],
    character: [{ value: 'kind', icon: '😇', label: 'Добрая', hint: 'не злится, только подскажет' }, { value: 'normal', icon: '🙂', label: 'Обычная', hint: 'злится при перерасходе' }, { value: 'strict', icon: '😠', label: 'Строгая', hint: 'настораживается уже с 70%' }],
    talk: [{ value: 'quiet', icon: '🤫', label: 'Тихая', hint: 'только важное' }, { value: 'normal', icon: '💬', label: 'Обычная', hint: 'реплики время от времени' }, { value: 'chatty', icon: '🗣️', label: 'Болтушка', hint: 'шутки и «хвостики»' }]
};
const SS = s => new RegExp(`(?:^|\\s)(?:${s})(?:\\s|$)`, 'u');
const SET_RULES = [
    // характер
    ['character', 'kind', SS('будь добрее|будь помягче|сделай добрее|стань добрее|добрее|помягче|добрая|добрый режим|добрую|добрый характер|характер добрый|характер добрая')],
    ['character', 'strict', SS('будь строже|сделай строже|стань строже|строже|построже|строгая|строгую|строгий режим|строгий характер|характер строгий|характер строгая|жестче|жёстче')],
    ['character', 'normal', SS('обычный характер|обычную|характер обычный|характер обычная|нормальный характер|будь обычной|как обычно характер')],
    // болтливость
    ['talk', 'quiet', SS('помолчи|замолчи|тише|потише|меньше болтай|не болтай|поменьше болтай|тихая|тихий режим|говори меньше|болтай меньше|меньше слов')],
    ['talk', 'chatty', SS('больше болтай|болтай больше|болтушка|говори больше|поболтай побольше|будь болтливее|болтливее|разговорчивее|режим болтушки')],
    ['talk', 'normal', SS('обычная болтливость|болтливость обычная|говори как обычно|нормальная болтливость')],
    // маскот
    ['shark', 'classic', SS('хочу акула|верни акула|включи акула|переключись на акула|поставь акула|давай акула|классическая акула|классический акул|старая акула|старый акул|акул классический|маскот акул')],
    ['shark', 'hoodie', SS('хочу акулку|верни акулку в худи|акулка в худи|включи акулку в худи|поставь акулку в худи|переключись на акулку|маскот акулка|новая акулка|акулку в худи|худи')]
];
const PICK_RULES = [
    ['shark', SS('смени акулку|сменить акулку|поменяй акулку|поменять акулку|смени акула|сменить акула|поменяй акула|другая акулка|выбрать маскота|сменить маскот|смени маскот|поменяй маскот|поменять маскот|маскот|маскота|сменить вид акулки|смени вид акулки|вид акулки|внешний вид акулки|внешний вид|другую акулку|хочу другую акулку|сменить персонажа|смени персонажа|персонаж|персонажа|выбрать акулку|выбери акулку|какую акулку')],
    ['character', SS('сменить характер|смени характер|поменяй характер|поменять характер|характер|характер акулки|какой характер|выбрать характер|настроение акулки')],
    ['talk', SS('болтливость|сменить болтливость|смени болтливость|поменяй болтливость|настроить болтливость|сколько болтать|режим болтливости')]
];
const PANEL = SS('настроить акулку|настройки акулки|настрой акулку|настройка акулки|акулка настройки|сменить и настроить|сменить и настроить акулку|управление акулкой|настроить персонажа|настройки персонажа|настроить маскота');

/**
 * Настройки Акулки словами. { kind:'set', key, value } — сразу («будь строже», «помолчи», «хочу Акула»);
 * { kind:'pick', key } — выбор кнопками («сменить характер», «смени маскот»); { kind:'panel' } — всё сразу («настроить акулку»).
 */
export function parseSharkSettingsRequest(text) {
    const s = ` ${String(text || '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\s-]+/gu, ' ').replace(/\s+/g, ' ').trim()} `;
    if (/\d/.test(String(text || '')) || s.trim().length > 60) return null;
    if (THEME_WORD.test(s)) return null;                          // «тихая тема», «строгая тема» — про темы
    if (PANEL.test(s)) return { kind: 'panel' };
    const n = s.trim().split(' ').length;
    // одно слово («тише», «строгая», «худи») — только если почти ничего больше нет: «потише с тратами» — не про болтливость
    const ok = m => !!m && (m[0].trim().includes(' ') || n <= 2);
    for (const [key, value, re] of SET_RULES) if (ok(re.exec(s))) return { kind: 'set', key, value };
    for (const [key, re] of PICK_RULES) if (ok(re.exec(s))) return { kind: 'pick', key };
    return null;
}

/* ───────── план из чата: показать, создать, поправить; удалять — только вручную ───────── */
const PLAN_WORD = /(?:^|\s)(?:план(?!шет|ктон)\p{L}*|планировщик\p{L}*|планировани\p{L}*|спланир\p{L}*)(?=\s|$)/u;
const PLAN_CREATE = /(?:^|\s)(?:создай|создать|создадим|новый|новую|составь|составить|составим|сделай|сделать|заведи|завести|хочу|нужен|спланируй|спланировать|спланируем|начни|начать|запусти)(?=\s|$)/u;
const PLAN_EDIT = /(?:^|\s)(?:редактир\p{L}*|отредактир\p{L}*|измени|изменить|поменяй|поменять|поправь|поправить|исправь|исправить|продли|продлить|сократи|сократить|настрой|настроить|правк\p{L}*|редачить|редачь)(?=\s|$)/u;
const PLAN_DELETE = /(?:^|\s)(?:удали|удалить|удалим|сотри|стереть|убери|убрать|снеси)\s+(?:\p{L}+\s+)?план/u;
const PLAN_OPEN = /(?:^|\s)(?:открой|открыть|перейди|перейти|зайди|зайти)\s+(?:в\s+|на\s+)?(?:мой\s+)?(?:план\p{L}*|планировщик\p{L}*)/u;
const PLAN_FAQ = /(?:^|\s)(?:как|зачем|почему|что такое|что значит|чем)(?=\s|$)/u;
const MONTHS_RE = 'январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр';

/** «на 15 дней», «на 2 недели», «на месяц», «на полмесяца» → число дней или null */
export function planDaysOf(s) {
    let m = s.match(/(\d{1,3})\s*(?:дн\p{L}*|день|дня|сут\p{L}*)/u);
    if (m) return +m[1];
    m = s.match(/(\d{1,2})\s*недел\p{L}*/u);
    if (m) return +m[1] * 7;
    if (/(?:^|\s)(?:две|2)\s+недели/u.test(s)) return 14;
    if (/(?:^|\s)(?:полмесяца|пол\s+месяца|полмесяц)/u.test(s)) return 15;
    if (/(?:^|\s)(?:на\s+)?(?:одну\s+)?неделю(?=\s|$)/u.test(s)) return 7;
    if (/(?:^|\s)(?:на\s+)?(?:весь\s+)?месяц(?=\s|$)/u.test(s)) return 30;
    return null;
}

/**
 * Фраза про план.
 * { kind:'show' } — «мой план», «лимит по плану»; { kind:'open' } — «открой планировщик»;
 * { kind:'create', days?, amount?, start? } — «создай план на 15 дней 10 млн»;
 * { kind:'edit' } — «редактировать план»; { kind:'update', days?, addDays?, amount? } — «продли план на 5 дней», «измени сумму плана на 12 млн»;
 * { kind:'delete' } — Акулка не удаляет, только предупреждает.
 */
export function parsePlanRequest(text, today) {
    const src = String(text || '').trim();
    if (!src || src.length > 100) return null;
    const s = ` ${src.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ')} `;
    if (!PLAN_WORD.test(s) || PLAN_FAQ.test(s)) return null;
    if (PLAN_DELETE.test(s)) return { kind: 'delete' };
    const create = PLAN_CREATE.test(s) && !/(?:^|\s)(?:новый|новую)\s+(?:лимит|сумм)/u.test(s);
    const edit = PLAN_EDIT.test(s);
    // параметры: дни, сумма поступления, дата старта
    const days = planDaysOf(s);
    const masked = s
        .replace(/\d{1,3}\s*(?:дн\p{L}*|день|дня|сут\p{L}*|недел\p{L}*|месяц\p{L}*)/gu, ' ')
        .replace(new RegExp(`\\d{1,2}\\s+(?:${MONTHS_RE})\\p{L}*`, 'gu'), ' ')
        .replace(/\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?/g, ' ');
    const amounts = scanAmounts(prepare(masked).norm).map(a => a.value).filter(v => v >= 1000);
    const amount = amounts.length ? Math.max(...amounts) : null;
    let start = null;
    if (/(?:^|\s)с\s+завтра(?:шнего)?(?=\s|$)/u.test(s)) start = addDays(today, 1);
    else if (/(?:^|\s)с\s+сегодня(?:шнего)?(?=\s|$)/u.test(s)) start = today;
    else {
        const d = scanDates(prepare(s).norm, today).find(x => x.date && !x.invalid);
        if (d) start = d.date < today && d.kind === 'named' ? `${+d.date.slice(0, 4) + 1}${d.date.slice(4)}` : d.date;   // «с 1 декабря» — ближайшее, не прошлогоднее
    }
    if (create) {
        const out = { kind: 'create' };
        if (days) out.days = days;
        if (amount) out.amount = amount;
        if (start) out.start = start;
        return out;
    }
    if (edit) {
        if (/(?:^|\s)(?:продли|продлить|увеличь)(?=\s|$)/u.test(s) && days) return { kind: 'update', addDays: days };
        if (days || amount) { const out = { kind: 'update' }; if (days) out.days = days; if (amount) out.amount = amount; return out; }
        return { kind: 'edit' };
    }
    if (PLAN_OPEN.test(s)) return { kind: 'open' };
    if (amount) return null;                                   // «план 50к» без глагола — не команда
    return { kind: 'show' };
}

/** Черновик нового плана из чата (тот же формат, что у формы планировщика) */
export function planDraft({ days = 15, amount = 0, start, today, category = '💰 Зарплата' } = {}) {
    const startDate = start || today;
    const periodDays = Math.max(1, Math.min(366, Number(days) || 15));
    const dd = x => `${x.slice(8, 10)}.${x.slice(5, 7)}`;
    return {
        name: `План ${dd(startDate)}–${dd(addDays(startDate, periodDays - 1))}`,
        incomePlan: { category, amount: Math.max(0, Number(amount) || 0), incomeDate: startDate },
        startDate, periodDays, mainExpenses: [], dailyExpenses: [], regularExpenses: [], plannedDeposits: []
    };
}

/* ───────── «потише с тратами!» — это ведь не Акулка тратит ───────── */
const TEASE_RE = [
    /(?:^|\s)(?:потише|тише|полегче|поменьше|меньше|хватит|прекрати|перестань|харэ|хорош|завязывай|тормози|притормози|умерь)\s+(?:(?:с|со)\s+)?(?:трат\p{L}*|трать|тратить|транжир\p{L}*|покуп\p{L}*|шопинг\p{L}*|деньгами|расход\p{L}*|аппетит\p{L}*)(?:\s|$)/u,
    /(?:^|\s)(?:не\s+)?(?:трать|тратить|покупай|транжирь)\s+(?:так\s+)?(?:меньше|поменьше|потише|много|столько|лишнего)(?:\s|$)/u,
    /(?:^|\s)не\s+(?:транжирь|транжирь-ка|шикуй|сори\s+деньгами)(?:\s|$)/u,
    /^(?:экономь|экономнее|экономней|сэкономь|будь\s+экономнее|будь\s+экономней)(?:\s+(?:давай|уже|пожалуйста|акулка|акул))*$/u
];
const TEASE_STOP = /(?:^|\s)(?:как|почему|зачем|что|чем|сколько|где|когда|можно|подскажи|помоги|совет\p{L}*|хочу|надо|нужно|мне|я|мы|научи|расскажи|план)(?:\s|$)/u;
/** true — фраза «потише с тратами», «не транжирь», «экономь давай»: Акулка отшучивается */
export function isSpendTease(text) {
    const src = String(text || '');
    if (/\d/.test(src) || src.length > 60) return false;
    const s = src.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\s-]+/gu, ' ').replace(/\s+/g, ' ').trim();
    if (!s || s.split(' ').length > 7 || TEASE_STOP.test(s)) return false;
    return TEASE_RE.some(re => re.test(s));
}

/* ───────── бюджеты из чата: создать, сменить; удалять — только вручную ───────── */
export const BUDGET_NAME_MAX = 13;                     // как у поля «Новый бюджет» (maxlength="13")
const budgetKey = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, '');
const NAME_LEAD = /^(?:(?:с|под)\s+названием|названием|с\s+именем|по\s+имени|называется|назови(?:\s+его)?|имя|на|для|под)\s+/iu;
const cleanName = s => {
    let n = String(s || '').trim().replace(/^[\s:—–-]+/u, '');
    for (let i = 0; i < 3 && NAME_LEAD.test(n); i++) n = n.replace(NAME_LEAD, '');
    n = n.replace(/^["'«“„]+|["'»”“.!?]+$/gu, '').trim();
    return n ? n[0].toUpperCase() + n.slice(1) : '';
};
const B_HEAD = '^\\s*(?:(?:акулка|акул|эй)[,!\\s]+)?(?:пожалуйста[,\\s]+)?';
const B_CREATE = new RegExp(`${B_HEAD}(?:создай|создать|созда[её]м|сделай|сделать|добавь|добавить|заведи|завести|нужен|хочу)\\s+(?:мне\\s+|ещ[её]\\s+)*(?:нов(?:ый|ого)\\s+|ещ[её]\\s+один\\s+|отдельн(?:ый|ого)\\s+)*бюджет(?:а)?(?=\\s|$|[,.!:])(.*)$`, 'iu');
const B_NEW = new RegExp(`${B_HEAD}(?:(?:открой|открыть)\\s+)?нов(?:ый|ого)\\s+бюджет(?:а)?(?=\\s|$|[,.!:])(.*)$`, 'iu');
const B_SWITCH = new RegExp(`${B_HEAD}(?:смени|сменить|поменяй|поменять|переключи|переключить|переключись|переключиться|перейди|перейти|открой|открыть|выбери|выбрать|покажи|показать|зайди|зайти)\\s+(?:мне\\s+)?(?:на\\s+|в\\s+)?(?:другой\\s+|мои\\s+|все\\s+)?бюджет(?:а|ы|у|ов)?(?=\\s|$|[,.!:])(.*)$`, 'iu');
const B_LIST = /^\s*(?:мои|все|другой|список|какие\s+у\s+меня|сколько\s+у\s+меня)\s+(?:бюджеты|бюджет|бюджетов)\s*\??\s*$/iu;
const B_GO = new RegExp(`${B_HEAD}(?:переключи(?:сь)?|перейди|открой|зайди)\\s+(?:на|в)\\s+(.+)$`, 'iu');
const B_DELETE = /(?:^|\s)(?:удали|удалить|удалим|удаляй|удаление|стереть|сотри|снеси|снести|убери|убрать|очисти|очистить)\s+(?:\p{L}+\s+){0,2}бюджет/iu;

/** Бюджет по названию: точное совпадение без эмодзи и регистра, потом по началу. */
export function findBudget(name, budgets = []) {
    const k = budgetKey(name);
    if (!k) return -1;
    const keys = budgets.map(b => budgetKey(b?.name));
    let i = keys.indexOf(k);
    if (i >= 0) return i;
    if (k.length >= 3) {
        i = keys.findIndex(x => x && (x.startsWith(k) || (x.length >= 3 && k.startsWith(x))));
        if (i >= 0) return i;
        const st = k.length > 5 ? k.slice(0, k.length - 2) : k;           // «в отпуске» → «Отпуск»
        i = keys.findIndex(x => x && x.length >= 4 && (x.startsWith(st) || st.startsWith(x.slice(0, Math.max(4, x.length - 1)))));
    }
    return i;
}

/**
 * «создай бюджет» → { kind:'create' }; «создай бюджет Отпуск» → { kind:'create', name:'Отпуск' };
 * «смени бюджет» / «мои бюджеты» → { kind:'switch' }; «перейди в бюджет Дом» → { kind:'switch', name, index };
 * «удали бюджет» → { kind:'delete' } (Акулка не удаляет, только предупреждает).
 */
export function parseBudgetRequest(text, budgets = []) {
    const src = String(text || '').trim();
    if (!src || src.length > 80) return null;
    if (B_DELETE.test(src)) return { kind: 'delete' };
    if (/\d{3,}|\d+\s*(?:к|k|тыс|млн)/iu.test(src)) return null;     // «бюджет 500к» — это не команда
    let m = src.match(B_CREATE) || src.match(B_NEW);
    if (m) {
        const name = cleanName(m[1]);
        return name ? { kind: 'create', name } : { kind: 'create' };
    }
    if (B_LIST.test(src)) return { kind: 'switch' };
    m = src.match(B_SWITCH);
    if (m) {
        const name = cleanName(m[1]);
        if (!name) return { kind: 'switch' };
        const index = findBudget(name, budgets);
        return index >= 0 ? { kind: 'switch', name, index } : { kind: 'switch', name, index: -1 };
    }
    m = src.match(B_GO);
    if (m) {
        const index = findBudget(cleanName(m[1]), budgets);
        if (index >= 0) return { kind: 'switch', name: cleanName(m[1]), index };
    }
    return null;
}

/** Проверка названия перед созданием: '' — можно; иначе причина */
export function budgetNameProblem(name, budgets = []) {
    const n = String(name || '').trim();
    if (!n) return 'empty';
    if ([...n].length > BUDGET_NAME_MAX) return 'long';
    if (!/^[\p{L}\p{N}\p{Emoji_Presentation}\s-]+$/u.test(n)) return 'chars';
    if (budgets.some(b => budgetKey(b?.name) === budgetKey(n) && budgetKey(n))) return 'exists';
    return '';
}

/* ───────── опечатки: словарь слов, которые понимают команды и разборы ───────── */
// слова разборов (план, бюджеты, настройки, вопросы о деньгах), которых нет во фразах команд
const PARSER_WORDS = `план плана плану планом планы планировщик планировщика спланируй спланировать составь составить создай создать создадим новый новую
 сделай сделать заведи завести смени сменить поменяй поменять измени изменить редактировать отредактировать редачить продли продлить удали удалить
 открой открыть покажи показать перейди перейти переключи переключись выбери выбрать бюджет бюджета бюджету бюджеты бюджетов характер характера
 болтливость маскот маскота персонаж персонажа внешний вид акулку акулка акулки акул акула добрее строже помолчи замолчи болтай болтушка больше меньше
 потише тише трат траты тратами тратить трать транжирь экономь хватит тормози средний средняя средние чек самая самый крупная крупный большая трата трату
 покупка покупку расход расходы доход доходы доходов зарплата зарплаты зарплате аванс аванса кэшбек кешбек кэшбэк проценты когда сколько осталось осталось
 дней дня день до неделю недели неделя неделе месяц месяца месяце месяцев год года году прошлую прошлый прошлой прошлом этой этот этом всё время вчера
 позавчера сегодня завтра накопления накоплений отложил отложила потратил потратила потрачено заработал заработала получил получила деньги денег
 последняя последнюю последний последнее запись записи запиши лимит лимита день сумма сумму сумма тема тему темы светлая светлую темная темную
 курс курсы валют доллар доллара евро рубль рублей тысяч тысячи миллион миллиона млн лимит истории сторис сторисы итог итоги неделя категории категорию
 январь января январе февраль февраля феврале март марта марте апрель апреля апреле май мая мае июнь июня июне июль июля июле август августа августе
 сентябрь сентября сентябре октябрь октября октябре ноябрь ноября ноябре декабрь декабря декабре такси еда еду продукты кофе обед ужин`;
// частые слова переписки: их не «исправляем» во что-то похожее («привет» ≠ «придет»)
const COMMON_WORDS = `привет пока спасибо хорошо отлично нормально норм класс круто супер ладно давай понял поняла понятно ясно ага угу окей
 добрый доброе утро вечер ночь ночи день здравствуй здравствуйте мама маме мамы папа папе папы брат брату сестра сестре друг другу подруга подруге жена жене
 муж мужу сын сыну дочь дочке дочери ребенок ребенку дети детям купил купила купили взял взяла взяли оплатил оплатила заплатил заплатила дал дала
 отдал отдала вернул вернула занял заняла одолжил одолжила подарок подарки подарил подарила магазин рынок базар работа работы работу дом дома домой
 ещё еще очень много мало можно нужно надо хочу буду было была были есть будет сейчас потом тоже только просто вообще кстати пожалуйста плиз блин короче
 почему зачем какой какая какие сколько когда где куда откуда кто что чем чего этот эта эти тот та те свой своя свои наш наша наши ваш`;
let BASE_VOCAB = null;
/** Словарь для исправления опечаток: команды, разборы, категории; extra — названия категорий, бюджетов, вопросы FAQ (не исправлять их) */
export function chatVocab(extra = []) {
    if (!BASE_VOCAB) {
        const lex = [];
        for (const r of [...CATEGORY_RULES, ...QUERY_GROUPS]) for (const k of [...(r.k || []), ...(r.m || [])]) if (!String(k).includes('*')) lex.push(k);
        BASE_VOCAB = buildVocab([
            [COMMANDS.flatMap(c => c.phrases || []), 4],
            [Object.values(SMALL_TALK).flat(), 4],
            [COMMON_WORDS.split(/\s+/), 3],
            [PARSER_WORDS.split(/\s+/), 4],
            [Object.values(THEME_ALIASES).flat(), 3],
            [lex, 2]
        ]);
    }
    if (!extra.length) return BASE_VOCAB;
    const v = new Map(BASE_VOCAB);
    for (const [w, weight] of buildVocab([[extra, 1]])) if (!v.has(w)) v.set(w, weight);
    return v;
}
export { fixTypos };

/* ───────── кто отвечает на набранную фразу ───────── */
/**
 * Порядок ответа в чате (одно место, чтобы правила не разъехались):
 *  1) тема («смени на светлую»); название одним словом, которое совпадает с продуктом («trackit»), — продукт;
 *  2) валюта («100$?»); 3) «Вопросы и ответы» — важнее общих команд («как установить BudgetIt на iPhone»);
 *  4) продукт Akulka Projects; 5) команда; 6) разбор фразы — запись или вопрос («чай 15к», «купил чай»).
 * Ничего не показывает и не пишет.
 * @param {{cmd:object|null, theme:object|null, fx:object|null, faq:object|null, project:object|null}} found — что нашли проверки
 * @returns {{kind:'theme'|'fx'|'faq'|'project'|'command'|'parse', value?:object}}
 */
export function pickAnswer({ cmd = null, theme = null, fx = null, faq = null, project = null, call = false, shark = null, stat = null, income = null, budget = null, tease = null, plan = null } = {}) {
    if (call) return { kind: 'call', value: call };
    if (budget) return { kind: 'budget', value: budget };
    if (plan) return { kind: 'plan', value: plan };
    if (shark) return { kind: 'shark', value: shark };
    if (tease) return { kind: 'tease', value: tease };
    if (stat) return { kind: 'stat', value: stat };
    if (income) return { kind: 'income', value: income };
    if (theme && !(theme.alone && project)) return { kind: 'theme', value: theme };
    if (fx) return { kind: 'fx', value: fx };
    if (faq && (!cmd || ['examples', 'dialog', 'help'].includes(cmd.id))) return { kind: 'faq', value: faq };
    if (project && (!cmd || ['examples', 'dialog', 'help', 'fun', 'projects'].includes(cmd.id))) return { kind: 'project', value: project };
    if (cmd) return { kind: 'command', value: cmd };
    return { kind: 'parse' };
}

/* ───────── страницы и функции приложения: «открой аналитику», «сделай бэкап», «загрузить выписку» ───────── */
// act — действие SharkUI.runAction; text — что там можно сделать; btn — подпись кнопки
export const NAV = {
    analytics: { act: 'analytics', btn: '📊 Открыть аналитику', text: 'В «Аналитике» графики трат и доходов, разбивка по категориям и сравнение месяцев.' },
    planner: { act: 'planner', btn: '🗓️ Открыть план', text: 'В «Плане» доходы и обязательные платежи на месяц, а из них считается, сколько можно тратить в день.' },
    shark: { act: 'shark', btn: '🦈 Настроить Акулку', text: 'В настройках Акулки меняются характер, болтливость, внешний вид и лимит.' },
    limit: { act: 'limit', btn: '🎯 Настроить лимит', text: 'Дневной лимит можно задать вручную или оставить расчёт по твоим тратам.' },
    settings: { act: 'settings', btn: '⚙️ Открыть настройки', text: 'В профиле тема, регион, данные, Акулка и всё остальное.' },
    theme: { act: 'theme', btn: '🎨 Выбрать тему', text: 'Тем 17: светлые и тёмные, от «Акулки» до «Тиффани».' },
    accounts: { act: 'accounts', btn: '🏦 Открыть счета', text: 'В «Счетах» видно, где лежат деньги: карты, наличные и вклады.' },
    backup: { act: 'data', btn: '💾 Открыть бэкапы', text: 'В «Данных и бэкапах» можно сохранить копию, восстановить её и выгрузить всё в Excel.' },
    import: { act: 'import', btn: '⚡ Загрузить выписку', text: '«Залётом» загружает выписку банка: я сама разберу операции и разложу по категориям, а ты проверишь перед записью.' },
    add: { act: 'add', btn: '➕ Добавить вручную', text: 'Форма добавления: трата, поступление, долг или вклад, с датой и заметкой.' },
    fx: { act: 'fx', btn: '💱 Открыть курсы', text: 'В «Курсах» курсы ЦБ, график за неделю и калькулятор.' }
};

/* ───────── частые категории для чипсов над полем ввода ───────── */
/** Категории, в которые чаще всего записывали за 90 дней: [{ category, type, count, amounts }] (amounts — последние разные суммы) */
export function frequentCategories(transactions, today, limit = 10) {
    const from = addDays(today, -90);
    const by = new Map();
    for (const t of Array.isArray(transactions) ? transactions : []) {
        if (!t || (t.type !== 'expense' && t.type !== 'income') || !t.category || !t.date || t.date < from || t.date > today) continue;
        const k = `${t.type}|${t.category}`;
        const e = by.get(k) || { category: t.category, type: t.type, count: 0, last: '', list: [] };
        e.count++;
        if (t.date > e.last) e.last = t.date;
        e.list.push({ date: t.date, id: idNum(t), amount: amountOf(t) });
        by.set(k, e);
    }
    const out = [...by.values()].filter(e => e.count >= 2).sort((a, b) => b.count - a.count || b.last.localeCompare(a.last)).slice(0, limit);
    return out.map(e => {
        const amounts = [];
        for (const x of e.list.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)) if (x.amount > 0 && !amounts.includes(x.amount) && amounts.length < 3) amounts.push(x.amount);
        return { category: e.category, type: e.type, count: e.count, amounts };
    });
}

/**
 * Запись из чипса: категория выбрана, текст даёт сумму, дату и заметку («45к», «вчера 30к такси до работы»).
 * @returns route как у routeUtterance: confirm / clarify (нет суммы) / unparsed
 */
export function routeQuick(text, quick, ctx) {
    const r = routeResult(parseUtterance(text, ctx));
    const add = r.result.intents.find(i => i.kind === 'add_transaction');
    if (!add || r.result.intents.length !== 1) return r;
    add.tx = { ...add.tx, type: quick.type, category: quick.category };
    delete add.tx.name; delete add.tx.direction; delete add.tx.repaymentOf;
    delete add.memory; delete add.newCategory;
    add.missing = add.missing.filter(m => !['category', 'name', 'direction', 'deposit', 'rate', 'debtTarget'].includes(m));
    add.flags = add.flags.filter(f => f !== 'debt_repayment' && f !== 'direction_guess');
    add.quick = true;
    r.result.needsClarification = nextClarification(r.result);
    return routeResult(r.result);
}

/* ───────── команды по записям: последняя, отмена последней, средний чек, крупная трата, зарплата ───────── */
// Чистые функции: считают по массиву операций и строке today (YYYY-MM-DD). Удаление делает UI после подтверждения.
const TYPE_WORD = { expense: 'трата', income: 'поступление', debt: 'долг', deposit: 'вклад' };
const amountOf = t => Number(t?.amount ?? t?.initialAmount) || 0;
const idNum = t => (Number.isFinite(Number(t?.id)) ? Number(t.id) : 0);

/** Самая новая запись бюджета: по id (время создания), при равенстве — последняя в списке. */
export function lastRecord(transactions) {
    let best = null;
    for (const t of Array.isArray(transactions) ? transactions : []) if (t && TYPE_WORD[t.type] && (!best || idNum(t) >= idNum(best))) best = t;
    return best;
}
/** «трата 50 000 · 🍏 Фрукты · 23.11.2026» */
export function recordLabel(t) {
    if (!t) return '';
    const what = t.type === 'debt' ? t.name : (t.category || t.name || t.status || '');
    return [`${TYPE_WORD[t.type] || 'запись'} ${money(amountOf(t))}`, what, ruDate(t.date)].filter(Boolean).join(' · ');
}
/** Удалять из чата можно только простые траты и поступления: у долгов и вкладов есть погашения и пополнения. */
export const canUndo = t => !!t && (t.type === 'expense' || t.type === 'income');

// траты за период (по умолчанию — текущий месяц); будущее отрезаем: считаем по сегодня включительно
const periodSpends = (transactions, today, period = null) => {
    const from = period ? period.from : `${today.slice(0, 7)}-01`;
    const to = period?.to && period.to < today ? period.to : today;
    return (Array.isArray(transactions) ? transactions : []).filter(t => isConsumption(t) && t.date && (!from || t.date >= from) && t.date <= to);
};

/** Средний чек за период (по умолчанию — текущий месяц): { avg, perDay, count, total, days } или null */
export function averageSpend(transactions, today, period = null) {
    const list = periodSpends(transactions, today, period);
    if (!list.length) return null;
    const total = list.reduce((s, t) => s + amountOf(t), 0);
    // дни считаем с начала периода, но не раньше первой записи бюджета: «за прошлый год» при записях с 27 января — с 27 января
    const first = (Array.isArray(transactions) ? transactions : []).reduce((m, t) => (t?.date && t.date < m ? t.date : m), today);
    const start = period ? period.from : `${today.slice(0, 7)}-01`;
    const from = !start || start < first ? first : start;
    const to = period?.to && period.to < today ? period.to : today;
    const days = Math.max(1, diffDays(to, from) + 1);
    return { avg: Math.round(total / list.length), perDay: Math.round(total / days), count: list.length, total, days };
}
/** Самая крупная трата за период (по умолчанию — текущий месяц) или null */
export function biggestSpend(transactions, today, period = null) {
    let best = null;
    for (const t of periodSpends(transactions, today, period)) if (!best || amountOf(t) > amountOf(best)) best = t;
    return best;
}

const MONTH_IN = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];
/** «на этой неделе», «в октябре», «за 01.09–23.11» — для фраз вида «Средний чек {per}: …» */
export function periodLabel(p, today) {
    const dd = x => `${x.slice(8, 10)}.${x.slice(5, 7)}${x.slice(0, 4) !== today.slice(0, 4) ? `.${x.slice(0, 4)}` : ''}`;
    switch (p?.kind) {
        case undefined: case null: case 'this_month': return 'в этом месяце';
        case 'today': return 'сегодня';
        case 'yesterday': return 'вчера';
        case 'this_week': return 'на этой неделе';
        case 'last_week': return 'на прошлой неделе';
        case 'last_month': return 'в прошлом месяце';
        case 'month': { const { y, m } = parseYmd(p.from); return `в ${MONTH_IN[m - 1]}${String(y) !== today.slice(0, 4) ? ` ${y}` : ''}`; }
        case 'this_year': return 'в этом году';
        case 'last_year': return 'в прошлом году';
        case 'all': return 'за всё время';
        case 'day': return dd(p.from);
        default: {
            if (!p.from || !p.to) return 'за всё время';
            const to = p.to < today ? p.to : today;
            return `за ${dd(p.from)}–${dd(to)}`;
        }
    }
}

const AVG_RE = /(?:^|\s)(?:средн\p{L}*\s+(?:чек\p{L}*|трат\p{L}*|расход\p{L}*|покупк\p{L}*)|в\s+среднем)(?:\s|$)/u;
// только одна трата («самая крупная трата»): «самые крупные траты за октябрь» — это топ, его считает парсер
const BIG_RE = /(?:^|\s)(?:сам(?:ая|ый|ую|ой)\s+(?:крупн|больш|дорог)\p{L}*|крупнейш\p{L}*|максимальн\p{L}*)\s+(?:трат[аеуы]?|покупк[аеуи]|расход[аы]?)(?:\s|$)/u;
/**
 * «средний чек за неделю», «самая крупная трата в октябре» → { id:'avg'|'biggest', period }.
 * Без явного периода — null: тогда отвечает обычная команда (текущий месяц).
 */
export function statRequest(text, today) {
    const src = String(text || '');
    if (src.length > 80) return null;
    const low = src.toLowerCase().replace(/ё/g, 'е');
    const id = AVG_RE.test(low) ? 'avg' : BIG_RE.test(low) ? 'biggest' : null;
    if (!id) return null;
    const period = parsePeriod(prepare(src).norm, today);
    return period?.explicit ? { id, period } : null;
}

/* ───────── доходы по графику: когда придут зарплата, аванс и любая другая категория дохода ───────── */
export const SALARY_RE = /зарплат|аванс|оклад|получк|maosh|oylik|salary/i;
export const INCOME_MIN_MONTHS = 2;
const pluralDays = n => { const a = Math.abs(n) % 100, b = a % 10; return `${n} ${a > 10 && a < 20 ? 'дней' : b === 1 ? 'день' : b >= 2 && b <= 4 ? 'дня' : 'дней'}`; };
export { pluralDays };

/**
 * График поступлений по категориям за последние полгода.
 * Для каждой категории: дни месяца, в которые деньги приходили хотя бы в 2 разных месяцах (среднее по ним),
 * и следующая дата: если в этом месяце уже пришло — тот же день следующего месяца, иначе — средний день этого месяца.
 * @param {(cat:string)=>boolean} [only] какие категории нужны
 * @returns {Array<{category, enough:boolean, months:number, slots:Array<{avgDay, next, days, late}>}>} по ближайшей дате
 */
export function incomeSchedule(transactions, today, only = null) {
    const T = parseYmd(today);
    const curYm = today.slice(0, 7);
    const from = addMonthsClamp(`${curYm}-01`, -6);
    const byCat = new Map();
    for (const t of Array.isArray(transactions) ? transactions : []) {
        if (t?.type !== 'income' || !t.date || t.date < from || t.date > today) continue;
        const cat = String(t.category || '').trim() || 'Без категории';
        if (only && !only(cat, t)) continue;
        if (!byCat.has(cat)) byCat.set(cat, []);
        byCat.get(cat).push({ date: t.date, d: parseYmd(t.date).d, ym: t.date.slice(0, 7) });
    }
    const at = (y, m, d) => fmtYmd(y, m, Math.min(d, daysInMonth(y, m)));
    const nextMonth = d => (T.m === 12 ? at(T.y + 1, 1, d) : at(T.y, T.m + 1, d));
    const out = [];
    for (const [category, list] of byCat) {
        const months = new Set(list.map(e => e.ym)).size;
        if (months < INCOME_MIN_MONTHS) { out.push({ category, enough: false, months, slots: [] }); continue; }
        // дни месяца группируем: 3, 5 и 7 число — один и тот же «день зарплаты» (разброс не больше 6 дней)
        const sorted = [...list].sort((a, b) => a.d - b.d);
        const clusters = [];
        for (const e of sorted) {
            const last = clusters[clusters.length - 1];
            if (last && e.d - last[0].d <= 6) last.push(e); else clusters.push([e]);
        }
        // прошедшие месяцы, когда категория уже была: от первой записи до прошлого месяца
        const firstYm = list.reduce((m, e) => (e.ym < m ? e.ym : m), curYm);
        const pastMonths = Math.max(1, (T.y * 12 + T.m) - (+firstYm.slice(0, 4) * 12 + +firstYm.slice(5, 7)));
        const slots = [];
        // больше двух поступлений в месяц (проценты, переводы) — это не выплата по графику; зарплата + аванс в одной категории — ровно два
        const frequent = list.length / months > 2;
        for (const c of frequent ? [] : clusters) {
            const ms = new Set(c.map(e => e.ym));
            if (ms.size < INCOME_MIN_MONTHS) continue;
            // по графику — примерно раз в месяц и хотя бы в 60% прошедших месяцев; проценты каждый день и случайные переводы — нет
            if (c.length / ms.size > 1.5) continue;
            if ([...ms].filter(ym => ym !== curYm).length < Math.ceil(pastMonths * 0.6)) continue;
            const avgDay = Math.round(c.reduce((s, e) => s + e.d, 0) / c.length);
            const got = c.filter(e => e.ym === curYm).sort((a, b) => b.d - a.d)[0];
            let next, late = false;
            if (got) next = nextMonth(got.d);                       // пришло в этом месяце → то же число в следующем
            else if (avgDay >= T.d) next = at(T.y, T.m, avgDay);    // ещё впереди в этом месяце
            else { next = at(T.y, T.m, avgDay); late = true; }      // обычно уже приходит, но в этом месяце записи нет
            slots.push({ avgDay, next, days: diffDays(next, today), late });
        }
        slots.sort((a, b) => (a.late - b.late) || a.next.localeCompare(b.next));
        out.push({ category, enough: true, months, slots });
    }
    const key = r => (!r.enough ? '9' : !r.slots.length ? '8' : r.slots.every(s => s.late) ? '7' : `0${r.slots.find(s => !s.late).next}`);
    return out.sort((a, b) => key(a).localeCompare(key(b)));
}

const stemOf = w => { const s = fold(w).replace(/э/g, 'е'); return s.length > 5 ? s.slice(0, s.length - 2) : s.slice(0, Math.max(4, s.length - 1)); };
const catHead = name => (String(name).toLowerCase().replace(/ё/g, 'е').match(/\p{L}{3,}/u) || [''])[0];
const INC_ASK = /(?:^|\s)(?:когда|сколько\s+(?:(?:дней|дня|осталось|еще|ждать|времени)\s+)*до|через\s+сколько|долго\s+(?:ли\s+)?(?:еще\s+)?(?:ждать\s+)?до|скоро\s+ли|ждать)(?:\s|$)/u;
/**
 * «когда аванс», «сколько дней до зарплаты и аванса», «когда фриланс», «когда придут доходы».
 * @param {string[]} categories категории доходов (встроенные, свои и из записей)
 * @returns {{salary?:true, all?:true, cats?:string[]}|null}
 */
export function incomeRequest(text, categories = []) {
    const src = String(text || '');
    if (/\d/.test(src) || src.length > 80) return null;
    const low = ` ${src.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\s]+/gu, ' ').replace(/\s+/g, ' ').trim()} `;
    if (!INC_ASK.test(low)) return null;
    const words = low.trim().split(' ');
    if (words.some(w => /^(?:зарплат|зп$|аванс|получк|оклад)/u.test(w))) {
        const named = words.filter(w => /^(?:аванс)/u.test(w)).length && !words.some(w => /^(?:зарплат|зп$|получк|оклад)/u.test(w)) ? ['аванс'] : null;
        return named ? { salary: true, cats: categories.filter(c => /аванс/i.test(c)) } : { salary: true };
    }
    const cats = [];
    for (const c of categories) {
        const head = catHead(c);
        if (head.length < 3 || SALARY_RE.test(head)) continue;
        const st = stemOf(head);
        if (words.some(w => w.length >= 3 && fold(w).replace(/э/g, 'е').startsWith(st))) cats.push(c);
    }
    if (cats.length) return { cats: [...new Set(cats)] };
    if (words.some(w => /^(?:доход|поступлен|деньг|приход)/u.test(w)) && !/потрат|трат|расход/u.test(low)) return { all: true };
    return null;
}
/**
 * Ближайшая зарплата по истории: дни месяца, в которые за последние 4 месяца приходили зарплата или аванс.
 * @returns {{date:string, days:number}|null}
 */
export function nextPayday(transactions, today) {
    const from = addDays(today, -124);
    const days = new Set();
    for (const t of Array.isArray(transactions) ? transactions : []) {
        if (t?.type !== 'income' || !t.date || t.date < from || t.date > today) continue;
        if (/зарплат|аванс|оклад|maosh|oylik|salary/i.test(String(t.category || '') + ' ' + String(t.description || ''))) days.add(parseYmd(t.date).d);
    }
    if (!days.size) return null;
    const T = parseYmd(today);
    const at = (y, m, d) => fmtYmd(y, m, Math.min(d, daysInMonth(y, m)));
    const cands = [];
    for (const d of days) {
        cands.push(at(T.y, T.m, d));
        cands.push(T.m === 12 ? at(T.y + 1, 1, d) : at(T.y, T.m + 1, d));
    }
    const next = cands.filter(d => d >= today).sort()[0];
    return { date: next, days: diffDays(next, today) };
}

/** Запись после подтверждения. bm — BudgetManager. Не пишет, если будущая дата не подтверждена. */
export function commitIntent(intent, bm, { id = Date.now() } = {}) {
    if (!intent || intent.flags?.includes('future_date')) return { ok: false, reason: 'future_date' };
    const pay = buildDebtPayment(intent);
    if (pay) {
        bm.markDebtPayment(pay.debtId, pay.amount);
        return { ok: true, kind: 'repayment', payment: pay };
    }
    const tx = buildTransaction(intent, { id });
    if (!tx) return { ok: false, reason: 'incomplete' };
    // своя категория создаётся только вместе с операцией, после «✓ Записать»
    const nc = intent.newCategory;
    let created = null;
    if (nc && (tx.type === 'expense' || tx.type === 'income')) {
        const have = bm.customCategories?.[nc.type] || [];
        if (!have.includes(tx.category)) {
            const res = addCustomCategory(bm.customCategories, nc.type, nc.emoji, nc.name, have);
            if (res.error) return { ok: false, reason: 'category', error: res.error };
            bm.customCategories = res.categories;
            created = res.value;
        }
    }
    bm.addTransaction(tx);
    return { ok: true, kind: 'tx', tx, newCategory: created };
}
