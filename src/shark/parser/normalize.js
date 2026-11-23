// normalize.js — подготовка текста для парсера (чистые функции, без DOM).
// Главное свойство: нормализованная строка той же длины, что и исходная (замена символ в символ),
// поэтому позиции совпадений в norm годятся и для вырезания кусков из оригинала.
export const MAX_INPUT = 500;

const APOS_RE = /[ʻʼ’‘`´ʹ′ʽ]/g;
const EMOJI_RE = /\p{Extended_Pictographic}|[️‍⃣]|\p{Regional_Indicator}/gu;
const FOLD = { 'ё': 'е', 'ў': 'у', 'қ': 'к', 'ғ': 'г', 'ҳ': 'х' };

/** Фолд одного слова/фрагмента: нижний регистр, ё→е, узбекская кириллица→обычная, апострофы→'. Длина может меняться. */
export function fold(s) {
    let out = '';
    for (const ch of String(s ?? '').replace(APOS_RE, "'").toLowerCase()) {
        out += ch in FOLD ? FOLD[ch] : ch;
    }
    return out;
}

/** То же, что fold, но длина строки сохраняется */
function foldKeepLen(s) {
    let out = '';
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        let lo = ch.toLowerCase();
        if (lo.length !== 1) lo = ch;
        if (lo === 'ё') lo = 'е';
        else if (lo === 'ў') lo = 'у';
        else if (lo === 'қ') lo = 'к';
        else if (lo === 'ғ') lo = 'г';
        else if (lo === 'ҳ') lo = 'х';
        out += lo;
    }
    return out;
}

/** Возвращает { orig, norm, truncated }. norm.length === orig.length */
export function prepare(text) {
    let orig = typeof text === 'string' ? text : (text == null ? '' : String(text));
    const truncated = orig.length > MAX_INPUT;
    if (truncated) orig = orig.slice(0, MAX_INPUT);
    // управляющие символы и неразрывные пробелы → обычный пробел (длина та же)
    orig = orig.replace(/[\u0000-\u001F\u007F  -   　]/g, ' ');
    let norm = orig.replace(APOS_RE, "'");
    norm = norm.replace(EMOJI_RE, m => ' '.repeat(m.length));
    norm = foldKeepLen(norm);
    return { orig, norm, truncated };
}

export const LETTERS = "a-zа-я'";               // буквы после фолда (апостроф считается буквой: o'n, so'm)
export const WORD_RE = /[a-zа-я']+/g;

/** Слова нормализованной строки с позициями */
export function tokenize(norm) {
    const out = [];
    WORD_RE.lastIndex = 0;
    let m;
    while ((m = WORD_RE.exec(norm))) {
        const w = m[0].replace(/^'+|'+$/g, '');
        if (w) out.push({ w, start: m.index, end: m.index + m[0].length });
    }
    return out;
}

/** Заменяет диапазоны символом fill (по умолчанию пробелом); длина сохраняется */
export function maskRanges(str, ranges, fill = ' ') {
    if (!ranges.length) return str;
    const arr = str.split('');
    for (const [a, b] of ranges) for (let i = Math.max(0, a); i < Math.min(arr.length, b); i++) arr[i] = fill;
    return arr.join('');
}

export function detectLang(norm, hint = 'ru') {
    const cyr = (norm.match(/[а-я]/g) || []).length;
    const lat = (norm.match(/[a-z]/g) || []).length;
    const uzLat = /\b(kecha|bugun|ertaga|ming|oylik|maosh|kirim|chiqim|so'm|som|qarz|million|sarfladim|qancha|necha|jami|oldim|berdim|uchun|bilan|hafta)\b/.test(norm);
    const uzCyr = /(^|[^а-я])(кеча|бугун|эртага|минг|ойлик|маош|киримы?|чиқим|чиким|қарз|карз|сум|сўм)($|[^а-я])/.test(norm);
    if (uzLat || uzCyr) return 'uz';
    if (lat > cyr) return hint === 'uz' ? 'uz' : 'en';
    if (cyr > 0) return 'ru';
    return hint || 'ru';
}
