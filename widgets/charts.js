// ===============================
// Chart.js: аналитика BudgetIt
// ===============================

// 1) Хранилище экземпляров графиков
let charts = {};

// 2) Переменные
let currentSlideIndex = 0;
let analyticsSwipeInited = false;
let swipeLocked = false;
let budgetManagerInstance = null;
let currentAnalyticsMonthFilter = 'all'; // Новый фильтр только для аналитики

// 3) Инициализация аналитики
function initializeAnalytics(budgetManager) {
  budgetManagerInstance = budgetManager;
  
  const settingsPage = document.getElementById('settings-page');
  const wasHidden = settingsPage.classList.contains('hidden');
  if (wasHidden) settingsPage.classList.remove('hidden');

  setupAnalyticsFilter();
  renderCharts();
  initializeAnalyticsCarousel();

  if (wasHidden) settingsPage.classList.add('hidden');
}



// 4) Инициализация карусели
function initializeAnalyticsCarousel() {
  const container = document.querySelector('.analytics-slides-container');
  const slides = document.querySelectorAll('.analytics-slide');
  const dotsContainer = document.querySelector('.analytics-dots');
  if (!container || slides.length === 0 || !dotsContainer) return;

  dotsContainer.innerHTML = '';
  slides.forEach((_, i) => {
    const dot = document.createElement('div');
    dot.classList.add('dot');
    dot.dataset.index = i;
    dot.addEventListener('click', () => showAnalyticsSlide(i));
    dotsContainer.append(dot);
  });

  if (!analyticsSwipeInited) {
    let startX = 0;
    container.style.touchAction = 'pan-y';
    container.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') startX = e.clientX; });
    container.addEventListener('pointerup', e => {
      if (e.pointerType === 'touch' && !swipeLocked) {
        swipeLocked = true;
        setTimeout(() => swipeLocked = false, 300);
        const diff = e.clientX - startX;
        if (diff > 50) showAnalyticsSlide(Math.max(currentSlideIndex - 1, 0));
        else if (diff < -50) showAnalyticsSlide(Math.min(currentSlideIndex + 1, slides.length - 1));
      }
    });
    analyticsSwipeInited = true;
  }

  showAnalyticsSlide(0);
}

// 5) Переключение слайда
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
  const key = chartKeys[index];
  return charts[key];
}

// 6) Рендер всех графиков
function renderCharts() {
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
    renderSpendingByAmountRangeChart
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
  const options = customSelect.querySelector('.custom-select-options');

  // Дефолт
  selected.textContent = 'Все месяцы ▼';
  currentAnalyticsMonthFilter = 'all';

  // Явно УДАЛЯЕМ hidden если был мусор
  options.classList.remove('hidden');

  // Сразу СКРЫВАЕМ чисто через код
  options.classList.add('hidden');

  // Клик по кнопке
  selected.addEventListener('click', (e) => {
    e.stopImmediatePropagation(); // <-- ВАЖНО
    options.classList.toggle('hidden');
  });
  

  // Клик по пункту
  options.querySelectorAll('div').forEach(option => {
    option.addEventListener('click', (e) => {
      e.stopPropagation();
      const monthName = option.textContent;
      const monthValue = option.getAttribute('data-value');

      selected.textContent = monthName + ' ▼';
      currentAnalyticsMonthFilter = monthValue;

      options.classList.add('hidden');

      destroyAllCharts();
      renderCharts();
    });
  });

  // Клик вне селектора
  document.addEventListener('click', (e) => {
    if (!customSelect.contains(e.target)) {
      options.classList.add('hidden');
    }
  });
}




// 7) Получение транзакций
function getCurrentBudgetTransactions(filterByMonth = true) {
  const transactions = budgetManagerInstance?.getCurrentBudget()?.transactions || [];
  if (!transactions.length) return [];

  if (currentAnalyticsMonthFilter === 'all' || !filterByMonth) return transactions;

  return transactions.filter(t => {
    const month = new Date(t.date).toISOString().slice(5, 7);
    return month === currentAnalyticsMonthFilter;
  });
}

