// Свои категории пользователя: { income: string[], expense: string[] }.
// Значение категории — строка вида «🏷️ Название», как у встроенных (поле tx.category остаётся строкой).
export const CUSTOM_CATEGORY_LIMIT = 30;
export const CUSTOM_CATEGORY_NAME_MAX = 20;
export const CUSTOM_CATEGORY_TYPES = ['income', 'expense'];

export function emptyCustomCategories() {
    return { income: [], expense: [] };
}

export function normalizeCustomCategories(raw) {
    const out = emptyCustomCategories();
    if (!raw || typeof raw !== 'object') return out;
    for (const type of CUSTOM_CATEGORY_TYPES) {
        const list = Array.isArray(raw[type]) ? raw[type] : [];
        const seen = new Set();
        for (const item of list) {
            if (typeof item !== 'string') continue;
            const v = item.trim().slice(0, CUSTOM_CATEGORY_NAME_MAX + 8);
            if (!v || seen.has(v.toLowerCase())) continue;
            seen.add(v.toLowerCase());
            out[type].push(v);
            if (out[type].length >= CUSTOM_CATEGORY_LIMIT) break;
        }
    }
    return out;
}

// Собирает значение категории из эмодзи и названия; возвращает { value } или { error }
export function buildCustomCategory(emoji, name, existingValues = []) {
    const n = String(name || '').replace(/\s+/g, ' ').trim();
    if (!n) return { error: 'Введите название' };
    if (n.length > CUSTOM_CATEGORY_NAME_MAX) return { error: `Не длиннее ${CUSTOM_CATEGORY_NAME_MAX} символов` };
    const e = String(emoji || '').trim() || '🏷️';
    const value = `${e} ${n}`;
    const norm = s => s.replace(/^\p{Extended_Pictographic}️?\s*/u, '').trim().toLowerCase();
    if (existingValues.some(v => norm(String(v)) === n.toLowerCase())) {
        return { error: 'Такая категория уже есть' };
    }
    return { value };
}

export function addCustomCategory(store, type, emoji, name, existingValues = []) {
    if (!CUSTOM_CATEGORY_TYPES.includes(type)) return { error: 'Неверный тип' };
    const cc = normalizeCustomCategories(store);
    if (cc[type].length >= CUSTOM_CATEGORY_LIMIT) return { error: `Не больше ${CUSTOM_CATEGORY_LIMIT} своих категорий` };
    const res = buildCustomCategory(emoji, name, existingValues);
    if (res.error) return res;
    cc[type].push(res.value);
    return { value: res.value, categories: cc };
}

export function removeCustomCategory(store, type, value) {
    const cc = normalizeCustomCategories(store);
    if (CUSTOM_CATEGORY_TYPES.includes(type)) cc[type] = cc[type].filter(v => v !== value);
    return cc;
}
