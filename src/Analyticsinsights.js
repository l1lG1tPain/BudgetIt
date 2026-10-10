// ═══════════════════════════════════════════════════════════════
// Analyticsinsights.js — Живая аналитика BudgetIt v4
// Инсайты рассчитаны на весь период бюджета
// Вклады, долги, финансовые и служебные категории
// НЕ смешиваются с бытовыми расходами
// Показываем до 10 инсайтов
// ═══════════════════════════════════════════════════════════════

let _bm = null;

import { computeMetrics, sumAmount, num, weekdayOf, localToday } from './utils/insightsMath.js';
import { calcRunway, calcSafePerDay, calcPaydayWeek, calcWeekdayWeekend, calcHabits, findSubscriptions } from './utils/insightsExtra.js';
import { balanceDaily } from './analytics/stats.js';
import { makePeriod } from './analytics/period.js';

// Регэксп «финансовых» категорий и список системных исключений — единый, в utils/insightsMath.js

const USER_EXCLUDED_CATS_KEY = 'budgetit:excluded_anomaly_cats';
const USER_CONFIRMED_ANOMALY_KEY = 'budgetit:confirmed_anomalies';

// ──────────────────────────────────────────────────────────────
// Минимальный порог данных для аналитики
// Нужно хотя бы одно из двух:
//   — 10+ транзакций (любого типа)
//   — 7+ уникальных дней с транзакциями
// ──────────────────────────────────────────────────────────────
const MIN_TX_COUNT  = 10;
const MIN_DAY_COUNT = 7;

function _checkDataSufficiency(allTx) {
    const txCount = allTx.length;

    const daysSet = new Set();
    allTx.forEach(t => {
        if (t.date) daysSet.add(String(t.date).slice(0, 10));
    });
    const dayCount = daysSet.size;

    const enough = txCount >= MIN_TX_COUNT || dayCount >= MIN_DAY_COUNT;

    // Чего не хватает (для прогресс-подсказки)
    const missingTx   = Math.max(0, MIN_TX_COUNT  - txCount);
    const missingDays = Math.max(0, MIN_DAY_COUNT - dayCount);

    return { enough, txCount, dayCount, missingTx, missingDays };
}

// Прячем / показываем секции графиков
function _setChartSectionsVisible(visible) {
    const scroll = document.querySelector('#analytics-page .analytics-scroll');
    if (!scroll) return;
    scroll.querySelectorAll('section').forEach(sec => {
        sec.style.display = visible ? '' : 'none';
    });
}

// Показать онбординг-заглушку (создаём / обновляем #bi-onboarding)
function _renderOnboarding(info) {
    let ob = document.getElementById('bi-onboarding');
    if (!ob) {
        ob = document.createElement('div');
        ob.id = 'bi-onboarding';
        // Вставляем прямо перед #bi-insights, чтобы было сверху страницы
        const ins = document.getElementById('bi-insights');
        if (ins && ins.parentNode) {
            ins.parentNode.insertBefore(ob, ins);
        }
    }

    const { txCount, dayCount, missingTx, missingDays } = info;

    // Прогресс по каждому критерию (0–100)
    const pTx   = Math.min(100, Math.round((txCount  / MIN_TX_COUNT)  * 100));
    const pDays = Math.min(100, Math.round((dayCount  / MIN_DAY_COUNT) * 100));

    // Подсказка: какой критерий ближе к выполнению
    let hint = '';
    if (missingTx <= missingDays) {
        hint = `Добавь ещё <b>${missingTx} транз.</b> — и аналитика заработает`;
    } else {
        hint = `Веди учёт ещё <b>${missingDays} дн.</b> — и аналитика заработает`;
    }

    ob.innerHTML = `
      <div class="bi-ob-wrap">

        <div class="bi-ob-shark">🦈</div>

        <h2 class="bi-ob-title">Аналитика почти готова</h2>
        <p class="bi-ob-sub">
          Акула копит данные — пока маловато для умных инсайтов.<br>
          Добавляй транзакции, и она всё посчитает!
        </p>

        <div class="bi-ob-progress-block">
          <div class="bi-ob-prog-row">
            <span class="bi-ob-prog-lbl">💳 Транзакции</span>
            <span class="bi-ob-prog-count">${txCount} / ${MIN_TX_COUNT}</span>
          </div>
          <div class="bi-ob-track">
            <div class="bi-ob-fill" style="width:${pTx}%;background:#6366f1"></div>
          </div>

          <div class="bi-ob-prog-row" style="margin-top:10px">
            <span class="bi-ob-prog-lbl">📅 Дней с записями</span>
            <span class="bi-ob-prog-count">${dayCount} / ${MIN_DAY_COUNT}</span>
          </div>
          <div class="bi-ob-track">
            <div class="bi-ob-fill" style="width:${pDays}%;background:#10b981"></div>
          </div>
        </div>

        <p class="bi-ob-hint">${hint}</p>

        <div class="bi-ob-features">
          <div class="bi-ob-feat"><span>🍩</span><span>Расходы по категориям</span></div>
          <div class="bi-ob-feat"><span>📊</span><span>Доходы vs Расходы</span></div>
          <div class="bi-ob-feat"><span>💰</span><span>Финансовое здоровье</span></div>
          <div class="bi-ob-feat"><span>🔮</span><span>Прогноз на следующий месяц</span></div>
          <div class="bi-ob-feat"><span>⚠️</span><span>Умные алерты и инсайты</span></div>
          <div class="bi-ob-feat"><span>📉</span><span>Динамика баланса</span></div>
        </div>

      </div>
    `;

    ob.style.display = '';
}

