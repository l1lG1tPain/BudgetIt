// build.js — превращает намерение парсера в операцию ровно того формата, который пишут формы приложения.
// Запись — только через BudgetManager.addTransaction(tx); эта функция ничего не пишет.
import { cleanText } from '../../utils/sanitize.js';

/**
 * @returns {object|null} операция или null, если намерение неполное (есть missing) и записывать нельзя
 */
export function buildTransaction(intent, { id = Date.now() } = {}) {
    if (!intent || intent.kind !== 'add_transaction' || intent.missing?.length) return null;
    const t = intent.tx;
    if (!Number.isInteger(t.amount) || t.amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(t.date || '')) return null;
    const note = t.note ? cleanText(t.note, 100) : '';
    if (t.type === 'expense' || t.type === 'income') {
        if (!t.category) return null;
        const tx = { id, type: t.type, date: t.date, category: t.category, amount: t.amount };
        // у расходов заметка в приложении живёт как название позиции (её показывает список операций)
        if (note && t.type === 'expense') tx.products = [{ name: note.slice(0, 25), quantity: 1, price: t.amount }];
        else if (note) tx.description = note;
        return tx;
    }
    if (t.type === 'debt') {
        if (!t.name || (t.direction !== 'owe' && t.direction !== 'owed')) return null;
        const tx = { id, type: 'debt', date: t.date, name: cleanText(t.name, 60), initialAmount: t.amount, remainingAmount: t.amount, paid: false, direction: t.direction, payments: [] };
        if (note) tx.description = note;
        return tx;
    }
    if (t.type === 'deposit') {
        if (t.depositId) return { id, type: 'deposit', depositId: t.depositId, date: t.date, name: t.name, amount: t.amount, status: t.status };
        if (!(t.annualRate > 0)) return null;
        return { id, type: 'deposit', depositId: id, date: t.date, name: cleanText(t.name || 'Вклад', 60), amount: t.amount, status: '📥 Вклад', annualRate: t.annualRate, termMonths: t.termMonths || 0 };
    }
    return null;
}
