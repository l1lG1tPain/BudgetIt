// categories.js — сопоставление слов с СУЩЕСТВУЮЩИМИ категориями бюджета.
// Порядок: 1) выученное по истории пользователя, 2) точное совпадение слова с коротким названием категории,
// 3) словарь lexicon.js, 4) нечёткое совпадение. Новая категория никогда не создаётся: нет совпадения → null + подсказки.
import { fold } from './normalize.js';
import { CATEGORY_RULES, QUERY_GROUPS, QUERY_BRANDS, STOPWORDS } from './lexicon.js';

const EMOJI_RE = /\p{Extended_Pictographic}|[️‍⃣]|\p{Regional_Indicator}/gu;

/** 'Кафе и рестораны' из '🍽️ Кафе и рестораны' — без эмодзи/знаков, свёрнуто */
export const catKey = name => fold(String(name ?? '').replace(EMOJI_RE, ' ')).replace(/[^\p{L}\p{N}']+/gu, ' ').trim();
const wordsOf = key => key.split(' ').filter(Boolean);

/* ───────── список существующих категорий ───────── */
const flat = list => {
    const out = [];
    for (const it of Array.isArray(list) ? list : []) {
        if (typeof it === 'string') out.push(it);
        else if (it && Array.isArray(it.options)) { for (const o of it.options) if (typeof o === 'string') out.push(o); }
        else if (it && typeof it.value === 'string') out.push(it.value);
    }
    return out;
};
/** Принимает массив (годится для обоих типов) или { expense: [...], income: [...] }; элементы — строки или группы { label, options } */
export function flattenCategories(src) {
    if (Array.isArray(src)) { const f = flat(src); return { expense: f, income: f }; }
    return { expense: flat(src?.expense), income: flat(src?.income) };
}

/* ───────── индекс категорий (кэшируется на объект ctx.categories) ───────── */
const INDEX_CACHE = new WeakMap();
function buildTypeIndex(names) {
    const seen = new Set();
    const entries = [];
    const byKey = new Map();
    const byToken = new Map();
    for (const name of names) {
        if (seen.has(name)) continue;
        seen.add(name);
        const key = catKey(name);
        if (!key) continue;
        const words = wordsOf(key);
        const e = { name, key, words };
        entries.push(e);
        if (!byKey.has(key)) byKey.set(key, e);
        for (const w of new Set(words)) {
            if (!byToken.has(w)) byToken.set(w, []);
            byToken.get(w).push(e);
        }
    }
    return { entries, byKey, byToken, names: seen };
}
export function indexCategories(src) {
    if (src && typeof src === 'object' && INDEX_CACHE.has(src)) return INDEX_CACHE.get(src);
    const f = flattenCategories(src);
    const idx = { expense: buildTypeIndex(f.expense), income: buildTypeIndex(f.income) };
    // свои категории пользователя (buildParserContext кладёт их в categories.custom): их ищем первыми
    for (const type of ['expense', 'income']) {
        const own = new Set(Array.isArray(src?.custom?.[type]) ? src.custom[type].filter(x => typeof x === 'string') : []);
        idx[type].custom = idx[type].entries.filter(e => own.has(e.name));
    }
    if (src && typeof src === 'object') INDEX_CACHE.set(src, idx);
    return idx;
}

/* ───────── словарь: слово → правила ───────── */
const compileKey = raw => {
    const k = fold(raw);
    if (k.endsWith('*')) return { kind: 'prefix', v: k.slice(0, -1) };
    if (k.includes(' ')) return { kind: 'phrase', v: k };
    return { kind: 'exact', v: k };
};
function compileRules(rules) {
    const exact = new Map(), prefix = [], phrase = [];
    rules.forEach((r, i) => {
        for (const raw of r.k) {
            const c = compileKey(raw);
            if (c.kind === 'exact') { if (!exact.has(c.v)) exact.set(c.v, []); exact.get(c.v).push(i); }
            else if (c.kind === 'prefix') prefix.push([c.v, i]);
            else phrase.push([c.v, i]);
        }
    });
    return { exact, prefix, phrase, rules };
}
const RULES = compileRules(CATEGORY_RULES);
const GROUPS = compileRules(QUERY_GROUPS);

/** индексы правил, сработавших на словах / тексте. Порядок: точные, префиксные, фразы */
function matchRuleIdx(compiled, words, norm, type) {
    const hit = [];
    const add = i => { if ((!type || compiled.rules[i].type === type || !compiled.rules[i].type) && !hit.includes(i)) hit.push(i); };
    // сначала фразы («моторное масло»), они точнее отдельных слов («масло»)
    for (const [p, i] of compiled.phrase) if (norm.includes(p)) add(i);
    for (const w of words) for (const i of compiled.exact.get(w) || []) add(i);
    for (const w of words) for (const [p, i] of compiled.prefix) if (w.length >= p.length && w.startsWith(p) && p.length >= 3) add(i);
    return hit;
}

/** подсказка из словаря → существующая категория */
function resolveHint(hint, tIdx) {
    const hk = catKey(hint);
    const exact = tIdx.byKey.get(hk);
    if (exact) return exact;
    // по началу названия: сначала встроенные категории («Кофе» → «Кофе на улице»), свои — только если встроенной нет
    const own = new Set(tIdx.custom || []);
    let best = null;
    for (const pass of [false, true]) {
        for (const e of tIdx.entries) {
            if (own.has(e) !== pass || !e.key.startsWith(hk + ' ')) continue;
            if (!best || e.words.length < best.words.length || (e.words.length === best.words.length && e.key.length < best.key.length)) best = e;
        }
        if (best) return best;
    }
    return best;
}

/* ───────── нечёткость ───────── */
export function lev(a, b, max = 2) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        let rowMin = i;
        for (let j = 1; j <= b.length; j++) {
            const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            cur.push(v); if (v < rowMin) rowMin = v;
        }
        if (rowMin > max) return max + 1;
        prev = cur;
    }
    return prev[b.length];
}
function fuzzyCandidates(words, tIdx, limit = 3) {
    const scored = new Map();
    for (const w of words) {
        if (w.length < 4) continue;
        for (const e of tIdx.entries) {
            if (e.words.length > 3) continue;
            for (const cw of e.words) {
                if (cw.length < 4) continue;
                let s = 0;
                if (cw === w) s = e.words[0] === w ? 1 : 0.5;
                else if (w.length >= 6 && cw.length >= 6 && Math.abs(w.length - cw.length) <= 2 && (cw.startsWith(w.slice(0, 6)) || w.startsWith(cw.slice(0, 6)))) s = 0.8;
                else if (w.length >= 5 && lev(w, cw, 1) <= 1) s = 0.75;
                if (s) scored.set(e.name, Math.max(scored.get(e.name) || 0, s - e.words.length * 0.01));
            }
        }
    }
    return [...scored.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name, score]) => ({ name, score }));
}

