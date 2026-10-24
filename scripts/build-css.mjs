// Сборка стилей: css/*.css → app.css (один файл для страницы).
// Порядок файлов = порядок каскада, он задан в ORDER ниже (сначала база, затем темы, затем «стекло» и страницы).
// Запуск: node scripts/build-css.mjs  (или npm run build:css). Флаг --check только проверяет, что app.css свежий.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const ORDER = [
    '00-base.css',              // сброс, разметка, компоненты (бывший style.css)
    '10-themes.css',            // палитры тем
    '11-theme-fixes.css',       // точечные правки тем
    '20-glass.css',             // «Глубокое стекло»: шрифты, токены, главный дизайн и Акулка
    '30-statement-import.css',  // «Залётом»: импорт выписок
    '31-analytics-insights.css',
    '32-search.css',
    '33-data-tools.css',        // экспорт, импорт, бэкапы
    '34-planner.css',
    '35-achievements.css',
    '36-month-recap.css',     // «Каким был твой прошлый месяц»: сторис и карточка-вход
    '37-sw-update.css'        // карточка «Доступна новая версия»
];

// Убираем комментарии и пустые строки; строки и url(...) не трогаем
export function minimal(css) {
    let out = '', i = 0, quote = '';
    while (i < css.length) {
        const c = css[i];
        if (quote) {
            out += c;
            if (c === '\\') { out += css[i + 1] ?? ''; i += 2; continue; }
            if (c === quote) quote = '';
            i++; continue;
        }
        if (c === '"' || c === "'") { quote = c; out += c; i++; continue; }
        if (c === '/' && css[i + 1] === '*') {
            const end = css.indexOf('*/', i + 2);
            i = end === -1 ? css.length : end + 2;
            continue;
        }
        out += c; i++;
    }
    return out.split('\n').map(l => l.replace(/\s+$/, '')).filter(l => l.trim() !== '').join('\n') + '\n';
}

export function build() {
    const parts = ORDER.map(f => {
        const p = join(root, 'css', f);
        if (!existsSync(p)) throw new Error(`Нет файла css/${f}`);
        return `/* ── ${f} ── */\n${minimal(readFileSync(p, 'utf8'))}`;
    });
    return `/* BudgetIt: собрано из css/*.css (node scripts/build-css.mjs). Не править вручную. */\n${parts.join('')}`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const out = join(root, 'app.css');
    const css = build();
    if (process.argv.includes('--check')) {
        const cur = existsSync(out) ? readFileSync(out, 'utf8') : '';
        if (cur !== css) { console.error('app.css устарел: запусти npm run build:css'); process.exit(1); }
        console.log('app.css актуален');
    } else {
        writeFileSync(out, css);
        console.log(`app.css: ${(css.length / 1024).toFixed(0)} КБ из ${ORDER.length} файлов`);
    }
}
