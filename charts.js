// ===============================
// Функции для аналитики и графиков
// ===============================

// Объекты для хранения экземпляров графиков
let charts = {
  expensesByCategory: null,
  monthlyExpenses: null,
  incomeVsExpenses: null,
  topExpenses: null
};

function initializeAnalyticsCarousel() {
  const container = document.querySelector('.analytics-slides-container');
  const slides = document.querySelectorAll('.analytics-slide');
  const dotsContainer = document.querySelector('.analytics-dots');
  
  if (!container || !slides.length || !dotsContainer) return;
  
  // Очищаем контейнер точек
  dotsContainer.innerHTML = '';
  
  // Создаем точки
  slides.forEach((_, i) => {
    const dot = document.createElement('div');
    dot.classList.add('dot');
    dot.dataset.index = i;
    dot.addEventListener('click', () => showAnalyticsSlide(i));
    dotsContainer.appendChild(dot);
  });
  
  // Сбрасываем на первый слайд
  showAnalyticsSlide(0);
  
  // Рендерим графики
  renderCharts();
  
  // Свайпы
  let touchStartX = 0, touchEndX = 0;
  function handleTouchStart(e) { touchStartX = e.changedTouches[0].screenX; }
  function handleTouchEnd(e) {
    touchEndX = e.changedTouches[0].screenX;
    const idx = getCurrentSlideIndex();
    if (touchStartX - touchEndX > 50)      showAnalyticsSlide(Math.min(idx + 1, slides.length - 1));
    else if (touchEndX - touchStartX > 50) showAnalyticsSlide(Math.max(idx - 1, 0));
  }
  
  container.removeEventListener('touchstart', handleTouchStart);
  container.removeEventListener('touchend',   handleTouchEnd);
  container.addEventListener   ('touchstart',  handleTouchStart, { passive: true });
  container.addEventListener   ('touchend',    handleTouchEnd,   { passive: true });
}

// Флаг, чтобы свайп‑обработчики добавлялись только один раз
let analyticsSwipeInited = false;

function initializeAnalyticsCarousel() {
  const container    = document.querySelector('.analytics-slides-container');
  const slides       = document.querySelectorAll('.analytics-slide');
  const dotsContainer= document.querySelector('.analytics-dots');
  if (!container || !slides.length || !dotsContainer) return;

  // 1) Создаём точки заново
  dotsContainer.innerHTML = '';
  slides.forEach((_, i) => {
    const dot = document.createElement('div');
    dot.classList.add('dot');
    dot.dataset.index = i;
    dot.addEventListener('click', () => showAnalyticsSlide(i));
    dotsContainer.appendChild(dot);
  });

  // 2) Сбрасываем карусель на первый слайд
  showAnalyticsSlide(0);

  // 3) Обновляем все графики
  renderCharts();

  // 4) Подключаем свайп лишь один раз
  if (!analyticsSwipeInited) {
    let touchStartX = 0, touchEndX = 0;
    function handleTouchStart(e) {
      touchStartX = e.changedTouches[0].screenX;
    }
    function handleTouchEnd(e) {
      touchEndX = e.changedTouches[0].screenX;
      const idx = getCurrentSlideIndex();
      if (touchStartX - touchEndX > 50) {
        showAnalyticsSlide(Math.min(idx + 1, slides.length - 1));
      } else if (touchEndX - touchStartX > 50) {
        showAnalyticsSlide(Math.max(idx - 1, 0));
      }
    }
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchend',   handleTouchEnd,   { passive: true });
    analyticsSwipeInited = true;
  }
}


// Функция для отображения конкретного слайда
function showAnalyticsSlide(index) {
  const container = document.querySelector('.analytics-slides-container');
  const dots = document.querySelectorAll('.analytics-dots .dot');
  
  if (!container || !dots.length) return;
  
  container.style.transform = `translateX(-${index * 100}%)`;
  
  dots.forEach((dot, i) => {
    if (i === index) {
      dot.classList.add('active');
    } else {
      dot.classList.remove('active');
    }
  });
  
  // Обновляем график для текущего слайда
  updateChartForSlide(index);
}

// Получение текущего индекса слайда
function getCurrentSlideIndex() {
  const dot = document.querySelector('.analytics-dots .dot.active');
  return dot ? parseInt(dot.dataset.index) : 0;
}

