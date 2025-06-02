// ===============================
// Chart.js: аналитика BudgetIt
// ===============================

// --- глобальные настройки Chart.js ------------------------------
Chart.defaults.maintainAspectRatio = false; // управляем высотой сами
Chart.defaults.aspectRatio        = 2;     //  ширина : высота ≈ 2 : 1

const CHART_DEFAULT_HEIGHT = 260;          // базовая высота всех графиков

function setCanvasHeight(canvas, pct = 0.6) {
  if (!canvas) return;

  const cssPx = Math.round(window.innerHeight * pct);      // 50 % окна
  canvas.style.height = cssPx + 'px';                      // CSS-высота
  canvas.height       = cssPx * window.devicePixelRatio;   // внутренний буфер
}

// ----------------------------------------------------------------

// 1) Хранилище экземпляров графиков
let charts = {};

// 2) Переменные
let currentSlideIndex = 0;
let analyticsSwipeInited = false;
let swipeLocked = false;
let budgetManagerInstance = null;
let currentAnalyticsMonthFilter = 'all';

// 3) Инициализация аналитики
function initializeAnalytics(budgetManager) {
  budgetManagerInstance = budgetManager;

  if (typeof getSavedTheme === 'function' && typeof setTheme === 'function') {
    setTheme(getSavedTheme());
  }

  const settingsPage = document.getElementById('settings-page');
  const wasHidden = settingsPage.classList.contains('hidden');
  if (wasHidden) settingsPage.classList.remove('hidden');

  setupAnalyticsFilter();
  renderCharts();

  if (wasHidden) settingsPage.classList.add('hidden');
}

// 5) Переключение слайда (оставлено на будущее)
function showAnalyticsSlide(index) {
  const container = document.querySelector('.analytics-slides-container');
  const dots = document.querySelectorAll('.analytics-dots .dot');
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

// Проверка, построен ли график
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

// 6) Рендер всех графиков
function renderCharts() {
  if (!budgetManagerInstance) {
    console.warn('[Charts] budgetManagerInstance is null');
    return;
  }

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

// Уничтожение всех графиков
function destroyAllCharts() {
  Object.keys(charts).forEach(key => {
    if (charts[key]) {
      charts[key].destroy();
      charts[key] = null;
    }
  });
}

// Навесим обработку выбора месяца
function setupAnalyticsFilter() {
  const customSelect = document.getElementById('analytics-custom-select');
  if (!customSelect) return;

  const selected = customSelect.querySelector('.custom-select-button');
  const options   = customSelect.querySelector('.custom-select-options');

  selected.textContent = 'Все месяцы ▼';
  currentAnalyticsMonthFilter = 'all';

  options.classList.remove('hidden');
  options.classList.add('hidden');

  selected.addEventListener('click', e => {
    e.stopImmediatePropagation();
    options.classList.toggle('hidden');
  });

  options.querySelectorAll('div').forEach(option => {
    option.addEventListener('click', e => {
      e.stopPropagation();
      selected.textContent = option.textContent + ' ▼';
      currentAnalyticsMonthFilter = option.getAttribute('data-value');
      options.classList.add('hidden');
      destroyAllCharts();
      renderCharts();
    });
  });

  document.addEventListener('click', e => {
    if (!customSelect.contains(e.target)) options.classList.add('hidden');
  });
}

// 7) Получение транзакций с исключением категорий
function getCurrentBudgetTransactions(filterByMonth = true) {
  const tx = budgetManagerInstance?.getCurrentBudget()?.transactions || [];
  if (!tx.length) return [];

  const excluded = ['Не знаю на что потратил (без учёта)', 'Другая категория (без учёта)'];
  const filtered = tx.filter(t => !excluded.includes(t.category));

  if (currentAnalyticsMonthFilter === 'all' || !filterByMonth) return filtered;

  return filtered.filter(t =>
      new Date(t.date).toISOString().slice(5, 7) === currentAnalyticsMonthFilter
  );
}

// 8) Форматирование чисел
const formatNumber = n =>
    n.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

// 9) Для пустых графиков
function ensureNonEmptyData(labels, data) {
  if (!data.length) {
    labels.push('');
    data.push(0.001);
  }
}

// -----------------------------------------------------------------
// 1. Расходы по категориям (doughnut)
// -----------------------------------------------------------------
function renderExpensesByCategoryChart() {
  const canvas = document.getElementById('expensesByCategoryChart');
  if (!canvas) return;
  setCanvasHeight(canvas, 0.6);

  const ctx = canvas.getContext('2d');
  const tx  = getCurrentBudgetTransactions();

  const map = {};
  tx.filter(t => t.type === 'expense').forEach(t => {
    const cat = t.category || 'Без категории';
    map[cat] = (map[cat] || 0) + t.amount;
  });

  const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const labels = sorted.map(([c]) => c);
  const data   = sorted.map(([, a]) => a);

  ensureNonEmptyData(labels, data);
  const colors = labels.map((_, i) => `hsl(${i * 360 / labels.length}, 70%, 60%)`);

  charts.expensesByCategory = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
    options: {
      cutout: '65%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: getComputedStyle(document.documentElement).getPropertyValue('--secondary-color') }
        }
      }
    }
  });

  const center = document.getElementById('expensesByCategoryCenterText');
  if (center)
    center.innerHTML = `<div class="center-total">${formatNumber(data.reduce((s, v) => s + v, 0))}</div><div class="center-label">сум</div>`;
}

