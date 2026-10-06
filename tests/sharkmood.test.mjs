import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getDailyLimit, getSpentOnDay, computeMood, reactToSave, findActivePlanner,
    getThresholds, countStreakInLimit, isQuietNow
} from '../src/shark/SharkMood.js';

const mem = () => { const m = {}; return { getItem: k => m[k] ?? null, setItem: (k, v) => { m[k] = v; } }; };
const day = (n, base = '2026-10-10') => { const d = new Date(base + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); };
const exp = (date, amount, category = 'Еда') => ({ type: 'expense', date, amount, category });

test('лимит из плана = сумма ежедневных трат', () => {
    const r = getDailyLimit({ planner: { dailyExpenses: [{ amountPerDay: 100000 }, { amountPerDay: 50000 }] } });
    assert.deepEqual(r, { limit: 150000, source: 'plan' });
});

test('лимит без плана — медиана дней, без разовых крупных трат', () => {
    const today = '2026-10-10';
    const tx = [exp(day(-1), 100), exp(day(-2), 120), exp(day(-3), 110), exp(day(-4), 10000)];
    const r = getDailyLimit({ transactions: tx, today });
    assert.equal(r.source, 'median');
    assert.equal(r.limit, 110);
});

test('мало данных — лимита нет', () => {
    assert.equal(getDailyLimit({ transactions: [exp(day(-1), 100)], today: '2026-10-10' }).limit, 0);
});

test('траты дня не учитывают плановые категории', () => {
    const planner = { mainExpenses: [{ category: 'Жильё' }], regularExpenses: [{ category: 'Связь' }] };
    const tx = [exp('2026-10-10', 100, 'Еда'), exp('2026-10-10', 900, 'Жильё'), exp('2026-10-10', 50, 'Связь')];
    assert.equal(getSpentOnDay({ transactions: tx, planner, day: '2026-10-10' }), 100);
});

test('пороги характера и состояния', () => {
    const o = { storage: mem(), today: '2026-10-10' };
    assert.deepEqual(getThresholds('strict'), [0.7, 1]);
    assert.equal(computeMood({ spent: 0, limit: 0, hasData: false }, o).key, 'new');
    assert.equal(computeMood({ spent: 50, limit: 100, character: 'normal' }, o).key, 'ok');
    assert.equal(computeMood({ spent: 85, limit: 100, character: 'normal' }, o).key, 'tense');
    assert.equal(computeMood({ spent: 75, limit: 100, character: 'strict' }, o).key, 'tense');
    assert.equal(computeMood({ spent: 75, limit: 100, character: 'kind' }, o).key, 'ok');
    assert.equal(computeMood({ spent: 120, limit: 100, character: 'normal' }, o).key, 'angry');
    assert.equal(computeMood({ spent: 120, limit: 100, character: 'kind' }, o).key, 'tense');
    assert.equal(computeMood({ spent: 10, limit: 100, streak: 7 }, o).key, 'proud');
});

test('тексты настроения: ≤ 90 символов и с числом (кроме знакомства)', () => {
    const o = { storage: mem(), today: '2026-10-10' };
    for (let i = 0; i < 60; i++) {
        for (const [spent, streak] of [[10, 0], [85, 0], [150, 0], [10, 7]]) {
            const m = computeMood({ spent, limit: 100, streak }, { ...o, storage: mem() });
            assert.ok(m.text.length <= 90, m.text);
            assert.match(m.text, /\d/);
        }
    }
});

test('антиповтор: за 3 дня варианты не повторяются, пока есть выбор', () => {
    const storage = mem();
    const seen = new Set();
    for (let i = 0; i < 6; i++) seen.add(computeMood({ spent: 10, limit: 100 }, { storage, today: '2026-10-10' }).text.replace(/\d[\d ]*/g, '#'));
    assert.equal(seen.size, 6);
});

test('реакции на сохранение — как в макете', () => {
    const base = { limit: 1000, character: 'normal' };
    assert.match(reactToSave({ ...base, type: 'expense', amount: 100, before: 0, after: 100 }).text, /В запасе ещё 900/);
    assert.match(reactToSave({ ...base, type: 'expense', amount: 100, before: 700, after: 850 }).text, /До лимита осталось 150/);
    assert.match(reactToSave({ ...base, character: 'kind', type: 'expense', amount: 100, before: 950, after: 1050 }).text, /Чуть выше лимита: \+50/);
    assert.match(reactToSave({ ...base, type: 'expense', amount: 1500, before: 0, after: 1500 }).text, /Лимит пробит на 500/);
    const rep = reactToSave({ ...base, type: 'expense', amount: 100, before: 1500, after: 1600 });
    assert.equal(rep.repeat, true);
    assert.match(reactToSave({ ...base, type: 'income', amount: 5000 }).text, /\+5 000 пришло/);
    assert.match(reactToSave({ ...base, type: 'deposit', amount: 5000 }).text, /Отложено 5 000/);
    assert.match(reactToSave({ ...base, type: 'expense', amount: 5, backdate: '3 октября' }).text, /задним числом — на 3 октября/);
});

test('активный план и серия дней в лимите', () => {
    const planners = [{ id: 'a', budgetId: 'b', startDate: '2026-10-01', endDate: '2026-10-15' }, { id: 'c', budgetId: 'b', archived: true, startDate: '2026-10-01', endDate: '2026-10-31' }];
    assert.equal(findActivePlanner(planners, 'b', '2026-10-10').id, 'a');
    assert.equal(findActivePlanner(planners, 'b', '2026-11-10'), null);
    const tx = [1, 2, 3].map(i => exp(day(-i), 50));
    assert.equal(countStreakInLimit({ transactions: tx, limit: 100, today: '2026-10-10' }), 3);
    assert.equal(countStreakInLimit({ transactions: [...tx, exp(day(-2), 500)], limit: 100, today: '2026-10-10' }), 1);
});

test('тихие часы', () => {
    assert.equal(isQuietNow({ quietHours: true }, new Date('2026-10-10T23:30:00')), true);
    assert.equal(isQuietNow({ quietHours: true }, new Date('2026-10-10T12:00:00')), false);
    assert.equal(isQuietNow({ quietHours: false }, new Date('2026-10-10T23:30:00')), false);
});
