// Регрессия: план «Конец месяца» (20.10–03.11.2026) на реальных операциях пользователя.
// Ожидания посчитаны независимо от кода: сумма поступлений − сумма трат по дням.
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


const D = (d, a, c = '🛒 Прочее') => exp(`e${d}_${a}`, `2026-10-${d}`, a, c);
const txs = [
    D(20, 730000), D(20, 40000), D(20, 154600), D(20, 675000), D(20, 38500), D(20, 87000), D(20, 87000), D(20, 45000),
    inc('a20', '2026-10-20', 7385439, '💼 Аванс'), inc('p20', '2026-10-20', 78000, '🏦 Проценты от вклада'),
    D(21, 183750), D(21, 273790),
    D(22, 350000), D(22, 100000), D(22, 552373),
    D(23, 52000), D(23, 65300), inc('r23', '2026-10-23', 1000000, '👩 Девушка заплатила за аренду моей квартиры'),
    D(24, 431031.9), D(24, 54000), D(24, 730000), D(24, 350000), D(24, 760000), D(24, 48000), D(24, 605520), D(24, 50000),
    D(25, 326390), D(25, 73000), D(25, 30000),
    D(26, 176400), D(26, 14000), D(26, 40000),
    D(27, 1000), D(27, 2800), D(27, 280000), D(27, 114000), D(27, 44444),
    D(28, 173250), D(28, 25000), D(28, 50000), D(28, 50000), D(28, 52000),
    D(29, 90000),
    D(30, 40000), D(30, 156600),
    D(31, 1000), D(31, 158982.96), D(31, 300000), D(31, 41000), inc('g31', '2026-10-31', 300000, '👩 Девушка перевела деньги')
];
const planner = normalizePlanner({
    id: 'p', budgetId: 'b1', name: 'Конец месяца',
    incomePlan: { category: '💼 Аванс', amount: 0, incomeDate: '2026-10-20' },
    startDate: '2026-10-20', periodDays: 15,
    mainExpenses: [], dailyExpenses: [], regularExpenses: [], plannedDeposits: []
}, 'b1');
const p = new PlannerManager(makeBM(txs, [planner])).calculatePlannerProjection('p', new Date(2026, 9, 31));

const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
const IN = sum(txs.filter(t => t.type === 'income'), t => t.amount);
const OUT = sum(txs.filter(t => t.type === 'expense'), t => t.amount);

test('«Конец месяца»: остаток на сегодня = все поступления − все траты (с копейками)', () => {
    const today = p.rows.find(r => r.isToday);
    assert.ok(Math.abs(today.balanceEndOfDay - (IN - OUT)) < 0.01);
    assert.ok(today.balanceEndOfDay > 0);                      // 8 763 439 − 8 702 732 = +60 707
    assert.equal(Math.floor(today.balanceEndOfDay), 60707);
});

test('«Конец месяца»: стартовый день учитывает проценты по вкладу, дневные траты совпадают с операциями', () => {
    assert.equal(p.rows[0].totalIncomeDay, 7385439 + 78000);
    assert.equal(Math.floor(p.rows[4].totalExpenseDay), 3028551);   // 24 октября
    assert.equal(p.rows[11].totalIncomeDay, 300000);                // 31 октября
});

test('«Конец месяца»: будущие дни без операций не меняют остаток и помечены isFuture', () => {
    const future = p.rows.filter(r => r.isFuture);
    assert.equal(future.length, 3);
    for (const r of future) {
        assert.equal(r.netDay, 0);
        assert.equal(r.balanceEndOfDay, p.rows.find(x => x.isToday).balanceEndOfDay);
    }
});

// ── План должен начинаться с реального остатка, а не с нуля ───────────────
test('остаток плана на сегодня = «Доступно» на главной (перенос + операции до старта)', () => {
    const txs2 = [
        inc('s1', '2026-09-10', 100000), exp('s2', '2026-09-12', 30000),      // сентябрь закрылся +70 000
        exp('o1', '2026-10-03', 90000),                                         // до старта плана: −90 000 → −20 000
        inc('o2', '2026-10-20', 500000, '💼 Аванс'), exp('o3', '2026-10-25', 120000)
    ];
    const bm = makeBM(txs2, [normalizePlanner({
        id: 'q', budgetId: 'b1', name: 'q',
        incomePlan: { category: '💼 Аванс', amount: 0, incomeDate: '2026-10-20' },
        startDate: '2026-10-20', periodDays: 15,
        mainExpenses: [], dailyExpenses: [], regularExpenses: [], plannedDeposits: []
    }, 'b1')]);
    const proj = new PlannerManager(bm).calculatePlannerProjection('q', new Date(2026, 9, 31));
    const t = bm.calculateTotals(10, 2026);
    const home = t.openingBalance + t.monthlyIncome - t.monthlyExpense;   // 70 000 + 500 000 − 90 000 − 120 000
    assert.equal(home, 360000);
    assert.equal(proj.summary.carryIn, -20000);
    assert.equal(proj.rows.find(r => r.isToday).balanceEndOfDay, home);
});