// 8) Форматирование чисел
function formatNumber(n) {
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// 9) Функция для пустых графиков
function ensureNonEmptyData(labels, data) {
  if (data.length === 0) {
    labels.push('');
    data.push(0.001);
  }
}

// ---- 1. Расходы по категориям (doughnut) ----
function renderExpensesByCategoryChart() {
  const canvas = document.getElementById('expensesByCategoryChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const tx = getCurrentBudgetTransactions();

  const map = {};
  tx.filter(t => t.type === 'expense').forEach(t => {
    const cat = t.category || 'Без категории';
    map[cat] = (map[cat] || 0) + t.amount;
  });

  const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const labels = sorted.map(([cat]) => cat);
  const data = sorted.map(([, amount]) => amount);

  ensureNonEmptyData(labels, data);

  const count = labels.length;
  const colors = labels.map((_, i) => `hsl(${i * 360 / count}, 70%, 60%)`);

  charts.expensesByCategory = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
    options: {
      cutout: '65%',
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { color: getComputedStyle(document.documentElement).getPropertyValue('--tertiary-color') } } }
    }
  });

  const centerEl = document.getElementById('expensesByCategoryCenterText');
  if (centerEl) {
    centerEl.innerHTML = `
      <div class="center-total">${formatNumber(data.reduce((s, v) => s + v, 0))}</div>
      <div class="center-label">сум</div>
    `;
  }
}

