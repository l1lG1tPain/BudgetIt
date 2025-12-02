// ===============================
// Chart.js: аналитика BudgetIt — с кликом по подписям и фиксами списка
// ===============================

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
    Chart.defaults.maintainAspectRatio = false;
    Chart.defaults.aspectRatio        = 2;   // ширина : высота ≈ 2 : 1
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
    expensesByCategoryChart    : 0.5, // 👈 сделал чуть ниже, чтобы круг не упирался в края
    monthlyExpensesChart       : 0.6,
    incomeVsExpensesChart      : 0.1, // 👈 мини-бар-индикатор
    topExpensesChart           : 0.7,
    balanceDynamicsChart       : 0.6,
    categoriesByDescendingChart: 0.7, // чуть выше, чтобы уместить все категории
    categoryHistoryChart       : 0.6,
    spendingByWeekdayChart     : 0.6,
    spendingByAmountRangeChart : 0.6,
    annualSummaryChart         : 0.8
};

function setAdaptiveCanvasHeight(canvas) {
    setCanvasHeight(canvas, HEIGHT_MAP[canvas?.id] ?? 0.6);
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


// ------------------------------------------------------------------
// 1) Хранилище графиков и вспомогательные карты
// ------------------------------------------------------------------
let charts           = {};
const canvasHandlers = new Map();

// ------------------------------------------------------------------
// 2) Переменные состояния
// ------------------------------------------------------------------
let currentSlideIndex           = 0;
let analyticsSwipeInited        = false;
let swipeLocked                 = false;
let budgetManagerInstance       = null;

// что выбрано в шторке аналитики
let currentAnalyticsMonthFilter = 'all';  // 'all' или '01'..'12'
let currentAnalyticsYearFilter  = null;   // число, например 2025

const ANALYTICS_MONTH_STORAGE_KEY = 'budgetit:analytics:month';

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

    initAnalyticsMonthPicker();
    renderCharts();

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
            renderSpendingByAmountRangeChart
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
        'spendingByAmountRange'
    ];
    return charts[chartKeys[index]];
}

// ------------------------------------------------------------------
// 5) Рендер всех графиков
// ------------------------------------------------------------------
function renderCharts() {
    if (!budgetManagerInstance) {
        console.warn('[Charts] budgetManagerInstance is null');
        return;
    }
    // При полном рендере — очищаем кэш, чтобы новые настройки (фильтры) корректно применялись.
    transactionsCache.clear();
    destroyAllCharts();

    [
        renderExpensesByCategoryChart,
        renderMonthlyExpensesChart,
        renderIncomeVsExpensesChart,
        renderTopExpensesChart,
        renderBalanceDynamicsChart,
        renderCategoriesByDescendingChart,
        renderCategoryHistoryChart,
        renderSpendingByWeekdayChart,
        renderSpendingByAmountRangeChart,
        renderAnnualSummaryChart
    ].forEach(fn => fn());
}

