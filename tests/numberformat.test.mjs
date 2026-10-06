import test from 'node:test';
import assert from 'node:assert/strict';
import { formatNumber } from '../src/utils/utils.js';

test('формат чисел: пробел / запятая / точка', () => {
    assert.equal(formatNumber(1234567, 'space').replace(/[  ]/g, ' '), '1 234 567');
    assert.equal(formatNumber(1234567, 'comma'), '1,234,567');
    assert.equal(formatNumber(1234567, 'dot'), '1.234.567');
    assert.equal(formatNumber(1234.5, 'comma'), '1,234.5');
    assert.equal(formatNumber(1234.5, 'dot'), '1.234,5');
});
