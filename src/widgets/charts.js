// ===============================
// Chart.js: аналитика BudgetIt — с кликом по подписям и фиксами списка
// ===============================
import { refreshAnalyticsInsights } from '../Analyticsinsights.js';
import {
    MONTHS_FULL, MONTHS_SHORT, makePeriod, allTime, monthPeriod, inPeriod, presetOf, fromPreset, anchorOf,
    toggleMonth, periodLabel, periodButtonLabel, periodSpan, savePeriod, loadPeriod, keyOf, keyYear, keyMonth
} from '../analytics/period.js';
import {
    baseTx, dataRange, availableYears, sumTx, monthlyTotals, comparison, categoryBreakdown, topTransactions,
    categoryDetail, balanceSeries, balanceDaily, summaryKeys, summaryRows, heroSeries, weekdayMon
} from '../analytics/stats.js';
import { isFinancialCategory } from '../utils/insightsMath.js';
import { setUiDeps, openPeriodSheet, openCategorySheet, renderTopList, renderSources, renderSummary } from '../analytics/ui.js';
// --- tiny-guard: если Chart.js не загрузился (офлайн / проблемы с CDN),
// просто отключаем аналитику, но приложение не ломаем
let chartsAvailable = true;

try {
    if (typeof Chart === 'undefined') {
        chartsAvailable = false;
        console.warn('[Charts] Chart.js не найден — аналитика отключена (возможно, офлайн).');
    }
} catch (e) {
    chartsAvailable = false;
    console.warn('[Charts] Ошибка при доступе к Chart.js — аналитика отключена.', e);
}

// --- глобальные настройки Chart.js ------------------------------
if (chartsAvailable) {
    Chart.defaults.maintainAspectRatio        = false;
    Chart.defaults.aspectRatio                = 2;
    Chart.defaults.animation.duration         = 600;
    Chart.defaults.animation.easing           = 'easeOutQuart';
    Chart.defaults.elements.bar.borderRadius  = 8;
    Chart.defaults.elements.bar.borderSkipped = false;
    Chart.defaults.elements.point.radius      = 0;
    Chart.defaults.elements.point.hoverRadius = 5;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.pointStyle    = 'circle';
    Chart.defaults.plugins.legend.labels.padding       = 16;
    Chart.defaults.plugins.legend.labels.font          = { size: 12 };
    Chart.defaults.font.family = "Manrope, system-ui, sans-serif";
    Chart.defaults.font.size   = 11;
    Chart.defaults.elements.bar.borderRadius = 6;
}

// «80 000 000» → «80 млн», «45 000» → «45 тыс»: короткие подписи значений на осях
function compactNumber(v) {
    const n = Number(v);
    if (!isFinite(n)) return v;
    const a = Math.abs(n);
    const f = x => String(Math.round(x * 10) / 10).replace('.', ',');
    if (a >= 1e9) return f(n / 1e9) + ' млрд';
    if (a >= 1e6) return f(n / 1e6) + ' млн';
    if (a >= 1e3) return f(n / 1e3) + ' тыс';
    return String(n);
}

// Единый вид осей по дизайну: подписи --muted, сетка --faint, значения коротко.
// Правим обычный объект конфига ДО создания графика (внутри Chart.js options — прокси).
function glassifyConfig(cfg) {
    const o = cfg?.options;
    if (!o) return cfg;
    const idx = o.indexAxis || 'x';
    const muted = getCssVar('--muted', '#8a93a6');
    const faint = getCssVar('--faint', 'rgba(255,255,255,0.08)');
    for (const [id, sc] of Object.entries(o.scales || {})) {
        if (!sc) continue;
        const axis = sc.axis || id[0];
        sc.ticks = sc.ticks || {};
        sc.ticks.color = muted;
        const fs = sc.ticks.font?.size;
        sc.ticks.font = { ...(sc.ticks.font || {}), size: fs && fs < 12 ? fs : 11 };
        if (sc.keepTicks) continue;
        const isCategory = sc.type === 'category' || axis === idx;
        if (!isCategory) {
            sc.ticks.callback = compactNumber;
            sc.ticks.maxTicksLimit = 5;
            sc.grid = { ...(sc.grid || {}), color: faint, drawTicks: false };
            sc.border = { ...(sc.border || {}), display: false };
        } else if (sc.ticks.autoSkip !== false) {
            sc.ticks.maxRotation = 0; sc.ticks.minRotation = 0;
            sc.ticks.autoSkip = true;
            sc.ticks.maxTicksLimit = sc.ticks.maxTicksLimit || 6;
        }
    }
    const lg = o.plugins?.legend?.labels;
    if (lg) lg.color = muted;
    return cfg;
}
if (chartsAvailable && !window.__glassChart) {
    const BaseChart = Chart;
    window.__glassChart = true;
    window.Chart = class GlassChart extends BaseChart {
        constructor(item, config) { super(item, glassifyConfig(config)); }
    };
}

function cssRgba(color, a) {
    try {
        const c = document.createElement('canvas'); c.width = c.height = 1;
        const x = c.getContext('2d', { willReadFrequently: true });
        x.clearRect(0, 0, 1, 1); x.fillStyle = color; x.fillRect(0, 0, 1, 1);
        const [r, g, b] = x.getImageData(0, 0, 1, 1).data;
        return `rgba(${r},${g},${b},${a})`;
    } catch (e) { return color; }
}

const CHART_DEFAULT_HEIGHT = 260;

function setCanvasHeight(canvas, pct = 0.6) {
    if (!canvas) return;
    const cssPx = Math.round(window.innerHeight * pct);
    canvas.style.height = cssPx + 'px';
    canvas.height       = cssPx * window.devicePixelRatio;
}


// ------------------------------------------------------------------
// 0)  Кэш транзакций и карта высот
// ------------------------------------------------------------------
/**
 * transactionsCache: Map с ключом:
 *  - если filterByMonth === true => `month:<MM>` (MM два символа) или 'month:all'
 *  - если filterByMonth === false => 'allmonths'
 */
const transactionsCache = new Map();

const HEIGHT_MAP = {
    expensesByCategoryChart    : 0.2,
    monthlyExpensesChart       : 0.3,
    incomeVsExpensesChart      : 0.1, // 👈 мини-бар-индикатор
    topExpensesChart           : 0.45,
    balanceDynamicsChart       : 0.3,
    categoriesByDescendingChart: 0.45,
    categoryHistoryChart       : 0.3,
    spendingByWeekdayChart     : 0.28,
    incomeBySourceChart        : 0.35,
    annualSummaryChart         : 0.4
};

function setAdaptiveCanvasHeight(canvas) {
    if (canvas?.id === 'expensesByCategoryChart') { canvas.style.height = '150px'; canvas.height = 150 * window.devicePixelRatio; return; }
    setCanvasHeight(canvas, HEIGHT_MAP[canvas?.id] ?? 0.3);
}

// ------------------------------------------------------------------
// Валютные утилиты + работа с CSS-переменными
// ------------------------------------------------------------------
function getCssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return v && v.trim() ? v.trim() : (fallback ?? '#ffffff');
}

function getCurrencyLabel() {
    const r = localStorage.getItem('region') || 'UZ';
    switch (r) {
        case 'RU': return 'руб';
        case 'KZ': return 'тенге';
        case 'KG': return 'сом';
        case 'UZ':
        default  : return 'сум';
    }
}
const withCurrency = n => `${formatNumber(n)} ${getCurrencyLabel()}`;

// тёплая/неоновая палитра для пончика расходов, но с широким спектром
function buildWarmExpensePalette(count) {
    const colors = [];
    if (count <= 0) return colors;

    const startHue   = 10;   // от оранжевого
    const endHue     = 320;  // до розово-фиолетового
    const satStart   = 82;
    const satEnd     = 96;
    const lightStart = 45;
    const lightEnd   = 70;

    for (let i = 0; i < count; i++) {
        const t = count === 1 ? 0.5 : i / (count - 1); // 0..1
        const h = startHue + (endHue - startHue) * t;
        const s = satStart + (satEnd - satStart) * t;
        const l = lightStart + (lightEnd - lightStart) * t;
        colors.push(`hsl(${h}, ${s}%, ${l}%)`);
    }
    return colors;
}