function _hideOnboarding() {
    const ob = document.getElementById('bi-onboarding');
    if (ob) ob.style.display = 'none';
}

// ──────────────────────────────────────────────────────────────
// Работа с пользовательскими исключениями
// ──────────────────────────────────────────────────────────────
function _getUserExcludedCats() {
    try {
        return JSON.parse(localStorage.getItem(USER_EXCLUDED_CATS_KEY) || '[]');
    } catch {
        return [];
    }
}

function _addUserExcludedCat(cat) {
    if (!cat) return;
    const list = _getUserExcludedCats();
    if (!list.includes(cat)) {
        list.push(cat);
        localStorage.setItem(USER_EXCLUDED_CATS_KEY, JSON.stringify(list));
    }
}

function _getConfirmedAnomalies() {
    try {
        return JSON.parse(localStorage.getItem(USER_CONFIRMED_ANOMALY_KEY) || '[]');
    } catch {
        return [];
    }
}

function _confirmAnomaly(txId) {
    if (!txId) return;
    const list = _getConfirmedAnomalies();
    if (!list.includes(txId)) {
        list.push(txId);
        localStorage.setItem(USER_CONFIRMED_ANOMALY_KEY, JSON.stringify(list));
    }
}

// ──────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────
export function initAnalyticsInsights(budgetManager) {
    if (!budgetManager) return;
    _bm = budgetManager;

    _injectHTML();

    window.addEventListener('themechange', () => _render());
    window.addEventListener('budgetit:region-changed', () => _render());

    document.addEventListener('click', e => {
        if (e.target.closest('[data-page="analytics-page"]')) {
            setTimeout(_render, 80);
        }
    });

    window.addEventListener('budgetit:analytics-open', () => {
        _render();
    });

    window.addEventListener('budgetit:page-open', (e) => {
        if (e.detail && e.detail.id === 'analytics-page') {
            _render();
        }
    });

    _render();
}

export function refreshAnalyticsInsights(budgetManager) {
    if (budgetManager) _bm = budgetManager;
    _render();
}

// ──────────────────────────────────────────────────────────────
// HTML
// ──────────────────────────────────────────────────────────────
function _injectHTML() {
    if (document.getElementById('bi-insights')) return;

    const page = document.getElementById('analytics-page');
    const scrollArea = page?.querySelector('.analytics-scroll');
    if (!scrollArea) return;

    const block = document.createElement('div');
    block.id = 'bi-insights';
    block.innerHTML = `
      <div class="bi-kpi-row" id="bi-kpi-row"></div>

      <div class="bi-health" id="bi-health" style="display:none">
        <div class="bi-health-top">
          <span class="bi-health-lbl">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="vertical-align:-2px;margin-right:5px">
              <path d="M12 21C12 21 3 15.5 3 9.5C3 7 5 5 7.5 5C9.24 5 10.91 5.94 12 7.09C13.09 5.94 14.76 5 16.5 5C19 5 21 7 21 9.5C21 15.5 12 21 12 21Z" fill="currentColor" opacity="0.25"/>
              <path d="M12 21C12 21 3 15.5 3 9.5C3 7 5 5 7.5 5C9.24 5 10.91 5.94 12 7.09C13.09 5.94 14.76 5 16.5 5C19 5 21 7 21 9.5C21 15.5 12 21 12 21Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
              <path d="M7 12H9.5L11 10L13 14L14.5 12H17" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/>
            </svg>
            Финансовое здоровье
          </span>
          <span class="bi-health-score" id="bi-health-score"></span>
        </div>
        <div class="bi-health-track">
          <div class="bi-health-fill" id="bi-health-fill"></div>
        </div>
        <div class="bi-health-hint" id="bi-health-hint"></div>
      </div>

      <div class="bi-cards" id="bi-cards"></div>
      <div id="bi-alerts"></div>
      <p class="bi-period-note">✦ Инсайты рассчитаны за весь период бюджета</p>
    `;

    scrollArea.insertAdjacentElement('afterbegin', block);
    _addSubtitles();
}

