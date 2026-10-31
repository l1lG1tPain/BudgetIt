import test from 'node:test';
import assert from 'node:assert/strict';
import {
    shouldOfferProtection, describeStatus, formatBytes, shareBackupFile,
    getDismissedAt, markDismissed
} from '../src/utils/persistStorage.js';

const DAY = 86400000;
const NOW = 1_800_000_000_000;
const base = { supported: true, persisted: false, txCount: 10, dismissedAt: 0, now: NOW };

test('предложение: нужно, когда не закреплено и данных достаточно', () => {
    assert.equal(shouldOfferProtection(base), true);
});

test('предложение: нет при закреплённом хранилище, без API или с малым числом операций', () => {
    assert.equal(shouldOfferProtection({ ...base, persisted: true }), false);
    assert.equal(shouldOfferProtection({ ...base, supported: false }), false);
    assert.equal(shouldOfferProtection({ ...base, txCount: 4 }), false);
});

test('предложение: пауза 14 дней после отказа', () => {
    assert.equal(shouldOfferProtection({ ...base, dismissedAt: NOW - 3 * DAY }), false);
    assert.equal(shouldOfferProtection({ ...base, dismissedAt: NOW - 15 * DAY }), true);
});

test('describeStatus: три состояния', () => {
    assert.equal(describeStatus({ supported: false }).ok, false);
    assert.equal(describeStatus({ supported: true, persisted: true }).ok, true);
    assert.match(describeStatus({ supported: true, persisted: false }).title, /не закреплены/);
});

test('formatBytes', () => {
    assert.equal(formatBytes(500), '500 Б');
    assert.equal(formatBytes(2048), '2.0 КБ');
    assert.equal(formatBytes(5 * 1024 * 1024), '5.0 МБ');
});

test('markDismissed/getDismissedAt через подставное хранилище', () => {
    const mem = {}; const st = { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } };
    assert.equal(getDismissedAt(st), 0);
    markDismissed(123, st);
    assert.equal(getDismissedAt(st), 123);
});

test('shareBackupFile: без Web Share API возвращает unsupported', async () => {
    assert.equal(await shareBackupFile({ a: 1 }, 'x.json'), 'unsupported');
});
