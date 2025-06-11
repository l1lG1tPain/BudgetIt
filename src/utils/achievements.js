// achievements.js
import { showTweak } from './tweakSystem.js';
import { ALL_ACHIEVEMENTS } from '../../constants/achievementList.js';

export function getUnlockedAchievements({ txCount, totals, budgetCount, currentLevel = 1 }, onUnlocked) {
    const unlockedIds = JSON.parse(localStorage.getItem('unlockedAchievements') || '[]');
    const newlyUnlocked = [];

    ALL_ACHIEVEMENTS.forEach(ach => {
        const already = unlockedIds.includes(ach.id);
        const passed = ach.condition(txCount, totals, budgetCount, currentLevel);
        if (!already && passed) {
            showTweak(`🏆 Новое достижение: ${ach.label}`, 'success', 3500);
            newlyUnlocked.push(ach.id);
        }
    });

    if (newlyUnlocked.length) {
        const all = [...unlockedIds, ...newlyUnlocked];
        localStorage.setItem('unlockedAchievements', JSON.stringify(all));

        // ✅ Вызов обновления, если передан
        if (typeof onUnlocked === 'function') {
            onUnlocked(all);
        }
    }

    return [...unlockedIds, ...newlyUnlocked];
}


export function renderProfileSummary(unlocked, total) {
    const percent = Math.floor((unlocked / total) * 100);
    document.getElementById('unlocked-count').textContent = unlocked;
    document.getElementById('total-count').textContent = total;
    document.getElementById('percent-count').textContent = percent + '%';

    const progressEl = document.getElementById('achievement-progress-bar');
    if (progressEl) progressEl.style.width = percent + '%';

    // Подгрузи данные о текущем уровне и аватаре
    const userEmoji = localStorage.getItem('budget-user-emoji') || '❔';
    const userId = localStorage.getItem('budget-user-id') || '—';
    const totalTx = parseInt(localStorage.getItem('tx-total') || '0', 10);
    const userLevel = getUserLevel(totalTx);

    document.getElementById('user-emoji-profile').textContent = userEmoji;
    document.getElementById('user-id-profile').textContent = userId;
    document.getElementById('user-level-profile').textContent = userLevel.level;
    document.getElementById('level-progress-text').textContent = `${totalTx} / ${userLevel.nextThreshold}`;

    const levelProgress = Math.floor((totalTx / userLevel.nextThreshold) * 100);
    document.getElementById('level-progress-bar').style.width = `${Math.min(levelProgress, 100)}%`;
}


export function renderAchievementsList(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const unlockedIds = JSON.parse(localStorage.getItem('unlockedAchievements') || '[]');

    container.innerHTML = ALL_ACHIEVEMENTS.map(ach => {
        const unlocked = unlockedIds.includes(ach.id);
        const isHidden = ach.hidden && !unlocked;

        const labelText = unlocked
            ? ach.label
            : isHidden
                ? '🔒 Секретное достижение'
                : '🔒 ???';

        const tooltip = unlocked
            ? ach.label
            : isHidden
                ? 'Это секретное достижение. Откроется при выполнении условий.'
                : 'Достижение будет открыто позже';

        return `
          <div class="achievement ${unlocked ? 'unlocked' : 'locked'}" data-tooltip="${tooltip}">
            <span>${labelText}</span>
          </div>
        `;
    }).join('');

    renderProfileSummary(unlockedIds.length, ALL_ACHIEVEMENTS.length);
}
