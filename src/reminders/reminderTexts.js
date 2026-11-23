// ===============================
//   reminderTexts.js — тексты напоминаний Акулки
//   Акулка о себе в женском роде. Для «Акула» при показе пропускать через forShark().
//   Характеры: kind (добрая) и normal; строгая использует normal.
//   Вариант выбирается детерминированно по seed (день + тип), без Math.random — чтобы тесты были стабильны.
// ===============================

export const fmtMoney = n => Math.abs(Math.round(Number(n) || 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export function plural(n, forms) {
    const a = Math.abs(Math.round(Number(n) || 0));
    const m10 = a % 10, m100 = a % 100;
    if (m10 === 1 && m100 !== 11) return forms[0];
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
    return forms[2];
}

export const nOps = n => `${n} ${plural(n, ['операция', 'операции', 'операций'])}`;
export const nDays = n => `${n} ${plural(n, ['день', 'дня', 'дней'])}`;

export function hashSeed(str) {
    let h = 0;
    for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h;
}

const fill = (tpl, v) => tpl.replace(/\{(\w+)\}/g, (m, k) => (v[k] === undefined ? '' : String(v[k])));

// Тексты. title — заголовок уведомления, body — варианты тела.
export const REMINDER_TEXTS = {
    // Был хотя бы один расход, лимит известен: {spent} {left} {count} {extra}
    eveningLeft: {
        title: { kind: 'Итог дня 🦈', normal: 'Итог дня' },
        kind: [
            'Сегодня потрачено {spent} {cur}, в лимите осталось {left}. {count} 💙 {extra}',
            'День прошёл спокойно: {spent} {cur}, запас до лимита {left}. {count} ✨ {extra}',
            'Я посчитала: {spent} {cur} за день, ещё {left} в запасе. {count} 🌊 {extra}'
        ],
        normal: [
            'Потрачено {spent} {cur}, до лимита осталось {left}. {count}. {extra}',
            'За день {spent} {cur}, в лимите ещё {left}. {count}. {extra}',
            'Итог дня: {spent} {cur}. Запас по лимиту — {left}. {count}. {extra}'
        ]
    },
    // Лимит превышен: {spent} {over} {count} {extra}
    eveningOver: {
        title: { kind: 'Итог дня 🦈', normal: 'Итог дня' },
        kind: [
            'Сегодня потрачено {spent} {cur}, это на {over} больше дневного лимита. Бывает 💙 {count}. {extra}',
            'День вышел щедрым: {spent} {cur}, лимит превышен на {over}. Завтра выровняем 🌊 {count}.'
        ],
        normal: [
            'Потрачено {spent} {cur}, лимит превышен на {over}. {count}. {extra}',
            'За день {spent} {cur}, это на {over} выше лимита. {count}.'
        ]
    },
    // Лимита нет: {spent} {count} {extra}
    eveningPlain: {
        title: { kind: 'Итог дня 🦈', normal: 'Итог дня' },
        kind: [
            'Сегодня потрачено {spent} {cur}. {count} 💙 {extra}',
            'Итог по расходам: {spent} {cur}. {count} ✨ {extra}'
        ],
        normal: [
            'За день потрачено {spent} {cur}. {count}. {extra}',
            'Расходы за день: {spent} {cur}. {count}. {extra}'
        ]
    },
    // Только доход или переводы, расходов нет: {count}
    eveningNoSpend: {
        title: { kind: 'Итог дня 🦈', normal: 'Итог дня' },
        kind: [
            'Сегодня записано без трат: {count} 💙 {extra}',
            'Трат за день нет, все записи в порядке: {count} ✨ {extra}'
        ],
        normal: [
            'Расходов за день нет. {count}. {extra}',
            'Трат не записано. {count}. {extra}'
        ]
    },
    // Записей за день не было
    eveningEmpty: {
        title: { kind: 'Как прошёл день? 🦈', normal: 'Как прошёл день?' },
        kind: [
            'Сегодня записей нет. Был день без трат или не успела записать? Подскажи, и я всё отмечу 💙',
            'Тишина в кошельке! Если день без трат, отметь это одним нажатием. А если что-то купила, внеси 🌊',
            'За сегодня ничего не записано. Расскажешь, как прошёл день? 🐠'
        ],
        normal: [
            'Сегодня записей нет. День без трат или забыла записать?',
            'За день ни одной записи. Отметь день без трат или внеси расходы.',
            'Сегодня пусто. Были траты? Запиши, пока не забыла.'
        ]
    },
    // Несколько дней без записей: {days}
    gap: {
        title: { kind: 'Давно не виделись 🦈', normal: 'Нет записей' },
        kind: [
            'Уже {days} без записей. Загляни, внеси последние траты, и цифры снова будут честными 💙',
            'Я скучала! {days} ничего не записано. Давай наверстаем, это быстро ✨'
        ],
        normal: [
            'Уже {days} без записей. Внеси траты, чтобы аналитика не врала.',
            '{days} без записей. Загляни и обнови данные.'
        ]
    },
    // Плановый расход: {item} {amount} {when}  (when: «сегодня» | «завтра»)
    plannerExpense: {
        title: { kind: 'План месяца 🗓️', normal: 'План месяца' },
        kind: [
            'По плану {when}: «{item}», {amount} {cur}. Не забудь заложить 💙',
            '{when} запланирован платёж «{item}» на {amount} {cur} 🗓️'
        ],
        normal: [
            'По плану {when}: «{item}», {amount} {cur}.',
            '{when} платёж по плану: «{item}», {amount} {cur}.'
        ]
    },
    // Плановый доход: {item} {amount} {when}
    plannerIncome: {
        title: { kind: 'План месяца 🗓️', normal: 'План месяца' },
        kind: [
            'Ждём поступление {when}: «{item}», {amount} {cur}. Отметь, когда придёт 💙',
            '{when} по плану доход «{item}», {amount} {cur} ✨'
        ],
        normal: [
            'По плану {when} доход: «{item}», {amount} {cur}.',
            'Ожидается поступление {when}: «{item}», {amount} {cur}.'
        ]
    },
    // Доход по плану просрочен: {item} {amount}
    plannerIncomeOverdue: {
        title: { kind: 'План месяца 🗓️', normal: 'План месяца' },
        kind: [
            'Доход «{item}» должен был прийти, но не отмечен. Пришёл? Внеси, и план пересчитается 💙'
        ],
        normal: [
            'Доход «{item}» по плану уже прошёл, а записи нет. Внеси его, чтобы план пересчитался.'
        ]
    },
    // Вклад: {item} {when}  (when: «сегодня» | «через 3 дня»)
    deposit: {
        title: { kind: 'Вклад 💰', normal: 'Вклад' },
        kind: [
            'Срок вклада «{item}» заканчивается {when}. Загляни, решим, что с ним делать 💙',
            'Вклад «{item}» дозревает: срок истекает {when} 🌱'
        ],
        normal: [
            'Срок вклада «{item}» заканчивается {when}.',
            'Вклад «{item}»: срок истекает {when}. Проверь условия.'
        ]
    },
    // Недельный итог: {total} {avg} {top}
    weekly: {
        title: { kind: 'Итоги недели 🌊', normal: 'Итоги недели' },
        kind: [
            'За прошлую неделю ушло {total} {cur}, в среднем {avg} в день. Главная статья: «{top}» 🦈',
            'Неделя позади! Потрачено {total} {cur}, больше всего на «{top}». Заглянем в аналитику? 📊'
        ],
        normal: [
            'За неделю {total} {cur}, в среднем {avg} в день. Лидер трат: «{top}».',
            'Итоги недели: {total} {cur}, чаще всего «{top}».'
        ]
    },
    // Месячный итог: {total} {top} {income}
    monthly: {
        title: { kind: 'Итоги месяца 🎉', normal: 'Итоги месяца' },
        kind: [
            'Месяц закрыт! Расходы {total} {cur}, поступления {income} {cur}. Главная статья: «{top}». Итоги уже ждут 💙',
            'Итог месяца: потрачено {total} {cur}, пришло {income} {cur}. Больше всего на «{top}» ✨'
        ],
        normal: [
            'Итоги месяца: расходы {total} {cur}, поступления {income} {cur}. Лидер трат: «{top}».',
            'Месяц закрыт. Потрачено {total} {cur}, получено {income} {cur}, главная статья «{top}».'
        ]
    },
    // Прощание перед паузой
    farewell: {
        title: { kind: 'Я притихну 🦈', normal: 'Напоминания на паузе' },
        kind: [
            'Похоже, сейчас не до меня, и это нормально. Я притихну и не буду напоминать. Включить снова можно в настройках 💙'
        ],
        normal: [
            'Напоминания остались без ответа, поэтому ставлю их на паузу. Включить снова можно в настройках.'
        ]
    }
};

const charKey = c => (c === 'kind' ? 'kind' : 'normal');

export function pickVariant(list, seed) {
    if (!Array.isArray(list) || !list.length) return '';
    return list[hashSeed(seed) % list.length];
}

// Собирает { title, body } по ключу; extra и пустые хвосты аккуратно подчищаются.
export function renderReminderText(key, vars = {}, { character = 'normal', seed = '' } = {}) {
    const entry = REMINDER_TEXTS[key];
    if (!entry) return { title: '', body: '' };
    const c = charKey(character);
    const body = fill(pickVariant(entry[c], `${seed}:${key}`), { cur: '', extra: '', ...vars });
    return {
        title: entry.title[c],
        body: body
            .replace(/\s+([.,!?])/g, '$1')
            .replace(/\.\s*\./g, '.')
            .replace(/\s{2,}/g, ' ')
            .replace(/\.\s*$/, '.')
            .trim()
    };
}
