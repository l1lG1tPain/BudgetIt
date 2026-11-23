// numbers.js — поиск и разбор денежных сумм: 45к, 1.5 млн, 18 000, пятьдесят тысяч, yuz ellik ming.
// Результат всегда целое число (BigInt внутри, без float): «1.5 млн» = 1 500 000, а не 1499999.
import { fold, WORD_RE } from './normalize.js';

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/* ───────── множители ───────── */
const K = 1000, M = 1000000, B = 1000000000;
const MULT_EXACT = new Map([
    ['к', K], ['k', K], ['kk', M], ['кк', M], ['ming', K], ['минг', K], ['thousand', K], ['косарь', K], ['косаря', K], ['косарей', K],
    ['млн', M], ['mln', M], ['mil', M], ['million', M], ['millon', M], ['mio', M], ['лям', M], ['ляма', M], ['лямов', M], ['лимон', M], ['лимона', M],
    ['млрд', B], ['mlrd', B], ['billion', B]
].map(([w, v]) => [fold(w), v]));
const MULT_PREFIX = [['тысяч', K], ['тыс', K], ['миллион', M], ['милион', M], ['миллиард', B], ['milliard', B], ['million', M]];

export function multiplierOf(word) {
    const w = fold(word);
    if (MULT_EXACT.has(w)) return MULT_EXACT.get(w);
    for (const [p, v] of MULT_PREFIX) if (w.startsWith(p) && w.length <= p.length + 4) return v;
    return 0;
}

/* ───────── валюта: поглощаем слово, чтобы оно не попало в заметку; сама валюта операции не нужна ───────── */
const CURRENCY = new Map([
    ['сум', 'UZS'], ['сума', 'UZS'], ['сумов', 'UZS'], ['сумы', 'UZS'], ['сумм', 'UZS'], ['som', 'UZS'], ["so'm", 'UZS'], ['sum', 'UZS'], ['uzs', 'UZS'], ['сом', 'UZS'], ['somga', 'UZS'],
    ['usd', 'USD'], ['доллар', 'USD'], ['долларов', 'USD'], ['долл', 'USD'], ['dollar', 'USD'], ['dollars', 'USD'], ['бакс', 'USD'], ['баксов', 'USD'],
    ['руб', 'RUB'], ['рублей', 'RUB'], ['рубля', 'RUB'], ['rub', 'RUB'],
    ['eur', 'EUR'], ['евро', 'EUR'], ['kzt', 'KZT'], ['тенге', 'KZT']
].map(([w, c]) => [fold(w), c]));
export const currencyOf = w => CURRENCY.get(fold(w)) || null;

/* ───────── точное целое из «целая.дробь × множитель» ───────── */
export function exactInt(intDigits, fracDigits, mult) {
    const frac = (fracDigits || '').slice(0, 9);
    const n = BigInt((intDigits || '0') + frac) * BigInt(mult);
    const d = 10n ** BigInt(frac.length);
    return (n * 2n + d) / (2n * d); // округление половины вверх
}
const toNum = big => (big > MAX_SAFE ? null : Number(big));

