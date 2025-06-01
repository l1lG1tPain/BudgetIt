export const getBudgetEmoji = (value) => {
  if (value < -500_000_000) return '🔥🕳️💀💥';          // Адский минус
  if (value < -100_000_000) return '💀🔥📉';             // Угар
  if (value < -50_000_000) return '☠️🩸📉';              // Почти конец
  if (value < -10_000_000) return '💀💀💀';               // Очень плохо
  if (value < -1_000_000) return '😱🥶';                 // Замёрзли
  if (value < 0) return '😓📉';                          // В минусе
  if (value < 100_000) return '🪱';                      // Червячок
  if (value < 300_000) return '🐌';                      // Медленно
  if (value < 500_000) return '🐜';                      // Маленькие шаги
  if (value < 1_000_000) return '🦐';                    // Крошечный
  if (value < 3_000_000) return '🐟';                    // Уже видно
  if (value < 6_000_000) return '🦀';                    // Норм
  if (value < 10_000_000) return '🐙';                   // Неплохо
  if (value < 15_000_000) return '🐬';                   // Круто
  if (value < 25_000_000) return '🦈';                   // Солидно
  if (value < 40_000_000) return '🐋';                   // Уверенно
  if (value < 75_000_000) return '🐳💵';                 // Богатство на плаву
  if (value < 100_000_000) return '🦕🏝️';               // Дино-капитал
  if (value < 200_000_000) return '🦖💎';               // Редкое состояние
  if (value < 500_000_000) return '🏛️💰';              // Казна государства
  if (value < 1_000_000_000) return '🌍🏦';              // Бюджет страны
  if (value < 2_000_000_000) return '🧬🪐';              // Финансовая эволюция
  if (value < 5_000_000_000) return '🚀💎🪙';             // Межзвёздный капитал
  if (value < 10_000_000_000) return '👑🌌🏦';             // Империя денег
  return '🪐👽💸♾️';                                    // Бюджет бесконечности
};


  export const getIncomeEmoji = (value) => {
    if (value < 0) return '❓❗';                          // Ошибка? Минус?
    if (value < 100_000) return '😶💸';                   // Почти ничего
    if (value < 300_000) return '🤔🪙';                   // Скромно
    if (value < 600_000) return '🙂💵';                   // Есть на жизнь
    if (value < 1_000_000) return '😊💲';                 // Уже неплохо
    if (value < 2_000_000) return '🤑💰';                 // Радость
    if (value < 5_000_000) return '😎💵💼';                // Уверенно
    if (value < 10_000_000) return '🏦💰';                // Стабильно
    if (value < 20_000_000) return '📈🧠';                // Умные деньги
    if (value < 50_000_000) return '🧠💸';                // Системный доход
    if (value < 100_000_000) return '💼🚁';               // Доход уровня топа
    if (value < 200_000_000) return '💰🏛️';              // Бизнес масштабов страны
    if (value < 500_000_000) return '👑📊';               // Имперский уровень
    if (value < 1_000_000_000) return '🧬🪙🌐';             // Фонд, венчур, биржа
    if (value < 2_000_000_000) return '🦾🏦🚀';             // Гиперинвестор
    if (value < 5_000_000_000) return '🌌💼🧠';             // Абсолютный успех
    if (value < 10_000_000_000) return '🪙🪙🪙🪙';            // Монеты не вмещаются
    return '🪐👽💸🚀';                                      // За гранью реальности
  };
  
  
  export const getExpenseEmoji = (value) => {
    if (value <= 0) return '😶';                         // Нет расходов
    if (value < 50_000) return '🧃';                     // Мелочь
    if (value < 150_000) return '🍔';                    // Перекус
    if (value < 300_000) return '🛍️🧾';                  // Шоппинг
    if (value < 600_000) return '😬🛒';                  // Покупка с болью
    if (value < 1_000_000) return '🤯💸';                 // Ощутимо
    if (value < 3_000_000) return '🫠💳';                 // Ушло много
    if (value < 5_000_000) return '💸🥵';                 // Больно, но нужно
    if (value < 10_000_000) return '🔥💳';                // Горит карта
    if (value < 20_000_000) return '🔥🔥🔥';              // Жаркий месяц
    if (value < 50_000_000) return '🕳️💳💀';              // Финансовая яма
    if (value < 100_000_000) return '💣🔥🕳️';            // Бюджет подорван
    if (value < 200_000_000) return '🏠🛠️💰';             // Недвижимость или стройка
    if (value < 500_000_000) return '🛫🌍💳';              // Путешествия, бизнес, масштаб
    if (value < 1_000_000_000) return '🌋🏦🔥';             // Эпическое сжигание денег
    if (value < 2_000_000_000) return '👑🪙🗽';             // Уровень олигарха
    if (value < 5_000_000_000) return '🚁💼🌐';             // Траты CEO
    if (value < 10_000_000_000) return '🛸🧬💸';            // Деньги вне планеты
    return '🪐💸🚀👽';                                     // Космос. Илону Маску бы понравилось
  };
  
  
  
  export const getDebtEmoji = (value) => {
    if (value < 0) return '❓💳';                          // Что-то странное
    if (value < 100_000) return '😅💳';                    // Мелкий долг
    if (value < 500_000) return '😟📉';                    // Уже тревожно
    if (value < 1_000_000) return '😰📉';                  // Давит
    if (value < 5_000_000) return '😓📉📉';                // Потеем
    if (value < 10_000_000) return '🚨🆘';                 // Сигнал бедствия
    if (value < 20_000_000) return '💀🆘';                 // Очень плохо
    if (value < 50_000_000) return '💣⚠️';                // Граната в кармане
    if (value < 100_000_000) return '☢️💥💳';              // Радиационный кредит
    if (value < 200_000_000) return '🧨🏚️';               // Всё в залоге
    if (value < 500_000_000) return '🏴‍☠️📉';              // Пиратские долги
    if (value < 1_000_000_000) return '🗿🧾';               // Долг как наследие
    if (value < 2_000_000_000) return '🕳️👑💳';             // VIP-долг
    if (value < 5_000_000_000) return '🌪️💼📉';             // Корпоративные масштабы
    if (value < 10_000_000_000) return '🧨🌍📉';             // Государственный уровень
    return '♾️💳🚀💥';                                      // Космический долг, навсегда
  };
  
  
  
  export const getDepositEmoji = (value) => {
    if (value < 0) return '❗🏦';                          // Ошибка или долг?
    if (value < 100_000) return '🐖💰';                   // Копилка
    if (value < 300_000) return '💰🪙';                   // Немного отложил
    if (value < 1_000_000) return '💵📥';                 // Первые накопления
    if (value < 3_000_000) return '💰💰';                 // Уже что-то есть
    if (value < 10_000_000) return '🏦📈';                // Растёт
    if (value < 20_000_000) return '💎💎';                // Драгоценности
    if (value < 50_000_000) return '💰🏛️';               // Мини-казна
    if (value < 100_000_000) return '🪙🪙🪙';               // Много монет
    if (value < 200_000_000) return '🏦💎';                // Золотой вклад
    if (value < 500_000_000) return '👑📥';                // Элитный сейф
    if (value < 1_000_000_000) return '🧰💼🪙';             // Легендарное хранилище
    if (value < 2_000_000_000) return '🚀💎🏦';             // Капитальные активы
    if (value < 5_000_000_000) return '🧠💰♻️';             // Деньги работают
    if (value < 10_000_000_000) return '🪐💰🧬';             // Финансовая вселенная
    return '♾️💼💎🚀';                                     // Бесконечный запас
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
    '🦈': 'Shark',
    '🐬': 'Dolphin',
    '🐙': 'Octopus',
    '🐢': 'Turtle',
    '🐠': 'Tropical Fish',
    '🐳': 'Blue Whale',
    '🦭': 'Seal',
    '🪸': 'Coral',
    '🐡': 'Pufferfish',
    '🦞': 'Lobster',
    '🦀': 'Crab',
    '🦐': 'Shrimp',
    '🐟': 'Fish',
    '🐋': 'Humpback Whale',
    '🪼': 'Jellyfish',
    '🛥️': 'Boat',
    '🌊': 'Wave',
    '💼': 'Briefcase',
    '💸': 'Money with Wings',
    '📊': 'Bar Chart',
    '🧾': 'Receipt',
    '🪙': 'Coin',
    '🔐': 'Lock',
    '💰': 'Money Bag',
    '🏦': 'Bank',
    '🧮': 'Abacus',
    '💳': 'Credit Card',
    '💵': 'Dollar Banknote',
    '💶': 'Euro Banknote',
    '💷': 'Pound Banknote',
    '💴': 'Yen Banknote',
    '🏧': 'ATM Sign',
    '📈': 'Chart Increasing',
    '📉': 'Chart Decreasing',
    '🤖': 'Robot',
    '📱': 'Mobile Phone',
    '🔋': 'Battery',
    '💾': 'Floppy Disk',
    '🧬': 'DNA',
    '🛰️': 'Satellite',
    '🖥️': 'Desktop Computer',
    '📡': 'Satellite Antenna',
    '🖱️': 'Computer Mouse',
    '🖨️': 'Printer',
    '🎧': 'Headphones',
    '💿': 'Optical Disc',
    '📀': 'DVD',
    '💻': 'Laptop',
    '🔌': 'Electric Plug',
    '🪫': 'Low Battery',
    '🪛': 'Screwdriver',
    '🕊️': 'Dove',
    '🌿': 'Leaf',
    '🐧': 'Penguin',
    '🌙': 'Crescent Moon',
    '🍃': 'Leaf Fluttering in Wind',
    '☁️': 'Cloud',
    '🕯️': 'Candle',
    '🧘‍♂️': 'Person in Lotus Position',
    '🪷': 'Lotus',
    '🌅': 'Sunrise',
    '🌸': 'Cherry Blossom',
    '🌺': 'Hibiscus',
    '🌄': 'Sunrise Over Mountains',
    '🌻': 'Sunflower',
    '🪹': 'Bird’s Nest',
    '🌞': 'Sun With Face',
    '🛶': 'Canoe',
    '🫖': 'Teapot',
    '🔥': 'Fire',
    '🎯': 'Direct Hit',
    '🚀': 'Rocket',
    '🎩': 'Top Hat',
    '💣': 'Bomb',
    '🌪️': 'Tornado',
    '🏆': 'Trophy',
    '💪': 'Flexed Biceps',
    '🏃‍♂️': 'Person Running',
    '🥇': '1st Place Medal',
    '💥': 'Collision',
    '⛹️‍♂️': 'Person Bouncing Ball',
    '🤸‍♂️': 'Person Cartwheeling',
    '⛷️': 'Skier',
    '🏄‍♂️': 'Person Surfing',
    '🚴‍♂️': 'Person Biking',
    '🏹': 'Bow and Arrow',
    '🥊': 'Boxing Glove',
    '🐸': 'Frog',
    '🐷': 'Pig Face',
    '🍩': 'Doughnut',
    '🧃': 'Beverage Box',
    '🦄': 'Unicorn',
    '🍕': 'Pizza',
    '🧌': 'Troll',
    '🦑': 'Squid',
    '🤡': 'Clown Face',
    '🧟‍♂️': 'Zombie',
    '😂': 'Face With Tears of Joy',
    '💩': 'Pile of Poo',
    '😎': 'Smiling Face With Sunglasses',
    '🫠': 'Melting Face',
    '🤓': 'Nerd Face',
    '🙃': 'Upside-Down Face',
    '👀': 'Eyes',
    '🐶': 'Dog Face',
    '🐱': 'Cat Face',
    '🤯': 'Exploding Head',
    '🧙‍♂️': 'Mage',
    '🐉': 'Dragon',
    '👑': 'Crown',
    '🧛‍♂️': 'Vampire',
    '🦹': 'Supervillain',
    '🧝‍♂️': 'Elf',
    '🧞‍♂️': 'Genie',
    '🧜‍♂️': 'Merman',
    '🦅': 'Eagle',
    '🧙‍♀️': 'Sorceress',
    '👻': 'Ghost'
  }[emoji] || 'Unknown Emoji');
}

/* ---------- Случайный эмодзи для userId ---------- */
export const getRandomUserIdEmoji = () =>
    allEmojis[Math.floor(Math.random() * allEmojis.length)];