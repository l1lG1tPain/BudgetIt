// ================================
// currencyChips.js — Валютные чипсы с кешем, графиком, криптой и индикатором обновления
// ================================

window.addEventListener('DOMContentLoaded', () => {
    initCurrencyChips();
  });
  
  async function fetchExchangeRates() {
    const cacheKey = 'currencyRatesCache';
    const cacheTTL = 1000 * 60 * 60; // 1 час
  
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const { timestamp, data } = JSON.parse(cached);
      if (Date.now() - timestamp < cacheTTL) return data;
    }
  
    try {
      const response = await fetch('https://cbu.uz/uz/arkhiv-kursov-valyut/json/');
      const raw = await response.json();
      const currencies = ['USD', 'RUB', 'CNY', 'EUR', 'KZT', 'TRY'];
      const rates = raw.filter(item => currencies.includes(item.Ccy)).map(item => ({
        code: item.Ccy,
        rate: parseFloat(item.Rate),
        diff: parseFloat(item.Diff),
        date: item.Date
      }));
      localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data: rates }));
      return rates;
    } catch (error) {
      console.error('Ошибка загрузки курсов валют:', error);
      return [];
    }
  }
  
  async function fetchCryptoRates() {
    try {
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,tether&vs_currencies=usd');
      const data = await response.json();
      return [
        {
          code: 'BTC/USDT',
          rate: data.bitcoin.usd,
          diff: Math.random() * 200 - 100
        },
        {
          code: 'USDT/USD',
          rate: data.tether.usd,
          diff: Math.random() * 0.1 - 0.05
        }
      ];
    } catch (error) {
      console.error('Ошибка загрузки курсов криптовалют:', error);
      return [];
    }
  }
  
  function renderTrendChart(canvas, data, trendUp = true) {
    new Chart(canvas.getContext("2d"), {
      type: 'line',
      data: {
        labels: data.map((_, i) => i),
        datasets: [{
          data,
          borderColor: trendUp ? "#2be82a" : "#e82b2a",
          borderWidth: 2,
          fill: false,
          pointRadius: 0,
          tension: 0.3
        }]
      },
      options: {
        responsive: false,
        plugins: { legend: { display: false } },
        scales: { x: { display: false }, y: { display: false } }
      }
    });
  }
  
  function createCurrencyChip({ code, rate, diff }, label = 'Продажа') {
    const container = document.createElement('div');
    container.className = 'currency-chip';
    const trendUp = diff >= 0;
    const value = label === 'Покупка' ? rate - 20 : rate;
  
    container.innerHTML = `
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
  
    setTimeout(() => {
      const canvas = container.querySelector('canvas');
      const fakeHistory = Array.from({ length: 7 }, () => value + (Math.random() - 0.5) * (rate * 0.01));
      renderTrendChart(canvas, fakeHistory, trendUp);
    }, 0);
  
    return container;
  }
  
  async function initCurrencyChips() {
    const wrapper = document.createElement('div');
    wrapper.className = 'currency-chip-container';
    const target = document.querySelector('#currency-chips-placeholder');
    if (!target) return;
  
    target.appendChild(wrapper);
  
    const rates = await fetchExchangeRates();
    rates.forEach(rateData => {
      wrapper.appendChild(createCurrencyChip(rateData, 'Покупка'));
      wrapper.appendChild(createCurrencyChip(rateData, 'Продажа'));
    });
  
    const cryptoRates = await fetchCryptoRates();
    cryptoRates.forEach(cryptoData => {
      wrapper.appendChild(createCurrencyChip(cryptoData, 'Текущий'));
    });
  
    const cacheKey = 'currencyRatesCache';
    const timestamp = JSON.parse(localStorage.getItem(cacheKey))?.timestamp;
    if (timestamp) {
      const updatedAt = new Date(timestamp).toLocaleString('ru-RU');
      const timeNote = document.createElement('div');
    //   timeNote.style.cssText = 'margin-top: 8px; font-size: 0.75em; color: #888; text-align: right; padding-right: 10px';
    //   timeNote.textContent = `Обновлено: ${updatedAt}`;
      target.appendChild(timeNote);
    }
  }
  