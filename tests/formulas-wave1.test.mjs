import test from 'node:test';
import assert from 'node:assert/strict';
import { getSpentOnDay, isDailySpend, getMedianLimit } from '../src/shark/SharkMood.js';
import { goalCalc, monthSummary, ruleCheck } from '../src/shark/SharkExtra.js';
import { savingsMonth, topCategories } from '../src/shark/SharkPlus.js';
import { dayAnswer } from '../src/shark/SharkTalk.js';
import { savingsDelta, netSavings } from '../src/utils/savingsFlow.js';
import { balanceDaily } from '../src/analytics/stats.js';
import { makePeriod } from '../src/analytics/period.js';

const E = (amount, date, category = '🥦 Продукты') => ({ type: 'expense', amount, date, category });
const I = (amount, date, category = '💼 Зарплата') => ({ type: 'income', amount, date, category });
const D = (amount, date, status = '➕ Пополнение') => ({ type: 'deposit', amount, date, status, name: 'Вклад' });

test('трата дня Акулки: без переводов, вкладов и «без учёта»', () => {
    const tx = [
        E(50_000, '2026-10-30'),
        E(7_400_000, '2026-10-30', '🏦 Вклад'),
        E(300_000, '2026-10-30', '🔁 Перевод между своими счетами'),
        E(1_000_000, '2026-10-30', 'Не знаю на что потратил (без учёта)'),
    ];
    assert.equal(getSpentOnDay({ transactions: tx, day: '2026-10-30' }), 50_000);
    assert.equal(isDailySpend(tx[1]), false);
    assert.equal(isDailySpend(tx[0]), true);
});

test('медианный лимит не раздувается крупным вкладом', () => {
    const tx = [];
    for (let d = 1; d <= 10; d++) tx.push(E(100_000, `2026-10-${String(d).padStart(2, '0')}`));
    tx.push(E(7_400_000, '2026-10-05', '🏦 Вклад'));
    assert.equal(getMedianLimit({ transactions: tx, today: '2026-10-20' }).limit, 100_000);
});

test('накоплено = пополнения − снятия; «Уже лежало» не новое накопление', () => {
    assert.equal(savingsDelta(D(100, '2026-10-01', '📥 Вклад')), 100);
    assert.equal(savingsDelta(D(30, '2026-10-02', '➖ Снятие')), -30);
    assert.equal(savingsDelta(D(500, '2026-10-02', '💾 Уже лежало')), 0);
    assert.equal(savingsDelta(E(200, '2026-10-03', '🏦 Перевод на вклад')), 200);
    assert.equal(savingsDelta(E(80, '2026-10-03', '🏦 Перевод с вклада')), -80);
    assert.equal(savingsDelta(E(80, '2026-10-03')), 0);
    const tx = [D(100, '2026-10-01', '📥 Вклад'), D(30, '2026-10-05', '➖ Снятие'), D(500, '2026-10-06', '💾 Уже лежало')];
    assert.deepEqual(netSavings(tx, '2026-10-01', '2026-10-31'), { net: 70, topups: 1 });
    const g = goalCalc({ sum: 1000, date: '2026-12-31', start: '2026-10-01' }, tx, '2026-10-10');
    assert.equal(g.saved, 70);
    assert.equal(g.left, 930);
    assert.deepEqual(savingsMonth(tx, '2026-10-10'), { sum: 70, count: 1 });
});

test('снятие больше пополнений не даёт отрицательного «накоплено»', () => {
    const tx = [D(100, '2026-10-01'), D(300, '2026-10-02', '➖ Снятие')];
    assert.equal(goalCalc({ sum: 1000, date: '2026-12-31', start: '2026-10-01' }, tx, '2026-10-10').saved, 0);
    assert.deepEqual(savingsMonth(tx, '2026-10-10'), { sum: 0, count: 0 });
});

test('итог месяца и 50/30/20: траты без переводов, накопления нетто', () => {
    const tx = [
        I(1_000_000, '2026-10-01'),
        I(500_000, '2026-10-02', '🔁 Перевод между своими счетами'),
        E(400_000, '2026-10-03'),
        E(500_000, '2026-10-04', '🔁 Перевод между своими счетами'),
        D(200_000, '2026-10-05'), D(50_000, '2026-10-06', '➖ Снятие'), D(900_000, '2026-10-07', '💾 Уже лежало'),
    ];
    const m = monthSummary(tx, '2026-10-20');
    assert.equal(m.exp, 400_000);
    assert.equal(m.inc, 1_000_000);
    assert.equal(m.sav, 150_000);
    assert.equal(m.top, '🥦 Продукты');
    const r = ruleCheck(tx, '2026-10-20');
    assert.equal(r.spentPct, 40);
    assert.equal(r.savePct, 15);
});

test('топ категорий Акулки — без вкладов и переводов', () => {
    const t = topCategories([E(100, '2026-10-10'), E(9000, '2026-10-10', '🏦 Вклад')], '2026-10-20', 30);
    assert.equal(t.total, 100);
    assert.equal(t.list[0][0], '🥦 Продукты');
});

test('«Куда ушли деньги вчера»: сумма полностью, с лимитом сравнивается база Акулки', () => {
    const tx = [E(80_000, '2026-10-19'), E(5_000_000, '2026-10-19', '🏦 Вклад')];
    const a = dayAnswer({ offset: -1, tx, today: '2026-10-20', limit: 100_000 });
    assert.match(a.text, /ушло 5 080 000/);
    assert.match(a.text, /В лимит идёт 80 000/);
    assert.doesNotMatch(a.text, /перерасход/);
});

test('динамика баланса: будущие записи не попадают в точку «сегодня», но входят в итог', () => {
    const tx = [I(100, '2026-10-01'), E(40, '2026-10-25')];
    const r = balanceDaily(tx, makePeriod({ keys: ['2026-10'] }), '2026-10-10');
    assert.equal(r.points.at(-1).date, '2026-10-10');
    assert.equal(r.points.at(-1).balance, 100);
    assert.equal(r.end, 60);
    assert.equal(r.later, -40);
});

test('P2P и переводы людям — обычные траты; переводы между своими счетами — нет', () => {
    const tx = [
        E(200_000, '2026-10-30', '🔄 P2P переводы'),
        E(100_000, '2026-10-30', '🔄 Перевод СБП'),
        E(5_000_000, '2026-10-30', '🔁 Перевод между своими счетами'),
        E(1_000_000, '2026-10-30', '🏦 Внутренний перевод Сбер'),
    ];
    assert.equal(getSpentOnDay({ transactions: tx, day: '2026-10-30' }), 300_000);
});
