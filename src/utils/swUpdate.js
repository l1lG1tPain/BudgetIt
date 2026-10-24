// Автообновление PWA: следим за новым service-worker, показываем карточку «Доступна новая версия».
// Новый SW сам активируется (skipWaiting + clients.claim), страница просто перезагружается, чтобы взять свежие файлы.
const CHECK_EVERY = 30 * 60 * 1000;   // периодическая проверка, пока приложение открыто
const MIN_GAP = 60 * 1000;            // не чаще раза в минуту при возвращении в приложение
const CARD_ID = 'sw-update-card';

let hadController = false;
let shown = false;
let lastCheck = 0;

function el(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; }

export function showUpdateCard(version) {
    if (shown || typeof document === 'undefined') return;
    shown = true;
    const card = el(`
        <div id="${CARD_ID}" class="sw-card" role="status" aria-live="polite">
            <div class="sw-card-ico" aria-hidden="true">🦈</div>
            <div class="sw-card-txt">
                <b>Доступна новая версия</b>
                <span>${version ? `Версия ${String(version).replace(/^v/, '').replace(/[<>&]/g, '')} · уже скачана` : 'Уже скачана и готова к запуску'}</span>
            </div>
            <button type="button" class="sw-card-go">Обновить</button>
            <button type="button" class="sw-card-x" aria-label="Позже">✕</button>
        </div>`);
    const close = () => { card.classList.remove('show'); setTimeout(() => card.remove(), 320); shown = false; };
    card.querySelector('.sw-card-go').addEventListener('click', () => {
        card.classList.add('busy');
        card.querySelector('.sw-card-go').textContent = 'Обновляю…';
        setTimeout(() => window.location.reload(), 250);
    });
    card.querySelector('.sw-card-x').addEventListener('click', close);
    document.body.appendChild(card);
    requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('show')));
}

async function checkNow() {
    const now = Date.now();
    if (now - lastCheck < MIN_GAP) return;
    lastCheck = now;
    try { const reg = await navigator.serviceWorker.getRegistration(); await reg?.update(); } catch (e) { /* офлайн — ничего страшного */ }
}

export function initSwUpdate() {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    hadController = !!navigator.serviceWorker.controller;

    // 1) SW сообщает, что активировалась новая версия (при самой первой установке карточку не показываем)
    navigator.serviceWorker.addEventListener('message', e => {
        if (e.data?.type === 'SW_UPDATED' && hadController) showUpdateCard(e.data.version);
    });
    // 2) запасной путь: сменился контроллер уже после загрузки страницы
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (hadController) showUpdateCard();
        hadController = true;
    });

    // 3) проверки: возврат в приложение, появление сети, таймер
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkNow(); });
    window.addEventListener('online', () => { lastCheck = 0; checkNow(); });
    window.addEventListener('focus', checkNow);
    setInterval(() => { if (document.visibilityState === 'visible') { lastCheck = 0; checkNow(); } }, CHECK_EVERY);
    setTimeout(checkNow, 4000);
}