function destroyAllCharts() {
    Object.keys(charts).forEach(key => {
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
function applyAnalyticsMonthFilter(rawValue) {
    const labelEl       = document.getElementById('analytics-month-label');
    const yearDisplayEl = document.getElementById('year-display');
    let value = rawValue;

    // обновляем текущий год аналитики из общей шторки месяцев
    if (yearDisplayEl) {
        const parsedYear = parseInt((yearDisplayEl.textContent || '').trim(), 10);
        currentAnalyticsYearFilter = Number.isFinite(parsedYear) ? parsedYear : null;
    } else {
        currentAnalyticsYearFilter = null;
    }

    if (!value || value === 'all') {
        currentAnalyticsMonthFilter = 'all';
        if (labelEl) labelEl.textContent = 'Все месяцы';
    } else {
        // нормализуем в формат "MM"
        const num = Number(value);
        const mm  = Number.isFinite(num)
            ? String(num).padStart(2, '0')
            : String(value).padStart(2, '0');

        currentAnalyticsMonthFilter = mm;
        const name = getMonthNameByNumber(mm);
        if (labelEl) labelEl.textContent = name || mm;
    }

    // сохраняем выбор и перерисовываем
    localStorage.setItem(ANALYTICS_MONTH_STORAGE_KEY, currentAnalyticsMonthFilter);
    transactionsCache.clear();
    renderCharts();
}

function initAnalyticsMonthPicker() {
    const btn          = document.getElementById('analytics-month-btn');
    const headerBtn    = document.getElementById('month-picker-btn'); // кнопка из хедера
    const sheet        = document.getElementById('month-picker-sheet');
    const monthsGrid   = sheet?.querySelector('.months-grid');
    const allMonthsBtn = sheet?.querySelector('#all-months-btn');

    // Восстановим сохранённый выбор до первого рендера графиков
    const saved = localStorage.getItem(ANALYTICS_MONTH_STORAGE_KEY) || 'all';
    currentAnalyticsMonthFilter = saved;

    // Обновляем подпись на кнопке (без перерисовки графиков — это сделает initializeAnalytics)
    const labelEl = document.getElementById('analytics-month-label');
    if (labelEl) {
        if (saved === 'all') {
            labelEl.textContent = 'Все месяцы';
        } else {
            labelEl.textContent = getMonthNameByNumber(saved) || saved;
        }
    }

    // стартовый год для аналитики берём из year-display
    const yearDisplayEl = document.getElementById('year-display');
    if (yearDisplayEl) {
        const parsedYear = parseInt((yearDisplayEl.textContent || '').trim(), 10);
        currentAnalyticsYearFilter = Number.isFinite(parsedYear) ? parsedYear : null;
    }


    // Клик по кнопке в шапке аналитики просто проксирует к глобальной,
    // которая уже умеет открывать/закрывать bottom-sheet с месяцами.
    if (btn && headerBtn) {
        btn.addEventListener('click', () => headerBtn.click());
    }

    // "Все месяцы"
    if (allMonthsBtn) {
        allMonthsBtn.addEventListener('click', () => applyAnalyticsMonthFilter('all'));
    }

    // Клик по конкретному месяцу
    if (monthsGrid) {
        monthsGrid.addEventListener('click', e => {
            const item = e.target.closest('.month-item');
            if (!item) return;

            let monthVal = item.dataset.month;

            // На всякий случай умеем считывать по тексту, если нет data-month
            if (!monthVal) {
                const txt = (item.textContent || '').trim().toLowerCase();
                const map = {
                    'январь':'01','февраль':'02','март':'03','апрель':'04',
                    'май':'05','июнь':'06','июль':'07','август':'08',
                    'сентябрь':'09','октябрь':'10','ноябрь':'11','декабрь':'12',
                    'янв':'01','фев':'02','мар':'03','апр':'04',
                    'июн':'06','июл':'07','авг':'08',
                    'сен':'09','сент':'09','окт':'10','ноя':'11','дек':'12'
                };
                monthVal = map[txt] || null;
            }

            if (!monthVal) return;
            applyAnalyticsMonthFilter(monthVal);
        });
    }
}


// ------------------------------------------------------------------
// 7) Получение транзакций
// ------------------------------------------------------------------
function getCurrentBudgetTransactions(filterByMonth = true) {
    const useMonth = filterByMonth && currentAnalyticsMonthFilter !== 'all';

    // ключ кэша теперь учитывает и год, чтобы "11.2025" и "11.2026" не путались
    const yearPart = useMonth && currentAnalyticsYearFilter
        ? `:${currentAnalyticsYearFilter}`
        : '';
    const key = useMonth
        ? `month:${currentAnalyticsMonthFilter}${yearPart}`
        : 'allmonths';

    if (transactionsCache.has(key)) return transactionsCache.get(key);

    const tx = budgetManagerInstance?.getCurrentBudget()?.transactions || [];
    if (!tx.length) {
        transactionsCache.set(key, []);
        return [];
    }

    const excluded = [
        'Не знаю на что потратил (без учёта)',
        'Другая категория (без учёта)'
    ];
    const filtered = tx.filter(t => !excluded.includes(t.category));

    let result;

    if (!useMonth) {
        // все месяцы и все годы
        result = filtered;
    } else {
        result = filtered.filter(t => {
            if (!t.date) return false;
            const dateStr = t.date;           // 'YYYY-MM-DD'
            const mm      = dateStr.slice(5, 7);
            if (mm !== currentAnalyticsMonthFilter) return false;

            // если год выбран — тоже проверяем
            if (currentAnalyticsYearFilter) {
                const yy = Number(dateStr.slice(0, 4));
                if (!Number.isFinite(yy) || yy !== currentAnalyticsYearFilter) return false;
            }
            return true;
        });
    }

    transactionsCache.set(key, result);
    return result;
}



// ------------------------------------------------------------------
// 8) Утилиты
// ------------------------------------------------------------------
const formatNumber = n =>
    n.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

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

    const ctx = canvas.getContext('2d');
    const tx  = getCurrentBudgetTransactions();

    const map = {};
    tx.filter(t => t.type === 'expense').forEach(t => {
        const cat = t.category || 'Без категории';
        map[cat]  = (map[cat] || 0) + amtOf(t);
    });

    // Полная сортировка по всем категориям
    const allEntries = Object.entries(map).sort((a, b) => b[1] - a[1]);
    const totalAll   = allEntries.reduce((s, [, v]) => s + v, 0);

    // топ N + "Другие"
    const TOP_N  = 15;
    const top    = allEntries.slice(0, TOP_N);
    const others = allEntries.slice(TOP_N);
    const otherSum = others.reduce((s, [, v]) => s + v, 0);

    const labels = top.map(([c]) => c);
    const data   = top.map(([, a]) => a);

    if (otherSum > 0) {
        labels.push('Другие');
        data.push(otherSum);
    }

    ensureNonEmptyData(labels, data);

    const colors = labels.map((_, i) => {
        const hue = (i * 360 / labels.length + 15) % 360;
        const sat = 75;
        const light = 55;
        return `hsl(${hue}, ${sat}%, ${light}%)`;
    });


    // убиваем старый график, если есть
    if (charts.expensesByCategory) {
        try { charts.expensesByCategory.destroy(); } catch (e) {}
        delete charts.expensesByCategory;
    }

    // Центр пончика
    const centerEl = document.getElementById('expensesByCategoryCenterText');

    const updateCenterTotal = () => {
        if (!centerEl) return;
        centerEl.innerHTML =
            `<div class="center-total">${formatNumber(totalAll)}</div>` +
            `<div class="center-label">${getCurrencyLabel()}</div>`;
    };

    const updateCenterForIndex = (idx) => {
        if (!centerEl) return;
        const val   = data[idx]   || 0;
        const label = labels[idx] || '';
        centerEl.innerHTML =
            `<div class="center-total">${withCurrency(val)}</div>` +
            `<div class="center-label">${label}</div>`;
    };

    let lastLegendIndex = null;
    let chart;

    charts.expensesByCategory = chart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: colors,
                // делаем дуги толще и более «капсульными»
                borderWidth : 0,
                borderRadius: 0,
                hoverOffset : 22,
                // без зазоров между секторами
                spacing     : 0
            }]
        },
        options: {
            // пончик толще и старт сверху
            cutout   : '55%',
            rotation : -0.5 * Math.PI,
            plugins  : {
                legend: {
                    position: 'bottom',
                    labels  : {
                        color        : getCssVar('--secondary-color', '#fff'),
                        usePointStyle: true,
                        pointStyle   : 'circle',
                        padding      : 14,
                        font         : { size: 12 }
                    },
                    // клик по названию категории
                    onClick: (evt, legendItem) => {
                        const idx = legendItem.index;
                        if (idx == null) return;

                        // повторный клик — снимаем выделение
                        if (lastLegendIndex === idx) {
                            lastLegendIndex = null;
                            chart.setActiveElements([]);
                            chart.tooltip.setActiveElements([], { x: 0, y: 0 });
                            chart.update();
                            updateCenterTotal();
                            return;
                        }

                        lastLegendIndex = idx;
                        chart.setActiveElements([{ datasetIndex: 0, index: idx }]);
                        chart.tooltip.setActiveElements(
                            [{ datasetIndex: 0, index: idx }],
                            { x: 0, y: 0 }
                        );
                        chart.update();
                        updateCenterForIndex(idx);

                        const label = labels[idx];
                        if (label) {
                            selectedAnalyticsCategory = label;
                            // перерисовываем историю категории
                            try {
                                if (charts.categoryHistory) {
                                    charts.categoryHistory.destroy();
                                    delete charts.categoryHistory;
                                }
                            } catch (e) {}
                            renderCategoryHistoryChart();
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: c => `${c.label}: ${withCurrency(c.raw)}`
                    }
                }
            }
        }
    });



    // дефолтный центр — общий итог
    updateCenterTotal();

    // Если пользователь ещё не выбирал категорию – поставим по умолчанию первую
    if (!selectedAnalyticsCategory) {
        const firstLabel = chart.data?.labels?.[0];
        selectedAnalyticsCategory = firstLabel || '';
    }

    // 👉 клик по самому пончику
    const clickHandler = (evt) => {
        const elems = chart.getElementsAtEventForMode(
            evt,
            'nearest',
            { intersect: true },
            true
        );
        if (!elems || !elems.length) return;

        const idx   = elems[0].index;
        const label = chart.data.labels[idx];
        if (!label) return;

        selectedAnalyticsCategory = label;
        lastLegendIndex = idx;

        chart.setActiveElements([{ datasetIndex: 0, index: idx }]);
        chart.tooltip.setActiveElements(
            [{ datasetIndex: 0, index: idx }],
            { x: evt.offsetX, y: evt.offsetY }
        );
        chart.update();
        updateCenterForIndex(idx);

        try {
            if (charts.categoryHistory) {
                charts.categoryHistory.destroy();
                delete charts.categoryHistory;
            }
        } catch (e) {}
        renderCategoryHistoryChart();
    };
    bindClickOnce(canvas, clickHandler);
}


