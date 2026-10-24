// ===============================
//   recapUI.js — «Каким был твой прошлый месяц»: полноэкранные слайды в стиле сторис
//   Автолистание 7 секунд, тап справа/слева — вперёд/назад, удержание — пауза, свайп вниз — закрыть.
// ===============================
import { recapAvailability, WEEKDAYS_LONG, WEEKDAYS_NOM, MIN_ACTIVE_DAYS } from './recapStats.js';
import { buildAnyRecap, markRecapSeen, shortDate, rangeLabel } from './recapPeriods.js';
import { formatNumber } from '../utils/utils.js';
import { weekdayMon } from '../analytics/stats.js';
import { sharkImage } from '../shark/SharkMood.js';

export const SLIDE_MS = 7000;
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const esc = x => String(x ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function currency() {
    let r = 'UZ'; try { r = localStorage.getItem('region') || 'UZ'; } catch (e) {}
    return { RU: 'руб', KZ: 'тенге', KG: 'сом' }[r] || 'сум';
}
const money = n => formatNumber(Math.round(n));
const pct = x => `${Math.round(Math.abs(x) * 100)}%`;
const dayLabel = (key, day) => `${day} ${MONTHS_GEN[Number(key.slice(5, 7)) - 1]}`;
const plural = (n, a, b, c) => { const m = Math.abs(n) % 100, d = m % 10; return m > 10 && m < 20 ? c : d > 1 && d < 5 ? b : d === 1 ? a : c; };

/** Ссылки на «Залётом» — так же, как делает чат Акулки */
export function openImportFlow() {
    setTimeout(() => {
        document.getElementById('add-btn')?.click();
        setTimeout(() => document.querySelector('#transaction-sheet .chip-btn[data-type="excel-import"]')?.click(), 120);
    }, 150);
}

function sharkPic(emotion) {
    let src = 'assets/hoodie/hoodie-smile.webp';
    try { src = sharkImage(emotion); } catch (e) {}
    return `<img src="${esc(src)}" alt="" draggable="false" onerror="this.onerror=null;this.replaceWith(document.createTextNode('🦈'))">`;
}

// ---------- слайды ----------
// Каждый слайд: { id, hue, html }. Анимации включаются классом .on/.replay (см. CSS).
const WD_SHORT = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const MON_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

const bars = (rows, cur) => `<div class="mr-bars">${rows.map((c, i) => `
  <div class="mr-bar" style="--i:${i}"><span class="mr-bar-l">${c.emoji} ${esc(c.text)}</span><span class="mr-bar-v">${pct(c.share)}</span>
  <div class="mr-track"><i style="--w:${Math.max(4, Math.round(c.share * 100))}%"></i></div><small>${money(c.amount)} ${cur}</small></div>`).join('')}</div>`;

function cols(labels, values, { top = -1, dim = [], low = -1 } = {}) {
    const mx = Math.max(...values, 1);
    return `<div class="mr-cols${labels.length > 8 ? ' is-dense' : ''}" style="--n:${labels.length}">${labels.map((l, i) =>
        `<div class="mr-col ${i === top ? 'is-top' : ''} ${i === low ? 'is-low' : ''} ${dim.includes(i) ? 'is-dim' : ''}" style="--i:${i}"><i style="--hh:${values[i] > 0 ? Math.max(4, Math.round(values[i] / mx * 100)) : 2}"></i><span>${l}</span></div>`).join('')}</div>`;
}

const introSlide = ({ kicker, title, sub, mood, hue = 168 }) => ({ id: 'intro', hue, html: `
  <div class="mr-orb"></div>
  <div class="mr-kicker">${kicker}</div>
  <h2 class="mr-h mr-xl">${title}</h2>
  <div class="mr-fish" aria-hidden="true">${sharkPic(mood.emotion)}</div>
  <p class="mr-sub mr-mood">${esc(mood.line)}</p>
  <p class="mr-sub">${sub}</p>
  <p class="mr-hint">Нажимай по краям, чтобы листать</p>` });

const finNote = r => {
    const f = r.fin; if (!f || !(f.expense > 0)) return '';
    return `<p class="mr-hint">Расходы включают переводы, вклады, долги и траты «без учёта»: ${money(f.expense)} ${currency()}. Так же считает главный экран.</p>`;
};

function moneySlide(r, { word, plusTitle = 'Ты закончил в плюсе', minusTitle = 'Ты ушёл в минус', perMonth = false }) {
    const cur = currency();
    if (!(r.income > 0)) {
        return { id: 'money', hue: 350, html: `
          <div class="mr-kicker">Деньги ${word}</div>
          <h2 class="mr-h">Столько ты потратил</h2>
          <div class="mr-big is-out"><span data-count="${Math.round(r.expense)}">0</span><small>${cur}</small></div>
          <p class="mr-sub">${r.expenseCount} ${plural(r.expenseCount, 'трата', 'траты', 'трат')} · в среднем ${money(r.avgTx || (r.expenseCount ? r.spend / r.expenseCount : 0))} ${cur}${perMonth && r.avgMonth ? `<br>${money(r.avgMonth)} ${cur} в месяц` : ''}</p>
          <p class="mr-hint">Поступлений в записях нет — добавь их, и здесь появится остаток.</p>${finNote(r)}` };
    }
    const plus = r.net >= 0;
    const ratio = Math.min(1, r.expense / r.income);
    return { id: 'money', hue: plus ? 150 : 350, html: `
      <div class="mr-kicker">Деньги ${word}</div>
      <h2 class="mr-h">${plus ? plusTitle : minusTitle}</h2>
      <div class="mr-big ${plus ? 'is-in' : 'is-out'}"><span>${plus ? '+' : '−'}</span><span data-count="${Math.abs(Math.round(r.net))}">0</span><small>${cur}</small></div>
      <div class="mr-track"><i style="--w:${Math.round(ratio * 100)}%"></i></div>
      <div class="mr-two">
        <div><span>Пришло</span><b class="is-in">${money(r.income)}</b></div>
        <div><span>Ушло</span><b class="is-out">${money(r.expense)}</b></div>
      </div>
      <p class="mr-sub">${plus ? `Отложено ${pct(r.saveRate)} от поступлений` : `Трат больше поступлений на ${pct(r.expense / r.income - 1)}`}${perMonth && r.avgMonth ? `<br>В среднем ${money(r.avgMonth)} ${cur} трат в месяц` : ''}</p>${finNote(r)}` };
}

function catsSlide(r, kicker) {
    if (!r.topCats.length) return null;
    const top = r.topCats[0];
    return { id: 'cats', hue: 265, html: `
      <div class="mr-kicker">${kicker}</div>
      <h2 class="mr-h">${top.emoji} ${esc(top.text)}<br><small>забрали ${pct(top.share)} всех трат</small></h2>
      ${bars(r.topCats, currency())}` };
}

function bigSlide(r, kicker) {
    const b = r.bigTx; if (!b) return null;
    const cur = currency();
    const times = r.avgTx && b.amount > r.avgTx * 3 ? Math.round(b.amount / r.avgTx) : 0;
    return { id: 'big', hue: 22, html: `
      <div class="mr-kicker">${kicker}</div>
      <div class="mr-emoji" aria-hidden="true">${b.emoji}</div>
      <div class="mr-big is-out"><span data-count="${Math.round(b.amount)}">0</span><small>${cur}</small></div>
      <h2 class="mr-h">${esc(b.title || b.text)}</h2>
      <p class="mr-sub">${esc(b.text)} · ${shortDate(b.date)}${times ? `<br>В ${times} ${plural(times, 'раз', 'раза', 'раз')} больше обычной траты` : ''}</p>` };
}

function recordsSlide(records, { kicker, head }) {
    if (!records || !records.length) return null;
    return { id: 'records', hue: 48, html: `
      <div class="mr-kicker">${kicker}</div>
      <h2 class="mr-h">${head}</h2>
      <div class="mr-recs">${records.map((x, i) => `<div class="mr-rec is-${x.tone}" style="--i:${i}"><span class="mr-rec-e">${x.emoji}</span><div><b>${esc(x.title)}</b><small>${esc(x.text)}</small></div></div>`).join('')}</div>` };
}

const personaSlide = (r, kicker) => ({ id: 'persona', hue: 168, html: `
  <div class="mr-kicker">${kicker}</div>
  <div class="mr-emoji mr-pop" aria-hidden="true">${r.persona.emoji}</div>
  <h2 class="mr-h mr-xl">${esc(r.persona.title)}</h2>
  <p class="mr-sub">${esc(r.persona.text)}</p>
  <div class="mr-actions"><button type="button" class="mr-btn" data-mr="close">Готово</button><button type="button" class="mr-btn ghost" data-mr="replay">Ещё раз</button></div>` });

function vsYearSlide(r) {
    const v = r.vsYear; if (!v || v.expenseDelta === null) return null;
    const cur = currency(), down = v.expenseDelta < 0, same = Math.abs(v.expenseDelta) < 0.03;
    const isMonth = v.scope === 'month';
    const now = isMonth ? `${esc(r.name)} ${v.curYear}` : String(v.curYear);
    const was = isMonth ? `${esc(v.name)} ${v.year}` : String(v.year);
    const inc = v.incomeDelta !== null && r.income > 0 ? `<div class="mr-chip">Поступления: ${v.incomeDelta >= 0 ? '+' : '−'}${pct(v.incomeDelta)} к ${v.year}</div>` : '';
    return { id: 'vsyear', hue: same ? 200 : down ? 150 : 15, html: `
      <div class="mr-kicker">${isMonth ? 'Год назад' : 'Год к году'}</div>
      <div class="mr-big ${same ? '' : down ? 'is-in' : 'is-out'}"><span aria-hidden="true">${same ? '≈' : down ? '▼' : '▲'}</span><span data-count="${Math.round(Math.abs(v.expenseDelta) * 100)}">0</span><small>%</small></div>
      <h2 class="mr-h">${same ? `Траты как в ${v.year}-м` : down ? `Тратишь меньше, чем в ${v.year}-м` : `Тратишь больше, чем в ${v.year}-м`}</h2>
      <div class="mr-two">
        <div><span>${was}</span><b>${money(v.expense)}</b></div>
        <div><span>${now}</span><b>${money(r.expense)}</b></div>
      </div>
      <p class="mr-sub">${cur} · все расходы за период</p>
      ${v.move && Math.abs(v.move.pct) >= 0.1 ? `<div class="mr-chip">${v.move.emoji} ${esc(v.move.text)}: ${v.move.diff > 0 ? '+' : '−'}${pct(v.move.pct)}</div>` : ''}${inc}` };
}

function goalSlide(r) {
    const g = r.goal; if (!g) return null;
    const cur = currency();
    const done = g.pct >= 100;
    const behind = g.status === 'behind';
    const C = 2 * Math.PI * 52;
    return { id: 'goal', hue: behind ? 28 : 160, html: `
      <div class="mr-kicker">Твоя цель</div>
      <div class="mr-ring" style="--p:${g.pct}">
        <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="bg" cx="60" cy="60" r="52"/><circle class="fg" cx="60" cy="60" r="52" style="--d:${(C * g.pct / 100).toFixed(1)};--c:${C.toFixed(1)}"/></svg>
        <div class="mr-ring-t"><span data-count="${g.pct}">0</span><small>%</small></div>
      </div>
      <h2 class="mr-h">${done ? 'Цель достигнута' : `Ты отложил ${money(g.saved)} ${cur}<br><small>из ${money(g.sum)} ${cur}</small>`}</h2>
      <div class="mr-two">
        <div><span>Осталось</span><b>${money(g.left)}</b></div>
        <div><span>До ${shortDate(g.date)}</span><b>${g.daysLeft} ${plural(g.daysLeft, 'день', 'дня', 'дней')}</b></div>
      </div>
      <p class="mr-sub">${done ? 'Можно ставить новую в чате с Акулкой.' : behind ? `Чтобы успеть, нужно откладывать около ${money(g.perDay)} ${cur} в день (${money(g.perWeek)} в неделю)` : `Чтобы успеть, хватит ${money(g.perWeek)} ${cur} в неделю. Ты идёшь по плану.`}</p>` };
}

function monthSlides(r) {
    const cur = currency();
    const list = [];
    list.push(introSlide({
        kicker: 'Итоги месяца', title: `Каким был<br>твой <em>${esc(r.name)}</em>`, mood: r.mood,
        sub: `${r.activeDays} ${plural(r.activeDays, 'день', 'дня', 'дней')} с записями · ${r.expenseCount + r.incomeCount} ${plural(r.expenseCount + r.incomeCount, 'операция', 'операции', 'операций')}`
    }));
    list.push(moneySlide(r, { word: 'месяца' }));
    list.push(catsSlide(r, 'Куда уходили деньги'));
    list.push(bigSlide(r, 'Самая крупная трата'));

    const firstWd = weekdayMon(`${r.key}-01`);
    const max = Math.max(...r.daily, 1);
    const cells = [...Array(firstWd).fill('<i class="mr-cell is-pad"></i>'),
        ...r.daily.map((v, i) => `<i class="mr-cell ${v === 0 ? 'is-zero' : ''}" style="--a:${v ? (0.22 + 0.78 * Math.sqrt(v / max)).toFixed(2) : 0};--d:${i}" title="${i + 1}"></i>`)].join('');
    list.push({ id: 'calendar', hue: 200, html: `
      <div class="mr-kicker">Карта месяца</div>
      <h2 class="mr-h">${r.priciest ? `Самый дорогой день — ${shortDate(`${r.key}-${String(r.priciest.day).padStart(2, '0')}`)}` : 'Спокойный месяц'}</h2>
      <div class="mr-cal"><div class="mr-cal-h">${WD_SHORT.map(d => `<span>${d}</span>`).join('')}</div><div class="mr-cal-g">${cells}</div></div>
      ${r.priciest ? `<p class="mr-sub">${money(r.priciest.amount)} ${cur} за ${WEEKDAYS_LONG[r.priciest.weekday]}</p>` : ''}` });

    if (r.spend > 0) {
        list.push({ id: 'weekday', hue: 300, html: `
          <div class="mr-kicker">Твой ритм</div>
          <h2 class="mr-h">Чаще всего ты тратишь<br>в <em>${WEEKDAYS_LONG[r.topWeekday]}</em></h2>
          ${cols(WD_SHORT, r.weekdays, { top: r.topWeekday })}
          <p class="mr-sub">${r.weekendShare >= 0.4 ? `На выходные пришлось ${pct(r.weekendShare)} трат` : `На выходные пришлось ${pct(r.weekendShare)} трат, остальное — будни`}</p>` });
    }

    list.push({ id: 'pause', hue: 190, html: `
      <div class="mr-kicker">Дни без трат</div>
      <div class="mr-big"><span data-count="${r.noSpendDays}">0</span><small>${plural(r.noSpendDays, 'день', 'дня', 'дней')} из ${r.daysInMonth}</small></div>
      <h2 class="mr-h">${r.noSpendDays >= 8 ? 'Кошелёк отдыхал' : r.noSpendDays >= 3 ? 'Были и тихие дни' : 'Почти каждый день что-то покупал'}</h2>
      <div class="mr-two">
        <div><span>В среднем в день</span><b>${money(r.avgPerDay)}</b></div>
        <div><span>Средняя трата</span><b>${money(r.avgTx)}</b></div>
      </div>
      ${r.bestStreak >= 2 ? `<p class="mr-sub">Самая длинная пауза — ${r.bestStreak} ${plural(r.bestStreak, 'день', 'дня', 'дней')} подряд, с ${shortDate(`${r.key}-${String(r.bestStreakStart).padStart(2, '0')}`)}</p>` : ''}` });

    if (r.realIncome > 0 && r.incCats.length) {
        const rows = r.incCats;
        list.push({ id: 'income', hue: 140, html: `
          <div class="mr-kicker">Откуда пришли деньги</div>
          <h2 class="mr-h">Главный источник —<br><em>${rows[0].emoji} ${esc(rows[0].text)}</em></h2>
          ${bars(rows, cur)}` });
    }

    const v = r.vsPrev;
    if (v && v.comparable && v.expenseDelta !== null) {
        const down = v.expenseDelta < 0;
        list.push({ id: 'vs', hue: down ? 150 : 15, html: `
          <div class="mr-kicker">Против ${MONTHS_GEN[Number(v.key.slice(5, 7)) - 1]}</div>
          <div class="mr-big ${down ? 'is-in' : 'is-out'}"><span aria-hidden="true">${down ? '▼' : '▲'}</span><span data-count="${Math.round(Math.abs(v.expenseDelta) * 100)}">0</span><small>%</small></div>
          <h2 class="mr-h">${Math.abs(v.expenseDelta) < 0.03 ? 'Траты почти не изменились' : down ? 'Тратил меньше, чем раньше' : 'Тратил больше, чем раньше'}</h2>
          <p class="mr-sub">${money(v.expense)} → ${money(r.expense)} ${cur}</p>
          ${v.move && Math.abs(v.move.pct) >= 0.1 ? `<div class="mr-chip">${v.move.emoji} ${esc(v.move.text)}: ${v.move.diff > 0 ? '+' : '−'}${pct(v.move.pct)}</div>` : ''}` });
    }
    list.push(vsYearSlide(r));
    list.push(recordsSlide(r.records, { kicker: 'Рекорды', head: 'Этот месяц<br>вошёл в историю' }));
    list.push(goalSlide(r));
    list.push(personaSlide(r, 'Твой месяц одним словом'));
    return list.filter(Boolean);
}

function weekSlides(r) {
    const cur = currency();
    const list = [];
    const range = rangeLabel(r.from, r.to);
    list.push(introSlide({ kicker: 'Итоги недели', title: `Какой была<br>твоя <em>неделя</em>`, mood: r.mood, hue: 200, sub: `${range} · ${r.activeDays} ${plural(r.activeDays, 'день', 'дня', 'дней')} с записями` }));
    list.push(moneySlide(r, { word: 'недели', plusTitle: 'Неделя в плюсе', minusTitle: 'Недельный минус' }));
    list.push(catsSlide(r, 'На что ушла неделя'));
    const dayVals = r.days.map(d => d.expense);
    const top = r.priciest ? r.days.indexOf(r.priciest) : -1;
    list.push({ id: 'days', hue: 300, html: `
      <div class="mr-kicker">День за днём</div>
      <h2 class="mr-h">${r.priciest ? `Дороже всего — ${WEEKDAYS_LONG[r.priciest.wd]}<br><small>${money(r.priciest.expense)} ${cur}</small>` : 'Ни одной траты'}</h2>
      ${cols(WD_SHORT, dayVals, { top, dim: r.days.map((d, i) => d.future ? i : -1).filter(i => i >= 0) })}
      <p class="mr-sub">В среднем ${money(r.avgPerDay)} ${cur} в день${r.noSpendDays ? ` · ${r.noSpendDays} ${plural(r.noSpendDays, 'день', 'дня', 'дней')} без трат` : ''}</p>` });
    list.push(bigSlide(r, 'Главная трата недели'));
    const v = r.vsPrev;
    if (v && v.delta !== null) {
        const down = v.delta < 0;
        list.push({ id: 'vs', hue: down ? 150 : 15, html: `
          <div class="mr-kicker">Против прошлой недели</div>
          <div class="mr-big ${down ? 'is-in' : 'is-out'}"><span aria-hidden="true">${down ? '▼' : '▲'}</span><span data-count="${Math.round(Math.abs(v.delta) * 100)}">0</span><small>%</small></div>
          <h2 class="mr-h">${Math.abs(v.delta) < 0.03 ? 'Траты почти не изменились' : down ? 'Потратил меньше' : 'Потратил больше'}</h2>
          <p class="mr-sub">${money(v.expense)} → ${money(r.expense)} ${cur}</p>` });
    }
    list.push(goalSlide(r));
    list.push(personaSlide(r, 'Твоя неделя одним словом'));
    return list.filter(Boolean);
}

function yearSlides(r) {
    const cur = currency();
    const list = [];
    list.push(introSlide({ kicker: 'Итоги года', title: `Твой<br><em>${r.year}</em> год`, mood: r.mood, hue: 48, sub: `${r.monthsWith} ${plural(r.monthsWith, 'месяц', 'месяца', 'месяцев')} · ${r.activeDays} ${plural(r.activeDays, 'день', 'дня', 'дней')} с записями` }));
    list.push(moneySlide(r, { word: 'года', plusTitle: 'Год закончен в плюсе', minusTitle: 'Год вышел в минус', perMonth: true }));
    const idx = r.topMonth ? r.months.findIndex(m => m.key === r.topMonth.key) : -1;
    const lowIdx = r.lowMonth ? r.months.findIndex(m => m.key === r.lowMonth.key) : -1;
    list.push({ id: 'months', hue: 265, html: `
      <div class="mr-kicker">Месяц за месяцем</div>
      <h2 class="mr-h">${r.topMonth ? `Дороже всего — <em>${monthWord(r.topMonth.key)}</em><br><small>${money(r.topMonth.expense)} ${cur}</small>` : 'Траты по месяцам'}</h2>
      ${cols(MON_SHORT, r.months.map(m => m.expense), { top: idx, low: lowIdx !== idx ? lowIdx : -1, dim: r.months.map((m, i) => m.has ? -1 : i).filter(i => i >= 0) })}
      ${r.lowMonth && r.lowMonth.key !== (r.topMonth || {}).key ? `<p class="mr-sub">Самый экономный — ${monthWord(r.lowMonth.key)}: ${money(r.lowMonth.expense)} ${cur}</p>` : ''}` });
    list.push(catsSlide(r, 'Главные траты года'));
    list.push(bigSlide(r, 'Самая крупная трата года'));
    list.push(recordsSlide(r.records, { kicker: 'Рекорды года', head: 'Лучшие и самые<br>громкие месяцы' }));
    list.push({ id: 'pause', hue: 190, html: `
      <div class="mr-kicker">Дни без трат</div>
      <div class="mr-big"><span data-count="${r.noSpendDays}">0</span><small>${plural(r.noSpendDays, 'день', 'дня', 'дней')} из ${r.daysCounted}</small></div>
      <h2 class="mr-h">${r.bestStreak >= 3 ? `Самая длинная пауза — ${r.bestStreak} ${plural(r.bestStreak, 'день', 'дня', 'дней')} подряд` : 'Кошелёк почти не отдыхал'}</h2>
      ${r.bestStreak >= 3 ? `<p class="mr-sub">Закончилась ${shortDate(r.bestStreakEnd)}</p>` : ''}
      <p class="mr-sub">Чаще всего ты тратишь в ${WEEKDAYS_LONG[r.topWeekday]}</p>` });
    if (r.realIncome > 0 && r.incCats.length) {
        list.push({ id: 'income', hue: 140, html: `
          <div class="mr-kicker">Откуда пришли деньги</div>
          <h2 class="mr-h">Главный источник —<br><em>${r.incCats[0].emoji} ${esc(r.incCats[0].text)}</em></h2>
          ${bars(r.incCats, cur)}` });
    }
    const v = r.vsPrev;
    const yearVs = vsYearSlide(r); // «год к году» — один слайд; простое сравнение остаётся запасным, если для нового мало данных
    if (yearVs) list.push(yearVs);
    else if (v && v.delta !== null) {
        const down = v.delta < 0;
        list.push({ id: 'vs', hue: down ? 150 : 15, html: `
          <div class="mr-kicker">Против ${v.year} года</div>
          <div class="mr-big ${down ? 'is-in' : 'is-out'}"><span aria-hidden="true">${down ? '▼' : '▲'}</span><span data-count="${Math.round(Math.abs(v.delta) * 100)}">0</span><small>%</small></div>
          <h2 class="mr-h">${Math.abs(v.delta) < 0.03 ? 'Траты почти не изменились' : down ? 'Тратил меньше, чем год назад' : 'Тратил больше, чем год назад'}</h2>
          <p class="mr-sub">${money(v.expense)} → ${money(r.expense)} ${cur}</p>` });
    }
    list.push(goalSlide(r));
    list.push(personaSlide(r, 'Твой год одним словом'));
    return list.filter(Boolean);
}

const monthWord = key => MONTH_NOM[Number(key.slice(5, 7)) - 1];
const MONTH_NOM = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

function slides(r) {
    if (r.kind === 'week') return weekSlides(r);
    if (r.kind === 'year') return yearSlides(r);
    return monthSlides(r);
}

// ---------- плеер ----------
let player = null;

export function closeRecap() {
    if (!player) return;
    const p = player; player = null;
    cancelAnimationFrame(p.raf);
    document.removeEventListener('keydown', p.onKey);
    p.root.classList.remove('is-open');
    document.documentElement.classList.remove('mr-lock');
    setTimeout(() => p.root.remove(), 220);
}

function countUp(el) {
    const to = Number(el.dataset.count) || 0;
    const reduce = matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || to === 0) { el.textContent = money(to); return; }
    const t0 = performance.now(), dur = 900;
    const step = now => {
        const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        el.textContent = money(to * e);
        if (k < 1 && el.isConnected) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

export function openRecap(recap) {
    if (!recap || !recap.ok) return;
    try { markRecapSeen(recap); window.dispatchEvent(new CustomEvent('budgetit:recap-seen')); } catch (e) { /* ignore */ }
    closeRecap();
    const data = slides(recap);
    const root = document.createElement('div');
    root.id = 'month-recap';
    root.className = 'mr';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', `Каким был твой ${recap.name}`);
    root.innerHTML = `
      <div class="mr-bg"></div>
      <div class="mr-prog">${data.map(() => '<span><i></i></span>').join('')}</div>
      <button type="button" class="mr-x" data-mr="close" aria-label="Закрыть">✕</button>
      <div class="mr-stage">${data.map((s, i) => `<section class="mr-slide" data-i="${i}" data-id="${s.id}" style="--h:${s.hue}">${s.html}</section>`).join('')}</div>`;
    document.body.appendChild(root);
    document.documentElement.classList.add('mr-lock');
    requestAnimationFrame(() => root.classList.add('is-open'));

    const bars = [...root.querySelectorAll('.mr-prog i')];
    const sections = [...root.querySelectorAll('.mr-slide')];
    const st = { root, i: -1, elapsed: 0, last: 0, paused: false, raf: 0, onKey: null };
    player = st;

    const show = n => {
        n = Math.max(0, Math.min(data.length - 1, n));
        st.i = n; st.elapsed = 0; st.last = performance.now();
        bars.forEach((b, k) => { b.style.transform = `scaleX(${k < n ? 1 : 0})`; });
        sections.forEach((s, k) => {
            const on = k === n;
            s.classList.toggle('on', on);
            if (on) {
                root.style.setProperty('--h', data[n].hue);
                s.querySelectorAll('[data-count]').forEach(countUp);
                s.classList.remove('replay'); void s.offsetWidth; s.classList.add('replay');
            }
        });
    };
    const next = () => { if (st.i >= data.length - 1) { st.elapsed = SLIDE_MS; bars[st.i].style.transform = 'scaleX(1)'; st.paused = true; return; } show(st.i + 1); };
    const prev = () => show(st.i > 0 ? st.i - 1 : 0);

    const tick = now => {
        if (player !== st) return;
        if (!st.paused) {
            st.elapsed += now - st.last;
            const last = st.i === data.length - 1;
            bars[st.i].style.transform = `scaleX(${Math.min(1, st.elapsed / SLIDE_MS)})`;
            if (st.elapsed >= SLIDE_MS && !last) next();
        }
        st.last = now;
        st.raf = requestAnimationFrame(tick);
    };

    // нажатия: край экрана — листать, удержание — пауза, свайп вниз — закрыть
    let downAt = 0, startY = 0, held = false, holdTimer = 0, moved = false;
    const stage = root;
    stage.addEventListener('pointerdown', e => {
        if (e.target.closest('[data-mr]')) return;
        downAt = performance.now(); startY = e.clientY; held = false; moved = false;
        holdTimer = setTimeout(() => { held = true; st.paused = true; root.classList.add('is-paused'); }, 220);
    });
    const release = e => {
        clearTimeout(holdTimer);
        if (!downAt) return;
        const dy = (e.clientY || 0) - startY;
        const wasHeld = held;
        downAt = 0; held = false;
        root.classList.remove('is-paused');
        if (dy > 110) { closeRecap(); return; }
        st.paused = st.i === data.length - 1 && st.elapsed >= SLIDE_MS;
        if (wasHeld || Math.abs(dy) > 14) return;
        const x = e.clientX, w = root.clientWidth;
        if (x < w * 0.33) prev(); else next();
    };
    stage.addEventListener('pointerup', release);
    stage.addEventListener('pointercancel', () => { clearTimeout(holdTimer); downAt = 0; st.paused = false; root.classList.remove('is-paused'); });
    root.addEventListener('click', e => {
        const b = e.target.closest('[data-mr]');
        if (!b) return;
        if (b.dataset.mr === 'close') closeRecap();
        if (b.dataset.mr === 'replay') show(0), (st.paused = false);
    });
    st.onKey = e => {
        if (e.key === 'Escape') closeRecap();
        else if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next(); }
        else if (e.key === 'ArrowLeft') prev();
    };
    document.addEventListener('keydown', st.onKey);

    show(0);
    st.last = performance.now();
    st.raf = requestAnimationFrame(tick);
}

// ---------- «данных мало» ----------
export function openRecapNoData(av, { onImport } = {}) {
    document.getElementById('mr-nodata')?.remove();
    const el = document.createElement('div');
    el.id = 'mr-nodata';
    el.className = 'mr-nodata';
    el.innerHTML = `
      <div class="mr-nodata-card" role="dialog" aria-modal="true">
        <div class="mr-emoji" aria-hidden="true">🌊</div>
        <h3>Пока рассказывать нечего</h3>
        <p>Чтобы собрать итоги за ${esc(av.name)}, нужны записи хотя бы за ${MIN_ACTIVE_DAYS} дней, а сейчас их ${av.activeDays}.</p>
        <p class="mr-nodata-sub">Загрузи выписку через «Залётом», и месяц заполнится за пару секунд.</p>
        <div class="mr-actions"><button type="button" class="mr-btn" data-nd="import">⚡ Загрузить выпиской</button><button type="button" class="mr-btn ghost" data-nd="close">Не сейчас</button></div>
      </div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-open'));
    const close = () => { el.classList.remove('is-open'); setTimeout(() => el.remove(), 200); };
    el.addEventListener('click', e => {
        const b = e.target.closest('[data-nd]');
        if (b?.dataset.nd === 'import') { close(); (onImport || openImportFlow)(); }
        else if (b?.dataset.nd === 'close' || e.target === el) close();
    });
}

/** Единая точка: открыть итоги (month | week | year) или объяснить, чего не хватает */
export function showRecap(kind, transactions, todayISO, opts = {}) {
    const r = buildAnyRecap(kind, transactions, todayISO, !!opts.force);
    if (r.ok) { openRecap(r); return r; }
    if (kind === 'month') openRecapNoData(r, opts);
    return r;
}
export const showMonthRecap = (transactions, todayISO, opts = {}) => showRecap('month', transactions, todayISO, opts);
export { recapAvailability };
