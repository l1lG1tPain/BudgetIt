// === Новый ThemeManager.js ===
const THEME_KEY = 'appTheme';

export function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);

  if (typeof destroyAllCharts === 'function' && typeof renderCharts === 'function') {
    destroyAllCharts();
    renderCharts();
  }

  // Обновим активный стиль
  const all = document.querySelectorAll('.theme-option');
  all.forEach(el => el.classList.remove('active'));

  const selected = document.querySelector(`.theme-option[data-value="${theme}"]`);
  if (selected) selected.classList.add('active');
}

export function getSavedTheme() {
  return localStorage.getItem(THEME_KEY) || 
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

export function initThemeSelector() {
  const currentTheme = getSavedTheme();
  setTheme(currentTheme);

  const container = document.getElementById('theme-options-container');
  if (!container) return;

  const themes = [
    { value: 'light', label: '💡 Светлая' },
    { value: 'dark', label: '🌑 Тёмная' },
    { value: 'onyx', label: '🟣 Onyx' },
    { value: 'ramilka', label: '🌺 Ramilka' },
    { value: 'shark', label: '🦈 Акулка' },
    { value: 'dolphin', label: '🐬 Дельфинчик' },
    { value: 'cola', label: '🥤 Кока Коля' },
    { value: 'amethyst', label: '🧝‍♀️ Аметист' },
    { value: 'grape', label: '🍇 Грейп' },
    { value: 'blackberry', label: '🫐 Ежевика' },
    { value: 'hookah', label: '💨 Кальянчик' },
  ];

  container.innerHTML = '';

  themes.forEach(theme => {
    const div = document.createElement('div');
    div.className = 'theme-option';
    div.textContent = theme.label;
    div.dataset.value = theme.value;
    if (theme.value === currentTheme) div.classList.add('active');
    div.addEventListener('click', () => setTheme(theme.value));
    container.appendChild(div);
  });
}
