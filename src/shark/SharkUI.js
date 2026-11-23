// ===============================
//   SharkUI.js — карточка Акулки на главной, тосты-реакции,
//   шторка «Дневной лимит» и мини-чат «Спросить Акулку»
// ===============================
import {
    getSharkSettings, saveSharkSettings, readScoped, writeScoped, sharkScope, findActivePlanner, planStatus, planAverageLimit, getLimitInfo, planIncomeWaiting, getSpentOnDay, isDailySpend, computeMood,
    countStreakInLimit, countOverStreak, reactToSave, shiftDay, isQuietNow, isoDay, sharkImage, forShark, computeCard, getThresholds, fmt, CHARACTER_LABELS, limitSetText,
    getNoSpendDays, markNoSpend, syncNoSpend, canMarkNoSpend, noSpendText, agreeNumbers
} from './SharkMood.js';
import { recapAvailability, recapChatVisible, MIN_ACTIVE_DAYS } from '../recap/recapStats.js';
import { showRecap } from '../recap/recapUI.js';
import { buildAnyRecap, weekWindow, rangeLabel, WEEK_MIN_DAYS, YEAR_MIN_DAYS, YEAR_MIN_MONTHS } from '../recap/recapPeriods.js';
import { buildExtra, describeLimit, planHint, answerQuestion, greeting, QUESTIONS, MENUS, menuIntro, topicAnswer, richHtml, evaluateChallenge, hintText, challengeText, badgeText, flavorLine, tailLine, goalDoneText, countDaysInLimit, rankInfo } from './SharkTalk.js';
import { goalCalc, earnedBadges, BADGES, getFlags, markFlag } from './SharkExtra.js';
import { showTweak } from '../utils/tweakSystem.js';
import { EMOTION_INFO } from './texts/emotionInfo.js';
import { runSummary } from './parser/index.js';
import { buildParserContext } from './parser/chatContext.js';
import { routeUtterance, routeResult, cardOf, optionsOf, questionOf, answerClarification, commitIntent, periodQuery, CHAT_MAX, CAT_OTHER, CAT_NEW,
    newCategoryAnswer, EMOJI_GROUPS, suggestEmoji, switchType, createCustomCategory, parseFxRequest, NAV, frequentCategories, routeQuick, parseThemeRequest, pickAnswer,
    parseSharkSettingsRequest, SHARK_OPTIONS, parseBudgetRequest, budgetNameProblem, findBudget, BUDGET_NAME_MAX, isSpendTease, statRequest, periodLabel, incomeRequest, incomeSchedule, SALARY_RE, pluralDays,
    lastRecord, recordLabel, canUndo, averageSpend, biggestSpend, parsePlanRequest, planDraft, chatVocab, fixTypos } from './chatFlow.js';
import { diffDays as dayDiff, addDays as dayAdd } from './parser/dates.js';
import { chatLine, GUIDE_STEPS, callLine, SHARK_SET_LINES, SHARK_SET_SAME, SPEND_TEASE } from './texts/chat.js';
import { matchCommand, smallTalk, matchFaq, matchProject, callKind, latestVersionItem, EXAMPLES } from './chatCommands.js';
import { AKULKA_PROJECTS, AKULKA_PROJECTS_INFO } from '../../constants/akulka-projects.js';
import { FAQ_ITEMS } from '../../constants/faq-constants.js';
import { THEMES, setTheme, getSavedTheme } from '../ThemeManager.js';
import { getThemeTokens } from '../theme/themeTokens.js';
import { expenseCategories, incomeCategories } from '../../constants/index.js';

const MOOD_TO_ATTR = { new: 'new', ok: 'ok', tense: 'warn', angry: 'bad', proud: 'proud' };
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const digits = s => String(s || '').replace(/\D/g, '');
const group = s => digits(s).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

// Смена картинки: короткое «растворение» старой и проявление новой (без анимации при reduced-motion и пока картинка не показана)
function setSharkImg(img, key) {
    if (!img) return;
    const src = sharkImage(key);
    if (img.getAttribute('src') === src) return;
    img.onerror = () => { img.onerror = null; img.src = sharkImage('ok'); };
    const calm = !img.getAttribute('src') || !img.isConnected || !img.offsetParent
        || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (calm) { img.src = src; return; }
    const id = (img._swap = (img._swap || 0) + 1);
    const pre = new Image();
    const go = () => {
        if (img._swap !== id) return;
        img.style.transition = 'opacity .14s ease';
        img.style.opacity = '0';
        setTimeout(() => {
            if (img._swap !== id) return;
            img.src = src;
            requestAnimationFrame(() => { img.style.opacity = ''; });
            setTimeout(() => { if (img._swap === id) img.style.transition = ''; }, 200);
        }, 150);
    };
    pre.onload = pre.onerror = go;
    pre.src = src;
}

// Эмоция Акулки в ответах чата (остальные — по текущему настроению карточки)
const CHAT_EMOTION = {
    today: 'think', whatif: 'think', week: 'count-cold', topcat: 'count-cold', limit: 'idea', fact: 'smart',
    cheer: 'laugh', joke: 'cheeky', left: 'count-happy', goalnew: 'idea', goaldone: 'celebrate'
};

// Картинки-заглушки в разметке: <img data-shark-emotion="welcome"> получает файл выбранной Акулки
export function applyStaticSharkImages(root = document) {
    root.querySelectorAll('img[data-shark-emotion]').forEach(img => setSharkImg(img, img.dataset.sharkEmotion));
}

