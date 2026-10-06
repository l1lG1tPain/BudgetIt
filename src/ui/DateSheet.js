// Шторка выбора даты: быстрые чипы + календарь месяца (Пн — первый день).
// Отдаёт дату в формате YYYY-MM-DD через onPick; никаких ограничений на будущие даты.
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

export const toISO = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function parseISO(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return Number.isNaN(d.getTime()) ? null : d;
}

// «Сегодня, 6 октября» / «Вчера, 5 октября» / «3 октября 2026»
export function formatDateLabel(iso, now = new Date()) {
    const d = parseISO(iso);
    if (!d) return 'Выберите дату';
    const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diff = Math.round((t0 - d) / 86400000);
    const base = `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
    if (diff === 0) return `Сегодня, ${base}`;
    if (diff === 1) return `Вчера, ${base}`;
    return d.getFullYear() === t0.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

// Ячейки месяца: пустые до первого дня (Пн=0) и дни 1..N
export function buildMonthCells(year, month) {
    const first = new Date(year, month, 1);
    const lead = (first.getDay() + 6) % 7;
    const days = new Date(year, month + 1, 0).getDate();
    const cells = Array(lead).fill(null);
    for (let i = 1; i <= days; i++) cells.push(i);
    return cells;
}

let sheetEl = null;

function ensureSheet() {
    if (sheetEl && document.body.contains(sheetEl)) return sheetEl;
    sheetEl = document.createElement('div');
    sheetEl.id = 'date-sheet';
    sheetEl.className = 'bottom-sheet date-sheet hidden';
    document.body.appendChild(sheetEl);
    return sheetEl;
}

export function openDateSheet({ value, onPick }) {
    const sheet = ensureSheet();
    const backdrop = document.getElementById('bottom-sheet-backdrop');
    const today = new Date();
    const selected = parseISO(value) || today;
    let viewY = selected.getFullYear();
    let viewM = selected.getMonth();

    const close = () => {
        sheet.classList.add('hidden');
        const anyOpen = document.querySelector('.bottom-sheet:not(.hidden):not(#date-sheet)');
        if (!anyOpen && backdrop) backdrop.classList.add('hidden');
    };
    const pick = d => { onPick?.(toISO(d)); close(); };

    const render = () => {
        const cells = buildMonthCells(viewY, viewM);
        const sel = parseISO(value);
        const todayISO = toISO(today);
        const quick = [['Сегодня', 0], ['Вчера', 1], ['Позавчера', 2]].map(([label, back]) => {
            const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - back);
            const active = value === toISO(d);
            return `<button type="button" class="ds-quick${active ? ' active' : ''}" data-iso="${toISO(d)}">${label}</button>`;
        }).join('');
        const days = cells.map(c => {
            if (c === null) return '<span class="ds-empty"></span>';
            const iso = toISO(new Date(viewY, viewM, c));
            const cls = ['ds-day', iso === value ? 'active' : '', iso === todayISO ? 'today' : ''].join(' ').trim();
            return `<button type="button" class="${cls}" data-iso="${iso}">${c}</button>`;
        }).join('');
        sheet.innerHTML = `
            <div class="ds-head">
                <button type="button" class="ds-back" aria-label="Назад">‹</button>
                <span class="ds-title">Дата операции</span>
            </div>
            <div class="ds-quick-row">${quick}</div>
            <div class="ds-month-row">
                <button type="button" class="ds-nav" data-dir="-1" aria-label="Предыдущий месяц">‹</button>
                <span class="ds-month">${MONTHS[viewM]} ${viewY}</span>
                <button type="button" class="ds-nav" data-dir="1" aria-label="Следующий месяц">›</button>
            </div>
            <div class="ds-week"><span>Пн</span><span>Вт</span><span>Ср</span><span>Чт</span><span>Пт</span><span>Сб</span><span>Вс</span></div>
            <div class="ds-grid">${days}</div>`;
        void sel;
    };

    sheet.onclick = e => {
        const t = e.target.closest('button');
        if (!t) return;
        if (t.classList.contains('ds-back')) return close();
        if (t.classList.contains('ds-nav')) {
            viewM += +t.dataset.dir;
            if (viewM < 0) { viewM = 11; viewY--; }
            if (viewM > 11) { viewM = 0; viewY++; }
            return render();
        }
        const d = parseISO(t.dataset.iso);
        if (d) pick(d);
    };

    render();
    if (backdrop) backdrop.classList.remove('hidden');
    sheet.style.zIndex = '1300';
    sheet.classList.remove('hidden');
}
