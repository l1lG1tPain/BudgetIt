import test from 'node:test';
import assert from 'node:assert/strict';
import {
    countStreakInLimit, getNoSpendDays, markNoSpend, unmarkNoSpend, syncNoSpend, canMarkNoSpend, noSpendText
} from '../src/shark/SharkMood.js';
import { countDaysInLimit } from '../src/shark/SharkPlus.js';
import { NOSPEND_TEXTS } from '../src/shark/texts/nospend.js';

const mem = () => { const m = {}; return { getItem: k => m[k] ?? null, setItem: (k, v) => { m[k] = v; }, removeItem: k => { delete m[k]; } }; };
const exp = (date, amount = 10) => ({ type: 'expense', date, amount, category: 'Еда' });
const base = { limit: 100, today: '2026-10-21' };

test('серия: один пустой день пропускается', () => {
    const tx = [exp('2026-10-20'), exp('2026-10-18'), exp('2026-10-17')];
    assert.equal(countStreakInLimit({ ...base, transactions: tx, noSpend: [] }), 3);
});
test('серия: два пустых дня подряд обрывают', () => {
    const tx = [exp('2026-10-20'), exp('2026-10-17')];
    assert.equal(countStreakInLimit({ ...base, transactions: tx, noSpend: [] }), 1);
});
test('серия: отмеченный день засчитывается и сбрасывает счётчик пустых', () => {
    const tx = [exp('2026-10-20'), exp('2026-10-17')];
    // 19-е отмечено, 18-е пусто (один пропуск) → 20, 19, 17
    assert.equal(countStreakInLimit({ ...base, transactions: tx, noSpend: ['2026-10-19'] }), 3);
    // оба пустых дня отмечены
    assert.equal(countStreakInLimit({ ...base, transactions: tx, noSpend: ['2026-10-19', '2026-10-18'] }), 4);
});
test('серия: перерасход по-прежнему обрывает', () => {
    const tx = [exp('2026-10-20', 500), exp('2026-10-18')];
    assert.equal(countStreakInLimit({ ...base, transactions: tx, noSpend: ['2026-10-19'] }), 0);
});
test('дни в лимите (звания): отмеченные дни считаются', () => {
    const tx = [exp('2026-10-20'), exp('2026-10-18', 500)];
    assert.equal(countDaysInLimit({ ...base, transactions: tx, noSpend: [] }), 1);
    assert.equal(countDaysInLimit({ ...base, transactions: tx, noSpend: ['2026-10-19', '2026-10-17'] }), 3);
});
test('отметки: хранение, 120 последних дней, снятие', () => {
    const st = mem();
    markNoSpend('2026-10-19', st); markNoSpend('2026-10-19', st); markNoSpend('2026-10-20', st);
    assert.deepEqual(getNoSpendDays(st), ['2026-10-19', '2026-10-20']);
    unmarkNoSpend('2026-10-19', st);
    assert.deepEqual(getNoSpendDays(st), ['2026-10-20']);
    for (let i = 1; i <= 150; i++) markNoSpend(`2026-${i <= 100 ? '01' : '02'}-${String((i % 28) + 1).padStart(2, '0')}x`.slice(0, 10), st);
    assert.ok(getNoSpendDays(st).length <= 120);
    assert.equal(markNoSpend('мусор', st).includes('мусор'), false);
});
test('отметка снимается автоматически, если в тот день появилась трата', () => {
    const st = mem();
    markNoSpend('2026-10-21', st); markNoSpend('2026-10-20', st);
    const left = syncNoSpend([exp('2026-10-21')], st);
    assert.deepEqual(left, ['2026-10-20']);
    assert.deepEqual(getNoSpendDays(st), ['2026-10-20']);
});
test('кнопка «Сегодня без трат»: после 18:00, без трат и без отметки', () => {
    const at = h => new Date(2026, 9, 21, h, 0);
    const o = { transactions: [], today: '2026-10-21', noSpend: [] };
    assert.equal(canMarkNoSpend({ ...o, now: at(17) }), false);
    assert.equal(canMarkNoSpend({ ...o, now: at(18) }), true);
    assert.equal(canMarkNoSpend({ ...o, now: at(20), transactions: [exp('2026-10-21')] }), false);
    assert.equal(canMarkNoSpend({ ...o, now: at(20), noSpend: ['2026-10-21'] }), false);
});
test('тексты: по 6 на характер, ≤ 90 символов, без обращения по полу и без «...»', () => {
    for (const ch of ['kind', 'normal', 'strict']) {
        const list = NOSPEND_TEXTS[ch];
        assert.equal(list.length, 6);
        assert.equal(new Set(list).size, 6);
        for (const t of list) {
            assert.ok(t.length <= 90, t);
            assert.ok(!/молодец|умница|\(а\)|\.\.\./i.test(t), t);
        }
        assert.ok(list.includes(noSpendText(ch, () => 0)));
    }
});
