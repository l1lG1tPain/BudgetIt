// Примерные базовые "средние" зарплаты по регионам.
// Чисто для визуальной шкалы, а не для статистики :)
const REGION_SCALES = {
  UZ: { label: 'Узбекистан', baseSalary: 5_000_000 },
  RU: { label: 'Россия',     baseSalary: 70_000 },
  KZ: { label: 'Казахстан',  baseSalary: 350_000 },
  KG: { label: 'Киргизия',   baseSalary: 30_000 },
  DEFAULT: { label: 'Другое', baseSalary: 100_000 },
};

/**
 * Пытаемся понять регион из localStorage.
 * Здесь можно подправить под твои реальные ключи настроек.
 */
function getCurrentRegionCode() {
  try {
    // пример: ты можешь хранить просто "UZ" / "RU" / "KZ" / "KG"
    const raw = localStorage.getItem('region');
    if (raw && REGION_SCALES[raw]) return raw;

    // или, допустим, объект { code: "UZ", currency: "UZS" }
    const json = localStorage.getItem('budgetit:region-settings');
    if (json) {
      const parsed = JSON.parse(json);
      if (parsed?.code && REGION_SCALES[parsed.code]) return parsed.code;
    }
  } catch (e) {
    console.warn('[emojiMap] cannot detect region:', e);
  }
  return 'DEFAULT';
}

function getBaseSalary() {
  const code = getCurrentRegionCode();
  return REGION_SCALES[code]?.baseSalary ?? REGION_SCALES.DEFAULT.baseSalary;
}

/** Нормализация "сколько зарплат" с учётом знака */
function normalizeBySalary(value) {
  const base = getBaseSalary();
  if (!base || base <= 0) return value;
  return value / base;
}

/** Нормализация "сколько зарплат" по модулю */
function normalizeBySalaryAbs(value) {
  const base = getBaseSalary();
  if (!base || base <= 0) return Math.abs(value);
  return Math.abs(value) / base;
}


export const getBudgetEmoji = (value) => {
  const s = normalizeBySalary(value); // может быть меньше 0

  // Сильный минус относительно месячной ЗП
  if (s < -30) return '💀';      // минус на десятки зарплат
  if (s < -10) return '☠️';      // глубокий минус
  if (s < -5)  return '🩸';      // очень больно
  if (s < -1)  return '🕳️';      // минус на несколько ЗП
  if (s < -0.3) return '🥶';     // ощутимый минус
  if (s < 0)   return '😓';      // лёгкий минус

  // От нуля до приличного плюса
  if (s < 0.3) return '🪱';      // почти ничего
  if (s < 0.7) return '🐌';      // потихоньку
  if (s < 1.2) return '🐜';      // одна зарплата в плюсе
  if (s < 2)   return '🦐';      // 1–2 зарплаты
  if (s < 3)   return '🐟';      // аккуратный резерв
  if (s < 5)   return '🦀';      // хороший запас
  if (s < 7)   return '🐙';      // уверенный баланс
  if (s < 10)  return '🐬';      // прям молодец
  if (s < 15)  return '🦈';      // акулий капитал
  if (s < 25)  return '🐋';      // жирненький запас
  if (s < 40)  return '🐳';      // богатство на плаву
  if (s < 60)  return '🦕';      // древняя заначка
  if (s < 100) return '🦖';      // редкий зверь
  return '👽';                   // уже совсем космос
};


export const getIncomeEmoji = (value) => {
  const s = normalizeBySalary(value); // сколько "зарплат" пришло

  if (s < 0)   return '❓';      // минусовой доход?
  if (s < 0.3) return '😶';      // почти ничего
  if (s < 0.7) return '🤔';      // скромно
  if (s < 1.2) return '🙂';      // одна нормальная ЗП
  if (s < 2)   return '😊';      // две ЗП — уже приятно
  if (s < 3)   return '🤑';      // жирненько
  if (s < 5)   return '😎';      // уверенный доход
  if (s < 8)   return '🏦';      // стабильный уровень
  if (s < 12)  return '📈';      // умные деньги
  if (s < 20)  return '🧠';      // системный доход
  if (s < 35)  return '💼';      // уже топ-уровень
  if (s < 50)  return '👑';      // император зарплаты
  if (s < 80)  return '🪙';      // фонд/биржа/бизнес
  if (s < 120) return '🚀';      // гипер-доход
  return '🪐';                  // за гранью реальности
};