// Обновление конкретного графика по индексу слайда
function updateChartForSlide(index) {
  switch(index) {
    case 0:
      renderExpensesByCategoryChart();
      break;
    case 1:
      renderMonthlyExpensesChart();
      break;
    case 2:
      renderIncomeVsExpensesChart();
      break;
    case 3:
      renderTopExpensesChart();
      break;
  }
}

// Рендер всех графиков
function renderCharts() {
  renderExpensesByCategoryChart();
  renderMonthlyExpensesChart();
  renderIncomeVsExpensesChart();
  renderTopExpensesChart();
}

// Получение транзакций для текущего бюджета
function getCurrentBudgetTransactions() {
  if (!budgets || !budgets[currentBudgetIndex]) return [];
  return budgets[currentBudgetIndex].transactions || [];
}

function renderExpensesByCategoryChart() {
  const canvas = document.getElementById('expensesByCategoryChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const transactions = getCurrentBudgetTransactions();

  // Группировка расходов по категориям
  const categories = {};
  transactions
    .filter(t => t.type === 'expense')
    .forEach(t => {
      let category = t.category || 'Без категории';
      if (category.includes(' ')) {
        const parts = category.split(' ');
        category = parts[0] + ' ' + parts.slice(1).join(' ').split(',')[0];
      }
      categories[category] = (categories[category] || 0) + t.amount;
    });

  // Сортировка по убыванию и ограничение до 7 категорий
  const sorted = Object.entries(categories)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7);

  const labels = sorted.map(([label]) => label);
  const data = sorted.map(([, value]) => value);

  // Базовые цвета и градиенты
  const baseColors = [
    'rgba(255, 99, 132, 0.8)',
    'rgba(54, 162, 235, 0.8)',
    'rgba(255, 206, 86, 0.8)',
    'rgba(75, 192, 192, 0.8)',
    'rgba(153, 102, 255, 0.8)',
    'rgba(255, 159, 64, 0.8)',
    'rgba(199, 199, 199, 0.8)'
  ];
  const gradients = baseColors.map(col => {
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, col.replace('0.8', '1'));
    grad.addColorStop(1, col.replace('0.8', '0.4'));
    return grad;
  });

  // Удаляем предыдущий график
  if (charts.expensesByCategory) {
    charts.expensesByCategory.destroy();
  }

  // Создаем новый doughnut
  charts.expensesByCategory = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: gradients,
        borderColor: '#ffffff',
        borderWidth: 4,
        spacing: 6,
        hoverOffset: 20
      }]
    },
    options: {
      cutout: '65%',
      radius: '80%',
      maintainAspectRatio: false,
      layout: { padding: 0 },
      plugins: {
        legend: {
          position: 'bottom',
          align: 'center',
          labels: {
            color: getComputedStyle(document.documentElement)
                     .getPropertyValue('--secondary-color'),
            boxWidth: 12,
            padding: 8,
            font: { size: 13 }
          }
        },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.8)',
          titleColor: '#ffffff',
          bodyColor: '#ffffff',
          borderColor: '#ffffff',
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label: ctx => {
              const value = ctx.raw;
              const total = data.reduce((sum, v) => sum + v, 0);
              const pct = Math.round((value / total) * 100);
              return `${ctx.label}: ${formatNumber(value)} руб. (${pct}%)`;
            }
          }
        },
        datalabels: {
          display: false
        }
      },
      animation: {
        animateRotate: true,
        animateScale: true,
        duration: 1000,
        easing: 'easeOutQuart'
      }
    }
  });

  // Обновляем центр «пончика»
  const total = data.reduce((sum, v) => sum + v, 0);
  const centerEl = document.getElementById('expensesByCategoryCenterText');
  if (centerEl) {
    centerEl.innerHTML = `
      <div class="center-total">${formatNumber(total)}</div>
      <div class="center-label">руб.</div>
    `;
  }
}