function _addSubtitles() {
    // подписи привязаны к id графика (а не к порядку секций — порядок менялся)
    const subs = {
        expensesByCategoryChart   : 'Что занимает больше всего денег',
        incomeVsExpensesChart     : 'Соотношение за выбранный период',
        monthlyExpensesChart      : 'Помесячная динамика доходов и расходов',
        topExpensesChart          : 'Топ трат по конкретным позициям',
        balanceDynamicsChart      : 'Как менялся остаток со временем',
        categoriesByDescendingChart: 'Все категории расходов по сумме',
        categoryHistoryChart      : 'Тренд выбранной категории по месяцам',
        spendingByWeekdayChart    : 'В какой день недели тратишь больше',
        incomeBySourceChart       : 'Доходы по источникам',
        annualSummaryChart        : 'Полная картина: доходы, расходы, баланс',
    };

    document.querySelectorAll('#analytics-page .analytics-scroll section').forEach(sec => {
        const sub = subs[sec.dataset.chart || sec.querySelector('canvas')?.id];
        if (!sub || sec.querySelector('.bi-sec-sub')) return;
        const h4 = sec.querySelector('h4');
        if (!h4) return;

        const p = document.createElement('p');
        p.className = 'bi-sec-sub';
        p.textContent = sub;
        h4.insertAdjacentElement('afterend', p);
    });
}

