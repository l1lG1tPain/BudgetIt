import test from 'node:test';
import assert from 'node:assert/strict';
import { emotionFor, computeCard, countOverStreak, reactToSave, TEXT_VARIANTS, VARIETY_CHANCE } from '../src/shark/SharkMood.js';
import { FLOW_TEXTS, FLOW_TITLES, LIVE_VARIETY } from '../src/shark/texts/live3.js';

const base = { mood: 'ok', ratio: 0.3, spent: 100, hour: 12, hasToday: true, character: 'normal', today: '2026-10-21', weekday: 3 };

test('гистерезис: «спокойствие» держится до 56%, а входит на 50%', () => {
    assert.equal(emotionFor({ ...base, ratio: 0.52 }).emotion, 'smile');
    assert.equal(emotionFor({ ...base, ratio: 0.52, prevEmotion: 'calm' }).emotion, 'calm');
    assert.equal(emotionFor({ ...base, ratio: 0.58, prevEmotion: 'calm' }).emotion, 'smile');
    assert.equal(emotionFor({ ...base, ratio: 0.3 }).emotion, 'calm');
});

test('вкрапления: выбор стабилен в пределах блока и выпадает примерно в VARIETY_CHANCE% блоков', () => {
    const args = { ...base, variety: true };
    assert.deepEqual(emotionFor({ ...args, today: '2026-03-05' }), emotionFor({ ...args, today: '2026-03-05' }));
    let hits = 0, total = 0;
    const seen = new Set();
    for (let d = 1; d <= 28; d++) for (const hour of [9, 13, 17, 21]) {
        total++;
        const e = emotionFor({ ...args, today: `2026-02-${String(d).padStart(2, '0')}`, hour });
        if (e.forceLive) { hits++; seen.add(e.emotion); assert.ok(['laugh', 'cheeky', 'idea', 'smart'].includes(e.emotion)); }
    }
    const share = hits / total * 100;
    assert.ok(share > VARIETY_CHANCE - 8 && share < VARIETY_CHANCE + 8, `доля ${share.toFixed(1)}%`);
    assert.ok(seen.size >= 3, [...seen].join());
    // без включённого флага (classic) и ночью вкраплений нет
    for (let d = 1; d <= 28; d++) {
        assert.ok(!emotionFor({ ...base, variety: false, today: `2026-02-${String(d).padStart(2, '0')}` }).forceLive);
        assert.ok(!emotionFor({ ...args, hour: 5, hasToday: true, today: `2026-02-${String(d).padStart(2, '0')}` }).forceLive);
    }
});

test('календарь: понедельник утром, пятница и воскресенье вечером', () => {
    const find = (extra, key) => {
        for (let d = 1; d <= 28; d++) {
            const e = emotionFor({ ...base, ...extra, today: `2026-02-${String(d).padStart(2, '0')}` });
            if (e.textKey === key) return e;
        }
        return null;
    };
    assert.equal(find({ weekday: 1, hour: 9 }, 'calMonday').emotion, 'tired');
    assert.equal(find({ weekday: 5, hour: 19 }, 'calFriday').emotion, 'cheeky');
    assert.equal(find({ weekday: 0, hour: 20 }, 'calSunday').emotion, 'think');
    assert.equal(find({ weekday: 3, hour: 19 }, 'calFriday'), null);
});

test('«остывание» после перерасхода и лестница злости', () => {
    assert.equal(emotionFor({ ...base, overStreak: 1, hour: 10 }).textKey, 'calCool');
    assert.equal(emotionFor({ ...base, overStreak: 1, hour: 10, character: 'kind' }).emotion, 'sympathy');
    assert.notEqual(emotionFor({ ...base, overStreak: 1, hour: 17 }).textKey, 'calCool');
    const ang = { ...base, mood: 'angry', ratio: 1.1 };
    assert.equal(emotionFor({ ...ang, character: 'strict', overStreak: 1 }).emotion, 'grim-fist');
    assert.equal(emotionFor({ ...ang, ratio: 1.02, rude: true, overStreak: 1 }).emotion, 'grim-fist');
    assert.equal(emotionFor({ ...ang, character: 'kind', overStreak: 1 }).emotion, 'angry');
    // «Дерзкая»: повтор поднимает ступень
    assert.equal(emotionFor({ ...ang, ratio: 1.25, rude: true }).emotion, 'fist');
    assert.equal(emotionFor({ ...ang, ratio: 1.25, rude: true, overStreak: 1 }).emotion, 'gopnik');
    assert.match(emotionFor({ ...ang, ratio: 1.8, rude: true, overStreak: 1 }).emotion, /^rage-flip/);
});

