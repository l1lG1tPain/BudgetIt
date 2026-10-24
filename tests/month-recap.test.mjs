import './recap-strict.setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecap, recapAvailability, prevMonthKey, monthName, MIN_ACTIVE_DAYS } from '../src/recap/recapStats.js';

const pad = n => String(n).padStart(2, '0');
function month(key, days, extra = []) {
    const tx = [];
    for (const d of days) tx.push({ type: 'expense', date: `${key}-${pad(d)}`, category: '🥦 Продукты', amount: 10000 + d, products: [{ name: 'Магнит' }] });
    return tx.concat(extra);
}
const days = n => Array.from({ length: n }, (_, i) => i + 1);

test('прошлый месяц считается от сегодняшней даты, в январе — декабрь', () => {
    assert.equal(prevMonthKey('2026-10-24'), '2026-09');
    assert.equal(prevMonthKey('2026-01-03'), '2025-12');
    assert.equal(monthName('2025-12'), 'декабрь');
});

test('меньше 15 дней с записями — рассказа нет и считается, чего не хватает', () => {
    const r = buildRecap(month('2026-09', days(14)), '2026-10-24');
    assert.equal(r.ok, false);
    assert.equal(r.activeDays, 14);
    assert.equal(r.missingDays, 1);
    assert.equal(recapAvailability(month('2026-09', days(15)), '2026-10-24').eligible, true);
});

test('несколько записей в один день считаются одним днём; другие месяцы не в счёт', () => {
    const tx = month('2026-09', days(10)).concat(month('2026-09', days(10))).concat(month('2026-08', days(30)));
    assert.equal(recapAvailability(tx, '2026-10-24').activeDays, 10);
});

test('итоги: доходы, расходы, остаток, категории, самая крупная трата', () => {
    const tx = month('2026-09', days(16), [
        { type: 'income', date: '2026-09-05', category: '💰 Зарплата', amount: 1000000 },
        { type: 'expense', date: '2026-09-10', category: '🏠 Аренда', amount: 500000, products: [{ name: 'Квартира' }] },
        { type: 'expense', date: '2026-09-11', category: '🔁 Перевод между своими счетами', amount: 999999 },
        { type: 'deposit', date: '2026-09-12', name: 'вклад', amount: 777777 }
    ]);
    const r = buildRecap(tx, '2026-10-24');
    assert.equal(r.ok, true);
    assert.equal(r.income, 1000000);
    const groceries = days(16).reduce((s, d) => s + 10000 + d, 0);
    // «бытовые» траты — без переводов; итог месяца — как в Аналитике, по всем операциям
    assert.equal(r.spend, groceries + 500000);
    assert.equal(r.expense, groceries + 500000 + 999999);
    assert.equal(r.net, 1000000 - r.expense);
    assert.equal(r.fin.expense, 999999);
    assert.equal(r.topCats[0].text, 'Аренда');
    assert.equal(r.bigTx.title, 'Квартира');
    assert.equal(r.daily.length, 30);
    assert.equal(r.noSpendDays, 30 - new Set([...days(16), 10]).size);
    assert.ok(r.persona.title);
});

test('сравнение с прошлым месяцем только если там достаточно записей', () => {
    const base = month('2026-09', days(20));
    assert.equal(buildRecap(base.concat(month('2026-08', days(3))), '2026-10-24').vsPrev.comparable, false);
    const v = buildRecap(base.concat(month('2026-08', days(20))), '2026-10-24').vsPrev;
    assert.equal(v.comparable, true);
    assert.ok(Math.abs(v.expenseDelta) < 0.01);
});

test('минимум дней задан в одном месте', () => { assert.equal(MIN_ACTIVE_DAYS, 15); });

import { recapChatVisible } from '../src/recap/recapStats.js';
test('кнопка в чате Акулки — только в первые 10 дней месяца', () => {
    assert.equal(recapChatVisible('2026-10-01'), true);
    assert.equal(recapChatVisible('2026-10-10'), true);
    assert.equal(recapChatVisible('2026-10-11'), false);
    assert.equal(recapChatVisible('2026-10-24'), false);
});

import { recapMood } from '../src/recap/recapStats.js';
test('Акулка на первом слайде зависит от итога месяца', () => {
    const m = (income, expense) => recapMood({ income, expense, net: income - expense, saveRate: income ? (income - expense) / income : 0 }).emotion;
    assert.equal(m(1000, 500), 'celebrate');
    assert.equal(m(1000, 750), 'proud');
    assert.equal(m(1000, 950), 'count-happy');
    assert.equal(m(1000, 1100), 'count-cold');
    assert.equal(m(1000, 1300), 'shock');
    assert.equal(m(1000, 2000), 'broke');
    assert.equal(m(0, 500), 'count-cold');
});
test('все эмоции Акулки существуют как файлы', async () => {
    const { existsSync } = await import('node:fs');
    for (const e of ['celebrate', 'proud', 'count-happy', 'count-cold', 'shock', 'broke'])
        assert.ok(existsSync(new URL(`../assets/hoodie/hoodie-${e}.webp`, import.meta.url)), e);
});

test('плюс/минус месяца совпадает с «Итогом» Аналитики (переводы и вклады не прячутся)', async () => {
    const { monthlyTotals } = await import('../src/analytics/stats.js');
    const { baseTx } = await import('../src/analytics/stats.js');
    const tx = month('2026-09', days(16), [
        { type: 'income', date: '2026-09-05', category: '💰 Зарплата', amount: 300000 },
        { type: 'expense', date: '2026-09-12', category: '🏦 Вклад', amount: 900000 },
        { type: 'income', date: '2026-09-20', category: '🔁 Перевод между своими счетами', amount: 50000 }
    ]);
    const r = buildRecap(tx, '2026-10-24');
    const a = monthlyTotals(baseTx(tx), ['2026-09'])[0];
    assert.equal(r.income, a.income);
    assert.equal(r.expense, a.expense);
    assert.equal(r.net, a.net);
    assert.ok(r.net < 0, 'вклад больше зарплаты — месяц в минусе, как в Аналитике');
});