// ─── Единая семантическая палитра ────────────────────────────────────────────
// Все чарты берут цвета отсюда — консистентность с CSS темами
const PALETTE = {
    // новые токены редизайна (--in/--out/--debt/--save/--accent), старые переменные — запасной вариант
    income : () => getCssVar('--in',     getCssVar('--income-color',  '#10b981')),
    expense: () => getCssVar('--out',    getCssVar('--expense-color', '#f43f5e')),
    debt   : () => getCssVar('--debt',   getCssVar('--debt-color',    '#f59e0b')),
    deposit: () => getCssVar('--save',   getCssVar('--deposit-color', '#8b5cf6')),
    primary: () => getCssVar('--accent', getCssVar('--primary-color', '#6366f1')),
    // Категории: фиксированный набор из дизайна (save, in, debt, out, accent), «Прочее» — muted
    catSet : () => [getCssVar('--save', '#a78bfa'), getCssVar('--in', '#3ee08f'), getCssVar('--debt', '#ffb347'), getCssVar('--out', '#ff5d73'), getCssVar('--accent', '#3ee08f')],
    other  : () => getCssVar('--muted', '#8a93a6'),
    catHue : (i, total) => cssRgba(getCssVar('--out', '#ff5d73'), Math.max(0.3, 1 - (i / Math.max(total, 1)) * 0.7)),
    incomeHue: (i, total) => cssRgba(getCssVar('--in', '#3ee08f'), Math.max(0.3, 1 - (i / Math.max(total, 1)) * 0.7)),
    // Неделя: максимум — --out, выше среднего — --debt, остальные — приглушённый акцент
    weekday: (sums) => {
        const max = Math.max(...sums, 1);
        const avg = sums.reduce((a, b) => a + b, 0) / (sums.length || 1);
        return sums.map(v => v === max ? PALETTE.expense() : v > avg ? PALETTE.debt() : cssRgba(PALETTE.primary(), 0.45));
    }
};

// ─── Градиент под линейный график ────────────────────────────────────────────
function makeLineGradient(ctx, canvas, colorTop, colorBottom = 'transparent') {
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.offsetHeight || 300);
    gradient.addColorStop(0,   colorTop);
    gradient.addColorStop(0.6, colorBottom === 'transparent'
        ? colorTop.replace('hsl', 'hsla').replace(')', ', 0.08)')
        : colorBottom);
    gradient.addColorStop(1,   'rgba(0,0,0,0)');
    return gradient;
}

// ─── Общие options для осей ───────────────────────────────────────────────────
function axisDefaults(isLight) {
    const gridColor = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';
    const tickColor = getCssVar('--muted', getCssVar('--secondary-color', isLight ? '#475569' : '#94a3b8'));
    return { gridColor, tickColor };
}

// ─── Rich tooltip: топ-платежи внутри категории/элемента ───────────────────────
/**
 * Возвращает массив строк для тултипа с топ-5 платежами,
 * отфильтрованными по переданной categoryLabel
 */
function getRichTooltipLines(tx, categoryLabel, totalAmt) {
    const lines = [];
    const catTx = tx.filter(t => {
        const label = t.products?.[0]?.name || t.category || 'Без категории';
        return (t.category === categoryLabel || label === categoryLabel) && t.type === 'expense';
    });

    if (!catTx.length) return lines;

    // топ-5 по сумме
    const top5 = [...catTx].sort((a, b) => amtOf(b) - amtOf(a)).slice(0, 5);
    lines.push(''); // пустая строка-разделитель
    lines.push(`📋 Топ платежей:`);
    top5.forEach(t => {
        const name = t.products?.[0]?.name || t.description || t.category || '—';
        const date = t.date ? t.date.slice(5).replace('-', '.') : '';
        const short = name.length > 22 ? name.slice(0, 21) + '…' : name;
        lines.push(`  ${date}  ${short}  ${withCurrency(amtOf(t))}`);
    });
    if (catTx.length > 5) {
        lines.push(`  … ещё ${catTx.length - 5} платежей`);
    }
    return lines;
}

/**
 * Глобальные настройки тултипа — читаемый стиль на мобильном
 */
function buildTooltipDefaults() {
    const isLight = document.documentElement.dataset.theme &&
        ['light','yogurt','dolphin','mint','sage'].includes(
            document.documentElement.dataset.theme
        );
    return {
        backgroundColor: isLight ? 'rgba(255,255,255,0.97)' : 'rgba(13,17,32,0.96)',
        borderColor    : isLight ? 'rgba(99,102,241,0.2)'   : 'rgba(99,102,241,0.35)',
        borderWidth    : 1,
        titleColor     : isLight ? '#1e293b' : '#f1f5f9',
        bodyColor      : isLight ? '#475569' : '#94a3b8',
        padding        : { x: 14, y: 11 },
        cornerRadius   : 14,
        caretSize      : 6,
        caretPadding   : 6,
        titleFont      : { size: 13, weight: '700' },
        bodyFont       : { size: 12 },
        displayColors  : false,
        boxPadding     : 4,
        multiKeyBackground: 'transparent',
    };
}


let charts           = {};
const canvasHandlers = new Map();

// ------------------------------------------------------------------
// 2) Переменные состояния
// ------------------------------------------------------------------
let currentSlideIndex           = 0;
let analyticsSwipeInited        = false;
let swipeLocked                 = false;
let budgetManagerInstance       = null;

// период аналитики: набор месяцев 'YYYY-MM' (или всё время); год на графиках; метрика первого графика
let period     = null;
let viewYear   = new Date().getFullYear();
let heroMetric = 'expense';
let analyticsUiInited = false;
const HERO_METRIC_KEY = 'budgetit:analytics:hero-metric';
const METRICS = { expense: 'Траты', income: 'Поступления', net: 'Итог' };
const withCurrencyR = n => withCurrency(Math.round(n));

function getMonthNameByNumber(numString) {
    const monthsFull = [
        'Январь','Февраль','Март','Апрель','Май','Июнь',
        'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'
    ];
    const n   = Number(numString);
    const idx = Number.isFinite(n) ? n - 1 : -1;
    return monthsFull[idx] || '';
}

// Новые: выбранная категория и безопасный парсер суммы
let selectedAnalyticsCategory = '';

function amtOf(t) {
    // принимает либо транзакцию, либо число/строку
    if (typeof t === 'number') return t;
    const maybe = t?.amount ?? t;
    const v = Number(maybe);
    return Number.isFinite(v) ? v : 0;
}

// ------------------------------------------------------------------
// 3) Инициализация аналитики
// ------------------------------------------------------------------
function initializeAnalytics(budgetManager) {
    budgetManagerInstance = budgetManager;

    if (typeof getSavedTheme === 'function' && typeof setTheme === 'function') {
        setTheme(getSavedTheme());
    }
    const settingsPage = document.getElementById('settings-page');
    const wasHidden    = settingsPage?.classList.contains('hidden');
    if (wasHidden) settingsPage.classList.remove('hidden');

    initAnalyticsUi();
    renderCharts();
    refreshAnalyticsInsights(budgetManager);

    if (wasHidden) settingsPage.classList.add('hidden');
}

// ------------------------------------------------------------------
// 4) Слайды (не используются новыми графиками)
// ------------------------------------------------------------------
function showAnalyticsSlide(index) {
    const container = document.querySelector('.analytics-slides-container');
    const dots      = document.querySelectorAll('.analytics-dots .dot');
    if (!container || dots.length === 0) return;

    container.style.transform = `translateX(-${index * 100}%)`;
    dots.forEach((d, i) => d.classList.toggle('active', i === index));
    currentSlideIndex = index;

    setTimeout(() => {
        const chartRenderers = [
            renderExpensesByCategoryChart,
            renderMonthlyExpensesChart,
            renderIncomeVsExpensesChart,
            renderTopExpensesChart,
            renderBalanceDynamicsChart,
            renderCategoriesByDescendingChart,
            renderCategoryHistoryChart,
            renderSpendingByWeekdayChart,
            renderIncomeBySourceChart
        ];
        if (chartRenderers[index] && !isChartRendered(index)) {
            chartRenderers[index]();
        }
    }, 50);
}

function isChartRendered(index) {
    const chartKeys = [
        'expensesByCategory',
        'monthlyExpenses',
        'incomeVsExpenses',
        'topExpenses',
        'balanceDynamics',
        'categoriesByDescending',
        'categoryHistory',
        'spendingByWeekday',
        'incomeBySource'
    ];
    return charts[chartKeys[index]];
}

// ------------------------------------------------------------------
// 5) Рендер всех графиков
// ------------------------------------------------------------------
function renderCharts(opts = {}) {
    if (!budgetManagerInstance) {
        console.warn('[Charts] budgetManagerInstance is null');
        return;
    }
    if (!period) initAnalyticsUi();
    // При полном рендере — очищаем кэш, чтобы новые настройки (период) корректно применялись.
    transactionsCache.clear();
    destroyAllCharts(opts.keepHero ? ['hero'] : []);

    [
        renderAnalyticsHero,
        renderExpensesByCategoryChart,
        renderAnalyticsSharkTip,
        renderMonthlyExpensesChart,
        renderIncomeVsExpensesChart,
        renderTopExpensesChart,
        renderBalanceDynamicsChart,
        renderCategoriesByDescendingChart,
        renderCategoryHistoryChart,
        renderSpendingByWeekdayChart,
        renderIncomeBySourceChart,
        renderAnnualSummaryChart
    ].forEach(fn => { try { fn(); } catch (e) { console.warn('[Charts]', fn.name, e); } });
    fillYearSteppers();
}

