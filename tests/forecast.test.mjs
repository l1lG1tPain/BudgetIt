import test from 'node:test';
import assert from 'node:assert/strict';
import { findRecurring, forecastBalance } from '../src/analytics/forecast.js';
import { calcAfterPayday } from '../src/utils/insightsNew.js';

const T = (type, date, category, amount) => ({ id: `${type}${date}${category}${amount}`, type, date, category, amount });
// три полных месяца: зарплата 5-го, аванс 20-го, жильё 9-го, мелкие траты каждый день
function history() {
    const tx = [];
    for (const m of ['2026-07', '2026-08', '2026-09', '2026-10']) {
        tx.push(T('income', `${m}-05`, '💰 Зарплата', 11_000_000));
        tx.push(T('income', `${m}-20`, '💼 Аванс', 7_000_000));
        tx.push(T('expense', `${m}-09`, '🏠 Жильё', 5_400_000));
        for (let d = 1; d <= 28; d++) tx.push(T('expense', `${m}-${String(d).padStart(2, '0')}`, '🛒 Продукты', 100_000));
    }
    return tx;
}

test('регулярные операции: зарплата, аванс, жильё; мелкие ежедневные — нет', () => {
    const rec = findRecurring(history(), '2026-11-01');
    const names = rec.map(r => r.category).sort();
    assert.deepEqual(names, ['💰 Зарплата', '💼 Аванс', '🏠 Жильё'].sort());
    assert.equal(rec.find(r => r.category === '💼 Аванс').day, 20);
});

test('прогноз до конца месяца: темп трат + ожидаемые зарплата, жильё, аванс', () => {
    const f = forecastBalance(history(), '2026-11-01', '2026-11-30', 1_000_000);
    assert.equal(f.points.length, 29);
    assert.deepEqual(f.events.map(e => e.category), ['💰 Зарплата', '🏠 Жильё', '💼 Аванс']);
    // темп: 100 000 × 28 дней за ~2 месяца из 60 дней окна
    assert.ok(f.pace > 80_000 && f.pace < 100_000, String(f.pace));
    const expected = 1_000_000 + 11_000_000 - 5_400_000 + 7_000_000 - f.pace * 29;
    assert.ok(Math.abs(f.end - expected) < 1);
    // до зарплаты остаток проседает, но не ниже нуля
    assert.ok(f.min.balance > 0);
});

test('прогноз: если зарплата в этом месяце уже пришла, второй раз её не ждём', () => {
    const tx = [...history(), T('income', '2026-11-04', '💰 Зарплата', 11_000_000)];
    const f = forecastBalance(tx, '2026-11-06', '2026-11-30', 5_000_000);
    assert.ok(!f.events.some(e => e.category === '💰 Зарплата'));
});

test('после поступления: доля трат за 3 дня от цикла', () => {
    const inc = [], exp = [];
    for (const m of ['2026-08', '2026-09', '2026-10']) {
        inc.push(T('income', `${m}-05`, '💰 Зарплата', 10_000_000));
        inc.push(T('income', `${m}-20`, '💼 Аванс', 7_000_000));
        exp.push(T('expense', `${m}-06`, '🏠 Жильё', 3_000_000));
        for (let d = 5; d <= 28; d++) exp.push(T('expense', `${m}-${String(d).padStart(2, '0')}`, '🛒 Продукты', 100_000));
    }
    const r = calcAfterPayday(inc, exp, '2026-10-31');
    assert.ok(r && r.cycles >= 2);
    assert.ok(r.share > r.uniform);
    assert.equal(r.days, 3);
});
