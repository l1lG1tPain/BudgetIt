import test from 'node:test';
import assert from 'node:assert/strict';
const noop = () => {};
globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem: noop, removeItem: noop };
globalThis.window = globalThis.window || { addEventListener: noop, dispatchEvent: noop, matchMedia: () => ({ matches: false }) };
globalThis.document = globalThis.document || { addEventListener: noop, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], documentElement: { style: { setProperty: noop }, getAttribute: () => null }, body: {} };
const { UIManager } = await import('../src/UIManager.js');

const iso = d => d.toLocaleDateString('en-CA');
test('заголовок дня: Сегодня / Вчера / дата', () => {
    const f = UIManager.prototype.formatDayHeading;
    const today = new Date(); const y = new Date(); y.setDate(y.getDate() - 1);
    assert.equal(f(iso(today)), 'Сегодня');
    assert.equal(f(iso(y)), 'Вчера');
    assert.match(f('2020-03-05'), /^5 марта, /);
    assert.equal(f(''), '');
});
