// ===============================
// Chart.js: аналитика BudgetIt
// ===============================

// 1) Хранилище экземпляров графиков
let charts = {
  expensesByCategory:       null,
  monthlyExpenses:          null,
  incomeVsExpenses:         null,
  topExpenses:              null,
  balanceDynamics:          null,
  categoriesByDescending:   null,
  categoryHistory:          null,
  debtsStatus:              null,
  spendingByWeekday:        null,  // 📅 Дни недели
  spendingByAmountRange:    null   // 💳 Размер чека
};

// 2) Переменные для карусели
let currentSlideIndex = 0;
let analyticsSwipeInited = false;
let swipeLocked = false;

// 3) Инициализация карусели: точки, свайп и первый показ
function initializeAnalyticsCarousel() {
  const container     = document.querySelector('.analytics-slides-container');
  const slides        = document.querySelectorAll('.analytics-slide');
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
    container.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch') startX = e.clientX;
    });
    container.addEventListener('pointerup', e => {
      if (e.pointerType === 'touch' && !swipeLocked) {
        swipeLocked = true;
        setTimeout(() => swipeLocked = false, 300);
        const diff = e.clientX - startX;
        if (diff > 50)      showAnalyticsSlide(Math.max(currentSlideIndex - 1, 0));
        else if (diff < -50) showAnalyticsSlide(Math.min(currentSlideIndex + 1, slides.length - 1));
      }
    });
    analyticsSwipeInited = true;
  }

  showAnalyticsSlide(0);
}

// 4) Переключение слайда и рендер
function showAnalyticsSlide(index) {
  const container = document.querySelector('.analytics-slides-container');
  const dots      = document.querySelectorAll('.analytics-dots .dot');
  if (!container || dots.length === 0) return;

  container.style.transform = `translateX(-${index * 100}%)`;
  dots.forEach((d, i) => d.classList.toggle('active', i === index));
  currentSlideIndex = index;
  renderCharts();

  // после трансформации — обновляем размеры
  setTimeout(() => {
    Object.values(charts).forEach(c => { if (c) c.resize(); });
  }, 100);
}

// 5) Рендерим все графики
function renderCharts() {
  renderExpensesByCategoryChart();
  renderMonthlyExpensesChart();
  renderIncomeVsExpensesChart();
  renderTopExpensesChart();
  renderBalanceDynamicsChart();
  renderCategoriesByDescendingChart();
  renderCategoryHistoryChart();
  renderSpendingByWeekdayChart();
  renderSpendingByAmountRangeChart();
}

// 6) Данные
function getCurrentBudgetTransactions() {
  if (!budgets || typeof currentBudgetIndex !== 'number') return [];
  const b = budgets[currentBudgetIndex];
  return Array.isArray(b?.transactions) ? b.transactions : [];
}
function formatNumber(n) {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

// 7) Форматирование числа с пробелами
function formatNumber(n) {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

// ---- 1. Расходы по категориям (doughnut) ----
function renderExpensesByCategoryChart() {
  const canvas = document.getElementById('expensesByCategoryChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const tx  = getCurrentBudgetTransactions();

  // Собираем суммы по категориям
  const map = {};
  tx.filter(t => t.type === 'expense').forEach(t => {
    const c = t.category || 'Без категории';
    map[c] = (map[c] || 0) + t.amount;
  });

  // Берём топ-10 категорий
  const sorted = Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const labels = sorted.map(([l]) => l);
  const data   = sorted.map(([, v]) => v);

  // Динамическая генерация HSL-цветов
  const count = labels.length;
  const hslColors = labels.map((_, i) => {
    const hue = Math.round(i * (360 / count));
    return `hsl(${hue}, 70%, 60%)`;
  });

  // Превращаем каждый HSL-цвет в градиент
  const grads = hslColors.map(col => {
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, col);
    // можно сделать чуть более прозрачным внизу
    g.addColorStop(1, col.replace(/(\d+)%\)$/, '40%)'));
    return g;
  });

  charts.expensesByCategory?.destroy();
  charts.expensesByCategory = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: grads, hoverOffset: 20, borderWidth: 0 }]
    },
    options: {
      cutout: '65%',
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.8)',
          callbacks: {
            label(ctx) {
              const val = ctx.raw;
              const tot = data.reduce((s, v) => s + v, 0);
              return `${ctx.label}: ${formatNumber(val)} сум (${Math.round(val / tot * 100)}%)`;
            }
          }
        },
        legend: {
          position: 'bottom',
          labels: { color: getComputedStyle(document.documentElement).getPropertyValue('--tertiary-color') }
        }
      }
    }
  });

  const total = data.reduce((s, v) => s + v, 0);
  const centerEl = document.getElementById('expensesByCategoryCenterText');
  if (centerEl) {
    centerEl.innerHTML = `
      <div class="center-total">${formatNumber(total)}</div>
      <div class="center-label">сум</div>
    `;
  }
}


