// ================================
// currencyChips.js — Валютные чипсы с кешем, графиками и криптой
// ================================

window.addEventListener('DOMContentLoaded', initCurrencyChips);

// ──────────────────────────────────────────────────────────────────────
// 1. Fetch + кэш курсов CBU (1 час)
// ──────────────────────────────────────────────────────────────────────
async function fetchExchangeRates () {
  const CACHE_KEY = 'currencyRatesCache';
  const TTL       = 1000 * 60 * 60;           // 1 час

  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) {
    const { timestamp, data } = JSON.parse(cached);
    if (Date.now() - timestamp < TTL) return data;
  }

  try {
    const res  = await fetch('https://cbu.uz/uz/arkhiv-kursov-valyut/json/');
    const raw  = await res.json();
    const want = ['USD','RUB','CNY','EUR','KZT','TRY'];

    const rates = raw
        .filter(r => want.includes(r.Ccy))
        .map(r => ({
          code : r.Ccy,
          rate : +r.Rate,
          diff : +r.Diff,
          date : r.Date
        }));

    localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: rates }));
    return rates;
  } catch (err) {
    console.error('[Currency] fetch CBU error:', err);
    return [];
  }
}

// ──────────────────────────────────────────────────────────────────────
// 2. Fetch крипты (простая пара BTC / USDT)
// ──────────────────────────────────────────────────────────────────────
async function fetchCryptoRates () {
  try {
    const url = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,tether&vs_currencies=usd';
    const res = await fetch(url, { cache: 'no-store' });
    const js  = await res.json();
    return [
      { code: 'BTC/USDT', rate: js.bitcoin.usd, diff: Math.random() * 200 - 100 },
      { code: 'USDT/USD', rate: js.tether.usd,  diff: Math.random() * 0.2  - 0.1 }
    ];
  } catch (err) {
    console.error('[Currency] fetch crypto error:', err);
    return [];
  }
}

// ──────────────────────────────────────────────────────────────────────
// 3. Мини-график (Chart.js). 🛠 Уничтожаем старый instance, если есть.
// ──────────────────────────────────────────────────────────────────────
function renderTrendChart (canvas, data, trendUp) {
  if (canvas._chart) {
    canvas._chart.destroy();
    canvas._chart = null;
  }
  canvas._chart = new Chart(canvas.getContext('2d'), {
    type : 'line',
    data : {
      labels   : data.map((_, i) => i),
      datasets : [{
        data,
        borderColor: trendUp ? '#2be82a' : '#e82b2a',
        borderWidth: 2,
        fill       : false,
        pointRadius: 0,
        tension    : 0.3
      }]
    },
    options: {
      responsive: false,
      plugins   : { legend: { display: false } },
      scales    : { x: { display: false }, y: { display: false } }
    }
  });
}

// ──────────────────────────────────────────────────────────────────────
// 4. Создание одной «чипсы»
// ──────────────────────────────────────────────────────────────────────
function createCurrencyChip ({ code, rate, diff }, label = 'Продажа') {
  const trendUp = diff >= 0;
  const value   = label === 'Покупка' ? rate - 20 : rate;   // условно

  const el = document.createElement('div');
  el.className = 'currency-chip';
  el.innerHTML = `
    <div class="chip-body chip-compact">
      <div class="chip-info">
        <span class="currency-name">${code}</span>
        <span class="label">${label}</span>
        <span class="${trendUp ? 'trend-up' : 'trend-down'}">${trendUp ? '▲' : '▼'}</span>
      </div>
      <div class="chip-value">${value.toFixed(2)}</div>
      <canvas class="trend-graph" width="60" height="30"></canvas>
    </div>
  `;

  // отрисуем график после добавления в DOM
  queueMicrotask(() => {
    const canvas      = el.querySelector('canvas');
    const fakeHistory = Array.from({ length: 7 }, () => value + (Math.random() - 0.5) * (rate * 0.01));
    renderTrendChart(canvas, fakeHistory, trendUp);
  });

  return el;
}

// ──────────────────────────────────────────────────────────────────────
// 5. Инициализация контейнера
// ──────────────────────────────────────────────────────────────────────
async function initCurrencyChips () {
  const target = document.querySelector('#currency-chips-placeholder');
  if (!target) return;

  // если уже был контейнер — удаляем, чтобы избежать дубликатов 🛠
  const old = target.querySelector('.currency-chip-container');
  old && old.remove();

  const wrap = document.createElement('div');
  wrap.className = 'currency-chip-container';
  target.appendChild(wrap);

  const rates       = await fetchExchangeRates();
  const cryptoRates = await fetchCryptoRates();

  rates.forEach(r => {
    wrap.appendChild(createCurrencyChip(r, 'Покупка'));
    wrap.appendChild(createCurrencyChip(r, 'Продажа'));
  });
  cryptoRates.forEach(c => {
    wrap.appendChild(createCurrencyChip(c, 'Текущий'));
  });

  // 🛠 отображаем отметку времени кэша
  const cache = JSON.parse(localStorage.getItem('currencyRatesCache') || '{}');
  if (cache.timestamp) {
    const note = document.createElement('div');
    note.className = 'chip-time-note';
    note.textContent = `Обновлено: ${new Date(cache.timestamp).toLocaleString('ru-RU')}`;
    wrap.appendChild(note);
  }
}
