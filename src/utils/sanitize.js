// ===============================
//   sanitize.js — защита от вредоносных данных (импорт JSON, Excel/CSV/PDF, ручной ввод)
//   Названия, категории и описания попадают в разметку, поэтому из них убираем угловые скобки,
//   управляющие символы и слишком длинные строки; опасные ключи объектов отбрасываем.
// ===============================
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_STR = 400;
const MAX_DEPTH = 8;

// Текст для показа в интерфейсе
export function cleanText(value, max = MAX_STR) {
    return String(value ?? '')
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
        .replace(/</g, '‹')
        .replace(/>/g, '›')
        .slice(0, max);
}

// Рекурсивная очистка импортируемых данных: строки чистим, числа и булевы оставляем
export function sanitizeDeep(value, depth = 0) {
    if (typeof value === 'string') return cleanText(value, 2000);
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (value === null || typeof value === 'boolean' || value === undefined) return value;
    if (depth >= MAX_DEPTH) return null;
    if (Array.isArray(value)) return value.map(v => sanitizeDeep(v, depth + 1));
    if (typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            if (BAD_KEYS.has(k)) continue;
            out[cleanText(k, 120)] = sanitizeDeep(v, depth + 1);
        }
        return out;
    }
    return null;
}

// Текстовые поля операции, которые попадают в разметку
export function cleanTransaction(tx) {
    if (!tx || typeof tx !== 'object') return tx;
    for (const k of ['name', 'category', 'description', 'note', 'comment', 'title', 'source', 'person', 'bank']) {
        if (typeof tx[k] === 'string') tx[k] = cleanText(tx[k]);
    }
    if (Array.isArray(tx.products)) {
        tx.products.forEach(p => { if (p && typeof p.name === 'string') p.name = cleanText(p.name, 120); });
    }
    return tx;
}