// -----------------------------------------------------------------
// 2. Ежемесячные расходы/доходы
// -----------------------------------------------------------------
function renderMonthlyExpensesChart() {
    const canvas = document.getElementById('monthlyExpensesChart');
    if (!canvas) return;
    setAdaptiveCanvasHeight(canvas);

    const ctx = canvas.getContext('2d');
    const tx  = getCurrentBudgetTransactions(false);

    const months      = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
    const monthlyData = {};

    tx.forEach(t => {
        if (t.type !== 'income' && t.type !== 'expense') return;
        const d   = new Date(t.date);
        const key = `${months[d.getMonth()]} ${d.getFullYear()}`;
        monthlyData[key] = monthlyData[key] || { income: 0, expense: 0 };
        monthlyData[key][t.type] += amtOf(t);
    });

    const keys = Object.keys(monthlyData).sort((a, b) => {
        const [mA, yA] = a.split(' '), [mB, yB] = b.split(' ');
        return (+yA - +yB) || (months.indexOf(mA) - months.indexOf(mB));
    });
    const income  = keys.map(k => monthlyData[k].income);
    const expense = keys.map(k => monthlyData[k].expense);

    ensureNonEmptyData(keys, income);
    ensureNonEmptyData(keys, expense);

    charts.monthlyExpenses = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: keys,
            datasets: [
                {
                    label: 'Доходы',
                    data : income,
                    backgroundColor: getCssVar('--primary-color', 'hsl(160,80%,60%)'),
                    borderRadius   : 10
                },
                {
                    label: 'Расходы',
                    data : expense,
                    backgroundColor: getCssVar('--expense-color', 'hsl(0,80%,60%)'),
                    borderRadius   : 10
                }
            ]
        },
        options: {
            layout: { padding: { bottom: 60 } },
            scales: {
                x: {
                    ticks: {
                        color: getCssVar('--secondary-color', '#fff'),
                        maxRotation: 0,
                        minRotation: 0
                    },
                    grid: { display: false }
                },
                y: {
                    ticks: {
                        color   : getCssVar('--secondary-color', '#fff'),
                        callback: formatNumber
                    },
                    grid: {
                        color: 'rgba(255,255,255,0.06)'
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: c => `${c.dataset.label}: ${withCurrency(c.raw)}`
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
            ctx.font = '12px system-ui';
            ctx.fillStyle = getCssVar('--secondary-color', '#fff');
            ctx.textBaseline = 'top';

            // округляем до целых
            const roundedIncome  = Math.round(income);
            const roundedExpense = Math.round(expense);

            const textIncome  = `Доход: ${withCurrency(roundedIncome)}`;
            const textExpense = `${withCurrency(roundedExpense)} :Расход`;

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
                    label: 'Доходы',
                    data : [safeIncome],
                    backgroundColor: getCssVar('--primary-color', 'hsl(160,80%,60%)'),
                    borderRadius   : 999
                },
                {
                    label: 'Расходы',
                    data : [safeExpense],
                    backgroundColor: getCssVar('--expense-color', 'hsl(0,80%,60%)'),
                    borderRadius   : 999
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
                            const value = label === 'Доходы' ? income : expense;
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
    const canvas = document.getElementById('topExpensesChart');
    if (!canvas) return;
    setAdaptiveCanvasHeight(canvas);

    const ctx = canvas.getContext('2d');
    const tx  = getCurrentBudgetTransactions();

    const map = {};
    tx.filter(t => t.type === 'expense').forEach(t => {
        const label = t.products?.[0]?.name || t.category || 'Без категории';
        map[label]  = (map[label] || 0) + amtOf(t);
    });

    const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 25);
    const labels = sorted.map(([l]) => l);
    const data   = sorted.map(([, a]) => a);

    ensureNonEmptyData(labels, data);
    const colors = labels.map((_, i) =>
        `hsl(${360 - i * 24}, 70%, 60%)`
    );

    charts.topExpenses = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ data, backgroundColor: colors }] },
        options: {
            indexAxis: 'y',
            layout   : { padding: { left: 10, right: 10, bottom: 24, top: 6 } },
            scales   : {
                y: {
                    offset: true,
                    ticks: {
                        color     : getCssVar('--secondary-color', '#fff'),
                        autoSkip  : false,
                        maxRotation: 0,
                        padding   : 6,
                        font      : { size: 12 }
                    },
                    grid: { display: false }
                },
                x: {
                    ticks: {
                        color   : getCssVar('--secondary-color', '#fff'),
                        callback: formatNumber
                    },
                    grid: { color: 'rgba(255,255,255,0.06)' }
                }
            },
            plugins : {
                legend : { display: false },
                tooltip: { callbacks: { label: c => withCurrency(c.raw) } }
            },
            elements: {
                bar: {
                    borderRadius   : 20,
                    // адаптивная толщина
                    barThickness   : Math.max(12, 32 - Math.floor(labels.length / 2)),
                    maxBarThickness: 28,
                    minBarLength   : 8
                }
            }
        }
    });

    const chart  = charts.topExpenses;
    const yScale = chart.scales.y;

    const clickH = evt => {
        const { offsetX, offsetY } = evt;
        // если кликнули по подписям слева — тоже считаем индекс
        const idx = indexFromY(yScale, offsetY);
        if (idx >= 0 && idx < yScale.ticks.length &&
            (offsetX < yScale.left || offsetX > yScale.left)) {
            activateBar(chart, idx);
        }
    };
    bindClickOnce(canvas, clickH);
}

