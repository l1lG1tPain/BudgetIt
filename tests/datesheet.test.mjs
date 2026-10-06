import test from 'node:test';
import assert from 'node:assert/strict';
import { toISO, parseISO, formatDateLabel, buildMonthCells } from '../src/ui/DateSheet.js';

test('toISO/parseISO туда-обратно, мусор → null', () => {
    assert.equal(toISO(parseISO('2026-10-06')), '2026-10-06');
    assert.equal(parseISO(''), null);
    assert.equal(parseISO('06.10.2026'), null);
});
test('подпись даты', () => {
    const now = new Date(2026, 9, 6);
    assert.equal(formatDateLabel('2026-10-06', now), 'Сегодня, 6 октября');
    assert.equal(formatDateLabel('2026-10-05', now), 'Вчера, 5 октября');
    assert.equal(formatDateLabel('2026-09-30', now), '30 сентября');
    assert.equal(formatDateLabel('2025-12-31', now), '31 декабря 2025');
    assert.equal(formatDateLabel('', now), 'Выберите дату');
});
test('сетка месяца: октябрь 2026 начинается с четверга', () => {
    const c = buildMonthCells(2026, 9);
    assert.equal(c.filter(x => x === null).length, 3);
    assert.equal(c[3], 1);
    assert.equal(c.length, 3 + 31);
});
