// ===============================
// Chart.js: аналитика BudgetIt — с кликом по подписям и фиксами списка
// ===============================

// --- глобальные настройки Chart.js ------------------------------
Chart.defaults.maintainAspectRatio = false;
Chart.defaults.aspectRatio        = 2;   // ширина : высота ≈ 2 : 1

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
let cachedTransactions = null;

const HEIGHT_MAP = {
  expensesByCategoryChart    : 0.6,
  monthlyExpensesChart       : 0.6,
  incomeVsExpensesChart      : 0.6,
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
// Валютные утилиты
// ------------------------------------------------------------------
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
let currentAnalyticsMonthFilter = 'all';

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

  setupAnalyticsFilter();
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
  cachedTransactions = null;
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
      charts[key].destroy();
      delete charts[key];
    }
  });
  canvasHandlers.forEach((handler, canvas) => {
    canvas.removeEventListener('click', handler);
  });
  canvasHandlers.clear();
}

// ------------------------------------------------------------------
// 6) Кастом-селект месяца
// ------------------------------------------------------------------
function setupAnalyticsFilter() {
  const customSelect = document.getElementById('analytics-custom-select');
  if (!customSelect) return;

  const selected = customSelect.querySelector('.custom-select-button');
  const options  = customSelect.querySelector('.custom-select-options');

  selected.textContent          = 'Все месяцы ▼';
  currentAnalyticsMonthFilter   = 'all';

  options.classList.remove('hidden');
  options.classList.add('hidden');

  selected.addEventListener('click', e => {
    e.stopImmediatePropagation();
    options.classList.toggle('hidden');
  });

  options.querySelectorAll('div').forEach(option => {
    option.addEventListener('click', e => {
      e.stopPropagation();
      selected.textContent        = option.textContent + ' ▼';
      currentAnalyticsMonthFilter = option.getAttribute('data-value');
      options.classList.add('hidden');
      renderCharts();
    });
  });

  document.addEventListener('click', e => {
    if (!customSelect.contains(e.target)) options.classList.add('hidden');
  });
}

// ------------------------------------------------------------------
// 7) Получение транзакций
// ------------------------------------------------------------------
function getCurrentBudgetTransactions(filterByMonth = true) {
  if (cachedTransactions) return cachedTransactions;

  const tx = budgetManagerInstance?.getCurrentBudget()?.transactions || [];
  if (!tx.length) return [];

  const excluded = [
    'Не знаю на что потратил (без учёта)',
    'Другая категория (без учёта)'
  ];
  const filtered = tx.filter(t => !excluded.includes(t.category));

  cachedTransactions =
    (currentAnalyticsMonthFilter === 'all' || !filterByMonth)
      ? filtered
      : filtered.filter(t => t.date.slice(5, 7) === currentAnalyticsMonthFilter);

  return cachedTransactions;
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
// 1. Расходы по категориям
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
    map[cat]  = (map[cat] || 0) + t.amount;
  });

  const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const labels = sorted.map(([c]) => c);
  const data   = sorted.map(([, a]) => a);

  ensureNonEmptyData(labels, data);
  const colors = labels.map((_, i) => `hsl(${i * 360 / labels.length},70%,60%)`);

  charts.expensesByCategory = new Chart(ctx, {
    type   : 'doughnut',
    data   : { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
    options: {
      cutout : '65%',
      plugins: {
        legend: {
          position: 'bottom',
          labels  : { color: getComputedStyle(document.documentElement).getPropertyValue('--secondary-color') }
        },
        tooltip: { callbacks: { label: c => `${c.label}: ${withCurrency(c.raw)}` } }
      }
    }
  });

  const center = document.getElementById('expensesByCategoryCenterText');
  if (center) {
    const total = data.reduce((s, v) => s + v, 0);
    center.innerHTML =
      `<div class="center-total">${formatNumber(total)}</div>` +
      `<div class="center-label">${getCurrencyLabel()}</div>`;
  }
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
    monthlyData[key][t.type] += t.amount;
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
        { label: 'Доходы',  data: income,  backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--primary-color') },
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
        tooltip: { callbacks: { label: c => `${c.dataset.label}: ${withCurrency(c.raw)}` } }
      }
    }
  });
}

