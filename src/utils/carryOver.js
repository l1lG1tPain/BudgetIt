// carryOver.js — единое правило переноса остатка из месяца в месяц.
// 'carry' — остаток переносится со знаком (перерасход уменьшает следующий месяц);
// 'reset' — месяц, закрытый в минус, не переносится: следующий начинается с нуля.
const KEY = 'budgetit:carryMode';
export const CARRY_EVENT = 'budgetit:carry-changed';

export function normalizeCarryMode(v) {
    return v === 'reset' ? 'reset' : 'carry';
}

export function getCarryMode() {
    try {
        if (typeof localStorage === 'undefined') return 'carry';
        return normalizeCarryMode(localStorage.getItem(KEY));
    } catch (_) { return 'carry'; }
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
