// Карточка накопления: сводка, прогресс срока, история и график.
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


let UI = null;
try { ({ UIManager: UI } = await import('../src/UIManager.js')); } catch (e) { console.warn('UIManager не импортируется в Node:', e.message); }

test('карточка накопления: баланс сейчас, внесено, история и график', { skip: !UI }, () => {
    const now = new Date();
    const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const start = new Date(now.getFullYear(), now.getMonth() - 2, 10);
    const root = { id: 10, type: 'deposit', depositId: 10, date: iso(start.getFullYear(), start.getMonth() + 1, 10), name: 'Подушка', amount: 1000, status: '📥 Вклад', annualRate: 12, termMonths: 6 };
    const top  = { id: 11, type: 'deposit', depositId: 10, date: iso(now.getFullYear(), now.getMonth() + 1, 1), name: 'Подушка', amount: 500, status: '➕ Пополнение', annualRate: 12, termMonths: 6 };
    const fake = Object.create(UI.prototype);
    fake.budgetManager = makeBM([root, top]);
    fake.monthNames = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i + 1).padStart(2, '0'), `М${i + 1}`]));
    fake.formatNumber = n => String(n);
    fake.formatDate = d => String(d);
    const group = UI.prototype.getDepositGroup.call(fake, root);
    const { rows, meta } = UI.prototype.buildDepositSchedule.call(fake, root);
    const v = UI.prototype.buildDepositView.call(fake, root, group, rows, meta);
    assert.match(v.summaryHtml, /На счёте сейчас/);
    assert.match(v.summaryHtml, /Внесено всего[\s\S]*1500/);          // 1000 + 500
    assert.match(v.summaryHtml, /2 из 6 мес\./);
    assert.match(v.listsHtml, /Пополнение/); assert.match(v.listsHtml, /Открытие/);
    assert.match(v.listsHtml, /сейчас/);
    assert.doesNotMatch(v.summaryHtml + v.listsHtml, /undefined|NaN/);
});
