import './recap-strict.setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    weekWindow, yearWindow, availableRecaps, buildWeekRecap, buildYearRecap, buildAnyRecap,
    addDays, daysBetween, markRecapSeen, isRecapSeen, rangeLabel
} from '../src/recap/recapPeriods.js';
import { monthRecords, yearRecords } from '../src/recap/recapRecords.js';

const pad = n => String(n).padStart(2, '0');
const exp = (date, amount, category = '🥦 Продукты') => ({ type: 'expense', date, category, amount, products: [{ name: 'x' }] });
const inc = (date, amount) => ({ type: 'income', date, category: '💰 Зарплата', amount });
function fullMonth(key, amount, extra = {}) {
    const out = [];
    for (let d = 1; d <= 20; d++) out.push(exp(`${key}-${pad(d)}`, amount, d % 2 ? '🥦 Продукты' : '🚖 Такси'));
    out.push(inc(`${key}-05`, extra.income ?? 5000000));
    return out;
}

test('даты считаются без часовых поясов', () => {
    assert.equal(addDays('2026-10-25', 1), '2026-10-26');
    assert.equal(addDays('2026-03-01', -1), '2026-02-28');
    assert.equal(daysBetween('2026-10-19', '2026-10-25'), 6);
    assert.equal(rangeLabel('2026-10-19', '2026-10-25'), '19–25 октября');
    assert.equal(rangeLabel('2026-10-27', '2026-11-02'), '27 октября — 2 ноября');
});

test('окно недели: воскресенье — текущая, понедельник — прошедшая, остальные дни — нет', () => {
    assert.deepEqual(weekWindow('2026-10-25'), { from: '2026-10-19', to: '2026-10-25' });
    assert.deepEqual(weekWindow('2026-10-26'), { from: '2026-10-19', to: '2026-10-25' });
    for (const d of ['2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31']) assert.equal(weekWindow(d), null, d);
});

test('окно года: декабрь — текущий, январь — прошедший', () => {
    assert.deepEqual(yearWindow('2026-12-05'), { year: 2026 });
    assert.deepEqual(yearWindow('2027-01-03'), { year: 2026 });
    assert.equal(yearWindow('2026-10-25'), null);
});

test('итоги недели: суммы, лучший день, сравнение с прошлой неделей', () => {
    const tx = [];
    for (let d = 19; d <= 23; d++) tx.push(exp(`2026-10-${d}`, 10000));
    tx.push(exp('2026-10-25', 50000));
    for (let d = 12; d <= 16; d++) tx.push(exp(`2026-10-${d}`, 20000));
    const r = buildWeekRecap(tx, '2026-10-25');
    assert.equal(r.ok, true);
    assert.equal(r.expense, 100000);
    assert.equal(r.priciest.date, '2026-10-25');
    assert.equal(r.noSpendDays, 1);
    assert.ok(Math.abs(r.vsPrev.delta - 0) < 1e-9);
    assert.equal(r.activeDays, 6);
    assert.equal(buildWeekRecap(tx, '2026-10-27').ok, false);
});

test('итоги недели: меньше 2 дней записей — не показываем', () => {
    const tx = [exp('2026-10-21', 1), exp('2026-10-21', 5)];
    assert.equal(buildWeekRecap(tx, '2026-10-25').ok, false);
    assert.equal(availableRecaps(tx, '2026-10-25').some(r => r.kind === 'week'), false);
});

test('что предлагаем и когда: месяц — всегда при данных, неделя — вс/пн, год — зима, баннер месяца — первые 5 дней', () => {
    const tx = fullMonth('2026-09', 100000);
    const kinds = d => availableRecaps(tx, d).map(r => r.kind + (r.banner ? '+b' : ''));
    assert.deepEqual(kinds('2026-10-03'), ['month+b']);
    assert.deepEqual(kinds('2026-10-06'), ['month']);
    assert.deepEqual(kinds('2026-10-27'), ['month']);
});

test('итоги года: нужно ≥60 дней и ≥3 месяцев, баннер 25 дек — 7 янв', () => {
    let tx = [];
    for (let m = 1; m <= 6; m++) tx = tx.concat(fullMonth(`2026-${pad(m)}`, 100000 + m * 10000));
    assert.equal(buildYearRecap(tx, '2026-12-28').ok, true);
    assert.equal(buildYearRecap(tx.slice(0, 40), '2026-12-28').ok, false);
    const on = d => (availableRecaps(tx, d).find(r => r.kind === 'year') || {}).banner;
    assert.equal(on('2026-12-10'), false);
    assert.equal(on('2026-12-26'), true);
    assert.equal(on('2027-01-05'), true);
    assert.equal(on('2027-01-20'), false);
    assert.equal(availableRecaps(tx, '2026-11-10').some(r => r.kind === 'year'), false);
    const y = buildYearRecap(tx, '2026-12-28');
    assert.equal(y.topMonth.key, '2026-06');
    assert.equal(y.lowMonth.key, '2026-01');
    assert.ok(y.records.length >= 2);
});

