import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { EMOTION_INFO } from '../src/shark/texts/emotionInfo.js';
import { HOODIE_EMOTIONS, emotionFor } from '../src/shark/SharkMood.js';

test('галерея описывает все эмоции Акулки и картинки на месте', () => {
    assert.deepEqual([...EMOTION_INFO.map(e => e[0])].sort(), [...HOODIE_EMOTIONS].sort());
    for (const [id, name, when] of EMOTION_INFO) {
        assert.ok(name && when, id);
        assert.ok(existsSync(new URL(`../assets/hoodie/hoodie-${id}.webp`, import.meta.url)), id);
    }
});

test('редкие эмоции достижимы: fist, gopnik, broke', () => {
    const base = { mood: 'ok', ratio: 0.3, spent: 100, hour: 12, hasToday: true };
    assert.equal(emotionFor({ ...base, mood: 'tense', ratio: 1.1, character: 'strict' }).emotion, 'fist');
    assert.equal(emotionFor({ ...base, mood: 'angry', ratio: 1.4, rude: true }).emotion, 'gopnik');
    assert.equal(emotionFor({ ...base, mood: 'angry', ratio: 1.4, rude: false }).emotion, 'fist');
    assert.equal(emotionFor({ ...base, mood: 'angry', ratio: 1.1 }).emotion, 'angry');
    assert.match(emotionFor({ ...base, mood: 'angry', ratio: 2.4, rude: true }).emotion, /^rage-flip/);
    assert.equal(emotionFor({ ...base, mood: 'angry', ratio: 3.2, rude: true }).emotion, 'rage-squat');
    assert.equal(emotionFor({ ...base, source: 'plan-empty' }).emotion, 'broke');
});

import { TEXT_VARIANTS, computeCard, reactToSave } from '../src/shark/SharkMood.js';
import { RUDE_TEXTS } from '../src/shark/texts/rude.js';

test('«Дерзкая»: тексты есть под все 27 эмоций, в каждом хватает вариантов и нет мусора', () => {
    for (const [id] of EMOTION_INFO) {
        const list = RUDE_TEXTS[id];
        assert.ok(list && list.length >= 25, `${id}: ${list?.length}`);
        assert.equal(new Set(list).size, list.length, `${id}: повторы`);
        for (const t of list) assert.ok(t.length <= 170, `${id}: ${t.length} ${t}`);
    }
        for (const [id, list] of Object.entries(RUDE_TEXTS)) for (const t of list) {
        assert.doesNotMatch(t, /undefined|NaN|\{(?!over|left|spent|limit)/, `${id}: ${t}`);
        assert.doesNotMatch(t, /коран|аллах|религи|библи|иисус/i, `${id}: ${t}`);   // единственное табу: насмешки над религией
    }
});

test('«Дерзкая»: подставляется только у Акулки в худи и только когда включена', () => {
    const args = { spent: 300, limit: 100, character: 'normal', hasData: true, hasToday: true };
    const mem = () => ({ _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = v; } });
    const opts = r => ({ storage: mem(), today: '2026-10-10', shark: 'hoodie', random: () => r, now: new Date('2026-10-10T12:00:00') });
    const rude = computeCard({ ...args, rude: true }, opts(0.1));
    assert.ok(RUDE_TEXTS[rude.emotion].some(t => rude.text === t.replace('{over}', '200').replace('{spent}', '300').replace('{limit}', '100').replace('{left}', '0')), rude.text);
    const calm = computeCard({ ...args, rude: false }, opts(0.1));
    assert.ok(!RUDE_TEXTS[calm.emotion].some(t => calm.text === t.replace('{over}', '200').replace('{spent}', '300').replace('{limit}', '100').replace('{left}', '0')));   // точное совпадение: по префиксу тест случайно срабатывал на общих началах фраз
    const classic = computeCard({ ...args, rude: true }, { ...opts(0.1), shark: 'classic' });
    assert.notEqual(classic.text, rude.text);
});

test('«Дерзкая»: тост после перерасхода тоже грубее', () => {
    const r = reactToSave({ type: 'expense', amount: 500, before: 200, after: 700, limit: 100, character: 'normal', talk: 'normal', rude: true, storage: { getItem: () => null, setItem() {} } });
    assert.ok(r.text.length > 5 && !/undefined|NaN/.test(r.text));
});