export const getExpenseEmoji = (value) => {
  if (value <= 0) return '😶';   // нет расходов

  const s = normalizeBySalaryAbs(value);

  if (s < 0.1) return '🧃';      // мелочь
  if (s < 0.3) return '🍔';      // перекус/мелкая трата
  if (s < 0.6) return '🛍️';      // нормальный шоппинг
  if (s < 1.0) return '🛒';      // примерно одна ЗП
  if (s < 1.5) return '🤯';      // уже ощутимо
  if (s < 2.5) return '🫠';      // тяжёлый месяц
  if (s < 4.0) return '🥵';      // прожигаем
  if (s < 6.0) return '🔥';      // карта горит
  if (s < 8.0) return '⚡';      // очень жарко
  if (s < 12)  return '💀';      // финансовая ямка
  if (s < 20)  return '💣';      // подрыв бюджета
  if (s < 30)  return '🏠';      // крупные проекты / жильё
  if (s < 50)  return '🛫';      // большие поездки / бизнес
  if (s < 80)  return '🌋';      // эпический прожиг
  return '👽';                  // уровень Илона
};


export const getDebtEmoji = (value) => {
  if (value < 0) return '❓';    // странная ситуация

  const s = normalizeBySalaryAbs(value);

  if (s < 0.3) return '😅';      // мелкий долг
  if (s < 1.0) return '😟';      // до одной ЗП
  if (s < 2.0) return '😰';      // пара зарплат
  if (s < 3.0) return '😓';      // уже давит
  if (s < 5.0) return '🚨';      // тревожный уровень
  if (s < 8.0) return '💀';      // очень плохо
  if (s < 12)  return '💣';      // граната в кармане
  if (s < 18)  return '☢️';      // токсичный долг
  if (s < 25)  return '🏚️';      // всё под залогом
  if (s < 40)  return '🏴‍☠️';    // пиратский режим
  if (s < 60)  return '🗿';      // долг как наследие
  if (s < 100) return '👑';      // VIP-долг
  if (s < 150) return '🌪️';     // корп-уровень
  if (s < 250) return '🌍';      // гос-масштаб
  return '♾️';                  // вечный долг
};


export const getDepositEmoji = (value) => {
  if (value < 0) return '❗';    // что-то пошло не так

  const s = normalizeBySalaryAbs(value);

  if (s < 0.3) return '🐖';      // копилка
  if (s < 0.7) return '🪙';      // немного
  if (s < 1.5) return '💵';      // одна ЗП в запасе
  if (s < 3.0) return '💰';      // хороший резерв
  if (s < 5.0) return '📈';      // уверенные накопления
  if (s < 8.0) return '💎';      // уже серьёзно
  if (s < 12)  return '🏛️';     // мини-казна
  if (s < 20)  return '📦';      // мешок монет
  if (s < 30)  return '🏦';      // золотой вклад
  if (s < 50)  return '👑';      // элитный сейф
  if (s < 80)  return '🧰';      // легендарное хранилище
  if (s < 120) return '🚀';      // накопления уровня «летим»
  if (s < 200) return '🧠';      // деньги реально работают
  if (s < 300) return '🪐';      // своя финансовая вселенная
  return '♾️';                  // бесконечная заначка
};


  
//   /* ---------- КАТЕГОРИИ ЭМОДЗИ ДЛЯ userId ---------- */
// export const marine = [
//   '🦈','🐬','🐙','🐢','🐠','🐳','🦭','🪸','🐡','🦞','🦀',
//   '🦐','🐟','🐋','🪼','🛥️','🌊'
// ];

// export const financial = [
//   '💼','💸','📊','🧾','🪙','🔐','💰','🏦','🧮','💳','💵',
//   '💶','💷','💴','🏧','📈','📉','🪙'
// ];

// export const tech = [
//   '🤖','📱','🔋','💾','🧊','🛰️','🧬','🖥️','📡','🖱️','🖨️',
//   '🎧','💿','📀','🧑‍💻','🔌','🪫','🪛'
// ];

// export const calm = [
//   '🕊️','🌿','🐧','🌙','🍃','☁️','🕯️','🧘‍♂️','🪷','🌅',
//   '🌸','🌺','🌄','🌻','🪹','🌞','🛶','🫖'
// ];

// export const active = [
//   '🔥','🎯','🚀','🎩','💣','🌪️','🏆','💪','🏃‍♂️','🥇',
//   '💥','⛹️‍♂️','🤸‍♂️','⛷️','🏄‍♂️','🚴‍♂️','🏹','🥊'
// ];

