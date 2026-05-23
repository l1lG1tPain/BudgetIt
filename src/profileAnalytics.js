import { emojiProfiles, AVATAR_BASE_URL } from './utils/emojiMap.js';
import { getUnlockedAchievements } from './utils/achievements.js';
import { calculateAchievementContext, calculateAchievementPoints, calculateUserLevel } from './utils/achievementUtils.js';
import { ALL_ACHIEVEMENTS } from '../constants/achievementList.js';

export function normalizeEmoji(str) {
    return str
        .normalize('NFC')
        .replace(/[\uFE0E\uFE0F\u200D]/g, '')
        .replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '');
}

export function getFirstGraphemeCluster(str) {
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
        const segmenter = new Intl.Segmenter('ru', { granularity: 'grapheme' });
        return [...segmenter.segment(str)][0]?.segment || '';
    }
    return str.charAt(0);
}

export function updateUserLevelInfo(txCount = 0, emoji = '❔') {
    const achievementIds = JSON.parse(localStorage.getItem('unlockedAchievements') || '[]');
    const bonusPoints = calculateAchievementPoints(achievementIds, ALL_ACHIEVEMENTS);
    const totalPoints = txCount + bonusPoints;

    const levels = [50, 100, 200, 500, 1000, 2500, 5000];
    let currentLevel = 1;
    let nextThreshold = levels[0];

    for (let i = 0; i < levels.length; i++) {
        if (totalPoints >= levels[i]) {
            currentLevel = i + 2;
            nextThreshold = levels[i + 1] || levels.at(-1);
        }
    }

    const progress = Math.min(100, Math.round((totalPoints / nextThreshold) * 100));

    const levelEl = document.getElementById('user-level-profile');
    if (levelEl) levelEl.textContent = currentLevel;

    const progressTextEl = document.getElementById('level-progress-text');
    if (progressTextEl) {
        progressTextEl.textContent = `${totalPoints} / ${nextThreshold} до уровня ${currentLevel + 1}`;
    }

    const progressBarEl = document.getElementById('level-progress-bar');
    if (progressBarEl) {
        progressBarEl.style.width = `${progress}%`;
    }

    const txNode = document.getElementById('tx-count');
    if (txNode) {
        txNode.textContent = totalPoints; // 🔄 Только общее число
    }

    const levelSmall = document.getElementById('user-level');
    if (levelSmall) levelSmall.textContent = currentLevel;

    const txMax = document.getElementById('tx-next');
    if (txMax) txMax.textContent = nextThreshold;

    const progressSmall = document.getElementById('user-progress');
    if (progressSmall) progressSmall.style.width = `${progress}%`;

// Показываем очки за достижения отдельно (если есть блок)
    const bonusEl = document.getElementById('achievement-points');
    if (bonusEl) {
        bonusEl.textContent = bonusPoints;
    }
}

export function refreshUserProfile(budgetManager) {
    const totalTx = budgetManager?.getTotalTransactions?.() ?? 0;
    const userId = localStorage.getItem('budgetit-user-id') || '❔';

    const txs = budgetManager.getCurrentBudget().transactions || [];
    const totals = calculateAchievementContext(txs, budgetManager.getCurrentBudget());
    const budgetCount = budgetManager.budgets?.length || 0;

    // Предварительно получаем уже открытые ачивки
    const unlockedIds = JSON.parse(localStorage.getItem('unlockedAchievements') || '[]');
    const bonusPoints = calculateAchievementPoints(unlockedIds, ALL_ACHIEVEMENTS);
    const totalPoints = totalTx + bonusPoints;

    // Корректно рассчитываем уровень пользователя
    const { currentLevel, nextThreshold, progress } = calculateUserLevel(totalPoints);

    // ✅ Передаём актуальный уровень, чтобы открыть ачивки уровня
    const achievementIds = getUnlockedAchievements({
        txCount: totalTx,
        totals,
        budgetCount,
        currentLevel
    }, () => {
        setTimeout(() => refreshUserProfile(budgetManager), 50);
    });


    // Обновляем отображение очков за достижения
    const bonusEl = document.getElementById('achievement-points');
    if (bonusEl) {
        bonusEl.textContent = calculateAchievementPoints(achievementIds, ALL_ACHIEVEMENTS);
    }

    // Эмодзи пользователя
    const firstCluster = getFirstGraphemeCluster(userId) || '❔';
    const normalizedEmoji = normalizeEmoji(firstCluster);
    const profile = emojiProfiles.find(p => normalizeEmoji(p.emoji) === normalizedEmoji);

    // DOM-элементы
    const levelEl = document.getElementById('user-level');
    const countEl = document.getElementById('tx-count');
    const nextEl = document.getElementById('tx-next');
    const emojiEl = document.getElementById('user-emoji');
    const barEl = document.getElementById('user-progress');
    const idTextEl = document.getElementById('user-id-text');
    const nameEl = document.getElementById('user-emoji-name');

    // Уровень и прогресс
    if (levelEl) levelEl.textContent = currentLevel;
    if (countEl) countEl.textContent = totalPoints;
    if (nextEl) nextEl.textContent = nextThreshold;
    if (barEl) barEl.style.width = `${progress}%`;

    // Эмодзи и имя
    if (emojiEl) {
        emojiEl.innerHTML = `
            <img
                src="${profile?.img || `${AVATAR_BASE_URL}default.png`}"
                alt="${firstCluster}"
                class="emoji-avatar"
                onerror="this.onerror=null; this.src='${profile?.fallbackImg || `${AVATAR_BASE_URL}default.png`}'"
            >
        `;
    }

    if (nameEl) {
        nameEl.textContent = profile?.name || 'Неизвестный эмодзи';
    }

    // ── Обновляем имя акулки в hero-карточке settings-page ──
    const heroNameEl = document.getElementById('sp-hero-name');
    if (heroNameEl) {
        heroNameEl.textContent = profile?.name || userId || '—';
    }

    if (idTextEl && window.budgetItUserId) {
        idTextEl.textContent = window.budgetItUserId;
    }
}