/* ───────── обучение по истории ───────── */
const LEARN_CACHE = new WeakMap();
const TEXT_FIELDS = ['name', 'note', 'description', 'comment', 'title', 'person', 'merchant', 'source'];
export function historyTexts(t) {
    const parts = [];
    for (const f of TEXT_FIELDS) if (typeof t[f] === 'string') parts.push(t[f]);
    if (Array.isArray(t.products)) for (const p of t.products) if (p && typeof p.name === 'string') parts.push(p.name);
    return parts.join(' ');
}
export function learnTokens(text) {
    return fold(text).split(/[^a-zа-я0-9']+/).filter(w => w.length >= 3 && !/^\d+$/.test(w) && !STOPWORDS.has(w));
}
/** token → Map(категория → сколько раз). Ключ: `${type}|${token}` */
export function buildLearned(history, cIdx) {
    if (!Array.isArray(history) || !history.length) return new Map();
    const cached = LEARN_CACHE.get(history);
    if (cached && cached.len === history.length && cached.cIdx === cIdx) return cached.map;
    const map = new Map();
    for (const t of history) {
        if (!t || (t.type !== 'expense' && t.type !== 'income') || typeof t.category !== 'string') continue;
        if (!cIdx[t.type].names.has(t.category)) continue;
        for (const tok of new Set(learnTokens(historyTexts(t)))) {
            const key = `${t.type}|${tok}`;
            let m = map.get(key);
            if (!m) map.set(key, m = new Map());
            m.set(t.category, (m.get(t.category) || 0) + 1);
        }
    }
    LEARN_CACHE.set(history, { len: history.length, cIdx, map });
    return map;
}

/** узбекские падежные окончания: «taksiga» → «taksi» (основа добавляется к словам, исходные остаются) */
const UZ_SUFFIX = ['larga', 'lardan', 'larni', 'ning', 'dan', 'ga', 'ka', 'qa', 'ni', 'da', 'lar'];
function withStems(words) {
    const out = [...words];
    for (const w of words) {
        if (w.length < 5) continue;
        for (const sfx of UZ_SUFFIX) if (w.endsWith(sfx) && w.length - sfx.length >= 3) { out.push(w.slice(0, -sfx.length)); break; }
    }
    return out;
}

/**
 * Категория для слов фрагмента.
 * @returns {{category:string|null, source:string|null, strength:number, suggestions:string[], matchedRule:boolean}}
 */
// { word, category, count, same }: same — категория выбрана по памяти; иначе это альтернатива к категории словаря
const memoryOf = (m, same) => ({ word: m.word, category: m.cat, count: m.n, same });

export function resolveCategory(words0, norm, type, cIdx, learned) {
    const words = withStems(words0);
    const tIdx = cIdx[type];
    const none = { category: null, source: null, strength: 0, suggestions: [], matchedRule: false };
    if (!tIdx || !tIdx.entries.length) return { ...none, noCategories: true };

    // Память Акулки: куда пользователь чаще всего записывал это слово раньше («масло» → «KorzinkaGO», 6 раз).
    // Общие слова всё равно идут в общую категорию словаря, а память предлагается в карточке как вариант.
    let mem = null;
    for (const w of words) {
        const m = learned.get(`${type}|${w}`);
        if (!m) continue;
        let total = 0, top = null;
        for (const [cat, n] of m) { total += n; if (!top || n > top.n) top = { cat, n }; }
        const share = top.n / total;
        if (share >= 0.5 && (!mem || top.n > mem.n)) mem = { cat: top.cat, n: top.n, share, word: w };
    }

    // 0) своя категория пользователя: «нож» → «🔪 Нож», «ножи» → «🔪 Ножи». Окончания не важны.
    // Совпало всё название — своя категория важнее словаря и брендов. Совпало только первое слово
    // («кофе» и своя «Кофе дома») — словарь решает сам, а своя предлагается в карточке; если словарь слова не знает — берём свою.
    let ownPartial = null;
    {
        const sameStem = (a, b) => a === b || (a.length >= 3 && b.length >= 3 && Math.abs(a.length - b.length) <= 2 && a.slice(0, Math.max(3, Math.min(a.length, b.length) - 1)) === b.slice(0, Math.max(3, Math.min(a.length, b.length) - 1)));
        let own = null, ownScore = 0;
        for (const e of tIdx.custom || []) {
            const hit = e.words.filter(cw => cw.length >= 3 && words.some(w => sameStem(w, cw))).length;
            if (!hit) continue;
            // все слова названия есть во фразе — лучше; иначе совпало первое (главное) слово названия
            const score = hit === e.words.filter(cw => cw.length >= 3).length ? 2 + hit : (words.some(w => sameStem(w, e.words[0])) ? 1 : 0);
            if (score > ownScore) { own = e; ownScore = score; }
        }
        if (own && ownScore >= 3) {
            const out = { category: own.name, source: 'custom', strength: 0.85, suggestions: [], matchedRule: true };
            if (mem && mem.cat !== own.name && mem.n >= 2) out.memory = memoryOf(mem, false);
            return out;
        }
        if (own) ownPartial = own;
    }
    const withOwn = out => {
        if (ownPartial && ownPartial.name !== out.category) out.memory = { word: ownPartial.words[0], category: ownPartial.name, count: 0, same: false, own: true };
        return out;
    };
    // 1) фраза из словаря («яндекс такси», «моторное масло»): точнее, чем отдельное слово «такси» или «масло»
    for (const [p, i] of RULES.phrase) {
        const r = RULES.rules[i];
        if ((r.type && r.type !== type) || !norm.includes(p)) continue;
        for (const hint of r.c) { const e = resolveHint(hint, tIdx); if (e) return withOwn({ category: e.name, source: 'dict', strength: 0.7, suggestions: [], matchedRule: true }); }
    }
    // 2) слово — это всё название категории («Магнит», «Такси», «Korzinka»)
    for (const w of words) {
        if (w.length < 3) continue;
        const e = tIdx.byKey.get(w);
        if (e) return withOwn({ category: e.name, source: 'name', strength: 0.78, suggestions: [], matchedRule: true });
    }
    // 2б) назван бренд из двух-трёх слов («Яндекс Еда», «Yandex Go»): берём его категорию, а не общую
    {
        const hay = ` ${words0.join(' ')} `;
        let brand = null;
        for (const e of tIdx.entries) if (e.words.length >= 2 && e.words.length <= 3 && hay.includes(` ${e.key} `) && (!brand || e.words.length > brand.words.length)) brand = e;
        if (brand) return { category: brand.name, source: 'name', strength: 0.78, suggestions: [], matchedRule: true };
    }

    // 3) словарь
    const idxs = matchRuleIdx(RULES, words, norm, type);
    for (const i of idxs) {
        for (const hint of RULES.rules[i].c) {
            const e = resolveHint(hint, tIdx);
            if (e) {
                const out = { category: e.name, source: 'dict', strength: 0.65, suggestions: [], matchedRule: true };
                // слово уже записывали в другую категорию не меньше двух раз — предложим её в карточке
                if (mem && mem.cat !== e.name && mem.n >= 2) out.memory = memoryOf(mem, false);
                return ownPartial ? withOwn(out) : out;
            }
        }
    }

    // своя категория по первому слову, раз словарь слово не знает («нож» → «🏷️ Нож кухонный»)
    if (ownPartial) {
        const out = { category: ownPartial.name, source: 'custom', strength: 0.75, suggestions: [], matchedRule: true };
        if (mem && mem.cat !== ownPartial.name && mem.n >= 2) out.memory = memoryOf(mem, false);
        return out;
    }
    // 4) история пользователя: словарь слово не знает — берём то, куда пользователь записывал его раньше
    if (mem) return { category: mem.cat, source: 'history', strength: Math.min(1, 0.7 + 0.1 * Math.min(mem.n, 3)) * mem.share, suggestions: [], matchedRule: true, memory: memoryOf(mem, true) };

    // 3б) слово открывает короткое название категории («Обед с клиентом» по слову «обед»)
    for (const w of words) {
        if (w.length < 4) continue;
        const list = (tIdx.byToken.get(w) || []).filter(e => e.words.length <= 2 && e.words[0] === w);
        if (list.length) {
            list.sort((a, b) => a.words.length - b.words.length || a.key.length - b.key.length);
            return { category: list[0].name, source: 'name', strength: 0.6, suggestions: [], matchedRule: true };
        }
    }

    // 4) нечётко
    const fz = fuzzyCandidates(words, tIdx);
    if (fz.length && fz[0].score >= 0.75) return { category: fz[0].name, source: 'fuzzy', strength: 0.4, suggestions: fz.slice(1).map(x => x.name), matchedRule: true };
    return { ...none, suggestions: fz.map(x => x.name), matchedRule: idxs.length > 0 };
}

/** Для запросов: все категории, подходящие слову («еда» → несколько). */
export function resolveCategoryGroup(words, norm, type, cIdx) {
    const tIdx = cIdx[type];
    if (!tIdx) return [];
    const out = [];
    const push = e => { if (e && !out.includes(e.name)) out.push(e.name); };
    for (const i of matchRuleIdx(GROUPS, words, norm, null)) {
        const r = GROUPS.rules[i];
        for (const hint of r.c) push(resolveHint(hint, tIdx));
        const mm = (r.m || []).map(compileKey);
        if (mm.length) for (const e of tIdx.entries) if (e.words.some(w => mm.some(m => (m.kind === 'prefix' ? w.startsWith(m.v) : w === m.v)))) push(e);
    }
    if (!out.length) {
        const one = resolveCategory(words, norm, type, cIdx, new Map());
        if (one.category) out.push(one.category);
    }
    return withBrands(out, tIdx);
}

// «такси» → ещё YandexGO Taxi, MyTaxi…: только явный список QUERY_BRANDS (цепочки словаря — это запасные варианты, не бренды)
const BRANDS_BY_KEY = new Map(Object.entries(QUERY_BRANDS).map(([u, list]) => [catKey(u), list]));
function withBrands(names, tIdx) {
    const out = [...names];
    for (let i = 0; i < out.length; i++) {
        for (const b of BRANDS_BY_KEY.get(catKey(out[i])) || []) {
            const e = tIdx.byKey.get(catKey(b));            // только точное название: без догадок по началу
            if (e && !out.includes(e.name)) out.push(e.name);
        }
    }
    return out;
}

/** Шаблоны слов для поиска по названиям позиций/заметок: слова группы («еда» → хлеб*, молок*…) и сами слова запроса (основа слова) */
export function queryKeywords(words, norm) {
    const out = new Set();
    for (const i of matchRuleIdx(GROUPS, words, norm, null)) for (const m of GROUPS.rules[i].m || []) out.add(fold(m));
    for (const w of words) {
        if (w.length < 3) continue;
        out.add(w.length >= 4 ? w.slice(0, w.length >= 5 ? Math.max(4, w.length - 2) : w.length - 1) + '*' : w);
    }
    return [...out];
}

/** Есть ли в тексте (название позиции, заметка, имя) слово, подходящее под один из шаблонов queryKeywords */
export function matchesKeywords(text, patterns) {
    if (!Array.isArray(patterns) || !patterns.length) return false;
    const ws = fold(String(text || '')).split(/[^\p{L}\p{N}']+/u).filter(Boolean);
    if (!ws.length) return false;
    const cp = patterns.map(compileKey);
    return ws.some(w => cp.some(p => (p.kind === 'prefix' ? w.startsWith(p.v) : w === p.v)));
}

/** Слова фрагмента, годные для поиска категории (без шума) */
export const contentWords = words => words.filter(w => w.length >= 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
