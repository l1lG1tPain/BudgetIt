import test from 'node:test';
import assert from 'node:assert/strict';
import { choosePlanner, planStatusOf } from '../src/planner/plannerUtils.js';
import { planStatus, findActivePlanner } from '../src/shark/SharkMood.js';

const B = 'budget_1';
const mk = (id, startDate, endDate, budgetId = B, extra = {}) => ({ id, name: id, budgetId, startDate, endDate, ...extra });
// порядок как у пользователя: последний добавленный — «Конец месяца»
const PLANS = [
    mk('june', '2026-06-05', '2026-06-21'),
    mk('aug', '2026-08-20', '2026-09-03'),
    mk('oct1', '2026-10-05', '2026-10-19'),
    mk('oct2', '2026-10-20', '2026-11-03'),
];

test('действующий план выбирается по дате, а не по порядку добавления', () => {
    assert.equal(choosePlanner(PLANS, '2026-11-01').id, 'oct2');
    assert.equal(choosePlanner(PLANS, '2026-10-10').id, 'oct1');   // последний добавленный здесь — не он
    assert.equal(choosePlanner(PLANS, '2026-06-10').id, 'june');
});
test('границы периода включительно', () => {
    assert.equal(choosePlanner(PLANS, '2026-10-19').id, 'oct1');
    assert.equal(choosePlanner(PLANS, '2026-10-20').id, 'oct2');
    assert.equal(choosePlanner(PLANS, '2026-11-03').id, 'oct2');
});
test('нет действующего: ближайший будущий, иначе последний завершённый', () => {
    assert.equal(planStatusOf(PLANS, '', '2026-07-10').state, 'upcoming');
    assert.equal(choosePlanner(PLANS, '2026-07-10').id, 'aug');
    assert.equal(planStatusOf(PLANS, '', '2026-12-01').state, 'ended');
    assert.equal(choosePlanner(PLANS, '2026-12-01').id, 'oct2');
    assert.equal(choosePlanner([], '2026-12-01'), null);
});
test('перекрывающиеся планы: берётся начавшийся позже; архивные пропускаются', () => {
    const p = [mk('a', '2026-10-01', '2026-10-31'), mk('b', '2026-10-15', '2026-11-15'), mk('c', '2026-10-20', '2026-11-20', B, { archived: true })];
    assert.equal(choosePlanner(p, '2026-10-25').id, 'b');
});
test('Акулка и страница плана используют одну логику; фильтр по бюджету', () => {
    const mixed = [...PLANS, mk('other', '2026-10-25', '2026-11-10', 'budget_2')];
    assert.equal(planStatus(mixed, B, '2026-11-01').planner.id, 'oct2');
    assert.equal(findActivePlanner(mixed, 'budget_2', '2026-11-01').id, 'other');
    assert.equal(findActivePlanner(mixed, B, '2026-12-01'), null);
});