// ------------------------------------------------------------------
// Hero «Траты за период» и «Совет Акулки» (по дизайну)
// ------------------------------------------------------------------
const AN_EXCLUDED = ['Не знаю на что потратил (без учёта)', 'Другая категория (без учёта)'];
const AN_MONTHS_LC = ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
const AN_MONTHS_SH = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
const pad2 = n => String(n).padStart(2, '0');
const isoOf = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const escHtml = x => String(x ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

// мягкая подсветка выбранных месяцев под столбиками
const selBandPlugin = {
    id: 'selBand',
    beforeDatasetsDraw(chart) {
        const sel = chart.options.plugins.selBand?.sel; if (!sel || !sel.length) return;
        const { ctx, chartArea, scales } = chart;
        const n = sel.length; if (!n) return;
        const w = chartArea.width / n;
        ctx.save();
        ctx.fillStyle = cssRgba(getCssVar('--accent', '#3dffa0'), 0.11);
        sel.forEach((on, i) => {
            if (!on) return;
            const x = chartArea.left + i * w + 1.5, y = chartArea.top - 4, ww = w - 3, hh = chart.height - y - 2;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(x, y, ww, hh, 10); else ctx.rect(x, y, ww, hh);
            ctx.fill();
        });
        ctx.restore();
    }
};

function metricColor(metric, v) {
    return metric === 'expense' ? PALETTE.expense() : metric === 'income' ? PALETTE.income() : (v >= 0 ? PALETTE.income() : PALETTE.expense());
}
const heroSign = n => n > 0 ? '+' : '';

function ensureHero() {
    const scroll = document.querySelector('#analytics-page .analytics-scroll');
    if (!scroll) return null;
    let hero = document.getElementById('an-hero');
    if (hero && hero.dataset.v === '2') return hero;
    hero?.remove();
    hero = document.createElement('section');
    hero.id = 'an-hero'; hero.className = 'an-hero an-card'; hero.dataset.v = '2'; hero.dataset.chart = 'an-hero';
    hero.innerHTML =
        '<div class="an-hero-top"><div class="an-hero-title"></div><div class="an-year"></div></div>' +
        '<div class="an-hero-sum"></div>' +
        '<div class="an-hero-deltarow"></div>' +
        '<div class="an-hero-chart"><canvas id="anHeroCanvas"></canvas></div>' +
        '<div class="an-metrics" role="group">' +
            Object.entries(METRICS).map(([k, l]) => `<button type="button" data-m="${k}">${l}</button>`).join('') +
        '</div>' +
        '<div class="an-hero-note">Нажимайте на столбики — можно выбрать несколько месяцев. Вклады и долги в расчёт не входят.</div>';
    const seg = document.getElementById('analytics-period-seg');
    if (seg) seg.insertAdjacentElement('afterend', hero); else scroll.insertAdjacentElement('afterbegin', hero);
    hero.querySelector('.an-metrics').addEventListener('click', e => {
        const b = e.target.closest('button[data-m]');
        if (!b) return;
        heroMetric = b.dataset.m;
        try { localStorage.setItem(HERO_METRIC_KEY, heroMetric); } catch (e2) {}
        renderAnalyticsHero();
    });
    return hero;
}

function renderAnalyticsHero() {
    const hero = ensureHero();
    if (!hero || !period) return;
    const all = allAnalyticsTx();
    const { first, last } = dataRange(all);
    const today = todayISO();
    const inc = sumTx(all, period, 'income');
    const exp = sumTx(all, period, 'expense');
    const cur = heroMetric === 'expense' ? exp : heroMetric === 'income' ? inc : inc - exp;

    hero.querySelector('.an-hero-title').textContent = `${METRICS[heroMetric]} · ${periodLabel(period)}`;
    hero.querySelector('.an-hero-sum').innerHTML =
        `${heroMetric === 'net' ? heroSign(cur) : ''}${formatNumber(Math.round(cur))} <small>${getCurrencyLabel()}</small>`;
    hero.querySelectorAll('.an-metrics button').forEach(b => b.classList.toggle('active', b.dataset.m === heroMetric));

    // сравнение с предыдущим периодом (для неполного месяца — «на то же число»)
    const pre = presetOf(period);
    const gen = pre === 'month' ? 'прошлого месяца' : pre === 'year' ? 'прошлого года' : 'прошлого периода';
    const dat = pre === 'month' ? 'прошлому месяцу' : pre === 'year' ? 'прошлому году' : 'прошлому периоду';
    let deltaHtml = '';
    if (heroMetric === 'net') {
        deltaHtml = `<span class="an-delta-note">поступления ${compactNumber(Math.round(inc))} − траты ${compactNumber(Math.round(exp))}</span>`;
    } else if (period.all) {
        const n = all.filter(t => t.type === heroMetric).length;
        deltaHtml = `<span class="an-delta-note">за всё время · ${n} ${n % 10 === 1 && n % 100 !== 11 ? 'операция' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? 'операции' : 'операций'}</span>`;
    } else {
        const c = comparison(all, period, heroMetric, today);
        if (c.delta == null) {
            deltaHtml = '<span class="an-delta-note">в предыдущем периоде данных нет — сравнивать не с чем</span>';
        } else {
            const pct = Math.round(c.delta * 100);
            const up = c.delta > 0;
            const good = heroMetric === 'expense' ? !up : up;
            deltaHtml = pct === 0
                ? `<span class="an-delta">= 0%</span>`
                : `<span class="an-delta ${good ? 'good' : 'bad'}">${up ? '▲' : '▼'} ${Math.abs(pct)}%</span>`;
            deltaHtml += `<span class="an-delta-note">${c.partial ? `к тому же числу ${gen}` : `к ${dat}`}</span>`;
        }
    }
    hero.querySelector('.an-hero-deltarow').innerHTML = deltaHtml;
    fillYearSteppers();

    // график по месяцам
    const rows = heroSeries(all, period, viewYear, heroMetric, first, last);
    const mt = monthlyTotals(all, rows.map(r => r.key));
    const multiYear = period.all && first && last && keyYear(first) !== keyYear(last);
    const labels = rows.map(r => MONTHS_SHORT[keyMonth(r.key) - 1] + (multiYear ? ` ${String(keyYear(r.key)).slice(2)}` : ''));
    const vals = rows.map(r => r.value);
    const colors = rows.map(r => {
        const c = metricColor(heroMetric, r.value);
        return (period.all || r.selected) ? c : cssRgba(c, 0.26);
    });
    const canvas = hero.querySelector('#anHeroCanvas');
    const muted = getCssVar('--muted', '#8a93a6');
    const lineCol = cssRgba(getCssVar('--text', '#ffffff'), 0.14);

    if (charts.hero && charts.hero.canvas === canvas) {
        const ch = charts.hero;
        ch.$rows = rows; ch.$mt = mt; ch.options.plugins.selBand = { sel: period.all ? [] : rows.map(r => r.selected) };
        ch.data.labels = labels;
        ch.data.datasets[0].data = vals;
        ch.data.datasets[0].backgroundColor = colors;
        ch.update();
        return;
    }
    const chart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        plugins: [selBandPlugin],
        data: { labels, datasets: [{
            data: vals, backgroundColor: colors,
            borderRadius: { topLeft: 7, topRight: 7, bottomLeft: 2, bottomRight: 2 }, borderSkipped: false,
            maxBarThickness: 28, categoryPercentage: 0.9, barPercentage: 0.78
        }] },
        options: {
            maintainAspectRatio: false,
            layout: { padding: { top: 6 } },
            animation: { duration: 420 },
            interaction: { mode: 'index', intersect: false },
            onHover: (evt, els) => { const el = evt.native?.target; if (el) el.style.cursor = els.length ? 'pointer' : 'default'; },
            onClick: (evt, els, ch) => {
                if (!els.length) return;
                const r = ch.$rows?.[els[0].index];
                if (r) setPeriod(toggleMonth(period, r.key, viewYear), { keepHero: true });
            },
            scales: {
                x: { grid: { display: false }, border: { display: false },
                     ticks: { color: muted, font: { size: 10, weight: '700' }, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
                y: { keepTicks: true, beginAtZero: true, border: { display: false }, ticks: { display: false },
                     grid: { color: c => c.tick.value === 0 ? lineCol : 'transparent' } }
            },
            plugins: {
                selBand: { sel: period.all ? [] : rows.map(r => r.selected) },
                legend: { display: false },
                tooltip: {
                    ...buildTooltipDefaults(),
                    callbacks: {
                        title: items => { const r = items[0]?.chart.$rows?.[items[0].dataIndex]; return r ? `${MONTHS_FULL[keyMonth(r.key) - 1]} ${keyYear(r.key)}` : ''; },
                        label: c => `${METRICS[heroMetric]}: ${withCurrencyR(c.raw)}`,
                        afterLabel: c => {
                            if (heroMetric !== 'net') return [];
                            const m = c.chart.$mt?.[c.dataIndex];
                            return m ? [`Поступления: ${withCurrencyR(m.income)}`, `Траты: ${withCurrencyR(m.expense)}`] : [];
                        }
                    }
                }
            }
        }
    });
    chart.$rows = rows; chart.$mt = mt;
    charts.hero = chart;
}

// «Совет Акулки»: самая «частая мелочь» за 14 дней, иначе главная статья расходов
function renderAnalyticsSharkTip() {
    const donutSection = document.querySelector('#analytics-page .analytics-scroll section:has(#expensesByCategoryChart)');
    if (!donutSection) return;
    let tip = document.getElementById('an-tip');
    if (!tip) {
        tip = document.createElement('section'); tip.id = 'an-tip'; tip.className = 'an-tip';
        donutSection.insertAdjacentElement('afterend', tip);
    }
    const tx = getCurrentBudgetTransactions().filter(t => t.type === 'expense' && t.date && !isFinancialCategory(t.category || ''));
    let text = '';
    if (tx.length) {
        const lastIso = tx.reduce((m, t) => t.date.slice(0, 10) > m ? t.date.slice(0, 10) : m, '');
        const end = new Date(lastIso + 'T00:00:00'); const from = new Date(end); from.setDate(from.getDate() - 13);
        const fromIso = isoOf(from);
        const by = new Map();
        for (const t of tx) {
            const d = t.date.slice(0, 10); if (d < fromIso) continue;
            const c = (t.category || '').trim(); if (!c) continue;
            const e = by.get(c) || { n: 0, sum: 0 }; e.n += 1; e.sum += amtOf(t); by.set(c, e);
        }
        const frequent = [...by.entries()].filter(([, e]) => e.n >= 3).sort((a, b) => b[1].sum - a[1].sum)[0];
        if (frequent) {
            const [c, e] = frequent; const saved = Math.round(e.sum / e.n);
            const times = e.n % 10 === 1 && e.n !== 11 ? 'раз' : (e.n % 10 >= 2 && e.n % 10 <= 4 && (e.n < 12 || e.n > 14)) ? 'раза' : 'раз';
            text = `${c} — ${e.n} ${times} за две недели, всего ${formatNumber(Math.round(e.sum))} ${getCurrencyLabel()}. Если реже на один раз, останется ещё +${formatNumber(saved)}.`;
        } else {
            const m = new Map(); let tot = 0;
            for (const t of tx) { const c = (t.category || 'Без категории'); m.set(c, (m.get(c) || 0) + amtOf(t)); tot += amtOf(t); }
            const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
            if (top && tot > 0) text = `Больше всего уходит на ${top[0]} — ${Math.round(top[1] / tot * 100)}% трат (${formatNumber(Math.round(top[1]))} ${getCurrencyLabel()}).`;
        }
    }
    if (!text) { tip.style.display = 'none'; return; }
    tip.style.display = '';
    tip.innerHTML = `<img src="./assets/shark.png" alt=""><div><div class="an-tip-title">Совет Акулки</div><div class="an-tip-text">${escHtml(text)}</div></div>`;
}

function destroyAllCharts(keep = []) {
    Object.keys(charts).forEach(key => {
        if (keep.includes(key)) return;
        if (charts[key]) {
            try { charts[key].destroy(); } catch (e) {}
            delete charts[key];
        }
    });
    canvasHandlers.forEach((handler, canvas) => {
        try { canvas.removeEventListener('click', handler); } catch (e) {}
    });
    canvasHandlers.clear();
}

// ------------------------------------------------------------------
// 6) Месяц через общий month-picker из хедера
// ------------------------------------------------------------------
// ------------------------------------------------------------------
// 6) Период: сегмент, шторка, годовой переключатель
// ------------------------------------------------------------------
const todayISO = () => isoOf(new Date());
const todayKeyNow = () => todayISO().slice(0, 7);
function allAnalyticsTx() { return baseTx(budgetManagerInstance?.getCurrentBudget()?.transactions || []); }

function defaultPeriod() {
    const all = allAnalyticsTx();
    const tk = todayKeyNow();
    if (all.some(t => keyOf(t.date) === tk)) return monthPeriod(tk);
    const { last } = dataRange(all);
    return monthPeriod(last || tk);
}

function yearBounds() {
    const ys = availableYears(allAnalyticsTx(), new Date().getFullYear());
    return { min: ys[0], max: ys[ys.length - 1] };
}

function fillYearSteppers() {
    const { min, max } = yearBounds();
    document.querySelectorAll('#analytics-page .an-year').forEach(el => {
        el.hidden = !!period?.all;
        el.innerHTML =
            `<button type="button" data-y="-1" ${viewYear <= min ? 'disabled' : ''} aria-label="Предыдущий год">‹</button>` +
            `<b>${viewYear}</b>` +
            `<button type="button" data-y="1" ${viewYear >= max ? 'disabled' : ''} aria-label="Следующий год">›</button>`;
    });
}

function changeViewYear(d) {
    const { min, max } = yearBounds();
    const ny = Math.min(max, Math.max(min, viewYear + d));
    if (ny === viewYear) return;
    viewYear = ny;
    transactionsCache.clear();
    renderAnalyticsHero();
    renderMonthlyExpensesChart();
    renderAnnualSummaryChart();
}

function setPeriod(p, opts = {}) {
    period = p;
    savePeriod(p);
    if (!p.all && !p.keys.some(k => keyYear(k) === viewYear)) viewYear = keyYear(p.keys[p.keys.length - 1]);
    syncPeriodUi();
    renderCharts({ keepHero: !!opts.keepHero });
}

function syncPeriodUi() {
    if (!period) return;
    const pre = presetOf(period);
    document.querySelectorAll('#analytics-period-seg button').forEach(b => b.classList.toggle('active', b.dataset.period === pre));
    const labelEl = document.getElementById('analytics-month-label');
    if (labelEl) labelEl.textContent = periodButtonLabel(period);
}

/** Опорный месяц при смене пресета: последний выбранный (не позже текущего); если на графике другой год — последний месяц этого года с данными */
function presetAnchor() {
    const all = allAnalyticsTx();
    const { last } = dataRange(all);
    const tk = todayKeyNow();
    if (period.all) return anchorOf(period, tk, last);
    if (!period.keys.some(k => keyYear(k) === viewYear)) {
        const inYear = all.map(t => keyOf(t.date)).filter(k => keyYear(k) === viewYear).sort();
        return inYear.length ? inYear[inYear.length - 1] : `${viewYear}-12`;
    }
    const ks = period.keys.filter(k => k <= tk && keyYear(k) === viewYear);
    return ks.length ? ks[ks.length - 1] : period.keys[period.keys.length - 1];
}

function ensureSegment() {
    const row = document.querySelector('#analytics-page .analytics-scroll');
    if (!row) return;
    let seg = document.getElementById('analytics-period-seg');
    if (seg && seg.querySelector('[data-period="all"]')) return;
    seg?.remove();
    seg = document.createElement('div');
    seg.id = 'analytics-period-seg';
    seg.className = 'analytics-period-seg';
    seg.setAttribute('role', 'group');
    seg.innerHTML = '<button type="button" data-period="month">Месяц</button>' +
                    '<button type="button" data-period="3m">3 мес</button>' +
                    '<button type="button" data-period="year">Год</button>' +
                    '<button type="button" data-period="all">Всё</button>';
    row.insertAdjacentElement('afterbegin', seg);
    seg.addEventListener('click', e => {
        const b = e.target.closest('button[data-period]');
        if (!b || !period) return;
        const k = b.dataset.period;
        setPeriod(k === 'all' ? allTime() : fromPreset(k, presetAnchor()));
    });
}

function openPeriodPicker() {
    const all = allAnalyticsTx();
    const { last } = dataRange(all);
    openPeriodSheet({
        period,
        years: availableYears(all, new Date().getFullYear()),
        hasData: new Set(all.map(t => keyOf(t.date))),
        todayKey: todayKeyNow(),
        anchor: anchorOf(period, todayKeyNow(), last),
        onApply: p => setPeriod(p)
    });
}

function initAnalyticsUi() {
    setUiDeps({
        fmt: n => formatNumber(n),
        compact: compactNumber,
        cur: getCurrencyLabel,
        colors: () => {
            const a = getCssVar('--in', '#3ee08f'), b = getCssVar('--save', '#a78bfa');
            return [a, getCssVar('--accent', '#3ee08f'), b, getCssVar('--debt', '#ffb347'), cssRgba(a, 0.6), cssRgba(b, 0.6)];
        }
    });
    try { const m = localStorage.getItem(HERO_METRIC_KEY); if (m && METRICS[m]) heroMetric = m; } catch (e) {}
    if (!period) {
        period = loadPeriod() || defaultPeriod();
        const { last } = dataRange(allAnalyticsTx());
        viewYear = keyYear(anchorOf(period, todayKeyNow(), last));
    }
    ensureSegment();
    if (!analyticsUiInited) {
        analyticsUiInited = true;
        document.getElementById('analytics-month-btn')?.addEventListener('click', openPeriodPicker);
        document.querySelector('#analytics-page .analytics-scroll')?.addEventListener('click', e => {
            const b = e.target.closest('.an-year button[data-y]');
            if (b) changeViewYear(Number(b.dataset.y));
        });
    }
    syncPeriodUi();
}

// ------------------------------------------------------------------
// 7) Получение транзакций выбранного периода
// ------------------------------------------------------------------
function getCurrentBudgetTransactions(filterByPeriod = true) {
    const all = allAnalyticsTx();
    if (!filterByPeriod || !period) return all;
    const key = period.all ? 'all' : period.keys.join(',');
    if (transactionsCache.has(key)) return transactionsCache.get(key);
    const result = all.filter(t => inPeriod(period, t.date));
    transactionsCache.set(key, result);
    return result;
}

// ------------------------------------------------------------------
// 8) Утилиты
// ------------------------------------------------------------------
const formatNumber = n =>
    n.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function emptyGuard(canvas, empty, msg, chartKey) {
    const host = canvas.closest('.cv-wrap, .ch-wrap') || canvas;
    let el = host.parentElement.querySelector('.an-empty[data-for="' + canvas.id + '"]');
    if (empty) {
        try { charts[chartKey]?.destroy(); } catch (e) {}
        delete charts[chartKey];
        host.style.display = 'none';
        if (!el) { el = document.createElement('p'); el.className = 'an-empty'; el.dataset.for = canvas.id; host.insertAdjacentElement('afterend', el); }
        el.textContent = msg;
    } else {
        host.style.display = '';
        el?.remove();
    }
    return empty;
}

function ensureWrap(canvas, px) {
    let w = canvas.parentElement;
    if (!w.classList.contains('cv-wrap')) {
        w = document.createElement('div'); w.className = 'cv-wrap';
        canvas.parentElement.insertBefore(w, canvas); w.appendChild(canvas);
    }
    w.style.height = Math.round(px) + 'px';
    canvas.removeAttribute('height'); canvas.style.height = '100%';
    return w;
}

function ensureNonEmptyData(labels, data) {
    if (!data.length) { labels.push(''); data.push(0.001); }
}

function bindClickOnce(canvas, handler) {
    if (!canvas || canvas.dataset.bound) return;
    canvas.addEventListener('click', handler);
    canvas.dataset.bound = '1';
    canvasHandlers.set(canvas, handler);
}

// вспомогательная: показать тултип/активировать бар по индексу
function activateBar(chart, index) {
    chart.setActiveElements([{ datasetIndex: 0, index }]);
    chart.tooltip.setActiveElements([{ datasetIndex: 0, index }], { x: 0, y: 0 });
    chart.update();
}

// из координаты Y получить индекс бара (даже при клике по подписям)
function indexFromY(yScale, offsetY) {
    const total = yScale.ticks.length;
    const step  = (yScale.bottom - yScale.top) / Math.max(total, 1);
    let idx     = Math.round((offsetY - yScale.top) / step);
    if (Number.isNaN(idx)) idx = 0;
    return Math.max(0, Math.min(total - 1, idx));
}
// -----------------------------------------------------------------
// 1. Расходы по категориям (пончик + клик по легенде)
// -----------------------------------------------------------------
function renderExpensesByCategoryChart() {
    const canvas = document.getElementById('expensesByCategoryChart');
    if (!canvas) return;
    setAdaptiveCanvasHeight(canvas);
    try { charts.expensesByCategory?.destroy(); } catch (e) {}
    delete charts.expensesByCategory;

    const ctx = canvas.getContext('2d');
    const bd  = categoryBreakdown(getCurrentBudgetTransactions(), period, 'expense');
    const TOP_N = 5;
    const top = bd.rows.slice(0, TOP_N);
    const rest = bd.rows.slice(TOP_N);
    const restSum = rest.reduce((s, r) => s + r.sum, 0);
    const restNames = new Set(rest.map(r => r.name));

    const labels = top.map(r => r.name);
    const data   = top.map(r => r.sum);
    const hasOthers = restSum > 0;
    if (hasOthers) { labels.push('Прочее'); data.push(restSum); }
    const empty = !labels.length;
    ensureNonEmptyData(labels, data);

    const set = PALETTE.catSet();
    const colors = empty ? [cssRgba(getCssVar('--text', '#ffffff'), 0.1)] : labels.map((l, i) => (hasOthers && i === labels.length - 1) ? PALETTE.other() : set[i % set.length]);
    const totalAll = bd.total;

    // центр кольца — общая сумма трат
    const centerEl = document.getElementById('expensesByCategoryCenterText');
    if (centerEl) {
        const big = totalAll >= 1e5 ? compactNumber(totalAll) : formatNumber(Math.round(totalAll));
        centerEl.innerHTML = `<div class="center-total">${big}</div><div class="center-label">${empty ? 'нет трат' : `${bd.rows.length} ${bd.rows.length === 1 ? 'категория' : bd.rows.length < 5 ? 'категории' : 'категорий'}`}</div>`;
    }

    const openCat = idx => {
        if (empty || idx == null || idx < 0 || idx >= labels.length) return;
        const isOther = hasOthers && idx === labels.length - 1;
        const d = categoryDetail(allAnalyticsTx(), period, labels[idx], {
            type: 'expense', todayISO: todayISO(), othersNames: isOther ? restNames : null
        });
        openCategorySheet(d, { type: 'expense', color: colors[idx], periodText: periodLabel(period), selected: period });
        if (!isOther) {
            selectedAnalyticsCategory = labels[idx];
            renderCategoryHistoryChart();
        }
    };

    const chart = new Chart(ctx, {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0, borderRadius: 8, hoverOffset: 5, spacing: 2 }] },
        options: {
            cutout: '72%',
            rotation: -0.5 * Math.PI,
            plugins: { legend: { display: false }, tooltip: { enabled: false } }
        }
    });
    charts.expensesByCategory = chart;

    // попадание в кольцо по углу: тап по любому месту кольца (и рядом с ним) выбирает сегмент
    const hit = evt => {
        if (empty) return -1;
        const rect = canvas.getBoundingClientRect();
        const x = evt.clientX - rect.left, y = evt.clientY - rect.top;
        const arcs = chart.getDatasetMeta(0).data;
        if (!arcs.length) return -1;
        const a0 = arcs[0].getProps(['x', 'y', 'innerRadius', 'outerRadius'], true);
        const dx = x - a0.x, dy = y - a0.y;
        const r = Math.hypot(dx, dy);
        if (r < a0.innerRadius * 0.7 || r > a0.outerRadius + 14) return -1;
        const ang = Math.atan2(dy, dx);
        const TAU = Math.PI * 2;
        for (let i = 0; i < arcs.length; i++) {
            const { startAngle, endAngle } = arcs[i].getProps(['startAngle', 'endAngle'], true);
            const rel = ((ang - startAngle) % TAU + TAU) % TAU;
            if (rel <= endAngle - startAngle + 0.02) return i;
        }
        return -1;
    };
    if (canvas._anClick) canvas.removeEventListener('click', canvas._anClick);
    if (canvas._anMove) canvas.removeEventListener('mousemove', canvas._anMove);
    canvas._anClick = evt => openCat(hit(evt));
    canvas._anMove = evt => { canvas.style.cursor = hit(evt) >= 0 ? 'pointer' : 'default'; };
    canvas.addEventListener('click', canvas._anClick);
    canvas.addEventListener('mousemove', canvas._anMove);

    // легенда справа: цвет · название · доля — тоже открывает подробности
    const legendEl = document.getElementById('expensesByCategoryLegend');
    if (legendEl) {
        const esc = x => String(x).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
        legendEl.innerHTML = empty ? '<p class="an-empty">За выбранный период трат нет</p>' :
            labels.map((l, i) => {
                const pct = totalAll > 0 ? Math.round(data[i] / totalAll * 100) : 0;
                return `<button type="button" class="dn-leg" data-i="${i}"><i style="background:${colors[i]}"></i><span>${esc(l)}</span><b>${pct}%</b></button>`;
            }).join('') + '<div class="an-hint">Нажмите на категорию — подробная статистика</div>';
        legendEl.querySelectorAll('.dn-leg').forEach(btn => btn.addEventListener('click', () => openCat(Number(btn.dataset.i))));
    }

    if (!selectedAnalyticsCategory && !empty) selectedAnalyticsCategory = labels[0];
}


