// Расчёт плана месяца: стартовый день и поступления.
// Ожидаемые значения выведены вручную.
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

const mk = (over = {}) => normalizePlanner({
    id: 'p', budgetId: 'b1', name: 'T',
    incomePlan: { category: '💰 Зарплата', amount: 1000, incomeDate: '2026-10-01' },
    startDate: '2026-10-01', periodDays: 5,
    mainExpenses: [{ id: 'm', category: '🏠 Жильё', amount: 200, date: '2026-10-01' }],
    dailyExpenses: [{ id: 'd', category: '🥦 Продукты', amountPerDay: 50 }],
    regularExpenses: [], plannedDeposits: [], ...over
}, 'b1');
const proj = (txs, planner, day) => new PlannerManager(makeBM(txs, [planner])).calculatePlannerProjection('p', new Date(2026, 9, day));
const incomeSum = p => p.rows.reduce((a, r) => a + r.totalIncomeDay, 0);

test('старт: реальные расходы дня начала периода уменьшают стартовый остаток', () => {
    const p = proj([exp(1, '2026-10-01', 300, '🚖 Такси')], mk(), 1);
    assert.equal(p.summary.openingBalance, 500);               // 1000 − основные 200 − такси 300
    assert.equal(p.rows[0].fact.extraExpenses, 300);
    assert.equal(p.summary.dailyLimit, 500 / 4 - 50);          // (500 − 4×50) / 4
    assert.equal(p.summary.totalFactExpense, 300);
});

test('старт: факт основной траты заменяет плановую', () => {
    const p = proj([exp(1, '2026-10-01', 250, '🏠 Жильё')], mk(), 1);
    assert.equal(p.summary.openingBalance, 750);               // 1000 − 250
});

test('старт: любые поступления дня считаются, поступление плановой категории заменяет план', () => {
    const p = proj([inc(1, '2026-10-01', 500, '🎁 Подарок'), inc(2, '2026-10-01', 1200)], mk(), 1);
    assert.equal(p.summary.openingBalance, 1500);              // 1200 (факт вместо плана 1000) + 500 подарок − 200
    assert.equal(p.summary.incomeReceived, 1200);
    assert.equal(p.rows[0].fact.extraIncome, 500);
});

test('старт: поступление другой категории при плане «по факту» не теряется (случай «Конец месяца»)', () => {
    const planner = mk({ incomePlan: { category: '💼 Аванс', amount: 0, incomeDate: '2026-10-01' }, mainExpenses: [], dailyExpenses: [] });
    const p = proj([inc(1, '2026-10-01', 7000, '💼 Аванс'), inc(2, '2026-10-01', 78, '🏦 Проценты от вклада'), exp(3, '2026-10-01', 100)], planner, 2);
    assert.equal(p.summary.openingBalance, 6978);
});

test('будущие дни без операций помечены isFuture, прошедшие и сегодняшний — нет', () => {
    const p = proj([], mk(), 3);
    assert.deepEqual(p.rows.map(r => r.isFuture), [false, false, false, true, true]);
});

test('зарплата пришла позже плановой даты: считается один раз', () => {
    const planner = mk({ incomePlan: { category: '💰 Зарплата', amount: 1000, incomeDate: '2026-10-03' }, mainExpenses: [], dailyExpenses: [] });
    assert.equal(incomeSum(proj([inc(1, '2026-10-04', 1000)], planner, 5)), 1000);
    assert.equal(incomeSum(proj([], planner, 5)), 1000);        // дата прошла, факта нет — считаем, что придёт по плану
    assert.equal(proj([], planner, 2).summary.incomeExpected, 1000);
});

test('частичное поступление до плановой даты: ждём только остаток', () => {
    const planner = mk({ incomePlan: { category: '💰 Зарплата', amount: 1000, incomeDate: '2026-10-04' }, mainExpenses: [], dailyExpenses: [] });
    const p = proj([inc(1, '2026-10-02', 400)], planner, 3);
    assert.equal(incomeSum(p), 1000);
    assert.equal(p.summary.incomeExpected, 600);
});

test('поступление «по факту» (сумма не задана): считаются только реальные поступления категории', () => {
    const planner = mk({ incomePlan: { category: '💰 Зарплата', amount: 0, incomeDate: '2026-10-01' }, mainExpenses: [], dailyExpenses: [] });
    assert.equal(proj([], planner, 2).summary.openingBalance, 0);
    const p = proj([inc(1, '2026-10-01', 700)], planner, 2);
    assert.equal(p.summary.openingBalance, 700);
    assert.equal(p.summary.incomeByFact, true);
    assert.equal(incomeSum(proj([inc(1, '2026-10-03', 900)], planner, 4)), 900);
});

test('дата поступления прошла, факта нет: считаем как раньше, но помечаем overdue', () => {
    const p = proj([], mk({ mainExpenses: [], dailyExpenses: [] }), 3);
    assert.equal(p.summary.incomeExpected, 1000);
    assert.equal(p.summary.incomeOverdue, true);
    assert.equal(p.summary.incomePlanDate, '2026-10-01');
});

test('overdue нет: дата сегодня, дата впереди, или поступление пришло', () => {
    const today = proj([], mk({ mainExpenses: [], dailyExpenses: [] }), 1);
    assert.equal(today.summary.incomeOverdue, false);
    const future = proj([], mk({ incomePlan: { category: '💰 Зарплата', amount: 1000, incomeDate: '2026-10-04' }, mainExpenses: [], dailyExpenses: [] }), 2);
    assert.equal(future.summary.incomeOverdue, false);
    const got = proj([inc(1, '2026-10-02', 1000)], mk({ mainExpenses: [], dailyExpenses: [] }), 3);
    assert.equal(got.summary.incomeOverdue, false);
});
