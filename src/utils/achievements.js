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

    let unlockedIds = [];
    try {
        unlockedIds = JSON.parse(localStorage.getItem('unlockedAchievements')) || [];
    } catch (e) {
        console.warn('unlockAchievements JSON parse error', e);
    }

    const unlocked = ALL_ACHIEVEMENTS.filter(a => unlockedIds.includes(a.id));
    const locked = ALL_ACHIEVEMENTS.filter(a => !unlockedIds.includes(a.id));
    const BATCH_SIZE = 10;
    let renderedCount = 0;

    container.innerHTML = unlocked.map(ach => {
        return `<div class="achievement unlocked" data-tooltip="${ach.label}"><span>${ach.label}</span></div>`;
    }).join('');

    // Кнопка "Показать ещё"
    const loadMoreBtn = document.createElement('button');
    loadMoreBtn.className = 'load-more-achievements';
    loadMoreBtn.textContent = 'Показать ещё';
    container.appendChild(loadMoreBtn);

    function renderNextBatch() {
        const toRender = locked.slice(renderedCount, renderedCount + BATCH_SIZE);
        renderedCount += toRender.length;

        const fragment = document.createDocumentFragment();

        toRender.forEach(ach => {
            const isHidden = ach.hidden && !unlockedIds.includes(ach.id);
            const labelText = isHidden ? '🔒 Секретное достижение' : '🔒 ???';
            const tooltip = isHidden ? 'Это секретное достижение. Откроется при выполнении условий.' : 'Достижение будет открыто позже';

            const div = document.createElement('div');
            div.className = 'achievement locked';
            div.setAttribute('data-tooltip', tooltip);
            div.innerHTML = `<span>${labelText}</span>`;

            fragment.appendChild(div);
        });

        // Вставляем ПЕРЕД кнопкой
        container.insertBefore(fragment, loadMoreBtn);

        if (renderedCount >= locked.length) {
            loadMoreBtn.remove();
        }
    }

    renderNextBatch(); // первая порция

    loadMoreBtn.onclick = renderNextBatch;

    renderProfileSummary(unlocked.length, ALL_ACHIEVEMENTS.length);
}

