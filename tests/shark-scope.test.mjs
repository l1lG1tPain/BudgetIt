import test from 'node:test';
import assert from 'node:assert/strict';
import { getSharkSettings, saveSharkSettings, setSharkScopeProvider, readScoped, writeScoped } from '../src/shark/SharkMood.js';
import { getFlags, markFlag } from '../src/shark/SharkExtra.js';

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };

test('лимит Акулки, цель и события хранятся отдельно для каждого бюджета', () => {
    const st = mem();
    let cur = { id: 'A', first: true };
    setSharkScopeProvider(() => cur);
    try {
        saveSharkSettings({ limitMode: 'custom', customLimit: 5000, character: 'strict' }, st);
        writeScoped('budgetit:shark:goal', { sum: 100 }, st);
        markFlag('export', st);
        cur = { id: 'B', first: false };
        let b = getSharkSettings(st);
        assert.equal(b.limitMode, 'auto');            // в другом бюджете свой режим
        assert.equal(b.customLimit, 0);
        assert.equal(b.character, 'strict');          // характер общий
        assert.equal(readScoped('budgetit:shark:goal', st), null);
        assert.deepEqual(getFlags(st), {});
        saveSharkSettings({ limitMode: 'median' }, st);
        cur = { id: 'A', first: true };
        assert.equal(getSharkSettings(st).limitMode, 'custom');
        assert.equal(getSharkSettings(st).customLimit, 5000);
        assert.ok(readScoped('budgetit:shark:goal', st));
        assert.ok(getFlags(st).export);
        cur = { id: 'B', first: false };
        assert.equal(getSharkSettings(st).limitMode, 'median');
    } finally { setSharkScopeProvider(null); }
});

test('старые общие данные достаются только первому бюджету, удаление не воскрешает их', () => {
    const st = mem();
    st.setItem('budgetit:shark:goal', JSON.stringify({ sum: 7 }));
    setSharkScopeProvider(() => ({ id: 'A', first: true }));
    try {
        assert.ok(readScoped('budgetit:shark:goal', st));
        writeScoped('budgetit:shark:goal', null, st);
        assert.equal(JSON.parse(readScoped('budgetit:shark:goal', st)), null);
        setSharkScopeProvider(() => ({ id: 'B', first: false }));
        assert.equal(readScoped('budgetit:shark:goal', st), null);
    } finally { setSharkScopeProvider(null); }
});
