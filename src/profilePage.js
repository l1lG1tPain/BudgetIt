import { emojiProfiles, AVATAR_BASE_URL } from './utils/emojiMap.js';
window._emojiProfiles = emojiProfiles;
window._avatarBaseUrl = AVATAR_BASE_URL;

import { getUnlockedAchievements, renderProfileSummary, renderAchievementsList } from './utils/achievements.js';
import { calculateAchievementPoints, calculateUserLevel } from './utils/achievementUtils.js';
import { ALL_ACHIEVEMENTS } from '../constants/achievementList.js';

// ── Инициализация даты первого запуска ──────────────────────────────
function ensureInstallDate() {
    if (!localStorage.getItem('budgetit-install-date')) {
        localStorage.setItem('budgetit-install-date', new Date().toISOString());
    }
}

// ── Рендер страницы профиля ─────────────────────────────────────────
export function renderProfilePage(budgetManager) {
    ensureInstallDate();

    const bm = budgetManager;
    // Данные
    const totalTx = bm.getTotalTransactions?.() ?? 0;
    const budgetCount = bm.budgets?.length ?? 0;
    const userId = localStorage.getItem('budgetit-user-id') || '❔';
    const installDate = localStorage.getItem('budgetit-install-date');
    const unlockedIds = JSON.parse(localStorage.getItem('unlockedAchievements') || '[]');

    // Очки за достижения — используем ту же логику что и profileAnalytics
    const achPoints = calculateAchievementPoints(unlockedIds, ALL_ACHIEVEMENTS);
    const totalPoints = totalTx + achPoints;

    // Уровень — используем единую функцию calculateUserLevel
    const { currentLevel, nextThreshold, progress } = calculateUserLevel(totalPoints);
    const remaining = Math.max(0, nextThreshold - totalPoints);

    // Дней в приложении
    let daysInApp = '—';
    let txPerDay = '—';

    if (installDate) {
        const msInDay = 86400000;
        const days = Math.max(1, Math.floor((Date.now() - new Date(installDate).getTime()) / msInDay));
        daysInApp = days;
        txPerDay = (totalTx / days).toFixed(1);
    }

    const sinceFormatted = installDate
        ? new Date(installDate).toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        })
        : '—';

    const secretCount = unlockedIds.filter(id =>
        ALL_ACHIEVEMENTS.find?.(a => a.id === id && a.secret)
    ).length;

    const regularCount = unlockedIds.length - secretCount;

    // ── DOM ───────────────────────────────
    _setText('pp-level', currentLevel);
    _setText('pp-level-badge', currentLevel);
    _setText('pp-level-pts', `${totalPoints} / ${nextThreshold} pts`);
    _setText('pp-level-remaining', remaining);
    _setText('pp-points', totalPoints);
    _setText('pp-achievements', `${unlockedIds.length}`);
    _setText('pp-budgets', budgetCount);
    _setText('pp-transactions', totalTx);
    _setText('pp-since', sinceFormatted);
    _setText('pp-days', daysInApp);
    _setText('pp-tx-per-day', txPerDay);
    _setText('pp-ach-pts', achPoints);
    _setText('pp-ach-breakdown', `${regularCount} / ${secretCount}`);
    _setText('pp-user-id', `ID: ${userId}`);

    requestAnimationFrame(() => {
        const fill = document.getElementById('pp-level-fill');
        if (fill) fill.style.width = `${progress}%`;
    });

    _renderAvatar(userId);
    _renderActivityBars(bm);

    // 🔥 ФИКС: ДОСТИЖЕНИЯ
    const achBtn = document.getElementById('pp-goto-achievements');

    if (achBtn) {
        achBtn.onclick = () => {
            const profile = document.getElementById('profile-page');
            const page = document.getElementById('achievements-page');

            profile?.classList.add('hidden');

            if (!page) return;

            page.style.opacity = 0;
            page.classList.remove('hidden');

            requestAnimationFrame(() => {
                renderAchievementsList('achievements-container');
                page.style.opacity = 1;
            });
        };
    }

    // Назад
    const backBtn = document.getElementById('profile-page-back');

    if (backBtn) {
        backBtn.onclick = () => {
            document.getElementById('profile-page')?.classList.add('hidden');
            document.getElementById('settings-page')?.classList.remove('hidden');
        };
    }
}