test('countOverStreak: подряд идущие дни с перерасходом до сегодняшнего', () => {
    const tx = (date, amount) => ({ type: 'expense', date, amount, category: 'еда' });
    const today = '2026-10-21';
    assert.equal(countOverStreak({ transactions: [tx('2026-10-20', 150), tx('2026-10-19', 150), tx('2026-10-18', 50)], limit: 100, today }), 2);
    assert.equal(countOverStreak({ transactions: [tx('2026-10-20', 50)], limit: 100, today }), 0);
    assert.equal(countOverStreak({ transactions: [tx('2026-10-19', 500)], limit: 100, today }), 0);
    assert.equal(countOverStreak({ transactions: [tx('2026-10-20', 500)], limit: 0, today }), 0);
});

test('карточка: вкрапления берут текст из своего набора, календарь — из особого', () => {
    const args = { spent: 10, limit: 100, character: 'normal', hasData: true, streak: 0, hasToday: true };
    let got = null;
    for (let d = 1; d <= 28 && !got; d++) {
        const c = computeCard(args, { now: new Date(2026, 1, d, 13, 0), today: `2026-02-${String(d).padStart(2, '0')}`, shark: 'hoodie', random: () => 0.99 });
        if (['laugh', 'cheeky', 'idea', 'smart'].includes(c.emotion)) got = c;
    }
    assert.ok(got, 'за месяц хотя бы одна эмоция-вкрапление');
    const pool = TEXT_VARIANTS[`live:${got.emotion}`].normal.map(f => f({ left: 90, over: 0, days: 0, spent: 10, limit: 100 }));
    assert.ok(pool.includes(got.text), got.text);
    const monday = computeCard({ ...args, hasToday: true }, { now: new Date(2026, 9, 19, 9, 0), today: '2026-10-19', shark: 'hoodie', variety: false, random: () => 0.99 });
    if (monday.emotion === 'tired') assert.match(monday.title, /понедельник|старт недели/i);
    const classic = computeCard(args, { now: new Date(2026, 1, 3, 13, 0), today: '2026-02-03', shark: 'classic' });
    assert.ok(!['laugh', 'cheeky', 'idea', 'smart'].includes(classic.emotion));
});

test('тост: крупная покупка внутри лимита даёт хитрый взгляд', () => {
    const r = reactToSave({ type: 'expense', amount: 450, before: 0, after: 450, limit: 1000, character: 'normal', talk: 'quiet' });
    assert.equal(r.emotion, 'cheeky');
    const small = reactToSave({ type: 'expense', amount: 100, before: 0, after: 100, limit: 1000, character: 'normal', talk: 'quiet' });
    assert.equal(small.emotion, 'calm');
});

test('тексты потока: без точек в конце, без мусора, хватает вариантов', () => {
    const pools = [...Object.entries(FLOW_TEXTS), ...Object.entries(LIVE_VARIETY)];
    for (const [key, byChar] of pools) for (const ch of ['kind', 'normal', 'strict']) {
        const list = byChar[ch];
        assert.ok(list && list.length >= 10, `${key}/${ch}`);
        assert.equal(new Set(list).size, list.length, `${key}/${ch}: дубли`);
        for (const t of list) {
            assert.doesNotMatch(t, /\.\s*$/, t);
            assert.doesNotMatch(t, /\{(?!limit|left)/, t);
        }
    }
    for (const key of Object.keys(FLOW_TEXTS)) for (const ch of ['kind', 'normal', 'strict']) assert.ok(FLOW_TITLES[key][ch], `${key}/${ch}: нет заголовка`);
});