// Выбранная Акулка для окон подтверждения (удаление, очистка данных): картинка идёт через CSS-переменную
export function applySharkTheme() {
    try {
        const root = document.documentElement;
        const st = getSharkSettings();
        root.dataset.shark = st.shark;
        const abs = new URL(sharkImage('think', st.shark), document.baseURI).href;
        root.style.setProperty('--shark-modal', `url("${abs}")`);
    } catch (e) { /* ignore */ }
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
        applyStaticSharkImages();
        applySharkTheme();
        this.refreshCard();
        document.addEventListener('visibilitychange', () => { if (!document.hidden) this.refreshCard(); });
        try { this.watchCardVisibility(); } catch (e) { /* ignore */ }
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

    // ───── экономия ресурсов: анимации карточки только пока она видна ─────
    watchCardVisibility() {
        const cards = [...document.querySelectorAll('.akulka-card')];
        if (!cards.length) return;
        const state = new Map(cards.map(c => [c, true]));
        const apply = () => cards.forEach(c => c.classList.toggle('ak-paused', document.hidden || !state.get(c)));
        if ('IntersectionObserver' in window) {
            const io = new IntersectionObserver(entries => {
                entries.forEach(e => state.set(e.target, e.isIntersecting));
                apply();
            }, { threshold: 0.05 });
            cards.forEach(c => io.observe(c));
        }
        document.addEventListener('visibilitychange', apply);
        apply();
    }

    // ───── действия на карточке ─────
    initCardActions() {
        // весь блок Акулки на главной открывает чат; лимит меняется только в настройках Акулки
        document.addEventListener('click', e => {
            if (e.target.closest('#shark-nospend-btn')) { this.markNoSpendToday(); return; }
            if (e.target.closest('#akulka-card')) { this.openChat(); return; }
            if (e.target.closest('#shark-fab')) { this.openChat({ compact: true }); return; }
            if (e.target.closest('#shark-limit-open')) this.openLimitSheet();
            if (e.target.closest('#shark-ask-btn')) this.openChat();
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
            document.querySelectorAll('#shark-which-seg button').forEach(b => {
                const on = b.dataset.shark === st.shark;
                b.classList.toggle('is-active', on);
                const chk = b.querySelector('.set-check');
                if (chk) chk.textContent = on ? '✓' : '';
            });
            const map = { 'shark-opt-reactions': 'reactions', 'shark-opt-vibration': 'vibration', 'shark-opt-quiet': 'quietHours', 'shark-opt-tip': 'dailyTip', 'shark-opt-rude': 'rude' };
            Object.entries(map).forEach(([id, key]) => { const el = document.getElementById(id); if (el) el.checked = !!st[key]; });
            document.querySelectorAll('.sk-seg[data-desc]').forEach(seg => {
                const on = seg.querySelector('button.is-active');
                const d = document.querySelector(seg.dataset.desc);
                if (d) d.textContent = on?.dataset.descText || '';
            });
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
        document.getElementById('shark-which-seg')?.addEventListener('click', e => {
            const b = e.target.closest('button[data-shark]');
            if (!b) return;
            saveSharkSettings({ shark: b.dataset.shark });
            sync();
            applyStaticSharkImages();
            applySharkTheme();
            this.forceRefresh();
        });
        // Галерея эмоций: рисуем один раз при первом раскрытии
        document.getElementById('shark-gallery')?.addEventListener('toggle', e => {
            const box = document.getElementById('shark-emotions');
            if (!e.target.open || !box || box.childElementCount) return;
            box.innerHTML = EMOTION_INFO.map(([id, name, when]) =>
                `<div class="sk-gal-item"><img src="assets/hoodie/hoodie-${id}.webp" alt="" loading="lazy" decoding="async"><b>${name}</b><small>${when}</small></div>`).join('');
        });
        document.getElementById('shark-talk-seg')?.addEventListener('click', e => {
            const b = e.target.closest('button[data-talk]');
            if (!b) return;
            saveSharkSettings({ talk: b.dataset.talk });
            sync();
            this.forceRefresh();
        });
        const map = { 'shark-opt-reactions': 'reactions', 'shark-opt-vibration': 'vibration', 'shark-opt-quiet': 'quietHours', 'shark-opt-tip': 'dailyTip', 'shark-opt-rude': 'rude' };
        Object.entries(map).forEach(([id, key]) => {
            document.getElementById(id)?.addEventListener('change', e => {
                saveSharkSettings({ [key]: e.target.checked });
                if (key === 'dailyTip' || key === 'rude' || key === 'quietHours') this.forceRefresh();
            });
        });
        sync();
    }

    syncLimitRow() {
        const sub = document.getElementById('shark-limit-sub');
        if (!sub) return;
        try {
            const c = this.context();
            sub.textContent = c.source === 'noplan' ? 'Нет действующего плана — добавь план месяца'
                : c.source === 'plan-empty' ? (c.info?.waiting ? 'Ждём поступление по плану' : 'По плану на оставшиеся дни ничего не остаётся')
                : !c.limit ? 'Пока нет — задай свой или подожди данных'
                : `${fmt(c.limit)} в день · ${c.source === 'custom' ? 'твоя сумма' : c.source === 'plan' ? 'из плана' : 'медиана трат'}`;
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
        const bid = this.pm?.getCurrentBudgetId?.() || budget?.id;
        const status = planStatus(planners, bid, today);
        const planner = status.state === 'active' ? status.planner : null;
        const normalize = c => this.pm?.normalizeCategory?.(c) ?? String(c || '').trim();
        const settings = getSharkSettings();
        const planLimit = planner ? planAverageLimit(this.pm, planner) : 0;
        const planWaiting = planner ? planIncomeWaiting(this.pm, planner) : false;
        const info = getLimitInfo({ transactions, planner, today, settings, normalize, planLimit, planWaiting });
        const spent = getSpentOnDay({ transactions, planner, day: today, normalize });
        return { transactions, planner, planStatus: status, today, normalize, limit: info.limit, source: info.source, info, spent, settings };
    }

    // ───── челлендж (состояние на устройстве) ─────
    loadChallenge() {
        try { return JSON.parse(readScoped('budgetit:shark:challenge') || 'null'); } catch (e) { return null; }
    }

    saveChallenge(state) {
        writeScoped('budgetit:shark:challenge', state || null);
    }

    // ───── цель накопления ─────
    loadGoal() {
        try { return JSON.parse(readScoped('budgetit:shark:goal') || 'null'); } catch (e) { return null; }
    }

    saveGoal(g) {
        writeScoped('budgetit:shark:goal', g || null);
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
        const sig = `${sharkScope()?.id || ''}:${c.today}:${c.transactions.length}:${c.limit}:${Object.keys(flags).join(',')}`;
        if (this._badgeSig === sig && this._badges) return this._badges;
        const days = countDaysInLimit({ transactions: c.transactions, planner: c.planner, limit: c.limit, today: c.today, normalize: c.normalize });
        const earned = earnedBadges({ transactions: c.transactions, daysInLimit: days, rankIdx: rankInfo(days).idx, flags });
        let stored = null;
        try { stored = JSON.parse(readScoped('budgetit:shark:badges') || 'null'); } catch (e) { stored = null; }
        const cur = { ...(stored || {}) };
        const fresh = [...earned].filter(id => !cur[id]);
        fresh.forEach(id => { cur[id] = c.today; });
        if (!stored || fresh.length) writeScoped('budgetit:shark:badges', cur);
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
            overStreak: countOverStreak({ transactions: c.transactions, planner: c.planner, limit: c.limit, today: c.today, normalize: c.normalize }),
            challenge: this.challengeNow(c),
            planStatus: c.planStatus,
            talk: c.settings.talk, goalState: this.loadGoal(), goal: this.goalNow(c), badges: [...this.badgesNow(c)],
            backupNudgeLast: (() => { try { return localStorage.getItem('budgetit:shark:backupNudge'); } catch (e) { return null; } })()
        };
    }

    // ───── карточка ─────
    refreshCard() {
        const card = document.getElementById('akulka-card');
        if (!card) return;
        const c = this.context();
        syncNoSpend(c.transactions); // трата в отмеченный день снимает отметку
        const nsOffer = canMarkNoSpend({ transactions: c.transactions, today: c.today, now: new Date() });
        const tctx = this.talkContext(c);
        const mood = computeCard({
            spent: c.spent, limit: c.limit, character: c.settings.character,
            hasData: c.transactions.length > 0, streak: tctx.streak,
            hasToday: c.transactions.some(t => t.date === c.today),
            quietHours: c.settings.quietHours, rude: c.settings.rude, source: c.source,
            prevEmotion: card.dataset.base || null, overStreak: tctx.overStreak
        }, { now: tctx.now, today: c.today });
        // Реакция на только что сохранённую операцию: картинка на несколько секунд меняется, потом возвращается к базовой эмоции
        const reacting = this.reaction && Date.now() < this.reaction.until;
        const baseEmotion = mood.emotion;
        if (reacting) mood.emotion = this.reaction.emotion;
        else this.reaction = null;
        // Режим «По плану», а плана нет — вместо знакомства подсказываем, что добавить
        if (c.source === 'noplan' || c.source === 'plan-empty') {
            mood.text = planHint({ source: c.source, status: c.planStatus, character: c.settings.character, waiting: c.info?.waiting });
        }
        const extra = c.settings.dailyTip ? buildExtra(tctx) : null;
        if (extra?.kind === 'backup' && tctx.backupNudgeLast !== c.today) { try { localStorage.setItem('budgetit:shark:backupNudge', c.today); } catch (e) { /* ignore */ } }
        // антиповтор текста: не перерисовываем карточку, если настроение и числа не менялись
        const sig = `${sharkScope()?.id || ''}:${mood.key}:${mood.emotion}:${reacting ? 'r' : ''}:${c.settings.shark}:${c.spent}:${c.limit}:${c.source}:${c.planStatus?.state}:${c.settings.character}:${Math.floor(Date.now() / 1800000)}:${extra?.kind || ''}:${extra?.text || ''}:${nsOffer ? 'ns' : ''}:${getNoSpendDays().length}`;
        if (card.dataset.sig === sig) return;
        card.dataset.sig = sig;
        this.mood = mood;
        card.dataset.mood = MOOD_TO_ATTR[mood.key] || 'ok';
        card.dataset.state = mood.key;
        const t = document.getElementById('akulka-title');
        const x = document.getElementById('akulka-text');
        const bar = document.getElementById('akulka-bar');
        const ex = document.getElementById('akulka-extra');
        if (t) t.textContent = forShark(mood.title);
        if (x) x.textContent = forShark(mood.text);
        if (bar) bar.style.width = Math.min(100, Math.round(mood.ratio * 100)) + '%';
        if (ex) { ex.textContent = extra ? forShark(extra.text) : ''; ex.hidden = !extra; }
        const nsBtn = document.getElementById('shark-nospend-btn');
        if (nsBtn) nsBtn.hidden = !nsOffer;
        card.dataset.shark = c.settings.shark;
        card.dataset.emotion = mood.emotion;
        card.dataset.base = baseEmotion;
        setSharkImg(document.getElementById('akulka-img'), mood.emotion);
        card.classList.toggle('no-limit', !c.limit);
        this.syncLiveCard(card, mood, extra);
        const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        const bName = this.bm?.getCurrentBudget?.()?.name || '';
        const bChip = document.getElementById('sk-budget');
        if (bChip) { bChip.hidden = !bName; bChip.textContent = bName ? `📒 Считаю по бюджету «${bName}»` : ''; }
        setTxt('sk-st-limit', c.limit ? fmt(c.limit) : '—');
        setTxt('sk-st-spent', fmt(c.spent));
        setTxt('sk-st-streak', String(tctx.streak || 0));
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
        if (t) t.textContent = forShark(mood.title);
        if (x) x.textContent = forShark(mood.text);
        if (b) b.style.width = Math.min(100, Math.round(mood.ratio * 100)) + '%';
        if (ex) { ex.textContent = extra ? forShark(extra.text) : ''; ex.hidden = !extra; }
        live.dataset.shark = card?.dataset.shark || 'hoodie';
        setSharkImg(live.querySelector('img'), mood.emotion || mood.key);
    }

    // ───── «Сегодня без трат» ─────
    markNoSpendToday(fromChat = false) {
        const c = this.context();
        if (!canMarkNoSpend({ transactions: c.transactions, today: c.today, now: new Date() })) return false;
        markNoSpend(c.today);
        const text = noSpendText(c.settings.character);
        if (fromChat) this.reply(esc(text), 380, 'proud');
        else this.showToast({ text, mood: 'proud', emotion: 'proud', color: 'var(--save)' }, c.settings);
        this.forceRefresh();
        if (fromChat) this.renderChips();
        return true;
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
        const isVar = t => isDailySpend(t) && t.date === c.today && !planned.has(c.normalize(t.category || ''));
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
                character: c.settings.character, backdate, first: c.transactions.length === 1, talk: c.settings.talk,
                rude: !!c.settings.rude && c.settings.shark === 'hoodie'
            });
        }
        this.showToast(r, c.settings);
        this.animateCard(r, c.settings);
        this.startReaction(r, c.settings);
        this.refreshCard();
    }

    // Картинка-реакция на карточке: 7 секунд, затем снова эмоция по состоянию дня
    startReaction(r, settings) {
        if (!r?.emotion || r.repeat || isQuietNow(settings)) return;
        this.reaction = { emotion: r.emotion, until: Date.now() + 7000 };
        clearTimeout(this.reactionTimer);
        this.reactionTimer = setTimeout(() => { this.reaction = null; this.refreshCard(); }, 7100);
    }

    showToast(r, settings) {
        const img = sharkImage(r.emotion || r.mood);
        showTweak(
            `<span class="shark-toast" style="--tc:${r.color}"><img src="${img}" alt=""><span>${esc(forShark(r.text))}</span></span>`,
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
            <button type="button" data-mode="auto">Авто</button>
            <button type="button" data-mode="median">Медиана</button>
            <button type="button" data-mode="plan">План</button>
            <button type="button" data-mode="custom">Своя</button>
          </div>
          <div id="sl-auto" class="sl-panel"><div id="sl-explain" class="sl-explain"></div><button type="button" id="sl-plan-btn" class="sc-act" hidden>Добавить план ›</button></div>
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
        sheet.querySelector('#sl-plan-btn').addEventListener('click', () => {
            this.closeSheet('shark-limit-sheet');
            document.getElementById('lnav-planner')?.click();
        });
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
        const view = d.mode === 'median' ? c.info.median : d.mode === 'plan' ? c.info.plan : auto;
        const eff = d.mode === 'custom' ? d.custom : view.limit;
        sheet.querySelectorAll('#sl-seg button').forEach(b => b.classList.toggle('active', b.dataset.mode === d.mode));
        sheet.querySelector('#sl-auto').hidden = d.mode === 'custom';
        sheet.querySelector('#sl-custom').hidden = d.mode !== 'custom';
        sheet.querySelector('#sl-num').textContent = eff ? fmt(eff) : '—';
        const planName = c.planner?.name ? ` «${c.planner.name}»` : '';
        sheet.querySelector('#sl-sub').textContent = d.mode === 'custom'
            ? 'в день · твоя сумма'
            : view.source === 'plan' ? `в день · из плана${planName}`
            : view.source === 'median' ? `в день · медиана трат за 30 дней`
            : view.source === 'noplan' ? 'нет действующего плана'
            : view.source === 'plan-empty' ? (view.waiting ? 'ждём поступление по плану' : 'по плану ничего не остаётся')
            : 'пока недостаточно данных';
        sheet.querySelector('#sl-explain').innerHTML = describeLimit({
            info: { ...view, auto, plan: c.info.plan, median: c.info.median }, planner: c.planner, character: c.settings.character, status: c.planStatus
        }).map(l => `<p>${esc(l)}</p>`).join('');
        const needPlan = d.mode !== 'custom' && (view.source === 'noplan' || view.source === 'plan-empty');
        const pb = sheet.querySelector('#sl-plan-btn');
        pb.hidden = !needPlan;
        pb.textContent = view.source === 'plan-empty' ? 'Открыть план ›' : 'Добавить план ›';
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
          <div class="sheet-title-row"><h2>Спросить Акулку<small id="sc-budget" class="sc-budget"></small></h2><button type="button" class="sheet-x" id="sc-x" aria-label="Закрыть">✕</button></div>
          <div id="sc-log" class="sc-log" aria-live="polite"></div>
          <form id="sc-form" class="sc-form" hidden autocomplete="off"><input id="sc-amount" inputmode="numeric" placeholder="Сумма, например 50 000" maxlength="14"><button type="submit">Посчитать</button></form>
          <form id="sc-goal" class="sc-form sc-form-goal" hidden autocomplete="off"><input id="sc-goal-sum" inputmode="numeric" placeholder="Сумма цели" maxlength="14"><input id="sc-goal-date" type="date" aria-label="Дата цели"><button type="submit">Поставить</button></form>
          <div id="sc-quick" class="sc-quick" role="group" aria-label="Частые категории" hidden></div>
          <form id="sc-say" class="sc-form sc-form-say" autocomplete="off"><input id="sc-say-input" type="text" enterkeyhint="send" maxlength="${CHAT_MAX}" aria-label="Написать Акульке" placeholder="Например: вчера такси 45к"><button type="button" id="sc-manual" class="sc-manual" aria-label="Ввести вручную" title="Ввести вручную"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L18.5 9.5a2.12 2.12 0 0 0-3-3L5 17v3z"/><path d="m14 8 2.5 2.5"/><path d="M13 20h7"/></svg></button><button type="submit" id="sc-say-send" aria-label="Отправить" disabled><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg></button></form>
          <div id="sc-chips" class="sc-chips"></div>`;
        document.body.appendChild(sheet);
        sheet.querySelector('#sc-say').addEventListener('submit', e => {
            e.preventDefault();
            const inp = sheet.querySelector('#sc-say-input');
            const v = inp.value;
            inp.value = '';
            this.syncSend();
            this.say(v);
        });
        sheet.querySelector('#sc-say-input').addEventListener('input', () => this.syncSend());
        sheet.querySelector('#sc-manual').addEventListener('click', () => this.runAction('add'));
        this.watchChatKeyboard(sheet);
        sheet.querySelector('#sc-x').addEventListener('click', () => this.closeSheet('shark-chat-sheet'));
        sheet.querySelector('#sc-quick').addEventListener('click', e => {
            if (e.target.closest('[data-import]')) { this.runAction('import'); return; }
            const b = e.target.closest('[data-quick]');
            if (b) this.quickStart(+b.dataset.quick);
        });
        sheet.querySelector('#sc-chips').addEventListener('click', e => {
            const b = e.target.closest('button');
            if (!b) return;
            if (b.dataset.q) this.ask(b.dataset.q, b.textContent);
            else if (b.dataset.menu) this.openMenu(b.dataset.menu, b.textContent);
            else if (b.dataset.topic) this.openTopic(b.dataset.topic, b.textContent);
            else if (b.dataset.back !== undefined) this.backToMain();
        });
        sheet.querySelector('#sc-log').addEventListener('click', e => {
            const mb = e.target.closest('[data-mem-swap]');
            if (mb) { this.swapMemory(mb.dataset.memSwap); return; }
            const pyes = e.target.closest('[data-plan-yes],[data-plan-no],[data-plan-form]');
            if (pyes) { this.planCommit(pyes); return; }
            if (e.target.closest('[data-plan-new]')) { this.runAction('planNew'); return; }
            const pedit = e.target.closest('[data-plan-edit]');
            if (pedit) { this.runAction('planEdit', pedit.dataset.planEdit); return; }
            const bgo = e.target.closest('[data-budget-go]');
            if (bgo) { const i = this.budgetIndexOf(bgo.dataset.budgetGo); if (i >= 0) this.switchBudgetTo(i); return; }
            if (e.target.closest('[data-budget-new]')) { this.runAction('budgetNew'); return; }
            if (e.target.closest('[data-budget-list]')) { this.reply(`<p>${esc(chatLine('budgetPick', this.context().settings.character))}</p>${this.budgetListHtml()}`, 250); return; }
            const sob = e.target.closest('[data-shark-opt]');
            if (sob) { const [k, v] = sob.dataset.sharkOpt.split(':'); this.applySharkSetting(k, v); return; }
            const tsb = e.target.closest('[data-theme-set]');
            if (tsb) { this.themeSet(tsb.dataset.themeSet); return; }
            if (e.target.closest('[data-theme-pick]')) { this.reply(this.themePickHtml(), 250); return; }
            const tb = e.target.closest('[data-type-swap]');
            if (tb) { this.swapType(tb.dataset.typeSwap); return; }
            if (e.target.closest('[data-newcat]')) { this.openNewCategory('', { standalone: true }); return; }
            const qa = e.target.closest('[data-quick-amt]');
            if (qa) { if (this.chatQuick) this.say(fmt(Number(qa.dataset.quickAmt))); return; }
            const ub = e.target.closest('[data-undo-yes],[data-undo-no]');
            if (ub) { this.undoAction(ub); return; }
            const sb = e.target.closest('[data-say-ex],[data-say-yes],[data-say-edit],[data-say-cancel],[data-say-opt],[data-say-no]');
            if (sb) { this.sayAction(sb); return; }
            const qb =e.target.closest('.sc-act[data-q]');
            if (qb) { this.ask(qb.dataset.q, qb.textContent); return; }
            const act = e.target.closest('[data-act]');
            if (act) { this.runAction(act.dataset.act, act.dataset.amt); return; }
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

    // «Отправить» неактивна, пока в поле пусто (вызывать и после программной записи в поле)
    syncSend() {
        const inp = document.getElementById('sc-say-input');
        const btn = document.getElementById('sc-say-send');
        if (inp && btn) btn.disabled = !inp.value.trim();
    }

    // Экранная клавиатура: поднимаем шторку над ней и ужимаем ленту (visualViewport; без него ничего не делаем)
    watchChatKeyboard(sheet) {
        const vv = window.visualViewport;
        if (!vv) return;
        const update = () => {
            const open = !sheet.classList.contains('hidden') && document.activeElement?.closest?.('#shark-chat-sheet form');
            const kb = open ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
            sheet.style.setProperty('--sc-kb', `${kb}px`);
            sheet.style.setProperty('--sc-vh', `${Math.round(vv.height)}px`);
            sheet.classList.toggle('sc-kb-open', kb > 80);
            if (kb > 80) { const log = sheet.querySelector('#sc-log'); if (log) log.scrollTop = log.scrollHeight; }
        };
        vv.addEventListener('resize', update);
        vv.addEventListener('scroll', update);
        sheet.addEventListener('focusin', () => setTimeout(update, 60));
        sheet.addEventListener('focusout', () => setTimeout(update, 60));
    }

    bubble(who, html, emotion = null) {
        const log = document.getElementById('sc-log');
        // сообщение с опечаткой: под ним — как Акулка его поняла
        if (who === 'user' && this.typoNote) { html += `<small class="sc-typo">✎ ${esc(this.typoNote)}</small>`; this.typoNote = null; }
        const mood = emotion || this.mood?.emotion || this.mood?.key || 'ok';
        const el = document.createElement('div');
        el.className = `sc-msg ${who}`;
        el.innerHTML = who === 'shark'
            ? `<img src="${sharkImage(mood)}" alt=""><div class="sc-bub">${forShark(html)}</div>`
            : `<div class="sc-bub">${html}</div>`;
        log.appendChild(el);
        log.scrollTop = log.scrollHeight;
        return el;
    }

    // ───── свободный ввод: «вчера такси 45к» ─────
    parserCtx() {
        return buildParserContext({
            expense: expenseCategories, income: incomeCategories, custom: this.bm.customCategories,
            transactions: this.context().transactions, now: new Date()
        });
    }

    say(raw, { value = null, shown = null } = {}) {
        const text = String(raw || '').trim().slice(0, CHAT_MAX);
        if (!text) return;
        // пока ждём категорию, набранное слово — это ответ («фрукты»), а не команда
        const waitsCategory = this.chatClar?.result?.needsClarification?.field === 'category';
        let cmd = value === null && !waitsCategory ? matchCommand(text) : null;
        if (cmd && periodQuery(text, this.parserCtx())) cmd = null;
        if (value === CAT_OTHER && this.chatClar) {
            this.bubble('user', esc(shown ?? text));
            this.reply('<p>Напиши название категории: найду похожую или предложу создать свою.</p>', 250);
            this.focusSay();
            return;
        }
        // чипс частой категории ждёт сумму: «45к», «вчера 30к до работы» — записываем в эту категорию
        const quick = this.chatQuick;
        this.chatQuick = null;
        if (quick && value === null && !this.chatClar && /\d/.test(text)) {
            this.bubble('user', esc(text));
            try { this.present(routeQuick(text, quick, this.parserCtx()), text); } catch (err) { this.reply(`<p>${esc(chatLine('error', this.context().settings.character))}</p>`); }
            return;
        }
        // кто отвечает: тема, валюта, «Вопросы и ответы», продукт, команда или разбор фразы (порядок — chatFlow.pickAnswer)
        const free = value === null && !waitsCategory;
        const pickFor = (t, c) => pickAnswer({
            cmd: c,
            call: free ? callKind(text) || (t !== text ? callKind(t) : null) : null,   // «Акууулка» — по исходному тексту: растянутое имя = крик; «ак улка» — по исправленному
            shark: free ? parseSharkSettingsRequest(t) : null,
            budget: free ? parseBudgetRequest(t, this.bm.budgets || []) : null,
            plan: free ? parsePlanRequest(t, isoDay()) : null,
            tease: free && isSpendTease(t),
            stat: free ? statRequest(t, isoDay()) : null,
            income: free ? incomeRequest(t, this.incomeCats()) : null,
            theme: free ? parseThemeRequest(t, THEMES) : null,
            fx: free ? parseFxRequest(t, this.fxBase()) : null,
            faq: free ? matchFaq(t, FAQ_ITEMS) : null,
            project: free ? matchProject(t, AKULKA_PROJECTS) : null
        });
        let pick = pickFor(text, cmd);
        // опечатки с телефона («мой пла н», «смени бюджетт», «когда зарплта»): если исходная фраза не понята
        // или поймана только приблизительным совпадением команды — пробуем исправленную
        let fixed = text;
        try { fixed = free || (value === null && this.chatClar) ? fixTypos(text, this.typoVocab()) : text; } catch (e) { fixed = text; }
        let used = text;
        // «смени тему на светлю»: исходная поняла только «выбрать тему», исправленная — конкретную; берём точнее
        const vague = pick.kind === 'parse' || pick.kind === 'command' || pick.value?.kind === 'pick' || pick.value?.kind === 'show';
        if (free && fixed !== text && vague) {
            let c2 = matchCommand(fixed);
            if (c2 && periodQuery(fixed, this.parserCtx())) c2 = null;
            const pf = pickFor(fixed, c2);
            const same = pf.kind === pick.kind && JSON.stringify(pf.value) === JSON.stringify(pick.value);
            const vaguer = pick.value?.kind === 'pick' || pick.value?.kind === 'show' ? pf.kind === pick.kind && pf.value?.kind !== pick.value?.kind : true;
            if (pf.kind !== 'parse' && !same && vaguer) { pick = pf; used = fixed; }
            else if (pf.kind === 'parse' && pick.kind === 'command') { pick = pf; used = fixed; }
        }
        this.typoNote = used !== text ? used : null;
        if (pick.kind !== 'parse') {
            this.chatClar = null;
            if (pick.kind === 'command') { this.runCommand(pick.value, text); this.typoNote = null; return; }
            this.bubble('user', esc(text));
            if (pick.kind === 'call') this.callAnswer(pick.value === 'shout');
            else if (pick.kind === 'shark') this.sharkSettingsAnswer(pick.value);
            else if (pick.kind === 'budget') this.budgetAnswer(pick.value);
            else if (pick.kind === 'plan') this.planAnswer(pick.value);
            else if (pick.kind === 'tease') this.teaseAnswer();
            else if (pick.kind === 'stat') this.reply(this.recordHtml(pick.value.id, pick.value.period), 350);
            else if (pick.kind === 'income') this.reply(this.incomeHtml(pick.value), 350);
            else if (pick.kind === 'theme') this.themeAnswer(pick.value);
            else if (pick.kind === 'fx') this.reply(this.fxHtml(pick.value), 400);
            else if (pick.kind === 'faq') this.reply(this.faqHtml(pick.value), 450);
            else this.reply(this.projectHtml(pick.value), 350);
            this.typoNote = null;
            return;
        }
        const pend = this.chatClar;
        this.chatClar = null;
        try {
            if (pend) {
                // ответ на уточнение («фруктыы»): исправленное слово, если исходное не подошло
                const ans = value ?? (fixed !== text ? fixed : text);
                this.typoNote = value === null && ans !== text ? ans : null;
                this.bubble('user', esc(shown ?? text));
                const a = answerClarification(pend.result, ans, pend.orig, this.parserCtx());
                if (a.kind === 'result') { this.present(routeResult(a.result), pend.orig); return; }
                this.present(routeUtterance(a.text, this.parserCtx()), a.text);
                return;
            }
            const ctx = this.parserCtx();
            let route = routeUtterance(used, ctx);
            // запись или вопрос с опечаткой: исправленный вариант — только если исходный не разобрался или не нашёл категорию
            if (used === text && fixed !== text) {
                const weak = r => r.branch === 'unparsed' || (r.branch === 'clarify' && r.clarification?.field === 'category') || (r.branch === 'summary' && r.intent?.flags?.includes('name_match'));
                if (weak(route)) {
                    const r2 = routeUtterance(fixed, ctx);
                    if (!weak(r2)) { route = r2; used = fixed; }
                }
            }
            this.typoNote = used !== text ? used : null;
            this.bubble('user', esc(shown ?? text));
            this.present(route, used);
        } catch (err) {
            if (!document.querySelector('#sc-log .sc-msg.user:last-child')) this.bubble('user', esc(shown ?? text));
            this.reply(`<p>${esc(chatLine('error', this.context().settings.character))}</p>`);
        }
    }

    // словарь для опечаток: команды и разборы + названия категорий, бюджетов, вопросов (их не «исправляем»)
    typoVocab() {
        const flat = list => (list || []).flatMap(x => (typeof x === 'string' ? [x] : x?.options || []));
        const cc = this.bm.customCategories || {};
        const key = `${JSON.stringify(cc)}|${(this.bm.budgets || []).map(b => b.name).join('|')}`;
        if (this.typoCache?.key === key) return this.typoCache.vocab;
        const extra = [...flat(expenseCategories), ...flat(incomeCategories), ...(cc.expense || []), ...(cc.income || []),
            ...(this.bm.budgets || []).map(b => b.name), ...FAQ_ITEMS.map(i => i.question), ...AKULKA_PROJECTS.map(p => p.name),
            ...(this.bm.getCurrentBudget()?.transactions || []).slice(-300).map(t => t.category).filter(Boolean)];
        const vocab = chatVocab(extra);
        this.typoCache = { key, vocab };
        return vocab;
    }

    // ───── валюты в чате ─────
    fxBase() {
        try { return { UZ: 'UZS', RU: 'RUB', KZ: 'KZT', KG: 'KGS' }[localStorage.getItem('region') || 'UZ'] || 'UZS'; } catch (e) { return 'UZS'; }
    }

    fxHtml(req) {
        const ch = this.context().settings.character;
        const fx = window.BudgetItFx;
        const snap = fx?.snapshot?.();
        const L = (k, v = {}) => `<p>${esc(chatLine(k, ch, v))}</p>`;
        const openBtn = '<button type="button" class="sc-act" data-act="fx">💱 Открыть курсы ›</button>';
        if (!snap || !Object.keys(snap.rates || {}).length) { fx?.refresh?.(); return L('fxNone') + openBtn; }
        const sym = c => snap.symbols?.[c] || c;
        const flag = c => fx.flagOf?.(c) || '💱';
        const dec = (c, n) => (c === 'UZS' || c === 'KZT' ? 0 : (n > 0 && n < 1 ? 4 : 2));
        const num = (n, d) => new Intl.NumberFormat('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
        const codes = [snap.base, ...snap.codes];
        if (req.kind === 'rates') {
            const list = req.code && snap.codes.includes(req.code) ? [req.code, ...snap.codes.filter(c => c !== req.code)] : snap.codes;
            const when = snap.updatedAt ? new Date(snap.updatedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
            const rows = list.filter(c => snap.rates[c]?.value > 0).map(c => {
                const r = snap.rates[c];
                const s = (snap.series?.[c] || []).filter(v => typeof v === 'number');
                const first = s.length >= 2 ? s[0] : r.prev;
                const d = first > 0 ? (r.value - first) / first * 100 : null;
                const delta = d === null || Math.abs(d) < 0.005 ? '' : `<small class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${num(Math.abs(d), 2)}%</small>`;
                return `<p class="sc-fx-row${c === req.code ? ' is-main' : ''}"><span>${flag(c)} 1 ${esc(sym(c))}</span><b>${num(r.value, 2)} ${esc(sym(snap.base))}</b>${delta}</p>`;
            }).join('');
            const src = `${snap.source ? `${snap.source}` : 'Курсы'}${when ? ` · ${when}` : ''}${snap.offline ? ' · офлайн' : ''}`;
            const ex = ['100$?', `1 млн ${sym(snap.base)} в $`].map(t => `<button type="button" class="sc-act sc-act-alt" data-say-ex="${esc(t)}">«${esc(t)}»</button>`).join('');
            return `<p>${esc(chatLine('fxIntro', ch))}</p><div class="sc-fx">${rows}<p class="sc-fx-src">${esc(src)}</p></div>${L('fxHint')}${ex}${openBtn}`;
        }
        if (!codes.includes(req.from) || !codes.includes(req.to)) return L('fxNoPair', { what: codes.join(', ') }) + openBtn;
        const cb = fx.convert(req.amount, req.from, req.to, 'cb');
        const shop = fx.convert(req.amount, req.from, req.to, 'shop');
        if (cb === null) { fx.refresh?.(); return L('fxNone') + openBtn; }
        let one = fx.convert(1, req.from, req.to, 'cb'), a = req.from, b = req.to;
        if (one !== null && one < 1) { one = fx.convert(1, req.to, req.from, 'cb'); a = req.to; b = req.from; }
        // «⇄ Наоборот»: получившуюся сумму обратно («1 265 040 сум в $»)
        const back = `${num(cb, dec(req.to, cb)).replace(/\s/g, ' ')} ${sym(req.to)} в ${sym(req.from)}`;
        return `<p>${esc(chatLine('fxConv', ch))}</p><div class="sc-fx">
            <p class="sc-fx-main"><span>${flag(req.from)} ${num(req.amount, dec(req.from, req.amount))} ${esc(sym(req.from))}</span><b>≈ ${flag(req.to)} ${num(cb, dec(req.to, cb))} ${esc(sym(req.to))}</b></p>
            <p class="sc-kv"><span>Курс ЦБ</span><b>1 ${esc(sym(a))} = ${num(one, dec(b, one))} ${esc(sym(b))}</b></p>
            ${shop !== null ? `<p class="sc-kv"><span>В обменнике</span><b>≈ ${num(shop, dec(req.to, shop))} ${esc(sym(req.to))}</b></p>` : ''}
            ${snap.offline ? '<p class="sc-fx-src">Курс из последней загрузки (офлайн)</p>' : ''}
          </div><button type="button" class="sc-act sc-act-alt" data-say-ex="${esc(`${back}?`)}">⇄ Наоборот: ${esc(sym(req.to))} → ${esc(sym(req.from))}</button>${openBtn}`;
    }

    // ───── отклик на имя: характер, настроение карточки и болтливость ─────
    callAnswer(shout = false) {
        const st = this.context().settings;
        const mood = ['tense', 'angry', 'proud'].includes(this.mood?.key) ? this.mood.key : 'ok';
        const line = callLine(st.character, mood, st.talk, Math.random(), shout);
        const tail = st.talk === 'chatty' && Math.random() < 0.5 ? `<p class="sc-aside">${esc(tailLine(st.character))}</p>` : '';
        const emo = { ok: 'welcome', tense: 'stern-smile', angry: 'angry', proud: 'proud' }[mood];
        this.reply(`<p>${esc(line)}</p>${tail}`, 300, emo);
        this.focusSay();
    }

    // ───── «Сторисы»: какие итоги есть, что уже можно смотреть, кнопки открытия ─────
    storiesHtml() {
        const c = this.context();
        const ch = c.settings.character;
        const av = recapAvailability(c.transactions, c.today);
        const w = weekWindow(c.today, true);
        const y = Number(c.today.slice(0, 4)) - (c.today.slice(5, 7) === '01' ? 1 : 0);
        const kinds = [
            { kind: 'month', icon: '🎞️', title: `Каким был твой ${av.name}`, sub: 'Месяц как сторис: траты, доходы, рекорды, сравнение с прошлым годом' },
            { kind: 'week', icon: '📅', title: 'Какой была твоя неделя', sub: `Итоги недели${w ? ` · ${rangeLabel(w.from, w.to)}` : ''}: куда ушло, тихие дни, сравнение` },
            { kind: 'year', icon: '🏆', title: `Твой ${y} год`, sub: 'Весь год в одной истории: главные категории, лучшие месяцы, итог' }
        ];
        let missing = false;
        const cards = kinds.map(k => {
            const r = buildAnyRecap(k.kind, c.transactions, c.today, true);
            let foot;
            if (r.ok) foot = `<button type="button" class="sc-act sc-act-primary" data-q="recap:${k.kind}">▶ Смотреть</button>`;
            else {
                missing = true;
                const left = k.kind === 'month' ? av.missingDays : r.missingDays;
                foot = `<p class="sc-aside">${esc(left > 0 ? `Пока мало записей: нужно ещё ${agreeNumbers(`${left} дней`)}` : 'Пока мало записей для этих итогов')}</p>`;
            }
            return `<div class="sc-story${r.ok ? '' : ' is-off'}"><i class="sc-story-ic" aria-hidden="true">${k.icon}</i><div class="sc-story-b"><p class="sc-story-t"><b>${esc(k.title)}</b></p><p class="sc-story-d">${esc(k.sub)}</p>${foot}</div></div>`;
        }).join('');
        const imp = missing ? '<button type="button" class="sc-act" data-act="import">⚡ Догрузить выпиской</button>' : '';
        return `<p>${esc(chatLine('storiesIntro', ch))}</p>${cards}${imp}`;
    }

    // ───── план из чата: карточка, создание и правка с подтверждением; удаление — только в планировщике ─────
    planTarget() {
        const st = this.context().planStatus;
        return st && (st.state === 'active' || st.state === 'upcoming') ? st.planner : null;
    }

    planAnswer(req) {
        const c = this.context();
        const ch = c.settings.character;
        const L = (k, v = {}) => `<p>${esc(chatLine(k, ch, v))}</p>`;
        const openBtn = '<button type="button" class="sc-act" data-act="planner">🗓️ Открыть планировщик</button>';
        if (req.kind === 'show') { this.reply(this.planCardHtml(), 350); return; }
        if (req.kind === 'open') { this.reply(L('planOpen'), 250); setTimeout(() => this.runAction('planner'), 700); return; }
        if (req.kind === 'delete') { this.reply(L('planDelete') + openBtn, 350, 'stern-smile'); return; }
        if (req.kind === 'edit') {
            const p = this.planTarget();
            if (!p) { this.reply(L('planNoneEdit') + this.planCardHtml(true), 300); return; }
            this.reply(L('planEditOpen', { name: p.name }), 250);
            setTimeout(() => this.runAction('planEdit', p.id), 700);
            return;
        }
        if (req.kind === 'create') {
            if (!req.days && !req.amount && !req.start) { this.reply(L('planCreateOpen'), 250); setTimeout(() => this.runAction('planNew'), 700); return; }
            const draft = planDraft({ days: req.days, amount: req.amount, start: req.start, today: c.today });
            this.planPending = { kind: 'create', payload: draft, token: String(Date.now()) };
            const now = this.planTarget();
            const warn = now && c.planStatus.state === 'active' && draft.startDate <= (now.endDate || now.startDate)
                ? `<p class="sc-aside">${esc(`Сейчас действует «${now.name}» до ${this.planDm(now.endDate)}. Новый план станет действующим, потому что начинается позже.`)}</p>` : '';
            this.reply(L('planConfirmCreate') + this.planDraftHtml(draft) + warn + this.planConfirmBtns(true), 350);
            return;
        }
        if (req.kind === 'update') {
            const p = this.planTarget();
            if (!p) { this.reply(L('planNoneEdit') + this.planCardHtml(true), 300); return; }
            const patch = {};
            const rows = [];
            if (req.days || req.addDays) {
                const days = Math.max(1, Math.min(366, req.addDays ? p.periodDays + req.addDays : req.days));
                patch.periodDays = days;
                rows.push(['Длительность', `${pluralDays(p.periodDays)} → ${pluralDays(days)}`], ['Конец', `${this.planDm(p.endDate)} → ${this.planDm(dayAdd(p.startDate, days - 1))}`]);
            }
            if (req.amount) {
                patch.incomePlan = { amount: req.amount };
                rows.push(['Поступление', `${fmt(Number(p.incomePlan?.amount) || 0)} → ${fmt(req.amount)}`]);
            }
            this.planPending = { kind: 'update', id: p.id, payload: patch, token: String(Date.now()) };
            this.reply(L('planConfirmUpdate', { name: p.name }) + rows.map(([k, v]) => `<p class="sc-kv"><span>${esc(k)}</span><b>${esc(v)}</b></p>`).join('') + this.planConfirmBtns(false), 350);
        }
    }

    planDm(x) { return x ? `${x.slice(8, 10)}.${x.slice(5, 7)}` : ''; }

    planConfirmBtns(isNew) {
        const t = esc(this.planPending.token);
        return `<div class="sc-card-act" data-plan-act="${t}"><button type="button" class="sc-act sc-act-primary" data-plan-yes="${t}">✓ ${isNew ? 'Создать план' : 'Сохранить'}</button>` +
            (isNew ? `<button type="button" class="sc-act" data-plan-form="${t}">✏️ Заполнить в форме</button>` : '') +
            `<button type="button" class="sc-act" data-plan-no="${t}">✖ Отмена</button></div>`;
    }

    planDraftHtml(d) {
        const kv = (k, v) => `<p class="sc-kv"><span>${esc(k)}</span><b>${esc(v)}</b></p>`;
        return kv('Название', d.name) + kv('Период', `${this.planDm(d.startDate)}–${this.planDm(dayAdd(d.startDate, d.periodDays - 1))} · ${pluralDays(d.periodDays)}`) +
            kv('Поступление', d.incomePlan.amount ? `${fmt(d.incomePlan.amount)} · ${d.incomePlan.category}` : `по факту · ${d.incomePlan.category}`) +
            `<p class="sc-aside">${esc('Обязательные и регулярные траты добавишь в форме плана, кнопкой «Редактировать».')}</p>`;
    }

    // подтверждение черновика: только по кнопке и только тот черновик, что показан
    planCommit(b) {
        const box = b.closest('[data-plan-act]');
        const pend = this.planPending;
        if (!box || box.dataset.done) return;
        const ch = this.context().settings.character;
        const L = (k, v = {}) => `<p>${esc(chatLine(k, ch, v))}</p>`;
        const token = b.dataset.planYes || b.dataset.planNo || b.dataset.planForm;
        if (!pend || pend.token !== token) { box.dataset.done = '1'; box.innerHTML = '<p class="sc-aside">Устарело</p>'; return; }
        box.dataset.done = '1';
        this.planPending = null;
        if (b.hasAttribute('data-plan-no')) { box.innerHTML = '<p class="sc-aside">Отменено</p>'; this.reply(L('planCancel'), 250); return; }
        if (b.hasAttribute('data-plan-form')) { box.innerHTML = '<p class="sc-aside">Открываю форму</p>'; this.runAction('planNew', pend.payload); return; }
        const res = pend.kind === 'create' ? this.pm.createPlanner(pend.payload) : this.pm.updatePlanner(pend.id, pend.payload);
        if (!res?.ok) {
            box.innerHTML = '<p class="sc-aside">Не сохранено</p>';
            const err = Object.values(res?.errors || {})[0] || 'проверь данные';
            this.reply(L('planError', { what: String(err) }), 300);
            return;
        }
        box.innerHTML = `<p class="sc-aside">${pend.kind === 'create' ? 'Создано ✓' : 'Сохранено ✓'}</p>`;
        if (typeof window.trackSafe === 'function') window.trackSafe(pend.kind === 'create' ? 'planner-create' : 'planner-update', { from: 'shark' });
        this.forceRefresh?.();
        const pg = window._budgetPlannerRef?.plannerPage;
        if (pg?.page && !pg.page.classList.contains('hidden')) pg.render?.();
        this.reply(L(pend.kind === 'create' ? 'planCreated' : 'planUpdated', { name: res.planner?.name || '' }) + this.planCardHtml(), 350, 'proud');
    }

    /** Карточка плана: действующий, будущий, завершённый или «плана нет» */
    planCardHtml(noIntro = false) {
        const c = this.context();
        const ch = c.settings.character;
        const L = (k, v = {}) => (noIntro ? '' : `<p>${esc(chatLine(k, ch, v))}</p>`);
        const kv = (k, v, warn = false) => `<p class="sc-kv${warn ? ' is-warn' : ''}"><span>${esc(k)}</span><b>${esc(v)}</b></p>`;
        const openBtn = '<button type="button" class="sc-act" data-act="planner">🗓️ Открыть планировщик</button>';
        const newBtn = '<button type="button" class="sc-act sc-act-primary" data-plan-new>➕ Создать план</button>';
        const st = c.planStatus || { state: 'none' };
        if (st.state === 'none' || !st.planner) {
            return (noIntro ? '' : `<p>${esc(chatLine('planNone', ch))}</p>`) + newBtn +
                '<button type="button" class="sc-act sc-act-alt" data-say-ex="создай план на 15 дней 10 млн">«создай план на 15 дней 10 млн»</button>' + openBtn;
        }
        const p = st.planner;
        const editBtn = `<button type="button" class="sc-act sc-act-primary" data-plan-edit="${esc(p.id)}">✏️ Редактировать</button>`;
        let s = null;
        try { s = this.pm?.calculatePlannerProjection?.(p.id)?.summary || null; } catch (e) { s = null; }
        const range = `${this.planDm(p.startDate)}–${this.planDm(p.endDate)}`;
        if (!s) return L('planActive', { name: p.name }) + editBtn + openBtn;
        const limit = Math.max(0, Math.floor(s.dailyLimit || 0));
        const income = s.incomeReceived > 0
            ? (s.incomeExpected > 0 ? `получено ${fmt(Math.floor(s.incomeReceived))}, ждём ${fmt(Math.floor(s.incomeExpected))}` : `получено ${fmt(Math.floor(s.incomeReceived))}`)
            : s.incomeByFact ? 'ждём, по факту'
            : s.incomeOverdue ? `${fmt(Math.floor(s.incomeAmount))} · дата прошла (${this.planDm(s.incomePlanDate)})`
            : `${fmt(Math.floor(s.incomeAmount))} · ${this.planDm(s.incomePlanDate)}`;
        // «8 886 221 из плана 1 200 000»; без запланированных трат — просто факт
        const factOf = x => `${fmt(Math.floor(x.totalFactExpense || 0))}${x.totalPlannedExpense > 0 ? ` из плана ${fmt(Math.floor(x.totalPlannedExpense))}` : ''}`;
        const hero = (label, sub) => `<div class="sc-plan-hero"><small>${esc(label)}</small><b>${esc(fmt(limit))}</b><span>${esc(sub)}</span></div>`;
        if (st.state === 'active') {
            const day = dayDiff(c.today, p.startDate) + 1;
            const spent = Math.floor(Number(c.spent) || 0);
            const left = limit - spent;
            const rem = Math.floor(s.remainingBudget || 0);
            return L('planActive', { name: p.name }) +
                hero('Лимит в день', `«${p.name}» · ${range} · день ${day} из ${p.periodDays}`) +
                kv('Сегодня потрачено', fmt(spent)) +
                (left >= 0 ? kv('Можно ещё сегодня', fmt(left)) : kv('Сегодня сверх лимита', fmt(-left), true)) +
                kv('Осталось по плану', `${fmt(Math.max(0, rem))} на ${pluralDays(s.remainingDays || 0)}`, rem < 0) +
                kv('Поступление', income, !!s.incomeOverdue && !(s.incomeReceived > 0)) +
                kv('Потрачено за период', factOf(s)) +
                kv('Остаток на конец', fmt(Math.floor(s.finalBalance || 0)), (s.finalBalance || 0) < 0) +
                editBtn + openBtn;
        }
        if (st.state === 'upcoming') {
            const n = dayDiff(p.startDate, c.today);
            return L('planUpcoming', { name: p.name, n: pluralDays(n), date: this.planDm(p.startDate) }) +
                hero('Лимит в день будет', `«${p.name}» · ${range} · ${pluralDays(p.periodDays)}`) +
                kv('Поступление', income) +
                kv('Запланировано трат', fmt(Math.floor(s.totalPlannedExpense || 0))) +
                kv('Остаток на конец', fmt(Math.floor(s.finalBalance || 0)), (s.finalBalance || 0) < 0) +
                editBtn + openBtn;
        }
        // завершён
        return L('planEnded', { name: p.name, date: this.planDm(p.endDate) }) +
            kv('Период', `${range} · ${pluralDays(p.periodDays)}`) +
            kv('Потрачено', factOf(s)) +
            kv('Итоговый остаток', fmt(Math.floor(s.finalBalance || 0)), (s.finalBalance || 0) < 0) +
            newBtn + openBtn;
    }

    // ───── «потише с тратами!» — Акулка отшучивается ─────
    teaseAnswer() {
        const ch = this.context().settings.character;
        const list = SPEND_TEASE[ch] || SPEND_TEASE.normal;
        const line = list[Math.floor(Math.random() * list.length)];
        this.reply(`<p>${esc(line)}</p><button type="button" class="sc-act" data-act="limit">📏 Дневной лимит</button><button type="button" class="sc-act" data-q="topcat">📊 Куда уходят деньги</button>`, 300, 'laugh');
    }

    // ───── бюджеты из чата: создать, сменить; удаление — только вручную, с предупреждением ─────
    budgetAnswer(req) {
        const ch = this.context().settings.character;
        const L = (k, v = {}) => `<p>${esc(chatLine(k, ch, v))}</p>`;
        const budgets = this.bm.budgets || [];
        if (req.kind === 'delete') {
            this.reply(L('budgetDelete') + '<button type="button" class="sc-act sc-act-primary" data-act="data">💾 Сделать бэкап</button><button type="button" class="sc-act" data-budget-list>📂 Мои бюджеты</button>', 350, 'stern-smile');
            return;
        }
        if (req.kind === 'create') {
            if (!req.name) {
                this.reply(L('budgetCreateOpen'), 300);
                setTimeout(() => this.runAction('budgetNew'), 900);
                return;
            }
            this.createBudgetNamed(req.name);
            return;
        }
        if (req.name && req.index >= 0) { this.switchBudgetTo(req.index); return; }
        if (budgets.length < 2) { this.reply(L('budgetOnlyOne', { name: budgets[0]?.name || 'Бюджет' }) + this.budgetListHtml(), 300); return; }
        this.reply((req.name ? L('budgetNotFound', { name: req.name }) : L('budgetPick')) + this.budgetListHtml(), 300);
    }

    budgetListHtml() {
        const budgets = this.bm.budgets || [];
        const cur = this.bm.currentBudgetIndex ?? 0;
        const items = budgets.map((b, i) => {
            const on = i === cur;
            const n = b.transactions?.length || 0;
            return `<button type="button" class="sc-budget${on ? ' active' : ''}" data-budget-go="${esc(b.id || `#${i}`)}" aria-pressed="${on}"><b>${esc(b.name || 'Бюджет')}</b><small>${n} опер.</small>${on ? '<i aria-label="Текущий">✓</i>' : ''}</button>`;
        }).join('');
        return `<div class="sc-budgets">${items}</div><button type="button" class="sc-act" data-budget-new>➕ Новый бюджет</button>`;
    }

    budgetIndexOf(key) {
        const budgets = this.bm.budgets || [];
        if (String(key).startsWith('#')) { const i = Number(String(key).slice(1)); return i >= 0 && i < budgets.length ? i : -1; }
        return budgets.findIndex(b => b.id === key);
    }

    switchBudgetTo(i) {
        const ch = this.context().settings.character;
        const b = (this.bm.budgets || [])[i];
        if (!b) return;
        if (i === (this.bm.currentBudgetIndex ?? 0)) { this.reply(`<p>${esc(chatLine('budgetSame', ch, { name: b.name }))}</p>`, 250); return; }
        this.bm.switchBudget(i);
        if (typeof window.trackSafe === 'function') window.trackSafe('switch-budget', { index: i, name: b.name, from: 'shark' });
        this.ui.afterBudgetSwitch?.();
        this.forceRefresh?.();
        document.querySelectorAll('#sc-log [data-budget-go]').forEach(x => {
            const on = this.budgetIndexOf(x.dataset.budgetGo) === i;
            x.classList.toggle('active', on);
            x.setAttribute('aria-pressed', String(on));
            x.querySelector('i')?.remove();
            if (on) x.insertAdjacentHTML('beforeend', '<i aria-label="Текущий">✓</i>');
        });
        this.reply(`<p>${esc(chatLine('budgetSwitched', ch, { name: b.name }))}</p>`, 300, 'welcome');
    }

    createBudgetNamed(name) {
        const ch = this.context().settings.character;
        const L = (k, v = {}) => `<p>${esc(chatLine(k, ch, v))}</p>`;
        const budgets = this.bm.budgets || [];
        const problem = budgetNameProblem(name, budgets);
        if (problem === 'exists') {
            const i = findBudget(name, budgets);
            this.reply(L('budgetExists', { name: budgets[i]?.name || name }) + `<button type="button" class="sc-act sc-act-primary" data-budget-go="${esc(budgets[i]?.id || `#${i}`)}">↪ Перейти в него</button>`, 300);
            return;
        }
        if (problem === 'long') { this.reply(L('budgetLong', { n: BUDGET_NAME_MAX }), 300); return; }
        if (problem) { this.reply(L('budgetChars'), 300); return; }
        if (!this.bm.createBudget(name)) { this.reply(L('budgetChars'), 300); return; }
        if (typeof window.trackSafe === 'function') window.trackSafe('create-budget', { name, from: 'shark' });
        this.ui.afterBudgetSwitch?.();
        this.forceRefresh?.();
        this.reply(L('budgetCreated', { name: this.bm.getCurrentBudget()?.name || name }), 350, 'proud');
    }

    // ───── настройки персонажа из чата: маскот, характер, болтливость ─────
    sharkSettingsAnswer(req) {
        const ch = this.context().settings.character;
        if (req.kind === 'set') { this.applySharkSetting(req.key, req.value); return; }
        const keys = req.kind === 'pick' ? [req.key] : ['shark', 'character', 'talk'];
        this.reply(`<p>${esc(chatLine(req.kind === 'pick' ? 'sharkPick' : 'sharkPanel', ch))}</p>${this.sharkPanelHtml(keys)}`, 300);
    }

    sharkPanelHtml(keys) {
        const st = getSharkSettings();
        const TITLE = { shark: 'Персонаж', character: 'Характер', talk: 'Болтливость' };
        const groups = keys.map(key => {
            const btns = SHARK_OPTIONS[key].map(o => {
                const on = st[key] === o.value;
                const pic = key === 'shark' ? `<img src="${esc(sharkImage('ok', o.value))}" alt="">` : `<i aria-hidden="true">${o.icon}</i>`;
                return `<button type="button" class="sc-opt${on ? ' active' : ''}" data-shark-opt="${key}:${o.value}" aria-pressed="${on}">${pic}<span><b>${esc(o.label)}</b><small>${esc(o.hint)}</small></span></button>`;
            }).join('');
            return `<p class="sc-opt-h">${TITLE[key]}</p><div class="sc-opts${key === 'shark' ? ' is-shark' : ''}">${btns}</div>`;
        }).join('');
        return `${groups}<button type="button" class="sc-act" data-act="shark">⚙️ Все настройки Акулки ›</button>`;
    }

    // смена настройки: та же запись, что на странице Акулки, затем ответ уже новым голосом
    applySharkSetting(key, value) {
        if (!SHARK_OPTIONS[key]?.some(o => o.value === value)) return;
        const pickOne = list => list[Math.floor(Math.random() * list.length)];
        document.querySelectorAll(`#sc-log [data-shark-opt^="${key}:"]`).forEach(b => { const on = b.dataset.sharkOpt === `${key}:${value}`; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
        if (getSharkSettings()[key] === value) { this.reply(`<p>${esc(pickOne(SHARK_SET_SAME))}</p>`, 250); return; }
        saveSharkSettings({ [key]: value });
        this.syncSettingsPage?.();
        if (key === 'shark') { applyStaticSharkImages(); applySharkTheme(); }
        this.forceRefresh?.();
        const emo = key === 'character' ? { kind: 'smile', normal: 'calm', strict: 'stern-smile' }[value] : key === 'talk' ? { quiet: 'calm', normal: 'smile', chatty: 'laugh' }[value] : 'welcome';
        this.reply(`<p>${esc(pickOne(SHARK_SET_LINES[key][value]))}</p>`, 300, emo);
    }

    // ───── краткое пособие «как вести бюджет» ─────
    guideHtml() {
        const ch = this.context().settings.character;
        const steps = GUIDE_STEPS.map((s, i) => `<li class="sc-step"><i class="sc-step-n" aria-hidden="true">${i + 1}</i><div class="sc-step-b">` +
            `<p class="sc-step-t"><b>${esc(s.icon)} ${esc(s.title)}</b></p><p class="sc-step-d">${esc(s.text)}</p>` +
            (s.ex.length ? `<div class="sc-step-ex">${s.ex.map(t => `<button type="button" class="sc-act sc-act-alt" data-say-ex="${esc(t)}">«${esc(t)}»</button>`).join('')}</div>` : '') +
            `</div></li>`).join('');
        return `<p>${esc(chatLine('guideIntro', ch))}</p><ol class="sc-guide">${steps}</ol><p class="sc-aside">${esc(chatLine('guideOutro', ch))}</p>` +
            `<div class="sc-card-act"><button type="button" class="sc-act sc-act-primary" data-q="examples">💡 Что я умею</button><button type="button" class="sc-act" data-act="planner">🗓️ План месяца</button><button type="button" class="sc-act" data-act="import">⚡ Выписка</button></div>`;
    }

    // ───── Akulka Projects в чате ─────
    projectCard(p, full) {
        const go = p.current
            ? '<p class="sc-aside">Ты уже здесь 🦈</p>'
            : p.url ? `<a class="sc-act sc-act-primary sc-proj-go" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">Перейти ›</a>` : '';
        return `<div class="sc-proj${full ? ' is-full' : ''}"><img class="sc-proj-ic" src="${esc(p.icon)}" alt="" loading="lazy">` +
            `<div class="sc-proj-b"><p class="sc-proj-n"><b>${esc(p.name)}</b>${p.version ? `<small>${esc(p.version)}</small>` : ''}</p>` +
            `<p class="sc-proj-d">${esc(full ? (p.desc || p.short) : p.short)}</p>${go}</div></div>`;
    }

    projectHtml(p) {
        const ch = this.context().settings.character;
        const more = '<button type="button" class="sc-act sc-act-alt" data-q="projects">🧩 Все проекты Akulka Projects</button>';
        return `<p>${esc(chatLine(p.current ? 'projectHere' : 'projectOne', ch, { name: p.name }))}</p>${this.projectCard(p, true)}${more}`;
    }

    projectsHtml() {
        const ch = this.context().settings.character;
        const list = [...AKULKA_PROJECTS.filter(p => !p.current), ...AKULKA_PROJECTS.filter(p => p.current)];
        return `<p>${esc(chatLine('projectsIntro', ch, { name: AKULKA_PROJECTS_INFO.name }))}</p><p class="sc-aside">${esc(AKULKA_PROJECTS_INFO.tagline)}</p>${list.map(p => this.projectCard(p, false)).join('')}`;
    }

    // ───── темы из чата ─────
    themeAnswer(req) {
        const ch = this.context().settings.character;
        if (req.kind === 'pick') { this.reply(this.themePickHtml(), 300); return; }
        let value = req.value;
        if (req.kind === 'random') {
            const cur = getSavedTheme();
            const list = THEMES.filter(t => t.value !== cur);
            value = list[Math.floor(Math.random() * list.length)]?.value;
        }
        const theme = THEMES.find(t => t.value === value);
        if (!theme) { this.reply(this.themePickHtml(), 300); return; }
        const name = `${theme.emoji} ${theme.name}`;
        const more = '<button type="button" class="sc-act sc-act-alt" data-theme-pick>🎨 Другие темы</button>';
        if (getSavedTheme() === value && document.documentElement.getAttribute('data-theme') === value) {
            this.reply(`<p>${esc(chatLine('themeSame', ch, { name }))}</p>${more}`, 250);
            return;
        }
        setTheme(value);
        this.reply(`<p>${esc(chatLine('themeSet', ch, { name }))}</p>${more}`, 300, 'smile');
    }

    // сетка тем прямо в чате: мини-превью (фон и акцент темы), нажатие сразу переключает
    themePickHtml() {
        const ch = this.context().settings.character;
        const cur = getSavedTheme();
        const ORDER = ['onyx', 'tiffany', 'shark', 'burgundy', 'mint', 'light', 'dolphin'];
        const rank = v => { const i = ORDER.indexOf(v); return i === -1 ? ORDER.length : i; };
        const btns = [...THEMES].sort((a, b) => rank(a.value) - rank(b.value)).map(t => {
            const k = getThemeTokens(t.value);
            return `<button type="button" class="sc-theme${t.value === cur ? ' active' : ''}" data-theme-set="${t.value}" aria-pressed="${t.value === cur}">` +
                `<i class="sc-theme-sw" style="background:${k.bg}"><b style="background:${k.accent}"></b></i><span>${esc(t.emoji)} ${esc(t.name)}</span></button>`;
        }).join('');
        return `<p>${esc(chatLine('themePick', ch))}</p><div class="sc-themes">${btns}</div><button type="button" class="sc-act" data-act="theme">🎨 Все темы с описанием ›</button>`;
    }

    themeSet(value) {
        const theme = THEMES.find(t => t.value === value);
        if (!theme) return;
        document.querySelectorAll('#sc-log .sc-theme').forEach(b => { const on = b.dataset.themeSet === value; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
        if (getSavedTheme() === value) return;
        setTheme(value);
        const ch = this.context().settings.character;
        this.reply(`<p>${esc(chatLine('themeSet', ch, { name: `${theme.emoji} ${theme.name}` }))}</p>`, 300, 'smile');
    }

    // ───── «Вопросы и ответы» в чате: вопрос из FAQ и ответ как есть ─────
    faqHtml(item) {
        const lines = String(item.answer || '').split('\n').map(s => s.trim()).filter(Boolean);
        let html = '';
        let list = [];
        const flush = () => { if (list.length) { html += `<ul class="sc-list">${list.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`; list = []; } };
        for (const l of lines) {
            if (/^[•\-–]\s*/.test(l)) list.push(l.replace(/^[•\-–]\s*/, ''));
            else { flush(); html += `<p>${esc(l)}</p>`; }
        }
        flush();
        return `<p class="sc-h"><b>${esc(item.question)}</b></p>${html}<button type="button" class="sc-act" data-act="faq">💬 Все вопросы и ответы ›</button>`;
    }

    faqListHtml() {
        const ch = this.context().settings.character;
        const latest = latestVersionItem(FAQ_ITEMS);
        const items = [latest, ...FAQ_ITEMS.filter(i => !/нового в версии/i.test(i.question))].filter(Boolean);
        return `<p>${esc(chatLine('faqIntro', ch))}</p>` + items.map(i => `<button type="button" class="sc-act sc-act-alt" data-say-ex="${esc(i.question)}">${esc(i.question)}</button>`).join('');
    }

    // кнопки-разделы под полем ввода (в компактном чате скрыты до команды)
    showChips() {
        document.getElementById('shark-chat-sheet')?.classList.add('sc-chips-on');
    }

    // ───── страницы и функции: текст с кнопкой, сама страница открывается по кнопке ─────
    navHtml(key) {
        const n = NAV[key];
        if (!n) return '';
        const ch = this.context().settings.character;
        return `<p>${esc(chatLine('navIntro', ch))} ${esc(n.text)}</p><button type="button" class="sc-act sc-act-primary" data-act="${n.act}">${esc(n.btn)}</button>`;
    }

    // ───── чипсы частых категорий над полем ввода ─────
    renderQuick() {
        const box = document.getElementById('sc-quick');
        if (!box) return;
        const c = this.context();
        this.quickList = frequentCategories(c.transactions, c.today, 10);
        box.hidden = false;
        // первый чипс — «Выпиской»: сразу открывает загрузку выписки («Залётом»); ручной ввод — круглая кнопка у поля ввода
        box.innerHTML = '<button type="button" class="sc-quick-import" data-import>⚡ Выпиской</button>' + this.quickList.map((q, i) => `<button type="button" data-quick="${i}" title="${esc(q.category)}">${q.type === 'income' ? '<i class="sc-quick-in">+</i>' : ''}${esc(q.category)}</button>`).join('');
    }

    quickStart(i) {
        const q = this.quickList?.[i];
        if (!q) return;
        this.chatClar = null;
        this.chatQuick = { category: q.category, type: q.type };
        this.bubble('user', esc(q.category));
        const ch = this.context().settings.character;
        const btns = q.amounts.map(a => `<button type="button" class="sc-act sc-act-alt" data-quick-amt="${a}">${esc(fmt(a))}</button>`).join('');
        this.reply(`<p>${esc(chatLine(q.type === 'income' ? 'quickAskIn' : 'quickAsk', ch, { name: q.category }))}</p>${btns ? `<div class="sc-card-act">${btns}</div>` : ''}`, 250);
        this.focusSay();
    }

    // команда, набранная словами: то же, что нажатие кнопки
    runCommand(cmd, text) {
        if (cmd.type === 'help') { this.bubble('user', esc(text)); this.showChips(); this.reply(this.examplesHtml(), 450); return; }
        if (cmd.type === 'menu') { this.openMenu(cmd.id, text); return; }
        this.ask(cmd.id, text);
    }

    // полный пример сообщений: каждая фраза — кнопка, по нажатию отправляется как набранная
    examplesHtml() {
        const ch = this.context().settings.character;
        const groups = EXAMPLES.map(g => `<p class="sc-h"><b>${g.icon} ${esc(g.title)}</b></p><p class="sc-aside">${esc(g.hint)}</p>` +
            g.items.map(t => `<button type="button" class="sc-act" data-say-ex="${esc(t)}">«${esc(t)}»</button>`).join('')).join('');
        return `<p>${esc(chatLine('helpIntro', ch))}</p>${groups}<p class="sc-aside">${esc(chatLine('helpOutro', ch))}</p>`;
    }

    present(route, orig) {
        const ch = this.context().settings.character;
        if (route.branch === 'summary') { this.reply(this.summaryHtml(route.intent, ch)); return; }
        if (route.branch === 'clarify') {
            this.chatClar = { result: route.result, orig };
            const nc = route.clarification;
            const intent = route.result.intents[nc.intentIndex ?? 0];
            const btns = optionsOf(nc, intent, route.result.meta.today, this.parserCtx())
                .map((o, i) => `<button type="button" class="sc-act${o.value.startsWith('__') ? ' sc-act-alt' : ''}" data-say-opt="${i}" data-v="${esc(o.value)}">${esc(o.label)}</button>`).join('');
            this.reply(`<p>${esc(questionOf(nc, intent))}</p>${btns}<button type="button" class="sc-act" data-say-no>✖ Отмена</button>`);
            this.focusSay();
            return;
        }
        if (route.branch === 'confirm') { route.intents.forEach(it => this.card(it, orig)); return; }
        if (route.deleteHint) {
            this.reply('<p>Из чата я удаляю только последнюю запись. Другие операции удаляй в списке операций.</p><button type="button" class="sc-act" data-q="undo">🗑 Удалить последнюю запись</button>', 300);
            return;
        }
        const talk = smallTalk(orig);
        if (talk) { this.reply(`<p>${esc(chatLine(talk, ch))}</p>`, 300, talk === 'praise' ? 'proud' : null); return; }
        this.reply(this.unparsedHtml(ch));
        this.focusSay();
    }

    // не поняла: короткая реплика, пара примеров и кнопка «Помощь» (тот же вид, что в полном списке)
    unparsedHtml(ch) {
        const pick = g => g.items[Math.floor(Math.random() * g.items.length)];
        const ex = [EXAMPLES[0], EXAMPLES[2], EXAMPLES[1]].map(pick);
        const btn = t => `<button type="button" class="sc-act" data-say-ex="${esc(t)}">«${esc(t)}»</button>`;
        return `<p>${esc(chatLine('unparsed', ch))}</p>${ex.map(btn).join('')}<button type="button" class="sc-act" data-say-ex="помощь">❓ Помощь</button>`;
    }

    focusSay() { setTimeout(() => document.getElementById('sc-say-input')?.focus(), 450); }

    // карточка подтверждения: запись только после «✓ Записать»
    card(intent, orig) {
        const c = cardOf(intent);
        this.chatCards = this.chatCards || new Map();
        const id = `c${Date.now()}${this.chatCards.size}`;
        this.chatCards.set(id, { intent, orig, done: false, base: intent.tx?.category || null });
        this.reply(`<div class="sc-card" data-card="${id}">${this.cardInner(id)}</div>`, 380, c.strong ? 'tense' : null);
    }

    // содержимое карточки: строки, предупреждения, память Акулки («масло» обычно в KorzinkaGO) и кнопки
    cardInner(id) {
        const card = this.chatCards.get(id);
        const c = cardOf(card.intent);
        const ch = this.context().settings.character;
        const rows = c.rows.map(([k, v]) => `<p class="sc-kv${k === 'Сумма' ? ' sc-sum' : ''}"><span>${esc(k)}</span><b>${esc(v)}</b></p>`).join('');
        const warn = c.warnings.map(w => `<p class="sc-warn">⚠️ ${esc(w)}</p>`).join('');
        const m = card.intent.memory;
        const cur = card.intent.tx?.category;
        let memo = '';
        if (m && m.category) {
            const vars = { what: m.word, name: m.category, n: agreeNumbers(`${m.count} раз`) };
            const icon = m.own ? '✨' : '🧠';
            if (m.same) memo = `<p class="sc-mem">${icon} ${esc(chatLine('memoSame', ch, vars))}</p>`;
            else if (cur === m.category) memo = `<p class="sc-mem">${icon} ${esc(chatLine(m.own ? 'memoOwnSwapped' : 'memoSwapped', ch, vars))}</p><button type="button" class="sc-act sc-act-alt" data-mem-swap="${id}">↩ Вернуть ${esc(card.base)}</button>`;
            else memo = `<p class="sc-mem">${icon} ${esc(chatLine(m.own ? 'memoOwn' : 'memoOther', ch, vars))}</p><button type="button" class="sc-act sc-act-alt" data-mem-swap="${id}">Записать в ${esc(m.category)}</button>`;
        }
        // «⇄ Это доход / Это трата»: меняет тип в карточке, но ничего не записывает
        const tt = card.intent.tx?.type;
        if (tt === 'expense' || tt === 'income') memo += `<button type="button" class="sc-act sc-act-alt" data-type-swap="${id}">⇄ ${tt === 'expense' ? 'Это доход' : 'Это трата'}</button>`;
        const buttons = `<div class="sc-card-act" data-card-act="${id}"><button type="button" class="sc-act sc-act-primary" data-say-yes="${id}"${c.canSave ? '' : ' disabled'}>✓ Записать</button><button type="button" class="sc-act" data-say-edit="${id}">✏️ Изменить</button><button type="button" class="sc-act" data-say-cancel="${id}">✖ Отмена</button></div>`;
        return rows + warn + memo + buttons;
    }

    // «⇄ Это доход / Это трата»: тип меняется, категория подбирается заново; не нашлась — спрашиваем её
    swapType(id) {
        const card = this.chatCards?.get(id);
        if (!card || card.done) return;
        const next = switchType(card.intent, this.parserCtx());
        if (!next) return;
        const box = document.querySelector(`#sc-log [data-card="${id}"]`);
        if (next.tx.category) {
            card.intent = next;
            card.base = next.tx.category;
            if (box) box.innerHTML = forShark(this.cardInner(id));
            return;
        }
        card.done = true;
        const act = box?.querySelector(`[data-card-act="${id}"]`);
        if (box) box.querySelectorAll('[data-type-swap],[data-mem-swap]').forEach(b => b.remove());
        if (act) act.innerHTML = `<p class="sc-aside">Тип изменён: ${next.tx.type === 'income' ? 'поступление' : 'трата'}</p>`;
        const result = { intents: [next], unparsed: [], needsClarification: { field: 'category', question: '', intentIndex: 0 }, meta: { lang: 'ru', today: next.tx.date || isoDay(), empty: false } };
        this.present({ branch: 'clarify', result, clarification: result.needsClarification }, card.orig);
    }

    // переключить категорию карточки между общей и той, что подсказала память
    swapMemory(id) {
        const card = this.chatCards?.get(id);
        const m = card?.intent?.memory;
        if (!card || card.done || !m || m.same) return;
        card.intent.tx.category = card.intent.tx.category === m.category ? card.base : m.category;
        const box = document.querySelector(`#sc-log [data-card="${id}"]`);
        if (box) box.innerHTML = forShark(this.cardInner(id));
    }

    sayAction(b) {
        const log = document.getElementById('sc-log');
        const ch = this.context().settings.character;
        if (b.dataset.sayEx !== undefined) { this.say(b.dataset.sayEx); return; }
        if (b.dataset.sayOpt !== undefined) {
            if (!this.chatClar) return;
            if (b.dataset.v.startsWith(CAT_NEW)) { this.openNewCategory(b.dataset.v.slice(CAT_NEW.length)); return; }
            this.say(b.dataset.v, { value: b.dataset.v, shown: b.textContent });
            return;
        }
        if (b.hasAttribute('data-say-no')) {
            this.chatClar = null;
            this.bubble('user', '✖ Отмена');
            this.reply(`<p>${esc(chatLine('cancelled', ch))}</p>`, 250);
            return;
        }
        const id = b.dataset.sayYes || b.dataset.sayEdit || b.dataset.sayCancel;
        const card = this.chatCards?.get(id);
        if (!card || card.done) return;
        const finish = text => {
            card.done = true;
            const act = log.querySelector(`[data-card-act="${id}"]`);
            if (act) act.innerHTML = `<p class="sc-aside">${esc(text)}</p>`;
        };
        if (b.dataset.sayCancel) {
            finish('Отменено');
            this.reply(`<p>${esc(chatLine('cancelled', ch))}</p>`, 250);
        } else if (b.dataset.sayEdit) {
            finish('Правлю');
            const inp = document.getElementById('sc-say-input');
            if (inp) { inp.value = card.orig; this.syncSend(); inp.focus(); }
            this.reply(`<p>${esc(chatLine('edit', ch))}</p>`, 250);
        } else {
            const t = card.intent.tx;
            let res;
            try { res = commitIntent(card.intent, this.bm); } catch (err) { res = { ok: false }; }
            if (!res.ok) { this.reply(`<p>${esc(res.error ? `Не получилось создать категорию: ${res.error}. Ничего не записано.` : chatLine('error', ch))}</p>`, 250); return; }
            finish('Записано ✓');
            if (res.newCategory) this.ui.applyCustomCategories?.();
            this.ui.updateUI?.();
            this.renderQuick();
            const flat = cardOf(card.intent);
            const date = t.date ? t.date.split('-').reverse().join('.') : '';
            const vars = { sum: fmt(t.amount), what: t.category || t.name || '', name: t.name || '', date };
            const kind = res.kind === 'repayment' ? 'repaid' : (flat.isDebt || flat.strong ? 'plain' : 'saved');
            const extra = res.newCategory ? `<p class="sc-aside">${esc(`Категория «${res.newCategory}» создана, она есть в списке категорий.`)}</p>` : '';
            this.reply(`<p>${esc(chatLine(kind, ch, vars))}</p>${extra}`, 300, kind === 'saved' ? 'ok' : null);
        }
    }

    // ───── окно «Своя категория»: эмодзи и название; категория сохранится только вместе с операцией ─────
    ensureNewCategorySheet() {
        let sheet = document.getElementById('shark-newcat-sheet');
        if (sheet) return sheet;
        sheet = document.createElement('div');
        sheet.id = 'shark-newcat-sheet';
        sheet.className = 'bottom-sheet hidden';
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-labelledby', 'nc-title');
        sheet.innerHTML = `
          <div class="sheet-title-row"><h2 id="nc-title">Своя категория</h2><button type="button" class="sheet-x" id="nc-x" aria-label="Закрыть">✕</button></div>
          <div class="nc-preview"><span class="nc-pe" id="nc-pe" aria-hidden="true">🏷️</span><span class="nc-pn"><b id="nc-pn"></b><small id="nc-pt"></small></span></div>
          <div class="nc-type" id="nc-type" role="radiogroup" aria-label="Тип категории" hidden><button type="button" role="radio" data-t="expense">Трата</button><button type="button" role="radio" data-t="income">Поступление</button></div>
          <label class="nc-label" for="nc-name">Название</label>
          <input id="nc-name" class="nc-name" type="text" maxlength="20" autocomplete="off" enterkeyhint="done">
          <div class="nc-label">Эмодзи</div>
          <div class="nc-tabs" id="nc-tabs" role="tablist" aria-label="Наборы эмодзи">${EMOJI_GROUPS.map((g, i) => `<button type="button" role="tab" data-g="${i}">${esc(g.label)}</button>`).join('')}</div>
          <div class="nc-grid" id="nc-grid" role="listbox" aria-label="Эмодзи"></div>
          <input id="nc-own" class="nc-own" type="text" maxlength="4" placeholder="или свой эмодзи с клавиатуры" aria-label="Свой эмодзи">
          <div class="nc-err" id="nc-err" role="alert"></div>
          <button type="button" class="nc-next" id="nc-next">Далее</button>
          <p class="nc-hint" id="nc-hint">Категория сохранится, только когда ты подтвердишь запись.</p>`;
        document.body.appendChild(sheet);
        const $ = s => sheet.querySelector(s);
        const st = this.newCat = { emoji: '🏷️', group: 0, type: 'expense', standalone: false, manual: false };
        const paint = () => {
            $('#nc-pe').textContent = st.emoji;
            $('#nc-pt').textContent = st.type === 'income' ? 'Поступление' : 'Трата';
            sheet.querySelectorAll('#nc-type button').forEach(b => { const on = b.dataset.t === st.type; b.classList.toggle('active', on); b.setAttribute('aria-checked', String(on)); });
            $('#nc-pn').textContent = $('#nc-name').value.trim() || 'Название';
            sheet.querySelectorAll('#nc-tabs button').forEach(b => { const on = +b.dataset.g === st.group; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); });
            $('#nc-grid').innerHTML = EMOJI_GROUPS[st.group].list.map(e => `<button type="button" role="option" aria-selected="${e === st.emoji}" class="${e === st.emoji ? 'active' : ''}" data-e="${e}">${e}</button>`).join('');
        };
        st.paint = paint;
        $('#nc-tabs').addEventListener('click', e => { const b = e.target.closest('button[data-g]'); if (b) { st.group = +b.dataset.g; paint(); } });
        $('#nc-grid').addEventListener('click', e => { const b = e.target.closest('button[data-e]'); if (b) { st.emoji = b.dataset.e; st.manual = true; $('#nc-own').value = ''; paint(); } });
        $('#nc-own').addEventListener('input', e => {
            const m = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}️?)*/u.exec(e.target.value);
            if (m) { st.emoji = m[0]; st.manual = true; paint(); }
        });
        $('#nc-type').addEventListener('click', e => { const b = e.target.closest('button[data-t]'); if (b) { st.type = b.dataset.t; $('#nc-err').textContent = ''; paint(); } });
        $('#nc-name').addEventListener('input', () => {
            $('#nc-err').textContent = '';
            // пока эмодзи не выбран руками, подбираем его по названию («Такси для детей» → 🚖)
            if (!st.manual) { st.emoji = suggestEmoji($('#nc-name').value, st.type, this.parserCtx()); st.group = Math.max(0, EMOJI_GROUPS.findIndex(g => g.list.includes(st.emoji))); }
            paint();
        });
        $('#nc-name').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#nc-next').click(); } });
        $('#nc-x').addEventListener('click', () => this.closeSheet('shark-newcat-sheet'));
        $('#nc-next').addEventListener('click', () => {
            const name = $('#nc-name').value.replace(/\s+/g, ' ').trim();
            if (!name) { $('#nc-err').textContent = 'Введи название'; return; }
            if (name.length > 20) { $('#nc-err').textContent = 'Не длиннее 20 символов'; return; }
            if (st.standalone) {
                // «мало категорий»: операции нет, поэтому категория создаётся сразу
                const res = createCustomCategory(this.bm.customCategories, st.type, st.emoji, name, this.parserCtx());
                if (res.error) { $('#nc-err').textContent = res.error; return; }
                this.bm.customCategories = res.categories;
                this.bm.saveToStorage?.();
                this.ui.applyCustomCategories?.();
                this.closeSheet('shark-newcat-sheet');
                this.bubble('user', esc(`➕ ${res.value}`));
                this.reply(`<p>${esc(chatLine('addcatDone', this.context().settings.character, { name: res.value, what: name.toLowerCase() }))}</p>`, 300, 'ok');
                return;
            }
            this.closeSheet('shark-newcat-sheet');
            if (!this.chatClar) return;
            const v = newCategoryAnswer(st.emoji, name);
            this.say(v, { value: v, shown: `➕ ${st.emoji} ${name}` });
        });
        return sheet;
    }

    // name — из фразы; standalone — без операции («мало категорий»): тип выбирается в окне, категория создаётся сразу
    openNewCategory(name, { standalone = false } = {}) {
        const pend = this.chatClar;
        if (!pend && !standalone) return;
        const nc = pend?.result?.needsClarification;
        const it = pend?.result?.intents?.[nc?.intentIndex ?? 0];
        const type = !standalone && it?.tx?.type === 'income' ? 'income' : 'expense';
        const sheet = this.ensureNewCategorySheet();
        const st = this.newCat;
        st.standalone = standalone;
        st.type = type;
        st.manual = false;
        sheet.querySelector('#nc-type').hidden = !standalone;
        sheet.querySelector('#nc-hint').textContent = standalone ? 'Категория появится в списке сразу. Удалить её можно в форме добавления операции.' : 'Категория сохранится, только когда ты подтвердишь запись.';
        sheet.querySelector('#nc-next').textContent = standalone ? 'Добавить' : 'Далее';
        st.emoji = suggestEmoji(name, type, this.parserCtx());
        st.group = Math.max(0, EMOJI_GROUPS.findIndex(g => g.list.includes(st.emoji)));
        sheet.querySelector('#nc-name').value = name;
        sheet.querySelector('#nc-own').value = '';
        sheet.querySelector('#nc-err').textContent = '';
        st.paint();
        document.getElementById('bottom-sheet-backdrop')?.classList.remove('hidden');
        sheet.classList.remove('hidden');
    }

    // мини-сводка на вопрос «сколько я потратил на еду в этом месяце»
    summaryHtml(intent, ch) {
        const s = runSummary(intent, this.context().transactions, { balance: () => this.bm.calculateTotals('all', 'all').closingBalance });
        if (s.metric === 'savings') {
            const dd = x => (x ? x.split('-').reverse().join('.') : '');
            const sp = s.period?.from || s.period?.to ? ` (${dd(s.period.from)}–${dd(s.period.to)})` : '';
            if (!s.total && !s.count) return `<p>${esc(chatLine('savedNone', ch, { per: sp }))}</p>`;
            return `<p>${esc(chatLine(s.total >= 0 ? 'savedAll' : 'savedMinus', ch, { per: sp, sum: fmt(s.total) }))}</p><p class="sc-kv"><span>Пополнений</span><b>${s.count}</b></p>`;
        }
        if (s.metric !== 'remaining' && !s.count) return `<p>${esc(chatLine('summaryEmpty', ch))}</p>`;
        const d = x => (x ? x.split('-').reverse().join('.') : '');
        const per = s.period?.from || s.period?.to ? ` (${d(s.period.from)}–${d(s.period.to)})` : '';
        const sign = n => (n < 0 ? '−' : '') + fmt(n);
        const line = (kind, vars) => `<p>${esc(chatLine(kind, ch, { per, ...vars }))}</p>`;
        const row = (k, v) => `<p class="sc-kv"><span>${k}</span><b>${v}</b></p>`;
        if (s.metric === 'remaining') return row('Осталось', sign(s.remaining ?? 0));
        if (s.metric === 'overview') return line('overviewIntro', {}) + row('Поступления', fmt(s.income)) + row('Расходы', fmt(s.expense)) + row('Итог', sign(s.net));
        if (intent.rank) {
            const rows = s.byCategory.map(r => `<p class="sc-bar-label">${esc(r.category)} — ${r.count} оп. · ${fmt(r.sum)}</p>`).join('');
            return line(intent.rank === 'least' ? 'rankLeast' : 'rankMost', {}) + rows + `<p class="sc-aside">${esc(chatLine('rankNote', ch, { sum: fmt(s.expense) }))}</p>`;
        }
        const income = s.metric === 'income';
        const cats = intent.categories?.length ? (intent.categories.length <= 3 ? intent.categories.join(', ') : `категории: ${intent.categories.length}`) : '';
        const what = intent.subject || cats;
        const head = line(what ? (income ? 'earnWhat' : 'spendWhat') : (income ? 'earnAll' : 'spendAll'), { what, sum: fmt(s.total) });
        const hasFilter = !!(intent.keywords?.length || intent.categories?.length);
        if (hasFilter && s.items?.length) {
            const shown = s.items.slice(0, 5);
            const rows = shown.map(i => `<p class="sc-aside sc-found">${esc(d(i.date).slice(0, 5))} · ${esc(i.name)} — ${i.income ? '+' : ''}${fmt(i.amount)}</p>`).join('');
            const more = s.items.length > shown.length ? `<p class="sc-aside">…и ещё ${s.items.length - shown.length}</p>` : '';
            return head + `<p class="sc-aside">${esc(chatLine('found', ch, { n: s.items.length }))}</p>` + rows + more;
        }
        let top = s.byCategory.slice(0, 10);
        if (top.length && !intent.limit && s.byCategory.length > 10) {
            const rest = s.byCategory.slice(10);
            top = [...top, { category: `Остальное (${rest.length} кат.)`, sum: rest.reduce((a, r) => a + r.sum, 0) }];
        }
        const max = top[0]?.sum || 1;
        const bars = top.length > 1 ? top.map(r => `<p class="sc-bar-label">${esc(r.category)} — ${fmt(r.sum)}</p><div class="sc-bar"><i style="width:${Math.max(4, Math.round(r.sum / max * 100))}%"></i></div>`).join('') : '';
        return head + bars;
    }

    // compact — открыт из кнопки в навбаре: без кнопок-разделов под полем ввода, они появляются по команде («кнопки», «что умеешь», раздел)
    openChat({ compact = false } = {}) {
        const sheet = this.ensureChat();
        sheet.classList.toggle('sc-compact', compact);
        sheet.classList.remove('sc-chips-on');
        this.refreshCard();
        const bn = sheet.querySelector('#sc-budget');
        if (bn) bn.textContent = this.bm?.getCurrentBudget?.()?.name ? `Бюджет «${this.bm.getCurrentBudget().name}»` : '';
        const log = sheet.querySelector('#sc-log');
        log.innerHTML = '';
        this.chatMenu = null;
        this.chatClar = null;
        this.chatCards = new Map();
        this.renderChips();
        this.renderQuick();
        this.chatQuick = null;
        this.syncSend();
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

    // «Каким был мой {месяц}?» / неделя / год: сторис с итогами или объяснение, чего не хватает
    askRecap(label, kind = 'month') {
        this.bubble('user', esc(label));
        const c = this.context();
        const r = buildAnyRecap(kind, c.transactions, c.today, true);
        if (r.ok) {
            this.reply('Собрала итоги. Листай, это быстро 🦈', 300);
            setTimeout(() => showRecap(kind, c.transactions, c.today, { force: true }), 700);
            return;
        }
        // пороги — те же, что у самих сторис (recapPeriods / recapStats), чтобы текст не расходился с проверкой
        const need = kind === 'week' ? `для итогов недели нужны записи минимум за ${agreeNumbers(`${WEEK_MIN_DAYS} дней`)}`
            : kind === 'year' ? `для итогов года нужны записи минимум за ${agreeNumbers(`${YEAR_MIN_DAYS} дней`)} в ${YEAR_MIN_MONTHS} разных месяцах`
                : `для итогов месяца нужны записи минимум за ${agreeNumbers(`${MIN_ACTIVE_DAYS} дней`)}`;
        const have = r.activeDays || 0;
        this.reply(`Пока мало данных: записей на ${have} ${have === 1 ? 'день' : 'дн.'}, ${need}. Загрузи выписку через «Залётом», и я всё соберу.` +
            '<button type="button" class="sc-act" data-act="import">⚡ Загрузить выпиской</button>', 380);
    }

    recapItems() {
        const c = this.context();
        const av = recapAvailability(c.transactions, c.today);
        const y = Number(c.today.slice(0, 4)) - (c.today.slice(5, 7) === '01' ? 1 : 0);
        return [
            { id: 'recap:month', label: `🎞️ Каким был мой ${av.name}` },
            { id: 'recap:week', label: '📅 Какой была моя неделя' },
            { id: 'recap:year', label: `🏆 Мой ${y} год` }
        ];
    }

    // команды по записям (chatFlow): последняя запись, удаление последней, средний чек, крупная трата, зарплата
    recordHtml(id, period = null) {
        const c = this.context();
        const ch = c.settings.character;
        const L = (k, v = {}) => `<p>${esc(chatLine(k, ch, v))}</p>`;
        const d = x => (x ? x.split('-').reverse().join('.') : '');
        if (id === 'last') {
            const t = lastRecord(c.transactions);
            if (!t) return L('lastNone');
            return L('lastShow', { what: recordLabel(t) }) + (canUndo(t) ? '<button type="button" class="sc-act" data-q="undo">🗑 Удалить её</button>' : '');
        }
        if (id === 'undo') {
            const t = lastRecord(c.transactions);
            if (!t) return L('undoNone');
            if (!canUndo(t)) return L('undoDebt', { what: recordLabel(t) });
            const tid = esc(String(t.id));
            return L('undoAsk', { what: recordLabel(t) }) + `<div class="sc-card-act" data-undo-act="${tid}"><button type="button" class="sc-act sc-act-primary" data-undo-yes="${tid}">🗑 Удалить</button><button type="button" class="sc-act" data-undo-no>✖ Оставить</button></div>`;
        }
        // средний чек и крупная трата: без периода — текущий месяц, с периодом — за него («средний чек за неделю»)
        const per = periodLabel(period, c.today);
        if (id === 'avg') {
            const a = averageSpend(c.transactions, c.today, period);
            if (!a) return L('avgNone', { per });
            return L('avgShow', { per, sum: fmt(a.avg), n: a.count, what: fmt(a.perDay) }) + (period ? `<p class="sc-kv"><span>Всего потрачено</span><b>${esc(fmt(a.total))}</b></p>` : '');
        }
        if (id === 'biggest') {
            const b = biggestSpend(c.transactions, c.today, period);
            return b ? L('bigShow', { per, sum: fmt(b.amount), what: b.category || 'без категории', date: d(b.date) }) : L('bigNone', { per });
        }
        return this.incomeHtml({ salary: true });
    }

    // категории доходов: встроенные, свои и те, что встречаются в записях
    incomeCats() {
        const own = this.bm.customCategories?.income || [];
        const used = (this.bm.getCurrentBudget()?.transactions || []).filter(t => t?.type === 'income' && t.category).map(t => t.category);
        return [...new Set([...used, ...own, ...incomeCategories])];
    }

    // «когда зарплата / аванс / фриланс»: по дням, в которые деньги приходили в прошлые месяцы
    incomeHtml(req) {
        const c = this.context();
        const ch = c.settings.character;
        const L = (k, v = {}) => `<p>${esc(chatLine(k, ch, v))}</p>`;
        const dm = x => `${x.slice(8, 10)}.${x.slice(5, 7)}`;
        let only = null;
        if (req.cats?.length) { const set = new Set(req.cats); only = cat => set.has(cat); }
        else if (req.salary) only = cat => SALARY_RE.test(cat);
        const rows = incomeSchedule(c.transactions, c.today, only);
        const one = req.cats?.length === 1 ? req.cats[0] : '';
        const what = one ? ` в категории «${one}»` : req.salary ? ' (зарплата, аванс)' : '';
        if (!rows.some(r => r.enough)) return L('incomeNoData', { what });
        const kv = (cat, val, hint = '') => `<p class="sc-kv"><span>${esc(cat)}</span><b>${esc(val)}</b></p>${hint ? `<p class="sc-aside">${esc(hint)}</p>` : ''}`;
        const list = [];
        // «когда придут доходы»: строки — только доходы по графику, остальные одной строкой внизу
        const loose = req.all ? rows.filter(r => !r.enough || !r.slots.length) : [];
        for (const r of rows) {
            if (loose.includes(r)) continue;
            if (!r.enough) { list.push(kv(r.category, 'мало данных', `Записи только за ${r.months} мес., нужно хотя бы 2`)); continue; }
            if (!r.slots.length) { list.push(kv(r.category, 'в разные числа')); continue; }
            for (const s of r.slots) {
                const val = s.late ? `ждём, обычно ~${s.avgDay}-го` : s.days === 0 ? `сегодня · ${dm(s.next)}` : `через ${pluralDays(s.days)} · ${dm(s.next)}`;
                list.push(kv(r.category, val, s.late ? '' : `В среднем приходит ~${s.avgDay}-го`));
            }
        }
        const firstReady = rows.find(r => r.enough && r.slots.some(s => !s.late));
        const firstLate = rows.find(r => r.enough && r.slots.some(s => s.late));
        let head;
        if (firstReady) {
            const s = firstReady.slots.find(x => !x.late);
            head = s.days === 0 ? L('incomeToday', { what: firstReady.category }) : L('incomeNext', { what: firstReady.category, n: pluralDays(s.days), date: dm(s.next) });
        } else if (firstLate) head = L('incomeLate', { what: firstLate.category, date: `~${firstLate.slots[0].avgDay}-го` });
        else head = L('incomeIrregular', { what: rows.find(r => r.enough).category });
        if (loose.length) list.push(`<p class="sc-aside">${esc(`Без графика, в разные числа: ${loose.map(r => r.category).join(', ')}`)}</p>`);
        const tail = !req.all && rows.some(r => !r.enough) ? L('incomeSomeNoData') : '';
        return head + list.join('') + tail;
    }

    // удаление последней записи: только после «🗑 Удалить» и только если запись всё ещё последняя
    undoAction(b) {
        const box = b.closest('[data-undo-act]');
        if (!box || box.dataset.done) return;
        box.dataset.done = '1';
        const c = this.context();
        const ch = c.settings.character;
        if (b.hasAttribute('data-undo-no')) {
            box.innerHTML = '<p class="sc-aside">Оставлено</p>';
            this.reply(`<p>${esc(chatLine('undoKept', ch))}</p>`, 250);
            return;
        }
        const t = lastRecord(c.transactions);
        if (!t || String(t.id) !== b.dataset.undoYes || !canUndo(t)) {
            box.innerHTML = '<p class="sc-aside">Не удалено</p>';
            this.reply(`<p>${esc(chatLine('undoGone', ch))}</p>`, 250);
            return;
        }
        const label = recordLabel(t);
        this.bm.deleteTransaction(t.id);
        this.ui.updateUI?.();
        this.forceRefresh?.();
        box.innerHTML = '<p class="sc-aside">Удалено ✓</p>';
        this.reply(`<p>${esc(chatLine('undoDone', ch, { what: label }))}</p>`, 250);
    }

    ask(id, label, extra = {}) {
        if (id === 'examples') { this.runCommand({ type: 'help' }, label); return; }
        if (id === 'manual') {
            this.bubble('user', esc(label));
            this.reply(`<p>${esc(chatLine('manualOpen', this.context().settings.character))}</p>`, 200);
            setTimeout(() => this.runAction('add'), 650);
            return;
        }
        if (id === 'chips') { this.bubble('user', esc(label)); this.showChips(); this.chatMenu = null; this.renderChips(); this.reply(`<p>${esc(chatLine('chipsOn', this.context().settings.character))}</p>`, 250); return; }
        if (id === 'faq') { this.bubble('user', esc(label)); this.reply(this.faqListHtml(), 350); return; }
        if (id === 'projects') { this.bubble('user', esc(label)); this.reply(this.projectsHtml(), 350); return; }
        if (id === 'guide') { this.bubble('user', esc(label)); this.reply(this.guideHtml(), 450); return; }
        if (id === 'stories') { this.bubble('user', esc(label)); this.reply(this.storiesHtml(), 400); return; }
        if (id.startsWith('nav:')) { this.bubble('user', esc(label)); this.reply(this.navHtml(id.slice(4)), 300); return; }
        if (id === 'fx') { this.bubble('user', esc(label)); this.reply(this.fxHtml({ kind: 'rates', code: null }), 350); return; }
        if (id === 'addcat') {
            this.bubble('user', esc(label));
            this.reply(`<p>${esc(chatLine('addcatAsk', this.context().settings.character))}</p><button type="button" class="sc-act sc-act-primary" data-newcat>➕ Добавить свою категорию</button>`, 350);
            return;
        }
        if (['last', 'undo', 'avg', 'biggest', 'payday'].includes(id)) { this.bubble('user', esc(label)); this.reply(this.recordHtml(id), 350); return; }
        if (id === 'nospend') { this.bubble('user', esc(label)); this.markNoSpendToday(true); return; }
        if (id === 'recap') { this.askRecap(label, 'month'); return; }
        if (id.startsWith('recap:')) { this.askRecap(label, id.slice(6)); return; }
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
            (ans.acts ? ans.acts.map(a => `<button type="button" class="sc-act" data-act="${a.id}"${a.amt ? ` data-amt="${Math.round(a.amt)}"` : ''}>${esc(a.label)}</button>`).join('') : '') +
            (ans.choices ? ans.choices.map(ch => `<button type="button" class="sc-act" data-q="${ch.id}">${esc(ch.label)}</button>`).join('') : '');
        const quiet = !['joke', 'dialog'].includes(id) && !id.startsWith('dlg:') && !ans.input && !ans.choices;
        const aside = quiet && ctx.talk === 'chatty' && Math.random() < 0.5 ? `<p class="sc-aside">${esc(tailLine(ctx.character))}</p>` : '';
        this.reply(richHtml(ans.text) + aside + buttons, 380, CHAT_EMOTION[id] || null);
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
            const rc = this.context();
            const rav = recapAvailability(rc.transactions, rc.today);
            const recapChip = !recapChatVisible(rc.today) ? '' : `<button type="button" class="sc-recap" data-q="recap">🎞️ Каким был мой ${esc(rav.name)}?</button>`;
            const nsChip = canMarkNoSpend({ transactions: rc.transactions, today: rc.today, now: new Date() }) ? '<button type="button" data-q="nospend">🧘 Сегодня без трат</button>' : '';
            box.innerHTML = '<button type="button" data-q="examples">💡 Что я умею</button>' + recapChip + nsChip + QUESTIONS.map(q => `<button type="button" data-q="${q.id}">${esc(q.label)}</button>`).join('') +
                Object.entries(MENUS).map(([k, m]) => `<button type="button" class="sc-menu" data-menu="${k}">${esc(m.label)}</button>`).join('');
            return;
        }
        const m = MENUS[menu];
        let inner = '<button type="button" class="sc-back" data-back>‹ Назад</button>';
        if (m.topics) inner += m.topics.map(t => `<button type="button" data-topic="${t.id}">${t.icon} ${esc(t.title)}</button>`).join('');
        else {
            const active = this.loadChallenge()?.status === 'active';
            const items = (menu === 'stats' ? [...this.recapItems(), ...m.items] : m.items);
            inner += items.filter(i => i.id !== 'chstop').map(i => `<button type="button" data-q="${i.id}"${i.group ? ' class="sc-start"' : ''}>${esc(i.label)}</button>`).join('');
            if (active && menu === 'fun') inner += '<button type="button" data-q="chstop">✖ Отказаться от челленджа</button>';
        }
        box.innerHTML = inner;
    }

    // Ответ Акулки с «печатью»: возвращает пузырь, в который кладётся html
    reply(html, delay = 380, emotion = null) {
        const typing = this.bubble('shark', '<span class="sc-dots"><i></i><i></i><i></i></span>', emotion);
        setTimeout(() => {
            typing.querySelector('.sc-bub').innerHTML = forShark(html);
            const log = document.getElementById('sc-log');
            log.scrollTop = log.scrollHeight;
        }, delay);
        return typing;
    }

    openMenu(kind, label) {
        this.bubble('user', esc(label));
        this.showChips();
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

    runAction(id, amt) {
        if (id === 'limit') { this.closeSheet('shark-chat-sheet'); this.openLimitSheet(); return; }
        this.closeSheet('shark-chat-sheet');
        if (id === 'deposit' || id === 'debt' || id === 'income') {
            setTimeout(() => {
                document.getElementById('add-btn')?.click();
                setTimeout(() => {
                    document.querySelector(`#transaction-sheet .chip-btn[data-type="${id}"]`)?.click();
                    const input = document.getElementById(id === 'deposit' ? 'deposit-amount' : 'debt-amount');
                    if (input && amt) {
                        input.value = String(amt).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }, 140);
            }, 150);
            return;
        }
        if (id === 'add') { setTimeout(() => document.getElementById('add-btn')?.click(), 150); return; }
        // план: форма нового плана (можно с черновиком из чата) или правка плана — поверх страницы планировщика
        if (id === 'planNew' || id === 'planEdit') {
            const ref = window._budgetPlannerRef;
            if (!ref?.plannerSheet) { click('[data-nav="planner"]'); return; }
            setTimeout(() => {
                ref.plannerPage?.open?.();
                setTimeout(() => {
                    if (id === 'planEdit') {
                        const p = this.pm?.getPlannerById?.(amt);
                        if (!p) return;
                        if (ref.plannerPage) { ref.plannerPage.activePlannerId = p.id; ref.plannerPage.userPicked = true; ref.plannerPage.render?.(); }
                        ref.plannerSheet.openEdit(p);
                        return;
                    }
                    const sh = ref.plannerSheet;
                    sh.openCreate();
                    const d = amt && typeof amt === 'object' ? amt : null;     // черновик из чата: «Заполнить в форме»
                    if (d) {
                        if (sh.nameInput) sh.nameInput.value = d.name;
                        if (sh.incomeAmount && d.incomePlan.amount) sh.incomeAmount.value = fmt(d.incomePlan.amount);
                        if (sh.incomeDate) sh.incomeDate.value = d.incomePlan.incomeDate;
                        if (sh.startDate) sh.startDate.value = d.startDate;
                        if (sh.periodDays) sh.periodDays.value = d.periodDays;
                        sh.refreshDateFields?.();
                        sh.sheet?.querySelectorAll('.planner-period-chip').forEach(x => x.classList.toggle('active', Number(x.dataset.days) === d.periodDays));
                    }
                }, 250);
            }, 150);
            return;
        }
        // «создай бюджет» без названия: список бюджетов с полем «Новый бюджет»
        if (id === 'budgetNew') {
            setTimeout(() => {
                document.getElementById('current-budget')?.click();
                setTimeout(() => document.getElementById('new-budget-name')?.focus(), 250);
            }, 150);
            return;
        }
        const click = sel => setTimeout(() => document.querySelector(sel)?.click(), 150);
        if (id === 'analytics') { click('[data-nav="analytics"]'); return; }
        if (id === 'settings') { click('[data-nav="profile"]'); return; }
        if (id === 'faq') { click('.open-subpage-btn[data-page="faq-page"]'); return; }
        if (id === 'shark') { click('.open-subpage-btn[data-page="shark-page"]'); return; }
        if (id === 'theme') { click('.open-subpage-btn[data-page="theme-page"]'); return; }
        if (id === 'fx') { setTimeout(() => window.BudgetItFx?.open?.(), 200); return; }
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