// -----------------------------------------------------------------
// 5. Динамика баланса
// -----------------------------------------------------------------
function renderBalanceDynamicsChart() {
    const canvas = document.getElementById('balanceDynamicsChart');
    if (!canvas) return;
    setAdaptiveCanvasHeight(canvas);

    const ctx = canvas.getContext('2d');
    const tx  = getCurrentBudgetTransactions();

    const dayMap = {};
    tx.forEach(t => {
        const key = t.date.slice(0, 10);
        dayMap[key] = (dayMap[key] || 0) +
            (t.type === 'income' ? amtOf(t) : t.type === 'expense' ? -amtOf(t) : 0);
    });

    const sortedDays = Object.keys(dayMap).sort();
    let balance = 0;
    const data  = sortedDays.map(d => balance += dayMap[d]);

    ensureNonEmptyData(sortedDays, data);

    charts.balanceDynamics = new Chart(ctx, {
        type: 'line',
        data: {
            labels: sortedDays,
            datasets: [{
                data     : data,
                tension  : 0.3,
                borderWidth: 3,
                borderColor: getCssVar('--primary-color', 'hsl(160,80%,60%)'),
                pointRadius: 0,
                fill       : false
            }]
        },
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
                    grid: { color: 'rgba(255,255,255,0.06)' }
                }
            },
            plugins: {
                legend : { display: false },
                tooltip: { callbacks: { label: c => withCurrency(c.raw) } }
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
    setAdaptiveCanvasHeight(canvas);

    const ctx = canvas.getContext('2d');
    const tx  = getCurrentBudgetTransactions();

    // Берём категорию из выбранной глобальной переменной, иначе fall back на первый label
    const catFromChart = charts.expensesByCategory?.data?.labels?.[0] || '';
    const cat = selectedAnalyticsCategory || catFromChart || '';

    // Если выбран 'Другие' — нужно собрать список категорий, которые попали в "Другие"
    let filterFn;
    if (cat === 'Другие') {
        // Снова агрегируем ВСЕ категории и определяем, какие попали в others
        const tmpMap = {};
        tx.filter(t => t.type === 'expense').forEach(t => {
            const c = t.category || 'Без категории';
            tmpMap[c] = (tmpMap[c] || 0) + amtOf(t);
        });
        const entries     = Object.entries(tmpMap).sort((a, b) => b[1] - a[1]);
        const othersNames = entries.slice(10).map(([c]) => c); // те же TOP_N=10
        filterFn = t => othersNames.includes(t.category) && t.type === 'expense';
    } else {
        filterFn = t => t.category === cat && t.type === 'expense';
    }

    const monthMap = {};
    tx.filter(filterFn).forEach(t => {
        const d   = new Date(t.date);
        const key = `${String(d.getMonth() + 1).padStart(2,'0')}/${d.getFullYear()}`;
        monthMap[key] = (monthMap[key] || 0) + amtOf(t);
    });

    const labels = Object.keys(monthMap).sort((a, b) => {
        const [mA, yA] = a.split('/').map(Number), [mB, yB] = b.split('/').map(Number);
        return (yA - yB) || (mA - mB);
    });
    const data = labels.map(k => monthMap[k]);

    ensureNonEmptyData(labels, data);

    charts.categoryHistory = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                data       : data,
                tension    : 0.4,
                borderWidth: 3,
                borderColor: getCssVar('--primary-color', 'hsl(160,80%,60%)'),
                pointRadius: 3,
                pointHoverRadius: 4,
                fill       : false
            }]
        },
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
                    grid: { color: 'rgba(255,255,255,0.06)' }
                }
            },
            plugins: {
                legend : { display: false },
                tooltip: { callbacks: { label: c => withCurrency(c.raw) } }
            }
        }
    });
}