// -----------------------------------------------------------------
// 2. Ежемесячные расходы/доходы
// -----------------------------------------------------------------
function renderMonthlyExpensesChart() {
    const canvas = document.getElementById('monthlyExpensesChart');
    if (!canvas) return;
    try { charts.monthlyExpenses?.destroy(); } catch (e) {}
    delete charts.monthlyExpenses;
    ensureWrap(canvas, 230);

    const ctx = canvas.getContext('2d');
    const all = allAnalyticsTx();
    const { first, last } = dataRange(all);
    const keys = summaryKeys(period, viewYear, first, last);
    const rows = monthlyTotals(all, keys);
    const multiYear = new Set(keys.map(keyYear)).size > 1;
    const labels = keys.map(k => MONTHS_SHORT[keyMonth(k) - 1] + (multiYear ? ` ${String(keyYear(k)).slice(2)}` : ''));
    const income  = rows.map(r => r.income);
    const expense = rows.map(r => r.expense);
    const sel = k => period.all || period.set.has(k);
    const cIn = PALETTE.income(), cOut = PALETTE.expense();
    const shade = (c, k) => sel(k) ? c : cssRgba(c, 0.28);
    const muted = getCssVar('--muted', '#8a93a6');
    const faint = getCssVar('--faint', 'rgba(255,255,255,.08)');

    if (!keys.length) { labels.push(''); income.push(0.001); expense.push(0.001); }

    charts.monthlyExpenses = new Chart(ctx, {
        type: 'bar',
        plugins: [selBandPlugin],
        data: {
            labels,
            datasets: [
                { label: 'Поступления', data: income,  backgroundColor: keys.map(k => shade(cIn, k)),  borderRadius: { topLeft: 6, topRight: 6, bottomLeft: 2, bottomRight: 2 }, borderSkipped: false, categoryPercentage: 0.88, barPercentage: 0.9, maxBarThickness: 16 },
                { label: 'Траты',       data: expense, backgroundColor: keys.map(k => shade(cOut, k)), borderRadius: { topLeft: 6, topRight: 6, bottomLeft: 2, bottomRight: 2 }, borderSkipped: false, categoryPercentage: 0.88, barPercentage: 0.9, maxBarThickness: 16 }
            ]
        },
        options: {
            maintainAspectRatio: false,
            layout: { padding: { top: 4 } },
            interaction: { mode: 'index', intersect: false },
            onHover: (evt, els) => { const el = evt.native?.target; if (el) el.style.cursor = els.length ? 'pointer' : 'default'; },
            onClick: (evt, els) => {
                if (!els.length || !keys.length) return;
                const k = keys[els[0].index];
                if (k) setPeriod(toggleMonth(period, k, viewYear), { keepHero: true });
            },
            scales: {
                x: { grid: { display: false }, border: { display: false }, ticks: { color: muted, font: { size: 10, weight: '700' }, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
                y: { beginAtZero: true, border: { display: false }, grid: { color: faint }, ticks: { color: muted, maxTicksLimit: 4, callback: v => compactNumber(v) } }
            },
            plugins: {
                selBand: { sel: period.all ? [] : keys.map(k => period.set.has(k)) },
                legend: { position: 'top', align: 'end', labels: { color: muted, boxWidth: 8, boxHeight: 8, padding: 12, font: { size: 11, weight: '700' }, generateLabels: ch => ch.data.datasets.map((d, i) => ({ text: d.label, fillStyle: i ? cOut : cIn, strokeStyle: 'transparent', pointStyle: 'circle', datasetIndex: i })) } },
                tooltip: {
                    ...buildTooltipDefaults(),
                    callbacks: {
                        title: items => { const k = keys[items[0]?.dataIndex]; return k ? `${MONTHS_FULL[keyMonth(k) - 1]} ${keyYear(k)}` : ''; },
                        label: c => `${c.dataset.label}: ${withCurrencyR(c.raw)}`,
                        afterBody: items => {
                            const r = rows[items[0]?.dataIndex]; if (!r) return [];
                            return ['', `Итог: ${r.net > 0 ? '+' : ''}${withCurrencyR(r.net)}`];
                        }
                    }
                }
            }
        }
    });
}

// -----------------------------------------------------------------
// 3. Доходы vs Расходы — индикатор (горизонтальный бар)
// -----------------------------------------------------------------
function renderIncomeVsExpensesChart() {
    const canvas = document.getElementById('incomeVsExpensesChart');
    if (!canvas) return;
    setAdaptiveCanvasHeight(canvas);

    const ctx = canvas.getContext('2d');
    const tx  = getCurrentBudgetTransactions(); // учит. текущий фильтр месяца

    const income  = tx.filter(t => t.type === 'income').reduce((s, t) => s + amtOf(t), 0);
    const expense = tx.filter(t => t.type === 'expense').reduce((s, t) => s + amtOf(t), 0);
    const total   = income + expense;

    // чтобы бар всегда был >0 пикселей
    const safeIncome  = total > 0 ? income  : 0.5;
    const safeExpense = total > 0 ? expense : 0.5;
    const safeTotal   = total > 0 ? total   : 1;

    const labels = ['']; // один ряд, как прогресс-бар

    // плагин, который рисует подписи под баром
    // подписи под баром
    const summaryPlugin = {
        id: 'incomeExpenseSummary',
        afterDraw(chart) {
            const { ctx, chartArea } = chart;
            const { left, right, bottom } = chartArea;
            ctx.save();
            ctx.font = '700 12px Manrope, system-ui';
            ctx.fillStyle = getCssVar('--muted', '#999');
            ctx.textBaseline = 'top';

            // округляем до целых
            const roundedIncome  = Math.round(income);
            const roundedExpense = Math.round(expense);

            const textIncome  = `Поступления ${compactNumber(roundedIncome)}`;
            const textExpense = `Траты ${compactNumber(roundedExpense)}`;

            ctx.textAlign = 'left';
            ctx.fillText(textIncome, left, bottom + 8);

            ctx.textAlign = 'right';
            ctx.fillText(textExpense, right, bottom + 8);

            ctx.restore();
        }
    };



    charts.incomeVsExpenses = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Поступления',
                    data : [safeIncome],
                    backgroundColor: PALETTE.income(),
                    borderRadius   : 999,
                    borderSkipped  : false
                },
                {
                    label: 'Траты',
                    data : [safeExpense],
                    backgroundColor: PALETTE.expense(),
                    borderRadius   : 999,
                    borderSkipped  : false
                }
            ]
        },
        options: {
            indexAxis: 'y',
            layout   : { padding: { top: 10, left: 16, right: 16, bottom: 32 } },
            scales   : {
                x: {
                    stacked : true,
                    display : false,
                    min     : 0,
                    max     : safeTotal
                },
                y: {
                    stacked : true,
                    display : false
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: c => {
                            const v   = c.raw;
                            const pct = total ? Math.round(v / total * 100) : 0;
                            const label = c.dataset.label;
                            const value = label === 'Поступления' ? income : expense;
                            return `${label}: ${withCurrency(value)} (${pct}%)`;
                        }
                    }
                }
            }
        },
        plugins: [summaryPlugin]
    });
}

