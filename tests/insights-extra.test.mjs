import test from 'node:test';
import assert from 'node:assert/strict';
import * as X from '../src/utils/insightsExtra.js';

const e = (date, amount, category = 'Еда', extra = {}) => ({ type: 'expense', date, amount, category, ...extra });

test('calcRunway: остаток / средний расход за 14 дней', () => {
    const exp = [e('2026-10-05', 1400)]; // 1400 за 14 дней → 100/день
    const r = X.calcRunway(1000, exp, '2026-10-10');
    assert.equal(r.perDay, 100); assert.equal(r.days, 10); assert.equal(r.until, '2026-10-20');
    assert.equal(X.calcRunway(0, exp, '2026-10-10').empty, true);
    assert.equal(X.calcRunway(500, [], '2026-10-10'), null);
});
test('calcSafePerDay: лимит на оставшиеся дни месяца с учётом сегодняшних трат', () => {
    const r = X.calcSafePerDay(2100, [e('2026-10-10', 100)], '2026-10-10');
    assert.equal(r.left, 22); assert.equal(r.todaySpent, 100); assert.equal(r.perDay, 100); assert.equal(r.over, false);
    assert.equal(X.calcSafePerDay(-5, [], '2026-10-10').over, true);
});
test('calcWeekdayWeekend: средний расход в день для будней и выходных', () => {
    const exp = [];
    for (let d = 1; d <= 28; d++) { const ds = `2026-09-${String(d).padStart(2, '0')}`; const w = new Date(ds + 'T00:00:00Z').getUTCDay(); exp.push(e(ds, (w === 0 || w === 6) ? 200 : 100)); }
    const r = X.calcWeekdayWeekend(exp, '2026-10-10');
    assert.equal(r.wdPer, 100); assert.equal(r.wePer, 200); assert.equal(r.ratio, 2);
});
test('calcHabits: частая категория × год, обязательные исключены', () => {
    const exp = [];
    for (let i = 0; i < 9; i++) exp.push(e(`2026-09-${String(i + 1).padStart(2, '0')}`, 90, '🚖 Такси'));
    for (let i = 0; i < 9; i++) exp.push(e(`2026-09-${String(i + 1).padStart(2, '0')}`, 900, '🏠 Жильё'));
    const h = X.calcHabits(exp, '2026-10-10');
    assert.equal(h.length, 1); assert.equal(h[0].cat, '🚖 Такси'); assert.equal(Math.round(h[0].yearly), Math.round(810 / 90 * 365));
});
test('findSubscriptions: ежемесячный платёж одному получателю на одну сумму', () => {
    const mk = (d, a, n) => e(d, a, 'Софт', { products: [{ name: n, price: a, quantity: 1 }] });
    const exp = [mk('2026-06-05', 100, 'ChatGPT'), mk('2026-07-05', 100, 'ChatGPT'), mk('2026-08-06', 100, 'ChatGPT'), mk('2026-09-05', 100, 'ChatGPT'),
        mk('2026-09-01', 50, 'Магазин'), mk('2026-09-02', 70, 'Магазин'), mk('2026-09-03', 30, 'Магазин')];
    const r = X.findSubscriptions(exp, '2026-10-10');
    assert.deepEqual(r.map(x => x.name), ['chatgpt']); assert.equal(r[0].amount, 100);
});
test('calcPaydayWeek: доля трат в первые 7 дней цикла', () => {
    const inc = ['2026-05-06', '2026-06-06', '2026-07-06', '2026-08-06', '2026-09-06'].map(d => ({ type: 'income', date: d, amount: 1000 }));
    const exp = [];
    for (const d of ['2026-05-07', '2026-06-07', '2026-07-07', '2026-08-07']) { exp.push(e(d, 600)); exp.push(e(d.slice(0, 8) + '20', 400)); }
    const r = X.calcPaydayWeek(inc, exp, '2026-10-10');
    assert.ok(r && Math.abs(r.share - 60) < 1e-9);
});
