import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    computeMetrics, isFinancialCategory, isFinancialIncomeCategory, isSystemExcludedCategory,
    weekdayOf, prevMonthKey, sumAmount, median, percentile, scoreHealth,
    findRegularExpenses, findAnomaly,
} from '../src/utils/insightsMath.js';

let n = 0;
const ex = (date, category, amount, extra = {}) => ({ id: `e${++n}`, type: 'expense', date, category, amount, ...extra });
const inc = (date, category, amount) => ({ id: `i${++n}`, type: 'income', date, category, amount });
const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

test('регэксп: переводы/вклады/долги/налоги/комиссии — не бытовые; пополнение телефона, страховка, станции — бытовые', () => {
    for (const c of ['🏦 Вклад', '🔄 P2P переводы', 'Перевод другу', 'Налоги', 'Комиссия банка', 'Погашение кредита', 'Долг Ивану', 'Акции'])
        assert.equal(isFinancialCategory(c), true, c);
    for (const c of ['🛒 Продукты', '📱 Пополнение телефона', 'Страховка авто', 'Заправочные станции', 'Реакция аллергии', '🍔 Рестораны'])
        assert.equal(isFinancialCategory(c), false, c);
});

test('регэксп для доходов: «Проценты на остаток», «Комиссионные», «Налоговый вычет» — настоящий доход; переводы и «Проценты от вклада» — нет', () => {
    for (const c of ['Проценты на остаток', 'Комиссионные', 'Налоговый вычет', 'Доход от инвестиций', '💼 Зарплата'])
        assert.equal(isFinancialIncomeCategory(c), false, c);
    for (const c of ['🏦 Проценты от вклада', 'Перевод от друга', '🔄 P2P переводы'])
        assert.equal(isFinancialIncomeCategory(c), true, c);
    assert.equal(isSystemExcludedCategory(' Не знаю на что потратил (без учёта) '), true);
    assert.equal(isSystemExcludedCategory('Другая категория (без учёта)'), true);
});

test('день недели не зависит от часового пояса (строка YYYY-MM-DD)', () => {
    assert.equal(weekdayOf('2026-10-07'), 3); // среда
    assert.equal(weekdayOf('2026-10-04'), 0); // воскресенье
    assert.equal(weekdayOf('2026-10-07T23:30:00'), 3);
    assert.equal(weekdayOf('мусор'), null);
    assert.equal(prevMonthKey('2026-01'), '2025-12');
    assert.equal(prevMonthKey('2026-10'), '2026-09');
});

test('числа: строковые суммы не склеиваются, медиана/перцентиль не требуют сортировки', () => {
    assert.equal(sumAmount([{ amount: '1500' }, { amount: 200 }, { amount: null }, {}]), 1700);
    assert.equal(median([5, 1, 3]), 3);
    assert.equal(median([4, 1, 3, 2]), 2.5);
    assert.equal(median([]), 0);
    assert.equal(percentile([10, 1, 5, 2, 3, 4, 6, 7, 8, 9], 0.9), 9);
});

// Фикстура: сегодня 2026-10-15, октябрь ещё идёт
const TODAY = '2026-10-15';
const fixture = () => [
    inc('2026-08-05', '💼 Зарплата', 100000),
    ex('2026-08-01', '🏠 Аренда', 30000), ex('2026-08-03', '🛒 Продукты', 10000),
    ex('2026-08-20', '🛒 Продукты', 5000), ex('2026-08-10', '🎁 Подарок', 4000),

    inc('2026-09-05', '💼 Зарплата', 100000), inc('2026-09-10', 'Перевод от друга', 50000),
    ex('2026-09-01', '🏠 Аренда', 30000), ex('2026-09-04', '🛒 Продукты', 12000),
    ex('2026-09-18', '🛒 Продукты', 8000), ex('2026-09-25', '🏦 Вклад', 20000),

    inc('2026-10-05', '💼 Зарплата', 100000),
    ex('2026-10-01', '🏠 Аренда', 30000), ex('2026-10-03', '🛒 Продукты', 6000),
    ex('2026-10-12', '🛒 Продукты', 4000), ex('2026-10-02', 'Налоги', 3000),
    // вклады и долги: нет поля amount, в бытовые суммы не попадают
    { id: 'd1', type: 'deposit', date: '2026-09-25', initialAmount: 20000 },
    { id: 'd2', type: 'debt', date: '2026-10-01', initialAmount: 999999, remainingAmount: 500000 },
];