// export const meme = [
//   '🐸','🐷','🍩','🧃','🦄','🍕','🧌','🦑','🤡','🧟‍♂️',
//   '😂','💩','😎','🫠','🤓','🙃','👀','🐶','🐱','🤯'
// ];

// export const legendary = [
//   '🧙‍♂️','🐉','👑','🧛‍♂️','🦸‍♂️','🧝‍♂️','🧞‍♂️','🧜‍♂️','🦅','🧙‍♀️'
// ];

// /* ---------- УТИЛИТА ---------- */
// export const getRandomUserIdEmoji = () => {
//   const all = [
//     ...marine, ...financial, ...tech,
//     ...calm, ...active, ...meme, ...legendary
//   ];
//   return all[Math.floor(Math.random() * all.length)];
// };


/* ---------- КАТЕГОРИИ ---------- */
// emojiMap.js

export const marine     = ['🦈','🐬','🐙','🐢','🐠','🐳','🦭','🪸','🐡','🦞','🦀','🦐','🐟','🐋','🪼','🛥️','🌊'];
export const financial  = ['💼','💸','📊','🧾','🪙','🔐','💰','🏦','🧮','💳','💵','💶','💷','💴','🏧','📈','📉'];
export const tech       = ['🤖','📱','🔋','💾','🧊','🛰️','🧬','🖥️','📡','🖱️','🖨️','🎧','💿','📀','💻','🔌','🪫','🪛'];
export const calm       = ['🕊️','🌿','🐧','🌙','🍃','☁️','🕯️','🧘‍♂️','🪷','🌅','🌸','🌺','🌄','🌻','🪹','🌞','🛶','🫖'];
export const active     = ['🔥','🎯','🚀','🎩','💣','🌪️','🏆','💪','🏃‍♂️','🥇','💥','🤸‍♂️','⛷️','🏄‍♂️','🚴‍♂️','🏹','🥊'];
export const meme       = ['🐸','🐷','🍩','🧃','🦄','🍕','🧌','🦑','🤡','🧟‍♂️','😂','💩','😎','🫠','🤓','🙃','👀','🐶','🐱','🤯'];
export const legendary  = ['🧙‍♂️','🐉','👑','🧛‍♂️','🦹','🧝‍♂️','🧞‍♂️','🧜‍♂️','🦅','🧙‍♀️','👻'];

export const allEmojis = [
  ...marine,
  ...financial,
  ...tech,
  ...calm,
  ...active,
  ...meme,
  ...legendary
];

/* ---------- Утилиты для нормализации emoji ---------- */
/**
 * Убираем из строки:
 *  - вариационные селекторы FE0E/FE0F,
 *  - zero-width joiner (ZWJ, U+200D),
 *  - модификаторы тона кожи (U+1F3FB–U+1F3FF).
 */
function normalizeEmoji(str) {
  return str
      .normalize('NFC')
      .replace(/[\uFE0E\uFE0F\u200D]/g, '')         // удаляем VS16 и ZWJ
      .replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '');      // удаляем skin-tone modifiers
}

