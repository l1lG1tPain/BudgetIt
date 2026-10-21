import test from 'node:test';
import assert from 'node:assert/strict';
import { answerQuestion } from '../src/shark/SharkTalk.js';
import { ANSWERS, ANSWERS_C } from '../src/shark/texts/index.js';

const base = { today: '2026-10-21', now: new Date('2026-10-21T15:00:00'), character: 'normal', seed: 's', limit: 1000, spent: 0, transactions: [] };

test('пустые «Мои цифры» предлагают записать вручную или загрузить выпиской', () => {
    for (const id of ['topcat', 'vsweek', 'waste', 'month', 'today', 'week']) {
        const a = answerQuestion(id, base);
        assert.ok(a.acts?.some(x => x.id === 'import'), id);
        assert.ok(a.acts?.some(x => x.id === 'add'), id);
    }
    const rule = answerQuestion('rule', base);
    assert.ok(rule.acts.some(x => x.id === 'income') && rule.acts.some(x => x.id === 'import'));
    assert.ok(answerQuestion('savings', base).acts.some(x => x.id === 'deposit'));
    assert.ok(answerQuestion('debts', base).acts.some(x => x.id === 'debt'));
});

test('цель на завтра не говорит про «в неделю» и предлагает отложить', () => {
    for (const character of ['kind', 'normal', 'strict']) for (let i = 0; i < 20; i++) {
        const a = answerQuestion('goal', { ...base, character, seed: 'g' + i, goalInput: { sum: 98888, date: '2026-10-22' } });
        assert.doesNotMatch(a.text, /недел/i, a.text);
        assert.equal(a.acts[0].id, 'deposit');
        assert.equal(a.acts[0].amt, 98888);
    }
});

test('у каждой функции «Моих цифр» теперь не меньше 15 вариантов на характер', () => {
    for (const k of ['topcatNone', 'topcatSome', 'vsweekUp', 'runoutSafe', 'whatifOk', 'debtsOwe', 'savingsSome']) for (const c of ['kind', 'normal', 'strict']) assert.ok(ANSWERS[k][c].length >= 15, k);
    for (const k of ['wasteUp', 'monthSome', 'ruleGood', 'goalSet', 'goalProgress', 'goalDone']) for (const c of ['kind', 'normal', 'strict']) assert.ok(ANSWERS_C[k][c].length >= 13, k);
});

import { masculine, forShark, countStreakInLimit, getPlanLimit, setSharkScopeProvider } from '../src/shark/SharkMood.js';
import { planHint } from '../src/shark/SharkTalk.js';

test('«Акул» говорит в мужском роде, «Акулка» без изменений', () => {
    assert.equal(masculine('Акулка рада: я всё посчитала и нашла ошибку.'), 'Акул рад: я всё посчитал и нашёл ошибку.');
    assert.equal(masculine('Спроси Акулку, она сохранила цель Акулки'), 'Спроси Акула, она сохранил цель Акула');
    // подлежащее не акула: не трогаем
    assert.equal(masculine('Эта неделя стала дороже, категория выросла.'), 'Эта неделя стала дороже, категория выросла.');
    assert.equal(forShark('Акулка рада', 'hoodie'), 'Акулка рада');
    assert.equal(forShark('Акулка рада', 'classic'), 'Акул рад');
    assert.equal(masculine('Я учла и замёрзла'), 'Я учёл и замёрз');
});

test('серия в лимите не продолжается днём с одними доходами', () => {
    const tx = [
        { type: 'expense', date: '2026-10-20', amount: 10 },
        { type: 'income', date: '2026-10-19', amount: 5000 },
        { type: 'expense', date: '2026-10-18', amount: 10 }
    ];
    assert.equal(countStreakInLimit({ transactions: tx, limit: 100, today: '2026-10-21' }), 1);
});

test('план с поступлением «по факту» без денег: «ждём поступление»', () => {
    const planner = { startDate: '2026-10-01', endDate: '2026-10-31' };
    const r = getPlanLimit({ planner, today: '2026-10-21', planLimit: 0, planWaiting: true });
    assert.equal(r.source, 'plan-empty');
    assert.equal(r.waiting, true);
    assert.match(planHint({ source: 'plan-empty', waiting: true, character: 'normal' }), /ждёт|по факту/i);
    assert.doesNotMatch(planHint({ source: 'plan-empty', waiting: false, character: 'normal' }), /по факту/);
});
