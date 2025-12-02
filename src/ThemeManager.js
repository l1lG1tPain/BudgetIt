// === ThemeManager.js — карточки тем в стиле профиля ===
const THEME_KEY = 'appTheme';

export function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);

    if (typeof destroyAllCharts === 'function' && typeof renderCharts === 'function') {
        destroyAllCharts();
        renderCharts();
    }

    // Подсветка активной карточки
    const all = document.querySelectorAll('.theme-option');
    all.forEach(el => el.classList.remove('active'));

    const selected = document.querySelector(`.theme-option[data-value="${theme}"]`);
    if (selected) selected.classList.add('active');
}

export function getSavedTheme() {
    return (
        localStorage.getItem(THEME_KEY) ||
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    );
}

export function initThemeSelector() {
    const currentTheme = getSavedTheme();
    setTheme(currentTheme);

    const container = document.getElementById('theme-options-container');
    if (!container) return;

    const themes = [
        { value: 'light',      emoji: '💡', name: 'Светлая',          desc: 'Классический светлый интерфейс' },
        { value: 'dark',       emoji: '🌑', name: 'Тёмная',           desc: 'Глубокий тёмный режим' },
        { value: 'onyx',       emoji: '🟣', name: 'Onyx',             desc: 'Дискордовый вайб' },
        { value: 'mint',    emoji: '🍃', name: 'Мята',          desc: 'Спокойная мягкая тема в мятных оттенках' },
        { value: 'shark',      emoji: '🦈', name: 'Акулка',           desc: 'Premium Akulka Edition v3 <br> Неоновая фирменная тема v3' },
        { value: 'dolphin',    emoji: '🐬', name: 'Дельфинчик',       desc: 'Лёгкий морской вайб' },
        { value: 'monster',       emoji: '🟢', name: 'Monster',        desc: 'Тёмная агрессивная тема с неоново-зелёным свечением в стиле Monster Energy' },
        { value: 'yogurt',   emoji: '🍓', name: 'Йогурт',       desc: 'Светлая десертная тема в молочно-ягодных оттенках' },
        { value: 'grape',      emoji: '🍇', name: 'Грейп',            desc: 'Виноградный минимализм' },
        { value: 'blackberry', emoji: '🫐', name: 'Ежевика',         desc: 'Сочная тёмная ягода' },
        { value: 'hookah',     emoji: '💨', name: 'Кальянчик',       desc: 'Ночной бар / Smoke room' },
        { value: 'trackit',    emoji: '🃏', name: 'TrackIt',          desc: 'Карточный стиль счётчика' },
        { value: 'sage',    emoji: '🌿', name: 'Sage Green',          desc: 'Природная зелёная тема в оттенках шалфея, тумана и спокойного органического минимализма' },
    ];

    container.innerHTML = '';

    themes.forEach(theme => {
        const div = document.createElement('button');
        div.type = 'button';
        div.className = 'theme-option';
        div.dataset.value = theme.value;

        div.innerHTML = `
      <span class="theme-emoji">${theme.emoji}</span>
      <span class="theme-info">
        <span class="theme-name">${theme.name}</span>
        <span class="theme-desc">${theme.desc || ''}</span>
      </span>
    `;

        if (theme.value === currentTheme) {
            div.classList.add('active');
        }

        div.addEventListener('click', () => setTheme(theme.value));
        container.appendChild(div);
    });
}