// ──────────────────────────────────────────────────────────────
// Main render
// ──────────────────────────────────────────────────────────────
function _render() {
    const allTx = _bm?.getCurrentBudget()?.transactions ?? [];

    // ── Проверяем достаточность данных ────────────────────────
    const sufficiency = _checkDataSufficiency(allTx);

    if (!sufficiency.enough) {
        // Показываем онбординг, прячем инсайты и графики
        _renderOnboarding(sufficiency);
        _setChartSectionsVisible(false);

        const ins = _el('bi-insights');
        if (ins) ins.style.display = 'none';
        return;
    }

    // Данных достаточно — прячем онбординг, показываем всё
    _hideOnboarding();
    _setChartSectionsVisible(true);
    const ins = _el('bi-insights');
    if (ins) ins.style.display = '';

    if (!allTx.length) {
        _el('bi-kpi-row').innerHTML = '<span class="bi-empty">Добавь транзакции — увидишь аналитику 🦈</span>';
        _el('bi-cards').innerHTML = '';
        _el('bi-alerts').innerHTML = '';
        _el('bi-health').style.display = 'none';
        return;
    }

    const depositTx = allTx.filter(t => t.type === 'deposit');
    const debtTx = allTx.filter(t => t.type === 'debt');

    const M = computeMetrics(allTx, {
        today: localToday(),
        userExcluded: _getUserExcludedCats(),
        confirmed: _getConfirmedAnomalies(),
    });
    const {
        incomeTx, realExp, totI, totE, totExcluded, bal, sav,
        months, closedMonths, partialMonth, lastM, trend, freqTrend, growth,
        dW, hotD, busyD, pricey, avg, med, tpd,
        lifeCostAvg, regularCats, mandatoryShare, worst, best,
        cats, incCats, anomaly, leaking, forecast,
    } = M;

    const DN = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

    _kpi([
        {
            ico: '💸',
            lbl: 'Бытовые траты',
            val: _fk(totE),
            sub: `${realExp.length} бытовых операций`
        },
        {
            ico: '💚',
            lbl: 'Поступления',
            val: _fk(totI),
            sub: `${incomeTx.length} поступлений без переводов`
        },
        {
            ico: '🏦',
            lbl: 'Остаток',
            val: _fk(bal),
            sub: bal >= 0 ? 'В плюсе' : 'Дефицит',
            neg: bal < 0
        },
        {
            ico: '📊',
            lbl: 'Сбережения',
            val: `${sav.toFixed(1)}%`,
            sub: sav >= 20 ? 'Хороший темп' : sav >= 10 ? 'Нормально' : 'Нужно подтянуть'
        },
        {
            ico: '🧾',
            lbl: 'Средний чек',
            val: _fk(avg),
            sub: `медиана ${_f(med)}`
        },
        {
            ico: '📅',
            lbl: 'Активных мес.',
            val: String(months.length),
            sub: 'в аналитике'
        },
    ]);

    const cards = [];

    // 1
    if (cats[0]) {
        const [c, a] = cats[0];
        const p = totE > 0 ? (a / totE * 100).toFixed(0) : 0;

        const catItems = realExp
            .filter(t => (t.category || '🗿 Прочее') === c)
            .sort((a1, b1) => num(b1.amount) - num(a1.amount))
            .slice(0, 3);

        const itemList = catItems.map(t => {
            const name = t.products?.[0]?.name || t.description || c;
            const short = name.length > 18 ? name.slice(0, 17) + '…' : name;
            return `<div class="bi-pd"><span>${short}</span><span class="bi-pd-v">${_f(t.amount)}</span></div>`;
        }).join('');

        cards.push({
            e: '🔥',
            t: 'Главная статья расходов',
            b: `<b>${c}</b> — ${p}% бытовых расходов (${_f(a)})${itemList ? '<br>' + itemList : ''}`,
            badge: `${p}%`,
            col: '#f43f5e',
            priority: 100
        });
    }

    // 2
    if (regularCats.length > 0) {
        const total = regularCats.reduce((s, r) => s + r.avg, 0);
        const rows = regularCats.slice(0, 4).map(r =>
            `<div class="bi-pd"><span>${r.cat}</span><span class="bi-pd-v">~${_f(r.avg)}/мес</span></div>`
        ).join('');

        cards.push({
            e: '🔄',
            t: 'Регулярные расходы',
            b: `Повторяются почти каждый месяц:<br>${rows}<br><span style="opacity:.6;font-size:11px">Итого ~${_f(total)}/мес обязательных трат</span>`,
            wide: true,
            col: '#06b6d4',
            priority: 99
        });
    }

    // 3
    if (sav < 10 && totI > 0 && (regularCats[0] || cats[0])) {
        const baseCat = regularCats[0] ? regularCats[0].cat : cats[0][0];
        const baseMonthly = regularCats[0] ? regularCats[0].avg : (cats[0][1] / Math.max(months.length, 1));
        const save20pct = baseMonthly * 0.2;

        cards.push({
            e: '💡',
            t: 'Совет по экономии',
            tip: true,
            b: `Сбережения ${sav.toFixed(1)}%. Если сократить <b>${baseCat}</b> на 20%, можно высвободить ~<b>${_f(save20pct)}</b>/мес`,
            col: '#f59e0b',
            priority: 98
        });
    } else if (sav >= 30) {
        cards.push({
            e: '🚀',
            t: 'Финансовый гений',
            tip: true,
            b: `Сбережения <b>${sav.toFixed(1)}%</b> — очень сильный результат`,
            col: '#10b981',
            priority: 98
        });
    } else if (sav >= 10) {
        cards.push({
            e: '👍',
            t: 'На правильном пути',
            tip: true,
            b: sav >= 20
                ? `Сбережений ${sav.toFixed(1)}% — выше комфортных 20%. Так держать`
                : `Сбережений ${sav.toFixed(1)}%. До комфортных 20% не хватает <b>${_f(Math.max(0, totI * 0.2 - bal))}</b>`,
            col: '#22d3ee',
            priority: 97
        });
    }

    // 4
    if (anomaly) {
        cards.push({
            e: '🔎',
            t: 'Нетипичная трата',
            b: `<b>${anomaly.category}</b> — ${_f(anomaly.amount)}<br>
<span style="opacity:.72;font-size:11px">${_fd(anomaly.date)} · выше среднего в ${anomaly.timesAvg}x и выше медианы в ${anomaly.timesMedian}x</span><br>
<div class="bi-anomaly-actions" data-id="${anomaly.id}" data-cat="${anomaly.category}" style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
  <button class="bi-action-btn bi-action-ok" data-action="ok" data-id="${anomaly.id}">✓ Норм, это разовая</button>
  <button class="bi-action-btn bi-action-fin" data-action="exclude" data-id="${anomaly.id}" data-cat="${anomaly.category}">💸 Исключить из анализа</button>
</div>`,
            badge: 'аномалия',
            col: '#f59e0b',
            interactive: true,
            priority: 96
        });
    }

    // 5
    if (months.length > 0) {
        const mb = lastM.i - lastM.e;
        const plus = mb >= 0;

        cards.push({
            e: plus ? '✅' : '⚠️',
            t: `Итог ${_mn(months.at(-1))}`,
            b: plus
                ? `Доходов было больше, чем бытовых расходов. Осталось <b>${_f(mb)}</b>`
                : `Бытовые расходы превысили доходы на <b style="color:#f43f5e">${_f(Math.abs(mb))}</b>`,
            badge: `${plus ? '+' : ''}${_f(mb)}`,
            col: plus ? '#10b981' : '#f43f5e',
            priority: 95
        });
    }

    // 6
    if (growth) {
        cards.push({
            e: growth.delta > 0 ? '📈' : '📉',
            t: 'Самая изменившаяся категория',
            b: `<b>${growth.cat}</b><br><span style="opacity:.72;font-size:11px">${_mn(growth.prevMonth)} → ${_mn(growth.lastMonth)}</span>${partialMonth ? ' (на то же число)' : ''}<br>${growth.delta > 0 ? 'Рост' : 'Снижение'} на <b>${Math.abs(growth.delta).toFixed(1)}%</b>`,
            badge: `${growth.delta > 0 ? '+' : ''}${growth.delta.toFixed(1)}%`,
            col: growth.delta > 0 ? '#f43f5e' : '#22d3ee',
            priority: 94
        });
    } else if (trend !== null) {
        const up = trend > 0;
        cards.push({
            e: up ? '📈' : '📉',
            t: 'Тренд расходов',
            b: `Бытовые расходы ${up
                ? '<b style="color:#f43f5e">выросли</b>'
                : '<b style="color:#22d3ee">снизились</b>'} на ${Math.abs(trend).toFixed(1)}% vs ${_mn(M.prevKey)}${partialMonth ? ' (на то же число)' : ''}`,
            badge: `${up ? '+' : ''}${trend.toFixed(1)}%`,
            col: up ? '#f43f5e' : '#22d3ee',
            priority: 93
        });
    }

    // 7
    if (leaking) {
        cards.push({
            e: '🫠',
            t: 'Категория-утечка',
            b: `<b>${leaking.cat}</b> — ${leaking.count} покупок на ${_f(leaking.total)}<br><span style="opacity:.72;font-size:11px">Средний чек ${_f(leaking.avg)} · частые мелкие траты</span>`,
            badge: `${leaking.count} шт.`,
            col: '#8b5cf6',
            priority: 92
        });
    }

    // 8
    if (lifeCostAvg > 0) {
        cards.push({
            e: '🏠',
            t: 'Средняя стоимость жизни',
            b: `В среднем тебе нужно <b>${_f(lifeCostAvg)}</b> в месяц на бытовые траты`,
            badge: `~${_f(lifeCostAvg)}/мес`,
            col: '#10b981',
            priority: 91
        });
    }

    // 9
    if (mandatoryShare > 0) {
        cards.push({
            e: '🧱',
            t: 'Обязательная нагрузка',
            b: `Регулярные траты занимают около <b>${mandatoryShare.toFixed(0)}%</b> среднемесячных расходов`,
            badge: `${mandatoryShare.toFixed(0)}%`,
            col: '#06b6d4',
            priority: 90
        });
    }

    // 10
    const maxTx = realExp.length
        ? [...realExp].sort((a, b) => num(b.amount) - num(a.amount))[0]
        : null;

    if (maxTx) {
        const name = maxTx.products?.[0]?.name || maxTx.description || maxTx.category || '—';
        cards.push({
            e: '💰',
            t: 'Крупнейший платёж',
            b: `<b>${name.length > 24 ? name.slice(0, 23) + '…' : name}</b><br><span style="opacity:.6;font-size:11px">${_fd(maxTx.date || '')} · ${maxTx.category || ''}</span>`,
            badge: _f(maxTx.amount),
            col: '#8b5cf6',
            priority: 89
        });
    }

    // Резервные, если чего-то не хватило
    if (dW[hotD] > 0) {
        const hotDayTx = realExp.filter(t => weekdayOf(t.date) === hotD);
        const hotCatMap = {};

        hotDayTx.forEach(t => {
            const c = t.category || '🗿 Прочее';
            hotCatMap[c] = (hotCatMap[c] || 0) + (t.amount || 0);
        });

        const topHotCat = Object.entries(hotCatMap).sort((a, b) => b[1] - a[1])[0];

        cards.push({
            e: '📆',
            t: 'Горячий день',
            b: `В <b>${DN[hotD]}</b> тратишь больше всего${topHotCat ? `. Главная статья — <b>${topHotCat[0]}</b>` : ''}`,
            badge: _f(dW[hotD]),
            col: '#f59e0b',
            priority: 60
        });
    }

    if (+tpd > 0) {
        const lastMKey = months.at(-1);

        let tpdNote = '';
        if (+tpd <= 1) {
            tpdNote = 'Покупки происходят редко — в среднем раз в день или реже';
        } else if (+tpd <= 2) {
            tpdNote = `Умеренная активность — чаще всего по ${DN[busyD]}`;
        } else if (+tpd <= 4) {
            tpdNote = `Активный ритм трат — особенно по ${DN[busyD]}`;
        } else {
            tpdNote = `Очень высокая частота — почти ${Math.round(+tpd)} покупки в день`;
        }

        let freqNote = '';
        if (freqTrend !== null && Math.abs(freqTrend) >= 10) {
            freqNote = freqTrend > 0
                ? `<br><span style="opacity:.6;font-size:11px">📈 В ${_mn(lastMKey)} покупок стало на ${freqTrend}% больше</span>`
                : `<br><span style="opacity:.6;font-size:11px">📉 В ${_mn(lastMKey)} покупок стало на ${Math.abs(freqTrend)}% меньше</span>`;
        }

        cards.push({
            e: '🔁',
            t: 'Активность покупок',
            b: `${tpdNote}${freqNote}`,
            badge: `${tpd}/день`,
            col: '#6366f1',
            priority: 58
        });
    }

    if (pricey) {
        const priceyTx = realExp
            .filter(t => t.date?.slice(0, 10) === pricey[0])
            .sort((a, b) => num(b.amount) - num(a.amount))
            .slice(0, 3);

        const items = priceyTx.map(t => {
            const n = t.products?.[0]?.name || t.category || '—';
            return `<b>${n.length > 16 ? n.slice(0, 15) + '…' : n}</b> ${_f(t.amount)} <span style="opacity:.6">${_fd(t.date || '')}</span>`;
        }).join('<br>');

        cards.push({
            e: '💣',
            t: 'Рекордный день',
            b: `<b>${_fd(pricey[0])}</b> — самый дорогой день${items ? '<br>' + items : ''}`,
            badge: _f(pricey[1]),
            col: '#a78bfa',
            priority: 57
        });
    }

    if (worst) {
        const [ym, d] = worst;
        cards.push({
            e: '😬',
            t: 'Тяжелейший месяц',
            b: `<b>${_mn(ym)}</b> — максимум бытовых расходов`,
            badge: _f(d.e),
            col: '#fb7185',
            priority: 56
        });
    }

    if (best && closedMonths.length > 1) {
        const [ym, d] = best;
        cards.push({
            e: '🌟',
            t: 'Лучший месяц',
            b: `<b>${_mn(ym)}</b> — минимум бытовых расходов`,
            badge: _f(d.e),
            col: '#10b981',
            priority: 55
        });
    }

    if (forecast) {
        const sign = forecast.delta >= 0 ? '+' : '';
        cards.push({
            e: '🔮',
            t: 'Прогноз расходов',
            b: `На следующий месяц ожидается ~<b>${_f(forecast.predicted)}</b> бытовых расходов (тренд ${sign}${forecast.delta.toFixed(0)}% к среднему)`,
            badge: `~${_f(forecast.predicted)}`,
            col: '#8b5cf6',
            priority: 54
        });
    }

    if (incCats.length >= 2) {
        const rows = incCats.slice(0, 4).map(([c, a]) => {
            const p = totI > 0 ? (a / totI * 100).toFixed(0) : 0;
            return `<div class="bi-pd"><span>${c}</span><span class="bi-pd-v">${p}% · ${_f(a)}</span></div>`;
        }).join('');

        cards.push({
            e: '💼',
            t: 'Источники доходов',
            b: rows,
            wide: true,
            col: '#10b981',
            priority: 53
        });
    }

    // ── Новые карточки: остаток, привычки, подписки ───────────
    try {
        const today = localToday();
        const available = balanceDaily(allTx, makePeriod({ keys: [today.slice(0, 7)] }), null).end; // то же число, что «Доступно» на главной

        const rw = calcRunway(available, realExp, today);
        if (rw) {
            const [, mm, dd] = rw.until.split('-');
            cards.push({
                e: '🧭', t: 'Хватит на',
                b: rw.empty
                    ? `Остаток исчерпан, а в среднем уходит <b>${_f(rw.perDay)}</b> в день`
                    : `При текущем темпе (<b>${_f(rw.perDay)}</b> в день за 2 недели) остатка <b>${_f(available)}</b> хватит до <b>${dd}.${mm}</b>`,
                badge: rw.empty ? '0 дн.' : `${rw.days} дн.`,
                col: rw.days < 7 ? '#ef4444' : rw.days < 14 ? '#f59e0b' : '#10b981',
                priority: 99
            });
        }

        const sp = calcSafePerDay(available, realExp, today);
        cards.push({
            e: '🎯', t: 'Можно тратить в день',
            b: sp.over
                ? `Остаток этого месяца исчерпан — до конца месяца <b>${sp.left}</b> дн. без бюджета`
                : `Чтобы дотянуть до конца месяца (<b>${sp.left}</b> дн.), можно тратить <b>${_f(sp.perDay)}</b> в день.<br><span style="opacity:.6;font-size:11px">Сегодня потрачено ${_f(sp.todaySpent)}</span>`,
            badge: sp.over ? '0' : _f(sp.perDay),
            col: sp.over ? '#ef4444' : sp.todaySpent > sp.perDay ? '#f59e0b' : '#10b981',
            priority: 98
        });

        const pw = calcPaydayWeek(incomeTx, realExp, today);
        if (pw && pw.share > pw.even * 1.25) {
            cards.push({
                e: '💸', t: 'Неделя после поступления',
                b: `В первые 7 дней после зарплаты уходит около <b>${pw.share.toFixed(0)}%</b> трат цикла — при равномерном темпе было бы ~${pw.even.toFixed(0)}%<br><span style="opacity:.6;font-size:11px">Среднее по ${pw.cycles} последним циклам</span>`,
                badge: `${pw.share.toFixed(0)}%`, col: '#f59e0b', priority: 80
            });
        }

        const ww = calcWeekdayWeekend(realExp, today);
        if (ww && ww.ratio && Math.abs(ww.ratio - 1) >= 0.15) {
            const more = ww.ratio > 1;
            cards.push({
                e: '📅', t: 'Будни и выходные',
                b: `В выходные ты тратишь в среднем <b>${_f(ww.wePer)}</b> в день, в будни — <b>${_f(ww.wdPer)}</b>: на <b>${Math.abs(Math.round((ww.ratio - 1) * 100))}%</b> ${more ? 'больше' : 'меньше'} по выходным`,
                badge: `${more ? '+' : '−'}${Math.abs(Math.round((ww.ratio - 1) * 100))}%`, col: '#06b6d4', priority: 79
            });
        }

        const hb = calcHabits(realExp, today);
        if (hb.length) {
            const rows = hb.map(h => `<div class="bi-pd"><span>${h.cat}</span><span class="bi-pd-v">${_f(h.yearly)}/год · ~${_f(h.perMonth)}/мес</span></div>`).join('');
            cards.push({
                e: '🔁', t: 'Цена привычек за год',
                b: `${rows}<span style="opacity:.6;font-size:11px">По последним 90 дням, умножено на год</span>`,
                wide: true, col: '#ec4899', priority: 78
            });
        }

        const subs = findSubscriptions(realExp, today);
        if (subs.length) {
            const sum = subs.reduce((s2, x) => s2 + x.amount, 0);
            const rows = subs.slice(0, 4).map(x => `<div class="bi-pd"><span>${x.name.length > 24 ? x.name.slice(0, 23) + '…' : x.name}</span><span class="bi-pd-v">${_f(x.amount)}/мес</span></div>`).join('');
            cards.push({
                e: '🔔', t: 'Подписки',
                b: `${rows}<span style="opacity:.6;font-size:11px">Всего ~${_f(sum)} в месяц, ~${_f(sum * 12)} в год</span>`,
                badge: `${subs.length}`, wide: true, col: '#8b5cf6', priority: 77
            });
        }
    } catch (e) { console.warn('[insights] extra cards', e); }

    _cards(_finalizeCards(cards));
    _health(M.health);

    const al = [];

    if (totI > 0 && totE > totI * 1.05) {
        al.push({
            ico: '🚨',
            txt: `Бытовые расходы превышают доходы на <b>${_f(totE - totI)}</b>`,
            t: 'danger'
        });
    }

    if (cats[0] && totE > 0 && cats[0][1] / totE > 0.5) {
        al.push({
            ico: '🎯',
            txt: `«${cats[0][0]}» занимает больше 50% бытовых расходов`,
            t: 'warn'
        });
    }

    if (!incomeTx.length && realExp.length) {
        al.push({
            ico: '📥',
            txt: 'Нет поступлений. Добавь поступления, чтобы инсайты были точнее',
            t: 'info'
        });
    }

    if (realExp.length > 0 && realExp.length < 5) {
        al.push({
            ico: '💬',
            txt: 'Пока мало бытовых расходов для уверенной аналитики',
            t: 'info'
        });
    }

    if (totExcluded > 0) {
        al.push({
            ico: '🚫',
            txt: `Исключено из аналитики: <b>${_f(totExcluded)}</b>`,
            t: 'info'
        });
    }

    if (depositTx.length > 0 || debtTx.length > 0) {
        al.push({
            ico: '🧩',
            txt: 'Вклады и долги показываются отдельно и не увеличивают бытовые расходы',
            t: 'info'
        });
    }

    _alerts(al);
}

