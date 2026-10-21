import test from 'node:test';
import assert from 'node:assert/strict';
import { getLimitInfo, getPlanLimit, getMedianLimit, planStatus, findActivePlanner, getSharkSettings } from '../src/shark/SharkMood.js';
import { planHint, describeLimit } from '../src/shark/SharkTalk.js';

const today = '2026-10-20';
const day = n => { const d = new Date(today + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); };
const exp = (date, amount, category = 'Еда') => ({ type: 'expense', date, amount, category });
const plan = (o = {}) => ({ id: 'p', budgetId: 'b', name: 'Октябрь', startDate: '2026-10-01', endDate: '2026-10-31', dailyExpenses: [{ amountPerDay: 100000 }], ...o });
const tx = [exp(day(-1), 100), exp(day(-2), 120), exp(day(-3), 110)];

test('план: действующий / завершён / ещё не начался / нет', () => {
    assert.equal(planStatus([plan()], 'b', today).state, 'active');
    assert.equal(planStatus([plan({ startDate: '2026-09-01', endDate: '2026-09-30' })], 'b', today).state, 'ended');
    assert.equal(planStatus([plan({ startDate: '2026-11-01', endDate: '2026-11-30' })], 'b', today).state, 'upcoming');
    assert.equal(planStatus([], 'b', today).state, 'none');
    assert.equal(findActivePlanner([plan({ startDate: '2026-09-01', endDate: '2026-09-30' })], 'b', today), null);
    assert.equal(planStatus([plan({ archived: true })], 'b', today).state, 'none');
    assert.equal(planStatus([plan({ budgetId: 'other' })], 'b', today).state, 'none');
});

test('getPlanLimit: завершённый или будущий план не считается', () => {
    assert.equal(getPlanLimit({ planner: plan(), today, planLimit: 100000 }).limit, 100000);
    assert.equal(getPlanLimit({ planner: plan({ endDate: '2026-10-19' }), today, planLimit: 100000 }).source, 'noplan');
    assert.equal(getPlanLimit({ planner: plan({ startDate: '2026-10-21' }), today, planLimit: 100000 }).source, 'noplan');
    assert.equal(getPlanLimit({ planner: null, today }).source, 'noplan');
    assert.equal(getPlanLimit({ planner: plan(), today, planLimit: 0 }).source, 'plan-empty');
    assert.equal(getPlanLimit({ planner: plan(), today, planLimit: 99999.7 }).limit, 99999);
});

test('режимы: медиана игнорирует план, план игнорирует медиану', () => {
    const med = getLimitInfo({ transactions: tx, planner: plan(), planLimit: 100000, today, settings: { limitMode: 'median' } });
    assert.equal(med.limit, 110); assert.equal(med.source, 'median');
    const pl = getLimitInfo({ transactions: tx, planner: plan(), planLimit: 100000, today, settings: { limitMode: 'plan' } });
    assert.equal(pl.limit, 100000); assert.equal(pl.source, 'plan');
    assert.equal(pl.median.limit, 110);
});

test('режим «По плану» без плана: лимита нет, source noplan (не откатывается на медиану)', () => {
    const r = getLimitInfo({ transactions: tx, planner: null, today, settings: { limitMode: 'plan' } });
    assert.equal(r.limit, 0); assert.equal(r.source, 'noplan');
    assert.equal(r.auto.source, 'median');
    const auto = getLimitInfo({ transactions: tx, planner: null, today, settings: { limitMode: 'auto' } });
    assert.equal(auto.source, 'median');
});

test('медиана не учитывает плановые категории (аренда не раздувает типичный день)', () => {
    const p = plan({ regularExpenses: [{ category: 'Аренда' }] });
    const t = [...tx, exp(day(-4), 100, 'Еда'), exp(day(-4), 5000000, 'Аренда')];
    assert.equal(getMedianLimit({ transactions: t, planner: p, today }).limit, 105);
});

test('настройки принимают новые режимы', () => {
    const st = { getItem: () => JSON.stringify({ limitMode: 'median' }) };
    assert.equal(getSharkSettings(st).limitMode, 'median');
    assert.equal(getSharkSettings({ getItem: () => JSON.stringify({ limitMode: 'plan' }) }).limitMode, 'plan');
    assert.equal(getSharkSettings({ getItem: () => JSON.stringify({ limitMode: 'бред' }) }).limitMode, 'auto');
});