// ---- 2. Ежемесячные расходы/доходы (bar) ----
function renderMonthlyExpensesChart() {
  const canvas = document.getElementById('monthlyExpensesChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const tx = getCurrentBudgetTransactions(false); // Тут без фильтра по месяцу

  const months = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
  const monthlyData = {};

  tx.forEach(t => {
    if (t.type !== 'income' && t.type !== 'expense') return;
    const d = new Date(t.date);
    const key = `${months[d.getMonth()]} ${d.getFullYear()}`;
    monthlyData[key] = monthlyData[key] || { income: 0, expense: 0 };
    monthlyData[key][t.type] += t.amount;
  });

  const keys = Object.keys(monthlyData).sort((a, b) => {
    const [mA, yA] = a.split(' '), [mB, yB] = b.split(' ');
    return (+yA - +yB) || (months.indexOf(mA) - months.indexOf(mB));
  });

  const income = keys.map(k => monthlyData[k].income);
  const expense = keys.map(k => monthlyData[k].expense);

  ensureNonEmptyData(keys, income);
  ensureNonEmptyData(keys, expense);

  charts.monthlyExpenses = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: keys,
      datasets: [
        { label: 'Доходы', data: income, backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--primary-color') },
        { label: 'Расходы', data: expense, backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--expense-color') }
      ]
    },
    options: {
      maintainAspectRatio: false,
      layout: {
        padding: {
          top: 0,     // Чуть воздуха сверху
          bottom: 60,  // Чуть воздуха снизу под легенду
          left: 0,
          right: 0
        }
      },  
      scales: {
        x: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--tertiary-color') } },
        y: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--tertiary-color'), callback: formatNumber } }
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${formatNumber(ctx.raw)} сум`
          }
        }
      }
    }
  });
}

// ---- 3. Доходы против расходов (pie) ----
function renderIncomeVsExpensesChart() {
  const canvas = document.getElementById('incomeVsExpensesChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const tx = getCurrentBudgetTransactions();

  const income = tx.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const expense = tx.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);

  const labels = ['Доходы', 'Расходы'];
  const data = [income, expense];

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
      maintainAspectRatio: false,
      layout: {
        padding: {
          top: 0,     // Чуть воздуха сверху
          bottom: 40,  // Чуть воздуха снизу под легенду
          left: 0,
          right: 0
        }
      },  
      plugins: {
        tooltip: {
          callbacks: {
            label: ctx => {
              const total = income + expense;
              const pct = total ? Math.round(ctx.raw / total * 100) : 0;
              return `${ctx.label}: ${formatNumber(ctx.raw)} сум (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

// ---- 4. Топ расходов (horizontal bar) ----
function renderTopExpensesChart() {
  const canvas = document.getElementById('topExpensesChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const tx = getCurrentBudgetTransactions();

  const map = {};
  tx.filter(t => t.type === 'expense').forEach(t => {
    const label = t.products?.[0]?.name || t.category || 'Без категории';
    map[label] = (map[label] || 0) + t.amount;
  });

  const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 15);
  const labels = sorted.map(([label]) => label);
  const data = sorted.map(([, amount]) => amount);

  ensureNonEmptyData(labels, data);

  const colors = labels.map((_, i) => `hsl(${360 - i * 36}, 70%, 60%)`);

  charts.topExpenses = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: colors }] },
    options: {
      indexAxis: 'y',
      maintainAspectRatio: false,
      layout: {
        padding: {
          top: 0,     // Чуть воздуха сверху
          bottom: 30,  // Чуть воздуха снизу под легенду
          left: 0,
          right: 0
        }
      },  
      scales: {
        y: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--tertiary-color') } },
        x: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--tertiary-color'), callback: formatNumber } }
      },
      plugins: { legend: { display: false } },
      elements: {
        bar: {
          borderSkipped: false,
          borderWidth: 0,
          borderRadius: 8, // красивее
          barThickness: 20, // <-- вот это ширина бара!
          maxBarThickness: 30, // максимум если мало данных
          minBarLength: 10 // чтобы совсем маленькие бары были видны
        }
      }
    }
  });

  const chart = charts.topExpenses;
  const yScale = chart.scales.y;

  chart.canvas.addEventListener('click', (event) => {
    const { offsetX, offsetY } = event;
    const top = yScale.top;
    const bottom = yScale.bottom;
    const height = bottom - top;
    const step = height / yScale.ticks.length;

    if (offsetY < top || offsetY > bottom) return;

    const clickedIndex = Math.floor((offsetY - top) / step);

    if (clickedIndex >= 0 && clickedIndex < yScale.ticks.length) {
      chart.setActiveElements([{ datasetIndex: 0, index: clickedIndex }]);
      chart.tooltip.setActiveElements([{ datasetIndex: 0, index: clickedIndex }], { x: 0, y: 0 });
      chart.update();
    }
  });


}



// ---- 5. Динамика баланса (line) ----
function renderBalanceDynamicsChart() {
  const canvas = document.getElementById('balanceDynamicsChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const tx = getCurrentBudgetTransactions();

  const dayMap = {};
  tx.forEach(t => {
    const day = new Date(t.date).getDate();
    dayMap[day] = (dayMap[day] || 0) + (t.type === 'income' ? t.amount : (t.type === 'expense' ? -t.amount : 0));
  });

  const days = Object.keys(dayMap).map(Number).sort((a, b) => a - b);
  let balance = 0;
  const data = days.map(d => (balance += dayMap[d]));

  ensureNonEmptyData(days, data);

  charts.balanceDynamics = new Chart(ctx, {
    type: 'line',
    data: { labels: days, datasets: [{ data, fill: false, tension: 0.3, borderColor: getComputedStyle(document.documentElement).getPropertyValue('--primary-color') }] },
    options: {
      maintainAspectRatio: false,
      layout: {
        padding: {
          top: 0,     // Чуть воздуха сверху
          bottom: 30,  // Чуть воздуха снизу под легенду
          left: 0,
          right: 0
        }
      },  
      scales: {
        x: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--tertiary-color') } },
        y: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--tertiary-color'), callback: formatNumber } }
      },
      plugins: { legend: { display: false } }
    }
  });
}

// ---- 6. История категории (line) ----
function renderCategoryHistoryChart() {
  const canvas = document.getElementById('categoryHistoryChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const tx = getCurrentBudgetTransactions();

  const cat = charts.expensesByCategory?.data?.labels?.[0] || '';

  const monthMap = {};
  tx.filter(t => t.category === cat && t.type === 'expense').forEach(t => {
    const d = new Date(t.date);
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
    data: { labels, datasets: [{ data, fill: false, tension: 0.4, borderColor: getComputedStyle(document.documentElement).getPropertyValue('--primary-color') }] },
    options: {
      maintainAspectRatio: false,
      layout: {
        padding: {
          top: 0,     // Чуть воздуха сверху
          bottom: 30,  // Чуть воздуха снизу под легенду
          left: 0,
          right: 0
        }
      },  
      scales: {
        x: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--tertiary-color') } },
        y: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--tertiary-color'), callback: formatNumber } }
      },
      plugins: { legend: { display: false } }
    }
  });
}

// ---- 7. Категории по убыванию (horizontal bar) ----
function renderCategoriesByDescendingChart() {
  const canvas = document.getElementById('categoriesByDescendingChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const tx = getCurrentBudgetTransactions();

  const map = {};
  tx.filter(t => t.type === 'expense').forEach(t => {
    const cat = t.category || 'Без категории';
    map[cat] = (map[cat] || 0) + t.amount;
  });

  const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
  const labels = sorted.map(([cat]) => cat);
  const data = sorted.map(([, amount]) => amount);

  ensureNonEmptyData(labels, data);

  const colors = labels.map((_, i) => `hsl(${i * 360 / labels.length}, 70%, 60%)`);

  charts.categoriesByDescending = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: colors }] },
    options: {
      indexAxis: 'y',
      maintainAspectRatio: false,
      layout: {
        padding: {
          top: 0,     // Чуть воздуха сверху
          bottom: 30,  // Чуть воздуха снизу под легенду
          left: 0,
          right: 0
        }
      },  
      scales: {
        y: {
          ticks: {
            color: getComputedStyle(document.documentElement).getPropertyValue('--tertiary-color'),
            font: {
              size: 9, // Увеличиваем размер шрифта чтобы текст был чётче
            },
            padding: 10, // Отступы слева для текста
          }
        },
        x: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--tertiary-color'), callback: formatNumber } }
      },
      plugins: { legend: { display: false } },
      elements: {
        bar: {
          borderSkipped: false,
          borderWidth: 0,
          borderRadius: 10, // красивее
          barThickness: 100, // <-- вот это ширина бара!
          maxBarThickness: 30, // максимум если мало данных
          minBarLength: 40 // чтобы совсем маленькие бары были видны
        }
      }
    }
  });
  const chart = charts.categoriesByDescending;
  const yScale = chart.scales.y;

  chart.canvas.addEventListener('click', (event) => {
    const { offsetX, offsetY } = event;
    const top = yScale.top;
    const bottom = yScale.bottom;
    const height = bottom - top;
    const step = height / yScale.ticks.length;

    if (offsetY < top || offsetY > bottom) return;

    const clickedIndex = Math.floor((offsetY - top) / step);

    if (clickedIndex >= 0 && clickedIndex < yScale.ticks.length) {
      chart.setActiveElements([{ datasetIndex: 0, index: clickedIndex }]);
      chart.tooltip.setActiveElements([{ datasetIndex: 0, index: clickedIndex }], { x: 0, y: 0 });
      chart.update();
    }
  });

}

