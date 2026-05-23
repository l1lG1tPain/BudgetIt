// === ThemeManager.js v4.0 — плиточный грид тем с CSS-превью ===
const THEME_KEY = 'appTheme';

let _switchTimer = null;
let _pendingTheme = null;

export function setTheme(theme) {
    _pendingTheme = theme;
    clearTimeout(_switchTimer);
    _switchTimer = setTimeout(() => _applyTheme(_pendingTheme), 80);
}

function _applyTheme(theme) {
    const root = document.documentElement;
    _highlightActiveCard(theme);

    if (document.startViewTransition) {
        root.style.setProperty('--theme-transition-duration', '0.22s');
        const transition = document.startViewTransition(() => {
            root.setAttribute('data-theme', theme);
            localStorage.setItem(THEME_KEY, theme);
        });
        transition.finished.then(() => {
            root.style.removeProperty('--theme-transition-duration');
            _rechartIfNeeded();
        });
        return;
    }

    root.style.transition = 'opacity 0.12s ease';
    root.style.opacity = '0';

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            root.setAttribute('data-theme', theme);
            localStorage.setItem(THEME_KEY, theme);
            root.style.opacity = '1';

            root.addEventListener('transitionend', function cleanup(e) {
                if (e.propertyName !== 'opacity') return;
                root.style.transition = '';
                root.removeEventListener('transitionend', cleanup);
                _rechartIfNeeded();
            });
        });
    });
}

function _rechartIfNeeded() {
    if (typeof destroyAllCharts === 'function' && typeof renderCharts === 'function') {
        const analyticsPage = document.getElementById('analytics-page');
        if (analyticsPage && !analyticsPage.classList.contains('hidden')) {
            destroyAllCharts();
            renderCharts();
        }
    }
}

function _highlightActiveCard(theme) {
    document.querySelectorAll('.theme-card').forEach(el => {
        el.classList.toggle('active', el.dataset.value === theme);
    });
}

export function getSavedTheme() {
    return (
        localStorage.getItem(THEME_KEY) ||
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    );
}

