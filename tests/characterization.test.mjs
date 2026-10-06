// Характеризационные тесты BudgetIt 4.0.1 — фиксируют поведение расчётов ДО редизайна 5.0.
// Запуск:  node --test tests/*.test.mjs
// Ожидаемые значения выведены вручную из правил в architecture.md §5, не «снимком» кода.
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

// ── 1. calculateTotals: месяцы и перенос остатка ───────────────────────────
test('месяц в минус: следующий месяц начинается с 0', () => {
    const bm = makeBM([inc(1, '2026-01-10', 1000), exp(2, '2026-01-20', 1500), inc(3, '2026-02-05', 500)]);
    const jan = bm.calculateTotals('01', 2026);
    assert.equal(jan.monthlyIncome, 1000);
    assert.equal(jan.monthlyExpense, 1500);
    assert.equal(jan.overallBudget, -500);
    assert.equal(jan.carryOver, 0);
    const feb = bm.calculateTotals('02', 2026);
    assert.equal(feb.carryOver, 0);
    assert.equal(feb.overallBudget, 500);
    assert.equal(bm.calculateTotals('all').overallBudget, 500);
});

test('положительный остаток переносится (carryOver)', () => {
    const bm = makeBM([inc(1, '2026-01-10', 1000), exp(2, '2026-01-20', 400), inc(3, '2026-02-05', 100)]);
    const feb = bm.calculateTotals('02', 2026);
    assert.equal(feb.carryOver, 600);
    assert.equal(feb.overallBudget, 100);          // UIManager сам прибавляет carryOver
    assert.equal(feb.closingBalance, 700);
    assert.equal(bm.calculateTotals('all').overallBudget, 700);
});

test('год: считает до декабря выбранного года', () => {
    const bm = makeBM([inc(1, '2025-12-10', 1000), inc(2, '2026-03-01', 50), exp(3, '2027-01-01', 10)]);
    const y = bm.calculateTotals('all', 2026);
    assert.equal(y.monthlyIncome, 50);
    assert.equal(y.overallBudget, 1050);
});

// ── 2. вклады ──────────────────────────────────────────────────────────────
test('вклад: пополнение = расход, снятие = доход, баланс вкладов', () => {
    const dep = { id: 10, type: 'deposit', depositId: 10, date: '2026-01-05', name: 'Bank', amount: 1000, status: '📥 Вклад', annualRate: 12, termMonths: 3 };
    const wd  = { id: 11, type: 'deposit', depositId: 10, date: '2026-02-10', name: 'Bank', amount: 200, status: '➖ Снятие', annualRate: 12, termMonths: 3 };
    const bm = makeBM([inc(1, '2026-01-01', 5000), dep, wd]);
    const jan = bm.calculateTotals('01', 2026);
    assert.equal(jan.monthlyExpense, 1000);
    assert.equal(jan.depositBalance, 1000);
    const feb = bm.calculateTotals('02', 2026);
    assert.equal(feb.monthlyIncome, 200);
    assert.equal(feb.depositBalance, 800);
    assert.equal(feb.carryOver, 4000);
});

// ── 3. долги ───────────────────────────────────────────────────────────────
test('долг «мне должны» (owed): выдача — расход, возврат — доход; остаток долга', () => {
    const debt = { id: 20, type: 'debt', date: '2026-01-15', name: 'Тимур', direction: 'owed', initialAmount: 300, remainingAmount: 200, paid: false,
        payments: [{ date: '2026-02-01T10:00:00.000Z', amount: 100 }] };
    const bm = makeBM([inc(1, '2026-01-01', 1000), debt]);
    assert.equal(bm.calculateTotals('01', 2026).monthlyExpense, 300);
    assert.equal(bm.calculateTotals('02', 2026).monthlyIncome, 100);
    assert.equal(bm.calculateTotals('all').totalDebt, 200);
    assert.equal(bm.calculateTotals('01', 2026).totalDebt, 300);   // на конец января платёж ещё не был
});

test('долг «я должен» (owe): получение — доход, платёж — расход', () => {
    const debt = { id: 21, type: 'debt', date: '2026-01-15', name: 'Банк', direction: 'owe', initialAmount: 500, remainingAmount: 400, paid: false,
        payments: [{ date: '2026-01-20T10:00:00.000Z', amount: 100 }] };
    const t = makeBM([debt]).calculateTotals('01', 2026);
    assert.equal(t.monthlyIncome, 500);
    assert.equal(t.monthlyExpense, 100);
    assert.equal(t.totalDebt, 400);
});