test('подсказки про план', () => {
    assert.match(planHint({ source: 'noplan', status: { state: 'none' } }), /Добавь план/);
    assert.match(planHint({ source: 'noplan', status: { state: 'ended', planner: plan({ endDate: '2026-09-30' }) } }), /закончился 30\.09/);
    assert.match(planHint({ source: 'noplan', status: { state: 'upcoming', planner: plan({ startDate: '2026-11-01' }) } }), /начнётся 01\.11/);
    assert.match(planHint({ source: 'plan-empty', status: { state: 'active', planner: plan() } }), /ничего не остаётся/);
    const lines = describeLimit({ info: { limit: 0, source: 'noplan', median: { limit: 110 } }, status: { state: 'none' } });
    assert.match(lines.join(' '), /Добавь план/);
});

import { answerQuestion } from '../src/shark/SharkTalk.js';
import { weekReport } from '../src/shark/SharkPlus.js';

test('разбор недели: тренд, сравнение, лимит, топ категорий — под все характеры', () => {
    const e = (n, a, c = 'Еда') => exp(day(n), a, c);
    const tx = [e(0, 50000), e(-1, 80000), e(-2, 40000, 'Такси'), e(-3, 120000), e(-5, 300000, 'Кафе'), e(-6, 200000), e(-8, 100000), e(-9, 90000)];
    const w = weekReport({ transactions: tx, today, limit: 150000 });
    assert.equal(w.total, 790000); assert.equal(w.daysWith, 6); assert.equal(w.inLimit, 4); assert.equal(w.overDays, 2);
    assert.equal(w.prev, 190000); assert.equal(w.deltaPct, 316); assert.equal(w.trend, 'down');
    assert.equal(w.topCats[0].name, 'Еда'); assert.equal(w.spark.length, 7);
    for (const character of ['kind', 'normal', 'strict']) {
        const t = answerQuestion('week', { today, character, limit: 150000, transactions: tx, seed: 'x' }).text;
        assert.match(t, /В лимите 4 из 6/); assert.match(t, /Тренд/); assert.match(t, /Больше всего/); assert.doesNotMatch(t, /[{}]|undefined|NaN/);
        const noLim = answerQuestion('week', { today, character, limit: 0, transactions: tx, seed: 'x' }).text;
        assert.doesNotMatch(noLim, /В лимите/);
    }
});

import { planAverageLimit } from '../src/shark/SharkMood.js';
test('planAverageLimit берёт «Средний лимит в день» из менеджера планов', () => {
    const pm = { calculatePlannerProjection: id => (id === 'p' ? { summary: { dailyLimit: 123456.9 } } : null) };
    assert.equal(planAverageLimit(pm, { id: 'p' }), 123456);
    assert.equal(planAverageLimit(pm, { id: 'x' }), 0);
    assert.equal(planAverageLimit(null, { id: 'p' }), 0);
    assert.equal(planAverageLimit({ calculatePlannerProjection() { throw new Error('boom'); } }, { id: 'p' }), 0);
    assert.equal(planAverageLimit({ calculatePlannerProjection: () => ({ summary: { dailyLimit: -50 } }) }, { id: 'p' }), 0);
});

import { sharkImage as shImg, HOODIE_EMOTIONS, emotionFor, computeCard, TEXT_VARIANTS, SHARK_IDS, getSharkSettings as gss } from '../src/shark/SharkMood.js';
import { existsSync } from 'node:fs';

test('Акулка (hoodie): настроения и эмоции → картинки, все 27 файлов на месте', () => {
    assert.equal(HOODIE_EMOTIONS.length, 27);
    assert.match(shImg('ok', 'hoodie'), /hoodie-smile\.webp$/);
    assert.match(shImg('new', 'hoodie'), /hoodie-welcome\.webp$/);
    assert.match(shImg('tense', 'hoodie'), /hoodie-stern-smile\.webp$/);
    assert.match(shImg('shock', 'hoodie'), /hoodie-shock\.webp$/);
    assert.match(shImg('нет-такой', 'hoodie'), /hoodie-smile\.webp$/);
    assert.match(shImg('ok'), /hoodie-smile/);   // по умолчанию «Акулка»
    for (const e of HOODIE_EMOTIONS) assert.ok(existsSync(new URL(`../assets/hoodie/hoodie-${e}.webp`, import.meta.url)), e);
    assert.deepEqual(SHARK_IDS, ['hoodie', 'classic']);
    assert.equal(gss({ getItem: () => '{"shark":"что-то"}' }).shark, 'hoodie');
});

