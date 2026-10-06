import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCustomCategories, buildCustomCategory, addCustomCategory, removeCustomCategory, CUSTOM_CATEGORY_LIMIT } from '../src/utils/customCategories.js';

test('нормализация: мусор, дубли, обрезка', () => {
    assert.deepEqual(normalizeCustomCategories(null), { income: [], expense: [] });
    const n = normalizeCustomCategories({ income: ['🎁 Подарки', '🎁 подарки', 5, ''], expense: 'x' });
    assert.deepEqual(n, { income: ['🎁 Подарки'], expense: [] });
});
test('сборка значения: эмодзи по умолчанию, пустое имя, дубль', () => {
    assert.equal(buildCustomCategory('', 'Кофе').value, '🏷️ Кофе');
    assert.equal(buildCustomCategory('☕', 'Кофе').value, '☕ Кофе');
    assert.ok(buildCustomCategory('☕', '  ').error);
    assert.ok(buildCustomCategory('☕', 'Кофе', ['🛒 Кофе']).error);
    assert.ok(buildCustomCategory('☕', 'x'.repeat(21)).error);
});
test('добавление и удаление, лимит', () => {
    let r = addCustomCategory({}, 'expense', '☕', 'Кофе', []);
    assert.deepEqual(r.categories, { income: [], expense: ['☕ Кофе'] });
    assert.deepEqual(removeCustomCategory(r.categories, 'expense', '☕ Кофе').expense, []);
    const full = { income: [], expense: Array.from({ length: CUSTOM_CATEGORY_LIMIT }, (_, i) => `🏷️ К${i}`) };
    assert.ok(addCustomCategory(full, 'expense', '', 'Лишняя', []).error);
    assert.ok(addCustomCategory({}, 'debt', '', 'x', []).error);
});
