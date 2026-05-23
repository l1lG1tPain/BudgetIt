// achievements.js
import { showTweak } from './tweakSystem.js';
import { ALL_ACHIEVEMENTS } from '../../constants/achievementList.js';
import { calculateUserLevel } from './achievementUtils.js';

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
        if (typeof onUnlocked === 'function') onUnlocked(all);
    }

    return [...unlockedIds, ...newlyUnlocked];
}


export function renderProfileSummary(unlocked, total) {
    const percent = Math.floor((unlocked / total) * 100);

    const setText  = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const setWidth = (id, w)   => { const el = document.getElementById(id); if (el) el.style.width = w; };

    setText('unlocked-count', unlocked);
    setText('total-count', total);
    setText('percent-count', percent + '%');
    setWidth('achievement-progress-bar', percent + '%');

    const unlockedIds  = JSON.parse(localStorage.getItem('unlockedAchievements') || '[]');
    const bonusPoints  = unlockedIds.length * 5;
    const totalTx      = parseInt(localStorage.getItem('tx-total') || '0', 10);
    const totalPoints  = totalTx + bonusPoints;
    const { currentLevel, nextThreshold } = calculateUserLevel(totalPoints);

    setText('user-level-profile', currentLevel);
    setText('level-progress-text', `${totalPoints} / ${nextThreshold}`);
    setWidth('level-progress-bar', Math.min(100, Math.round((totalPoints / nextThreshold) * 100)) + '%');
}


// ─────────────────────────────────────────────────────────────────
// Группы для категорий на странице достижений
// ─────────────────────────────────────────────────────────────────
const ACHIEVEMENT_GROUPS = [
    {
        id: 'progress',
        label: '📊 Прогресс',
        ids: [
            'first-transaction','tx-20','tx-50','tx-100','tx-150','tx-200','tx-250',
            'tx-300','tx-400','tx-500','tx-750','tx-999','tx-1000',
            'level-2','level-3','level-4','level-5','level-6','level-7',
        ]
    },
    {
        id: 'money',
        label: '💰 Деньги',
        ids: [
            'spent-1m','spent-5m','spent-10m','spent-20m','spent-50m','spent-75m','spent-100m',
            'spent-500m','spent-750m','spent-999m','spent-1b','spent-2b','spent-3b','spent-5b','spent-7b','spent-10b',
            'income-5m','income-10m','income-50m','income-75m','income-100m','income-500m',
            'income-750m','income-999m','income-1b','income-2b','income-3b','income-5b','income-7b','income-10b',
        ]
    },
    {
        id: 'budgets',
        label: '📦 Бюджеты и вклады',
        ids: ['multi-budget','budget-5','budget-10','saver','saver-10','debt-1','debt-5','debt-10','debt-20','debt-50']
    },
    {
        id: 'planner',
        label: '📅 Планировщик',
        ids: ['planner-first','planner-5','planner-20','planner-done']
    },
    {
        id: 'behavior',
        label: '🧠 Привычки',
        ids: [
            'coffee-starter','coffein-dependant','coffee-junkie','coffee-overdose','coffe-break-even','expensive-coffee',
            'kalyan-collector','kalyan-life',
            'sweet-romance','romantic-spree','love-ruin',
            'repeated-tx','daily-burst','tactical-strike',
            'zero-income','negative-balance','zeroed-out','deep-red','unicorn-income',
        ]
    },
    {
        id: 'time',
        label: '🌙 Время',
        ids: ['midnight-transaction','early-bird','impulse-spender','late-saver','sunday-saver']
    },
    {
        id: 'categories',
        label: '🏷️ Категории',
        ids: [
            'lucky-thirteen','odd-category-count','round-category-20','category-mania-lite',
            'category-day-10','category-day-20','category-day-30','category-day-50','category-day-100','category-day-250',
        ]
    },
    {
        id: 'akulka',
        label: '🦈 Акулка',
        ids: ['akula-category','akula-party','akula-tx-10','akula-lover']
    },
    {
        id: 'easter',
        label: '🎭 Пасхалки',
        ids: [
            'exactly-404','exactly-1337','exactly-666','all-sevens','round-million',
            'palindrome-amount','binary-boss','year-view',
            'ghost-budget','angry-emoji','suspicious-income',
            'delete-everything','export-before-first-tx','tx-on-birthday',
        ]
    },
];