/* ───────── цифровые суммы ───────── */
const NUM_RE = /(?<![a-zа-я0-9.,'])(?:([-−–])(?=\d))?(\d{1,3}(?:[ '.,]\d{3})+|\d+(?:[.,]\d+)?)(?!\d)/g;
const AFTER_RE = /^( *)([a-zа-я']+|[$€₽])/;

function scanDigits(norm) {
    const out = [];
    NUM_RE.lastIndex = 0;
    let m;
    while ((m = NUM_RE.exec(norm))) {
        const raw = m[2];
        const start = m.index;
        let end = start + m[0].length;
        const negative = !!m[1];
        // множитель и валюта сразу за числом
        let mult = 1, currency = null;
        let am = AFTER_RE.exec(norm.slice(end, end + 24));
        if (am) {
            const mv = multiplierOf(am[2]);
            if (mv) { mult = mv; end += am[0].length; }
        }
        am = AFTER_RE.exec(norm.slice(end, end + 24));
        if (am) { const c = currencyOf(am[2]); if (c) { currency = c; end += am[0].length; } }

        let intDigits, fracDigits = '', rounded = false;
        const grouped = /^\d{1,3}(?:[ '.,]\d{3})+$/.test(raw);
        if (grouped) {
            const seps = raw.match(/[ '.,]/g);
            if (seps.length === 1 && /[.,]/.test(seps[0]) && mult > 1) {   // «1.500 млн» → 1.5 млн
                [intDigits, fracDigits] = raw.split(/[.,]/);
                fracDigits = fracDigits.replace(/0+$/, '');
            } else intDigits = raw.replace(/\D/g, '');
        } else if (/[.,]/.test(raw)) {
            const [ip, fp] = raw.split(/[.,]/);
            if (mult === 1) {          // дробная сумма без множителя: округляем до целого и помечаем
                rounded = fp.replace(/0+$/, '') !== '';
                intDigits = String(exactInt(ip, fp, 1));
            } else { intDigits = ip; fracDigits = fp; }
        } else intDigits = raw;

        const big = exactInt(intDigits, fracDigits, mult);
        const value = toNum(big);
        out.push({ start, end, value, tooLarge: value === null, negative, rounded, currency, suffix: mult > 1, kind: 'digits' });
    }
    return out;
}

/* ───────── числа словами ───────── */
const UNITS = new Map();
const addUnits = (list, v) => list.forEach(w => UNITS.set(fold(w), v));
// ru
addUnits(['ноль'], 0);
addUnits(['один', 'одна', 'одну', 'одного', 'одной'], 1);
addUnits(['два', 'две', 'двух', 'двое'], 2);
addUnits(['три', 'трех', 'трёх'], 3);
addUnits(['четыре', 'четырех', 'четырёх'], 4);
addUnits(['пять', 'пяти'], 5); addUnits(['шесть', 'шести'], 6); addUnits(['семь', 'семи'], 7);
addUnits(['восемь', 'восьми'], 8); addUnits(['девять', 'девяти'], 9); addUnits(['десять', 'десяти'], 10);
addUnits(['одиннадцать'], 11); addUnits(['двенадцать'], 12); addUnits(['тринадцать'], 13); addUnits(['четырнадцать'], 14);
addUnits(['пятнадцать'], 15); addUnits(['шестнадцать'], 16); addUnits(['семнадцать'], 17); addUnits(['восемнадцать'], 18); addUnits(['девятнадцать'], 19);
addUnits(['двадцать'], 20); addUnits(['тридцать'], 30); addUnits(['сорок'], 40); addUnits(['пятьдесят', 'пятидесяти'], 50);
addUnits(['шестьдесят', 'шестидесяти'], 60); addUnits(['семьдесят', 'семидесяти'], 70); addUnits(['восемьдесят', 'восьмидесяти'], 80); addUnits(['девяносто'], 90);
addUnits(['сто'], 100); addUnits(['двести'], 200); addUnits(['триста'], 300); addUnits(['четыреста'], 400); addUnits(['пятьсот'], 500);
addUnits(['шестьсот'], 600); addUnits(['семьсот'], 700); addUnits(['восемьсот'], 800); addUnits(['девятьсот'], 900);
// uz (латиница и кириллица)
addUnits(['bir', 'бир'], 1); addUnits(['ikki', 'икки'], 2); addUnits(['uch', 'уч'], 3); addUnits(["to'rt", 'tort', 'турт'], 4);
addUnits(['besh', 'беш'], 5); addUnits(['olti', 'олти'], 6); addUnits(['yetti', 'етти'], 7); addUnits(['sakkiz', 'саккиз'], 8);
addUnits(["to'qqiz", 'toqqiz', 'тукиз', 'тугкиз'], 9); addUnits(["o'n", 'on', 'ун'], 10); addUnits(['yigirma', 'йигирма'], 20);
addUnits(["o'ttiz", 'ottiz', 'уттиз'], 30); addUnits(['qirq', 'кирк'], 40); addUnits(['ellik', 'эллик'], 50);
addUnits(['oltmish', 'олтмиш'], 60); addUnits(['yetmish', 'етмиш'], 70); addUnits(['sakson', 'саксон'], 80); addUnits(["to'qson", 'toqson', 'туксон'], 90);
// en
addUnits(['one'], 1); addUnits(['two'], 2); addUnits(['three'], 3); addUnits(['four'], 4); addUnits(['five'], 5); addUnits(['six'], 6);
addUnits(['seven'], 7); addUnits(['eight'], 8); addUnits(['nine'], 9); addUnits(['ten'], 10); addUnits(['eleven'], 11); addUnits(['twelve'], 12);
addUnits(['twenty'], 20); addUnits(['thirty'], 30); addUnits(['forty'], 40); addUnits(['fifty'], 50); addUnits(['sixty'], 60);
addUnits(['seventy'], 70); addUnits(['eighty'], 80); addUnits(['ninety'], 90);
const HUNDRED = new Set(['yuz', 'юз', 'hundred']);
const HALF = new Set(['полтора', 'полторы']);

function scaleOf(w) {
    if (w === 'ming' || w === 'минг' || w === 'thousand') return K;
    if (w.startsWith('тысяч') || w === 'тыс') return K;
    if (w.startsWith('миллион') || w === 'млн' || w === 'million' || w === 'mln') return M;
    if (w.startsWith('миллиард') || w === 'млрд' || w === 'milliard' || w === 'billion') return B;
    return 0;
}
const isNumWord = w => UNITS.has(w) || HUNDRED.has(w) || HALF.has(w) || scaleOf(w) > 0;

function scanWords(norm) {
    const toks = [];
    WORD_RE.lastIndex = 0;
    let m;
    while ((m = WORD_RE.exec(norm))) toks.push({ w: m[0].replace(/^'+|'+$/g, ''), start: m.index, end: m.index + m[0].length });
    const out = [];
    let i = 0;
    while (i < toks.length) {
        if (!isNumWord(toks[i].w)) { i++; continue; }
        // цепочка числовых слов подряд (между ними только пробелы); значения храним в половинках, чтобы поддержать «полтора»
        let j = i, total2 = 0n, cur2 = 0n, hasScale = false, lastEnd = toks[i].start;
        while (j < toks.length) {
            const w = toks[j].w;
            if (j > i && norm.slice(lastEnd, toks[j].start).trim() !== '') break;
            if (!isNumWord(w)) break;
            if (HALF.has(w)) cur2 += 3n;
            else if (UNITS.has(w)) cur2 += BigInt(UNITS.get(w)) * 2n;
            else if (HUNDRED.has(w)) cur2 = (cur2 > 0n && cur2 < 20n ? cur2 : 2n) * 100n;
            else { total2 += (cur2 > 0n ? cur2 : 2n) * BigInt(scaleOf(w)); cur2 = 0n; hasScale = true; }
            lastEnd = toks[j].end; j++;
        }
        const big = (total2 + cur2) / 2n;
        // одиночное «пять» — не сумма; сумма словами — это либо есть масштаб (тысяч/ming/млн), либо число от ста
        if ((hasScale || big >= 100n) && big > 0n) {
            let end = lastEnd, currency = null;
            const am = AFTER_RE.exec(norm.slice(end, end + 24));
            if (am) { const c = currencyOf(am[2]); if (c) { currency = c; end += am[0].length; } }
            out.push({ start: toks[i].start, end, value: toNum(big), tooLarge: big > MAX_SAFE, negative: false, rounded: false, currency, suffix: hasScale, kind: 'words' });
        }
        i = Math.max(j, i + 1);
    }
    return out;
}

/** Все суммы в нормализованном тексте (в порядке появления, без пересечений). */
export function scanAmounts(norm) {
    const digits = scanDigits(norm);
    let masked = norm;
    if (digits.length) {
        const arr = norm.split('');
        for (const d of digits) for (let i = d.start; i < d.end; i++) arr[i] = ' ';
        masked = arr.join('');
    }
    return [...digits, ...scanWords(masked)].sort((a, b) => a.start - b.start);
}
