import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../src/analytics/period.js';
import * as S from '../src/analytics/stats.js';

const T = (id, type, date, category, amount, extra = {}) => ({ id, type, date, category, amount, ...extra });
const ALL = [
    T(1, 'expense', '2026-09-10', 'Еда', 100),
    T(2, 'expense', '2026-09-20', 'Еда', 50),
    T(3, 'expense', '2026-10-05', 'Еда', 80, { products: [{ name: 'Хлеб', price: 30, quantity: 1 }, { name: 'Молоко', price: 50, quantity: 1 }] }),
    T(4, 'expense', '2026-10-20', 'Еда', 500, { products: [{ name: 'Плов', price: 500, quantity: 1 }] }),
    T(5, 'income', '2026-09-01', 'Зарплата', 1000),
    T(6, 'income', '2026-10-01', 'Зарплата', 1000),
    T(7, 'expense', '2026-10-03', 'Такси', 30),
    T(8, 'expense', '2025-12-31', 'Еда', 10),
    T(9, 'expense', '2026-10-01', 'Не знаю на что потратил (без учёта)', 999),
    T(10, 'deposit', '2026-10-02', null, 777, { status: '➕ Пополнение' }),
    { id: 11, type: 'debt', date: '2026-10-02', initialAmount: 5 },
];
const tx = S.baseTx(ALL);
const OCT = P.monthPeriod('2026-10');