// -----------------------------------------------------------------
// 2. Ежемесячные расходы/доходы (bar)
// -----------------------------------------------------------------
function renderMonthlyExpensesChart() {
  const canvas = document.getElementById('monthlyExpensesChart');
  if (!canvas) return;
  setCanvasHeight(canvas, 0.6);

  const ctx = canvas.getContext('2d');
  const tx  = getCurrentBudgetTransactions(false);

  const months      = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
  const monthlyData = {};

  tx.forEach(t => {
    if (t.type !== 'income' && t.type !== 'expense') return;
    const d   = new Date(t.date);
    const key = `${months[d.getMonth()]} ${d.getFullYear()}`;
    monthlyData[key] = monthlyData[key] || { income: 0, expense: 0 };
    monthlyData[key][t.type] += t.amount;
  });

  const keys    = Object.keys(monthlyData).sort((a, b) => {
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
        { label: 'Доходы', data: income,  backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--primary-color') },
        { label: 'Расходы', data: expense, backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--expense-color') }
      ]
    },
    options: {
      layout: { padding: { bottom: 60 } },
      scales: {
        x: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--secondary-color') } },
        y: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--secondary-color'), callback: formatNumber } }
      },
      plugins: {
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${formatNumber(ctx.raw)} сум` } }
      }
    }
  });
}

// -----------------------------------------------------------------
// 3. Доходы vs Расходы (pie)
// -----------------------------------------------------------------
function renderIncomeVsExpensesChart() {
  const canvas = document.getElementById('incomeVsExpensesChart');
  if (!canvas) return;
  setCanvasHeight(canvas, 0.6);

  const ctx = canvas.getContext('2d');
  const tx  = getCurrentBudgetTransactions();

  const income  = tx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = tx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  const labels = ['Доходы', 'Расходы'];
  const data   = [income, expense];
  ensureNonEmptyData(labels, data);

  charts.incomeVsExpenses = new Chart(ctx, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: [
          getComputedStyle(document.documentElement).getPropertyValue('--primary-color'),
          getComputedStyle(document.documentElement).getPropertyValue('--expense-color')
        ]
      }]
    },
    options: {
      layout: { padding: { bottom: 40 } },
      plugins: {
        tooltip: {
          callbacks: {
            label: ctx => {
              const total = income + expense;
              const pct   = total ? Math.round(ctx.raw / total * 100) : 0;
              return `${ctx.label}: ${formatNumber(ctx.raw)} сум (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

// -----------------------------------------------------------------
// 4. Топ расходов (horizontal bar)
// -----------------------------------------------------------------
function renderTopExpensesChart() {
  const canvas = document.getElementById('topExpensesChart');
  if (!canvas) return;
  setCanvasHeight(canvas, 0.6);

  const ctx = canvas.getContext('2d');
  const tx  = getCurrentBudgetTransactions();

  const map = {};
  tx.filter(t => t.type === 'expense').forEach(t => {
    const label = t.products?.[0]?.name || t.category || 'Без категории';
    map[label]  = (map[label] || 0) + t.amount;
  });

  const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 15);
  const labels = sorted.map(([l]) => l);
  const data   = sorted.map(([, a]) => a);

  ensureNonEmptyData(labels, data);
  const colors = labels.map((_, i) => `hsl(${360 - i * 36}, 70%, 60%)`);

  charts.topExpenses = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: colors }] },
    options: {
      indexAxis: 'y',
      layout: { padding: { bottom: 30 } },
      scales: {
        y: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--secondary-color') } },
        x: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--secondary-color'), callback: formatNumber } }
      },
      plugins: { legend: { display: false } },
      elements: { bar: { borderRadius: 30, barThickness: 30, maxBarThickness: 30, minBarLength: 10 } }
    }
  });

  // кликабельные бары
  const chart  = charts.topExpenses;
  const yScale = chart.scales.y;
  chart.canvas.addEventListener('click', evt => {
    const { offsetY } = evt;
    const step = (yScale.bottom - yScale.top) / yScale.ticks.length;
    const idx  = Math.floor((offsetY - yScale.top) / step);
    if (idx >= 0 && idx < yScale.ticks.length) {
      chart.setActiveElements([{ datasetIndex: 0, index: idx }]);
      chart.tooltip.setActiveElements([{ datasetIndex: 0, index: idx }], { x: 0, y: 0 });
      chart.update();
    }
  });
}

