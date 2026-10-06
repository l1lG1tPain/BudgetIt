// src/theme/themeTokens.js — токены редизайна «Глубокое стекло» (v5.0)
// Источник: design_handoff_budgetit_redesign/README.md → «Design Tokens» + функция vars() из прототипа.
// Старые переменные (--primary-color, --income-color, …) этим модулем НЕ меняются: новые токены живут рядом.

/** [value, bg, card, accent, text, income, expense, isLight] — как в прототипе (акценты тёмных тем заменены на читаемые). */
export const THEME_SOURCE = {
    'light':         ['#F5F7F9', '#FFFFFF', '#3B82F6', '#1A1A1A', '#27AE60', '#ff4b5c', true],
    'light-classic': ['#F5F7F9', '#FFFFFF', '#1f9d55', '#1A1A1A', '#27AE60', '#ff4b5c', true],
    'dark':          ['#0F1419', '#1E2A3A', '#5b9bff', '#dcddde', '#27AE60', '#ff4b5c', false],
    'dark-classic':  ['#111116', '#292b2f', '#2ECC71', '#dcddde', '#27AE60', '#ff4b5c', false],
    'onyx':          ['#050509', '#181824', '#7983f5', '#ffffff', '#2aace8', '#ed4245', false],
    'burgundy':      ['#0f0a0d', '#2a0f16', '#e0435f', '#f3e8eb', '#7fd6a8', '#ff4d6d', false],
    'mint':          ['#0f1917', '#113c34', '#63e6be', '#e9fff8', '#63e6be', '#ff6e7f', false],
    'shark':         ['#070b10', '#16202b', '#3dffa0', '#eaf0f6', '#3ddc97', '#ff6b7d', false],
    'dolphin':       ['#e8f4fc', '#ffffff', '#0e8fd6', '#0c4a6e', '#16a34a', '#ef4444', true],
    'monster':       ['#050609', '#111a0f', '#39ff14', '#d4f5d0', '#39ff14', '#ff4b5c', false],
    'yogurt':        ['#fdf4f5', '#ffffff', '#d6568a', '#4a1530', '#16a34a', '#e11d48', true],
    'grape':         ['#1a0f2e', '#2d1f4a', '#b77cf9', '#e9d5ff', '#4ade80', '#f87171', false],
    'blackberry':    ['#0f0a1e', '#1e1433', '#8b5cf6', '#ddd6fe', '#34d399', '#fb7185', false],
    'hookah':        ['#0d3a3a', '#123c42', '#c084fc', '#f0f0f0', '#00e676', '#ff4d4d', false],
    'trackit':       ['#1c1c24', '#0C0C0E', '#a0ff00', '#f0f0f0', '#a0ff00', '#ff00ff', false],
    'sage':          ['#e8f0ea', '#d4e2da', '#4f9a6f', '#2e4237', '#3f9a66', '#d66b6b', true]
};

/** «Акулка» — эталонная тема, значения зафиксированы в хэндоффе дословно. */
const SHARK = {
    canvas: '#04070a', bg: '#070b10',
    orb1: 'rgba(38,110,130,.55)', orb2: 'rgba(120,28,58,.45)', orb3: 'rgba(61,255,160,.12)',
    glass: 'rgba(255,255,255,.05)', glass2: 'rgba(255,255,255,.09)', stroke: 'rgba(255,255,255,.09)', hi: 'rgba(255,255,255,.08)',
    sticky: 'rgba(7,11,16,.62)', text: '#eaf0f6', muted: '#8d99a8', faint: 'rgba(255,255,255,.07)',
    accent: '#3dffa0', ink: '#03140b', in: '#3ddc97', out: '#ff6b7d', save: '#a593ff', debt: '#ffb366', chip: 'rgba(255,255,255,.1)'
};

