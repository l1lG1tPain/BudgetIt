import { APP_VERSION } from '../../constants/constants.js';

(function () {
  console.log('[Analytics] Запуск analytics.js');

  const userIdKey = 'budgetit-user-id';
  const firstVisitKey = 'first-visit-date';

  // ✅ userId с генерацией
  let userId = localStorage.getItem(userIdKey);
  if (!userId) {
    const idCore = Math.random().toString(36).substring(2, 8);
    const emojis = [
    // 🌊 Морские
    '🦈', '🐬', '🐙', '🐢', '🐠', '🐳', '🦭', '🪸',

    // 💼 Финансовые
    '💼', '💸', '📊', '🧾', '🪙', '🔐', '💰', '🏦', '🧮',

    // 🤖 Технологические
    '🤖', '📱', '🔋', '💾', '🧊', '🛰️', '🧬', '🖥️', '📡',

    // 🌿 Спокойные
    '🕊️', '🌿', '🐧', '🌙', '🍃', '☁️', '🕯️', '🧘‍♂️', '🪷',

    // 🔥 Активные
    '🔥', '🎯', '🚀', '🎩', '💣', '🌪️', '🏆', '💪', '🏃‍♂️',

    // 🐸 Мемные
    '🐸', '🐷', '🍩', '🧃', '🦄', '🍕', '🧌', '🦑', '🤡', '🧟‍♂️',

    // 🧙‍♂️ Легендарные (встроены)
    '🧙‍♂️', '🐉', '👑', '🧛‍♂️', '🦸‍♂️', '🧝‍♂️', '🧞‍♂️', '🧜‍♂️', '🦅', '🧙‍♀️'
    ];

    const isMyDevice = navigator.userAgent.includes('S918B');
    const isFlagSet = localStorage.getItem('i-am-akulka') === 'yes';
    const isMe = isMyDevice || isFlagSet;

    const emoji = isMe ? '🦈' : emojis[Math.floor(Math.random() * emojis.length)];
    userId = `${emoji}${idCore}`;
    localStorage.setItem(userIdKey, userId);
  }

  // ✅ firstVisit
  let firstVisit = localStorage.getItem(firstVisitKey);
  if (!firstVisit) {
    firstVisit = new Date().toISOString().slice(0, 10);
    localStorage.setItem(firstVisitKey, firstVisit);
  }

  const retentionDays = Math.floor(
    (Date.now() - new Date(firstVisit).getTime()) / (1000 * 60 * 60 * 24)
  );

  const budgetsRaw = localStorage.getItem('budgets');
  let budgetNames = [];
  let totalTx = 0;
  let debtCount = 0;
  let txTypeCounts = {};

  try {
    const parsed = JSON.parse(budgetsRaw || '[]');
    if (Array.isArray(parsed)) {
      budgetNames = parsed.map(b => b.name || 'Без названия');
      for (const budget of parsed) {
        for (const tx of (budget.transactions || [])) {
          totalTx++;
          const type = tx.type || 'unknown';
          txTypeCounts[type] = (txTypeCounts[type] || 0) + 1;
          if (type === 'debt') debtCount++;
        }
      }
    }
  } catch (e) {
    console.warn('[Analytics] Ошибка парсинга budgets');
  }

  const mostUsedType = Object.entries(txTypeCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const data = {
    tag: 'session',
    version: APP_VERSION || 'unknown',
    id: userId, // 👈 читаемый id
    budgets: budgetNames.join(', '),
    budgetCount: budgetNames.length,
    totalTx,
    debtRatio: totalTx > 0 ? +(debtCount / totalTx).toFixed(3) : 0,
    mostUsedType,
    retentionDays
  };

  console.log('[Analytics] id:', userId);
  console.log('[Analytics] Данные identify:', data);

  if (typeof umami?.identify === 'function') {
    umami.identify(userId, data);
  }

  if (typeof window.trackSafe === 'function') {
    trackSafe('session-start', data);
  }

  // 🧠 Сохраняем глобально
  window.budgetItUserId = userId;
})();
