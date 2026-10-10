import { APP_VERSION } from '../../constants/constants.js';
import {
  marine,
  financial,
  tech,
  calm,
  active,
  meme,
  legendary
} from './emojiMap.js';   // ← проверь путь под свою структуру

(function () {
  try {
    console.log('[Analytics] Запуск analytics.js');

    const userIdKey     = 'budgetit-user-id';
    const firstVisitKey = 'first-visit-date';

    /* ---------- 1. Общий пул эмодзи из категорий ---------- */
    const emojis = [
      ...marine,
      ...financial,
      ...tech,
      ...calm,
      ...active,
      ...meme,
      ...legendary
    ];

    /* ---------- 2. userId с сохранением ---------- */
    let userId = localStorage.getItem(userIdKey);
    if (!userId) {
      const idCore     = Math.random().toString(36).substring(2, 8);
      const isMyDevice = navigator.userAgent.includes('SM-S918B/DS');
      const isFlagSet  = localStorage.getItem('i-am-akulka') === 'yes';
      const isMe       = isMyDevice || isFlagSet;

      const emoji = isMe ? '🦈' : emojis[Math.floor(Math.random() * emojis.length)];
      userId      = `${emoji}${idCore}`;
      localStorage.setItem(userIdKey, userId);
    }

    window.budgetItUserId = userId;

    /* ---------- 3. Первая дата визита ---------- */
    let firstVisit = localStorage.getItem(firstVisitKey);
    if (!firstVisit) {
      firstVisit = new Date().toISOString().slice(0, 10);
      localStorage.setItem(firstVisitKey, firstVisit);
    }

    const retentionDays = Math.floor(
      (Date.now() - new Date(firstVisit).getTime()) / 86_400_000
    );

    /* ---------- 4. Сбор данных о бюджетах ---------- */
    const budgetsRaw   = localStorage.getItem('budgets');
    let budgetNames    = [];
    let totalTx        = 0;
    let debtCount      = 0;
    let txTypeCounts   = {};

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
      console.warn('[Analytics] Ошибка парсинга budgets:', e);
    }

    const mostUsedType = Object.entries(txTypeCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    /* ---------- 5. Формирование payload ---------- */
    const data = {
      tag: 'session',
      version: APP_VERSION || 'unknown',
      id: userId,
      budgets: budgetNames.join(', '),
      budgetCount: budgetNames.length,
      totalTx,
      debtRatio: totalTx ? +(debtCount / totalTx).toFixed(3) : 0,
      mostUsedType,
      retentionDays
    };


    /* ---------- 6. Отправка в Umami ---------- */
    try {
      if (typeof umami !== 'undefined' && typeof umami.identify === 'function') {
        umami.identify(userId, data);
        console.log('[Analytics] identify отправлен');
      } else {
        console.warn('[Analytics] umami.identify недоступен');
      }
    } catch (err) {
      console.warn('[Analytics] Ошибка при вызове identify:', err);
    }

    /* ---------- 7. Доп. событие через trackSafe ---------- */
    try {
      if (typeof window.trackSafe === 'function') {
        window.trackSafe('session-start', data);
      }
    } catch (err) {
      console.warn('[Analytics] Ошибка при вызове trackSafe:', err);
    }

  } catch (err) {
    console.error('[Analytics] Глобальный сбой:', err);
  }
})();
