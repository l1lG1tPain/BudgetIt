// chatContext.js — адаптер: данные приложения → ctx для parseUtterance (шаг 1 этапа 2 акульки).
// Чистая функция: без DOM и localStorage, всё приходит аргументами.
export const CHAT_TZ = 'Asia/Tashkent';

const strings = list => (Array.isArray(list) ? list.filter(x => typeof x === 'string') : []);

/**
 * @param {{expense?: Array, income?: Array, custom?: {expense?: string[], income?: string[]}, transactions?: Array, now?: Date, timezone?: string}} src
 *   expense/income — константы категорий (строки или группы { label, options }), custom — свои категории пользователя.
 * @returns {{today: Date, timezone: string, categories: {expense: Array, income: Array}, history: Array}}
 */
export function buildParserContext({ expense = [], income = [], custom = null, transactions = [], now = new Date(), timezone = CHAT_TZ } = {}) {
    return {
        today: now,
        timezone,
        categories: {
            expense: [...expense, ...strings(custom?.expense)],
            income: [...income, ...strings(custom?.income)],
            // свои категории отдельно: парсер ищет их первыми (без своих ключа нет)
            ...(custom ? { custom: { expense: strings(custom.expense), income: strings(custom.income) } } : {})
        },
        history: Array.isArray(transactions) ? transactions : []
    };
}
