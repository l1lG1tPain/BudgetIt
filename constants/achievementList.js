export const ALL_ACHIEVEMENTS = [

    // ─────────────────────────────────────────
    // 🔢 Количество транзакций
    // ─────────────────────────────────────────
    { id: 'first-transaction', label: '🥇 Первая транзакция',           condition: (tx) => tx >= 1 },
    { id: 'tx-20',             label: '🥈 Уже 20 транзакций',           condition: (tx) => tx >= 20 },
    { id: 'tx-50',             label: '🏅 50 транзакций — стабильность', condition: (tx) => tx >= 50 },
    { id: 'tx-100',            label: '💯 100 — мощно',                  condition: (tx) => tx >= 100 },
    { id: 'tx-150',            label: '📊 150 движений по бюджету',      condition: (tx) => tx >= 150 },
    { id: 'tx-200',            label: '📊 200 — финансовый путь',        condition: (tx) => tx >= 200 },
    { id: 'tx-250',            label: '📊 Четверть тысячи транзакций',   condition: (tx) => tx >= 250 },
    { id: 'tx-300',            label: '📊 300 — ты в деле',             condition: (tx) => tx >= 300 },
    { id: 'tx-400',            label: '📊 400 шагов к контролю',        condition: (tx) => tx >= 400 },
    { id: 'tx-500',            label: '📊 Полтысячи транзакций!',        condition: (tx) => tx >= 500 },
    { id: 'tx-750',            label: '📊 750 — почти рекорд',           condition: (tx) => tx >= 750 },
    { id: 'tx-999',            label: '📊 999 — ещё 1 и ты легенда',    condition: (tx) => tx >= 999 },
    { id: 'tx-1000',           label: '🏆 1000! Ты легенда',             condition: (tx) => tx >= 1000 },

    // ─────────────────────────────────────────
    // 🧩 Уровни
    // ─────────────────────────────────────────
    { id: 'level-2', label: '🔓 Открыт уровень 2',          condition: (_, __, ___, level) => level >= 2 },
    { id: 'level-3', label: '🔓 Уровень 3 — неплохо!',      condition: (_, __, ___, level) => level >= 3 },
    { id: 'level-4', label: '🔓 Уровень 4 — уверенный рост', condition: (_, __, ___, level) => level >= 4 },
    { id: 'level-5', label: '🔓 Уровень 5 — середина пути', condition: (_, __, ___, level) => level >= 5 },
    { id: 'level-6', label: '🔓 Уровень 6 — почти вершина', condition: (_, __, ___, level) => level >= 6 },
    { id: 'level-7', label: '🔓 Уровень 7 — максимальный!', condition: (_, __, ___, level) => level >= 7 },

    // ─────────────────────────────────────────
    // 📉 Долги
    // ─────────────────────────────────────────
    { id: 'debt-1',  label: '📉 Первый долг — бывает',    condition: (tx, t) => tx >= 1 && t.debtCount >= 1 },
    { id: 'debt-5',  label: '📉 5 долгов — уже практика', condition: (_, t) => t.debtCount >= 5 },
    { id: 'debt-10', label: '📉 10 долгов — крепко',      condition: (_, t) => t.debtCount >= 10 },
    { id: 'debt-20', label: '📉 20 долгов — держись!',    condition: (_, t) => t.debtCount >= 20 },
    { id: 'debt-50', label: '📉 50 долгов — долговой мастер', condition: (_, t) => t.debtCount >= 50 },

    // ─────────────────────────────────────────
    // 💸 Потрачено
    // ─────────────────────────────────────────
    { id: 'spent-1m',   label: '💸 Потрачено 1 млн',      condition: (_, t) => t.totalExpense >= 1_000_000 },
    { id: 'spent-5m',   label: '💸 Потрачено 5 млн',      condition: (_, t) => t.totalExpense >= 5_000_000 },
    { id: 'spent-10m',  label: '💸 Потрачено 10 млн',     condition: (_, t) => t.totalExpense >= 10_000_000 },
    { id: 'spent-20m',  label: '💸 Потрачено 20 млн',     condition: (_, t) => t.totalExpense >= 20_000_000 },
    { id: 'spent-50m',  label: '💸 Потрачено 50 млн',     condition: (_, t) => t.totalExpense >= 50_000_000 },
    { id: 'spent-75m',  label: '💸 Потрачено 75 млн',     condition: (_, t) => t.totalExpense >= 75_000_000 },
    { id: 'spent-100m', label: '💸 Потрачено 100 млн',    condition: (_, t) => t.totalExpense >= 100_000_000 },
    { id: 'spent-500m', label: '💸 Полмиллиарда!',        condition: (_, t) => t.totalExpense >= 500_000_000 },
    { id: 'spent-750m', label: '💸 Потрачено 750 млн',    condition: (_, t) => t.totalExpense >= 750_000_000 },
    { id: 'spent-999m', label: '💸 Потрачено 999 млн',    condition: (_, t) => t.totalExpense >= 999_000_000 },
    { id: 'spent-1b',   label: '🪙 Потрачен 1 миллиард',  condition: (_, t) => t.totalExpense >= 1_000_000_000 },
    { id: 'spent-2b',   label: '🪙 Потрачен 2 миллиарда', condition: (_, t) => t.totalExpense >= 2_000_000_000 },
    { id: 'spent-3b',   label: '🪙 Потрачено 3 млрд',     condition: (_, t) => t.totalExpense >= 3_000_000_000 },
    { id: 'spent-5b',   label: '🪙 Потрачено 5 млрд',     condition: (_, t) => t.totalExpense >= 5_000_000_000 },
    { id: 'spent-7b',   label: '🪙 Потрачено 7 млрд',     condition: (_, t) => t.totalExpense >= 7_000_000_000 },
    { id: 'spent-10b',  label: '🪙 Потрачено 10 млрд',    condition: (_, t) => t.totalExpense >= 10_000_000_000 },

    // ─────────────────────────────────────────
    // 💰 Доходы
    // ─────────────────────────────────────────
    { id: 'income-5m',   label: '💰 Заработано 5 млн',     condition: (_, t) => t.totalIncome >= 5_000_000 },
    { id: 'income-10m',  label: '💰 Заработано 10 млн',    condition: (_, t) => t.totalIncome >= 10_000_000 },
    { id: 'income-50m',  label: '💰 Доход 50 млн',         condition: (_, t) => t.totalIncome >= 50_000_000 },
    { id: 'income-75m',  label: '💰 Доход 75 млн',         condition: (_, t) => t.totalIncome >= 75_000_000 },
    { id: 'income-100m', label: '💰 Доход 100 млн',        condition: (_, t) => t.totalIncome >= 100_000_000 },
    { id: 'income-500m', label: '💰 Полмиллиарда дохода',  condition: (_, t) => t.totalIncome >= 500_000_000 },
    { id: 'income-750m', label: '💰 Заработано 750 млн',   condition: (_, t) => t.totalIncome >= 750_000_000 },
    { id: 'income-999m', label: '💰 Заработано 999 млн',   condition: (_, t) => t.totalIncome >= 999_000_000 },
    { id: 'income-1b',   label: '💎 Миллиардер!',          condition: (_, t) => t.totalIncome >= 1_000_000_000 },
    { id: 'income-2b',   label: '💎 Заработано 2 млрд',    condition: (_, t) => t.totalIncome >= 2_000_000_000 },
    { id: 'income-3b',   label: '💎 Заработано 3 млрд',    condition: (_, t) => t.totalIncome >= 3_000_000_000 },
    { id: 'income-5b',   label: '💎 Заработано 5 млрд',    condition: (_, t) => t.totalIncome >= 5_000_000_000 },
    { id: 'income-7b',   label: '💎 Заработано 7 млрд',    condition: (_, t) => t.totalIncome >= 7_000_000_000 },
    { id: 'income-10b',  label: '💎 Заработано 10 млрд',   condition: (_, t) => t.totalIncome >= 10_000_000_000 },

    // ─────────────────────────────────────────
    // 📦 Бюджеты и вклады
    // ─────────────────────────────────────────
    { id: 'multi-budget', label: '📦 Несколько бюджетов',            condition: (_, __, b) => b >= 2 },
    { id: 'budget-5',     label: '📦 5 бюджетов',                    condition: (_, __, b) => b >= 5 },
    { id: 'budget-10',    label: '📦 10 бюджетов — богатая жизнь',   condition: (_, __, b) => b >= 10 },
    { id: 'saver',        label: '🏦 Сделано 3 вклада',              condition: (_, t) => t.depositCount >= 3 },
    { id: 'saver-10',     label: '🏦 10 вкладов — серьёзный подход', condition: (_, t) => t.depositCount >= 10 },

    // ─────────────────────────────────────────
    // 📅 Планировщик (новый функционал)
    // ─────────────────────────────────────────
    { id: 'planner-first', label: '📅 Первая запись в планировщике', condition: (_, t) => (t.plannerCount || 0) >= 1 },
    { id: 'planner-5',     label: '📅 5 записей в планировщике',     condition: (_, t) => (t.plannerCount || 0) >= 5 },
    { id: 'planner-20',    label: '📅 20 записей в планировщике',    condition: (_, t) => (t.plannerCount || 0) >= 20 },
    { id: 'planner-done',  label: '✅ Выполнено 3 плана',            condition: (_, t) => (t.plannerDoneCount || 0) >= 3, hidden: true },

    // ─────────────────────────────────────────
    // 📊 Фильтр «Год» (новый функционал)
    // ─────────────────────────────────────────
    { id: 'year-view',     label: '📆 Посмотрел весь год сразу',     condition: (_, t) => !!t.usedYearFilter, hidden: true },

    // ─────────────────────────────────────────
    // 🎭 Особые суммы и пасхалки
    // ─────────────────────────────────────────
    { id: 'exactly-404',       label: '🎯 Ошибка бюджета 404',       condition: (_, t) => t.lastAmount === 404,       hidden: true },
    { id: 'exactly-1337',      label: '💻 Leet Mode Activated',       condition: (_, t) => t.lastAmount === 1337,      hidden: true },
    { id: 'exactly-666',       label: '😈 Сделка с дьяволом',         condition: (_, t) => t.lastAmount === 666,       hidden: true },
    { id: 'all-sevens',        label: '🎰 Счастливая семёрка',        condition: (_, t) => t.lastAmount === 777_777,   hidden: true },
    { id: 'round-million',     label: '🧮 Ровно миллион',             condition: (_, t) => t.lastAmount === 1_000_000, hidden: true },
    { id: 'palindrome-amount', label: '🔢 Число-палиндром',           condition: (_, t) => { const a = t.lastAmount?.toString(); return a && a.length >= 3 && a === a.split('').reverse().join(''); }, hidden: true },
    { id: 'binary-boss',       label: '💻 Бинарный бюджет',           condition: (_, t) => { const val = t.lastAmount?.toString(); return val && /^[10]+$/.test(val) && val.length >= 3; }, hidden: true },

    // ─────────────────────────────────────────
    // 🌙 Время и дни
    // ─────────────────────────────────────────
    { id: 'midnight-transaction', label: '🌙 Ночная покупка',       condition: (tx, t) => tx >= 3 && typeof t.lastHour === 'number' && t.lastHour === 0,                                hidden: true },
    { id: 'early-bird',           label: '🌅 Ранняя пташка',        condition: (tx, t) => tx >= 3 && typeof t.lastHour === 'number' && t.lastHour >= 4 && t.lastHour <= 6,              hidden: true },
    { id: 'impulse-spender',      label: '🌀 Импульсивная покупка', condition: (tx, t) => tx >= 3 && typeof t.lastHour === 'number' && t.lastHour >= 0 && t.lastHour <= 2,              hidden: true },
    { id: 'late-saver',           label: '🌙 Ночной вклад',         condition: (tx, t) => tx >= 3 && t.lastDepositDay !== null && typeof t.lastHour === 'number' && t.lastHour >= 22,  hidden: true },
    { id: 'sunday-saver',         label: '🛐 Воскресный вклад',     condition: (tx, t) => tx >= 3 && t.lastDepositDay === 0,                                                            hidden: true },

    // ─────────────────────────────────────────
    // ☕ Кофе
    // ─────────────────────────────────────────
    { id: 'coffee-starter',    label: '☕ Первый кофе',               condition: (_, t) => t.coffeeTxCount === 1,      hidden: true },
    { id: 'coffein-dependant', label: '☕ Кофеинозависимый',          condition: (_, t) => t.coffeeTxCount >= 10,      hidden: true },
    { id: 'coffee-junkie',     label: '☕ 20 кофе — уже зависимость', condition: (_, t) => t.coffeeTxCount >= 20,      hidden: true },
    { id: 'coffee-overdose',   label: '🤯 5 кофе подряд',             condition: (_, t) => t.transactionsToday.slice(-5).length === 5 && t.transactionsToday.slice(-5).every(tx => tx.category?.toLowerCase().includes('кофе')), hidden: true },
    { id: 'coffe-break-even',  label: '☕ Чётное число кофе',         condition: (_, t) => t.coffeeTxCount > 0 && t.coffeeTxCount % 2 === 0, hidden: true },
    { id: 'expensive-coffee',  label: '☕ Золотой латте',             condition: (_, t) => t.lastCoffeeAmount >= 100_000, hidden: true },

    // ─────────────────────────────────────────
    // 💨 Кальяны
    // ─────────────────────────────────────────
    { id: 'kalyan-collector', label: '💨 5 кальянов',       condition: (_, t) => t.kalyanTxCount >= 5,  hidden: true },
    { id: 'kalyan-life',      label: '💨 Кальянный магнат', condition: (_, t) => t.kalyanTxCount >= 10, hidden: true },

    // ─────────────────────────────────────────
    // 💘 Романтика
    // ─────────────────────────────────────────
    { id: 'sweet-romance',  label: '🍰 Сладкая любовь',          condition: (_, t) => t.loveTxCount >= 3 && t.usedCategories.some(c => c.toLowerCase().includes('торт') || c.toLowerCase().includes('слад')), hidden: true },
    { id: 'romantic-spree', label: '💘 Всё ради любви',          condition: (_, t) => t.loveTxCount >= 30, hidden: true },
    { id: 'love-ruin',      label: '💔 Любовь разрушает бюджет', condition: (_, t) => t.loveTxCount >= 70 && t.monthlyExpense > 15_000_000, hidden: true },

    // ─────────────────────────────────────────
    // 🦈 Акулка
    // ─────────────────────────────────────────
    { id: 'akula-category', label: '🦈 Верен Акулке',             condition: (_, t) => t.usedCategories?.includes('Акулка'), hidden: true },
    { id: 'akula-party',    label: '🦈 Акулья вечеринка',         condition: (_, t) => t.akulaTxCount >= 3,  hidden: true },
    { id: 'akula-tx-10',    label: '🦈 Десять акульих транзакций', condition: (_, t) => t.akulaTxCount >= 10, hidden: true },
    { id: 'akula-lover',    label: '🦈 Только Акулка',            condition: (_, t) => t.usedCategories.length === 1 && t.usedCategories[0] === 'Акулка', hidden: true },

    // ─────────────────────────────────────────
    // 📁 Логика / экспорт / действия
    // ─────────────────────────────────────────
    { id: 'delete-everything',      label: '🧨 Всё потеряно',       condition: (_, t) => !!t.cacheCleared,              hidden: true },
    { id: 'export-before-first-tx', label: '📁 Экспорт пустоты',   condition: (tx, t) => tx === 0 && !!t.exported,      hidden: true },
    { id: 'tx-on-birthday',         label: '🎂 День рождения бюджета', condition: (_, t) => t.txOnBudgetBirthday,       hidden: true },

    // ─────────────────────────────────────────
    // 📦 Категории (общие)
    // ─────────────────────────────────────────
    { id: 'lucky-thirteen',     label: '🔮 Ровно 13 категорий',              condition: (tx, t) => tx >= 1 && t.usedCategories.length === 13 },
    { id: 'odd-category-count', label: '🌀 13+ нечётных категорий',          condition: (tx, t) => tx >= 1 && t.usedCategories.length >= 13 && t.usedCategories.length % 2 === 1 },
    { id: 'round-category-20',  label: '🧱 Ровно 20 категорий',             condition: (_, t) => t.usedCategories.length === 20, hidden: true },
    { id: 'category-mania-lite',label: '🎨 50 категорий',                   condition: (_, t) => t.usedCategories.length >= 50,  hidden: true },

    // ─────────────────────────────────────────
    // 📅 Категории за день
    // ─────────────────────────────────────────
    { id: 'category-day-10',  label: '🎨 10+ категорий за день',  condition: (_, t) => new Set(t.transactionsToday.map(tx => tx.category)).size >= 10,  hidden: true },
    { id: 'category-day-20',  label: '🎨 20+ категорий за день',  condition: (_, t) => new Set(t.transactionsToday.map(tx => tx.category)).size >= 20,  hidden: true },
    { id: 'category-day-30',  label: '🎨 30+ категорий за день',  condition: (_, t) => new Set(t.transactionsToday.map(tx => tx.category)).size >= 30,  hidden: true },
    { id: 'category-day-50',  label: '🎨 50+ категорий за день',  condition: (_, t) => new Set(t.transactionsToday.map(tx => tx.category)).size >= 50,  hidden: true },
    { id: 'category-day-100', label: '🎨 100+ категорий за день', condition: (_, t) => new Set(t.transactionsToday.map(tx => tx.category)).size >= 100, hidden: true },
    { id: 'category-day-250', label: '🎨 250+ категорий за день', condition: (_, t) => new Set(t.transactionsToday.map(tx => tx.category)).size >= 250, hidden: true },

    // ─────────────────────────────────────────
    // 📉 Финансовые крайности
    // ─────────────────────────────────────────
    { id: 'negative-balance', label: '📉 Ушёл в минус',                     condition: (_, t) => t.currentBalance < 0,                        hidden: true },
    { id: 'zeroed-out',       label: '🫥 Вышел в ноль после 5 транзакций',  condition: (tx, t) => tx >= 5 && t.currentBalance === 0,           hidden: true },
    { id: 'deep-red',         label: '🧨 Минус миллион',                    condition: (_, t) => t.currentBalance < -1_000_000,               hidden: true },
    { id: 'zero-income',      label: '🤐 Месяц без дохода (но активный)',   condition: (tx, t) => tx >= 5 && t.monthlyIncome === 0,            hidden: true },
    { id: 'unicorn-income',   label: '🦄 Фантастический доход',             condition: (_, t) => t.monthlyIncome % 777_777 === 0 && t.monthlyIncome !== 0, hidden: true },

    // ─────────────────────────────────────────
    // 🔁 Повторы, типы, активность
    // ─────────────────────────────────────────
    { id: 'repeated-tx',     label: '🔁 Повторитель',           condition: (_, t) => !!t.sameAmountRepeated, hidden: true },
    { id: 'daily-burst',     label: '📅 Финансовый спринт',     condition: (_, t) => t.transactionsToday.length >= 10, hidden: true },
    // all-types-day и tactical-strike — одно и то же, оставляем один, удаляем дубль
    { id: 'tactical-strike', label: '💥 Один день — все типы',  condition: (_, t) => {
        const types = new Set(t.transactionsToday.map(tx => tx.type));
        return types.has('income') && types.has('expense') && types.has('deposit') && types.has('debt');
    }, hidden: true },

    // ─────────────────────────────────────────
    // 👻 Эстетика и эмоции
    // ─────────────────────────────────────────
    { id: 'ghost-budget',      label: '👻 Призрачный бюджет',    condition: (_, t) => t.currentBudgetName?.toLowerCase().includes('призрак'), hidden: true },
    { id: 'angry-emoji',       label: '😡 Эмоциональный бюджет', condition: (_, t) => t.currentBudgetName.includes('💢') || t.currentBudgetName.includes('😡'), hidden: true },
    { id: 'suspicious-income', label: '🕵️ Странный доход',       condition: (_, t) => t.lastIncomeCategory === '🕵️‍♂️ Левак', hidden: true },
];