// -----------------------------------------------------------------
// 4. Топ расходов (клик по подписям и по барам)
// -----------------------------------------------------------------
function renderTopExpensesChart() {
    const el = document.getElementById('anTopList');
    if (!el) return;
    renderTopList(el, topTransactions(getCurrentBudgetTransactions(), period, 7, 'expense'));
}

// -----------------------------------------------------------------
// 5. Динамика баланса
// -----------------------------------------------------------------
function renderBalanceDynamicsChart() {
    const canvas = document.getElementById('balanceDynamicsChart');
    if (!canvas) return;
    try { charts.balanceDynamics?.destroy(); } catch (e) {}
    delete charts.balanceDynamics;

    const head = document.getElementById('anBalHead');
    const wrap = canvas.parentElement;
    const all = allAnalyticsTx();
    const daily = !period.all && periodSpan(period) <= 3;
    const res = daily ? balanceDaily(all, period, todayISO()) : balanceSeries(all, period);
    const pts = res.points;

    if (!pts.length) {
        if (head) head.innerHTML = '<p class="an-empty">Пока нет данных</p>';
        if (wrap) wrap.style.display = 'none';
        return;
    }
    if (wrap) wrap.style.display = '';

    const multiYear = !daily && new Set(pts.map(p => keyYear(p.key))).size > 1;
    const dm = d => `${Number(d.slice(8, 10))} ${MONTHS_SHORT[Number(d.slice(5, 7)) - 1]}`;
    const lbl = p => daily ? dm(p.date) : MONTHS_SHORT[keyMonth(p.key) - 1] + (multiYear ? ` ${String(keyYear(p.key)).slice(2)}` : '');
    const fullTitle = p => daily ? `${p.date.slice(8, 10)}.${p.date.slice(5, 7)}.${p.date.slice(0, 4)}` : `${MONTHS_FULL[keyMonth(p.key) - 1]} ${keyYear(p.key)}`;
    const sgn = n => n > 0 ? '+' : n < 0 ? '−' : '';
    const col = res.change >= 0 ? PALETTE.income() : PALETTE.expense();

    if (head) {
        head.innerHTML =
            `<div class="bal-top"><div class="bal-big"><b>${formatNumber(Math.round(res.end))}</b><small>${getCurrencyLabel()}</small></div>` +
            `<span class="bal-chg ${res.change >= 0 ? 'good' : 'bad'}">${res.change >= 0 ? '▲' : '▼'} ${sgn(res.change)}${formatNumber(Math.abs(Math.round(res.change)))} за период</span></div>` +
            `<div class="bal-mm"><span>Пик <b>${formatNumber(Math.round(res.max.balance))}</b><em>${lbl(res.max)}</em></span>` +
            `<span>Минимум <b>${formatNumber(Math.round(res.min.balance))}</b><em>${lbl(res.min)}</em></span></div>` +
            `<div class="bal-note">Нарастающий итог: поступления минус траты (без вкладов и долгов)</div>`;
    }

    const muted = getCssVar('--muted', '#8a93a6');
    const faint = getCssVar('--faint', 'rgba(255,255,255,.08)');
    const zero = cssRgba(getCssVar('--text', '#ffffff'), 0.25);
    const last = pts.length - 1;
    const bmin = res.min.balance, bmax = res.max.balance;
    const axisFmt = v => (Math.abs(bmax - bmin) < 1e6 && Math.abs(v) >= 1e6) ? `${formatNumber(Math.round(v / 1000))} тыс` : compactNumber(v);
    charts.balanceDynamics = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: pts.map(lbl),
            datasets: [{
                data: pts.map(p => p.balance),
                borderColor: col, borderWidth: 2.5, tension: 0.3, fill: true,
                backgroundColor: c => {
                    const a = c.chart.chartArea; if (!a) return 'transparent';
                    const g = c.chart.ctx.createLinearGradient(0, a.top, 0, a.bottom);
                    g.addColorStop(0, cssRgba(col, 0.32)); g.addColorStop(1, cssRgba(col, 0));
                    return g;
                },
                pointRadius: c => c.dataIndex === last ? 4.5 : 0,
                pointBackgroundColor: col, pointBorderColor: getCssVar('--bg', '#0b0f1a'), pointBorderWidth: 2,
                pointHoverRadius: 5
            }]
        },
        options: {
            maintainAspectRatio: false,
            layout: { padding: { top: 6, right: 8 } },
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: { grid: { display: false }, border: { display: false }, ticks: { color: muted, font: { size: 10, weight: '700' }, maxRotation: 0, autoSkip: true, maxTicksLimit: 5 } },
                y: { keepTicks: true, border: { display: false }, ticks: { color: muted, maxTicksLimit: 4, callback: axisFmt }, grid: { color: c => c.tick.value === 0 ? zero : faint } }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    ...buildTooltipDefaults(),
                    callbacks: {
                        title: items => { const p = pts[items[0]?.dataIndex]; return p ? fullTitle(p) : ''; },
                        label: c => `Баланс: ${withCurrencyR(c.raw)}`,
                        afterLabel: c => { const p = pts[c.dataIndex]; return p && p.net ? [`${daily ? 'За день' : 'За месяц'}: ${sgn(p.net)}${withCurrencyR(Math.abs(p.net))}`] : []; }
                    }
                }
            }
        }
    });
}

