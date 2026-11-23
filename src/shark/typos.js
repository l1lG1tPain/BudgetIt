// ===============================
//   typos.js — исправление опечаток в сообщении Акулке (с телефона).
//   Понимает: удвоенные буквы («бюджетт»), лишний пробел («пла н»), пропущенный пробел («мойплан»),
//   пропущенную, лишнюю, неверную или переставленную букву («зарплта», «скольоо», «характр»).
//   Меняются только незнакомые слова и только на слово из словаря; цифры и суммы не трогаются.
// ===============================

const norm = w => String(w || '').toLowerCase().replace(/ё/g, 'е');
const WORD = /^[\p{L}-]+$/u;
// короткие служебные слова: всегда «знакомые», их не исправляем
const SHORT = ['а', 'и', 'в', 'во', 'на', 'по', 'за', 'до', 'с', 'со', 'к', 'ко', 'о', 'об', 'от', 'из', 'у', 'я', 'ты', 'мы', 'вы', 'он', 'мне', 'мой', 'моя', 'мои', 'мое', 'не', 'ни', 'же', 'ли', 'бы', 'да', 'нет', 'ну', 'то', 'что', 'как', 'кто', 'где', 'все', 'вся', 'это', 'эй', 'ау', 'ой', 'ок', 'уж', 'вот', 'так', 'там', 'тут', 'еще', 'уже'];

/**
 * Словарь: Map слово → вес (чем больше, тем охотнее выбирается при равенстве).
 * @param {Array<[Iterable<string>, number]>} sources  [список фраз или слов, вес]
 */
export function buildVocab(sources = []) {
    const v = new Map(SHORT.map(w => [w, 5]));
    for (const [list, weight] of sources) {
        for (const phrase of list || []) {
            for (const raw of norm(phrase).split(/[^\p{L}-]+/u)) {
                const w = raw.replace(/^-+|-+$/g, '');
                if (w.length < 2 || w.includes('*')) continue;
                if ((v.get(w) || 0) < weight) v.set(w, weight);
            }
        }
    }
    return v;
}

/** Расстояние Дамерау — Левенштейна (с перестановкой соседних букв); больше max — возвращает max + 1 */
export function editDistance(a, b, max = 2) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    const n = a.length, m = b.length;
    let prev2 = null, prev = Array.from({ length: m + 1 }, (_, j) => j);
    for (let i = 1; i <= n; i++) {
        const cur = [i];
        let rowMin = i;
        for (let j = 1; j <= m; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            let d = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
            if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, prev2[j - 2] + 1);
            cur[j] = d;
            if (d < rowMin) rowMin = d;
        }
        if (rowMin > max) return max + 1;
        prev2 = prev; prev = cur;
    }
    return prev[m];
}

// «бюджетт» → «бюджет», «долгии» → «долги»: схлопываем повторы букв, сначала по одному
function squeezeFix(w, vocab) {
    const runs = [];
    for (let i = 1; i < w.length; i++) if (w[i] === w[i - 1]) runs.push(i);
    if (!runs.length || runs.length > 6) return null;
    const all = w.replace(/(\p{L})\1+/gu, '$1');
    const tries = [...runs.map(i => w.slice(0, i) + w.slice(i + 1)), all];
    for (const t of tries) if (vocab.has(t)) return t;
    return null;
}

// «мойплан» → «мой план», «сколькоосталось» → «сколько осталось»
function splitFix(w, vocab) {
    let best = null;
    for (let k = 2; k <= w.length - 2; k++) {
        const l = w.slice(0, k), r = w.slice(k);
        if (!vocab.has(l) || !vocab.has(r)) continue;
        const score = Math.min(l.length, r.length);
        if (!best || score > best.score) best = { text: `${l} ${r}`, score };
    }
    return best && (best.score >= 3 || w.length >= 6) ? best.text : null;
}

// «характре» ↔ «характер»: две соседние буквы переставлены
const isSwap = (a, b) => {
    if (a.length !== b.length) return false;
    const diff = [];
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff.push(i);
    return diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]];
};

