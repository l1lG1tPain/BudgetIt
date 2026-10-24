/**
 * Движок словарей организаций для «Залётом».
 *
 * Словари лежат в виде текста: строка «## категория» открывает блок, каждая
 * следующая строка — ОДНА организация (варианты написания через «|»).
 * Порядок строк важен: побеждает первая подошедшая.
 *
 * Правила записи названия:
 *   - писать в ВЕРХНЕМ регистре, «Ё» как «Е», без знаков препинания
 *     (в описании «AIA*5ka» знаки заменяются пробелами → «AIA 5KA»);
 *   - по умолчанию название должно совпасть целыми словами;
 *   - «*» в конце — разрешить продолжение слова (APTEKA* → APTEKA24);
 *   - «*» в начале — разрешить любое начало слова;
 *   - «^» в начале — только в начале описания;
 *   - внутри можно использовать простые regex-конструкции: ? ( ) [0-9]
 */

/** Нормализация описания: верхний регистр, Ё→Е, всё кроме букв и цифр → пробел. */
export function normalizeMerchant(text) {
    return ' ' + String(text || '')
        .toUpperCase()
        .replace(/Ё/g, 'Е')
        .replace(/[^A-ZА-Я0-9]+/g, ' ')
        .trim() + ' ';
}

function compileAlt(alt) {
    let a = alt.trim();
    if (!a) return null;
    let anchored = false, leftOpen = false, rightOpen = false;
    if (a[0] === '^') { anchored = true; a = a.slice(1); }
    if (a[0] === '*') { leftOpen = true; a = a.slice(1); }
    if (a[a.length - 1] === '*') { rightOpen = true; a = a.slice(0, -1); }
    const left = anchored ? '^ ' : (leftOpen ? '' : ' ');
    const right = rightOpen ? '' : ' ';
    try {
        return new RegExp(left + '(?:' + a + ')' + right);
    } catch (e) {
        return null;
    }
}

/** Разбор текстового словаря → [{category, name, res:[RegExp]}] */
export function compileRules(src) {
    const rules = [];
    let category = null;
    for (const raw of String(src).split('\n')) {
        const line = raw.trim();
        if (!line || line.startsWith('//')) continue;
        if (line.startsWith('## ')) { category = line.slice(3).trim(); continue; }
        if (!category) continue;
        const res = line.split('|').map(compileAlt).filter(Boolean);
        if (res.length) rules.push({ category, name: line, res });
    }
    return rules;
}

/** Первая подошедшая категория или null. */
export function matchRules(rules, text) {
    if (!text) return null;
    const n = normalizeMerchant(text);
    for (const r of rules) {
        for (const re of r.res) if (re.test(n)) return r.category;
    }
    return null;
}

/** Сколько организаций описано (строк-правил). */
export function countRules(rules) { return rules.length; }