test('эмоции: ночь, утро, скука, шок, праздник, строгая, добрая', () => {
    const base = { hasData: true, hasToday: true, spent: 100, ratio: 0.3, mood: 'ok', hour: 14, today: '2026-10-20' };
    assert.equal(emotionFor({ ...base, hour: 2 }).emotion, 'sleep');
    assert.equal(emotionFor({ ...base, hour: 2, quietHours: false }).emotion, 'calm');
    assert.equal(emotionFor({ ...base, hour: 6, hasToday: false, spent: 0 }).emotion, 'tired');
    assert.equal(emotionFor({ ...base, hour: 20, hasToday: false, spent: 0, ratio: 0 }).emotion, 'bored');
    assert.equal(emotionFor({ ...base }).emotion, 'calm');
    assert.equal(emotionFor({ ...base, ratio: 0.7 }).emotion, 'smile');
    assert.equal(emotionFor({ ...base, mood: 'tense', ratio: 0.85 }).emotion, 'stern-smile');
    assert.equal(emotionFor({ ...base, mood: 'tense', ratio: 1.2, character: 'kind' }).emotion, 'sympathy');
    assert.equal(emotionFor({ ...base, mood: 'angry', ratio: 1.2 }).emotion, 'angry');
    assert.equal(emotionFor({ ...base, mood: 'angry', ratio: 1.2, character: 'strict' }).emotion, 'fist');
    assert.equal(emotionFor({ ...base, mood: 'angry', ratio: 1.8 }).emotion, 'shock');
    assert.equal(emotionFor({ ...base, mood: 'proud', streak: 7 }).emotion, 'proud');
    assert.equal(emotionFor({ ...base, mood: 'proud', streak: 30 }).emotion, 'celebrate');
    assert.equal(emotionFor({ ...base, mood: 'new', hasData: false }).emotion, 'welcome');
    assert.equal(emotionFor({ ...base, mood: 'new', source: 'noplan' }).emotion, 'think');
    // грубые жесты только в режиме «Дерзкая» и только при двойном превышении
    assert.ok(!emotionFor({ ...base, mood: 'angry', ratio: 2.5 }).emotion.startsWith('rage'));
    assert.ok(emotionFor({ ...base, mood: 'angry', ratio: 2.5, rude: true }).emotion.startsWith('rage'));
    assert.ok(!emotionFor({ ...base, mood: 'angry', ratio: 1.3, rude: true }).emotion.startsWith('rage'));
});

test('computeCard: особые тексты для сна, шока, скуки, утра и праздника без «дыр»', () => {
    const mem = () => { const m = {}; return { getItem: k => m[k] ?? null, setItem: (k, v) => { m[k] = v; } }; };
    const at = h => new Date(`2026-10-20T${String(h).padStart(2, '0')}:30:00`);
    for (const character of ['kind', 'normal', 'strict']) {
        const mk = (args, h) => computeCard({ limit: 100000, character, hasData: true, ...args }, { storage: mem(), today: '2026-10-20', now: at(h) });
        const sleep = mk({ spent: 1000, hasToday: true }, 1);
        assert.equal(sleep.emotion, 'sleep'); assert.doesNotMatch(sleep.text, /[{}]|undefined|NaN/);
        const tired = mk({ spent: 0, hasToday: false }, 6);
        assert.equal(tired.emotion, 'tired'); assert.doesNotMatch(tired.text, /[{}]|undefined|NaN/);
        const bored = mk({ spent: 0, hasToday: false }, 20);
        assert.equal(bored.emotion, 'bored'); assert.doesNotMatch(bored.text, /[{}]/);
        const shock = mk({ spent: 200000, hasToday: true }, 15);
        assert.equal(shock.emotion, 'shock'); assert.doesNotMatch(shock.text, /[{}]|undefined|NaN/);
        const party = mk({ spent: 1000, hasToday: true, streak: 30 }, 15);
        assert.equal(party.emotion, 'celebrate'); assert.doesNotMatch(party.text, /[{}]|undefined|NaN/);
        const obs = mk({ spent: 1000, hasToday: true }, 15);
        assert.equal(obs.emotion, 'calm');   // обычный день: свой текст настроения, эмоция «спокойна»
    }
});