// -----------------------------------------------------------------
// 5. Динамика баланса (line)
// -----------------------------------------------------------------
function renderBalanceDynamicsChart() {
  const canvas = document.getElementById('balanceDynamicsChart');
  if (!canvas) return;
  setCanvasHeight(canvas, 0.6);

  const ctx = canvas.getContext('2d');
  const tx  = getCurrentBudgetTransactions();

  const dayMap = {};
  tx.forEach(t => {
    const d = new Date(t.date).getDate();
    dayMap[d] = (dayMap[d] || 0) +
        (t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0);
  });

  const days   = Object.keys(dayMap).map(Number).sort((a, b) => a - b);
  let balance  = 0;
  const data   = days.map(d => balance += dayMap[d]);

  ensureNonEmptyData(days, data);

  charts.balanceDynamics = new Chart(ctx, {
    type: 'line',
    data: { labels: days, datasets: [{ data, tension: 0.3, borderColor: getComputedStyle(document.documentElement).getPropertyValue('--primary-color') }] },
    options: {
      layout: { padding: { bottom: 30 } },
      scales: {
        x: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--secondary-color') } },
        y: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--secondary-color'), callback: formatNumber } }
      },
      plugins: { legend: { display: false } }
    }
  });
}

// -----------------------------------------------------------------
// 6. История категории (line)
// -----------------------------------------------------------------
function renderCategoryHistoryChart() {
  const canvas = document.getElementById('categoryHistoryChart');
  if (!canvas) return;
  setCanvasHeight(canvas, 0.6);

  const ctx = canvas.getContext('2d');
  const tx  = getCurrentBudgetTransactions();

  const cat = charts.expensesByCategory?.data?.labels?.[0] || '';

  const monthMap = {};
  tx.filter(t => t.category === cat && t.type === 'expense').forEach(t => {
    const d   = new Date(t.date);
    const key = `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    monthMap[key] = (monthMap[key] || 0) + t.amount;
  });

  const labels = Object.keys(monthMap).sort((a, b) => {
    const [mA, yA] = a.split('/').map(Number), [mB, yB] = b.split('/').map(Number);
    return (yA - yB) || (mA - mB);
  });
  const data = labels.map(k => monthMap[k]);

  ensureNonEmptyData(labels, data);

  charts.categoryHistory = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{ data, tension: 0.4, borderColor: getComputedStyle(document.documentElement).getPropertyValue('--primary-color') }] },
    options: {
      layout: { padding: { bottom: 30 } },
      scales: {
        x: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--secondary-color') } },
        y: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--secondary-color'), callback: formatNumber } }
      },
      plugins: { legend: { display: false } }
    }
  });
}

// -----------------------------------------------------------------
// 7. Категории по убыванию (horizontal bar)
// -----------------------------------------------------------------
function renderCategoriesByDescendingChart() {
  const canvas = document.getElementById('categoriesByDescendingChart');
  if (!canvas) return;
  setCanvasHeight(canvas, 0.6);

  const ctx = canvas.getContext('2d');
  const tx  = getCurrentBudgetTransactions();

  const map = {};
  tx.filter(t => t.type === 'expense').forEach(t => {
    const cat  = t.category || 'Без категории';
    map[cat]    = (map[cat] || 0) + t.amount;
  });

  const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
  const labels = sorted.map(([c]) => c);
  const data   = sorted.map(([, a]) => a);

  ensureNonEmptyData(labels, data);
  const colors = labels.map((_, i) => `hsl(${i * 360 / labels.length}, 70%, 60%)`);

  charts.categoriesByDescending = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: colors }] },
    options: {
      indexAxis: 'y',
      layout: { padding: { bottom: 30 } },
      scales: {
        y: {
          ticks: {
            color: getComputedStyle(document.documentElement).getPropertyValue('--secondary-color'),
            font: { size: Math.max(6, 9 - labels.length / 10) },
            padding: 10
          }
        },
        x: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--secondary-color'), callback: formatNumber } }
      },
      plugins: { legend: { display: false } },
      elements: { bar: { borderRadius: 10, barThickness: 100, maxBarThickness: 30, minBarLength: 40 } }
    }
  });

  // кликабельные бары
  const chart  = charts.categoriesByDescending;
  const yScale = chart.scales.y;
  chart.canvas.addEventListener('click', evt => {
    const { offsetY } = evt;
    const step = (yScale.bottom - yScale.top) / yScale.ticks.length;
    const idx  = Math.floor((offsetY - yScale.top) / step);
    if (idx >= 0 && idx < yScale.ticks.length) {
      chart.setActiveElements([{ datasetIndex: 0, index: idx }]);
      chart.tooltip.setActiveElements([{ datasetIndex: 0, index: idx }], { x: 0, y: 0 });
      chart.update();
    }
  });
}

// -----------------------------------------------------------------
// 8. Траты по дням недели (bar)
// -----------------------------------------------------------------
function renderSpendingByWeekdayChart() {
  const canvas = document.getElementById('spendingByWeekdayChart');
  if (!canvas) return;
  setCanvasHeight(canvas, 0.6);

  const ctx = canvas.getContext('2d');
  const tx  = getCurrentBudgetTransactions();

  const days = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
  const sums = Array(7).fill(0);

  tx.filter(t => t.type === 'expense').forEach(t => {
    sums[new Date(t.date).getDay()] += t.amount;
  });

  ensureNonEmptyData(days, sums);
  const colors = days.map((_, i) => `hsl(${i * 50}, 70%, 60%)`);

  charts.spendingByWeekday = new Chart(ctx, {
    type: 'bar',
    data: { labels: days, datasets: [{ data: sums, backgroundColor: colors }] },
    options: {
      layout: { padding: { bottom: 30 } },
      scales: {
        x: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--secondary-color') } },
        y: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--secondary-color'), callback: formatNumber } }
      },
      plugins: { legend: { display: false } }
    }
  });
}

// -----------------------------------------------------------------
// 9. Траты по размеру чека (pie)
// -----------------------------------------------------------------
function renderSpendingByAmountRangeChart() {
  const canvas = document.getElementById('spendingByAmountRangeChart');
  if (!canvas) return;
  setCanvasHeight(canvas, 0.6);

  const ctx = canvas.getContext('2d');
  const tx  = getCurrentBudgetTransactions();

  const ranges = {
    '<100 000': 0, '100 000–500 000': 0, '500 000–1 000 000': 0,
    '1 000 000–5 000 000': 0, '5 000 000–10 000 000': 0, '>10 000 000': 0
  };

  tx.filter(t => t.type === 'expense').forEach(t => {
    const a = t.amount;
    if      (a < 100_000)    ranges['<100 000']++;
    else if (a < 500_000)    ranges['100 000–500 000']++;
    else if (a < 1_000_000)  ranges['500 000–1 000 000']++;
    else if (a < 5_000_000)  ranges['1 000 000–5 000 000']++;
    else if (a <10_000_000)  ranges['5 000 000–10 000 000']++;
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
      layout: { padding: { top: 10, bottom: 50, left: 10, right: 10 } },
      plugins: {
        legend: { position: 'bottom', labels: { color: getComputedStyle(document.documentElement).getPropertyValue('--secondary-color') } },
        tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.raw} чеков` } }
      }
    }
  });
}