// -----------------------------------------------------------------
// 7. Категории по убыванию (фиксы видимости + клик по подписям)
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
    setAdaptiveCanvasHeight(canvas);

    const ctx = canvas.getContext('2d');
    const tx  = getCurrentBudgetTransactions();

    const map = {};
    tx.filter(t => t.type === 'expense').forEach(t => {
        const cat = t.category || 'Без категории';
        map[cat]  = (map[cat] || 0) + amtOf(t);
    });

    const sorted     = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 30);
    const fullLabels = sorted.map(([c]) => c);
    const data       = sorted.map(([, a]) => a);

    // визуальные подписи: многострочные
    const labels = fullLabels.map(l => wrapLabel(l, 18));
    ensureNonEmptyData(labels, data);

    // динамическая высота под количество строк
    const rowH     = 30; // ~высота строки с межстрочным
    const extra    = 70; // сверху/снизу + ось X
    const desiredH = Math.min(
        window.innerHeight * 0.7,
        Math.max(260, labels.length * rowH + extra)
    );
    canvas.style.height = `${Math.round(desiredH)}px`;
    canvas.height       = Math.round(desiredH) * window.devicePixelRatio;

    // толщина баров из высоты
    const barThickness = Math.max(
        12,
        Math.min(
            28,
            Math.floor((desiredH - extra) / Math.max(labels.length, 1)) - 6
        )
    );

    const colors = labels.map((_, i) =>
        `hsl(${i * 360 / Math.max(labels.length, 1)}, 70%, 60%)`
    );

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
                    callbacks: {
                        label: ctx => ` ${withCurrency(ctx.raw)}`
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
    setAdaptiveCanvasHeight(canvas);

    const ctx = canvas.getContext('2d');
    const tx  = getCurrentBudgetTransactions();

    const days = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
    const sums = Array(7).fill(0);

    tx.filter(t => t.type === 'expense').forEach(t => {
        sums[new Date(t.date).getDay()] += amtOf(t);
    });

    ensureNonEmptyData(days, sums);
    const colors = days.map((_, i) => `hsl(${i * 50},70%,60%)`);

    charts.spendingByWeekday = new Chart(ctx, {
        type: 'bar',
        data: { labels: days, datasets: [{ data: sums, backgroundColor: colors, borderRadius: 10 }] },
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
                    grid: { color: 'rgba(255,255,255,0.06)' }
                }
            },
            plugins: {
                legend : { display: false },
                tooltip: { callbacks: { label: c => withCurrency(c.raw) } }
            }
        }
    });
}