// -----------------------------------------------------------------
// 3. Доходы vs Расходы
// -----------------------------------------------------------------
function renderIncomeVsExpensesChart() {
  const canvas = document.getElementById('incomeVsExpensesChart');
  if (!canvas) return;
  setAdaptiveCanvasHeight(canvas);

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
            label: c => {
              const total = income + expense;
              const pct   = total ? Math.round(c.raw / total * 100) : 0;
              return `${c.label}: ${withCurrency(c.raw)} (${pct}%)`;
            }
          }
        }
      }
    }
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
    map[label]  = (map[label] || 0) + t.amount;
  });

  const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 15);
  const labels = sorted.map(([l]) => l);
  const data   = sorted.map(([, a]) => a);

  ensureNonEmptyData(labels, data);
  const colors = labels.map((_, i) => `hsl(${360 - i * 36},70%,60%)`);

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
            color: getComputedStyle(document.documentElement).getPropertyValue('--secondary-color'),
            autoSkip: false,
            maxRotation: 0,
            padding: 6,
            font: { size: 12 }
          }
        },
        x: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--secondary-color'), callback: formatNumber } }
      },
      plugins : {
        legend: { display: false },
        tooltip: { callbacks: { label: c => withCurrency(c.raw) } }
      },
      elements: {
        bar: {
          borderRadius: 20,
          // адаптивная толщина
          barThickness: Math.max(12, 32 - Math.floor(labels.length / 2)),
          maxBarThickness: 28,
          minBarLength: 8
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
      (t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0);
  });

  const sortedDays = Object.keys(dayMap).sort();
  let balance = 0;
  const data  = sortedDays.map(d => balance += dayMap[d]);

  ensureNonEmptyData(sortedDays, data);

  charts.balanceDynamics = new Chart(ctx, {
    type   : 'line',
    data   : { labels: sortedDays, datasets: [{ data, tension: 0.3, borderColor: getComputedStyle(document.documentElement).getPropertyValue('--primary-color') }] },
    options: {
      layout: { padding: { bottom: 30 } },
      scales: {
        x: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--secondary-color') } },
        y: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--secondary-color'), callback: formatNumber } }
      },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => withCurrency(c.raw) } } }
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

  const cat = charts.expensesByCategory?.data?.labels?.[0] || '';

  const monthMap = {};
  tx.filter(t => t.category === cat && t.type === 'expense').forEach(t => {
    const d   = new Date(t.date);
    const key = `${String(d.getMonth() + 1).padStart(2,'0')}/${d.getFullYear()}`;
    monthMap[key] = (monthMap[key] || 0) + t.amount;
  });

  const labels = Object.keys(monthMap).sort((a, b) => {
    const [mA, yA] = a.split('/').map(Number), [mB, yB] = b.split('/').map(Number);
    return (yA - yB) || (mA - mB);
  });
  const data = labels.map(k => monthMap[k]);

  ensureNonEmptyData(labels, data);

  charts.categoryHistory = new Chart(ctx, {
    type   : 'line',
    data   : { labels, datasets: [{ data, tension: 0.4, borderColor: getComputedStyle(document.documentElement).getPropertyValue('--primary-color') }] },
    options: {
      layout: { padding: { bottom: 30 } },
      scales: {
        x: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--secondary-color') } },
        y: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--secondary-color'), callback: formatNumber } }
      },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => withCurrency(c.raw) } } }
    }
  });
}