// -----------------------------------------------------------------
// 6. История категории
// -----------------------------------------------------------------
function renderCategoryHistoryChart() {
    const canvas = document.getElementById('categoryHistoryChart');
    if (!canvas) return;
    try { charts.categoryHistory?.destroy(); } catch (e) {}
    delete charts.categoryHistory;
    if (!canvas.parentElement.classList.contains('ch-wrap')) {
        const w = document.createElement('div'); w.className = 'ch-wrap';
        canvas.parentElement.insertBefore(w, canvas); w.appendChild(canvas);
    }
    canvas.removeAttribute('height'); canvas.style.height = '';
    const ctx = canvas.getContext('2d');
    const esc = x => String(x ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

    const all = allAnalyticsTx();
    const bd = categoryBreakdown(getCurrentBudgetTransactions(), period, 'expense');
    const ranked = bd.rows.map(r => r.name);
    let cat = selectedAnalyticsCategory;
    if (!ranked.includes(cat)) cat = ranked[0] || '';
    selectedAnalyticsCategory = cat;
    const d = cat ? categoryDetail(all, period, cat, { type: 'expense', todayISO: todayISO() }) : null;
    const trend = d ? d.trend : [];
    if (!cat) {
        const hd = canvas.closest('section')?.querySelector('.ch-head'); if (hd) hd.innerHTML = '';
        if (emptyGuard(canvas, true, 'За выбранный период трат нет', 'categoryHistory')) return;
    } else emptyGuard(canvas, false, '', 'categoryHistory');
    const labels = trend.map(x => MONTHS_SHORT[keyMonth(x.key) - 1]);
    const data = trend.map(x => x.value);
    ensureNonEmptyData(labels, data);
    const lastKey = trend.length ? trend[trend.length - 1].key : '';
    const isSel = x => period.all ? x.key === lastKey : period.set.has(x.key);

    const section = canvas.closest('section');
    if (section) {
        let head = section.querySelector('.ch-head');
        if (!head) {
            head = document.createElement('div'); head.className = 'ch-head';
            (canvas.closest('.ch-wrap') || canvas).insertAdjacentElement('beforebegin', head);
        }
        let trendTxt = '—', tcls = '';
        if (d?.cmp && d.cmp.delta != null) {
            const pct = Math.round(d.cmp.delta * 100);
            trendTxt = (pct > 0 ? '+' : '') + pct + '%'; tcls = pct > 0 ? 'up' : pct < 0 ? 'down' : '';
        }
        const chips = ranked.slice(0, 5);
        if (cat && !chips.includes(cat)) chips.splice(4, 1, cat);
        head.innerHTML =
            `<div class="ch-sub"><span>Тренд «${esc(cat || '—')}» · к прошлому периоду</span><b class="ch-trend ${tcls}">${trendTxt}</b></div>` +
            `<div class="ch-chips">${chips.map(c => `<button type="button" class="ch-chip${c === cat ? ' on' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>`;
        head.querySelectorAll('.ch-chip').forEach(b => b.addEventListener('click', () => {
            selectedAnalyticsCategory = b.dataset.c;
            renderCategoryHistoryChart();
        }));
    }

    const barBase = cssRgba(getCssVar('--text', '#ffffff'), 0.16);
    const accent  = getCssVar('--accent', '#3dffa0');
    charts.categoryHistory = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{
            data, borderRadius: 7, borderSkipped: false, maxBarThickness: 44,
            backgroundColor: trend.length ? trend.map(x => isSel(x) ? accent : barBase) : barBase
        }] },
        options: {
            maintainAspectRatio: false,
            layout: { padding: { top: 6 } },
            scales: {
                x: { ticks: { color: getCssVar('--muted', '#999'), font: { size: 11, weight: '700' } }, grid: { display: false }, border: { display: false } },
                y: { display: false, beginAtZero: true }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    ...buildTooltipDefaults(),
                    callbacks: {
                        title: c => { const x = trend[c[0]?.dataIndex]; return x ? `${MONTHS_FULL[keyMonth(x.key) - 1]} ${keyYear(x.key)}  ·  ${cat}` : ''; },
                        label: c => withCurrencyR(c.raw)
                    }
                }
            }
        }
    });
}