function _finalizeCards(cards) {
    return cards
        .map(card => ({
            priority: 50,
            ...card
        }))
        .sort((a, b) => b.priority - a.priority)
        .slice(0, 16);
}

// ──────────────────────────────────────────────────────────────
// Render helpers
// ──────────────────────────────────────────────────────────────
function _kpi(items) {
    const row = _el('bi-kpi-row');
    if (!row) return;

    row.innerHTML = items.map(it => `
      <div class="bi-kpi ${it.neg ? 'bi-kpi--neg' : ''}">
        <div class="bi-kpi-icon-wrap">
          <span class="bi-kpi-i">${it.ico}</span>
        </div>
        <span class="bi-kpi-v">${it.val}</span>
        <span class="bi-kpi-l">${it.lbl}</span>
        <span class="bi-kpi-s">${it.sub}</span>
      </div>
    `).join('');
}

function _cards(list) {
    const g = _el('bi-cards');
    if (!g) return;

    g.innerHTML = list.map(c => `
      <div class="bi-card ${c.wide ? 'bi-card--w' : ''} ${c.tip ? 'bi-card--tip' : ''} ${c.interactive ? 'bi-card--interactive' : ''}" style="--ac:${c.col || '#6366f1'}">
        <div class="bi-card-hd">
          <div class="bi-card-e-wrap">
            <span class="bi-card-e">${c.e}</span>
          </div>
          <span class="bi-card-t">${c.t}</span>
          ${c.badge ? `<span class="bi-card-b">${c.badge}</span>` : ''}
        </div>
        <div class="bi-card-bd">${c.b}</div>
      </div>
    `).join('');

    g.querySelectorAll('.bi-action-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const action = btn.dataset.action;
            const txId = btn.dataset.id;
            const cat = btn.dataset.cat;

            if (action === 'ok') {
                _confirmAnomaly(txId);
                _showActionFeedback(
                    btn.closest('.bi-card'),
                    '✓ Понял, это разовая трата. Больше не будем её поднимать',
                    '#10b981'
                );
            } else if (action === 'exclude') {
                _addUserExcludedCat(cat);
                _showActionFeedback(
                    btn.closest('.bi-card'),
                    `✓ Категория «${cat}» исключена из анализа`,
                    '#06b6d4'
                );
            }

            setTimeout(() => _render(), 1500);
        });
    });
}