// -----------------------------------------------------------------
// 9. Траты по размеру чека (кол-во чеков)
// -----------------------------------------------------------------
function renderSpendingByAmountRangeChart() {
    const canvas = document.getElementById('spendingByAmountRangeChart');
    if (!canvas) return;
    setAdaptiveCanvasHeight(canvas);

    const ctx = canvas.getContext('2d');
    const tx  = getCurrentBudgetTransactions();

    const ranges = {
        '<100 000'             : 0,
        '100 000–500 000'      : 0,
        '500 000–1 000 000'    : 0,
        '1 000 000–5 000 000'  : 0,
        '5 000 000–10 000 000' : 0,
        '>10 000 000'          : 0
    };

    tx.filter(t => t.type === 'expense').forEach(t => {
        const a = amtOf(t);
        if      (a < 100_000)    ranges['<100 000']++;
        else if (a < 500_000)    ranges['100 000–500 000']++;
        else if (a < 1_000_000)  ranges['500 000–1 000 000']++;
        else if (a < 5_000_000)  ranges['1 000 000–5 000 000']++;
        else if (a < 10_000_000) ranges['5 000 000–10 000 000']++;
        else                     ranges['>10 000 000']++;
    });

    const labels = Object.keys(ranges);
    const data   = Object.values(ranges);
    ensureNonEmptyData(labels, data);

    const baseColors = [
        'rgb(43,232,42)','rgb(42,172,232)','rgb(232,43,42)',
        'rgb(138,43,226)','hsl(270,70%,60%)','hsl(320,70%,60%)'
    ];

    charts.spendingByAmountRange = new Chart(ctx, {
        type: 'pie',
        data: { labels, datasets: [{ data, backgroundColor: baseColors }] },
        options: {
            layout : { padding: { top: 10, bottom: 50, left: 10, right: 10 } },
            plugins: {
                legend : {
                    position: 'bottom',
                    labels  : { color: getCssVar('--secondary-color', '#fff') }
                },
                tooltip: { callbacks: { label: c => `${c.label}: ${c.raw} чеков` } }
            }
        }
    });
}