/* ─────────────────────────────────────────────────────────────
   КОНФИГУРАЦИЯ ТЕМ
   preview: { bg, card, accent, text, bar }
   Цвета берём напрямую из theme.css каждой темы
───────────────────────────────────────────────────────────── */
const THEMES = [
    {
        value: 'light',
        emoji: '💡',
        name: 'Светлая',
        desc: 'Чистый классический интерфейс',
        badge: null,
        preview: {
            bg:     '#F5F7F9',
            card:   '#FFFFFF',
            accent: '#3B82F6',
            text:   '#1A1A1A',
            bar:    '#3B82F6',
            income: '#27AE60',
            expense:'#ff4b5c',
        }
    },
    {
        value: 'light-classic',
        emoji: '🟢',
        name: 'Светлая Classic',
        desc: 'Оригинальная зелёная светлая',
        badge: 'OLD',
        preview: {
            bg:     '#F5F7F9',
            card:   '#FFFFFF',
            accent: '#2ECC71',
            text:   '#1A1A1A',
            bar:    '#2ECC71',
            income: '#27AE60',
            expense:'#ff4b5c',
        }
    },
    {
        value: 'dark',
        emoji: '🌑',
        name: 'Тёмная',
        desc: 'Глубокий тёмный режим',
        badge: null,
        preview: {
            bg:     '#0F1419',
            card:   '#1E2A3A',
            accent: '#3B82F6',
            text:   '#dcddde',
            bar:    '#3B82F6',
            income: '#27AE60',
            expense:'#ff4b5c',
        }
    },
    {
        value: 'dark-classic',
        emoji: '🌿',
        name: 'Тёмная Classic',
        desc: 'Оригинальная зелёная тёмная',
        badge: 'OLD',
        preview: {
            bg:     '#111116',
            card:   '#292b2f',
            accent: '#2ECC71',
            text:   '#dcddde',
            bar:    '#2ECC71',
            income: '#27AE60',
            expense:'#ff4b5c',
        }
    },
    {
        value: 'onyx',
        emoji: '🔵',
        name: 'Onyx',
        desc: 'Дискордовый вайб',
        badge: null,
        preview: {
            bg:     '#050509',
            card:   '#181824',
            accent: '#5865f2',
            text:   '#ffffff',
            bar:    '#5865f2',
            income: '#2aace8',
            expense:'#ed4245',
        }
    },
    {
        value: 'burgundy',
        emoji: '🍷',
        name: 'Burgundy',
        desc: 'Глубокая винная премиум тема',
        badge: null,
        preview: {
            bg:     '#0f0a0d',
            card:   '#2a0f16',
            accent: '#730c1e',
            text:   '#f3e8eb',
            bar:    '#a3203a',
            income: '#a3203a',
            expense:'#ff4d6d',
        }
    },
    {
        value: 'mint',
        emoji: '🍃',
        name: 'Мята',
        desc: 'Спокойная мягкая тема',
        badge: null,
        preview: {
            bg:     '#0f1917',
            card:   '#113c34',
            accent: '#63e6be',
            text:   '#e9fff8',
            bar:    '#63e6be',
            income: '#63e6be',
            expense:'#ff6e7f',
        }
    },
    {
        value: 'shark',
        emoji: '🦈',
        name: 'Акулка',
        desc: 'Premium Akulka Edition v3',
        badge: 'PRO',
        preview: {
            bg:     '#0a0e14',
            card:   '#111827',
            accent: '#2ECC71',
            text:   '#e2e8f0',
            bar:    '#2ECC71',
            income: '#2ECC71',
            expense:'#ff4b5c',
        }
    },
    {
        value: 'dolphin',
        emoji: '🐬',
        name: 'Дельфинчик',
        desc: 'Лёгкий морской вайб',
        badge: null,
        preview: {
            bg:     '#e8f4fc',
            card:   '#ffffff',
            accent: '#0ea5e9',
            text:   '#0c4a6e',
            bar:    '#0ea5e9',
            income: '#22c55e',
            expense:'#ef4444',
        }
    },
    {
        value: 'monster',
        emoji: '🟢',
        name: 'Monster',
        desc: 'Тёмная с неоново-зелёным',
        badge: null,
        preview: {
            bg:     '#050609',
            card:   '#111a0f',
            accent: '#39ff14',
            text:   '#d4f5d0',
            bar:    '#39ff14',
            income: '#39ff14',
            expense:'#ff4b5c',
        }
    },
    {
        value: 'yogurt',
        emoji: '🍓',
        name: 'Йогурт',
        desc: 'Молочно-ягодные оттенки',
        badge: null,
        preview: {
            bg:     '#fdf4f5',
            card:   '#ffffff',
            accent: '#e879a0',
            text:   '#4a1530',
            bar:    '#e879a0',
            income: '#22c55e',
            expense:'#ef4444',
        }
    },
    {
        value: 'grape',
        emoji: '🍇',
        name: 'Грейп',
        desc: 'Виноградный минимализм',
        badge: null,
        preview: {
            bg:     '#1a0f2e',
            card:   '#2d1f4a',
            accent: '#a855f7',
            text:   '#e9d5ff',
            bar:    '#a855f7',
            income: '#4ade80',
            expense:'#f87171',
        }
    },
    {
        value: 'blackberry',
        emoji: '🫐',
        name: 'Ежевика',
        desc: 'Сочная тёмная ягода',
        badge: null,
        preview: {
            bg:     '#0f0a1e',
            card:   '#1e1433',
            accent: '#7c3aed',
            text:   '#ddd6fe',
            bar:    '#7c3aed',
            income: '#34d399',
            expense:'#fb7185',
        }
    },
    {
        value: 'hookah',
        emoji: '💨',
        name: 'Кальянчик',
        desc: 'Ночной бар / Smoke room',
        badge: null,
        preview: {
            bg:     '#0d3a3a',
            card:   '#123c42',
            accent: '#8e24aa',
            text:   '#f0f0f0',
            bar:    '#c084fc',
            income: '#00e676',
            expense:'#ff4d4d',
        }
    },
    {
        value: 'trackit',
        emoji: '🃏',
        name: 'TrackIt',
        desc: 'Карточный стиль счётчика',
        badge: null,
        preview: {
            bg:     '#1c1c24',
            card:   '#0C0C0E',
            accent: '#1E1E20',
            text:   '#a0ff00',
            bar:    '#e94560',
            income: '#a0ff00',
            expense:'#ff00ff',
        }
    },
    {
        value: 'sage',
        emoji: '🌿',
        name: 'Sage Green',
        desc: 'Природная органичная тема',
        badge: null,
        preview: {
            bg:     '#e8f0ea',
            card:   '#d4e2da',
            accent: '#7bbf97',
            text:   '#2e4237',
            bar:    '#7bbf97',
            income: '#9fd6b7',
            expense:'#e88f8f',
        }
    },
];

