// profileAnalytics.js
import { emojiProfiles, AVATAR_BASE_URL } from './utils/emojiMap.js';

export function normalizeEmoji(str) {
    return str
        .normalize('NFC')
        .replace(/[\uFE0E\uFE0F\u200D]/g, '')
        .replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '');
}

export function getFirstGraphemeCluster(str) {
    // Используем Intl.Segmenter для получения первого "графемного кластера" (цельного emoji)
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
        const segmenter = new Intl.Segmenter('ru', { granularity: 'grapheme' });
        return [...segmenter.segment(str)][0]?.segment || '';
    }
    // Если Intl.Segmenter не поддерживается, просто вернём первый символ (не идеально, но безопасно)
    return str.charAt(0);
}

export function refreshUserProfile(budgetManager) {
    const totalTx = budgetManager?.getTotalTransactions?.() ?? 0;
    const userId = localStorage.getItem('budgetit-user-id') || '❔';

    // Вытаскиваем первый полноценный "графемный кластер" (emoji) из userId
    const firstCluster = getFirstGraphemeCluster(userId) || '❔';

    // Рассчитываем уровень и прогресс
    const levels = [50, 100, 200, 500, 1000, 2500, 5000];
    let currentLevel = 1;
    let nextThreshold = 50;

    for (let i = 0; i < levels.length; i++) {
        if (totalTx >= levels[i]) {
            currentLevel = i + 2;
            nextThreshold = levels[i + 1] || levels[i];
        } else {
            nextThreshold = levels[i];
            break;
        }
    }

    const currentThreshold = levels[currentLevel - 2] || 0;
    const progress = Math.min(
        100,
        ((totalTx - currentThreshold) / (nextThreshold - currentThreshold)) * 100
    );

    // Элементы DOM
    const levelEl = document.getElementById('user-level');
    const countEl = document.getElementById('tx-count');
    const nextEl = document.getElementById('tx-next');
    const emojiEl = document.getElementById('user-emoji');
    const barEl = document.getElementById('user-progress');
    const idTextEl = document.getElementById('user-id-text');
    const nameEl = document.getElementById('user-emoji-name');

    // Заполняем значения уровня и транзакций
    if (levelEl) levelEl.textContent = currentLevel;
    if (countEl) countEl.textContent = totalTx;
    if (nextEl) nextEl.textContent = nextThreshold;

    // Нормализуем первый кластер и ищем профиль в emojiProfiles
    const normalizedEmoji = normalizeEmoji(firstCluster);
    const profile = emojiProfiles.find(p => normalizeEmoji(p.emoji) === normalizedEmoji);

    // Вставляем картинку эмодзи или fallback
    if (emojiEl) {
        if (profile?.img) {
            emojiEl.innerHTML = `
                <img
                    src="${profile.img}"
                    alt="${firstCluster}"
                    class="emoji-avatar"
                    onerror="this.onerror=null; this.src='${profile.fallbackImg}'"
                >
            `;
        } else {
            emojiEl.innerHTML = `
                <img
                    src="${AVATAR_BASE_URL}default.png"
                    alt="${firstCluster}"
                    class="emoji-avatar"
                >
            `;
        }
    }

    // Вставляем имя эмодзи или сообщение об неизвестном
    if (nameEl && profile?.name) {
        nameEl.textContent = profile.name;
    } else if (nameEl) {
        nameEl.textContent = 'Неизвестный эмодзи';
    }

    // Обновляем прогресс-бар
    if (barEl) barEl.style.width = `${progress}%`;

    // Отображаем сам userId (если он есть в глобальной области)
    if (idTextEl && window.budgetItUserId) {
        idTextEl.textContent = window.budgetItUserId;
    }
}