// ---- 2. Ежемесячные расходы/доходы (bar) ----
function renderMonthlyExpensesChart() {
  const canvas = document.getElementById('monthlyExpensesChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const tx  = getCurrentBudgetTransactions();
  const months = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
  const md = {};

  tx.forEach(t => {
    if (t.type !== 'income' && t.type !== 'expense') return;
    const d = new Date(t.date);
    const key = `${months[d.getMonth()]} ${d.getFullYear()}`;
    md[key] = md[key] || { income: 0, expense: 0 };
    md[key][t.type === 'income' ? 'income' : 'expense'] += t.amount;
  });

  const keys = Object.keys(md).sort((a, b) => {
    const [mA, yA] = a.split(' '), [mB, yB] = b.split(' ');
    const dy = +yA - +yB;
    return dy !== 0 ? dy : months.indexOf(mA) - months.indexOf(mB);
  });
  const inc = keys.map(k => md[k].income);
  const exp = keys.map(k => md[k].expense);

  charts.monthlyExpenses?.destroy();
  charts.monthlyExpenses = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: keys,
      datasets: [
        { label: 'Доходы', data: inc, backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--primary-color') },
        { label: 'Расходы', data: exp, backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--an-expense-color') }
      ]
    },
    options: {
      maintainAspectRatio: false,
      layout: {
        padding: { top: 0, right: 0, bottom: 30, left: 0 }
      },
      scales: {
        x: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--tertiary-color') } },
        y: {
          beginAtZero: true,
          ticks: {
            color: getComputedStyle(document.documentElement).getPropertyValue('--tertiary-color'),
            callback: v => formatNumber(v)
          }
        }
      },
      plugins: {
        tooltip: { callbacks: { label(ctx) { return `${ctx.dataset.label}: ${formatNumber(ctx.raw)} сум`; } } }
      }
    }
  });
}