test('markDebtPayment: уменьшает остаток, при 0 ставит paid', () => {
    const debt = { id: 22, type: 'debt', date: '2026-01-15', name: 'X', direction: 'owed', initialAmount: 300, remainingAmount: 300, paid: false, payments: [] };
    const bm = makeBM([debt]);
    bm.markDebtPayment(22, 100);
    assert.equal(debt.remainingAmount, 200);
    assert.equal(debt.paid, false);
    bm.markDebtPayment(22, 500);
    assert.equal(debt.remainingAmount, 0);
    assert.equal(debt.paid, true);
    assert.equal(debt.payments.length, 2);
});

// ── 4. транзакции / бюджеты ────────────────────────────────────────────────
test('addTransaction нормализует дату и пополняет productNames; updateTransaction пересчитывает сумму расхода', () => {
    const bm = makeBM();
    bm.addTransaction({ id: 1, type: 'expense', date: '2026-03-05', category: '🥦 Продукты', amount: 30,
        products: [{ name: 'Молоко', quantity: 2, price: 15 }] });
    assert.deepEqual(bm.productNames, ['Молоко']);
    assert.equal(bm.updateTransaction(1, { products: [{ name: 'Хлеб', quantity: 3, price: 10 }] }), true);
    assert.equal(bm.getCurrentBudget().transactions[0].amount, 30);
    assert.equal(bm.updateTransaction(999, {}), false);
});

test('validateBudgetName и deleteBudget (планы бюджета удаляются)', () => {
    const bm = makeBM();
    assert.equal(bm.validateBudgetName('🦈 Личное'), true);
    assert.equal(bm.validateBudgetName('   '), false);
    assert.equal(bm.validateBudgetName('a<b>'), false);
    bm.planners = [{ id: 'p', budgetId: 'b1' }, { id: 'q', budgetId: 'other' }];
    bm.createBudget('Второй');
    bm.deleteBudget(0);
    assert.deepEqual(bm.planners.map(p => p.id), ['q']);
});

// ── 5. планировщик: проекция по дням ───────────────────────────────────────
const plan = normalizePlanner({
    id: 'pl1', budgetId: 'b1', name: 'Тест',
    incomePlan: { category: '💰 Зарплата', amount: 1000, incomeDate: '2026-10-01' },
    startDate: '2026-10-01', periodDays: 5,
    mainExpenses: [{ id: 'm1', category: '🏠 Жильё', amount: 200, date: '2026-10-01' }],
    dailyExpenses: [{ id: 'd1', category: '🥦 Продукты', amountPerDay: 50 }],
    regularExpenses: [{ id: 'r1', category: '📺 Подписки', amount: 100, everyNDays: 2, startOffsetDay: 1 }],
    plannedDeposits: []
}, 'b1');   // как в приложении: планы всегда проходят normalizePlanner (проставляет endDate)

test('план: стартовый остаток, динамический дневной лимит, итоговый остаток', () => {
    const bm = makeBM([], [plan]);
    const pm = new PlannerManager(bm);
    const p = pm.calculatePlannerProjection('pl1', new Date(2026, 9, 1));
    assert.equal(p.summary.openingBalance, 800);                // 1000 − основные на старте (200)
    assert.equal(p.rows.length, 5);
    assert.equal(p.rows[0].isStartDay, true);                   // daily/regular на старте не применяются
    assert.equal(p.summary.finalBalance, 400);                  // 800 − 4×50 − 2×100
    assert.equal(p.summary.remainingDays, 4);
    assert.equal(p.summary.dailyLimit, 100);                    // (800−400)/4
});

test('план: лимит пересчитывается от сегодняшнего дня', () => {
    const bm = makeBM([], [plan]);
    const p = new PlannerManager(bm).calculatePlannerProjection('pl1', new Date(2026, 9, 3));
    assert.equal(p.summary.remainingDays, 3);
    assert.equal(p.summary.currentBalance, 650);                // 800 − (50+100) за 2 октября
    assert.ok(Math.abs(p.summary.dailyLimit - 400 / 3) < 1e-9);
});