/* ---------- карта «эмодзи → файл» (исходная, с оригинальными ключами) ---------- */
const rawMap = {
  '🦈': 'shark.png',      '🐬': 'dolphin1.png',  '🐙': 'octopus.png',     '🐢': 'turtle.png',
  '🐠': 'tropical.png',   '🐳': 'blue-whale.png','🦭': 'seal.png',        '🪸': 'dolphin.png',
  '🐡': 'dolphin.png',    '🦞': 'lobster.png',   '🦀': 'crab.png',         '🦐': 'shrimp.png',
  '🐟': 'fish.png',       '🐋': 'blue-whale.png','🪼': 'jellyfish.png',    '🛥️': 'boat.png',
  '🌊': 'wave.png',
  '💼': 'financial.png',  '💸': 'dollar.png',    '📊': 'financial.png',    '🧾': 'financial.png',
  '🪙': 'dollar.png',     '🔐': 'lock.png',      '💰': 'dollar.png',       '🏦': 'dollar.png',
  '🧮': 'financial.png',  '💳': 'card.png',      '💵': 'dollar.png',       '💶': 'euro.png',
  '💷': 'dollar.png',     '💴': 'dollar.png',    '🏧': 'financial.png',    '📈': 'financial.png',
  '📉': 'financial.png',
  '🤖': 'robot.png',      '📱': 'tech.png',      '🔋': 'tech.png',         '💾': 'tech.png',
  '🧬': 'dna.png',        '🛰️': 'rocket.png',    '🖥️': 'coder.png',       '📡': 'coder.png',
  '🖱️': 'tech.png',       '🖨️': 'coder.png',     '🎧': 'headphones.png',   '💿': 'coder.png',
  '📀': 'coder.png',      '💻': 'coder.png',     '🔌': 'plug.png',         '🪫': 'low-battery.png',
  '🪛': 'screwdriver.png',
  '🕊️': 'dove.png',       '🌿': 'leaf.png',      '🐧': 'penguin.png',      '🌙': 'moon.png',
  '🍃': 'breeze.png',     '☁️': 'cloud.png',     '🕯️': 'candle.png',      '🧘‍♂️': 'meditate.png',
  '🪷': 'lotus.png',      '🌅': 'sunrise.png',   '🌸': 'sakura.png',      '🌺': 'hibiscus.png',
  '🌄': 'mountains.png',  '🌻': 'sunflower.png', '🪹': 'nest.png',        '🌞': 'sun.png',
  '🛶': 'canoe.png',      '🫖': 'teapot.png',
  '🔥': 'active.png',     '🎯': 'target.png',    '🚀': 'rocket.png',       '🎩': 'hat.png',
  '💣': 'explode.png',    '🌪️': 'tornado.png',  '🏆': 'trophy.png',       '💪': 'muscle.png',
  '🏃‍♂️': 'run.png',     '🥇': 'trophy.png',    '💥': 'explode.png',      '⛹️‍♂️': 'basketball.png',
  '🤸‍♂️': 'gymnast.png',  '⛷️': 'ski.png',      '🏄‍♂️': 'surf.png',       '🚴‍♂️': 'bike.png',
  '🏹': 'target.png',     '🥊': 'boxing.png',    '🐸': 'meme.png',         '🐷': 'pig.png',
  '🍩': 'meme.png',       '🧃': 'juice.png',     '🦄': 'unicorn.png',      '🍕': 'meme.png',
  '🦑': 'squid.png',      '🤡': 'clown.png',     '🧟‍♂️': 'zombie.png',     '😂': 'lol.png',
  '💩': 'poop.png',       '😎': 'cool.png',      '🫠': 'melting.png',      '🤓': 'meme.png',
  '🙃': 'meme.png',       '👀': 'meme.png',      '🐶': 'dog.png',         '🐱': 'cat.png',
  '🤯': 'explode.png',
  '🧙‍♂️': 'legendary.png','🐉': 'dragon.png',   '🧛‍♂️': 'vampire.png',     '🦹': 'legendary.png',
  '🧝‍♂️': 'elf.png',     '🧞‍♂️': 'genie.png',   '🧜‍♂️': 'legendary.png',  '🦅': 'eagle.png',
  '🧙‍♀️': 'legendary.png','👻': 'ghost.png'
};

/* ---------- Нормализуем ключи rawMap и строим финальную «emoji→файл» map ---------- */
const fallbackMap = Object.fromEntries(
    Object.entries(rawMap).map(([emojiKey, fileName]) => [
      normalizeEmoji(emojiKey),
      fileName
    ])
);

/* ---------- Базовый URL для папки с аватарками ---------- */
export const AVATAR_BASE_URL = '/assets/avatar/';

/* ---------- Построение массива профилей emoji ---------- */
export const emojiProfiles = allEmojis.map((emoji) => {
  const normalized = normalizeEmoji(emoji);
  const file = fallbackMap[normalized] || 'default.png';

  return {
    emoji,
    name: getEmojiName(emoji),
    img: `${AVATAR_BASE_URL}${file}`,
    fallbackImg: `${AVATAR_BASE_URL}default.png`
  };
});

