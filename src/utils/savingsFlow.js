// ===============================
//   savingsFlow.js — чистые правила «сколько отложено» (без DOM)
//   Общие для «Счетов» и Акулки (цель, накопления за месяц, итог месяца, правило 50/30/20).
// ===============================

// Категории «Залётом», связанные со вкладами: «🏦 Вклад», «🏦 Перевод на вклад»,
// «🏦 Перевод с вклада», «🏦 Депозит», «🏦 Проценты от вклада». Это обычные траты/поступления.
export const DEPOSIT_CAT_RE = /(вклад|депозит|deposit|vklad|depozit)/i;
export const INTEREST_RE = /процент|interest|percent/i;
const FROM_RE = /(с|со|из)\s+(вклада|депозита)|снят|списан/i;
const TO_RE = /(на|в)\s+(вклад|депозит)|пополн/i;

// kind: 'in' — деньги ушли на вклад, 'out' — вернулись со вклада, null — не про вклады
export function classifyDepositFlow(tx) {
    if (!tx || (tx.type !== 'expense' && tx.type !== 'income')) return null;
    const cat = String(tx.category || '');
    if (!DEPOSIT_CAT_RE.test(cat)) return null;
    // «Проценты от вклада» из выписок (Click/Alliance Pay) на деле — все поступления с вклада: тело + проценты,
    // отличить проценты от возврата тела нельзя, поэтому считаем их возвратом со вклада
    if (INTEREST_RE.test(cat)) return tx.type === 'income' ? 'out' : null;
    // направление берём из самой категории: в выписке вклада «Перевод с вклада» приходит расходом,
    // а «Перевод на вклад» — поступлением; для нейтральных «Вклад»/«Депозит» решает тип операции
    if (FROM_RE.test(cat)) return 'out';
    if (TO_RE.test(cat)) return 'in';
    return tx.type === 'expense' ? 'in' : 'out';
}

// Насколько операция изменила отложенное: пополнение +, снятие −, «💾 Уже лежало» 0
// (эти деньги и так были на вкладе — это начальный остаток, а не новое накопление).
export function savingsDelta(t) {
    if (!t) return 0;
    const a = Number(t.amount) || 0;
    if (t.type === 'deposit') {
        const st = String(t.status || '');
        if (st.includes('Уже лежало')) return 0;
        if (st.trim() === '➖ Снятие') return -a;
        return a;
    }
    const flow = classifyDepositFlow(t);
    return flow === 'in' ? a : flow === 'out' ? -a : 0;
}

// Чистое изменение отложенного за даты [from, to] (строки YYYY-MM-DD, включительно)
export function netSavings(tx = [], from = '', to = '9999-12-31') {
    let net = 0, topups = 0;
    for (const t of tx) {
        if (!t?.date || t.date < from || t.date > to) continue;
        const d = savingsDelta(t);
        net += d;
        if (d > 0) topups++;
    }
    return { net, topups };
}