// -----------------------------------------------------------------
// 10. Годовая сводка (bar)
// -----------------------------------------------------------------
function renderAnnualSummaryChart() {
  const canvas = document.getElementById('annualSummaryChart');
  if (!canvas || !budgetManagerInstance?.calculateTotals) return;
  setCanvasHeight(canvas, 0.6);

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
      labels: months,
      datasets: [
        { label: 'Бюджет', data: dataBudget,  backgroundColor: 'hsl(130, 70%, 60%)' },
        { label: 'Доходы', data: dataIncome,  backgroundColor: 'hsl(210, 70%, 60%)' },
        { label: 'Расходы', data: dataExpense, backgroundColor: 'hsl(0,   70%, 60%)' },
        { label: 'Вклад',   data: dataDeposit, backgroundColor: 'hsl(270, 70%, 60%)' },
        { label: 'Долг',    data: dataDebt,    backgroundColor: 'hsl(45,  70%, 60%)' }
      ]
    },
    options: {
      layout: { padding: { top: 10, bottom: 30 } },
      plugins: {
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${formatNumber(ctx.raw)} сум` } },
        legend: {
          position: 'bottom',
          labels: {
            boxWidth: 14, boxHeight: 14, padding: 12, font: { size: 12 },
            color: getComputedStyle(document.documentElement).getPropertyValue('--secondary-color')
          }
        }
      },
      scales: {
        x: { ticks: { font: { size: 11 }, color: getComputedStyle(document.documentElement).getPropertyValue('--secondary-color') } },
        y: { ticks: { font: { size: 11 }, color: getComputedStyle(document.documentElement).getPropertyValue('--secondary-color'), callback: formatNumber } }
      }
    }
  });
}

// ---------------------------------------------------------------
// Экспорт
// ---------------------------------------------------------------
export {
  destroyAllCharts,
  renderCharts,
  initializeAnalytics,
  renderExpensesByCategoryChart,
  renderTopExpensesChart
};