function _showActionFeedback(card, msg, color) {
    if (!card) return;

    card.style.transition = 'opacity .3s';
    const bd = card.querySelector('.bi-card-bd');
    if (bd) {
        bd.innerHTML = `<span style="color:${color};font-size:12px">${msg}</span>`;
    }

    const acts = card.querySelector('.bi-anomaly-actions');
    if (acts) acts.remove();
}

function _health(score) {
    const w = _el('bi-health');
    const f = _el('bi-health-fill');
    const s = _el('bi-health-score');
    const h = _el('bi-health-hint');
    if (!w) return;

    w.style.display = 'block';

    const p = Math.min(100, Math.max(0, score));
    const col = p >= 70 ? '#10b981' : p >= 40 ? '#f59e0b' : '#f43f5e';
    const txt = p >= 80 ? 'Отлично 🌟'
        : p >= 60 ? 'Хорошо 👍'
            : p >= 40 ? 'Норм 🤔'
                : p >= 20 ? 'Слабовато 😬'
                    : 'Тревога 🚨';

    const dsc = p >= 70
        ? 'Расходы под контролем, сбережения есть'
        : p >= 40
            ? 'Неплохо, но есть куда расти. Следи за главными категориями'
            : 'Расходы слишком тяжёлые или сбережений пока почти нет';

    // Сброс → reflow → анимация при каждом открытии
    f.style.transition = 'none';
    f.style.width = '0%';
    f.offsetHeight; // force reflow
    f.style.transition = '';
    requestAnimationFrame(() => {
        f.style.width = `${p}%`;
        f.style.background = col;
    });
    s.textContent = txt;
    s.style.color = col;
    h.textContent = dsc;
}