// -----------------------------------------------------------------
// 7. Категории по убыванию
// -----------------------------------------------------------------
// --- утилиты для подписей ---
function softHyphenate(word, chunk = 15) {
    // вставляем мягкие переносы внутри длинных "слитных" слов
    const arr = Array.from(word);
    if (arr.length <= chunk) return word;
    const out = [];
    for (let i = 0; i < arr.length; i++) {
        out.push(arr[i]);
        if ((i + 1) % chunk === 0 && i !== arr.length - 1) out.push('\u00AD'); // soft hyphen
    }
    return out.join('');
}
function wrapLabel(src, maxLen = 15) {
    // переносы по словам; если слово длинное — hyphenate
    const words = src.split(/\s+/).map(w => softHyphenate(w, 10));
    const lines = [];
    let cur = '';

    for (const w of words) {
        if ((cur + (cur ? ' ' : '') + w).length <= maxLen) {
            cur = cur ? cur + ' ' + w : w;
        } else {
            if (cur) lines.push(cur);
            // если само слово слишком длинное — режем на куски, чтобы точно поместилось
            if (w.replace(/\u00AD/g, '').length > maxLen) {
                let chunk = '';
                for (const ch of Array.from(w)) {
                    chunk += ch;
                    if (chunk.replace(/\u00AD/g, '').length >= maxLen) {
                        lines.push(chunk);
                        chunk = '';
                    }
                }
                if (chunk) lines.push(chunk);
                cur = '';
            } else {
                cur = w;
            }
        }
    }
    if (cur) lines.push(cur);

    // если получилась очень длинная подпись — обрежем последнюю строку с «…»
    const MAX_LINES = 3;
    if (lines.length > MAX_LINES) {
        const trimmed = lines.slice(0, MAX_LINES);
        trimmed[MAX_LINES - 1] =
            Array.from(trimmed[MAX_LINES - 1]).slice(0, maxLen - 1).join('') + '…';
        return trimmed;
    }
    return lines;
}
// === 7. Категории по убыванию (фикс налезаний/wrap/клик) ===
function renderCategoriesByDescendingChart() {
    const canvas = document.getElementById('categoriesByDescendingChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const tx  = getCurrentBudgetTransactions();

    const map = {};
    tx.filter(t => t.type === 'expense').forEach(t => {
        const cat = t.category || 'Без категории';
        map[cat]  = (map[cat] || 0) + amtOf(t);
    });

    const sorted     = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 30);
    if (emptyGuard(canvas, !sorted.length, 'За выбранный период трат нет', 'categoriesByDescending')) return;
    const fullLabels = sorted.map(([c]) => c);
    const data       = sorted.map(([, a]) => a);

    // визуальные подписи: многострочные
    const labels = fullLabels.map(l => wrapLabel(l, 28));
    ensureNonEmptyData(labels, data);

    // динамическая высота под количество строк
    const rowH     = 30; // ~высота строки с межстрочным
    const extra    = 70; // сверху/снизу + ось X
    const desiredH = Math.max(260, labels.length * rowH + extra);
    ensureWrap(canvas, desiredH);

    // толщина баров из высоты
    const barThickness = Math.max(
        12,
        Math.min(
            28,
            Math.floor((desiredH - extra) / Math.max(labels.length, 1)) - 6
        )
    );

    const colors = labels.map((_, i) => PALETTE.catHue(i, labels.length));

    // уничтожаем старый график при перерисовке
    if (charts.categoriesByDescending) {
        try { charts.categoriesByDescending.destroy(); } catch (e) {}
        delete charts.categoriesByDescending;
    }

    charts.categoriesByDescending = new Chart(ctx, {
        type: 'bar',
        data: {
            labels, // массивы строк → многострочные подписи
            datasets: [{
                data,
                backgroundColor: colors,
                borderRadius: 8,
                borderSkipped: false,
                barThickness
            }]
        },
        options: {
            indexAxis: 'y',
            layout   : { padding: { left: 16, right: 14, top: 8, bottom: 20 } },
            scales   : {
                y: {
                    offset: true,
                    grid  : { display: false },
                    ticks : {
                        autoSkip   : false,
                        color      : getCssVar('--secondary-color', '#fff'),
                        font       : { size: 11, lineHeight: 1.1 }
                    }
                },
                x: {
                    grid : {
                        color: 'rgba(255,255,255,0.06)',
                        drawBorder: false
                    },
                    ticks: {
                        color: getCssVar('--text-muted', '#888'),
                        callback: v => formatNumber(v)
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    ...buildTooltipDefaults(),
                    callbacks: {
                        title: c => Array.isArray(c[0]?.label) ? c[0].label.join(' ') : (c[0]?.label || ''),
                        label: ctx => {
                            const val = ctx.raw || 0;
                            const totalAll = sorted.reduce((s, [,v]) => s + v, 0);
                            const pct = totalAll > 0 ? (val / totalAll * 100).toFixed(1) : 0;
                            return `${withCurrency(val)}  ·  ${pct}%`;
                        },
                        afterLabel: ctx => {
                            const catName = fullLabels[ctx.dataIndex];
                            if (!catName) return [];
                            return getRichTooltipLines(getCurrentBudgetTransactions(), catName, ctx.raw);
                        }
                    }
                }
            },
            animation: {
                duration: 500,
                easing  : 'easeOutCubic'
            }
        }
    });

    // 💡 КЛИК ПО НАЗВАНИЮ/СТОЛБЦУ → ПОДСВЕТКА И СУММА
    const chart  = charts.categoriesByDescending;
    const yScale = chart.scales.y;

    const clickHandler = evt => {
        const { offsetY } = evt;
        const idx = indexFromY(yScale, offsetY); // уже есть утилита ниже в файле
        activateBar(chart, idx);                // выставляет active + tooltip
    };

    bindClickOnce(canvas, clickHandler);
}


// -----------------------------------------------------------------
// 8. Траты по дням недели
// -----------------------------------------------------------------
function renderSpendingByWeekdayChart() {
    const canvas = document.getElementById('spendingByWeekdayChart');
    if (!canvas) return;
    ensureWrap(canvas, 230);

    const ctx = canvas.getContext('2d');
    const tx  = getCurrentBudgetTransactions();

    const days = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
    const sums = Array(7).fill(0);

    tx.filter(t => t.type === 'expense').forEach(t => {
        sums[weekdayMon(t.date)] += amtOf(t);
    });
    if (emptyGuard(canvas, !sums.some(v => v > 0), 'За выбранный период трат нет', 'spendingByWeekday')) return;

    ensureNonEmptyData(days, sums);
    const colors = PALETTE.weekday(sums);

    charts.spendingByWeekday = new Chart(ctx, {
        type: 'bar',
        data: { labels: days, datasets: [{ data: sums, backgroundColor: colors, borderRadius: { topLeft: 10, topRight: 10, bottomLeft: 3, bottomRight: 3 }, borderSkipped: false }] },
        options: {
            layout: { padding: { bottom: 30 } },
            scales: {
                x: {
                    ticks: { color: getCssVar('--secondary-color', '#fff') },
                    grid : { display: false }
                },
                y: {
                    ticks: {
                        color   : getCssVar('--secondary-color', '#fff'),
                        callback: formatNumber
                    },
                    grid: { color: 'rgba(128,128,128,0.1)', drawBorder: false }
                }
            },
            plugins: {
                legend : { display: false },
                tooltip: {
                    ...buildTooltipDefaults(),
                    callbacks: {
                        title: c => `${c[0]?.label || ''} — траты`,
                        label: c => withCurrency(c.raw),
                        afterLabel: c => {
                            const dayIdx = c.dataIndex;
                            const allTx = getCurrentBudgetTransactions();
                            const dayTx = allTx.filter(t => t.type === 'expense' && weekdayMon(t.date) === dayIdx);
                            if (!dayTx.length) return [];
                            const avg = (c.raw || 0) / Math.max(dayTx.length, 1);
                            return ['', `Операций: ${dayTx.length}`, `Средний чек: ${withCurrency(avg)}`];
                        }
                    }
                }
            }
        }
    });
}

// -----------------------------------------------------------------
// -----------------------------------------------------------------
// 9. Доходы по источникам
// -----------------------------------------------------------------
function renderIncomeBySourceChart() {
    const el = document.getElementById('anIncomeSources');
    if (!el) return;
    const bd = categoryBreakdown(getCurrentBudgetTransactions(), period, 'income');
    renderSources(el, bd, pick => {
        const d = categoryDetail(allAnalyticsTx(), period, pick.name, { type: 'income', todayISO: todayISO() });
        openCategorySheet(d, { type: 'income', color: pick.color, periodText: periodLabel(period), selected: period });
    });
}
// -----------------------------------------------------------------
// 10. Годовая сводка
// -----------------------------------------------------------------
function renderAnnualSummaryChart() {
    const el = document.getElementById('anSummary');
    if (!el) return;
    const all = allAnalyticsTx();
    const { first, last } = dataRange(all);
    const keys = summaryKeys(period, viewYear, first, last);
    renderSummary(el, summaryRows(all, keys), {
        period,
        title: period.all ? 'Всё время' : String(viewYear),
        onToggle: key => setPeriod(toggleMonth(period, key, viewYear), { keepHero: true })
    });
}

// -----------------------------------------------------------------
// 11. Экспорт
// -----------------------------------------------------------------
export {
    destroyAllCharts,
    renderCharts,
    initializeAnalytics,
    renderExpensesByCategoryChart,
    renderTopExpensesChart
};

// перерисовка при смене темы/региона
window.addEventListener('themechange', () => {
    transactionsCache.clear();
    destroyAllCharts();
    renderCharts();
});
window.addEventListener('budgetit:region-changed', () => {
    transactionsCache.clear();
    destroyAllCharts();
    renderCharts();
});