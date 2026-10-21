import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { build, ORDER, minimal } from '../scripts/build-css.mjs';

test('app.css собран из актуальных css/*.css (запусти npm run build:css)', () => {
    assert.equal(readFileSync(new URL('../app.css', import.meta.url), 'utf8'), build());
});

test('все файлы из css/ входят в сборку и порядок задан явно', () => {
    const files = readdirSync(new URL('../css/', import.meta.url)).filter(f => f.endsWith('.css')).sort();
    assert.deepEqual([...ORDER].sort(), files);
});

test('стили не ссылаются на относительные assets (в css/ они сломались бы) и не используют @import', () => {
    for (const f of ORDER) {
        const css = readFileSync(new URL(`../css/${f}`, import.meta.url), 'utf8');
        assert.doesNotMatch(css, /url\(\s*['"]?(?:\.\/|\.\.\/)?assets\//, f);
        assert.doesNotMatch(css, /@import/, f);
    }
});

test('minimal убирает комментарии, но не трогает строки и url()', () => {
    const out = minimal('a{content:"/* не комментарий */";background:url(data:image/svg+xml;base64,AA//BB)} /* x */\n\n\nb{}');
    assert.ok(out.includes('"/* не комментарий */"'));
    assert.ok(out.includes('AA//BB'));
    assert.ok(!out.includes('/* x */'));
});
