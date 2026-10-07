import test from 'node:test';
import assert from 'node:assert/strict';
import { FLAVOR, ANSWERS_C, GLOSSARY } from '../src/shark/texts/index.js';
import { reactToSave, getSharkSettings } from '../src/shark/SharkMood.js';
import { buildExtra, answerQuestion, flavorLine, MENUS, FUN_ITEMS, STATS_ITEMS, topicAnswer, richHtml, evaluateChallenge, CHALLENGES } from '../src/shark/SharkTalk.js';
import { goalCalc, parseGoalDate, formatGoalDate, wasteCategory, monthSummary, ruleCheck, earnedBadges, BADGES } from '../src/shark/SharkExtra.js';

const CH = ['kind', 'normal', 'strict'];
const flat = o => (typeof o === 'string' ? [o] : o && typeof o === 'object' ? Object.values(o).flatMap(flat) : []);
const BAD = /(молодец|молодц|умниц|\(а\)|\.\.\.|…|рубл|долл|\bсам\b|\bсама\b|вернулся|справился|потратил\b|забыл\b|записал\b|\bсум\b)/i;
const mk = (type, date, amount, extra = {}) => ({ type, date, amount, ...extra });

test('flavor: размеры пулов, уникальность, длины', () => {
    const check = (pool, n, max) => {
        for (const ch of CH) {
            const l = pool[ch];
            assert.ok(Array.isArray(l) && l.length >= n, `${ch}: ${l?.length} < ${n}`);
            assert.equal(new Set(l).size, l.length);
            for (const t of l) { assert.ok(t.length <= max, `длинно (${t.length}): ${t}`); assert.doesNotMatch(t, /[{}]/); }
        }
    };
    for (const p of ['morning', 'day', 'evening', 'night']) check(FLAVOR.part[p], 12, 110);
    for (const p of ['mon', 'mid', 'fri', 'weekend']) check(FLAVOR.weekday[p], 12, 110);
    for (const p of ['winter', 'spring', 'summer', 'autumn']) check(FLAVOR.season[p], 10, 110);
    check(FLAVOR.rare, 30, 110); check(FLAVOR.toneHappy, 10, 110); check(FLAVOR.toneGentle, 10, 110);
    check(FLAVOR.tail, 24, 45); check(FLAVOR.dialogAsk, 8, 90);
    check(FLAVOR.dialogGood, 10, 140); check(FLAVOR.dialogOk, 10, 140); check(FLAVOR.dialogHard, 10, 140);
    check(FLAVOR.jokes, 24, 220);
});

test('новые тексты: запрещённые обороты, валюты, «срок» у долгов', () => {
    for (const t of [...flat(FLAVOR), ...flat(ANSWERS_C)]) {
        assert.doesNotMatch(t, BAD, t);
        assert.doesNotMatch(t, /срок|напомн|просроч|дедлайн/i, t);
    }
    assert.equal(GLOSSARY.length, 28);
    assert.equal(new Set(GLOSSARY.map(g => g.id)).size, 28);
    for (const g of GLOSSARY) {
        assert.ok(g.title.length <= 28 && g.text.length >= 2 && g.text.length <= 4, g.id);
        for (const t of g.text) assert.doesNotMatch(t, /(молодец|умниц|\(а\)|\.\.\.|рубл|долл)/i, t);
    }
});

test('ANSWERS_C: плейсхолдеры только допустимые', () => {
    const allow = {
        goalSet: ['sum', 'date', 'daysLeft', 'perDay', 'perWeek'], goalProgress: ['sum', 'saved', 'left', 'pct', 'daysLeft', 'perDay'],
        goalBehind: ['sum', 'saved', 'left', 'pct', 'daysLeft', 'perDay'], goalDone: ['sum'], wasteUp: ['cat', 'pct', 'cur', 'prev', 'diff'],
        wasteDown: ['cat', 'pct'], monthSome: ['exp', 'inc', 'sav', 'top', 'days', 'bal'], ruleGood: ['spentPct', 'savePct'],
        ruleMid: ['spentPct', 'savePct'], ruleLow: ['spentPct', 'savePct'], badgeNew: ['title']
    };
    for (const [key, byCh] of Object.entries(ANSWERS_C)) for (const ch of CH) {
        assert.ok(byCh[ch].length >= 6, `${key}/${ch}`);
        for (const t of byCh[ch]) for (const m of t.matchAll(/\{(\w+)\}/g)) assert.ok((allow[key] || []).includes(m[1]), `${key}: {${m[1]}} в «${t}»`);
    }
});

test('настройка болтливости: по умолчанию «normal», мусор сбрасывается', () => {
    const mem = v => ({ getItem: () => v, setItem() {} });
    assert.equal(getSharkSettings(mem('{}')).talk, 'normal');
    assert.equal(getSharkSettings(mem('{"talk":"chatty"}')).talk, 'chatty');
    assert.equal(getSharkSettings(mem('{"talk":"zzz"}')).talk, 'normal');
});

