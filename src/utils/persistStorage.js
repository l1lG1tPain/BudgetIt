// Защита данных от автоочистки браузера + отправка копии наружу (Диск, Telegram, файлы).
// persist() защищает от удаления при нехватке места. От ручной очистки данных сайта
// защищает только копия вне браузера, поэтому рядом лежит отправка файла.

const DISMISS_KEY = 'budgetit:persist:dismissed';
const DAY = 24 * 60 * 60 * 1000;

export function isPersistSupported() {
    return typeof navigator !== 'undefined'
        && !!navigator.storage
        && typeof navigator.storage.persist === 'function'
        && typeof navigator.storage.persisted === 'function';
}

export async function getStorageStatus() {
    const out = { supported: isPersistSupported(), persisted: false, usage: 0, quota: 0 };
    if (!out.supported) return out;
    try { out.persisted = !!(await navigator.storage.persisted()); } catch { /* ignore */ }
    try {
        if (typeof navigator.storage.estimate === 'function') {
            const e = await navigator.storage.estimate();
            out.usage = Number(e.usage) || 0;
            out.quota = Number(e.quota) || 0;
        }
    } catch { /* ignore */ }
    return out;
}

/** Просит браузер не удалять данные сайта. Без диалога в Chrome, решение принимает браузер. */
export async function requestPersistentStorage() {
    if (!isPersistSupported()) return false;
    try {
        if (await navigator.storage.persisted()) return true;
        return !!(await navigator.storage.persist());
    } catch {
        return false;
    }
}

export function getDismissedAt(storage = globalThis.localStorage) {
    try { return Number(storage.getItem(DISMISS_KEY)) || 0; } catch { return 0; }
}

export function markDismissed(now = Date.now(), storage = globalThis.localStorage) {
    try { storage.setItem(DISMISS_KEY, String(now)); } catch { /* ignore */ }
}

/** Чистая логика: когда стоит предложить защиту. */
export function shouldOfferProtection({
    supported, persisted, txCount, dismissedAt = 0,
    now = Date.now(), minTx = 5, cooldownDays = 14
} = {}) {
    if (!supported || persisted) return false;
    if ((Number(txCount) || 0) < minTx) return false;
    if (dismissedAt && now - dismissedAt < cooldownDays * DAY) return false;
    return true;
}

export function formatBytes(n) {
    const v = Number(n) || 0;
    if (v < 1024) return `${Math.round(v)} Б`;
    if (v < 1024 * 1024) return `${(v / 1024).toFixed(v < 10240 ? 1 : 0)} КБ`;
    if (v < 1024 * 1024 * 1024) return `${(v / 1024 / 1024).toFixed(1)} МБ`;
    return `${(v / 1024 / 1024 / 1024).toFixed(1)} ГБ`;
}

/** Статус для карточки. */
export function describeStatus(s) {
    if (!s || !s.supported) {
        return { ok: false, title: 'Защита недоступна', text: 'Этот браузер не умеет закреплять хранилище. Отправь копию данных в надёжное место.' };
    }
    if (s.persisted) {
        return { ok: true, title: 'Хранилище закреплено', text: 'Браузер не удалит данные при нехватке места. Ручная очистка данных сайта всё равно сотрёт их, поэтому держи копию вне телефона.' };
    }
    return { ok: false, title: 'Данные не закреплены', text: 'Браузер может удалить их при нехватке места или очистке. Нажми «Защитить» и отправь копию в Диск или Telegram.' };
}

/** Отправка копии через системное меню «Поделиться». 'shared' | 'cancelled' | 'unsupported' | 'error' */
export async function shareBackupFile(payload, filename) {
    try {
        if (typeof File === 'undefined' || !navigator.share || !navigator.canShare) return 'unsupported';
        const file = new File([JSON.stringify(payload, null, 2)], filename, { type: 'application/json' });
        if (!navigator.canShare({ files: [file] })) return 'unsupported';
        await navigator.share({ files: [file], title: 'BudgetIt: копия данных' });
        return 'shared';
    } catch (e) {
        return e && e.name === 'AbortError' ? 'cancelled' : 'error';
    }
}
