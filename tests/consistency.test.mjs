// Согласованность расчётов: план, сводка (calculateTotals) и мини-графики (getSummaryTrend) считают одинаково.
import test from 'node:test';
import assert from 'node:assert/strict';

// ── окружение-заглушка (код ходит в localStorage/window/document) ──────────
const store = new Map();
globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear()
};
const noop = () => {};
globalThis.window = globalThis.window || { addEventListener: noop, dispatchEvent: noop, matchMedia: () => ({ matches: false }) };
globalThis.document = globalThis.document || {
    addEventListener: noop, getElementById: () => null, querySelector: () => null,
    querySelectorAll: () => [], createElement: () => ({ style: {}, classList: { add: noop, remove: noop }, appendChild: noop }),
    documentElement: { style: { setProperty: noop }, getAttribute: () => null }, body: {}
};
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });

const { BudgetManager } = await import('../src/BudgetManager.js');
const { PlannerManager } = await import('../src/planner/PlannerManager.js');
const { normalizePlanner } = await import('../src/planner/plannerUtils.js');

function makeBM(transactions = [], planners = []) {
    store.clear();
    const bm = new BudgetManager(null);
    bm.budgets = [{ id: 'b1', name: '🦈 Тест', transactions }];
    bm.currentBudgetIndex = 0;
    bm.planners = planners;
    return bm;
}
const inc = (id, date, amount, category = '💰 Зарплата') => ({ id, type: 'income', date, category, amount });
const exp = (id, date, amount, category = '🥦 Продукты') => ({ id, type: 'expense', date, category, amount, products: [{ name: 'x', quantity: 1, price: amount }] });


const dep = (id, date, amount, status) => ({ id, type: 'deposit', date, name: 'В', amount, status });
const debt = (id, date, init, direction, payments = []) => ({ id, type: 'debt', date, name: 'Д', initialAmount: init, remainingAmount: 0, direction, payments });

const txs = [
    inc(1, '2026-10-01', 1000),
    dep(2, '2026-10-02', 300, '💾 Уже лежало'),            // деньги и так на вкладе: из бюджета не уходили
    dep(3, '2026-10-03', 200, '➕ Пополнение'),
    debt(4, '2026-10-04', 500, 'owe', [{ date: '2026-10-05T10:00:00.000Z', amount: 200 }, { date: '2026-10-06T10:00:00.000Z', amount: 900 }]),
    debt(5, '2026-10-04', 100, 'owed', [{ date: '2026-10-07T10:00:00.000Z', amount: 40 }]),
    exp(6, '2026-10-05', 50)
];
// приход: 1000 + 500 (взял в долг) + 40 (вернули мне); расход: 200 (вклад) + 200 + 300 (мой долг, платёж сверх суммы обрезан) + 100 (дал в долг) + 50
const INCOME = 1000 + 500 + 40;
const EXPENSE = 200 + 500 + 100 + 50;

test('сводка: «Уже лежало» и платёж сверх долга не искажают итог', () => {
    const bm = makeBM(txs);
    const t = bm.calculateTotals(10, 2026);
    assert.equal(t.monthlyIncome, INCOME);
    assert.equal(t.monthlyExpense, EXPENSE);
});

test('мини-график: месяц совпадает со сводкой', () => {
    const bm = makeBM(txs);
    const row = bm.getSummaryTrend('month', 2026, 10).rows.find(r => r.monthKey === '2026-10');
    assert.equal(row.income, INCOME);
    assert.equal(row.expense, EXPENSE);
    assert.equal(row.depositBalance, 500);                      // 300 лежало + 200 пополнение
});

test('план: те же поступления и траты, что в сводке (вклады, долги, «Уже лежало»)', () => {
    const planner = normalizePlanner({
        id: 'p', budgetId: 'b1', name: 'T',
        incomePlan: { category: '💰 Зарплата', amount: 0, incomeDate: '2026-10-01' },
        startDate: '2026-10-01', periodDays: 10,
        mainExpenses: [], dailyExpenses: [], regularExpenses: [], plannedDeposits: []
    }, 'b1');
    const p = new PlannerManager(makeBM(txs, [planner])).calculatePlannerProjection('p', new Date(2026, 9, 10));
    const income = p.rows.reduce((a, r) => a + r.totalIncomeDay, 0);
    const expense = p.rows.reduce((a, r) => a + r.totalExpenseDay, 0);
    assert.equal(income, INCOME);
    assert.equal(expense, EXPENSE);
    assert.equal(p.summary.finalBalance, INCOME - EXPENSE);
});