test('baseTx: только income/expense, без системных категорий', () => {
    assert.equal(tx.length, 8);
});
test('sumTx по периоду и типу', () => {
    assert.equal(S.sumTx(tx, OCT, 'expense'), 610);
    assert.equal(S.sumTx(tx, OCT, 'income'), 1000);
    assert.equal(S.sumTx(tx, P.allTime(), 'expense'), 770);
});
test('comparison: неполный месяц сравнивается «на то же число»', () => {
    const c = S.comparison(tx, OCT, 'expense', '2026-10-10');
    assert.equal(c.partial, true);
    assert.equal(c.cur, 110);
    assert.equal(c.prev, 100);
    assert.ok(Math.abs(c.delta - 0.1) < 1e-9);
});
test('comparison: законченный месяц — полное сравнение', () => {
    const c = S.comparison(tx, OCT, 'expense', '2026-11-05');
    assert.equal(c.partial, false);
    assert.equal(c.cur, 610); assert.equal(c.prev, 150);
    assert.ok(Math.abs(c.delta - (610 - 150) / 150) < 1e-9);
});
test('comparison: для «всё время» нет предыдущего периода', () => {
    const c = S.comparison(tx, P.allTime(), 'expense', '2026-10-10');
    assert.equal(c.prev, null); assert.equal(c.delta, null);
});
test('categoryBreakdown', () => {
    const b = S.categoryBreakdown(tx, OCT, 'expense');
    assert.equal(b.total, 610);
    assert.deepEqual(b.rows.map(r => [r.name, r.sum, r.count]), [['Еда', 580, 2], ['Такси', 30, 1]]);
    assert.ok(Math.abs(b.rows[0].share - 580 / 610) < 1e-9);
});
test('topTransactions сортирует по сумме', () => {
    const top = S.topTransactions(tx, OCT, 2);
    assert.deepEqual(top.map(t => t.amount), [500, 80]);
    assert.equal(top[0].name, 'Плов');
});
test('categoryDetail', () => {
    const d = S.categoryDetail(tx, OCT, 'Еда', { todayISO: '2026-11-05' });
    assert.equal(d.total, 580); assert.equal(d.count, 2); assert.equal(d.avg, 290); assert.equal(d.median, 290);
    assert.equal(d.biggest.amount, 500); assert.equal(d.perMonth, 580);
    assert.ok(Math.abs(d.share - 580 / 610) < 1e-9);
    assert.equal(d.cmp.prev, 150); assert.ok(Math.abs(d.cmp.delta - (580 - 150) / 150) < 1e-9);
    assert.equal(d.trend.length, 6); assert.equal(d.trend[5].key, '2026-10'); assert.equal(d.trend[5].value, 580); assert.equal(d.trend[4].value, 150);
    assert.equal(d.weekday[0], 80); assert.equal(d.weekday[1], 500);
    assert.deepEqual(d.items.map(i => [i.name, Math.round(i.sum)]), [['Плов', 500], ['Молоко', 50], ['Хлеб', 30]]);
    assert.equal(Math.round(d.items.reduce((s, i) => s + i.sum, 0)), 580);
});
test('categoryDetail «Прочее»', () => {
    const d = S.categoryDetail(tx, OCT, 'Прочее', { todayISO: '2026-11-05', othersNames: new Set(['Такси']) });
    assert.equal(d.total, 30); assert.equal(d.count, 1);
});
test('balanceSeries: нарастающий итог на конец месяца', () => {
    const b = S.balanceSeries(tx, OCT);
    assert.equal(b.start, 850); assert.equal(b.end, 1240); assert.equal(b.change, 390); // отрицательный декабрь-2025 не переносится (как «Доступно»)
    assert.deepEqual(b.points.map(p => p.key), ['2026-10']);
    const all = S.balanceSeries(tx, P.allTime());
    assert.equal(all.points[0].key, '2025-12'); assert.equal(all.points[0].balance, -10);
    assert.equal(all.end, 1240); assert.equal(all.points.length, 11);
});
test('summaryRows: итоги и доля сбережений', () => {
    const keys = P.monthRange('2026-09', '2026-10');
    const s = S.summaryRows(tx, keys);
    assert.deepEqual(s.rows.map(r => [r.income, r.expense, r.net]), [[1000, 150, 850], [1000, 610, 390]]);
    assert.equal(s.totals.net, 1240); assert.ok(Math.abs(s.rows[1].rate - 0.39) < 1e-9);
});
test('heroSeries: 12 месяцев года, выбранные отмечены', () => {
    const h = S.heroSeries(tx, P.fromPreset('3m', '2026-10'), 2026, 'expense', '2025-12', '2026-10');
    assert.equal(h.length, 12);
    assert.equal(h[8].value, 150); assert.equal(h[9].value, 610);
    assert.deepEqual(h.map(x => x.selected).slice(6, 10), [false, true, true, true]);
    const net = S.heroSeries(tx, P.allTime(), 2026, 'net', '2025-12', '2026-10');
    assert.equal(net.length, 11); assert.equal(net[0].value, -10);
});
test('weekdayMon не зависит от часового пояса', () => {
    assert.equal(S.weekdayMon('2026-10-05'), 0); assert.equal(S.weekdayMon('2026-10-11'), 6);
});

test('balanceDaily: нарастающий баланс по дням, старт — всё, что было до периода', () => {
    const tx = [
        { type: 'income', amount: 100, date: '2026-09-20' },
        { type: 'expense', amount: 30, date: '2026-10-02' },
        { type: 'income', amount: 50, date: '2026-10-03' },
        { type: 'expense', amount: 5, date: '2026-10-09' },
    ];
    const r = S.balanceDaily(tx, P.makePeriod({ keys: ['2026-10'] }), '2026-10-05');
    assert.equal(r.start, 100);
    assert.equal(r.points.length, 5);
    assert.deepEqual(r.points.map(x => x.balance), [100, 70, 120, 120, 115]);
    assert.equal(r.end, 115); // операция 9 окт (после «сегодня») учтена в последней точке
    assert.equal(r.change, 15);
});

test('topTransactions: помечает вклады/переводы как не бытовые, но не выкидывает', () => {
    const tx = [T(1, 'expense', '2026-10-01', 'Вклад', 1000), T(2, 'expense', '2026-10-02', 'Еда', 500)];
    const r = S.topTransactions(tx, P.makePeriod({ keys: ['2026-10'] }), 5);
    assert.equal(r.length, 2);
    assert.equal(r[0].financial, true);
    assert.equal(r[1].financial, false);
});