// пропущенная/лишняя/неверная/переставленная буква; недописанное слово («зарпл» → «зарплата»)
function nearFix(w, vocab) {
    const len = w.length;
    if (len < 4) return null;
    const max = len >= 8 ? 2 : 1;
    const short = len < 5;                       // в коротком слове замена буквы слишком рискованна: «посл» ≠ «поел»
    let best = null, tie = false;
    for (const [cand, weight] of vocab) {
        if (cand.length < 4 || cand[0] !== w[0] && max < 2 && !(cand[1] === w[0] && cand[0] === w[1])) continue;
        const dl = cand.length - len;
        let d;
        if (dl >= 1 && dl <= 2 && len >= 5 && cand.startsWith(w)) d = 1;           // недописали конец
        else if (Math.abs(dl) > max) continue;
        else {
            if (short && dl === 0 && !isSwap(w, cand)) continue;
            d = editDistance(w, cand, max);
        }
        if (d > max) continue;
        // при равенстве: пропущенная буква (слово длиннее) вероятнее замены — «накоплени» → «накопления», а не «накоплено»
        const score = d * 10 - weight - (cand[0] === w[0] ? 1 : 0) + (dl > 0 ? 0 : dl < 0 ? 0.4 : 0.6);
        if (!best || score < best.score) { best = { word: cand, score }; tie = false; }
        // равные варианты — формы одного слова («накопления» / «накоплений»): годится любая; разные слова — не угадываем
        else if (score === best.score && cand !== best.word && cand.slice(0, len - 1) !== best.word.slice(0, len - 1)) tie = true;
    }
    return best && !tie ? best.word : null;
}

// недописанное короткое слово: «пла» → «план», «посл» → «последняя» — если все варианты одного корня
function completeFix(w, vocab) {
    if (w.length < 3 || w.length > 5) return null;
    const list = [];
    for (const [cand, weight] of vocab) if (weight >= 4 && cand.length > w.length && cand.length <= w.length + 6 && cand.startsWith(w)) list.push(cand);
    if (!list.length) return null;
    const stem = list.reduce((s, c) => { let i = 0; while (i < s.length && s[i] === c[i]) i++; return s.slice(0, i); });
    if (stem.length < w.length + 1 && list.length > 1) return null;          // «пос» → и «последний», и «посчитай» — не угадываем
    return list.sort((x, y) => x.length - y.length || x.localeCompare(y))[0];
}

/**
 * Исправляет опечатки. Возвращает исправленный текст (или тот же, если править нечего).
 * @param {string} text
 * @param {Map<string, number>} vocab  из buildVocab
 */
export function fixTypos(text, vocab) {
    const src = String(text || '');
    if (!src.trim() || !vocab?.size || src.length > 160) return src;
    const known = w => vocab.has(w);
    // токены: слово + знаки вокруг; слова с цифрами («25к») не трогаем
    let toks = src.trim().split(/\s+/).map(t => {
        const m = /^([^\p{L}\d]*)(.*?)([^\p{L}\d]*)$/u.exec(t);
        return { pre: m[1], core: m[2], post: m[3] };
    });
    // 1) лишний пробел: «пла н» → «план», «ак улка» → «акулка»
    for (let i = 0; i < toks.length - 1; i++) {
        const a = toks[i], b = toks[i + 1];
        if (a.post || b.pre || !WORD.test(a.core) || !WORD.test(b.core)) continue;
        const A = norm(a.core), B = norm(b.core);
        // «пла на» — «на» настоящее слово, клеить нельзя; клеим, только если вторая часть сама по себе не слово («пла н», «ак улка»)
        if (known(B) && B.length >= 2) continue;
        const AB = A + B;
        if (AB.length >= 4 && (known(AB) || squeezeFix(AB, vocab))) {
            toks.splice(i, 2, { pre: a.pre, core: a.core + b.core, post: b.post });
            i--;
        }
    }
    // 2) каждое незнакомое слово: повторы букв → слитные слова → ближайшее слово словаря
    let changed = false;
    toks = toks.map(t => {
        if (!WORD.test(t.core)) return t;
        const w = norm(t.core);
        if (known(w) || w.length < 3) return t;
        // короткое слово чаще недописано («посл»), длинное — с опечаткой внутри
        const fixed = squeezeFix(w, vocab) || splitFix(w, vocab) || (w.length <= 4 ? completeFix(w, vocab) || nearFix(w, vocab) : nearFix(w, vocab) || completeFix(w, vocab));
        if (!fixed || fixed === w) return t;
        changed = true;
        return { ...t, core: fixed };
    });
    const out = toks.map(t => t.pre + t.core + t.post).join(' ');
    return changed || out !== src.trim() ? out : src;
}