// 2. График ежемесячных расходов и доходов
function renderMonthlyExpensesChart() {
  const ctx = document.getElementById('monthlyExpensesChart');
  if (!ctx) return;
  
  const transactions = getCurrentBudgetTransactions();
  
  // Группировка по месяцам
  const monthlyData = {};
  const monthNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
  
  transactions.forEach(t => {
    if (t.type !== 'income' && t.type !== 'expense') return;
    
    const date = new Date(t.date);
    const monthYear = `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
    
    if (!monthlyData[monthYear]) {
      monthlyData[monthYear] = { income: 0, expense: 0 };
    }
    
    if (t.type === 'income') {
      monthlyData[monthYear].income += t.amount;
    } else {
      monthlyData[monthYear].expense += t.amount;
    }
  });
  
  // Сортировка месяцев в хронологическом порядке
  const sortedMonths = Object.keys(monthlyData).sort((a, b) => {
    const [monthA, yearA] = a.split(' ');
    const [monthB, yearB] = b.split(' ');
    
    const yearDiff = parseInt(yearA) - parseInt(yearB);
    if (yearDiff !== 0) return yearDiff;
    
    return monthNames.indexOf(monthA) - monthNames.indexOf(monthB);
  });
  
  const labels = sortedMonths;
  const incomeData = sortedMonths.map(month => monthlyData[month].income);
  const expenseData = sortedMonths.map(month => monthlyData[month].expense);
  
  if (charts.monthlyExpenses) {
    charts.monthlyExpenses.destroy();
  }
  
  charts.monthlyExpenses = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Доходы',
          data: incomeData,
          backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--income-color'),
          borderWidth: 1
        },
        {
          label: 'Расходы',
          data: expenseData,
          backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--expense-color'),
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            color: getComputedStyle(document.documentElement).getPropertyValue('--secondary-color'),
            callback: function(value) {
              return formatNumber(value);
            }
          }
        },
        x: {
          ticks: {
            color: getComputedStyle(document.documentElement).getPropertyValue('--secondary-color')
          }
        }
      },
      plugins: {
        legend: {
          labels: {
            color: getComputedStyle(document.documentElement).getPropertyValue('--secondary-color')
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `${context.dataset.label}: ${formatNumber(context.raw)} руб.`;
            }
          }
        }
      }
    }
  });
}

// 3. График соотношения доходов и расходов
function renderIncomeVsExpensesChart() {
  const ctx = document.getElementById('incomeVsExpensesChart');
  if (!ctx) return;
  
  const transactions = getCurrentBudgetTransactions();
  
  // Суммируем все доходы и расходы
  const totalIncome = transactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);
  
  const totalExpense = transactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);
  
  if (charts.incomeVsExpenses) {
    charts.incomeVsExpenses.destroy();
  }
  
  charts.incomeVsExpenses = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: ['Доходы', 'Расходы'],
      datasets: [{
        label: 'Сумма',
        data: [totalIncome, totalExpense],
        backgroundColor: [
          getComputedStyle(document.documentElement).getPropertyValue('--income-color'),
          getComputedStyle(document.documentElement).getPropertyValue('--expense-color')
        ],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            color: getComputedStyle(document.documentElement).getPropertyValue('--secondary-color')
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const percentage = Math.round((context.raw / (totalIncome + totalExpense)) * 100);
              return `${context.label}: ${formatNumber(context.raw)} руб. (${percentage}%)`;
            }
          }
        }
      }
    }
  });
}

// 4. График топ расходов
function renderTopExpensesChart() {
  const ctx = document.getElementById('topExpensesChart');
  if (!ctx) return;
  
  const transactions = getCurrentBudgetTransactions();
  
  // Берем только расходные транзакции и сортируем по сумме (по убыванию)
  const topExpenses = transactions
    .filter(t => t.type === 'expense')
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10); // Топ-10 расходов
  
  const labels = topExpenses.map((t, index) => {
    // Для товаров показываем наименование первого товара
    if (t.products && t.products.length > 0) {
      return `${index + 1}. ${t.products[0].name || 'Товар'}`;
    }
    // Для обычных транзакций показываем категорию
    return `${index + 1}. ${t.category || 'Без категории'}`;
  });
  
  const data = topExpenses.map(t => t.amount);
  const backgroundColors = topExpenses.map((_, index) => 
    `hsl(${360 - (index * 30)}, 70%, 60%)`
  );
  
  if (charts.topExpenses) {
    charts.topExpenses.destroy();
  }
  
  charts.topExpenses = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Сумма',
        data: data,
        backgroundColor: backgroundColors,
        borderWidth: 1
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            color: getComputedStyle(document.documentElement).getPropertyValue('--secondary-color'),
            callback: function(value) {
              return formatNumber(value);
            }
          }
        },
        y: {
          ticks: {
            color: getComputedStyle(document.documentElement).getPropertyValue('--secondary-color')
          }
        }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `${formatNumber(context.raw)} руб.`;
            }
          }
        }
      }
    }
  });
} 