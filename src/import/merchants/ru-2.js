/**
 * Словарь российских организаций, часть 2: маркетплейсы, доставка, сети продуктов, одежда, дом, дети, спорт, досуг.
 * Одна строка = одна организация (варианты написания через «|»). Формат — см. engine.js.
 * Общие слова-признаки («кафе», «аптека» и т.п.) вынесены в ru-3.js и стоят в самом конце.
 */

export const RU_EXPENSE_SRC_2 = `
## 📦 Wildberries
WILDBERRIES|ВАЙЛДБЕРРИЗ|WB RU|RWB
## 📦 Ozon
OZON RU|OZON.RU|OZON MARKETPLACE|OZON TRAVEL|ОЗОН ИНТЕРНЕТ|ИНТЕРНЕТ РЕШЕНИЯ
## 📦 Яндекс Маркет
ЯНДЕКС МАРКЕТ|YANDEX MARKET|MARKET YANDEX
## 📦 AliExpress
ALIEXPRESS*|АЛИЭКСПРЕСС|ALI EXPRESS
## 📦 Мегамаркет
МЕГАМАРКЕТ|MEGAMARKET|SBERMEGAMARKET
## 📦 Lamoda
ЛАМОДА|LAMODA*
## 📦 KazanExpress
KAZANEXPRESS|КАЗАНЬЭКСПРЕСС
## 📦 СДЭК
CDEK|СДЭК
## 📦 Почта России
ПОЧТА РОССИИ|RUSSIAN POST|POCHTA ROSSII
## 📦 Boxberry
BOXBERRY|БОКСБЕРРИ
## 📦 Достависта
ДОСТАВИСТА|DOSTAVISTA
## 📦 Пункт выдачи
ПУНКТ ВЫДАЧИ|ПВЗ|ПОСТАМАТ|POSTAMAT
## 🍽️ Яндекс Еда
ЯНДЕКС ЕДА|YANDEX EDA|YANDEX EATS|EDA YANDEX
## 🍽️ Delivery Club
DELIVERY CLUB|ДЕЛИВЕРИ КЛАБ|DELIVERYCLUB
## 🥦 Самокат
САМОКАТ|SAMOKAT*
## 🥦 Яндекс Лавка
ЯНДЕКС ЛАВКА|YANDEX LAVKA|LAVKA YANDEX
## 🥦 СберМаркет
СБЕРМАРКЕТ|SBERMARKET
## 🥦 Купер
КУПЕР|KUPER
## 🥦 Утконос
УТКОНОС|UTKONOS
## 🥦 Азбука Вкуса
АЗБУКА ВКУСА|AZBUKA VKUSA
## 🥦 Гипермаркет Глобус
ГИПЕРГЛОБУС|GIPERGLOBUS|GLOBUS HYPERMARKET
## 🥦 Спар
SPAR RU|СПАР МАГАЗИН|ASTORIA SPAR
## 🥦 Бристоль
БРИСТОЛЬ|BRISTOL RETAIL
## 🥦 Красное и Белое
КРАСНОЕ БЕЛОЕ|КРАСНОЕ И БЕЛОЕ|KRASNOE BELOE|KRASNOE I BELOE
## 🥦 Мария-Ра
МАРИЯ РА|MARIA RA|MARIYA RA
## 🥦 Командор
КОМАНДОР|KOMANDOR
## 🥦 Монетка
МОНЕТКА|MONETKA
## 🥦 Чижик
ЧИЖИК|CHIZHIK
## 🥦 Светофор
СВЕТОФОР|SVETOFOR
## 🥦 Копейка
КОПЕЙКА|KOPEYKA
## 🥦 Кировский
КИРОВСКИЙ|KIROVSKIY
## 🥦 Магнит Экстра
МАГНИТ ЭКСТРА|MAGNIT EXTRA
## 🥦 Семья
СЕМЬЯ ГИПЕР|SEMYA GIPER
## 🥦 Бахетле
БАХЕТЛЕ|BAHETLE
## 🥦 Лэнд
ЛЭНД СУПЕРМАРКЕТ|LAND SUPERMARKET
## 🥦 Реалъ
РЕАЛЪ|REAL HYPER
## 🥦 Алми
АЛМИ|ALMI
## 🥦 Мираторг
МИРАТОРГ|MIRATORG
## 🥦 Черкизово
ЧЕРКИЗОВО|CHERKIZOVO
## 🥦 Магнолия
МАГНОЛИЯ ПРОДУКТЫ|MAGNOLIA PRODUKTY
## 🥦 Подсолнух
ПОДСОЛНУХ|PODSOLNUH
## 🥦 Простор
ПРОСТОР СУПЕРМАРКЕТ|PROSTOR SUPER
## 🥦 Находка
НАХОДКА МАГАЗИН|NAHODKA MAGAZIN
## 🥖 Хлебница
ХЛЕБНИЦА|HLEBNICA
## 🥖 Волконский
ВОЛКОНСКИЙ|VOLKONSKIY
## 🥖 Братья Караваевы
БРАТЬЯ КАРАВАЕВЫ|KARAVAEV
## 🍷 Винлаб
ВИНЛАБ|VINLAB|WINELAB
## 🍷 Ароматный мир
АРОМАТНЫЙ МИР|AROMATNY MIR
## 🍷 Бристоль Алко
БУТЫЛОЧКА|BUTYLOCHKA
## 🍷 Градусы
ГРАДУСЫ|GRADUSY
## 🍷 Дегустатор
ДЕГУСТАТОР|DEGUSTATOR
## 🍷 Ароматный мир
ЛЕНТА ВИНО|ВИННАЯ ЛАВКА
## 🍽️ Шоколадница
ШОКОЛАДНИЦА|SHOKOLADNICA
## 🍽️ Теремок
ТЕРЕМОК|TEREMOK
## 🍽️ Якитория
ЯКИТОРИЯ|YAKITORIYA
## 🍽️ Тануки
ТАНУКИ|TANUKI
## 🍽️ Му-Му
МУ МУ|MU MU|MUMU
## 🍽️ Грабли
ГРАБЛИ|GRABLI
## 🍽️ Кофемания
КОФЕМАНИЯ|COFEMANIA|KOFEMANIA
## 🍽️ Чайхона №1
ЧАЙХОНА|CHAYHONA|CHAIHONA
## 🍽️ Тургенев
ТУРГЕНЕВ|TURGENEV
## 🍽️ Бургер Кинг
БУРГЕР КИНГ|BURGER KING|BURGERKING
## 🍔 Вкусно и точка
ВКУСНО И ТОЧКА|VKUSNO I TOCHKA|VKUSNO TOCHKA
## 🍔 Ростикс
РОСТИКС|ROSTICS|ROSTIC S
## 🍔 KFC
KFC|КФС
## 🍔 Додо Пицца
ДОДО ПИЦЦА|DODO PIZZA|DODO*
## 🍔 Папа Джонс
ПАПА ДЖОНС|PAPA JOHNS
## 🍔 Пицца Хат
ПИЦЦА ХАТ|PIZZA HUT
## 🍔 Милти
МИЛТИ|MILTI
## 🍔 Крошка Картошка
КРОШКА КАРТОШКА|KROSHKA KARTOSHKA
## 🍔 Суши Wok
СУШИ ВОК|SUSHI WOK
## 🍔 Суши Мастер
СУШИ МАСТЕР|SUSHI MASTER
## 🍔 Япона мама
ЯПОНА МАМА|YAPONA MAMA|IAPONA
## 🍔 Планета Суши
ПЛАНЕТА СУШИ|PLANETA SUSHI
## 🍔 Токио-City
ТОКИО СИТИ|TOKIO CITY
## 🍔 ПиццаФабрика
ПИЦЦАФАБРИКА|PIZZAFABRIKA
## 🍔 Сабвей
САБВЕЙ|SUBWAY*
## 🍔 Теремок Блины
БЛИННАЯ|BLINNAYA
## 🍔 Хинкальная
ХИНКАЛЬНАЯ|KHINKALNAYA
## 🍔 Шаурма
ШАУРМА|SHAURMA|SHAWARMA
## 🍔 Донер
ДОНЕР|DONER
## 🍔 Бургер
БУРГЕРНАЯ|BURGERNAYA
## 🍔 Пончики
ПОНЧИК|PONCHIK|ДАНКИН|DUNKIN
## 🍔 Крафт
ХАЧАПУРИ|KHACHAPURI
## 👗 ZARA
ZARA|ЗАРА МАГАЗИН
## 👗 H&M
H M HENNES|HM RUS|HENNES MAURITZ
## 👗 Stradivarius
STRADIVARIUS|СТРАДИВАРИУС
## 👗 Pull&Bear
PULL BEAR|ПУЛ БЕР
## 👗 Bershka
BERSHKA|БЕРШКА
## 👗 Massimo Dutti
MASSIMO DUTTI
## 👗 Oysho
OYSHO
## 👗 Uniqlo
UNIQLO|ЮНИКЛО
## 👗 Mango
MANGO RU|МАНГО МАГАЗИН
## 👗 Reserved
RESERVED|РЕЗЕРВД
## 👗 Sinsay
SINSAY|СИНСЕЙ
## 👗 Cropp
CROPP|КРОПП
## 👗 House
HOUSE BRAND
## 👗 Mohito
MOHITO|МОХИТО
## 👗 Terranova
TERRANOVA|ТЕРРАНОВА
## 👗 Calzedonia
CALZEDONIA|КАЛЬЦЕДОНИЯ
## 👗 Intimissimi
INTIMISSIMI|ИНТИМИССИМИ
## 👗 Ostin
OSTIN|ОСТИН
## 👗 Gloria Jeans
GLORIA JEANS|ГЛОРИЯ ДЖИНС
## 👗 DeFacto
DEFACTO|ДЕФАКТО
## 🧥 LC Waikiki
LC WAIKIKI|LCW|ЛС ВАЙКИКИ
## 👗 Koton
KOTON|КОТОН
## 👗 Sela
SELA RU|СЕЛА МАГАЗИН
## 👗 Zarina
ZARINA|ЗАРИНА
## 👗 Love Republic
LOVE REPUBLIC|ЛАВ РЕПАБЛИК
## 👗 Befree
BEFREE|БИФРИ
## 👗 Concept Club
CONCEPT CLUB|КОНЦЕПТ КЛАБ
## 👗 Incity
INCITY|ИНСИТИ
## 👗 Befree Kids
ACOOLA|АКУЛА ДЕТСКАЯ
## 👗 Colin's
COLINS|КОЛИНС
## 👗 Baon
BAON|БАОН
## 👗 Modis
MODIS|МОДИС
## 👗 Gate31
GATE31|ГЕЙТ31
## 👗 Odji
ODJI|ОДЖИ
## 👗 Twinset
TWINSET
## 👗 Henderson
HENDERSON|ХЕНДЕРСОН
## 👗 Zolla
ZOLLA|ЗОЛЛА
## 👗 12 Storeez
12 STOREEZ
## 👗 Ecru
ECRU|ЭКРЮ
## 👗 Vilet
VILET|ВИЛЕТ
## 👗 Charuel
CHARUEL
## 👟 Спортмастер
СПОРТМАСТЕР|SPORTMASTER
## 👟 Декатлон
DECATHLON|ДЕКАТЛОН
## 👟 Adidas
ADIDAS|АДИДАС
## 👟 Nike
NIKE|НАЙК
## 👟 Puma
PUMA|ПУМА
## 👟 Reebok
REEBOK|РИБОК
## 👟 New Balance
NEW BALANCE
## 👟 Asics
ASICS|АСИКС
## 👟 Fila
FILA|ФИЛА
## 👟 Skechers
SKECHERS|СКЕЧЕРС
## 👟 The North Face
THE NORTH FACE
## 👟 Спортлэнд
СПОРТЛЭНД|SPORTLAND
## 👟 Kari
КАРИ ОБУВЬ|KARI OBUV
## 👟 Центробувь
ЦЕНТРОБУВЬ|TSENTROOBUV
## 👟 Тофа
ТОФА|TOFA
## 👟 Эконика
ЭКОНИКА|ECONIKA
## 👟 ECCO
ECCO|ЭККО
## 👟 Rieker
RIEKER|РИКЕР
## 👟 Tamaris
TAMARIS|ТАМАРИС
## 👟 Basconi
BASCONI|БАСКОНИ
## 👟 Zenden
ZENDEN|ЗЕНДЕН
## 👟 Ralf Ringer
RALF RINGER|РАЛФ РИНГЕР
## 🛋️ IKEA
IKEA|ИКЕА
## 🛋️ Леруа Мерлен
ЛЕРУА МЕРЛЕН|LEROY MERLIN|LEROYMERLIN
## 🛋️ Лемана ПРО
ЛЕМАНА ПРО|LEMANA PRO|LEMANAPRO
## 🛋️ ОБИ
ОБИ МАГАЗИН|OBI RU
## 🛋️ Петрович
ПЕТРОВИЧ|PETROVICH
## 🛋️ Hoff
HOFF|ХОФФ
## 🛋️ Этажерка
ЭТАЖЕРКА|ETAZHERKA
## 🛋️ Касторама
КАСТОРАМА|CASTORAMA
## 🛋️ Баухаус
БАУЦЕНТР|BAUCENTR
## 🛋️ Все инструменты
ВСЕ ИНСТРУМЕНТЫ|VSE INSTRUMENTY
## 🛋️ Мегастрой
МЕГАСТРОЙ|MEGASTROY
## 🛋️ Максидом
МАКСИДОМ|MAKSIDOM
## 🛋️ Стройдвор
СТРОЙДВОР|STROYDVOR
## 🛋️ Аскона
АСКОНА|ASKONA
## 🛋️ Лазурит
ЛАЗУРИТ|LAZURIT
## 🛋️ Шатура
ШАТУРА|SHATURA
## 🛋️ Столплит
СТОЛПЛИТ|STOLPLIT
## 🛋️ Дом Текстиль
ТОГАС|TOGAS
## 🛋️ Zara Home
ZARA HOME
## 🛋️ Хоум Центр
HOME CENTER|ХОУМ ЦЕНТР
## 🛋️ Ярмарка
ВСЕ ДЛЯ ДОМА|VSE DLYA DOMA
## 🧸 Детский мир
ДЕТСКИЙ МИР|DETSKIY MIR|DETSKIJ MIR
## 🧸 Hamleys
HAMLEYS|ХЭМЛИС
## 🧸 Lego
LEGO|ЛЕГО МАГАЗИН
## 🧸 Gulliver
GULLIVER|ГУЛЛИВЕР
## 🧸 Пузики
PUZIKI|ПУЗИКИ
## 🧸 Toy.ru
TOY RU|ТОЙ РУ
## 🧸 Кораблик
КОРАБЛИК ДЕТСКИЙ|KORABLIK
## 🐶 Четыре лапы
ЧЕТЫРЕ ЛАПЫ|4 LAPY|CHETYRE LAPY
## 🐶 Зоозавр
ЗООЗАВР|ZOOZAVR
## 🐶 Бигзоомаркет
БИГ ЗООМАРКЕТ|BIG ZOOMARKET|BIGZOO
## 🐶 Зоолэнд
ЗООЛЭНД|ZOOLAND
## 🐶 PetShop
PETSHOP|ПЕТШОП
## 🐶 Бетховен
БЕТХОВЕН ЗООМАГАЗИН
## 📚 Читай-город
ЧИТАЙ ГОРОД|CHITAY GOROD|CHITAI GOROD
## 📚 Буквоед
БУКВОЕД|BUKVOED
## 📚 Дом книги
ДОМ КНИГИ|DOM KNIGI
## 📚 Лабиринт
ЛАБИРИНТ|LABIRINT
## 📚 Литрес
ЛИТРЕС|LITRES
## 📚 Республика
РЕСПУБЛИКА КНИГИ|RESPUBLIKA
## 📚 Комус
КОМУС|KOMUS
## 📚 Офисмаг
ОФИСМАГ|OFFICEMAG
## 📚 Канцтовары
КАНЦЕЛЯРСКИЙ|KANCELYARSKIY
## 📚 Мир Книг
БИБЛИО ГЛОБУС|BIBLIO GLOBUS
## 🎬 Кинопоиск
КИНОПОИСК|KINOPOISK
## 🎬 Иви
IVI RU|ИВИ МЕДИА
## 🎬 Okko
OKKO|ОККО
## 🎬 Wink
WINK RU|ВИНК РОСТЕЛЕКОМ
## 🎬 Premier
PREMIER ONE|ПРЕМЬЕР
## 🎬 Kion
KION|КИОН
## 🎬 More.tv
MORE TV|MORE.TV
## 🎬 Амедиатека
AMEDIATEKA|АМЕДИАТЕКА
## 🎬 Megogo
MEGOGO|МЕГОГО
## 🎬 Кинотеатр Каро
КАРО ФИЛЬМ|KARO FILM|КИНОТЕАТР КАРО
## 🎬 Киномакс
КИНОМАКС|KINOMAX
## 🎬 Синема Парк
СИНЕМА ПАРК|CINEMA PARK
## 🎬 Формула Кино
ФОРМУЛА КИНО|FORMULA KINO
## 🎬 Синемастар
СИНЕМАСТАР|CINEMASTAR
## 🎬 Мираж Синема
МИРАЖ СИНЕМА|MIRAGE CINEMA
## 🎬 Люксор
ЛЮКСОР|LUXOR
## 🎵 Spotify
SPOTIFY|СПОТИФАЙ
## 🎵 Звук
SBERZVUK|СБЕРЗВУК
## 🎵 Яндекс Музыка
ЯНДЕКС МУЗЫКА|YANDEX MUSIC
## 🎵 VK Музыка
VK MUSIC|ВК МУЗЫКА
## 🎵 Apple Music
APPLE MUSIC
## 🎵 Яндекс Плюс
YANDEX PLUS|ЯНДЕКС ПЛЮС|YANDEXPLUS
## 📺 СберПрайм
СБЕР ПРАЙМ|SBER PRIME|SBERPRIME|СБЕРПРАЙМ
## 📺 VK Combo
VK COMBO|ВК КОМБО|VK PLUS|ВК ПЛЮС
## 📺 Apple
APPLE COM BILL|APPLE.COM BILL|ITUNES
## 📺 Google
GOOGLE PLAY|GOOGLE ONE|GOOGLE STORAGE
## 📺 YouTube Premium
YOUTUBE PREMIUM|YOUTUBE
## 🎬 Netflix
NETFLIX*
## 📺 ChatGPT
CHATGPT|OPENAI
## 📺 Telegram Premium
TELEGRAM PREMIUM
## 📺 Microsoft
MICROSOFT STORE|XBOX
## 📺 Яндекс 360
ЯНДЕКС 360|YANDEX 360|YANDEX DISK
## 🎮 Steam
STEAM|STEAMPAY|STEAMGAMES
## 🎮 Epic Games
EPIC GAMES
## 🎮 Wargaming
WARGAMING|ВАРГЕЙМИНГ
## 🎮 My.Games
MY GAMES|MAIL RU GAMES
## 🎮 PlayStation
PLAYSTATION|PSN*
## 🎮 Nintendo
NINTENDO
## 🎮 Xsolla
XSOLLA
## 🎮 Battle.net
BATTLE NET|BLIZZARD
## 🎮 Roblox
ROBLOX
## 🎭 Яндекс Афиша
ЯНДЕКС АФИША|YANDEX AFISHA
## 🎭 Кассир
KASSIR|КАССИР РУ
## 🎭 Тикетленд
TICKETLAND|ТИКЕТЛЕНД
## 🎭 Qtickets
QTICKETS
## 🎭 Timepad
TIMEPAD|ТАЙМПАД
## 🎭 Билеты
КУПИБИЛЕТ|KUPIBILET
## 🎭 Боулинг
БОУЛИНГ|BOWLING
## 🎭 Аквапарк
АКВАПАРК|AQUAPARK
## 🎭 Зоопарк
ЗООПАРК|ZOOPARK
## 🎭 Музей
МУЗЕЙ|MUZEY|MUSEUM
## 🎭 Театр
ТЕАТР|TEATR
## 🎭 Филармония
ФИЛАРМОНИЯ|FILARMONIYA
## 🎭 Цирк
ЦИРК|TSIRK
## 🎭 Квест
КВЕСТ|KVEST
## 🎭 Лазертаг
ЛАЗЕРТАГ|LASERTAG
## 🎭 Батутный парк
БАТУТ|BATUT
## 🎭 Каток
КАТОК|KATOK
## 🎭 Парк аттракционов
АТТРАКЦИОН|ATTRAKCION
## 🏋️ World Class
WORLD CLASS|ВОРЛД КЛАСС
## 🏋️ X-Fit
X FIT|XFIT|ИКС ФИТ
## 🏋️ Alex Fitness
ALEX FITNESS|АЛЕКС ФИТНЕС
## 🏋️ Fitness House
FITNESS HOUSE|ФИТНЕС ХАУС
## 🏋️ Sport Life
SPORT LIFE|СПОРТ ЛАЙФ
## 🏋️ Физкульт
ФИЗКУЛЬТ|FIZKULT
## 🏋️ Fitness Time
FITNESS TIME
## 🏋️ Crossfit
КРОССФИТ|CROSSFIT
## 🏋️ Pilates
ПИЛАТЕС|PILATES
## 🏋️ Yoga
ЙОГА СТУДИЯ|YOGA STUDIO
## 🏋️ Бассейн
БАССЕЙН|BASSEYN
## 🏋️ Спортзал
ТРЕНАЖЕРНЫЙ ЗАЛ|ТРЕНАЖЕРКА
## 🧖 Баня
БАНЯ|BANYA
## 🧖 Сауна
САУНА|SAUNA
## 🧖 Массаж
МАССАЖ|MASSAGE|MASSAZH
## 🧖 Хамам
ХАМАМ|HAMMAM
## 💐 Цветы
ЦВЕТЫ|TSVETY|CVETY|ЦВЕТОЧНЫЙ|ЦВЕТОЧНАЯ ЛАВКА|ЦВЕТОЧНЫЙ САЛОН|БУКЕТ|BUKET*
ФЛОРИСТ|ФЛОРИСТИКА|FLORIST*
ФЛОРАМАНИЯ|FLORAMANIA|FLORAMANIYA
ЦВЕТЫ ДОСТАВКА|FLOWERS RU|FLOWWOW|ФЛАУВОУ|FLOWER SHOP
ЦВЕТОЧНЫЙ БАЗАР|ЦВЕТОЧНЫЙ МАГАЗИН
## 💈 Барбершоп
БАРБЕРШОП|BARBERSHOP
## 💈 Топган
TOPGUN|ТОПГАН
## 💈 Oh My Beauty
OH MY BEAUTY
## 💈 Салон красоты
САЛОН КРАСОТЫ|SALON KRASOTY
## 💈 Парикмахерская
ПАРИКМАХЕРСКАЯ|PARIKMAHERSKAYA
## 💈 Маникюр
МАНИКЮР|MANIKYUR
## 💈 Ногтевая студия
НОГТЕВАЯ СТУДИЯ|NAIL STUDIO
## 💈 Эпиляция
ЭПИЛЯЦИЯ|EPILYACIYA
## 💈 Косметолог
КОСМЕТОЛОГ|KOSMETOLOG
## 👔 Химчистка
ХИМЧИСТКА|HIMCHISTKA
## 👔 Прачечная
ПРАЧЕЧНАЯ|PRACHECHNAYA
## 👔 Ателье
АТЕЛЬЕ|ATELIER
`;
