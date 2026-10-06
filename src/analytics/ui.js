// ===============================
//   ui.js — DOM-части аналитики: шторка «Период», шторка категории, списки и таблицы
//   Чистые расчёты — в stats.js / period.js. Здесь только отрисовка.
// ===============================
import {
    MONTHS_FULL, MONTHS_SHORT, makePeriod, presetOf, fromPreset, periodLabel, ymKey, keyYear, keyMonth, monthPeriod, allTime, yearPeriod
} from './period.js';
import { WEEKDAYS_SHORT } from './stats.js';

let D = {
    fmt: n => String(Math.round(n)),
    compact: n => String(Math.round(n)),
    cur: () => 'сум',
    colors: () => ['#7c6cff', '#3ee08f', '#ffb347', '#ff5d73', '#3ee08f']
};
export function setUiDeps(d) { D = { ...D, ...d }; }

export const esc = x => String(x ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** «🏠 Жильё» → { emoji: '🏠', text: 'Жильё' } */
export function splitEmoji(name) {
    const m = String(name || '').match(/^((?:\p{Extended_Pictographic}|\p{Emoji_Component})+)\s*(.*)$/u);
    return m && m[2] ? { emoji: m[1], text: m[2] } : { emoji: '', text: String(name || '') };
}
const dmy = d => d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(2, 4)}` : '';
const pct = x => `${Math.round(x * 100)}%`;
const deltaHtml = (delta, partial, goodWhenDown = true) => {
    if (delta == null) return '';
    const up = delta > 0;
    const good = goodWhenDown ? !up : up;
    return `<span class="an-delta ${Math.abs(delta) < 0.005 ? '' : good ? 'good' : 'bad'}">${up ? '▲' : '▼'} ${Math.abs(Math.round(delta * 100))}%</span>` +
        `<span class="an-delta-note">${partial ? 'к тому же числу прошлого периода' : 'к прошлому периоду'}</span>`;
};

// ---------- общие шторки ----------
function ensureSheet(id, cls = '') {
    let el = document.getElementById(id);
    if (!el) {
        el = document.createElement('div');
        el.id = id; el.className = `bottom-sheet an-sheet hidden ${cls}`;
        document.body.appendChild(el);
    }
    return el;
}
function openSheet(el) {
    document.getElementById('bottom-sheet-backdrop')?.classList.remove('hidden');
    el.classList.remove('hidden');
    el.scrollTop = 0;
}
export function closeSheet(el) {
    el.classList.add('hidden');
    const open = document.querySelector('.bottom-sheet:not(.hidden):not(#settings-page):not(#analytics-page):not(#accounts-page):not(#planner-page)');
    if (!open) document.getElementById('bottom-sheet-backdrop')?.classList.add('hidden');
}

// ======================================================
//   Шторка «Период»
// ======================================================
/**
 * opts: { period, years:number[], hasData:Set<'YYYY-MM'>, todayKey, anchor, onApply(period) }
 */
export function openPeriodSheet(opts) {
    const el = ensureSheet('an-period-sheet');
    const years = opts.years.length ? opts.years : [new Date().getFullYear()];
    let sel = new Set(opts.period.all ? [] : opts.period.keys);
    let all = !!opts.period.all;
    let view = opts.period.all ? (years.includes(keyYear(opts.todayKey)) ? keyYear(opts.todayKey) : years[years.length - 1])
        : keyYear(opts.period.keys[opts.period.keys.length - 1]);

    const current = () => all ? allTime() : makePeriod({ keys: [...sel] });
    const apply = pr => { all = pr.all; sel = new Set(pr.keys); if (!pr.all) view = keyYear(pr.keys[pr.keys.length - 1]); draw(); };

    function draw() {
        const cur = current();
        const pre = presetOf(cur);
        const minY = years[0], maxY = years[years.length - 1];
        el.innerHTML = `
          <div class="sheet-title-row"><h2 class="sheet-title">Период</h2><button type="button" class="sheet-x" data-act="close" aria-label="Закрыть">✕</button></div>
          <div class="ps-presets">
            ${[['month', 'Месяц'], ['3m', '3 мес'], ['year', 'Год'], ['all', 'Всё']].map(([k, l]) =>
                `<button type="button" class="ps-chip ${pre === k ? 'on' : ''}" data-preset="${k}">${l}</button>`).join('')}
          </div>
          <div class="ps-year">
            <button type="button" data-act="prev" ${view <= minY ? 'disabled' : ''} aria-label="Предыдущий год">‹</button>
            <b>${view}</b>
            <button type="button" data-act="next" ${view >= maxY ? 'disabled' : ''} aria-label="Следующий год">›</button>
            <button type="button" class="ps-link" data-act="whole-year">Весь ${view} год</button>
          </div>
          <div class="ps-months">
            ${MONTHS_SHORT.map((m, i) => {
                const key = ymKey(view, i + 1);
                const on = !all && sel.has(key);
                const has = opts.hasData.has(key);
                const future = key > opts.todayKey;
                return `<button type="button" class="ps-m ${on ? 'on' : ''} ${has ? '' : 'empty'} ${future ? 'future' : ''}" data-m="${key}">${m}<i>${has ? '' : '·'}</i></button>`;
            }).join('')}
          </div>
          <div class="ps-foot">
            <div class="ps-sum"><small>Выбрано</small><b>${esc(periodLabel(cur))}</b></div>
            <button type="button" class="ps-apply" data-act="apply">Показать</button>
          </div>
          <div class="ps-hint">Нажимайте на месяцы — можно выбрать несколько, в том числе из разных лет.</div>`;
    }

    el.onclick = e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.preset) {
            const k = b.dataset.preset;
            if (k === 'all') { apply(allTime()); return; }
            const last = [...sel].sort().pop() || (opts.anchor || opts.todayKey);
            apply(fromPreset(k, all ? opts.anchor : last)); return;
        }
        if (b.dataset.m) {
            if (all) { all = false; sel = new Set(); }
            if (sel.has(b.dataset.m)) sel.delete(b.dataset.m); else sel.add(b.dataset.m);
            if (!sel.size) { all = true; }
            draw(); return;
        }
        const act = b.dataset.act;
        if (act === 'close') closeSheet(el);
        else if (act === 'prev') { view--; draw(); }
        else if (act === 'next') { view++; draw(); }
        else if (act === 'whole-year') apply(yearPeriod(view));
        else if (act === 'apply') { const pr = current(); closeSheet(el); opts.onApply(pr); }
    };
    draw();
    openSheet(el);
}

// ======================================================
//   Шторка категории (подробная статистика)
// ======================================================
export function openCategorySheet(d, { type = 'expense', color, periodText = '', selected = null } = {}) {
    const el = ensureSheet('an-cat-sheet');
    const { emoji, text } = splitEmoji(d.name);
    const isInc = type === 'income';
    const word = isInc ? 'поступлений' : 'трат';
    const f = n => D.fmt(Math.round(n));
    const maxTrend = Math.max(...d.trend.map(x => x.value), 1);
    const maxWd = Math.max(...d.weekday, 1);
    const wdTop = d.weekday.indexOf(Math.max(...d.weekday));
    const maxItem = Math.max(...d.items.map(i => i.sum), 1);
    const nowKey = d.trend[d.trend.length - 1]?.key;
    const isSel = k => selected && !selected.all && selected.set ? selected.set.has(k) : k === nowKey;

    el.style.setProperty('--cat', color || 'var(--accent)');
    el.innerHTML = `
      <div class="cs-head">
        <div class="cs-emoji">${emoji || '📁'}</div>
        <div class="cs-title"><b>${esc(text || d.name)}</b><small>${esc(periodText)}</small></div>
        <button type="button" class="sheet-x" data-act="close" aria-label="Закрыть">✕</button>
      </div>
      ${d.financial ? `<div class="cs-note">ℹ️ Это перевод/вклад — в «бытовых» трат и инсайтах не учитывается, но в общих суммах есть.</div>` : ''}
      <div class="cs-total"><span class="cs-val">${f(d.total)}</span><span class="cs-cur">${esc(D.cur())}</span></div>
      <div class="cs-badges">
        <span class="cs-badge">${pct(d.share)} всех ${word}</span>
        ${d.cmp && d.cmp.delta != null ? deltaHtml(d.cmp.delta, d.cmp.partial, !isInc) : ''}
      </div>
      <div class="cs-kpis">
        <div><small>Операций</small><b>${d.count}</b></div>
        <div><small>Средняя</small><b>${D.compact(Math.round(d.avg))}</b></div>
        <div><small>Типичная</small><b>${D.compact(Math.round(d.median))}</b></div>
        <div><small>В месяц</small><b>${D.compact(Math.round(d.perMonth))}</b></div>
      </div>
      ${d.biggest ? `<div class="cs-big"><span>Самая крупная</span><b>${f(d.biggest.amount)} ${esc(D.cur())}</b><em>${esc(d.biggest.name)} · ${dmy(d.biggest.date)}</em></div>` : ''}

      <div class="cs-sec"><h5>Динамика по месяцам</h5>
        <div class="cs-bars">${d.trend.map(x => `
          <div class="cs-bar ${isSel(x.key) ? 'cur' : ''}" title="${esc(MONTHS_FULL[keyMonth(x.key) - 1])}: ${f(x.value)}">
            <i style="height:${Math.max(x.value > 0 ? 6 : 2, x.value / maxTrend * 70)}px"></i><span>${MONTHS_SHORT[keyMonth(x.key) - 1]}</span>
          </div>`).join('')}</div>
      </div>

      <div class="cs-sec"><h5>Когда ${isInc ? 'приходит' : 'тратите'}${d.total > 0 ? ` · больше всего ${['в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу', 'в субботу', 'в воскресенье'][wdTop]}` : ''}</h5>
        <div class="cs-bars wd">${d.weekday.map((v, i) => `
          <div class="cs-bar ${i === wdTop && v > 0 ? 'cur' : ''}" title="${f(v)}">
            <i style="height:${Math.max(v > 0 ? 6 : 2, v / maxWd * 56)}px"></i><span>${WEEKDAYS_SHORT[i]}</span>
          </div>`).join('')}</div>
      </div>

      ${d.items.length ? `<div class="cs-sec"><h5>Из чего состоит</h5>
        ${d.items.map(i => `<div class="cs-row"><div class="cs-row-h"><span>${esc(i.name)}</span><b>${f(i.sum)}</b></div><div class="cs-track"><i style="width:${Math.max(3, i.sum / maxItem * 100)}%"></i></div></div>`).join('')}
      </div>` : ''}

      ${d.recent.length ? `<div class="cs-sec"><h5>Последние операции</h5>
        ${d.recent.map(r => `<div class="cs-op"><span class="cs-op-d">${dmy(r.date)}</span><span class="cs-op-n">${esc(r.name)}</span><b>${f(r.amount)}</b></div>`).join('')}
      </div>` : ''}`;
    el.onclick = e => { if (e.target.closest('[data-act="close"]')) closeSheet(el); };
    openSheet(el);
}

// ======================================================
//   Топ операций (список с полосками)
// ======================================================
export function renderTopList(el, rows) {
    if (!el) return;
    if (!rows.length) { el.innerHTML = '<p class="an-empty">За выбранный период трат нет</p>'; return; }
    const max = rows[0].amount || 1;
    el.innerHTML = rows.map((r, i) => {
        const { emoji, text } = splitEmoji(r.category);
        return `<div class="top-row${r.financial ? ' fin' : ''}">
            <span class="top-rank">${i + 1}</span>
            <span class="top-emoji">${emoji || '💸'}</span>
            <div class="top-main"><div class="top-h"><b>${esc(r.name)}</b><em>${f2(r.amount)}</em></div>
              <div class="top-sub">${esc(text)} · ${dmy(r.date)}${r.financial ? '<u>не бытовая</u>' : ''}</div>
              <div class="top-track"><i style="width:${Math.max(4, r.amount / max * 100)}%"></i></div></div>
        </div>`;
    }).join('');
    function f2(n) { return D.fmt(Math.round(n)); }
}

// ======================================================
//   Источники поступлений: сегментная полоса + список
// ======================================================
export function renderSources(el, breakdown, onPick) {
    if (!el) return;
    const { rows, total } = breakdown;
    if (!rows.length) { el.innerHTML = '<p class="an-empty">За выбранный период поступлений нет</p>'; return; }
    const colors = D.colors();
    const TOP = 6;
    const top = rows.slice(0, TOP);
    const rest = rows.slice(TOP);
    const restSum = rest.reduce((s, r) => s + r.sum, 0);
    const list = top.map((r, i) => ({ ...r, color: colors[i % colors.length] }));
    if (restSum > 0) list.push({ name: 'Остальные', sum: restSum, count: rest.reduce((s, r) => s + r.count, 0), share: restSum / total, color: 'var(--muted)', rest: true });
    el.innerHTML = `
      <div class="src-total"><span>${D.fmt(Math.round(total))}</span><small>${esc(D.cur())} · ${rows.length} ${rows.length === 1 ? 'источник' : rows.length < 5 ? 'источника' : 'источников'}</small></div>
      <div class="src-bar">${list.map(r => `<i style="flex:${Math.max(r.sum, total * 0.012)};background:${r.color}" title="${esc(r.name)}"></i>`).join('')}</div>
      <div class="src-list">${list.map((r, idx) => {
          const { emoji, text } = splitEmoji(r.name);
          return `<button type="button" class="src-row" data-i="${idx}" ${r.rest ? 'disabled' : ''}>
            <span class="src-dot" style="background:${r.color}"></span>
            <span class="src-name">${emoji ? `<em>${emoji}</em>` : ''}${esc(text)}${r.financial ? '<u>перевод</u>' : ''}</span>
            <b>${D.fmt(Math.round(r.sum))}</b><i>${pct(r.share)}</i>
          </button>`;
      }).join('')}</div>`;
    el.querySelectorAll('.src-row:not([disabled])').forEach(b => b.addEventListener('click', () => onPick?.(list[Number(b.dataset.i)])));
}

// ======================================================
//   Сводка по месяцам (таблица)
// ======================================================
export function renderSummary(el, data, { period, title = '', onToggle }) {
    if (!el) return;
    const { rows, totals } = data;
    const used = rows.filter(r => r.income || r.expense);
    if (!used.length) { el.innerHTML = '<p class="an-empty">Нет операций за выбранный год</p>'; return; }
    const sign = n => (n > 0 ? '+' : n < 0 ? '−' : '') + D.compact(Math.abs(n));
    const multiYear = new Set(rows.map(r => keyYear(r.key))).size > 1;
    const maxAbs = Math.max(...rows.map(r => Math.abs(r.net)), 1);
    el.innerHTML = `
      <div class="sm-head"><span></span><span>Поступл.</span><span>Траты</span><span>Итог</span></div>
      ${rows.map(r => {
          const sel = period.all || period.set.has(r.key);
          const empty = !r.income && !r.expense;
          const m = MONTHS_SHORT[keyMonth(r.key) - 1];
          return `<button type="button" class="sm-row ${sel && !period.all ? 'sel' : ''} ${empty ? 'empty' : ''}" data-key="${r.key}" title="${esc(MONTHS_FULL[keyMonth(r.key) - 1])} ${keyYear(r.key)}">
            <span class="sm-m">${m}${multiYear ? `<small>${String(keyYear(r.key)).slice(2)}</small>` : ''}</span>
            <span class="sm-in">${empty ? '—' : D.compact(r.income)}</span>
            <span class="sm-out">${empty ? '—' : D.compact(r.expense)}</span>
            <span class="sm-net ${r.net >= 0 ? 'pos' : 'neg'}">${empty ? '—' : sign(r.net)}
              ${empty ? '' : `<i style="width:${Math.max(3, Math.abs(r.net) / maxAbs * 100)}%"></i>`}</span>
          </button>`;
      }).join('')}
      <div class="sm-row sm-total"><span class="sm-m">${esc(title || 'Итого')}</span><span class="sm-in">${D.compact(totals.income)}</span><span class="sm-out">${D.compact(totals.expense)}</span>
        <span class="sm-net ${totals.net >= 0 ? 'pos' : 'neg'}">${sign(totals.net)}</span></div>
      ${totals.rate != null ? `<div class="sm-foot">${totals.rate >= 0 ? `Откладывается ${Math.round(totals.rate * 100)}% от поступлений` : `Траты выше поступлений на ${Math.round(-totals.rate * 100)}%`}</div>` : ''}`;
    el.querySelectorAll('button.sm-row:not(.empty)').forEach(b => b.addEventListener('click', () => onToggle?.(b.dataset.key)));
}
