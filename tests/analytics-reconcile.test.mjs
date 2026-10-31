// Сверка аналитики с главным экраном: потребление + «ещё ушло/пришло» = «Ушло»/«Пришло» из calculateTotals.
import test from 'node:test';
import assert from 'node:assert/strict';

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
    addEventListener: noop, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ style: {}, classList: { add: noop, remove: noop }, appendChild: noop }),
    documentElement: { style: { setProperty: noop }, getAttribute: () => null }, body: {}
};
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });

const { BudgetManager } = await import('../src/BudgetManager.js');
const S = await import('../src/analytics/stats.js');
const P = await import('../src/analytics/period.js');

const T = (id, type, date, category, amount, extra = {}) => ({ id, type, date, category, amount, ...extra });
const DATA = [
    T(1, 'income', '2026-10-01', '💰 Зарплата', 1000),
    T(2, 'income', '2026-10-03', '🏦 Перевод с вклада', 300),
    T(3, 'expense', '2026-10-04', '🥦 Продукты', 120),
    T(4, 'expense', '2026-10-05', '🔁 Перевод между своими счетами', 80),
    T(5, 'expense', '2026-10-06', 'Не знаю на что потратил (без учёта)', 40),
    T(6, 'deposit', '2026-10-07', null, 200, { status: '➕ Пополнение', depositId: 6 }),
    T(7, 'deposit', '2026-10-20', null, 50, { status: '➖ Снятие', depositId: 6 }),
    T(8, 'debt', '2026-10-08', null, 0, { direction: 'owe', initialAmount: 500, remainingAmount: 400, payments: [{ date: '2026-10-15', amount: 100 }] }),
    T(9, 'debt', '2026-10-09', null, 0, { direction: 'owed', initialAmount: 300, remainingAmount: 300, payments: [] }),
    T(10, 'expense', '2026-09-10', '🥦 Продукты', 60),
    T(11, 'income', '2026-09-01', '💰 Зарплата', 700),
];
const mk = () => {
    const bm = new BudgetManager(null);
    bm.budgets = [{ id: 'b', name: 'T', transactions: DATA }];
    bm.currentBudgetIndex = 0;
    return bm;
};

test('сверка: потребление + переводы/вклады/долги + «без учёта» = «Ушло» и «Пришло» главной (месяц)', () => {
    const t = mk().calculateTotals('10', 2026);
    const r = S.reconcile(DATA, P.monthPeriod('2026-10'));
    assert.equal(r.out.total, t.monthlyExpense);
    assert.equal(r.in.total, t.monthlyIncome);
    assert.equal(r.out.consumed, 120);
    assert.equal(r.out.excluded, 40);
    assert.equal(r.out.fin, 80 + 200 + 100 + 300);       // перевод, пополнение вклада, платёж по долгу, «мне должны»
    assert.equal(r.in.consumed, 1000);
    assert.equal(r.in.fin, 300 + 50 + 500);              // со вклада, снятие, «я должен»
    assert.equal(r.out.consumed + r.out.fin + r.out.excluded, r.out.total);
});

test('сверка: всё время', () => {
    const t = mk().calculateTotals('all');
    const r = S.reconcile(DATA, P.allTime());
    assert.equal(r.out.total, t.monthlyExpense);
    assert.equal(r.in.total, t.monthlyIncome);
});

test('потребление: consumptionTx убирает переводы, вклады, долги и «без учёта»; baseTx остаётся прежним', () => {
    const c = S.consumptionTx(DATA);
    assert.deepEqual(c.map(t => t.id).sort((a, b) => a - b), [1, 3, 10, 11]);
    assert.equal(S.baseTx(DATA).length, 6);   // как раньше: income/expense без «без учёта»
    assert.equal(S.sumTx(c, P.monthPeriod('2026-10'), 'expense'), 120);
});

test('сверка: список категорий для раскрытия отсортирован по сумме', () => {
    const r = S.reconcile(DATA, P.monthPeriod('2026-10'));
    const sums = r.out.cats.map(x => x.sum);
    assert.deepEqual(sums, [...sums].sort((a, b) => b - a));
    assert.ok(r.out.cats.some(x => x.name === 'Накопления' && x.sum === 200));
    assert.ok(r.out.cats.some(x => x.group === 'excluded' && x.sum === 40));
});

test('categoryDetail: «в среднем за месяц» за всё время делится на месяцы с любыми записями', () => {
    const c = S.consumptionTx(DATA);
    const d = S.categoryDetail(c, P.allTime(), '🥦 Продукты', { type: 'expense', todayISO: '2026-10-31', allMonths: 4 });
    assert.equal(d.total, 180);
    assert.equal(d.perMonth, 45);
    const d2 = S.categoryDetail(c, P.allTime(), '🥦 Продукты', { type: 'expense', todayISO: '2026-10-31' });
    assert.equal(d2.perMonth, 90);
});