/* ─────────────────────────────────────────────────────────────
   РЕНДЕР ПРЕВЬЮ-МИНИАТЮРЫ
───────────────────────────────────────────────────────────── */
function renderPreview({ bg, card, accent, text, bar, income, expense }) {
    // Мини-UI: хедер + 2 транзакции + прогресс-бар
    return `
        <div class="tp-preview" style="background:${bg}">
            <div class="tp-header" style="background:${card}">
                <div class="tp-dot" style="background:${accent}"></div>
                <div class="tp-dot" style="background:${accent};opacity:.5"></div>
                <div class="tp-dot" style="background:${accent};opacity:.25"></div>
            </div>
            <div class="tp-body">
                <div class="tp-row">
                    <div class="tp-line" style="background:${text};opacity:.7;width:55%"></div>
                    <div class="tp-amount" style="color:${income}">+</div>
                </div>
                <div class="tp-row">
                    <div class="tp-line" style="background:${text};opacity:.5;width:40%"></div>
                    <div class="tp-amount" style="color:${expense}">−</div>
                </div>
                <div class="tp-bar-track" style="background:${text};opacity:.12">
                    <div class="tp-bar-fill" style="background:${bar};width:62%"></div>
                </div>
            </div>
        </div>
    `;
}

/* ─────────────────────────────────────────────────────────────
   ГЛАВНАЯ ФУНКЦИЯ ИНИЦИАЛИЗАЦИИ
───────────────────────────────────────────────────────────── */
export function initThemeSelector() {
    const currentTheme = getSavedTheme();

    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem(THEME_KEY, currentTheme);

    const container = document.getElementById('theme-options-container');
    if (!container) return;

    // Инжектим стили грида если ещё нет
    if (!document.getElementById('theme-grid-styles')) {
        const style = document.createElement('style');
        style.id = 'theme-grid-styles';
        style.textContent = `
            #theme-options-container {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 10px;
                padding: 4px 2px 16px;
            }

            .theme-card {
                position: relative;
                border-radius: 18px;
                overflow: hidden;
                cursor: pointer;
                border: 2px solid transparent;
                transition: border-color .18s ease, transform .14s ease, box-shadow .18s ease;
                background: var(--tertiary-color);
                box-shadow: var(--shadow-sm);
                -webkit-tap-highlight-color: transparent;
                user-select: none;
            }

            .theme-card:active {
                transform: scale(0.96);
            }

            .theme-card.active {
                border-color: var(--primary-color);
                box-shadow: 0 0 0 1px var(--primary-color), var(--shadow-md);
            }

            .theme-card.active .tc-check {
                opacity: 1;
                transform: scale(1);
            }

            /* Превью-миниатюра */
            .tp-preview {
                width: 100%;
                height: 80px;
                border-radius: 14px 14px 0 0;
                overflow: hidden;
                display: flex;
                flex-direction: column;
                gap: 4px;
                padding: 7px 8px 6px;
            }

            .tp-header {
                border-radius: 6px;
                height: 16px;
                display: flex;
                align-items: center;
                gap: 4px;
                padding: 0 6px;
            }

            .tp-dot {
                width: 5px;
                height: 5px;
                border-radius: 50%;
                flex-shrink: 0;
            }

            .tp-body {
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: 5px;
                padding-top: 4px;
            }

            .tp-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 6px;
            }

            .tp-line {
                height: 5px;
                border-radius: 3px;
            }

            .tp-amount {
                font-size: 10px;
                font-weight: 900;
                line-height: 1;
                flex-shrink: 0;
            }

            .tp-bar-track {
                height: 4px;
                border-radius: 2px;
                overflow: hidden;
                margin-top: 2px;
            }

            .tp-bar-fill {
                height: 100%;
                border-radius: 2px;
            }

            /* Инфо-блок */
            .tc-info {
                padding: 8px 5px 7px;
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 6px;
            }

            .tc-left {
                min-width: 0;
            }

            .tc-name {
                font-size: 0.82rem;
                font-weight: 800;
                color: var(--secondary-color);
                line-height: 1.2;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .tc-desc {
                font-size: 0.68rem;
                color: var(--secondary-color);
                opacity: 0.45;
                margin-top: 2px;
                line-height: 1.3;
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow: hidden;
            }

            .tc-right {
                display: flex;
                flex-direction: column;
                align-items: flex-end;
                gap: 4px;
                flex-shrink: 0;
            }

            /* Бейдж OLD / PRO */
            .tc-badge {
                font-size: 0.6rem;
                font-weight: 800;
                padding: 2px 6px;
                border-radius: 999px;
                letter-spacing: 0.05em;
                line-height: 1.4;
            }

            .tc-badge--old {
                background: rgba(241,196,15,.15);
                color: #F1C40F;
                border: 1px solid rgba(241,196,15,.3);
            }

            .tc-badge--pro {
                background: rgba(46,204,113,.15);
                color: var(--primary-color, #2ECC71);
                border: 1px solid rgba(46,204,113,.3);
            }

            /* Галочка активной темы */
            .tc-check {
                width: 20px;
                height: 20px;
                border-radius: 50%;
                background: var(--primary-color);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 11px;
                color: #fff;
                opacity: 0;
                transform: scale(0.6);
                transition: opacity .18s ease, transform .22s cubic-bezier(0.16,1,0.3,1);
                flex-shrink: 0;
            }

            /* Эмодзи темы */
            .tc-emoji {
                font-size: 18px;
                line-height: 1;
            }
        `;
        document.head.appendChild(style);
    }

    const fragment = document.createDocumentFragment();

    THEMES.forEach(theme => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'theme-card';
        card.dataset.value = theme.value;
        if (theme.value === currentTheme) card.classList.add('active');

        let badgeHtml = '';
        if (theme.badge === 'OLD') {
            badgeHtml = `<span class="tc-badge tc-badge--old">OLD</span>`;
        } else if (theme.badge === 'PRO') {
            badgeHtml = `<span class="tc-badge tc-badge--pro">✦ PRO</span>`;
        }

        card.innerHTML = `
            ${renderPreview(theme.preview)}
            <div class="tc-info">
                <div class="tc-left">
                    <div class="tc-name">${theme.emoji} ${theme.name}</div>
                    <div class="tc-desc">${theme.desc}</div>
                </div>
                <div class="tc-right">
                    ${badgeHtml}
                    <div class="tc-check" aria-hidden="true">🦈</div>
                </div>
            </div>
        `;

        card.addEventListener('click', () => setTheme(theme.value));
        fragment.appendChild(card);
    });

    container.innerHTML = '';
    container.appendChild(fragment);
}