// ===============================
//   SharkUI.js — карточка Акулки на главной, тосты-реакции,
//   шторка «Дневной лимит» и мини-чат «Спросить Акулку»
// ===============================
import {
    getSharkSettings, saveSharkSettings, findActivePlanner, getLimitInfo, getSpentOnDay, computeMood,
    countStreakInLimit, reactToSave, shiftDay, isQuietNow, isoDay, sharkImage, MOOD_IMAGES, getThresholds, fmt, CHARACTER_LABELS, limitSetText
} from './SharkMood.js';
import { buildExtra, describeLimit, answerQuestion, greeting, QUESTIONS, MENUS, menuIntro, topicAnswer, richHtml, evaluateChallenge, hintText, challengeText, badgeText, flavorLine, tailLine, goalDoneText, countDaysInLimit, rankInfo } from './SharkTalk.js';
import { goalCalc, earnedBadges, BADGES, getFlags, markFlag } from './SharkExtra.js';
import { showTweak } from '../utils/tweakSystem.js';

const MOOD_TO_ATTR = { new: 'new', ok: 'ok', tense: 'warn', angry: 'bad', proud: 'proud' };
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const digits = s => String(s || '').replace(/\D/g, '');
const group = s => digits(s).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

function setSharkImg(img, key) {
    if (!img) return;
    const src = sharkImage(key);
    if (img.getAttribute('src') === src) return;
    img.onerror = () => { img.onerror = null; img.src = MOOD_IMAGES.ok; };
    img.src = src;
}

export class SharkUI {
    constructor({ budgetManager, plannerManager, uiManager }) {
        this.bm = budgetManager;
        this.pm = plannerManager;
        this.ui = uiManager;
        this.pending = [];
        this.timer = null;
        this.lastReactAt = 0;
        this.mood = null;
        this.draft = { mode: 'auto', custom: 0 };
    }

    init() {
        window.addEventListener('budgetit:tx-added', e => this.onTxAdded(e.detail?.tx));
        this.ui.sharkHook = this;
        this.initSettingsPage();
        this.initCardActions();
        this.initHints();
        this.refreshCard();
    }

    // ───── подсказки Акулки при первом открытии разделов ─────
    initHints() {
        const map = [
            ['.chip-btn[data-type="excel-import"], [data-desk="import"]', 'import'],
            ['[data-nav="planner"]', 'planner'],
            ['[data-nav="analytics"]', 'analytics'],
            ['#open-accounts', 'accounts'],
            ['.open-subpage-btn[data-page="shark-page"]', 'shark']
        ];
        document.addEventListener('click', e => {
            for (const [sel, key] of map) if (e.target.closest(sel)) { this.showHint(key); break; }
        }, true);
    }

    showHint(key) {
        let seen = {};
        try { seen = JSON.parse(localStorage.getItem('budgetit:shark:hints') || '{}'); } catch (e) { seen = {}; }
        if (seen[key]) return;
        const c = this.context();
        if (!c.settings.reactions || isQuietNow(c.settings)) return;
        seen[key] = true;
        try { localStorage.setItem('budgetit:shark:hints', JSON.stringify(seen)); } catch (e) { /* ignore */ }
        const text = hintText(key, c.settings.character);
        if (!text) return;
        setTimeout(() => showTweak(`<span class="shark-toast" style="--tc:var(--accent)"><img src="${sharkImage('ok')}" alt=""><span>${esc(text)}</span></span>`, 'info', 6500), 700);
    }

