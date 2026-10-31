// Закрытие вклада: после закрытия остаток ровно 0, последний месяц не уходит в минус.
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
const noop = () => {};
globalThis.localStorage = globalThis.localStorage || { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), clear: () => store.clear() };
globalThis.window = globalThis.window || { addEventListener: noop, dispatchEvent: noop, matchMedia: () => ({ matches: false }) };
globalThis.document = globalThis.document || {
    addEventListener: noop, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ style: {}, classList: { add: noop, remove: noop }, appendChild: noop }),
    documentElement: { style: { setProperty: noop }, getAttribute: () => null }, body: {}
};
globalThis.getComputedStyle = globalThis.getComputedStyle || (() => ({ getPropertyValue: () => '' }));
globalThis.trackSafe = globalThis.trackSafe || noop;

const { BudgetManager } = await import('../src/BudgetManager.js');
let UI = null;
try { ({ UIManager: UI } = await import('../src/UIManager.js')); } catch (e) { console.warn('UIManager не импортируется:', e.message); }

function setup(transactions) {
    const bm = new BudgetManager(null);
    bm.budgets = [{ id: 'b', name: 'T', transactions }];
    bm.currentBudgetIndex = 0;
    bm.saveToStorage = noop;
    bm.addTransaction = tx => bm.budgets[0].transactions.push(tx);
    const ui = Object.create(UI.prototype);
    ui.budgetManager = bm; ui.monthNames = {};
    return { bm, ui, sched: root => UI.prototype.buildDepositSchedule.call(ui, root) };
}
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

test('закрытие в прошлом месяце: снятие в последний день месяца, остаток 0, проценты только до даты закрытия', { skip: !UI }, () => {
    const root = { id: 10, type: 'deposit', depositId: 10, date: '2026-01-05', name: 'B', amount: 1_000_000, status: '📥 Вклад', annualRate: 20, termMonths: 6 };
    const { bm, ui, sched } = setup([root]);
    const before = sched(root).rows;
    UI.prototype.closeDepositAtIndex.call(ui, root, 2, before);
    const wd = bm.budgets[0].transactions.at(-1);
    assert.equal(wd.status, '➖ Снятие');
    assert.equal(wd.date, '2026-03-31');
    assert.equal(root.termMonths, 3);
    const rows = sched(root).rows;
    assert.equal(rows.length, 3);
    assert.equal(rows[2].endBalance, 0);
    assert.ok(rows.every(r => r.endBalance >= 0 && r.interest >= 0));
    // снято ровно: старт марта + проценты за 1–30 марта
    assert.equal(wd.amount, rows[2].startBalance + rows[2].interest);
});

test('закрытие в текущем месяце: снятие сегодня, остаток 0', { skip: !UI }, () => {
    const now = new Date();
    const first = `${ymd(now).slice(0, 7)}-01`;
    const root = { id: 30, type: 'deposit', depositId: 30, date: first, name: 'B', amount: 500_000, status: '📥 Вклад', annualRate: 18, termMonths: 3 };
    const { bm, ui, sched } = setup([root]);
    UI.prototype.closeDepositAtIndex.call(ui, root, 0, sched(root).rows);
    const wd = bm.budgets[0].transactions.at(-1);
    assert.equal(wd.date, ymd(now));
    const rows = sched(root).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].endBalance, 0);
});

test('старое закрытие (1-е число, сумма по прежней формуле с процентами за весь месяц): остаток 0, не минус', { skip: !UI }, () => {
    const root = { id: 40, type: 'deposit', depositId: 40, date: '2026-01-05', name: 'B', amount: 1_000_000, status: '📥 Вклад', annualRate: 20, termMonths: 3 };
    const old = { id: 41, type: 'deposit', depositId: 40, date: '2026-03-01', name: 'B', amount: 1_050_836, status: '➖ Снятие', annualRate: 20, termMonths: 3 };
    const { sched } = setup([root, old]);
    const rows = sched(root).rows;
    assert.equal(rows[2].endBalance, 0);
    assert.ok(rows.every(r => r.endBalance >= 0 && r.interest >= 0));
});

test('частичное снятие тела в середине месяца: проценты остаются на вкладе', { skip: !UI }, () => {
    const root = { id: 50, type: 'deposit', depositId: 50, date: '2026-02-01', name: 'B', amount: 36500, status: '📥 Вклад', annualRate: 10, termMonths: 1 };
    const wd = { id: 51, type: 'deposit', depositId: 50, date: '2026-02-11', name: 'B', amount: 36500, status: '➖ Снятие', annualRate: 10, termMonths: 1 };
    const { sched } = setup([root, wd]);
    assert.equal(sched(root).rows[0].endBalance, 100);
});
