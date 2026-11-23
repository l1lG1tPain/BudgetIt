// Akulka Projects — продукты экосистемы. Один источник для блока «Akulka Projects» в профиле и для чата Акулки.
// Чтобы добавить продукт: допиши объект в список (иконку положи в assets/icons/ и добавь её путь в STATIC_ASSETS в service-worker.js).
//
//   id       — латиница, уникальный ключ
//   name     — название, как на карточке
//   icon     — путь к иконке от корня сайта
//   short    — одна строка для карточки в профиле и списка в чате
//   desc     — подробное описание для ответа Акулки (1–3 предложения)
//   url      — куда ведёт «Перейти»; пусто — продукт без ссылки
//   version  — подпись на карточке: 'v1.0', 'beta', 'new'
//   current  — true только у BudgetIt: «ты уже здесь», без перехода
//   aliases  — как его могут назвать в чате (строчными; русские и латинские варианты, частые опечатки)

export const AKULKA_PROJECTS_INFO = {
    name: 'Akulka Projects',
    tagline: 'Инди-экосистема продуктов, которые делают жизнь проще и приятнее'
};

export const AKULKA_PROJECTS = [
    {
        id: 'teatimer',
        name: 'TeaTimer',
        icon: 'assets/icons/TeaTimer-l.png',
        short: 'Заварка китайского чая: время проливов по сорту и крепости',
        desc: 'Помощник по завариванию китайского чая. Выбираешь сорт и крепость, а TeaTimer подсказывает время каждого пролива и сам ведёт таймер.',
        url: 'https://teatimer-livid.vercel.app/',
        version: 'new',
        aliases: ['teatimer', 'tea timer', 'ти таймер', 'титаймер', 'чайный таймер', 'таймер для чая', 'таймер чая', 'заварка чая', 'про чай']
    },
    {
        id: 'trackit',
        name: 'TrackIt',
        icon: 'assets/icons/trackit-icon.png',
        short: 'Счётчик очков для настольных игр',
        desc: 'Счётчик очков для настольных игр: игроки, раунды и подсчёт без бумажки и калькулятора.',
        url: 'https://l1lg1tpain.github.io/TrackIt/index.html',
        version: 'v3.5',
        aliases: ['trackit', 'track it', 'трекит', 'трек ит', 'счетчик очков', 'счётчик очков', 'для настольных игр', 'настолки']
    },
    {
        id: 'budgetit',
        name: 'BudgetIt',
        icon: 'assets/icons/budgetit-icon.png',
        short: 'Учёт финансов с аналитикой',
        desc: 'Учёт финансов с аналитикой, планом месяца, импортом выписок и Акулкой. Ты уже здесь 🦈',
        url: '',
        version: 'v5.1.0',
        current: true,
        aliases: ['budgetit', 'budget it', 'баджетит', 'бюджетит']
    },
    {
        id: 'migri',
        name: 'Мигри',
        icon: 'assets/icons/migri-icon.png',
        short: 'Трекер головной боли с аналитикой для врача',
        desc: 'Трекер головной боли: записываешь приступы, силу и возможные причины, а Мигри собирает аналитику, которую удобно показать врачу.',
        url: 'https://migry-bice.vercel.app/',
        version: 'v1.0',
        aliases: ['мигри', 'migri', 'migry', 'мигрень', 'трекер мигрени', 'трекер головной боли', 'дневник головной боли']
    },
    {
        id: 'ludomania',
        name: 'Ludomania',
        icon: 'assets/icons/ludomania-icon.png',
        short: 'Мини-игра в Telegram',
        desc: 'Мини-игра в Telegram: открывается прямо в боте, ничего устанавливать не нужно.',
        url: 'https://t.me/LUdomania_app_bot',
        version: 'beta',
        aliases: ['ludomania', 'лудомания', 'людомания', 'лудомания бот', 'мини игра', 'мини-игра', 'игра в телеграм', 'игра в telegram']
    }
];
