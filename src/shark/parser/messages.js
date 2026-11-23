// messages.js — короткие нейтральные вопросы-уточнения (ru/uz/en).
// Голос и характер акулки добавляет этап 2 (UI); здесь только суть вопроса, чтобы парсер был самодостаточным.
const Q = {
    amount: {
        ru: 'Не поняла сумму. Сколько там было?',
        uz: 'Summani tushunmadim. Qancha edi?',
        en: "Couldn't catch the amount. How much was it?"
    },
    date: {
        ru: 'Не поняла дату. Какого числа это было?',
        uz: 'Sanani tushunmadim. Qaysi kuni edi?',
        en: "Couldn't catch the date. When was it?"
    },
    category: {
        ru: 'В какую категорию записать?',
        uz: 'Qaysi toifaga yozay?',
        en: 'Which category should I use?'
    },
    name: {
        ru: 'Кому или у кого? Назови имя.',
        uz: 'Kimga yoki kimdan? Ismini ayting.',
        en: 'Who is it with? Give me a name.'
    },
    direction: {
        ru: 'Кто кому должен: ты или тебе?',
        uz: 'Kim kimga qarzdor: siz yoki sizga?',
        en: 'Who owes whom: you or them?'
    },
    deposit: {
        ru: 'На какой вклад?',
        uz: 'Qaysi omonatga?',
        en: 'Which deposit?'
    },
    rate: {
        ru: 'Под какой процент годовых вклад?',
        uz: 'Omonat yillik necha foiz?',
        en: 'What annual rate is the deposit?'
    },
    debtTarget: {
        ru: 'Какой долг гасим? Уточни, кто и сколько.',
        uz: 'Qaysi qarz? Kim va qancha ekanini ayting.',
        en: 'Which debt is it? Who and how much?'
    },
    future_date: {
        ru: 'Эта дата в будущем. Записать на неё или на сегодня?',
        uz: 'Bu sana kelajakda. Shu sanaga yozaymi yoki bugunga?',
        en: 'That date is in the future. Record it on that date or today?'
    },
    category_query: {
        ru: 'Не нашла такую категорию. Какую посчитать?',
        uz: 'Bunday toifa topilmadi. Qaysi toifani hisoblay?',
        en: "Couldn't find that category. Which one should I total?"
    }
};

export function clarificationFor(field, lang = 'ru', ctx = {}) {
    const table = Q[field] || Q.amount;
    const out = { field: field === 'category_query' ? 'category' : field, question: table[lang] || table.ru };
    const it = ctx.intent;
    if (field === 'category' && it?.suggestions?.length) out.options = it.suggestions.slice(0, 3);
    if (field === 'deposit' && it?.suggestions?.length) out.options = it.suggestions.slice(0, 4);
    if (field === 'direction') out.options = ['owe', 'owed'];
    if (ctx.word) out.word = ctx.word;
    return out;
}