// ---- 3. Доходы vs Расходы (pie) ----
function renderIncomeVsExpensesChart() {
  const canvas = document.getElementById('incomeVsExpensesChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const tx  = getCurrentBudgetTransactions();
  const totInc = tx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totExp = tx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  charts.incomeVsExpenses?.destroy();
  charts.incomeVsExpenses = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: ['Доходы','Расходы'],
      datasets: [{
        data: [totInc, totExp],
        backgroundColor: [
          getComputedStyle(document.documentElement).getPropertyValue('--primary-color'),
          getComputedStyle(document.documentElement).getPropertyValue('--expense-color')
        ]
      }]
    },
    options: {
      maintainAspectRatio: false,
      layout: {
        padding: { top: 0, right: 0, bottom: 30, left: 0 }
      },
      plugins: {
        tooltip: { callbacks: { label(ctx) {
          const pct = Math.round(ctx.raw / (totInc + totExp) * 100);
          return `${ctx.label}: ${formatNumber(ctx.raw)} сум (${pct}%)`;
        } } }
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
  if (!tx.length) return;

  const top = tx
    .filter(t => t.type === 'expense')
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  const labels = top.map((t, i) => {
    const name = t.products?.length ? t.products[0].name : t.category || 'Без категории';
    return `${i + 1}. ${name}`;
  });
  const data = top.map(t => t.amount);
  const colors = data.map((_, i) => `hsl(${360 - i * 30}, 70%, 60%)`);

  charts.topExpenses?.destroy();
  charts.topExpenses = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: colors }] },
    options: {
      indexAxis: 'y',
      maintainAspectRatio: false,
      scales: {
        y: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--tertiary-color') } },
        x: {
          beginAtZero: true,
          ticks: {
            color: getComputedStyle(document.documentElement).getPropertyValue('--tertiary-color'),
            callback: v => formatNumber(v)
          }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${formatNumber(ctx.raw)} сум` } }
      }
    }
  });
}

// ---- 5. Динамика баланса (line) ----
function renderBalanceDynamicsChart() {
  const canvas = document.getElementById('balanceDynamicsChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const tx  = getCurrentBudgetTransactions();
  const dayMap = {};

  tx.forEach(t => {
    const d = new Date(t.date).getDate();
    dayMap[d] = (dayMap[d] || 0) + (t.type === 'income' ? t.amount : (t.type === 'expense' ? -t.amount : 0));
  });

  const days = Object.keys(dayMap).map(n => +n).sort((a, b) => a - b);
  let cum = 0;
  const labels = days;
  const data = days.map(d => { cum += dayMap[d]; return cum; });

  charts.balanceDynamics?.destroy();
  charts.balanceDynamics = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{ data, fill: false, tension: 0.4, borderColor: getComputedStyle(document.documentElement).getPropertyValue('--an-primary-color') }] },
    options: {
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--an-secondary-color') } },
        y: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--an-secondary-color'), callback: v => formatNumber(v) } }
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
  const tx  = getCurrentBudgetTransactions();
  const cat = charts.expensesByCategory?.data.labels[0] || '';
  if (!cat) return;

  const monthMap = {};
  tx.filter(t => t.category === cat).forEach(t => {
    const d = new Date(t.date);
    const key = `${d.getMonth() + 1}/${d.getFullYear()}`;
    monthMap[key] = (monthMap[key] || 0) + t.amount;
  });

  const labels = Object.keys(monthMap).sort((a, b) => {
    const [mA, yA] = a.split('/'), [mB, yB] = b.split('/');
    return (+yA - +yB) || (+mA - +mB);
  });
  const data = labels.map(k => monthMap[k]);

  charts.categoryHistory?.destroy();
  charts.categoryHistory = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{ data, fill: false, tension: 0.4, borderColor: getComputedStyle(document.documentElement).getPropertyValue('--an-income-color') }] },
    options: {
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--an-secondary-color') } },
        y: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--an-secondary-color'), callback: v => formatNumber(v) } }
      },
      plugins: { legend: { display: false } }
    }
  });
}

// ---- 6. Категории по убыванию (horizontal bar) ----
function renderCategoriesByDescendingChart() {
  const canvas = document.getElementById('categoriesByDescendingChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const tx  = getCurrentBudgetTransactions();

  // 1) Считаем сумму по категориям
  const map = {};
  tx.filter(t => t.type === 'expense').forEach(t => {
    const c = t.category || 'Без категории';
    map[c] = (map[c] || 0) + t.amount;
  });

  // 2) Сортируем все категории по убыванию
  const sorted = Object.entries(map)
    .sort((a, b) => b[1] - a[1]);

  const labels = sorted.map(([cat]) => cat);
  const data   = sorted.map(([,sum]) => sum);

  // 3) Генерируем цвета динамически
  const colors = labels.map((_, i) =>
    `hsl(${360 - i * (360 / labels.length)}, 70%, 60%)`
  );

  // 4) Рисуем
  charts.categoriesByDescending?.destroy();
  charts.categoriesByDescending = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors
      }]
    },
    options: {
      indexAxis: 'y',
      maintainAspectRatio: false,
      scales: {
        y: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--tertiary-color') } },
        x: {
          beginAtZero: true,
          ticks: {
            color: getComputedStyle(document.documentElement).getPropertyValue('--tertiary-color'),
            callback: v => formatNumber(v)
          }
        }
        
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(ctx) { return `${formatNumber(ctx.raw)} сум`; }
          }
        }
      }
    }
  });
}


// ---- 8. Психопортрет: траты по дням недели (bar) ----
function renderSpendingByWeekdayChart() {
  const canvas = document.getElementById('spendingByWeekdayChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const tx  = getCurrentBudgetTransactions();
  const days = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
  const sums = [0,0,0,0,0,0,0];

  tx.filter(t => t.type==='expense').forEach(t => {
    const d = new Date(t.date).getDay();
    sums[d] += t.amount;
  });

  const colors = days.map((_,i)=>`hsl(${i*50},70%,60%)`);

  charts.spendingByWeekday?.destroy();
  charts.spendingByWeekday = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: days,
      datasets: [{ data: sums, backgroundColor: colors }]
    },
    options: {
      maintainAspectRatio: false,
      scales: {
        x: { ticks:{ color:getComputedStyle(document.documentElement).getPropertyValue('--tertiary-color') } },
        y: {
          beginAtZero:true,
          ticks:{
            color:getComputedStyle(document.documentElement).getPropertyValue('--tertiary-color'),
            callback:v=>formatNumber(v)
          }
        }
      },
      plugins: {
        legend:{ display:false },
        tooltip:{ callbacks:{ label: ctx => `${formatNumber(ctx.raw)} сум` } }
      }
    }
  });
}

// ---- 9. Психопортрет: траты по размеру чека (pie) ----
function renderSpendingByAmountRangeChart() {
  const canvas = document.getElementById('spendingByAmountRangeChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const tx  = getCurrentBudgetTransactions();

    // Диапазоны: <100 000, 100 000–500 000, 500 000–1 000 000, 1 000 000–5 000 000,
  // 5 000 000–10 000 000, >10 000 000
  const ranges = {
    '<100 000':        0,
    '100 000–500 000':  0,
    '500 000–1 000 000':0,
    '1 000 000–5 000 000':0,
    '5 000 000–10 000 000':0,
    '>10 000 000':      0
  };

  tx.filter(t => t.type === 'expense').forEach(t => {
    const a = t.amount;
    if      (a < 100_000)      ranges['<100 000']++;
    else if (a < 500_000)      ranges['100 000–500 000']++;
    else if (a < 1_000_000)    ranges['500 000–1 000 000']++;
    else if (a < 5_000_000)    ranges['1 000 000–5 000 000']++;
    else if (a < 10_000_000)   ranges['5 000 000–10 000 000']++;
    else                       ranges['>10 000 000']++;
  });

  const labels = Object.keys(ranges);
  const data   = Object.values(ranges);
  // ваши сочные первые 4 цвета
    const baseColors = [
      'rgb(43,232,42)',   // budget green
      'rgb(42,172,232)',  // income blue
      'rgb(232,43,42)',   // expense red
      'rgb(138,43,226)'   // deposit purple
    ];

    // комбинируем: для i<4 — baseColors, для остальных — HSL
    const colors = labels.map((_, i) =>
      baseColors[i] ||
      `hsl(${Math.round(i * (360 / labels.length))}, 70%, 60%)`
    );


  charts.spendingByAmountRange?.destroy();
  charts.spendingByAmountRange = new Chart(ctx, {
    type: 'pie',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors }]
    },
    options: {
      maintainAspectRatio: false,
      layout: {
        padding: { top: 0, right: 0, bottom: 30, left: 0 }
      },
      plugins: {
        legend:{
          position:'bottom',
          labels:{ color:getComputedStyle(document.documentElement).getPropertyValue('--tertiary-color') }
        },
        tooltip:{ callbacks:{ label(ctx){ return `${ctx.label}: ${ctx.raw} чеков`; } } }
      }
    }
  });
}

// запуск
document.addEventListener('DOMContentLoaded', initializeAnalyticsCarousel);