function getEmojiName(emoji) {
  return ({
    '🦈': 'Акулка',
    '🐬': 'Дельфиник',
    '🐙': 'Осьминожка',
    '🐢': 'Черепкулка',
    '🐠': 'Рыбулька',
    '🐳': 'Китулька',
    '🦭': 'Тюлькулка',
    '🪸': 'Кораллкулка',
    '🐡': 'Пузыркулка',
    '🦞': 'Лобстакулка',
    '🦀': 'Крабокулка',
    '🦐': 'Кревкулка',
    '🐟': 'Рыбёкулка',
    '🐋': 'Горбкулка',
    '🪼': 'Медузаа',
    '🛥️': 'Где мой нос?',
    '🌊': 'Я Волна',
    '💼': 'Портфкулка',
    '💸': 'Деньгкулка',
    '📊': 'Диаграмкулка',
    '🧾': 'Чекулка',
    '🪙': 'Монеткулка',
    '🔐': 'Замкулка',
    '💰': 'Мешкулка',
    '🏦': 'Банкулка',
    '🧮': 'Счёткулка',
    '💳': 'Карткулка',
    '💵': 'Баксокулка',
    '💶': 'Еврокулка',
    '💷': 'Фунткулка',
    '💴': 'Йенкулка',
    '🏧': 'Банкоматкулка',
    '📈': 'Росткулка',
    '📉': 'Падкулка',
    '🤖': 'Роботкулка',
    '📱': 'Телефкулка',
    '🔋': 'Батарейкулка',
    '💾': 'Дискеткулка',
    '🧬': 'ДНКулка',
    '🛰️': 'Спутникулка',
    '🖥️': 'Компкулка',
    '📡': 'Антеннкулка',
    '🖱️': 'Мышкулка',
    '🖨️': 'Принткулка',
    '🎧': 'Наушкулка',
    '💿': 'Дисккулка',
    '📀': 'ДВДкулка',
    '💻': 'Ноуткулка',
    '🔌': 'Вилкулка',
    '🪫': 'Разряткулка',
    '🪛': 'Отвёрткулка',
    '🕊️': 'Голубкулка',
    '🌿': 'Листкулка',
    '🐧': 'Пингвкулка',
    '🌙': 'Лункулка',
    '🍃': 'Листокулка',
    '☁️': 'Облакулка',
    '🕯️': 'Свечкулка',
    '🧘‍♂️': 'Йогкулка',
    '🪷': 'Лотокулка',
    '🌅': 'Зарькулка',
    '🌸': 'Сакуркулка',
    '🌺': 'Цветкулка',
    '🌄': 'Горкулка',
    '🌻': 'Подсолнкулка',
    '🪹': 'Гнёздкулка',
    '🌞': 'Солнкулка',
    '🛶': 'Лодкулка',
    '🫖': 'Чайнокулка',
    '🔥': 'Огнкулка',
    '🎯': 'Мишкулка',
    '🚀': 'Ракеткулка',
    '🎩': 'Шляпкулка',
    '💣': 'Бомбкулка',
    '🌪️': 'Ураганкулка',
    '🏆': 'Кубкулка',
    '💪': 'Мускулка',
    '🏃‍♂️': 'Бегкулка',
    '🥇': 'Золоткулка',
    '💥': 'Взрывкулка',
    '⛹️‍♂️': 'Баскулка',
    '🤸‍♂️': 'Кувыркулка',
    '⛷️': 'Лыжкулка',
    '🏄‍♂️': 'Сёрфкулка',
    '🚴‍♂️': 'Велокулка',
    '🏹': 'Стрелкулка',
    '🥊': 'Перчакулка',
    '🐸': 'Лягушкулка',
    '🐷': 'Хрюкулка',
    '🍩': 'Пончкулка',
    '🧃': 'Сокулка',
    '🦄': 'Единорогкулка',
    '🍕': 'Пиццкулка',
    '🧌': 'Троллкулка',
    '🦑': 'Кальмаркулка',
    '🤡': 'Клоункулка',
    '🧟‍♂️': 'Зомбкулка',
    '😂': 'Хохокулка',
    '💩': 'Какулка',
    '😎': 'Крутулка',
    '🫠': 'Расплавкулка',
    '🤓': 'Ботакулка',
    '🙃': 'Вверхтормашкулка',
    '👀': 'Глазкулка',
    '🐶': 'Собакулка',
    '🐱': 'Котакулка',
    '🤯': 'Башкулка',
    '🧙‍♂️': 'Магкулка',
    '🐉': 'Дракулка',
    '👑': 'Коронкулка',
    '🧛‍♂️': 'Вампкулка',
    '🦹': 'Злодкулка',
    '🧝‍♂️': 'Эльфкулка',
    '🧞‍♂️': 'Джиннкулка',
    '🧜‍♂️': 'Русалкулка',
    '🦅': 'Орлакулка',
    '🧙‍♀️': 'Ведьмкулка',
    '👻': 'Призракулка'
  }[emoji] || 'Неизвесткулка');
}

/* ---------- Случайный эмодзи для userId ---------- */
export const getRandomUserIdEmoji = () =>
    allEmojis[Math.floor(Math.random() * allEmojis.length)];