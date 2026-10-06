// ===============================
//   DesktopWidgets.js — виджеты правой колонки на десктопе
//   «Куда ушли деньги» и «Можно тратить в день». На мобильном скрыты CSS-ом.
// ===============================
import { getDailyLimit, getSpentOnDay, findActivePlanner, isoDay } from '../shark/SharkMood.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const COLORS = ['var(--accent)', 'var(--out)', 'var(--save)', 'var(--debt)', 'var(--in)'];

export class DesktopWidgets {
    constructor({ budgetManager, plannerManager, uiManager }) {
        this.bm = budgetManager; this.pm = plannerManager; this.ui = uiManager;
    }

    init() {
        const side = document.querySelector('.side-col');
        if (side && !document.getElementById('dw-spend')) {
            side.insertAdjacentHTML('beforeend',
                '<section id="dw-spend" class="dw-card"></section><section id="dw-daily" class="dw-card"></section>');
        }
        this._initHeader();
        this._initSidebarBudget();
        this.refresh();
    }

    // кнопка «+ Операция» в шапке и подпись бюджета в сайдбаре
    _initHeader() {
        const hb = document.querySelector('header .header-button');
        if (hb && !document.getElementById('dw-add')) {
            hb.insertAdjacentHTML('beforeend', '<button type="button" id="dw-add" class="dw-add">＋ Операция</button>');
            document.getElementById('dw-add').addEventListener('click', () => document.getElementById('add-btn')?.click());
        }
        const s = document.getElementById('search-open-btn');
        if (s && !s.querySelector('.dw-search-txt')) s.insertAdjacentHTML('beforeend', '<span class="dw-search-txt">Категория, сумма, позиция…</span>');
    }

    _initSidebarBudget() {
        const nav = document.querySelector('footer.liquid-footer');
        if (!nav || document.getElementById('dw-budget')) return;
        nav.insertAdjacentHTML('beforeend',
            '<button type="button" id="dw-budget" class="dw-budget"><small>Бюджет</small><b id="dw-budget-name">—</b><span>▾</span></button>');
        document.getElementById('dw-budget').addEventListener('click', () => document.getElementById('current-budget')?.click());
        const src = document.getElementById('current-budget-name');
        const sync = () => { const t = document.getElementById('dw-budget-name'); if (t && src) t.textContent = src.textContent; };
        if (src) new MutationObserver(sync).observe(src, { childList: true, characterData: true, subtree: true });
        sync();
    }

    _period() {
        const mf = this.ui.monthFilter;
        const yearEl = this.ui.activeYearForMonthFilter || this.ui.yearFilter || new Date().getFullYear();
        return (tx) => {
            const d = tx.date || '';
            if (mf === 'all') return true;
            if (mf === 'year') return parseInt(d.slice(0, 4), 10) === Number(yearEl);
            return d.slice(5, 7) === mf && parseInt(d.slice(0, 4), 10) === Number(yearEl);
        };
    }

    refresh() {
        try { this._spend(); this._daily(); } catch (e) { console.warn('[DesktopWidgets]', e); }
    }

    _spend() {
        const el = document.getElementById('dw-spend');
        if (!el) return;
        const fmt = this.ui.formatNumber || (n => String(n));
        const inPeriod = this._period();
        const tx = (this.bm.getCurrentBudget()?.transactions || []).filter(t => t.type === 'expense' && inPeriod(t));
        const by = new Map();
        let total = 0;
        for (const t of tx) {
            const a = Number(t.amount) || 0; if (a <= 0) continue;
            total += a;
            const c = (t.category || 'Без категории').trim();
            by.set(c, (by.get(c) || 0) + a);
        }
        const top = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
        el.innerHTML = `<h3>Куда ушли деньги</h3>` + (top.length ? top.map(([c, v], i) => {
            const pct = Math.round(v / total * 100);
            return `<div class="dw-row"><div class="dw-row-h"><span>${esc(c)}</span><b>${esc(fmt(v))}</b><em>${pct}%</em></div>` +
                `<div class="dw-bar"><i style="width:${Math.max(3, pct)}%;background:${COLORS[i % COLORS.length]}"></i></div></div>`;
        }).join('') : '<p class="dw-empty">Трат за этот период пока нет</p>');
    }

    _daily() {
        const el = document.getElementById('dw-daily');
        if (!el) return;
        const fmt = this.ui.formatNumber || (n => String(n));
        const budget = this.bm.getCurrentBudget();
        const transactions = budget?.transactions || [];
        const today = isoDay();
        const planners = this.pm?.getAllPlanners?.() || [];
        const planner = findActivePlanner(planners, budget?.id || this.pm?.getCurrentBudgetId?.(), today);
        const normalize = c => this.pm?.normalizeCategory?.(c) ?? String(c || '').trim();
        const { limit } = getDailyLimit({ transactions, planner, today });
        const now = new Date();
        const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const left = dim - now.getDate();
        if (!limit) {
            el.innerHTML = '<h3>Можно тратить в день</h3><p class="dw-empty">Появится, когда накопится история трат или будет план</p>';
            return;
        }
        let dots = '';
        for (let d = 1; d <= dim; d++) {
            const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            let cls = 'future';
            if (d <= now.getDate()) {
                const sp = getSpentOnDay({ transactions, planner, day: iso, normalize });
                cls = sp > limit ? 'over' : 'ok';
            }
            if (d === now.getDate()) cls += ' today';
            dots += `<i class="${cls}"></i>`;
        }
        el.innerHTML = `<h3>Можно тратить в день</h3><div class="dw-big">${esc(fmt(limit))} <small>сум · ещё ${left} дн.</small></div><div class="dw-dots">${dots}</div>`;
    }
}
