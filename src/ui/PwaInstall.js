// ===============================
//   PwaInstall.js — умное предложение установить BudgetIt как приложение
//   • Android / Chrome: по кнопке сразу открывается системный установщик;
//   • iPhone / iPad: короткая инструкция «Поделиться → На экран Домой»;
//   • уже установлено — ничего не показываем;
//   • «Позже» откладывает показ (3 дня, после трёх отказов — 30 дней), «Не предлагать» отключает совсем.
// ===============================
import { sharkImage } from '../shark/SharkMood.js';

const KEY = 'budgetit:pwa';
const DAY = 86400000;

let deferred = null;     // событие beforeinstallprompt (Android / Chrome)
let card = null;
let scrim = null;
let cardManual = false;
let shownThisSession = false;

const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } };
const write = patch => { try { localStorage.setItem(KEY, JSON.stringify({ ...read(), ...patch })); } catch (e) { /* ignore */ } };

export function isStandalone() {
    try {
        return !!(window.matchMedia?.('(display-mode: standalone)').matches
            || window.matchMedia?.('(display-mode: fullscreen)').matches
            || window.matchMedia?.('(display-mode: minimal-ui)').matches
            || navigator.standalone === true);
    } catch (e) { return false; }
}

export function isIOS() {
    const ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

const isAndroid = () => /Android/i.test(navigator.userAgent || '');
const isMobileView = () => !!window.matchMedia?.('(max-width: 900px)').matches;

export const isInstalled = () => isStandalone() || read().installed === true;

// Можно ли вообще что-то предложить на этом устройстве
export function canOfferInstall() {
    if (isInstalled()) return false;
    return !!deferred || isIOS() || isAndroid();
}

function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

const SHARE_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3"/><path d="M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>';
const PLUS_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></svg>';
const DOTS_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>';

function stepsHtml(mode) {
    if (mode === 'ios') {
        return `<ol class="pwa-steps">
            <li><i>${SHARE_SVG}</i><span>Нажми <b>«Поделиться»</b> внизу экрана Safari</span></li>
            <li><i>${PLUS_SVG}</i><span>Выбери <b>«На экран „Домой“»</b></span></li>
            <li><i>✓</i><span>Нажми <b>«Добавить»</b>, и значок появится рядом с другими приложениями</span></li>
        </ol>
        <p class="pwa-note">Если открыто не в Safari, сначала открой эту страницу в Safari.</p>`;
    }
    return `<ol class="pwa-steps">
        <li><i>${DOTS_SVG}</i><span>Открой меню браузера <b>⋮</b> справа сверху</span></li>
        <li><i>${PLUS_SVG}</i><span>Выбери <b>«Установить приложение»</b> или <b>«Добавить на главный экран»</b></span></li>
        <li><i>✓</i><span>Подтверди, и BudgetIt появится среди приложений</span></li>
    </ol>`;
}

function close(animated = true) {
    if (!card) return;
    const el = card;
    const bg = scrim;
    card = null;
    scrim = null;
    el.classList.remove('is-open');
    bg?.classList.remove('is-open');
    setTimeout(() => { el.remove(); bg?.remove(); }, animated ? 320 : 0);
}

function snooze() {
    const s = read();
    const n = (s.dismissed || 0) + 1;
    write({ dismissed: n, until: Date.now() + (n >= 3 ? 30 : 3) * DAY });
}

async function runInstall() {
    if (!deferred) return false;
    try {
        deferred.prompt();
        const choice = await deferred.userChoice;
        deferred = null;
        if (choice?.outcome === 'accepted') write({ installed: true });
        else snooze();
        return true;
    } catch (e) {
        deferred = null;
        return false;
    }
}

function render({ manual = false } = {}) {
    if (card) return;
    const mode = deferred ? 'native' : isIOS() ? 'ios' : 'manual';
    const el = document.createElement('section');
    el.id = 'pwa-install';
    el.className = 'pwa-install';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Установить BudgetIt');

    const lead = mode === 'native'
        ? 'Один тап, и BudgetIt откроется как обычное приложение: быстро, без адресной строки и даже без интернета.'
        : 'Добавь BudgetIt на главный экран: он будет открываться как обычное приложение, быстро, без адресной строки и даже без интернета.';

    el.innerHTML = `
        <div class="pwa-top">
            <img src="${escapeHtml(sharkImage('welcome'))}" alt="" class="pwa-shark">
            <div class="pwa-head">
                <b>Привет! Давай я поселюсь у тебя на экране</b>
                <small>${escapeHtml(lead)}</small>
            </div>
            <button type="button" class="pwa-x" data-act="later" aria-label="Закрыть">×</button>
        </div>
        ${mode === 'native' ? '' : stepsHtml(mode)}
        <div class="pwa-actions">
            ${mode === 'native' ? '<button type="button" class="pwa-main" data-act="install">Установить</button>' : '<button type="button" class="pwa-main" data-act="ok">Понятно</button>'}
            <button type="button" class="pwa-ghost" data-act="later">${manual ? 'Закрыть' : 'Позже'}</button>
        </div>
        ${manual ? '' : '<button type="button" class="pwa-never" data-act="never">Больше не предлагать</button>'}`;

    el.addEventListener('click', async e => {
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (!act) return;
        if (act === 'install') {
            const started = await runInstall();
            close();
            if (!started) {
                // системное окно недоступно — показываем инструкцию вручную
                setTimeout(() => render({ manual: true }), 360);
            }
        } else if (act === 'ok') {
            if (!manual) snooze();
            close();
        } else if (act === 'later') {
            if (!manual) snooze();
            close();
        } else if (act === 'never') {
            write({ never: true });
            close();
        }
    });

    scrim = document.createElement('div');
    scrim.className = 'pwa-scrim';
    scrim.addEventListener('click', () => { if (!manual) snooze(); close(); });
    document.body.appendChild(scrim);
    document.body.appendChild(el);
    card = el;
    cardManual = manual;
    requestAnimationFrame(() => requestAnimationFrame(() => scrim?.classList.add('is-open')));
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-open')));
}

// Можно ли показывать само (без запроса пользователя)
function mayAutoShow() {
    if (shownThisSession || isInstalled()) return false;
    const s = read();
    if (s.never) return false;
    if (s.until && Date.now() < s.until) return false;
    if (!isMobileView()) return false;
    return !!deferred || isIOS();
}

function tryAutoShow(attempt = 0) {
    if (!mayAutoShow()) return;
    // не перебиваем пользователя, пока открыт лист, окно или страница настроек
    const busy = document.querySelector('.bottom-sheet:not(.hidden), .modal:not(.hidden), .fullscreen-sheet:not(.hidden)');
    if (busy && attempt < 8) { setTimeout(() => tryAutoShow(attempt + 1), 5000); return; }
    if (busy) return;
    shownThisSession = true;
    render();
}

// Вызывается из строки «Установить приложение» в настройках
export function openInstall() {
    if (isInstalled()) return false;
    render({ manual: true });
    return true;
}

export function initPwaInstall() {
    window.addEventListener('appinstalled', () => {
        write({ installed: true });
        deferred = null;
        close(false);
        try { window._renderSettingsList?.(); } catch (e) { /* ignore */ }
    });
    // Старая плавающая кнопка больше не нужна
    document.getElementById('install-btn')?.remove();
    // Android / Chrome мог прислать событие раньше, чем модуль успел подписаться
    if (deferred) setTimeout(() => tryAutoShow(), 3500);
    else if (isIOS()) setTimeout(() => tryAutoShow(), 3500);
}

// Подписка на системное событие нужна как можно раньше
if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        deferred = e;
        try { window._renderSettingsList?.(); } catch (err) { /* ignore */ }
        if (card) {
            // карточка с инструкцией уже на экране, а системный установщик стал доступен: переключаем на кнопку «Установить»
            const manual = cardManual;
            close(false);
            render({ manual });
        } else {
            setTimeout(() => tryAutoShow(), 3500);
        }
    });
}
