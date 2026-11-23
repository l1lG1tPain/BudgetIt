import test from 'node:test';
import assert from 'node:assert/strict';
import { depositEndDate, collectDeposits, slimTransactions, buildReminderData, currencyLabel } from '../src/reminders/reminderData.js';
import { planReminder } from '../src/reminders/reminderPlan.js';
import { normalizeReminderSettings, normalizeReminderState } from '../src/reminders/reminderSettings.js';

test('срок вклада: конец месяца не перескакивает', () => {
    assert.equal(depositEndDate('2026-01-31', 1), '2026-02-28');
    assert.equal(depositEndDate('2026-11-22', 3), '2027-02-22');
    assert.equal(depositEndDate('2026-11-22', 0), '');
    assert.equal(depositEndDate('bad', 3), '');
});

test('вклады: из плана и из операций с termMonths, без дублей', () => {
    const planners = [
        { archived: false, plannedDeposits: [{ title: 'Копилка', termDays: 30, endDate: '2026-12-01' }, { title: 'Без срока', termDays: 0, endDate: '2026-12-02' }] },
        { archived: true, plannedDeposits: [{ title: 'Архив', termDays: 10, endDate: '2026-12-03' }] }
    ];
    const transactions = [
        { type: 'deposit', id: 'a', depositId: 'a', date: '2026-09-22', termMonths: 3, category: 'Вклад А' },
        { type: 'deposit', id: 'b', depositId: 'a', date: '2026-10-22', termMonths: 3, category: 'Вклад А' },
        { type: 'deposit', id: 'c', date: '2026-10-01', termMonths: 0, category: 'Бессрочный' }
    ];
    const r = collectDeposits({ transactions, planners });
    assert.deepEqual(r, [{ title: 'Копилка', endDate: '2026-12-01' }, { title: 'Вклад А', endDate: '2026-12-22' }]);
});

test('снимок операций: только последние 90 дней и нужные поля', () => {
    const tx = [
        { type: 'expense', date: '2026-11-20', amount: '10', category: 'Еда', note: 'лишнее' },
        { type: 'expense', date: '2026-01-01', amount: 5, category: 'Еда' },
        { type: 'expense', amount: 5 }
    ];
    assert.deepEqual(slimTransactions(tx, '2026-11-22'), [{ type: 'expense', date: '2026-11-20', amount: 10, category: 'Еда' }]);
});

test('сборка data: значения по умолчанию и урезанный план', () => {
    const d = buildReminderData({ today: '2026-11-22', planner: { id: 'p', mainExpenses: [{ category: 'Аренда', date: '2026-11-22', amount: 100, extra: 1 }], incomePlan: { category: 'ЗП', incomeDate: '2026-11-25', amount: 500, x: 1 } } });
    assert.deepEqual(d.planner.mainExpenses, [{ category: 'Аренда', note: undefined, date: '2026-11-22', amount: 100 }]);
    assert.deepEqual(d.planner.incomePlan, { category: 'ЗП', incomeDate: '2026-11-25', amount: 500 });
    assert.equal(d.limit, 0);
    assert.equal(d.character, 'normal');
    assert.deepEqual(d.deposits, []);
});

test('снимок проходит через JSON и planReminder выдаёт напоминание', () => {
    const data = JSON.parse(JSON.stringify(buildReminderData({
        today: '2026-11-22', currency: 'сум',
        transactions: [{ type: 'expense', date: '2026-11-20', amount: 10, category: 'Еда' }],
        planner: { mainExpenses: [{ category: 'Аренда', date: '2026-11-22', amount: 100 }] }
    })));
    const r = planReminder({
        now: new Date(2026, 10, 22, 10, 0),
        settings: normalizeReminderSettings({ enabled: true }),
        state: normalizeReminderState({}),
        data
    });
    assert.equal(r?.type, 'planner');
});

test('валюта по региону', () => {
    const st = v => ({ getItem: () => v });
    assert.equal(currencyLabel(st('RU')), 'руб');
    assert.equal(currencyLabel(st(null)), 'сум');
});
