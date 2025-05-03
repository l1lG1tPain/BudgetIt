// === ThemeManager.js ===
const THEME_KEY = 'appTheme';

export function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);

  const customBtn = document.querySelector('#theme-custom-select .custom-select-button');
  const selectedOption = document.querySelector(`#theme-custom-select [data-value="${theme}"]`);
  if (customBtn && selectedOption) {
    customBtn.textContent = selectedOption.textContent + ' \u25BC';
  }

  const nativeSelect = document.getElementById('theme-selector');
  if (nativeSelect) {
    nativeSelect.value = theme;
  }

  if (typeof destroyAllCharts === 'function' && typeof renderCharts === 'function') {
    destroyAllCharts();
    renderCharts();
  }
}

export function getSavedTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved) return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function initThemeSelector() {
    const currentTheme = getSavedTheme();
    setTheme(currentTheme);
  
    const select = document.getElementById('theme-selector');
    if (select) {
      select.value = currentTheme;
      select.addEventListener('change', () => setTheme(select.value));
    }
  
    const custom = document.getElementById('theme-custom-select');
    if (!custom) return;
  
    const button = custom.querySelector('.custom-select-button');
    const options = custom.querySelector('.custom-select-options');
  
    if (!button || !options) return;
  
    const selected = options.querySelector(`[data-value="${currentTheme}"]`);
    if (selected) {
      button.textContent = selected.textContent + ' \u25BC';
    }
  
    button.addEventListener('click', () => {
      options.classList.toggle('hidden');
    });
  
    options.querySelectorAll('div[data-value]').forEach(option => {
      option.addEventListener('click', () => {
        const theme = option.dataset.value;
        setTheme(theme);
        options.classList.add('hidden');
      });
    });
  
    // Добавляем обработчик кликов на document для скрытия дропдауна
    document.addEventListener('click', (e) => {
      if (!custom.contains(e.target)) {
        options.classList.add('hidden');
      }
    });
  }