// ── HELPERS ──────────────────────────────
function _setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

function _renderAvatar(userId) {
    const avatarEl = document.getElementById('pp-avatar');
    const nameEl = document.getElementById('pp-emoji-name');

    if (!avatarEl) return;

    const emojiProfiles = window._emojiProfiles || [];

    const normalize = str =>
        str.normalize('NFC')
            .replace(/[\uFE0E\uFE0F\u200D]/g, '')
            .replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '');

    const firstChar = (typeof Intl !== 'undefined' && Intl.Segmenter)
        ? [...new Intl.Segmenter('ru', { granularity: 'grapheme' }).segment(userId)][0]?.segment || '❔'
        : userId.charAt(0);

    const normalizedEmoji = normalize(firstChar);
    const profile = emojiProfiles.find(p => normalize(p.emoji) === normalizedEmoji);

    const AVATAR_BASE = window._avatarBaseUrl || '';

    avatarEl.innerHTML = `
        <img
            src="${profile?.img || `${AVATAR_BASE}default.png`}"
            alt="${firstChar}"
            onerror="this.onerror=null;this.src='${profile?.fallbackImg || `${AVATAR_BASE}default.png`}'"
            style="width:100%;height:100%;object-fit:cover;"
        >
    `;

    if (nameEl) nameEl.textContent = profile?.name || 'Неизвестный эмодзи';
}

function _renderActivityBars(bm) {
    const container = document.getElementById('pp-activity-bars');
    if (!container) return;

    const now = new Date();
    const months = [];

    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({
            year: d.getFullYear(),
            month: d.getMonth() + 1,
            label: d.toLocaleDateString('ru-RU', { month: 'short' }).replace('.', ''),
            count: 0
        });
    }

    const allTxs = bm.budgets?.flatMap(b => b.transactions || []) || [];

    allTxs.forEach(tx => {
        if (!tx.date) return;

        const d = new Date(tx.date);
        if (isNaN(d)) return;

        const slot = months.find(m =>
            m.year === d.getFullYear() && m.month === d.getMonth() + 1
        );

        if (slot) slot.count++;
    });

    const maxCount = Math.max(1, ...months.map(m => m.count));
    const currentMonth = now.getMonth() + 1;

    container.innerHTML = months.map(m => {
        const heightPct = Math.round((m.count / maxCount) * 100);
        const isCurrent = m.month === currentMonth && m.year === now.getFullYear();

        return `
            <div class="pp-activity-bar-wrap">
                <div class="pp-activity-bar${isCurrent ? ' pp-bar--current' : ''}"
                     style="height:${Math.max(4, heightPct * 0.52)}px">
                </div>
                <div class="pp-activity-month">${m.label}</div>
            </div>
        `;
    }).join('');
}

// ── Обновляет имя акулки в hero-карточке settings-page ──────────────
// Вызывается при инициализации settings и при смене аватара
export function refreshHeroName(userId) {
    const heroNameEl = document.getElementById('sp-hero-name');
    if (!heroNameEl) return;

    const emojiProfiles = window._emojiProfiles || [];

    const normalize = str =>
        str.normalize('NFC')
            .replace(/[\uFE0E\uFE0F\u200D]/g, '')
            .replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '');

    const uid = userId || localStorage.getItem('budgetit-user-id') || '';
    const firstChar = (typeof Intl !== 'undefined' && Intl.Segmenter)
        ? [...new Intl.Segmenter('ru', { granularity: 'grapheme' }).segment(uid)][0]?.segment || '❔'
        : uid.charAt(0);

    const profile = emojiProfiles.find(p => normalize(p.emoji) === normalize(firstChar));
    heroNameEl.textContent = profile?.name || uid || '—';
}

export function openProfilePage(budgetManager) {
    document.getElementById('settings-page')?.classList.add('hidden');

    const page = document.getElementById('profile-page');
    if (!page) return;

    page.classList.remove('hidden');
    renderProfilePage(budgetManager);
}