test('flavorLine: любое время суток, день недели и сезон дают текст', () => {
    for (const ch of CH) for (let m = 0; m < 12; m++) for (let d = 1; d <= 7; d++) for (const h of [3, 9, 14, 20]) {
        const now = new Date(2026, m, d + 7, h, 0, 0);
        const f = flavorLine({ now, character: ch, seed: `${m}-${d}-${h}` });
        assert.ok(f.text.length > 5 && !/[{}]/.test(f.text));
    }
});

test('buildExtra: тихий режим молчит, болтушка всегда что-то говорит', () => {
    const tx = [mk('expense', '2026-10-09', 5000), mk('expense', '2026-10-08', 4000)];
    const base = { transactions: tx, limit: 100000, spent: 0, streak: 0, character: 'normal' };
    for (const h of [12, 13, 14, 15, 16]) {
        const now = new Date(`2026-10-10T${h}:00:00`);
        assert.equal(buildExtra({ ...base, now, talk: 'quiet' }), null, `quiet ${h}`);
        const c = buildExtra({ ...base, now, talk: 'chatty' });
        assert.ok(c && ['motivation', 'rare', 'flavor'].includes(c.kind), `chatty ${h}: ${c?.kind}`);
    }
});

test('цель накопления: расчёт, разбор даты и сценарий в чате', () => {
    assert.equal(parseGoalDate('2026-10-05', '2026-10-10'), null);
    assert.equal(parseGoalDate('2026-12-31', '2026-10-10'), '2026-12-31');
    assert.equal(parseGoalDate('31.12.2026', '2026-10-10'), '2026-12-31');
    assert.equal(parseGoalDate('мусор', '2026-10-10'), null);
    assert.equal(formatGoalDate('2026-12-31'), '31.12.2026');
    const tx = [mk('deposit', '2026-10-02', 300000)];
    const c = goalCalc({ sum: 1000000, date: '2026-11-10', start: '2026-10-01' }, tx, '2026-10-10');
    assert.equal(c.saved, 300000); assert.equal(c.left, 700000); assert.equal(c.pct, 30); assert.equal(c.daysLeft, 31);
    assert.equal(c.perDay, Math.ceil(700000 / 31)); assert.equal(c.status, 'ok');
    assert.equal(goalCalc({ sum: 100, date: '2026-11-10', start: '2026-10-01' }, [mk('deposit', '2026-10-02', 100)], '2026-10-10').status, 'done');
    assert.equal(goalCalc({ sum: 1000000, date: '2026-10-20', start: '2026-10-01' }, [mk('deposit', '2026-10-02', 1000)], '2026-10-10').status, 'behind');
    const ctx = { today: '2026-10-10', character: 'normal', transactions: tx, seed: 's' };
    const none = answerQuestion('goal', ctx); assert.equal(none.input, 'goal');
    const bad = answerQuestion('goal', { ...ctx, goalInput: { sum: 0, date: '2026-12-01' } }); assert.equal(bad.input, 'goal'); assert.ok(!bad.effect);
    const badDate = answerQuestion('goal', { ...ctx, goalInput: { sum: 500000, date: '2026-01-01' } }); assert.equal(badDate.input, 'goal');
    const ok = answerQuestion('goal', { ...ctx, goalInput: { sum: 1000000, date: '2026-12-01' } });
    assert.deepEqual(ok.effect.setGoal, { sum: 1000000, date: '2026-12-01', start: '2026-10-10' });
    assert.ok(ok.text.includes('1 000 000'));
    const have = answerQuestion('goal', { ...ctx, goalState: { sum: 1000000, date: '2026-12-01', start: '2026-10-01' } });
    assert.ok(have.goalButtons);
    assert.ok(answerQuestion('goalnew', { ...ctx, goalState: { sum: 1, date: '2026-12-01', start: '2026-10-01' } }).input === 'goal');
    assert.ok(answerQuestion('goalstop', ctx).effect.clearGoal);
});

test('«что я зря трачу», итог месяца, правило 50/30/20', () => {
    const today = '2026-10-20';
    const prev = [mk('expense', '2026-10-01', 10000, { category: 'Кафе' }), mk('expense', '2026-10-02', 20000, { category: 'Еда' })];
    const cur = [mk('expense', '2026-10-15', 30000, { category: 'Кафе' }), mk('expense', '2026-10-16', 20000, { category: 'Еда' })];
    const w = wasteCategory([...prev, ...cur], today);
    assert.equal(w.state, 'up'); assert.equal(w.cat, 'Кафе'); assert.equal(w.pct, 200);
    assert.equal(wasteCategory([], today).state, 'none');
    const txt = answerQuestion('waste', { today, transactions: [...prev, ...cur], character: 'strict', seed: 'q' }).text;
    assert.ok(txt.includes('Кафе') && !/[{}]/.test(txt));
    const m = monthSummary([...prev, ...cur, mk('income', '2026-10-05', 200000), mk('deposit', '2026-10-06', 15000)], today);
    assert.equal(m.exp, 80000); assert.equal(m.inc, 200000); assert.equal(m.sav, 15000); assert.equal(m.top, 'Кафе');
    const mt = answerQuestion('month', { today, transactions: [...prev, ...cur, mk('income', '2026-10-05', 200000)], character: 'kind', seed: 'q' }).text;
    assert.ok(!/[{}]/.test(mt));
    assert.equal(answerQuestion('month', { today, transactions: [], character: 'kind' }).text.includes('{'), false);
    const r = ruleCheck([mk('income', '2026-10-05', 100000), mk('expense', '2026-10-06', 70000), mk('deposit', '2026-10-07', 20000)], today);
    assert.deepEqual([r.state, r.spentPct, r.savePct], ['good', 70, 20]);
    assert.equal(ruleCheck([mk('income', '2026-10-05', 100000), mk('expense', '2026-10-06', 120000)], today).state, 'low');
    assert.equal(ruleCheck([], today).state, 'none');
    for (const ch of CH) for (const id of ['waste', 'month', 'rule']) assert.ok(!/[{}]/.test(answerQuestion(id, { today, transactions: [...prev, ...cur], character: ch, seed: id }).text));
});