// -----------------------------------------------------------------
// 7. Категории по убыванию (фиксы видимости + клик по подписям)
// -----------------------------------------------------------------
// --- утилиты для подписей ---
function softHyphenate(word, chunk = 10) {
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
function wrapLabel(src, maxLen = 18) {
  // переносы по словам; если слово длинное — hyphenate
  const words = src.split(/\s+/).map(w => softHyphenate(w, 12));
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
    map[cat]  = (map[cat] || 0) + t.amount;
  });

  const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 30);
  const fullLabels = sorted.map(([c]) => c);
  const data       = sorted.map(([, a]) => a);

  // визуальные подписи: многострочные
  const labels = fullLabels.map(l => wrapLabel(l, 18));
  ensureNonEmptyData(labels, data);

  // динамическая высота под количество строк
  const rowH        = 30; // ~высота строки с межстрочным
  const extra       = 70; // сверху/снизу + ось X
  const desiredH    = Math.min(window.innerHeight * 0.7,
                        Math.max(260, labels.length * rowH + extra));
  canvas.style.height = `${Math.round(desiredH)}px`;
  canvas.height       = Math.round(desiredH) * window.devicePixelRatio;

  // толщина баров из высоты
  const barThickness = Math.max(12, Math.min(28,
    Math.floor((desiredH - extra) / Math.max(labels.length, 1)) - 6));

  const colors = labels.map((_, i) =>
    `hsl(${i * 360 / Math.max(labels.length,1)},70%,60%)`);

  charts.categoriesByDescending = new Chart(ctx, {
    type: 'bar',
    data: {
      labels, // массивы строк → многострочные подписи
      datasets: [{ data, backgroundColor: colors }]
    },
    options: {
      indexAxis: 'y',
      layout   : { padding: { left: 16, right: 14, top: 8, bottom: 20 } },
      scales   : {
        y: {
          offset: true,
          grid  : { display: false },
          ticks : {
            autoSkip   : false,            // не пропускаем подписи
            color      : getComputedStyle(document.documentElement)
                          .getPropertyValue('--secondary-color'),
            padding    : 8,
            lineHeight : 1.05,
            font : { size: Math.max(7, 9 - labels.length / 12) }
          }
        },
        x: {
          ticks: {
            color   : getComputedStyle(document.documentElement)
                       .getPropertyValue('--secondary-color'),
            callback: formatNumber
          }
        }
      },
      plugins : {
        legend : { display: false },
        tooltip: {
          callbacks: {
            // показываем ПОЛНОЕ название + сумма с валютой
            title: items => {
              const idx = items?.[0]?.dataIndex ?? 0;
              return fullLabels[idx] || '';
            },
            label: c => withCurrency(c.raw)
          }
        }
      },
      elements: {
        bar: {
          borderRadius   : 10,
          barThickness   : barThickness,
          maxBarThickness: 32,
          minBarLength   : 8
        }
      }
    }
  });

  // клик по области оси Y — выбирать строку и показывать тултип
  const chart  = charts.categoriesByDescending;
  const yScale = chart.scales.y;
  const clickH = evt => {
    const { offsetY } = evt;
    const total = yScale.ticks.length;
    const step  = (yScale.bottom - yScale.top) / Math.max(total, 1);
    let idx     = Math.round((offsetY - yScale.top) / step);
    idx         = Math.max(0, Math.min(total - 1, idx));
    chart.setActiveElements([{ datasetIndex: 0, index: idx }]);
    chart.tooltip.setActiveElements([{ datasetIndex: 0, index: idx }], { x: 0, y: 0 });
    chart.update();
  };
  bindClickOnce(canvas, clickH);
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
    sums[new Date(t.date).getDay()] += t.amount;
  });

  ensureNonEmptyData(days, sums);
  const colors = days.map((_, i) => `hsl(${i * 50},70%,60%)`);

  charts.spendingByWeekday = new Chart(ctx, {
    type: 'bar',
    data: { labels: days, datasets: [{ data: sums, backgroundColor: colors }] },
    options: {
      layout: { padding: { bottom: 30 } },
      scales: {
        x: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--secondary-color') } },
        y: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--secondary-color'), callback: formatNumber } }
      },
      plugins: { legend : { display: false }, tooltip: { callbacks: { label: c => withCurrency(c.raw) } } }
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
    const a = t.amount;
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
        legend : { position: 'bottom', labels: { color: getComputedStyle(document.documentElement).getPropertyValue('--secondary-color') } },
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
        tooltip: { callbacks: { label: c => `${c.dataset.label}: ${withCurrency(c.raw)}` } },
        legend : {
          position: 'bottom',
          labels  : {
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
window.addEventListener('themechange', () => { destroyAllCharts(); renderCharts(); });
window.addEventListener('budgetit:region-changed', () => { destroyAllCharts(); renderCharts(); });
