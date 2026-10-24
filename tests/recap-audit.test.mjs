import './recap-strict.setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecap } from '../src/recap/recapStats.js';
import { buildWeekRecap, buildYearRecap } from '../src/recap/recapPeriods.js';
import { monthlyTotals, baseTx } from '../src/analytics/stats.js';
import { isFinancialCategory } from '../src/utils/insightsMath.js';

// детерминированный «живой» набор: траты, доходы, переводы, вклады, долги, системные категории
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const CATS = ['🥦 Продукты', '🚖 Такси', '🍔 Кафе', '🏠 Аренда', '🔁 Перевод между своими счетами', '🏦 Вклад', '💸 Кредиты и рассрочки', 'Не знаю на что потратил (без учёта)'];
const ICATS = ['💰 Зарплата', '🎁 Подарок', '🔁 Перевод между своими счетами', '🤝 Долги и займы'];
const pad = n => String(n).padStart(2, '0');
function dataset() {
    const tx = [];
    for (const m of ['2025-09', '2026-07', '2026-08', '2026-09']) for (let d = 1; d <= 28; d++) for (let k = 0; k < 2; k++) {
        if (rnd() < 0.2) continue;
        tx.push({ type: 'expense', date: `${m}-${pad(d)}`, category: CATS[Math.floor(rnd() * CATS.length)], amount: Math.round(rnd() * 90000) + 1000, products: [{ name: 'x' }] });
        if (rnd() < 0.12) tx.push({ type: 'income', date: `${m}-${pad(d)}`, category: ICATS[Math.floor(rnd() * ICATS.length)], amount: Math.round(rnd() * 900000) + 1000 });
    }
    return tx;
}
const sum = a => a.reduce((s, t) => s + Number(t.amount), 0);

test('аудит: итоги месяца совпадают с независимым пересчётом', () => {
    const tx = dataset();
    const r = buildRecap(tx, '2026-10-05');
    assert.equal(r.ok, true);
    // как на главном экране и в выборе периода: все доходы и расходы месяца, в том числе «без учёта»
    const mt = tx.filter(t => t.date.startsWith('2026-09'));
    const E = sum(mt.filter(t => t.type === 'expense')), I = sum(mt.filter(t => t.type === 'income'));
    assert.equal(r.expense, E); assert.equal(r.income, I); assert.equal(r.net, I - E);
    // бытовые траты
    const real = baseTx(mt).filter(t => t.type === 'expense' && !isFinancialCategory(t.category));
    assert.equal(r.spend, sum(real));
    assert.equal(r.fin.expense, E - sum(real));
    assert.equal(Math.round(r.daily.reduce((s, v) => s + v, 0)), sum(real));
    assert.equal(r.noSpendDays, r.daily.filter(v => v === 0).length);
    const catSum = r.topCats.reduce((s, c) => s + c.amount, 0);
    assert.ok(catSum <= sum(real));
    assert.ok(Math.abs(r.topCats[0].share - r.topCats[0].amount / sum(real)) < 1e-9);
    assert.equal(r.bigTx.amount, Math.max(...real.map(t => Number(t.amount))));
    assert.equal(r.weekdays.reduce((s, v) => s + v, 0), sum(real));
});

test('аудит: неделя и год сходятся с Аналитикой', () => {
    const tx = dataset();
    const w = buildWeekRecap(tx, '2026-09-27', true); // воскресенье → пн 21 – вс 27 сентября
    assert.equal(w.ok, true);
    {
        const wt = tx.filter(t => t.date >= w.from && t.date <= w.to);
        assert.equal(w.expense, sum(wt.filter(t => t.type === 'expense')));
        assert.equal(w.income, sum(wt.filter(t => t.type === 'income')));
        assert.equal(w.net, w.income - w.expense);
    }
    const y = buildYearRecap(tx, '2026-12-30');
    assert.equal(y.ok, true);
    {
        const yt = tx.filter(t => t.date.startsWith('2026'));
        assert.equal(y.expense, sum(yt.filter(t => t.type === 'expense')));
        assert.equal(y.income, sum(yt.filter(t => t.type === 'income')));
    }
});