test('итоги: переводы не входят в доход, вклад/налоги — не в бытовые траты', () => {
    const M = computeMetrics(fixture(), { today: TODAY });
    assert.equal(M.totI, 300000);              // без 50000 «Перевод от друга»
    assert.equal(M.totE, 139000);              // без вклада 20000 и налогов 3000
    assert.equal(M.totExcluded, 23000);
    assert.equal(M.bal, 161000);
    near(M.sav, 161000 / 300000 * 100);        // 53.67%, а не 61.4% как при учёте перевода
    assert.equal(M.incomeTx.length, 3);
    assert.deepEqual(M.months, ['2026-08', '2026-09', '2026-10']);
});

test('пользовательское исключение категории убирает её из бытовых', () => {
    const M = computeMetrics(fixture(), { today: TODAY, userExcluded: ['🎁 Подарок'] });
    assert.equal(M.totE, 135000);
});

test('неполный месяц: тренд и категория сравниваются с тем же числом прошлого месяца', () => {
    const M = computeMetrics(fixture(), { today: TODAY });
    assert.equal(M.partialMonth, '2026-10');
    assert.deepEqual(M.closedMonths, ['2026-08', '2026-09']);
    // октябрь 40000 vs сентябрь до 15 числа 42000 (а не полный сентябрь 50000 → -20%)
    near(M.trend, (40000 - 42000) / 42000 * 100);
    // Продукты: 10000 vs 12000 (до 15-го), а не 20000 → -50%
    assert.equal(M.growth.cat, '🛒 Продукты');
    near(M.growth.delta, -16.6667, 0.01);
    assert.equal(M.growth.prevMonth, '2026-09');
});

test('когда месяц закончился — сравнение с полным прошлым месяцем', () => {
    const M = computeMetrics(fixture(), { today: '2026-11-02' });
    assert.equal(M.partialMonth, null);
    near(M.trend, (40000 - 50000) / 50000 * 100);
    assert.equal(M.closedMonths.length, 3);
});

test('стоимость жизни, обязательная нагрузка, лучший/худший месяц — только по завершённым месяцам', () => {
    const M = computeMetrics(fixture(), { today: TODAY });
    assert.equal(M.lifeCostAvg, (49000 + 50000) / 2); // не 140000/3
    const reg = Object.fromEntries(M.regularCats.map(r => [r.cat, r.avg]));
    assert.deepEqual(reg, { '🏠 Аренда': 30000, '🛒 Продукты': 17500 });
    near(M.mandatoryShare, 47500 / 49500 * 100, 0.001);
    assert.equal(M.worst[0], '2026-09');
    assert.equal(M.best[0], '2026-08');               // октябрь (40000, не завершён) не может быть «лучшим»
    assert.equal(M.forecast, null);                    // завершённых месяцев только 2
});

test('прогноз: три последних завершённых месяца, неполный не участвует', () => {
    const tx = [
        ex('2026-06-05', 'Еда', 1000), ex('2026-07-05', 'Еда', 1000),
        ex('2026-08-05', 'Еда', 1000), ex('2026-09-05', 'Еда', 1000),
        ex('2026-10-02', 'Еда', 10), // октябрь только начался
    ];
    const M = computeMetrics(tx, { today: '2026-10-03' });
    assert.equal(M.partialMonth, '2026-10');
    near(M.forecast.predicted, 1000);
    near(M.forecast.delta, 0);
});

test('mandatoryShare ограничен 100%, нулевая база не даёт NaN', () => {
    const M0 = computeMetrics([inc('2026-01-01', 'Зарплата', 100)], { today: '2026-03-01' });
    assert.equal(M0.lifeCostAvg, 0);
    assert.equal(M0.mandatoryShare, 0);
    assert.equal(M0.sav, 100);
    const M1 = computeMetrics([ex('2026-01-01', 'Еда', 100)], { today: '2026-03-01' });
    assert.equal(M1.sav, 0);                 // нет дохода — не NaN и не -Infinity
    assert.ok(Number.isFinite(M1.health));
});

