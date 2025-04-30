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
  