import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../src/analytics/period.js';

test('пустой набор месяцев = всё время', () => {
    assert.equal(P.makePeriod({ keys: [] }).all, true);
    assert.equal(P.makePeriod({ keys: ['bad', '2026-13'] }).all, true);
});
test('ключи сортируются и дедуплицируются', () => {
    const p = P.makePeriod({ keys: ['2026-10', '2026-08', '2026-10'] });
    assert.deepEqual(p.keys, ['2026-08', '2026-10']);
});
test('addMonths / monthRange через границу года', () => {
    assert.equal(P.addMonths('2026-01', -1), '2025-12');
    assert.equal(P.addMonths('2026-11', 3), '2027-02');
    assert.deepEqual(P.monthRange('2025-11', '2026-02'), ['2025-11', '2025-12', '2026-01', '2026-02']);
});
test('пресеты и их распознавание', () => {
    assert.equal(P.presetOf(P.fromPreset('month', '2026-10')), 'month');
    const q = P.fromPreset('3m', '2026-02');
    assert.deepEqual(q.keys, ['2025-12', '2026-01', '2026-02']);
    assert.equal(P.presetOf(q), '3m');
    const y = P.fromPreset('year', '2026-07');
    assert.equal(y.keys.length, 12); assert.equal(P.presetOf(y), 'year');
    assert.equal(P.presetOf(P.makePeriod({ keys: ['2026-01', '2026-03'] })), 'custom');
    assert.equal(P.presetOf(P.allTime()), 'all');
});
test('inPeriod учитывает год', () => {
    const p = P.monthPeriod('2026-10');
    assert.ok(P.inPeriod(p, '2026-10-31')); assert.ok(!P.inPeriod(p, '2025-10-15')); assert.ok(!P.inPeriod(p, '2026-11-01'));
    assert.ok(P.inPeriod(P.allTime(), '1999-01-01'));
});
test('toggleMonth: из «всё время», добавление, снятие, пустой набор → год', () => {
    let p = P.toggleMonth(P.allTime(), '2026-03', 2026);
    assert.deepEqual(p.keys, ['2026-03']);
    p = P.toggleMonth(p, '2026-05', 2026); assert.deepEqual(p.keys, ['2026-03', '2026-05']);
    p = P.toggleMonth(p, '2026-03', 2026); assert.deepEqual(p.keys, ['2026-05']);
    p = P.toggleMonth(p, '2026-05', 2026); assert.equal(P.presetOf(p), 'year'); assert.equal(p.keys[0], '2026-01');
});
test('previousPeriod: тот же размер окна, через границу года', () => {
    const prev = P.previousPeriod(P.fromPreset('3m', '2026-02'));
    assert.deepEqual(prev.keys, ['2025-09', '2025-10', '2025-11']);
    assert.equal(P.previousPeriod(P.yearPeriod(2026)).keys[0], '2025-01');
    assert.equal(P.previousPeriod(P.allTime()), null);
});
test('periodBounds', () => {
    assert.deepEqual(P.periodBounds(P.makePeriod({ keys: ['2026-02', '2026-03'] })), { from: '2026-02-01', to: '2026-03-31' });
    assert.deepEqual(P.periodBounds(P.monthPeriod('2024-02')), { from: '2024-02-01', to: '2024-02-29' });
});
test('periodLabel', () => {
    assert.equal(P.periodLabel(P.allTime()), 'Всё время');
    assert.equal(P.periodLabel(P.monthPeriod('2026-10')), 'Октябрь 2026');
    assert.equal(P.periodLabel(P.yearPeriod(2026)), '2026 год');
    assert.equal(P.periodLabel(P.fromPreset('3m', '2026-10')), 'авг–окт 2026');
    assert.equal(P.periodLabel(P.fromPreset('3m', '2026-02')), 'дек 2025 – фев 2026');
    assert.equal(P.periodLabel(P.makePeriod({ keys: ['2026-01', '2026-03', '2026-06'] })), 'янв, мар, июн 2026');
});
test('anchorOf: для «всё время» — текущий, но не позже последних данных', () => {
    assert.equal(P.anchorOf(P.allTime(), '2026-10', '2026-10'), '2026-10');
    assert.equal(P.anchorOf(P.allTime(), '2026-10', '2026-04'), '2026-04');
    assert.equal(P.anchorOf(P.fromPreset('3m', '2026-08'), '2026-10', '2026-10'), '2026-08');
});
test('save/load', () => {
    const mem = new Map(); const st = { setItem: (k, v) => mem.set(k, v), getItem: k => mem.get(k) ?? null };
    P.savePeriod(P.fromPreset('3m', '2026-10'), st);
    assert.deepEqual(P.loadPeriod(st).keys, ['2026-08', '2026-09', '2026-10']);
    assert.equal(P.loadPeriod({ getItem: () => 'x{' }), null);
});
