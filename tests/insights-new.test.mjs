import test from 'node:test';
import assert from 'node:assert/strict';
import { calcBigPurchases, calcYearOverYear, calcSavingsPace, calcNoSpendDays, calcTypicalDay } from '../src/utils/insightsNew.js';

const E = (date, amount, category = '🛒 Продукты') => ({ type: 'expense', date, amount, category });
const I = (date, amount, category = '💰 Зарплата') => ({ type: 'income', date, amount, category });
const days = (from, n, amount) => Array.from({ length: n }, (_, i) => E(`2026-10-${String(from + i).padStart(2, '0')}`, amount));

test('крупные траты: операции дороже 10 медиан и их доля', () => {
    const exp = [...days(1, 20, 10_000), E('2026-10-25', 500_000, '🎧 Наушники')];
    const r = calcBigPurchases(exp, '2026-10-31');
    assert.equal(r.count, 1);
    assert.equal(r.sum, 500_000);
    assert.equal(Math.round(r.share * 100), 71);
    assert.equal(r.top[0].category, '🎧 Наушники');
    assert.equal(calcBigPurchases(days(1, 20, 10_000), '2026-10-31'), null); // крупных нет
});

test('год к году: прошлый полный месяц против того же месяца год назад', () => {
    const exp = [E('2026-10-05', 120), E('2025-10-05', 100), E('2026-11-01', 999)];
    const inc = [I('2026-10-01', 300), I('2025-10-01', 200)];
    const r = calcYearOverYear(exp, inc, '2026-11-01');
    assert.equal(r.month, '2026-10');
    assert.equal(r.lastYear, '2025-10');
    assert.equal(Math.round(r.expGrowth * 100), 20);
    assert.equal(Math.round(r.incGrowth * 100), 50);
    assert.equal(calcYearOverYear([E('2026-10-05', 120)], [], '2026-11-01'), null); // нет прошлого года
});

test('откладываешь: пополнения минус снятия за 3 полных месяца, «Уже лежало» не считается', () => {
    const tx = [
        { type: 'deposit', date: '2026-08-10', amount: 300, status: '➕ Пополнение' },
        { type: 'deposit', date: '2026-09-10', amount: 100, status: '➖ Снятие' },
        { type: 'expense', date: '2026-10-10', amount: 400, category: '🏦 Вклад' },
        { type: 'deposit', date: '2026-10-11', amount: 9999, status: '💾 Уже лежало' },
        { type: 'deposit', date: '2026-11-01', amount: 5000, status: '➕ Пополнение' }, // текущий месяц не входит
    ];
    const r = calcSavingsPace(tx, '2026-11-01');
    assert.equal(r.net, 600);
    assert.equal(r.avg, 200);
    assert.equal(r.yearly, 2400);
    assert.equal(r.from, '2026-08');
    assert.equal(calcSavingsPace([E('2026-10-01', 5)], '2026-11-01'), null);
});

test('дни без трат: прошлый месяц и самая длинная пауза', () => {
    const exp = [];
    for (let d = 1; d <= 31; d++) if (![10, 11, 12, 20].includes(d)) exp.push(E(`2026-10-${String(d).padStart(2, '0')}`, 1000));
    const r = calcNoSpendDays(exp, '2026-11-05');
    assert.equal(r.month, '2026-10');
    assert.equal(r.days, 4);
    assert.equal(r.best, 3);
    assert.equal(r.curDays, 4); // 1–4 ноября трат нет
});

test('обычный день: медиана дневных трат и дорогие дни', () => {
    const exp = [...days(1, 12, 100_000), E('2026-10-20', 1_000_000)];
    const r = calcTypicalDay(exp, '2026-10-30'); // окно 1–30 октября
    assert.equal(r.median, 100_000);
    assert.equal(r.heavyDays, 1);
    assert.equal(r.daysWithSpend, 13);
    assert.equal(Math.round(r.heavyShare * 100), 45);
});
