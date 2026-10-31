import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k)
};
const { carryNext, getCarryMode, setCarryMode, normalizeCarryMode } = await import('../src/utils/carryOver.js');

test('carryNext: carry сохраняет знак, reset обнуляет минус', () => {
    assert.equal(carryNext(-100, 'carry'), -100);
    assert.equal(carryNext(-100, 'reset'), 0);
    assert.equal(carryNext(250, 'reset'), 250);
    assert.equal(carryNext(250, 'carry'), 250);
});
test('режим: по умолчанию и для неизвестных значений — carry', () => {
    store.clear();
    assert.equal(getCarryMode(), 'carry');
    store.set('budgetit:carryMode', 'что-то');
    assert.equal(getCarryMode(), 'carry');
    assert.equal(normalizeCarryMode(undefined), 'carry');
    assert.equal(setCarryMode('reset'), 'reset');
    assert.equal(getCarryMode(), 'reset');
    assert.equal(setCarryMode('мусор'), 'carry');
});
test('без localStorage — carry', () => {
    const keep = globalThis.localStorage;
    globalThis.localStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    assert.equal(getCarryMode(), 'carry');
    assert.doesNotThrow(() => setCarryMode('reset'));
    globalThis.localStorage = keep;
});