test('регулярность: категория должна быть почти в каждом месяце (75%), а не в 60%', () => {
    const months = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05'];
    const exp = [
        ex('2026-01-05', 'Интернет', 500), ex('2026-02-05', 'Интернет', 500), ex('2026-03-05', 'Интернет', 500), ex('2026-04-05', 'Интернет', 500),
        ex('2026-01-09', 'Кино', 300), ex('2026-03-09', 'Кино', 300), ex('2026-05-09', 'Кино', 300),
    ];
    const r = findRegularExpenses(exp, months);
    assert.deepEqual(r.map(x => x.cat), ['Интернет']);   // «Кино» 3 из 5 — не регулярная
    assert.equal(r[0].avg, 500);
    assert.deepEqual(findRegularExpenses(exp, ['2026-01']), []);
});

test('частота покупок считается по реальному числу дней, а не months*30', () => {
    const tx = [ex('2026-01-01', 'Еда', 10), ex('2026-01-04', 'Еда', 10), ex('2026-01-07', 'Еда', 10), ex('2026-01-10', 'Еда', 10)];
    const M = computeMetrics(tx, { today: '2026-03-01' });
    assert.equal(M.tpd, '0.4'); // 4 покупки / 10 дней (раньше 4/30 = 0.1)
});

test('день недели в расходах: 2026-10-07 — среда', () => {
    const M = computeMetrics([ex('2026-10-07', 'Еда', 100), ex('2026-10-14', 'Еда', 50), ex('2026-10-08', 'Еда', 10)], { today: '2026-12-01' });
    assert.equal(M.hotD, 3);
    assert.equal(M.dW[3], 150);
    assert.equal(M.dWCount[4], 1);
});

test('нетипичная трата: разовая крупная находится, подтверждённая — нет, регулярная категория — нет', () => {
    const tx = [
        ...['2026-01-03', '2026-01-10', '2026-02-03', '2026-02-10', '2026-02-20', '2026-03-01', '2026-03-02']
            .map(d => ex(d, 'Еда', 1000)),
        ex('2026-02-15', '💻 Ноутбук', 50000, { id: 'big' }),
    ];
    const M = computeMetrics(tx, { today: '2026-12-01' });
    assert.equal(M.anomaly.id, 'big');
    assert.equal(M.anomaly.timesMedian, 50);
    assert.equal(M.anomaly.timesAvg, 7);
    assert.equal(computeMetrics(tx, { today: '2026-12-01', confirmed: ['big'] }).anomaly, null);
    assert.equal(findAnomaly(tx.slice(0, 5), { avg: 1, med: 1, p90: 1 }), null); // меньше 6 трат
});

test('финансовое здоровье: 0..100, непрерывно по норме сбережений', () => {
    assert.equal(scoreHealth(0, 100, 100), 45);
    assert.equal(scoreHealth(10, 100, 90), 60);
    assert.equal(scoreHealth(30, 100, 70), 90);
    near(scoreHealth(-0.1, 100, 100.1), 44.85);      // раньше при sav=0 → 65, при -0.1 → 24
    assert.equal(scoreHealth(-80, 100, 180), 0);
    assert.equal(scoreHealth(90, 100, 10), 100);
    assert.equal(scoreHealth(0, 0, 500), 30);          // нет доходов
    for (let s = -500; s <= 200; s += 7) {
        const v = scoreHealth(s, 100, 100 - s);
        assert.ok(v >= 0 && v <= 100);
    }
});

test('подпись KPI честная: «Бытовые траты»; DOM-идентификаторы на месте', () => {
    const src = readFileSync(new URL('../src/Analyticsinsights.js', import.meta.url), 'utf8');
    assert.match(src, /lbl: 'Бытовые траты'/);
    for (const id of ['bi-insights', 'bi-kpi-row', 'bi-health', 'bi-cards', 'bi-alerts'])
        assert.ok(src.includes(id), id);
});
