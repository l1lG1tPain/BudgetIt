import test from 'node:test';
import assert from 'node:assert/strict';
import { buildParserContext, CHAT_TZ } from '../src/shark/parser/chatContext.js';
import { parseUtterance } from '../src/shark/parser/index.js';
import { expenseCategories, incomeCategories } from '../constants/index.js';

const NOW = new Date('2026-11-23T10:00:00+05:00');
const ctx = (extra = {}) => buildParserContext({ expense: expenseCategories, income: incomeCategories, now: NOW, ...extra });

test('ctx: значения по умолчанию', () => {
    const c = buildParserContext();
    assert.equal(c.timezone, CHAT_TZ);
    assert.equal(CHAT_TZ, 'Asia/Tashkent');
    assert.deepEqual(c.categories, { expense: [], income: [] });
    assert.deepEqual(c.history, []);
    assert.ok(c.today instanceof Date);
});

test('ctx: свои категории добавляются к встроенным, мусор отбрасывается', () => {
    const c = buildParserContext({ expense: ['🥦 Продукты'], income: [], custom: { expense: ['🏷️ Кальян', 5, null], income: ['🏷️ Фриланс'] } });
    assert.deepEqual(c.categories.expense, ['🥦 Продукты', '🏷️ Кальян']);
    assert.deepEqual(c.categories.income, ['🏷️ Фриланс']);
});

test('ctx: history — только массив, исходные массивы не мутируются', () => {
    const exp = ['a'];
    buildParserContext({ expense: exp, custom: { expense: ['b'] } });
    assert.deepEqual(exp, ['a']);
    assert.deepEqual(buildParserContext({ transactions: null }).history, []);
    const tx = [{ id: 1 }];
    assert.equal(buildParserContext({ transactions: tx }).history, tx);
});

test('ctx + парсер: фразы из задачи', () => {
    const c = ctx();
    const a = parseUtterance('вчера такси 45к', c).intents[0];
    assert.deepEqual([a.tx.type, a.tx.amount, a.tx.date], ['expense', 45000, '2026-11-22']);
    const b = parseUtterance('зарплата 5 млн 20-го', c).intents[0];
    assert.deepEqual([b.tx.type, b.tx.amount, b.tx.date], ['income', 5000000, '2026-11-20']);
    const d = parseUtterance('одолжил Али 200к до пятницы', c).intents[0];
    assert.deepEqual([d.tx.type, d.tx.amount], ['debt', 200000]);
    assert.equal(parseUtterance('сколько я потратил на еду в этом месяце', c).intents[0].kind, 'query_summary');
});

test('ctx + парсер: своя категория находится', () => {
    const c = ctx({ custom: { expense: ['🏷️ Аквариум'], income: [] } });
    assert.equal(parseUtterance('аквариум 30к', c).intents[0].tx.category, '🏷️ Аквариум');
});
