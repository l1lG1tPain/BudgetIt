import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanText, sanitizeDeep, cleanTransaction } from '../src/utils/sanitize.js';

test('cleanText убирает угловые скобки, управляющие символы и обрезает длину', () => {
    assert.equal(cleanText('<img src=x onerror=alert(1)>'), '‹img src=x onerror=alert(1)›');
    assert.equal(cleanText('a\u0000b\u0007c'), 'abc');
    assert.equal(cleanText('x'.repeat(1000)).length, 400);
    assert.equal(cleanText(null), '');
});

test('sanitizeDeep чистит вложенные строки и отбрасывает опасные ключи', () => {
    const raw = JSON.parse('{"budgets":[{"name":"<b>A</b>","transactions":[{"category":"<script>x</script>","amount":5,"__proto__":{"polluted":1}}]}],"constructor":{"x":1}}');
    const out = sanitizeDeep(raw);
    assert.equal(out.budgets[0].name, '‹b›A‹/b›');
    assert.equal(out.budgets[0].transactions[0].category, '‹script›x‹/script›');
    assert.equal(out.budgets[0].transactions[0].amount, 5);
    assert.equal(({}).polluted, undefined);
    assert.ok(!Object.prototype.hasOwnProperty.call(out, 'constructor'));
    assert.equal(sanitizeDeep(Infinity), 0);
});

test('cleanTransaction чистит текстовые поля и названия товаров', () => {
    const tx = cleanTransaction({ category: '<i>x</i>', name: '<a>', products: [{ name: '<u>m</u>', price: 3 }] });
    assert.ok(!/[<>]/.test(tx.category + tx.name + tx.products[0].name));
    assert.equal(tx.products[0].price, 3);
});