// ---- 8. Психопортрет: траты по дням недели (bar) ----
function renderSpendingByWeekdayChart() {
  const canvas = document.getElementById('spendingByWeekdayChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const tx = getCurrentBudgetTransactions();

  const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
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
      maintainAspectRatio: false,
      layout: {
        padding: {
          top: 0,     // Чуть воздуха сверху
          bottom: 30,  // Чуть воздуха снизу под легенду
          left: 0,
          right: 0
        }
      },      
      scales: {
        x: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--tertiary-color') } },
        y: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--tertiary-color'), callback: formatNumber } }
      },
      plugins: { legend: { display: false } }
    }
  });
}

// ---- 9. Психопортрет: траты по размеру чека (pie) ----
function renderSpendingByAmountRangeChart() {
  const canvas = document.getElementById('spendingByAmountRangeChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const tx = getCurrentBudgetTransactions();

  const ranges = {
    '<100 000': 0,
    '100 000–500 000': 0,
    '500 000–1 000 000': 0,
    '1 000 000–5 000 000': 0,
    '5 000 000–10 000 000': 0,
    '>10 000 000': 0
  };

  tx.filter(t => t.type === 'expense').forEach(t => {
    const a = t.amount;
    if (a < 100_000) ranges['<100 000']++;
    else if (a < 500_000) ranges['100 000–500 000']++;
    else if (a < 1_000_000) ranges['500 000–1 000 000']++;
    else if (a < 5_000_000) ranges['1 000 000–5 000 000']++;
    else if (a < 10_000_000) ranges['5 000 000–10 000 000']++;
    else ranges['>10 000 000']++;
  });

  const labels = Object.keys(ranges);
  const data = Object.values(ranges);

  ensureNonEmptyData(labels, data);

  const baseColors = [
    'rgb(43,232,42)', 'rgb(42,172,232)', 'rgb(232,43,42)', 'rgb(138,43,226)', 'hsl(270,70%,60%)', 'hsl(320,70%,60%)'
  ];

  
  charts.spendingByAmountRange = new Chart(ctx, {
    type: 'pie',
    data: { labels, datasets: [{ data, backgroundColor: baseColors }] },
    options: {
      maintainAspectRatio: false,
      layout: {
        padding: {
          top: 10,     // Чуть воздуха сверху
          bottom: 50,  // Чуть воздуха снизу под легенду
          left: 10,
          right: 10
        }
      },      
      plugins: {
        legend: { position: 'bottom', labels: { color: getComputedStyle(document.documentElement).getPropertyValue('--tertiary-color') } },
        tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.raw} чеков` } }
      }
    }
  });
}


// === Активируем клик по тексту категорий
function attachCategoryClickHandlers(chart) {
  if (!chart || !chart.scales?.y) return; // Защита от ошибок если вдруг нет шкалы Y

  const canvas = chart.canvas;
  const yScale = chart.scales.y;

  // Очищаем старые обработчики, чтобы не плодить
  canvas.onclick = (event) => {
    const { offsetY } = event;
    const top = yScale.top;
    const bottom = yScale.bottom;
    const height = bottom - top;
    const step = height / yScale.ticks.length;

    if (offsetY < top || offsetY > bottom) return;

    const clickedIndex = Math.floor((offsetY - top) / step);

    if (clickedIndex >= 0 && clickedIndex < yScale.ticks.length) {
      chart.setActiveElements([{ datasetIndex: 0, index: clickedIndex }]);
      chart.tooltip.setActiveElements([{ datasetIndex: 0, index: clickedIndex }], { x: 0, y: 0 });
      chart.update();
    }
  };
}
