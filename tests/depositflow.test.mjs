import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyDepositFlow } from '../src/ui/AccountsPage.js';

const tx = (type, category) => ({ type, category, amount: 1 });

test('категории Залётом про вклады распознаются', () => {
    assert.equal(classifyDepositFlow(tx('expense', '🏦 Вклад')), 'in');
    assert.equal(classifyDepositFlow(tx('expense', '🏦 Перевод на вклад')), 'in');
    assert.equal(classifyDepositFlow(tx('income', '🏦 Перевод с вклада')), 'out');
    assert.equal(classifyDepositFlow(tx('income', '🏦 Депозит')), 'out');
    assert.equal(classifyDepositFlow(tx('income', '🏦 Проценты от вклада')), 'out');
});

test('обычные операции и типы вклад/долг не считаются', () => {
    assert.equal(classifyDepositFlow(tx('expense', '🛒 Продукты')), null);
    assert.equal(classifyDepositFlow(tx('deposit', '🏦 Вклад')), null);
    assert.equal(classifyDepositFlow(tx('expense', '🏦 Кредит')), null);
});

test('направление берётся из названия категории, а не только из типа', () => {
    assert.equal(classifyDepositFlow(tx('expense', '🏦 Перевод с вклада')), 'out');
    assert.equal(classifyDepositFlow(tx('expense', '🏦 Списание со вклада')), 'out');
    assert.equal(classifyDepositFlow(tx('income', '🏦 Перевод на вклад')), 'in');
});
