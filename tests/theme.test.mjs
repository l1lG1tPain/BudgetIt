import test from 'node:test';
import assert from 'node:assert/strict';
import { getThemeTokens, THEME_SOURCE } from '../src/theme/themeTokens.js';

const NAMES = ['canvas','bg','orb1','orb2','orb3','glass','glass2','stroke','hi','sticky','text','muted','faint','accent','ink','in','out','save','debt','chip'];
const EXPECTED_THEMES = ['light','light-classic','dark','dark-classic','onyx','burgundy','mint','shark','dolphin','monster','yogurt','grape','blackberry','hookah','trackit','sage'];

test('16 тем, у каждой полный набор токенов', () => {
    assert.deepEqual(Object.keys(THEME_SOURCE).sort(), [...EXPECTED_THEMES].sort());
    for (const t of EXPECTED_THEMES) {
        const tk = getThemeTokens(t);
        for (const n of NAMES) assert.ok(tk[n], `${t}: нет токена ${n}`);
    }
});
test('«Акулка» совпадает с эталоном хэндоффа', () => {
    const s = getThemeTokens('shark');
    assert.equal(s.bg, '#070b10'); assert.equal(s.accent, '#3dffa0'); assert.equal(s.sticky, 'rgba(7,11,16,.62)');
    assert.equal(s.in, '#3ddc97'); assert.equal(s.out, '#ff6b7d'); assert.equal(s.save, '#a593ff'); assert.equal(s.debt, '#ffb366');
});
test('светлые темы: стекло светлое, save/debt затемнены; тёмные — стекло белое .05', () => {
    for (const t of ['light','light-classic','dolphin','yogurt','sage']) {
        const tk = getThemeTokens(t);
        assert.equal(tk.glass, 'rgba(255,255,255,.55)'); assert.equal(tk.save, '#6a55e0'); assert.equal(tk.debt, '#d9822b');
    }
    for (const t of ['dark','onyx','burgundy','trackit']) assert.equal(getThemeTokens(t).glass, 'rgba(255,255,255,.05)');
});
test('ink: тёмный на светлых акцентах, белый на тёмных; неизвестная тема → shark', () => {
    assert.notEqual(getThemeTokens('trackit').ink, '#ffffff');   // #a0ff00 светлый
    assert.equal(getThemeTokens('yogurt').ink, '#ffffff');       // #d6568a тёмный
    assert.equal(getThemeTokens('unknown').accent, '#3dffa0');
});
