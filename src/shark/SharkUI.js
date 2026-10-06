// ===============================
//   SharkUI.js — карточка Акулки на главной и тосты-реакции
// ===============================
import {
    getSharkSettings, saveSharkSettings, findActivePlanner, getDailyLimit, getSpentOnDay, computeMood,
    countStreakInLimit, reactToSave, isQuietNow, isoDay
} from './SharkMood.js';
import { showTweak } from '../utils/tweakSystem.js';

const MOOD_TO_ATTR = { new: 'new', ok: 'ok', tense: 'warn', angry: 'bad', proud: 'proud' };

export class SharkUI {
    constructor({ budgetManager, plannerManager, uiManager }) {
        this.bm = budgetManager;
        this.pm = plannerManager;
        this.ui = uiManager;
        this.pending = [];
        this.timer = null;
        this.lastReactAt = 0;
    }

    init() {
        window.addEventListener('budgetit:tx-added', e => this.onTxAdded(e.detail?.tx));
        this.ui.sharkHook = this;
        this.initSettingsPage();
        this.refreshCard();
    }

    // ───── страница настроек Акулки ─────
    initSettingsPage() {
        const sync = () => {
            const st = getSharkSettings();
            document.querySelectorAll('#shark-character-seg button').forEach(b => {
                const on = b.dataset.char === st.character;
                b.classList.toggle('is-active', on);
                const chk = b.querySelector('.set-check');
                if (chk) chk.textContent = on ? '✓' : '';
            });
            const map = { 'shark-opt-reactions': 'reactions', 'shark-opt-vibration': 'vibration', 'shark-opt-quiet': 'quietHours', 'shark-opt-tip': 'dailyTip' };
            Object.entries(map).forEach(([id, key]) => { const el = document.getElementById(id); if (el) el.checked = !!st[key]; });
        };
        document.getElementById('shark-character-seg')?.addEventListener('click', e => {
            const b = e.target.closest('button[data-char]');
            if (!b) return;
            saveSharkSettings({ character: b.dataset.char });
            sync();
            const card = document.getElementById('akulka-card');
            if (card) delete card.dataset.sig;
            this.refreshCard();
        });
        const map = { 'shark-opt-reactions': 'reactions', 'shark-opt-vibration': 'vibration', 'shark-opt-quiet': 'quietHours', 'shark-opt-tip': 'dailyTip' };
        Object.entries(map).forEach(([id, key]) => {
            document.getElementById(id)?.addEventListener('change', e => saveSharkSettings({ [key]: e.target.checked }));
        });
        sync();
    }

    // ───── контекст ─────
    context() {
        const budget = this.bm.getCurrentBudget();
        const transactions = budget?.transactions || [];
        const planners = this.pm?.getAllPlanners?.() || [];
        const today = isoDay();
        const planner = findActivePlanner(planners, budget?.id || this.pm?.getCurrentBudgetId?.(), today);
        const normalize = c => this.pm?.normalizeCategory?.(c) ?? String(c || '').trim();
        const { limit, source } = getDailyLimit({ transactions, planner, today });
        const spent = getSpentOnDay({ transactions, planner, day: today, normalize });
        return { transactions, planner, today, normalize, limit, source, spent, settings: getSharkSettings() };
    }

    // ───── карточка ─────
    refreshCard() {
        const card = document.getElementById('akulka-card');
        if (!card) return;
        const c = this.context();
        const streak = countStreakInLimit({ transactions: c.transactions, planner: c.planner, limit: c.limit, today: c.today, normalize: c.normalize });
        const mood = computeMood({
            spent: c.spent, limit: c.limit, character: c.settings.character,
            hasData: c.transactions.length > 0, streak
        });
        // антиповтор текста: не перерисовываем карточку, если настроение и числа не менялись
        const sig = `${mood.key}:${c.spent}:${c.limit}`;
        if (card.dataset.sig === sig) return;
        card.dataset.sig = sig;
        card.dataset.mood = MOOD_TO_ATTR[mood.key] || 'ok';
        card.dataset.state = mood.key;
        const t = document.getElementById('akulka-title');
        const x = document.getElementById('akulka-text');
        const bar = document.getElementById('akulka-bar');
        if (t) t.textContent = mood.title;
        if (x) x.textContent = mood.text;
        if (bar) bar.style.width = Math.min(100, Math.round(mood.ratio * 100)) + '%';
        card.classList.toggle('no-limit', !c.limit);
        this.syncLiveCard(card, mood);
    }

    syncLiveCard(card, mood) {
        const live = document.getElementById('shark-live');
        if (!live) return;
        live.dataset.mood = card?.dataset.mood || 'ok';
        live.dataset.state = mood.key;
        const t = document.getElementById('shark-live-title');
        const x = document.getElementById('shark-live-text');
        const b = document.getElementById('shark-live-bar');
        if (t) t.textContent = mood.title;
        if (x) x.textContent = mood.text;
        if (b) b.style.width = Math.min(100, Math.round(mood.ratio * 100)) + '%';
    }

    // ───── реакции ─────
    onTxAdded(tx) {
        if (!tx) return;
        this.pending.push(tx);
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.flush(), 250);
    }

    flush() {
        const list = this.pending.splice(0);
        if (!list.length) return;
        const c = this.context();
        if (!c.settings.reactions) return;
        const planned = new Set();
        if (c.planner) [...(c.planner.mainExpenses || []), ...(c.planner.regularExpenses || [])]
            .forEach(i => planned.add(c.normalize(i.category || i.name || '')));
        const isVar = t => t.type === 'expense' && t.date === c.today && !planned.has(c.normalize(t.category || ''));
        const added = list.filter(isVar).reduce((s, t) => s + (Number(t.amount) || 0), 0);
        const after = c.spent;
        const before = Math.max(0, after - added);

        let r;
        if (list.length > 1 || list[0].importBatchId) {
            const over = c.limit && after > c.limit && before <= c.limit;
            r = { text: `Залетело ${list.length} операций, разложила по категориям.${over ? ' Но лимит на сегодня пробит.' : ''}`,
                  color: after > c.limit && c.limit ? 'var(--out)' : 'var(--accent)', mood: 'ok' };
        } else {
            const tx = list[0];
            const backdate = tx.type === 'expense' && tx.date && tx.date !== c.today
                ? new Date(tx.date + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : null;
            r = reactToSave({
                type: tx.type, amount: Number(tx.amount) || 0, before, after, limit: c.limit,
                character: c.settings.character, backdate
            });
        }
        this.showToast(r, c.settings);
        this.animateCard(r, c.settings);
        this.refreshCard();
    }

    showToast(r, settings) {
        const img = 'assets/shark.png';
        showTweak(
            `<span class="shark-toast" style="--tc:${r.color}"><img src="${img}" alt=""><span>${r.text}</span></span>`,
            'info', 3200
        );
        if (settings.vibration && !isQuietNow(settings) && navigator.vibrate) {
            try { navigator.vibrate(r.mood === 'angry' ? [30, 40, 30] : 15); } catch (e) { /* ignore */ }
        }
    }

    animateCard(r, settings) {
        const card = document.getElementById('akulka-card');
        if (!card || r.repeat) return;
        if (isQuietNow(settings) || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
        card.classList.remove('react-ok', 'react-tense', 'react-angry', 'react-proud');
        void card.offsetWidth;
        card.classList.add(`react-${r.mood || 'ok'}`);
        setTimeout(() => card.classList.remove(`react-${r.mood || 'ok'}`), 1200);
    }
}
