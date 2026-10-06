import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { getElementById: () => null, addEventListener() {}, querySelector: () => null };
globalThis.localStorage = { getItem: () => null, setItem() {} };
const mod = await import('../src/Excelimportmanager.js');
const Cls = mod.ExcelImportManager || Object.values(mod)[0];
const x = new Cls({}, {});

test('Залётом: новые названия мест', () => {
    for (const s of ['K057 TASHKENT UZ', 'K112', 'k003']) assert.equal(x._mapExpenseCategory(s), '🛒 Korzinka', s);
    assert.equal(x._mapExpenseCategory('МК ДУЭСТИ'), '💄 M Cosmetics');
    assert.equal(x._mapExpenseCategory('MK DUESTI'), '💄 M Cosmetics');
    assert.equal(x._mapExpenseCategory('ATTO'), '💳 Atto');
    assert.equal(x._mapExpenseCategory('HOOKAH SHOP'), '💨 Кальян');
    assert.equal(x._mapExpenseCategory('Gross'), '🚙 Страховка авто');
    assert.equal(x._mapExpenseCategory('FeedUp'), '🍱 FeedUp');
    assert.equal(x._mapExpenseCategory('FEED UP'), '🍱 FeedUp');
});

test('Залётом: проценты от вклада только по слову «проценты»', () => {
    assert.equal(x._mapIncomeCategory('Проценты по вкладу'), '🏦 Проценты от вклада');
    assert.equal(x._mapIncomeCategory('PROCENT NA VKLAD'), '🏦 Проценты от вклада');
    assert.equal(x._mapIncomeCategory('ALLIANCE PAY VKLAD'), '🏦 Депозит');
});

test('Залётом: правила запоминаются без цифр-идентификаторов', () => {
    assert.equal(x._ruleKey('Shop 12345678 Tashkent', 'expense'), 'expense|SHOP TASHKENT');
    assert.equal(x._ruleKey('', 'expense'), '');
});
