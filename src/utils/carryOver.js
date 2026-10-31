// carryOver.js — единое правило переноса остатка из месяца в месяц.
// 'reset' (по умолчанию) — месяц, закрытый в минус, не переносится: следующий начинается с нуля;
// 'carry' — остаток переносится со знаком (перерасход уменьшает следующий месяц).
const KEY = 'budgetit:carryMode';
export const CARRY_EVENT = 'budgetit:carry-changed';

export function normalizeCarryMode(v) {
    return v === 'carry' ? 'carry' : 'reset';
}

export function getCarryMode() {
    try {
        if (typeof localStorage === 'undefined') return 'reset';
        return normalizeCarryMode(localStorage.getItem(KEY));
    } catch (_) { return 'reset'; }
}

export function setCarryMode(mode) {
    const next = normalizeCarryMode(mode);
    const prev = getCarryMode();
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, next); } catch (_) { /* ignore */ }
    if (next !== prev && typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        try { window.dispatchEvent(new CustomEvent(CARRY_EVENT, { detail: { mode: next } })); } catch (_) { /* ignore */ }
    }
    return next;
}

/** Остаток, с которого начинается следующий месяц. */
export function carryNext(balance, mode) {
    return mode === 'reset' ? Math.max(0, balance) : balance;
}