/** Ручная настройка из макета (README → «Темы»): для этих тем значения берутся дословно, остальные 10 считаются по правилу ниже. */
const HAND_TUNED = {
    onyx: { canvas: '#030306', bg: '#06060b', orb1: 'rgba(88,101,242,.5)', orb2: 'rgba(42,172,232,.25)', orb3: 'rgba(139,149,255,.16)', glass: 'rgba(255,255,255,.05)', glass2: 'rgba(255,255,255,.09)', stroke: 'rgba(255,255,255,.09)', hi: 'rgba(255,255,255,.08)', sticky: 'rgba(6,6,11,.62)', text: '#eef0ff', muted: '#9097b3', faint: 'rgba(255,255,255,.07)', accent: '#8b95ff', ink: '#0a0c2a', in: '#4cc3f0', out: '#ff6266', save: '#c18bff', debt: '#ffb366', chip: 'rgba(255,255,255,.1)' },
    burgundy: { canvas: '#080405', bg: '#0f080a', orb1: 'rgba(150,22,52,.55)', orb2: 'rgba(200,120,70,.25)', orb3: 'rgba(255,143,166,.14)', glass: 'rgba(255,255,255,.05)', glass2: 'rgba(255,255,255,.09)', stroke: 'rgba(255,255,255,.09)', hi: 'rgba(255,255,255,.08)', sticky: 'rgba(15,8,10,.62)', text: '#f6eaed', muted: '#a8929a', faint: 'rgba(255,255,255,.07)', accent: '#ff8fa6', ink: '#2a0610', in: '#7fd6a8', out: '#ff5c7a', save: '#d0a3ff', debt: '#f3b07a', chip: 'rgba(255,255,255,.1)' },
    mint: { canvas: '#040a08', bg: '#07120f', orb1: 'rgba(30,140,110,.55)', orb2: 'rgba(40,90,140,.35)', orb3: 'rgba(99,230,190,.14)', glass: 'rgba(255,255,255,.05)', glass2: 'rgba(255,255,255,.09)', stroke: 'rgba(255,255,255,.09)', hi: 'rgba(255,255,255,.08)', sticky: 'rgba(7,18,15,.62)', text: '#e9fff8', muted: '#8aa79e', faint: 'rgba(255,255,255,.07)', accent: '#63e6be', ink: '#04221a', in: '#63e6be', out: '#ff6e7f', save: '#9fb4ff', debt: '#ffc27a', chip: 'rgba(255,255,255,.1)' },
    light: { canvas: '#dfe5ea', bg: '#eef2f6', orb1: 'rgba(120,190,255,.55)', orb2: 'rgba(255,170,200,.45)', orb3: 'rgba(80,220,160,.3)', glass: 'rgba(255,255,255,.55)', glass2: 'rgba(255,255,255,.75)', stroke: 'rgba(255,255,255,.85)', hi: 'rgba(255,255,255,.9)', sticky: 'rgba(238,242,246,.72)', text: '#0c1622', muted: '#5b6878', faint: 'rgba(12,22,34,.06)', accent: '#0a9a62', ink: '#ffffff', in: '#0a9a62', out: '#e0384f', save: '#6a55e0', debt: '#d9822b', chip: 'rgba(12,22,34,.08)' },
    dolphin: { canvas: '#d3e6f2', bg: '#e6f2fa', orb1: 'rgba(14,165,233,.4)', orb2: 'rgba(120,220,255,.5)', orb3: 'rgba(34,197,94,.2)', glass: 'rgba(255,255,255,.55)', glass2: 'rgba(255,255,255,.75)', stroke: 'rgba(255,255,255,.85)', hi: 'rgba(255,255,255,.9)', sticky: 'rgba(230,242,250,.72)', text: '#0c3550', muted: '#4f7690', faint: 'rgba(12,53,80,.06)', accent: '#0e8fd6', ink: '#ffffff', in: '#16a34a', out: '#e0384f', save: '#6a55e0', debt: '#d9822b', chip: 'rgba(12,53,80,.08)' }
};

const h2r = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => {
    const B = h2r(b);
    return '#' + h2r(a).map((x, i) => Math.round(x + (B[i] - x) * t).toString(16).padStart(2, '0')).join('');
};
const rgba = (h, a) => `rgba(${h2r(h).join(',')},${a})`;
const lum = h => { const [r, g, b] = h2r(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };

/** Возвращает { имя-токена: значение } для темы (без префикса `--`). Неизвестная тема → «Акулка». */
export function getThemeTokens(theme) {
    if (theme === 'shark') return { ...SHARK };
    if (HAND_TUNED[theme]) return { ...HAND_TUNED[theme] };
    const src = THEME_SOURCE[theme];
    if (!src) return { ...SHARK };
    const [bg, card, ac, tx, inc, exp, light] = src;

    if (light) {
        return {
            canvas: mix(bg, '#000000', .06), bg,
            orb1: rgba(ac, .32), orb2: rgba(exp, .22), orb3: rgba(inc, .22),
            glass: 'rgba(255,255,255,.55)', glass2: 'rgba(255,255,255,.78)', stroke: 'rgba(255,255,255,.9)', hi: 'rgba(255,255,255,.9)',
            sticky: rgba(bg, .76), text: tx, muted: mix(tx, bg, .42), faint: rgba(tx, .06),
            accent: ac, ink: lum(ac) > .6 ? mix(ac, '#000000', .85) : '#ffffff',
            in: inc, out: exp, save: '#6a55e0', debt: '#d9822b', chip: rgba(tx, .08)
        };
    }
    return {
        canvas: mix(bg, '#000000', .45), bg,
        orb1: rgba(ac, .38), orb2: rgba(mix(card, exp, .35), .55), orb3: rgba(inc, .14),
        glass: 'rgba(255,255,255,.05)', glass2: 'rgba(255,255,255,.09)', stroke: 'rgba(255,255,255,.09)', hi: 'rgba(255,255,255,.08)',
        sticky: rgba(bg, .64), text: tx, muted: mix(tx, bg, .42), faint: 'rgba(255,255,255,.07)',
        accent: ac, ink: lum(ac) > .55 ? mix(ac, '#000000', .88) : '#ffffff',
        in: inc, out: exp, save: '#a593ff', debt: '#ffb366', chip: 'rgba(255,255,255,.1)'
    };
}

/** Выставляет токены на <html> как CSS-переменные (--accent, --glass, …). */
export function applyThemeTokens(theme, root = document.documentElement) {
    const tokens = getThemeTokens(theme);
    Object.entries(tokens).forEach(([name, value]) => root.style.setProperty(`--${name}`, value));
    // Алиасы старых переменных на новые токены (README → «Существующие переменные»): старые компоненты подхватывают палитру темы
    const alias = { 'primary-color': tokens.accent, 'income-color': tokens.in, 'expense-color': tokens.out, 'deposit-color': tokens.save,
        'debt-color': tokens.debt, 'secondary-color': tokens.text, 'text-muted': tokens.muted, 'main-ground': tokens.bg };
    Object.entries(alias).forEach(([name, value]) => root.style.setProperty(`--${name}`, value));
    return tokens;
}