function _alerts(list) {
    const r = _el('bi-alerts');
    if (!r) return;

    if (!list.length) { r.innerHTML = ''; return; }

    r.innerHTML = list.map((a, i) => `
      <div class="bi-al bi-al--${a.t}" data-alert-idx="${i}">
        <span class="bi-al-i">${a.ico}</span>
        <span class="bi-al-txt">${a.txt}</span>
        ${a.t === 'info' ? `<button class="bi-al-dismiss" aria-label="Закрыть">✕</button>` : ''}
      </div>
    `).join('');

    r.querySelectorAll('.bi-al-dismiss').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const al = btn.closest('.bi-al');
            if (!al) return;
            al.style.transition = 'opacity 0.2s, transform 0.2s';
            al.style.opacity = '0';
            al.style.transform = 'translateX(8px)';
            setTimeout(() => al.remove(), 220);
        });
    });
}

// ──────────────────────────────────────────────────────────────
// Utils
// ──────────────────────────────────────────────────────────────
const _MN = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

const _el = id => document.getElementById(id);

const _mn = ym => {
    if (!ym) return '—';
    const [y, m] = ym.split('-');
    return `${_MN[+m - 1]} ${y}`;
};

function _fd(dateStr) {
    if (!dateStr) return '—';
    const raw = String(dateStr).slice(0, 10);
    const parts = raw.split('-');
    if (parts.length !== 3) return raw;
    const [y, m, d] = parts;
    return `${d}.${m}.${y.slice(-2)}`;
}

function _f(n) {
    const cur = { RU: 'руб', KZ: 'тенге', KG: 'сом' }[localStorage.getItem('region')] ?? 'сум';
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) + '\u00a0' + cur;
}

// компактный формат для узких KPI-плиток: 248 466 353 сум → 248,5 млн сум
function _fk(n) {
    const a = Math.abs(n || 0);
    if (a < 1e8) return _f(n);
    const cur = { RU: 'руб', KZ: 'тенге', KG: 'сом' }[localStorage.getItem('region')] ?? 'сум';
    const [v, u] = a >= 1e9 ? [n / 1e9, 'млрд'] : [n / 1e6, 'млн'];
    return v.toFixed(1).replace('.', ',') + '\u00a0' + u + '\u00a0' + cur;
}