    // ───── действия на карточке ─────
    initCardActions() {
        // весь блок Акулки на главной открывает чат; лимит меняется только в настройках Акулки
        document.addEventListener('click', e => {
            if (e.target.closest('#akulka-card')) { this.openChat(); return; }
            if (e.target.closest('#shark-limit-open')) this.openLimitSheet();
        });
        document.getElementById('akulka-card')?.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.openChat(); }
        });
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
            document.querySelectorAll('#shark-talk-seg button').forEach(b => {
                const on = b.dataset.talk === st.talk;
                b.classList.toggle('is-active', on);
                const chk = b.querySelector('.set-check');
                if (chk) chk.textContent = on ? '✓' : '';
            });
            const map = { 'shark-opt-reactions': 'reactions', 'shark-opt-vibration': 'vibration', 'shark-opt-quiet': 'quietHours', 'shark-opt-tip': 'dailyTip' };
            Object.entries(map).forEach(([id, key]) => { const el = document.getElementById(id); if (el) el.checked = !!st[key]; });
            this.syncLimitRow();
        };
        this.syncSettingsPage = sync;
        document.getElementById('shark-character-seg')?.addEventListener('click', e => {
            const b = e.target.closest('button[data-char]');
            if (!b) return;
            saveSharkSettings({ character: b.dataset.char });
            sync();
            this.forceRefresh();
        });
        document.getElementById('shark-talk-seg')?.addEventListener('click', e => {
            const b = e.target.closest('button[data-talk]');
            if (!b) return;
            saveSharkSettings({ talk: b.dataset.talk });
            sync();
            this.forceRefresh();
        });
        const map = { 'shark-opt-reactions': 'reactions', 'shark-opt-vibration': 'vibration', 'shark-opt-quiet': 'quietHours', 'shark-opt-tip': 'dailyTip' };
        Object.entries(map).forEach(([id, key]) => {
            document.getElementById(id)?.addEventListener('change', e => {
                saveSharkSettings({ [key]: e.target.checked });
                if (key === 'dailyTip') this.forceRefresh();
            });
        });
        sync();
    }

    syncLimitRow() {
        const sub = document.getElementById('shark-limit-sub');
        if (!sub) return;
        try {
            const c = this.context();
            sub.textContent = !c.limit ? 'Пока нет — задай свой или подожди данных'
                : `${fmt(c.limit)} в день · ${c.source === 'custom' ? 'твоя сумма' : c.source === 'plan' ? 'из плана' : 'по твоим тратам'}`;
        } catch (e) { /* ignore */ }
    }

    forceRefresh() {
        ['akulka-card', 'shark-live'].forEach(id => { const el = document.getElementById(id); if (el) delete el.dataset.sig; });
        this.refreshCard();
    }

    // ───── контекст ─────
    context() {
        const budget = this.bm.getCurrentBudget();
        const transactions = budget?.transactions || [];
        const planners = this.pm?.getAllPlanners?.() || [];
        const today = isoDay();
        const planner = findActivePlanner(planners, budget?.id || this.pm?.getCurrentBudgetId?.(), today);
        const normalize = c => this.pm?.normalizeCategory?.(c) ?? String(c || '').trim();
        const settings = getSharkSettings();
        const info = getLimitInfo({ transactions, planner, today, settings });
        const spent = getSpentOnDay({ transactions, planner, day: today, normalize });
        return { transactions, planner, today, normalize, limit: info.limit, source: info.source, info, spent, settings };
    }

    // ───── челлендж (состояние на устройстве) ─────
    loadChallenge() {
        try { return JSON.parse(localStorage.getItem('budgetit:shark:challenge') || 'null'); } catch (e) { return null; }
    }

    saveChallenge(state) {
        try {
            if (state) localStorage.setItem('budgetit:shark:challenge', JSON.stringify(state));
            else localStorage.removeItem('budgetit:shark:challenge');
        } catch (e) { /* ignore */ }
    }

    // ───── цель накопления ─────
    loadGoal() {
        try { return JSON.parse(localStorage.getItem('budgetit:shark:goal') || 'null'); } catch (e) { return null; }
    }

    saveGoal(g) {
        try {
            if (g) localStorage.setItem('budgetit:shark:goal', JSON.stringify(g));
            else localStorage.removeItem('budgetit:shark:goal');
        } catch (e) { /* ignore */ }
    }

    goalNow(c) {
        const g = this.loadGoal();
        if (!g) return null;
        const calc = goalCalc(g, c.transactions, c.today);
        if (!calc) { this.saveGoal(null); return null; }
        if (g.status === 'done') {
            if (g.seenOn && g.seenOn < c.today) { this.saveGoal(null); return null; }
            return { ...calc, status: 'done', seenOn: g.seenOn };
        }
        if (calc.status === 'done') {
            this.saveGoal({ ...g, status: 'done', seenOn: c.today });
            markFlag('goal');
            if (c.settings.reactions && !isQuietNow(c.settings)) {
                this.showToast({ text: goalDoneText(c.settings.character, calc.sum), mood: 'proud', color: 'var(--save)' }, c.settings);
            }
            return { ...calc, seenOn: c.today };
        }
        return calc;
    }

    // ───── значки ─────
    badgesNow(c) {
        const flags = getFlags();
        const sig = `${c.today}:${c.transactions.length}:${c.limit}:${Object.keys(flags).join(',')}`;
        if (this._badgeSig === sig && this._badges) return this._badges;
        const days = countDaysInLimit({ transactions: c.transactions, planner: c.planner, limit: c.limit, today: c.today, normalize: c.normalize });
        const earned = earnedBadges({ transactions: c.transactions, daysInLimit: days, rankIdx: rankInfo(days).idx, flags });
        let stored = null;
        try { stored = JSON.parse(localStorage.getItem('budgetit:shark:badges') || 'null'); } catch (e) { stored = null; }
        const cur = { ...(stored || {}) };
        const fresh = [...earned].filter(id => !cur[id]);
        fresh.forEach(id => { cur[id] = c.today; });
        if (!stored || fresh.length) { try { localStorage.setItem('budgetit:shark:badges', JSON.stringify(cur)); } catch (e) { /* ignore */ } }
        // первый запуск (ничего не было сохранено) — тихо, без тостов про старые заслуги
        if (stored && fresh.length && c.settings.reactions && !isQuietNow(c.settings)) {
            const b = BADGES.find(x => x.id === fresh[0]);
            if (b) this.showToast({ text: `${b.icon} ${badgeText(c.settings.character, b.title)}`, mood: 'proud', color: 'var(--save)' }, c.settings);
        }
        this._badgeSig = sig;
        this._badges = new Set(Object.keys(cur));
        return this._badges;
    }

    // Текущее состояние челленджа: фиксирует завершение или провал (и один раз радуется/поддерживает тостом)
    challengeNow(c) {
        const st = this.loadChallenge();
        if (!st) return null;
        if ((st.status === 'done' || st.status === 'fail') && st.seenOn && st.seenOn < c.today) { this.saveChallenge(null); return null; }
        const ev = evaluateChallenge(st, { today: c.today, transactions: c.transactions, limit: c.limit, planner: c.planner, normalize: c.normalize });
        if (!ev) { this.saveChallenge(null); return null; }
        if (st.status !== ev.status && (ev.status === 'done' || ev.status === 'fail')) {
            this.saveChallenge({ ...st, status: ev.status, done: ev.done, seenOn: c.today });
            if (ev.status === 'done') markFlag('challenge');
            ev.seenOn = c.today;
            if (c.settings.reactions && !isQuietNow(c.settings)) {
                const done = ev.status === 'done';
                this.showToast({ text: challengeText(done ? 'chDone' : 'chFail', c.settings.character, ev.title), mood: done ? 'proud' : 'ok', color: done ? 'var(--in)' : 'var(--accent)' }, c.settings);
            }
        }
        return ev;
    }

    talkContext(c = this.context()) {
        const streak = countStreakInLimit({ transactions: c.transactions, planner: c.planner, limit: c.limit, today: c.today, normalize: c.normalize });
        return {
            now: new Date(), today: c.today, character: c.settings.character, limit: c.limit, spent: c.spent,
            transactions: c.transactions, planner: c.planner, normalize: c.normalize, streak, info: c.info,
            challenge: this.challengeNow(c),
            talk: c.settings.talk, goalState: this.loadGoal(), goal: this.goalNow(c), badges: [...this.badgesNow(c)],
            backupNudgeLast: (() => { try { return localStorage.getItem('budgetit:shark:backupNudge'); } catch (e) { return null; } })()
        };
    }

    // ───── карточка ─────
    refreshCard() {
        const card = document.getElementById('akulka-card');
        if (!card) return;
        const c = this.context();
        const tctx = this.talkContext(c);
        const mood = computeMood({
            spent: c.spent, limit: c.limit, character: c.settings.character,
            hasData: c.transactions.length > 0, streak: tctx.streak
        });
        const extra = c.settings.dailyTip ? buildExtra(tctx) : null;
        if (extra?.kind === 'backup' && tctx.backupNudgeLast !== c.today) { try { localStorage.setItem('budgetit:shark:backupNudge', c.today); } catch (e) { /* ignore */ } }
        // антиповтор текста: не перерисовываем карточку, если настроение и числа не менялись
        const sig = `${mood.key}:${c.spent}:${c.limit}:${c.settings.character}:${extra?.kind || ''}`;
        if (card.dataset.sig === sig) return;
        card.dataset.sig = sig;
        this.mood = mood;
        card.dataset.mood = MOOD_TO_ATTR[mood.key] || 'ok';
        card.dataset.state = mood.key;
        const t = document.getElementById('akulka-title');
        const x = document.getElementById('akulka-text');
        const bar = document.getElementById('akulka-bar');
        const ex = document.getElementById('akulka-extra');
        if (t) t.textContent = mood.title;
        if (x) x.textContent = mood.text;
        if (bar) bar.style.width = Math.min(100, Math.round(mood.ratio * 100)) + '%';
        if (ex) { ex.textContent = extra ? extra.text : ''; ex.hidden = !extra; }
        setSharkImg(document.getElementById('akulka-img'), mood.key);
        card.classList.toggle('no-limit', !c.limit);
        this.syncLiveCard(card, mood, extra);
        this.syncLimitRow();
    }

    syncLiveCard(card, mood, extra) {
        const live = document.getElementById('shark-live');
        if (!live) return;
        live.dataset.mood = card?.dataset.mood || 'ok';
        live.dataset.state = mood.key;
        const t = document.getElementById('shark-live-title');
        const x = document.getElementById('shark-live-text');
        const b = document.getElementById('shark-live-bar');
        const ex = document.getElementById('shark-live-extra');
        if (t) t.textContent = mood.title;
        if (x) x.textContent = mood.text;
        if (b) b.style.width = Math.min(100, Math.round(mood.ratio * 100)) + '%';
        if (ex) { ex.textContent = extra ? extra.text : ''; ex.hidden = !extra; }
        setSharkImg(live.querySelector('img'), mood.key);
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
        if (!c.settings.reactions) { this.refreshCard(); return; }
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
                  color: after > c.limit && c.limit ? 'var(--out)' : 'var(--accent)', mood: over ? 'angry' : 'ok' };
        } else {
            const tx = list[0];
            const backdate = tx.type === 'expense' && tx.date && tx.date !== c.today
                ? new Date(tx.date + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : null;
            r = reactToSave({
                type: tx.type, amount: Number(tx.amount) || 0, before, after, limit: c.limit,
                character: c.settings.character, backdate, first: c.transactions.length === 1, talk: c.settings.talk
            });
        }
        this.showToast(r, c.settings);
        this.animateCard(r, c.settings);
        this.refreshCard();
    }

    showToast(r, settings) {
        const img = sharkImage(r.mood);
        showTweak(
            `<span class="shark-toast" style="--tc:${r.color}"><img src="${img}" alt=""><span>${esc(r.text)}</span></span>`,
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

    // Закрытие шторки поверх полноэкранной страницы: ui.closeModal видит открытую страницу
    // (#shark-page тоже .bottom-sheet) и оставляет затемнение — гасим его сами.
    closeSheet(id) {
        document.getElementById(id)?.classList.add('hidden');
        const anyOpen = document.querySelector('.bottom-sheet:not(.hidden):not(.fullscreen-sheet)');
        if (!anyOpen) document.getElementById('bottom-sheet-backdrop')?.classList.add('hidden');
    }

    // ───── шторка «Дневной лимит» ─────
    ensureLimitSheet() {
        let sheet = document.getElementById('shark-limit-sheet');
        if (sheet) return sheet;
        sheet = document.createElement('div');
        sheet.id = 'shark-limit-sheet';
        sheet.className = 'bottom-sheet hidden';
        sheet.innerHTML = `
          <div class="sheet-title-row"><h2>Дневной лимит</h2><button type="button" class="sheet-x" id="sl-x" aria-label="Закрыть">✕</button></div>
          <div class="sl-hero"><div class="sl-num" id="sl-num">—</div><div class="sl-sub" id="sl-sub"></div></div>
          <div class="sl-seg" id="sl-seg" role="group">
            <button type="button" data-mode="auto">Акулка считает</button>
            <button type="button" data-mode="custom">Своя сумма</button>
          </div>
          <div id="sl-auto" class="sl-panel"><div id="sl-explain" class="sl-explain"></div></div>
          <div id="sl-custom" class="sl-panel" hidden>
            <label class="sl-input"><input id="sl-input" inputmode="numeric" autocomplete="off" placeholder="0" aria-label="Лимит в день"><span>в день</span></label>
            <div class="sl-quick">
              <button type="button" data-act="auto" id="sl-q-auto">Как у Акулки</button>
              <button type="button" data-act="-10">−10%</button>
              <button type="button" data-act="+10">+10%</button>
            </div>
            <div class="sl-hint">Сколько можно тратить в день на повседневное: еда, транспорт, мелочи. Плановые платежи (аренда, связь) сюда не входят.</div>
          </div>
          <div id="sl-thr" class="sl-thr"></div>
          <button type="button" id="sl-save" class="sl-save">Сохранить</button>`;
        document.body.appendChild(sheet);
        sheet.querySelector('#sl-x').addEventListener('click', () => this.closeSheet('shark-limit-sheet'));
        sheet.querySelector('#sl-seg').addEventListener('click', e => {
            const b = e.target.closest('button[data-mode]');
            if (!b) return;
            this.draft.mode = b.dataset.mode;
            if (this.draft.mode === 'custom' && !this.draft.custom) this.draft.custom = this.limitCtx?.info.auto.limit || 0;
            this.paintLimit(true);
        });
        const input = sheet.querySelector('#sl-input');
        input.addEventListener('input', () => {
            const before = input.value.slice(0, input.selectionStart ?? input.value.length);
            const digitsBefore = digits(before).length;
            input.value = group(input.value);
            let pos = 0, seen = 0;
            while (pos < input.value.length && seen < digitsBefore) { if (/\d/.test(input.value[pos])) seen++; pos++; }
            try { input.setSelectionRange(pos, pos); } catch (e) { /* ignore */ }
            this.draft.custom = Number(digits(input.value)) || 0;
            this.paintLimit(false);
        });
        sheet.querySelector('.sl-quick').addEventListener('click', e => {
            const b = e.target.closest('button[data-act]');
            if (!b) return;
            const base = this.draft.custom || this.limitCtx?.info.auto.limit || 0;
            if (b.dataset.act === 'auto') this.draft.custom = this.limitCtx?.info.auto.limit || 0;
            else if (base) {
                const k = b.dataset.act === '+10' ? 1.1 : 0.9;
                const step = base >= 100000 ? 1000 : base >= 10000 ? 100 : 10;
                this.draft.custom = Math.max(step, Math.round(base * k / step) * step);
            }
            this.paintLimit(true);
        });
        sheet.querySelector('#sl-save').addEventListener('click', () => this.saveLimit());
        return sheet;
    }

    openLimitSheet() {
        const sheet = this.ensureLimitSheet();
        const c = this.context();
        this.limitCtx = c;
        this.draft = { mode: c.settings.limitMode, custom: c.settings.customLimit || 0 };
        this.paintLimit(true);
        this.ui.openModal('shark-limit-sheet');
        sheet.scrollTop = 0;
    }

    paintLimit(syncInput) {
        const c = this.limitCtx || this.context();
        const sheet = document.getElementById('shark-limit-sheet');
        if (!sheet) return;
        const d = this.draft;
        const auto = c.info.auto;
        const eff = d.mode === 'custom' ? d.custom : auto.limit;
        sheet.querySelectorAll('#sl-seg button').forEach(b => b.classList.toggle('active', b.dataset.mode === d.mode));
        sheet.querySelector('#sl-auto').hidden = d.mode !== 'auto';
        sheet.querySelector('#sl-custom').hidden = d.mode !== 'custom';
        sheet.querySelector('#sl-num').textContent = eff ? fmt(eff) : '—';
        const planName = c.planner?.name ? ` «${c.planner.name}»` : '';
        sheet.querySelector('#sl-sub').textContent = d.mode === 'custom'
            ? 'в день · твоя сумма'
            : auto.source === 'plan' ? `в день · из плана${planName}`
            : auto.source === 'median' ? 'в день · по твоим тратам за 30 дней'
            : 'пока недостаточно данных';
        sheet.querySelector('#sl-explain').innerHTML = describeLimit({
            info: { ...auto, auto }, planner: c.planner, character: c.settings.character
        }).map(l => `<p>${esc(l)}</p>`).join('');
        const qa = sheet.querySelector('#sl-q-auto');
        qa.textContent = auto.limit ? `Как у Акулки: ${fmt(auto.limit)}` : 'Как у Акулки';
        qa.hidden = !auto.limit;
        if (syncInput) sheet.querySelector('#sl-input').value = d.custom ? group(String(d.custom)) : '';
        const [warnAt, angryAt] = getThresholds(c.settings.character);
        sheet.querySelector('#sl-thr').innerHTML = eff
            ? `<b>${esc(CHARACTER_LABELS[c.settings.character] || 'Обычная')}</b>: насторожусь на ${fmt(eff * warnAt)} (${Math.round(warnAt * 100)}%), ${angryAt > 50 ? 'ругаться не буду' : `разозлюсь выше ${fmt(eff)}`}.`
            : 'Задай сумму или подожди, пока накопится история трат.';
        sheet.querySelector('#sl-save').disabled = d.mode === 'custom' && !d.custom;
    }

    saveLimit() {
        const d = this.draft;
        if (d.mode === 'custom' && !(d.custom > 0)) { showTweak('Введи сумму лимита', 'error', 1800); return; }
        saveSharkSettings({ limitMode: d.mode, customLimit: d.mode === 'custom' ? d.custom : getSharkSettings().customLimit });
        this.closeSheet('shark-limit-sheet');
        this.forceRefresh();
        window.dispatchEvent(new CustomEvent('budgetit:shark-limit-changed'));
        const c = this.context();
        showTweak(`<span class="shark-toast" style="--tc:var(--accent)"><img src="${sharkImage('ok')}" alt=""><span>${esc(limitSetText(c.settings.character, d.mode, c.limit))}</span></span>`, 'info', 2600);
    }

    // ───── чат «Спросить Акулку» ─────
    ensureChat() {
        let sheet = document.getElementById('shark-chat-sheet');
        if (sheet) return sheet;
        sheet = document.createElement('div');
        sheet.id = 'shark-chat-sheet';
        sheet.className = 'bottom-sheet hidden';
        sheet.innerHTML = `
          <div class="sheet-title-row"><h2>Спросить Акулку</h2><button type="button" class="sheet-x" id="sc-x" aria-label="Закрыть">✕</button></div>
          <div id="sc-log" class="sc-log" aria-live="polite"></div>
          <form id="sc-form" class="sc-form" hidden autocomplete="off"><input id="sc-amount" inputmode="numeric" placeholder="Сумма, например 50 000" maxlength="14"><button type="submit">Посчитать</button></form>
          <form id="sc-goal" class="sc-form sc-form-goal" hidden autocomplete="off"><input id="sc-goal-sum" inputmode="numeric" placeholder="Сумма цели" maxlength="14"><input id="sc-goal-date" type="date" aria-label="Дата цели"><button type="submit">Поставить</button></form>
          <div id="sc-chips" class="sc-chips"></div>`;
        document.body.appendChild(sheet);
        sheet.querySelector('#sc-x').addEventListener('click', () => this.closeSheet('shark-chat-sheet'));
        sheet.querySelector('#sc-chips').addEventListener('click', e => {
            const b = e.target.closest('button');
            if (!b) return;
            if (b.dataset.q) this.ask(b.dataset.q, b.textContent);
            else if (b.dataset.menu) this.openMenu(b.dataset.menu, b.textContent);
            else if (b.dataset.topic) this.openTopic(b.dataset.topic, b.textContent);
            else if (b.dataset.back !== undefined) this.backToMain();
        });
        sheet.querySelector('#sc-log').addEventListener('click', e => {
            const qb = e.target.closest('.sc-act[data-q]');
            if (qb) { this.ask(qb.dataset.q, qb.textContent); return; }
            const act = e.target.closest('[data-act]');
            if (act) { this.runAction(act.dataset.act); return; }
            if (e.target.closest('[data-ch-stop]')) { this.ask('chstop', '✖ Отказаться от челленджа'); return; }
            const av = e.target.closest('.sc-msg.shark img');
            if (av) { av.classList.remove('sc-wiggle'); void av.offsetWidth; av.classList.add('sc-wiggle'); this.reply(richHtml(answerQuestion('fact', this.talkContext()).text), 300); }
        });
        sheet.querySelector('#sc-goal').addEventListener('input', e => { const i = e.target; if (i.id === 'sc-goal-sum') i.value = group(i.value); });
        sheet.querySelector('#sc-goal').addEventListener('submit', e => {
            e.preventDefault();
            const sum = sheet.querySelector('#sc-goal-sum'), date = sheet.querySelector('#sc-goal-date');
            const goalInput = { sum: Number(digits(sum.value)), date: date.value };
            const label = `${sum.value || '—'}${date.value ? ' до ' + date.value.split('-').reverse().join('.') : ''}`;
            this.ask('goal', label, { goalInput });
        });
        sheet.querySelector('#sc-form').addEventListener('input', e => { const i = e.target; if (i.id === 'sc-amount') i.value = group(i.value); });
        sheet.querySelector('#sc-form').addEventListener('submit', e => {
            e.preventDefault();
            const inp = sheet.querySelector('#sc-amount');
            const amount = Number(digits(inp.value));
            this.bubble('user', esc(inp.value || '—'));
            const ans = answerQuestion('whatif', { ...this.talkContext(), amount: amount || 0 });
            inp.value = '';
            this.reply(richHtml(ans.text) + (ans.action === 'limit' ? '<button type="button" class="sc-act" data-act="limit">Настроить лимит ›</button>' : ''));
        });
        this.renderChips();
        return sheet;
    }

    bubble(who, html) {
        const log = document.getElementById('sc-log');
        const mood = this.mood?.key || 'ok';
        const el = document.createElement('div');
        el.className = `sc-msg ${who}`;
        el.innerHTML = who === 'shark'
            ? `<img src="${sharkImage(mood)}" alt=""><div class="sc-bub">${html}</div>`
            : `<div class="sc-bub">${html}</div>`;
        log.appendChild(el);
        log.scrollTop = log.scrollHeight;
        return el;
    }

    openChat() {
        const sheet = this.ensureChat();
        this.refreshCard();
        const log = sheet.querySelector('#sc-log');
        log.innerHTML = '';
        this.chatMenu = null;
        this.renderChips();
        const hello = document.getElementById('akulka-text')?.textContent || 'Привет! Спрашивай — отвечу по твоим данным.';
        this.bubble('shark', esc(hello));
        const st = this.context().settings;
        if (st.talk !== 'quiet') this.bubble('shark', esc(greeting(st.character)));
        if (st.talk === 'chatty' || (st.talk === 'normal' && Math.random() < 0.3)) {
            const f = flavorLine({ ...this.talkContext(), seed: String(Math.random()) });
            setTimeout(() => this.bubble('shark', esc(f.text)), 750);
        }
        this.ui.openModal('shark-chat-sheet');
    }

    ask(id, label, extra = {}) {
        this.bubble('user', esc(label));
        const ctx = { ...this.talkContext(), ...extra };
        const ans = answerQuestion(id, ctx);
        if (ans.effect?.setGoal) { this.saveGoal(ans.effect.setGoal); this.forceRefresh(); }
        if (ans.effect?.clearGoal) { this.saveGoal(null); this.forceRefresh(); }
        if (ans.effect?.startChallenge) { this.saveChallenge({ id: ans.effect.startChallenge, start: ctx.today, status: 'active' }); this.forceRefresh(); }
        if (ans.effect?.stopChallenge) { this.saveChallenge(null); this.forceRefresh(); }
        if (ans.effect) this.renderChips();
        const form = document.getElementById('sc-form');
        if (form) {
            form.hidden = ans.input !== 'amount';
            if (!form.hidden) setTimeout(() => document.getElementById('sc-amount')?.focus(), 450);
        }
        const gform = document.getElementById('sc-goal');
        if (gform) {
            gform.hidden = ans.input !== 'goal';
            if (!gform.hidden) {
                const t = new Date(); t.setDate(t.getDate() + 1);
                const dateEl = document.getElementById('sc-goal-date');
                if (dateEl) dateEl.min = isoDay(t);
                setTimeout(() => document.getElementById('sc-goal-sum')?.focus(), 450);
            }
        }
        const buttons = (ans.action === 'limit' ? '<button type="button" class="sc-act" data-act="limit">Настроить лимит ›</button>' : '') +
            (ans.canStop ? '<button type="button" class="sc-act" data-ch-stop>✖ Отказаться</button>' : '') +
            (ans.goalButtons ? '<button type="button" class="sc-act" data-q="goalnew">🎯 Новая цель</button><button type="button" class="sc-act" data-q="goalstop">✖ Убрать цель</button>' : '') +
            (ans.choices ? ans.choices.map(ch => `<button type="button" class="sc-act" data-q="${ch.id}">${esc(ch.label)}</button>`).join('') : '');
        const quiet = !['joke', 'dialog'].includes(id) && !id.startsWith('dlg:') && !ans.input && !ans.choices;
        const aside = quiet && ctx.talk === 'chatty' && Math.random() < 0.5 ? `<p class="sc-aside">${esc(tailLine(ctx.character))}</p>` : '';
        this.reply(richHtml(ans.text) + aside + buttons);
    }

    renderChips() {
        const box = document.getElementById('sc-chips');
        if (!box) return;
        const menu = this.chatMenu;
        const form = document.getElementById('sc-form');
        if (form && !menu) form.hidden = true;
        const gf = document.getElementById('sc-goal');
        if (gf && !menu) gf.hidden = true;
        if (!menu) {
            box.innerHTML = QUESTIONS.map(q => `<button type="button" data-q="${q.id}">${esc(q.label)}</button>`).join('') +
                Object.entries(MENUS).map(([k, m]) => `<button type="button" class="sc-menu" data-menu="${k}">${esc(m.label)}</button>`).join('');
            return;
        }
        const m = MENUS[menu];
        let inner = '<button type="button" class="sc-back" data-back>‹ Назад</button>';
        if (m.topics) inner += m.topics.map(t => `<button type="button" data-topic="${t.id}">${t.icon} ${esc(t.title)}</button>`).join('');
        else {
            const active = this.loadChallenge()?.status === 'active';
            inner += m.items.filter(i => i.id !== 'chstop').map(i => `<button type="button" data-q="${i.id}"${i.group ? ' class="sc-start"' : ''}>${esc(i.label)}</button>`).join('');
            if (active && menu === 'fun') inner += '<button type="button" data-q="chstop">✖ Отказаться от челленджа</button>';
        }
        box.innerHTML = inner;
    }

    // Ответ Акулки с «печатью»: возвращает пузырь, в который кладётся html
    reply(html, delay = 380) {
        const typing = this.bubble('shark', '<span class="sc-dots"><i></i><i></i><i></i></span>');
        setTimeout(() => {
            typing.querySelector('.sc-bub').innerHTML = html;
            const log = document.getElementById('sc-log');
            log.scrollTop = log.scrollHeight;
        }, delay);
        return typing;
    }

    openMenu(kind, label) {
        this.bubble('user', esc(label));
        this.chatMenu = kind;
        this.renderChips();
        const c = this.context().settings.character;
        this.reply(`<p>${esc(menuIntro(kind, c))}</p>`);
    }

    backToMain() {
        this.chatMenu = null;
        this.renderChips();
        this.bubble('user', '‹ Назад');
        this.reply('<p>Хорошо, вернулись. Что ещё интересно?</p>', 250);
    }

    openTopic(id, label) {
        const kind = this.chatMenu || 'help';
        const c = this.context().settings.character;
        const ans = topicAnswer(kind, id, c);
        if (!ans) return;
        this.bubble('user', esc(label));
        const ACTIONS = { limit: 'Настроить лимит ›', add: ans.action?.label, import: ans.action?.label, data: ans.action?.label };
        const btn = ans.action ? `<button type="button" class="sc-act" data-act="${ans.action.id}">${esc(ACTIONS[ans.action.id] || ans.action.label)}</button>` : '';
        this.reply(`<p class="sc-h"><b>${esc(ans.title)}</b></p>${richHtml(ans.text)}${btn}`, 520);
        setTimeout(() => this.bubble('shark', `<p>${esc(ans.outro)}</p>`), 1100);
    }

    runAction(id) {
        if (id === 'limit') { this.closeSheet('shark-chat-sheet'); this.openLimitSheet(); return; }
        this.closeSheet('shark-chat-sheet');
        if (id === 'add') { setTimeout(() => document.getElementById('add-btn')?.click(), 150); return; }
        const click = sel => setTimeout(() => document.querySelector(sel)?.click(), 150);
        if (id === 'analytics') { click('[data-nav="analytics"]'); return; }
        if (id === 'planner') { click('[data-nav="planner"]'); return; }
        if (id === 'accounts') { click('#open-accounts'); return; }
        if (id === 'import') {
            setTimeout(() => {
                document.getElementById('add-btn')?.click();
                setTimeout(() => document.querySelector('#transaction-sheet .chip-btn[data-type="excel-import"]')?.click(), 120);
            }, 150);
            return;
        }
        if (id === 'data') {
            setTimeout(() => document.querySelector('.open-subpage-btn[data-page="export-import-page"]')?.click(), 150);
        }
    }
}