// ─────────────────────────────────────────────────────────────────
// Рендер страницы достижений
// ─────────────────────────────────────────────────────────────────
export function renderAchievementsList(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    let unlockedIds = [];
    try {
        unlockedIds = JSON.parse(localStorage.getItem('unlockedAchievements')) || [];
    } catch (e) {
        console.warn('unlockedAchievements parse error', e);
    }

    const unlockedSet  = new Set(unlockedIds);
    const achById      = Object.fromEntries(ALL_ACHIEVEMENTS.map(a => [a.id, a]));
    const unlockedAll  = ALL_ACHIEVEMENTS.filter(a => unlockedSet.has(a.id));
    const assignedIds  = new Set(ACHIEVEMENT_GROUPS.flatMap(g => g.ids));

    // Ачивки не попавшие ни в одну группу → в «Прочее»
    const ungrouped = ALL_ACHIEVEMENTS.filter(a => !assignedIds.has(a.id));

    const groups = ungrouped.length
        ? [...ACHIEVEMENT_GROUPS, { id: 'other', label: '🔮 Прочее', ids: ungrouped.map(a => a.id) }]
        : ACHIEVEMENT_GROUPS;

    container.innerHTML = '';

    // ── Шапка: фильтры ──
    const filterBar = document.createElement('div');
    filterBar.className = 'ach-filter-bar';
    filterBar.innerHTML = `
        <button class="ach-filter-chip active" data-filter="all">Все</button>
        <button class="ach-filter-chip" data-filter="unlocked">🔓 Открытые</button>
        <button class="ach-filter-chip" data-filter="locked">🔒 Закрытые</button>
        ${groups.map(g => `<button class="ach-filter-chip" data-filter="${g.id}">${g.label}</button>`).join('')}
    `;
    container.appendChild(filterBar);

    // ── Контейнер групп ──
    const groupsWrap = document.createElement('div');
    groupsWrap.className = 'ach-groups-wrap';
    container.appendChild(groupsWrap);

    function renderGroups(filter) {
        groupsWrap.innerHTML = '';

        const groupsToRender = (filter === 'all' || filter === 'unlocked' || filter === 'locked')
            ? groups
            : groups.filter(g => g.id === filter);

        groupsToRender.forEach(group => {
            const items = group.ids
                .map(id => achById[id])
                .filter(Boolean)
                .filter(ach => {
                    const isUnlocked = unlockedSet.has(ach.id);
                    if (filter === 'unlocked') return isUnlocked;
                    if (filter === 'locked')   return !isUnlocked;
                    return true;
                });

            if (items.length === 0) return;

            const unlockedInGroup = items.filter(a => unlockedSet.has(a.id)).length;

            const section = document.createElement('div');
            section.className = 'ach-group';
            section.innerHTML = `
                <div class="ach-group-header">
                    <span class="ach-group-title">${group.label}</span>
                    <span class="ach-group-count">${unlockedInGroup} / ${items.length}</span>
                </div>
                <div class="ach-group-grid">
                    ${items.map(ach => renderCard(ach, unlockedSet.has(ach.id))).join('')}
                </div>
            `;
            groupsWrap.appendChild(section);
        });

        if (groupsWrap.children.length === 0) {
            groupsWrap.innerHTML = `
                <div class="ach-empty">
                    <div class="ach-empty-icon">🤷</div>
                    <div>Пока ничего нет</div>
                </div>
            `;
        }
    }

    // ── Фильтр по клику ──
    filterBar.querySelectorAll('.ach-filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            filterBar.querySelectorAll('.ach-filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            renderGroups(chip.dataset.filter);
        });
    });

    renderGroups('all');

    renderProfileSummary(unlockedAll.length, ALL_ACHIEVEMENTS.length);
}


function renderCard(ach, isUnlocked) {
    const isHidden = ach.hidden && !isUnlocked;
    const label    = isHidden ? '🔒 Секретное достижение' : ach.label;
    const tooltip  = isHidden ? 'Откроется при выполнении условий' : ach.label;

    return `
        <div class="ach-card ${isUnlocked ? 'unlocked' : 'locked'}" data-tooltip="${tooltip}">
            <span class="ach-card-label">${label}</span>
        </div>
    `;
}