test('рекорды месяца: нужны ≥3 полных месяца, экономный месяц и рекорд по категории', () => {
    const base = fullMonth('2026-05', 100000).concat(fullMonth('2026-06', 110000), fullMonth('2026-07', 120000));
    assert.equal(monthRecords(base.slice(0, 40), '2026-07').length, 0);
    const cheap = base.concat(fullMonth('2026-08', 50000));
    const rec = monthRecords(cheap, '2026-08');
    assert.ok(rec.some(r => r.title === 'Самый экономный месяц'));
    const dear = base.concat(fullMonth('2026-08', 300000));
    const r2 = monthRecords(dear, '2026-08');
    assert.ok(r2.some(r => r.title === 'Рекордные траты'));
    assert.ok(r2.some(r => r.title.startsWith('Рекорд: ')));
    assert.ok(r2.length <= 4);
});

test('просмотрено запоминается по виду и ключу периода', () => {
    const store = {};
    globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
    const r = { kind: 'month', key: '2026-09' };
    assert.equal(isRecapSeen(r), false);
    markRecapSeen(r);
    assert.equal(isRecapSeen(r), true);
    assert.equal(isRecapSeen({ kind: 'month', key: '2026-10' }), false);
    assert.equal(isRecapSeen({ kind: 'week', key: '2026-09' }), false);
});

test('buildAnyRecap выбирает нужный расчёт', () => {
    assert.equal(buildAnyRecap('week', [], '2026-10-25').kind, 'week');
    assert.equal(buildAnyRecap('year', [], '2026-12-25').kind, 'year');
    assert.equal(buildAnyRecap('month', [], '2026-10-25').kind, 'month');
    assert.equal(typeof yearRecords, 'function');
});

test('кнопки в чате (force): последняя полная неделя и год на сегодня в любой день', () => {
    assert.deepEqual(weekWindow('2026-10-28', true), { from: '2026-10-19', to: '2026-10-25' });
    assert.deepEqual(weekWindow('2026-10-25', true), { from: '2026-10-19', to: '2026-10-25' });
    assert.equal(weekWindow('2026-10-28'), null);
    assert.deepEqual(yearWindow('2026-10-25', true), { year: 2026 });
    assert.deepEqual(yearWindow('2027-01-10', true), { year: 2026 });
    assert.equal(buildAnyRecap('week', [exp('2026-10-19', 1), exp('2026-10-20', 1), exp('2026-10-21', 1), exp('2026-10-22', 1)], '2026-10-28', true).ok, true);
    assert.equal(buildAnyRecap('week', [], '2026-10-28', true).ok, false);
});

test('месяц против того же месяца прошлого года; без истории — слайда нет', () => {
    const all = [...fullMonth('2025-09', 100000), ...fullMonth('2026-09', 150000)];
    const r = buildAnyRecap('month', all, '2026-10-03');
    assert.equal(r.ok, true);
    assert.ok(r.vsYear, 'есть сравнение с прошлым годом');
    assert.equal(r.vsYear.year, 2025);
    assert.equal(Math.round(r.vsYear.expenseDelta * 100), 50);
    const lone = buildAnyRecap('month', fullMonth('2026-09', 150000), '2026-10-03');
    assert.equal(lone.vsYear, null);
});

test('цель накопления попадает в итоги, пока не достигнута', () => {
    const store = new Map();
    globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) };
    try {
        const all = [...fullMonth('2026-09', 100000), { type: 'deposit', date: '2026-09-10', amount: 300000, category: 'Вклад' }];
        store.set('budgetit:shark:goal', JSON.stringify({ sum: 1000000, date: '2026-12-31', start: '2026-09-01' }));
        const r = buildAnyRecap('month', all, '2026-10-03');
        assert.ok(r.goal && r.goal.pct === 30 && r.goal.left === 700000, JSON.stringify(r.goal));
        store.set('budgetit:shark:goal', JSON.stringify({ sum: 1000000, date: '2026-12-31', start: '2026-09-01', status: 'done' }));
        assert.equal(buildAnyRecap('month', all, '2026-10-03').goal, null);
    } finally { delete globalThis.localStorage; }
});