test('значки', () => {
    const tx = Array.from({ length: 8 }, (_, i) => mk('expense', `2026-10-0${i + 1}`, 100));
    const e = earnedBadges({ transactions: [...tx, mk('deposit', '2026-10-09', 5), mk('debt', '2026-10-01', 5, { paid: true })], daysInLimit: 8, rankIdx: 2, flags: { export: '2026-10-01' } });
    for (const id of ['first', 'log7', 'lim7', 'saver', 'debt', 'dolphin', 'export']) assert.ok(e.has(id), id);
    for (const id of ['lim30', 'tx50', 'tx200', 'goal']) assert.ok(!e.has(id), id);
    assert.equal(BADGES.length, 11);
    const t = answerQuestion('badges', { badges: ['first', 'saver'], character: 'normal', seed: 's' }).text;
    assert.ok(t.includes('Открыто: 2 из 11') && t.includes('🔒'));
});

test('шутки, мини-диалог и пункты меню', () => {
    for (const ch of CH) {
        assert.ok(answerQuestion('joke', { character: ch }).text.length > 10);
        const d = answerQuestion('dialog', { character: ch });
        assert.equal(d.choices.length, 3);
        for (const c of d.choices) assert.ok(answerQuestion(c.id, { character: ch }).text.length > 10);
    }
    const ids = [...STATS_ITEMS, ...FUN_ITEMS].map(i => i.id);
    for (const id of ['waste', 'month', 'rule', 'goal', 'badges', 'joke', 'dialog']) assert.ok(ids.includes(id), id);
    assert.ok(MENUS.glossary.topics.length === 28);
    for (const ch of CH) {
        const a = topicAnswer('glossary', 'inflation' in {} ? 'x' : MENUS.glossary.topics[0].id, ch, 's');
        assert.ok(a.text.length > 20 && a.outro.length > 5);
        assert.ok(richHtml(a.text).length > 10);
    }
});

test('реакции на сохранение: тихий режим без добавок, болтушка иногда с хвостиком или редкой фразой', () => {
    const args = { type: 'expense', amount: 1000, before: 0, after: 1000, limit: 100000, character: 'normal' };
    const extras = new Set([...FLAVOR.rare.normal, ...FLAVOR.tail.normal]);
    let quietHits = 0, chattyHits = 0;
    for (let i = 0; i < 400; i++) {
        const q = reactToSave(args); if ([...extras].some(x => q.text.includes(x))) quietHits++;
        const c = reactToSave({ ...args, talk: 'chatty' }); assert.ok(c.text.length > 5); if ([...extras].some(x => c.text.includes(x))) chattyHits++;
    }
    assert.equal(quietHits, 0);
    assert.ok(chattyHits > 50, `chatty hits ${chattyHits}`);
});

test('новые челленджи: без кафе ломается кофе, 20 дней в лимите, 3 накопления', () => {
    assert.ok(CHALLENGES.some(c => c.id === 'nocafe') && CHALLENGES.some(c => c.id === 'limit20') && CHALLENGES.some(c => c.id === 'save3'));
    const hist = [mk('expense', '2026-09-25', 100, { category: 'Еда' })];
    const ok = evaluateChallenge({ id: 'nocafe', start: '2026-10-01' }, { today: '2026-10-05', transactions: [...hist, mk('expense', '2026-10-03', 100, { category: 'Еда' })], limit: 1000 });
    assert.equal(ok.status, 'active');
    const bad = evaluateChallenge({ id: 'nocafe', start: '2026-10-01' }, { today: '2026-10-05', transactions: [...hist, mk('expense', '2026-10-03', 100, { category: '☕ Кафе' })], limit: 1000 });
    assert.equal(bad.status, 'fail');
    const done = evaluateChallenge({ id: 'save3', start: '2026-10-01' }, { today: '2026-10-05', transactions: [mk('deposit', '2026-10-02', 1), mk('deposit', '2026-10-03', 1), mk('deposit', '2026-10-04', 1)], limit: 0 });
    assert.equal(done.status, 'done');
});