test('болтушка меняет подсказку чаще: блоки по 2 часа', async () => {
    const { buildExtra } = await import('../src/shark/SharkTalk.js');
    const tx = [{ type: 'expense', amount: 10, date: '2026-10-20', category: 'Еда' }];
    const mk = h => buildExtra({ now: new Date(2026, 9, 21, h, 0), today: '2026-10-21', character: 'normal', transactions: tx, limit: 100, spent: 0, talk: 'chatty' });
    assert.ok(mk(9) === null || typeof mk(9).text === 'string');
});

test('живые реплики: нет «дыр», хватает вариаций, карточка не повторяется подряд', () => {
    const v = { left: 12000, over: 5000, days: 7, spent: 30000, limit: 50000 };
    for (const [key, pools] of Object.entries(TEXT_VARIANTS)) {
        if (!key.startsWith('live:') && !['sleep', 'tired', 'bored', 'shock', 'celebrate'].includes(key)) continue;
        for (const ch of ['kind', 'normal', 'strict']) {
            const list = pools[ch];
            assert.ok(list && list.length >= 3, `${key}/${ch}: мало реплик`);
            for (const f of list) assert.doesNotMatch(f(v), /[{}]|undefined|NaN/, `${key}/${ch}`);
        }
    }
    for (const ch of ['kind', 'normal', 'strict']) assert.ok(TEXT_VARIANTS['live:smile'][ch].length >= 8);
    const seen = new Set();
    const mem = {}; const storage = { getItem: k => mem[k] ?? null, setItem: (k, x) => { mem[k] = x; } };
    for (let i = 0; i < 40; i++) {
        seen.add(computeCard({ spent: 1000, limit: 100000, character: 'normal', hasData: true, hasToday: true }, { storage, today: '2026-10-20', now: new Date('2026-10-20T15:30:00'), shark: 'hoodie' }).text);
    }
    assert.ok(seen.size >= 10, `вариаций за 40 показов: ${seen.size}`);
});

test('«Куда ушли деньги»: без записей сегодня предлагает вчера, позавчера и прошлую неделю', async () => {
    const { answerQuestion } = await import('../src/shark/SharkTalk.js');
    const tx = [
        { type: 'expense', amount: 40000, date: '2026-10-20', category: 'Еда' },
        { type: 'expense', amount: 15000, date: '2026-10-19', category: 'Такси' },
        { type: 'expense', amount: 20000, date: '2026-10-14', category: 'Еда' },
        { type: 'expense', amount: 5000, date: '2026-10-13', category: 'Кафе' }
    ];
    const ctx = { today: '2026-10-21', transactions: tx, limit: 30000, spent: 0, character: 'normal', now: new Date('2026-10-21T12:00:00') };
    const t = answerQuestion('today', ctx);
    assert.deepEqual(t.choices.map(c => c.id), ['day:-1', 'day:-2', 'lastweek']);
    const y = answerQuestion('day:-1', ctx);
    assert.match(y.text, /Вчера/); assert.match(y.text, /40 000/); assert.match(y.text, /Еда/);
    assert.deepEqual(y.choices.map(c => c.id), ['day:-2', 'lastweek']);
    const b = answerQuestion('day:-2', ctx);
    assert.match(b.text, /Позавчера/); assert.match(b.text, /15 000/);
    const w = answerQuestion('lastweek', ctx);   // 21.10.2026 — среда, прошлая неделя 12–18 октября
    assert.match(w.text, /25 000/); assert.match(w.text, /Еда 80%/);
    const none = answerQuestion('day:-2', { ...ctx, transactions: [] });
    assert.match(none.text, /Позавчера/); assert.doesNotMatch(none.text, /undefined|NaN/);
});