// -----------------------------------------------------------------
// 10. Годовая сводка
// -----------------------------------------------------------------
function renderAnnualSummaryChart() {
    const	canvas = document.getElementById('annualSummaryChart');
    if (!canvas || !budgetManagerInstance?.calculateTotals) return;
    setAdaptiveCanvasHeight(canvas);

    const ctx = canvas.getContext('2d');

    const months = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
    const keys   = [...Array(12)].map((_, i) => String(i + 1).padStart(2, '0'));

    const dataBudget = [], dataIncome = [], dataExpense = [], dataDeposit = [], dataDebt = [];

    keys.forEach(m => {
        const r = budgetManagerInstance.calculateTotals(m);
        dataBudget.push(r.overallBudget);
        dataIncome .push(r.monthlyIncome);
        dataExpense.push(r.monthlyExpense);
        dataDeposit.push(r.depositBalance);
        dataDebt  .push(r.totalDebt);
    });

    charts.annualSummary = new Chart(ctx, {
        type: 'bar',
        data: {
            labels  : months,
            datasets: [
                { label: 'Бюджет', data: dataBudget,  backgroundColor: 'hsl(130,70%,60%)' },
                { label: 'Доходы', data: dataIncome,  backgroundColor: 'hsl(210,70%,60%)' },
                { label: 'Расходы',data: dataExpense, backgroundColor: 'hsl(0,70%,60%)'   },
                { label: 'Вклад',  data: dataDeposit, backgroundColor: 'hsl(270,70%,60%)' },
                { label: 'Долг',   data: dataDebt,    backgroundColor: 'hsl(45,70%,60%)'  }
            ]
        },
        options: {
            layout : { padding: { top: 10, bottom: 30 } },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: c => `${c.dataset.label}: ${withCurrency(c.raw)}`
                    }
                },
                legend : {
                    position: 'bottom',
                    labels  : {
                        boxWidth : 14,
                        boxHeight: 14,
                        padding  : 12,
                        font     : { size: 12 },
                        color    : getCssVar('--secondary-color', '#fff')
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        font : { size: 11 },
                        color: getCssVar('--secondary-color', '#fff')
                    }
                },
                y: {
                    ticks: {
                        font    : { size: 11 },
                        color   : getCssVar('--secondary-color', '#fff'),
                        callback: formatNumber
                    }
                }
            }
        }
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