test('план: фактическая трата в категории заменяет плановую (effective = факт)', () => {
    const bm = makeBM([exp(1, '2026-10-02', 300)], [plan]);
    const p = new PlannerManager(bm).calculatePlannerProjection('pl1', new Date(2026, 9, 3));
    const d2 = p.rows.find(r => r.date === '2026-10-02');
    assert.equal(d2.fact.daily, 300);
    assert.equal(d2.effective.daily, 300);
    assert.equal(d2.balanceEndOfDay, 400);                      // 800 − 300 − 100
    assert.equal(p.summary.currentBalance, 400);
    assert.equal(p.summary.dailyLimit, 50);                     // (400−250)/3
});

test('план: нераспознанная трата уходит в extraExpenses', () => {
    const bm = makeBM([exp(1, '2026-10-02', 70, '🚖 Такси')], [plan]);
    const d2 = new PlannerManager(bm).calculatePlannerProjection('pl1', new Date(2026, 9, 3)).rows.find(r => r.date === '2026-10-02');
    assert.equal(d2.fact.extraExpenses, 70);
    assert.equal(d2.totalExpenseDay, 50 + 100 + 70);
});

// ── 6. вклад: график начислений (метод живёт в UIManager) ──────────────────
let UI = null;
try { ({ UIManager: UI } = await import('../src/UIManager.js')); } catch (e) { console.warn('UIManager не импортируется в Node:', e.message); }

test('график вклада: капитализация floor(баланс·ставка/12), пополнения внутри месяца', { skip: !UI }, () => {
    const root = { id: 10, type: 'deposit', depositId: 10, date: '2026-01-05', name: 'B', amount: 1000, status: '📥 Вклад', annualRate: 12, termMonths: 3 };
    const top  = { id: 11, type: 'deposit', depositId: 10, date: '2026-02-10', name: 'B', amount: 500, status: '➕ Пополнение', annualRate: 12, termMonths: 3 };
    const bm = makeBM([root, top]);
    const fake = Object.create(UI.prototype);
    fake.budgetManager = bm;
    fake.monthNames = { '01': 'Январь', '02': 'Февраль', '03': 'Март' };
    const { rows, meta } = UI.prototype.buildDepositSchedule.call(fake, root);
    assert.deepEqual(rows.map(r => r.endBalance), [1010, 1525, 1540]);
    assert.deepEqual(rows.map(r => r.interest), [10, 15, 15]);
    assert.equal(rows[1].topups, 500);
    assert.equal(meta.totalInterest, 40);
});

test('график вклада: бессрочный (termMonths=0) строится на 12 месяцев', { skip: !UI }, () => {
    const root = { id: 10, type: 'deposit', depositId: 10, date: '2026-01-05', name: 'B', amount: 1000, status: '📥 Вклад', annualRate: 12, termMonths: 0 };
    const fake = Object.create(UI.prototype);
    fake.budgetManager = makeBM([root]);
    fake.monthNames = {};
    assert.equal(UI.prototype.buildDepositSchedule.call(fake, root).rows.length, 12);
});

// ── 7. смена типа Трата ↔ Поступление при редактировании ───────────────────
test('updateTransaction: expense → income убирает products и пересчитывает категорию/сумму', () => {
    const bm = makeBM([{ id: 1, type: 'expense', date: '2026-10-05', category: '🛒 Korzinka', amount: 100, products: [{ name: 'a', quantity: 1, price: 100 }] }]);
    bm.updateTransaction(1, { type: 'income', category: '💰 Зарплата', date: '2026-10-05', amount: 300 });
    const tx = bm.getCurrentBudget().transactions[0];
    assert.equal(tx.type, 'income');
    assert.equal(tx.products, undefined);
    assert.equal(tx.amount, 300);
    assert.equal(tx.category, '💰 Зарплата');
});
test('updateTransaction: income → expense считает сумму по позициям; долг/накопление не переключаются', () => {
    const bm = makeBM([
        { id: 1, type: 'income', date: '2026-10-05', category: '💰 Зарплата', amount: 300 },
        { id: 2, type: 'debt', date: '2026-10-05', name: 'x', direction: 'owe', amount: 50, initialAmount: 50, remainingAmount: 50, payments: [] }
    ]);
    bm.updateTransaction(1, { type: 'expense', category: '🛒 Korzinka', products: [{ name: 'a', quantity: 2, price: 50 }] });
    const [a, b] = bm.getCurrentBudget().transactions;
    assert.equal(a.type, 'expense');
    assert.equal(a.amount, 100);
    bm.updateTransaction(2, { type: 'income' });
    assert.equal(b.type, 'debt');
});
