/**
 * Словарь российских организаций для выписок Т-Банка, Ozon Банка, Газпромбанка, Сбера и др.
 * Одна строка = одна организация (варианты написания через «|»). Формат — см. engine.js.
 * Это часть 1 (продукты, красота, аптеки, кафе, транспорт, связь). Остальное — ru-2.js, ru-3.js.
 * Порядок строк важен: побеждает первая подошедшая.
 */

export const RU_EXPENSE_SRC_1 = `
## 🧴 Косметика
УЛЫБКА РАДУГИ|ULYBKA RADUGI|ULYBKA*
ЗОЛОТОЕ ЯБЛОКО|GOLD APPLE|GOLDAPPLE*|GOLDEN APPLE
ЛЭТУАЛЬ|ЛЕТУАЛЬ|LETUAL*|L ETOILE|LETOILE
РИВ ГОШ|RIV GOSH|RIVGOSH
ПОДРУЖКА|PODRUZHKA|PODRUGKA
МАГНИТ КОСМЕТИК|MAGNIT COSMETIC*|MAGNIT KOSMETIK
ИЛЬ ДЕ БОТЭ|ILE DE BEAUTE|ILDEBOTE
СЕФОРА|SEPHORA
ИВ РОШЕ|YVES ROCHER
ОРИФЛЭЙМ|ORIFLAME
ФАБЕРЛИК|FABERLIC
ЭЙВОН|AVON
НАТУРА СИБЕРИКА|NATURA SIBERICA
БЬЮТИ БАЗАР|BEAUTY BAZAAR
ЧИСТАЯ ЛИНИЯ|CHISTAYA LINIYA
ЛОККСИТАН|L OCCITANE|LOCCITANE
МЭРИ КЭЙ|MARY KAY
КОСМОТОРГ|KOSMOTORG
БЬЮТИ ХАУС|BEAUTY HOUSE
ПАРФЮМЕР|PARFUMER|PARFUMERIYA
ЛАБОРАТОРИЯ КРАСОТЫ

## 🛍️ Магнит
МАГНИТ|MAGNIT*|МАГНИТ СЕМЕЙНЫЙ|МАГНИТ ЭКСТРА

## 🏷️ Fix Price
ФИКС ПРАЙС|FIX PRICE|FIXPRICE*

## 🥦 Продукты
ПЯТЕРОЧКА|PYATEROCHKA*|PYATEROCHK*|5KA|5 KA|ПЯТЕРКА
ПЕРЕКРЕСТОК|PEREKRESTOK*|PEREKRYOSTOK
ВКУСВИЛЛ|VKUSVILL*|VKUSVILLE
ЛЕНТА|LENTA
ОКЕЙ|OKEY|OKEI|О КЕЙ
ДИКСИ|DIXY|DIKSI
ВЕРНЫЙ|VERNYJ|VERNYY|VERNYI
МЕТРО КЭШ|METRO CASH*|METRO C C
АШАН|AUCHAN*|ASHAN
КАРУСЕЛЬ|KARUSEL|CAROUSEL
АВОСЬКА|AVOSKA
ЧИЖИК|CHIZHIK
МОНЕТКА|MONETKA
БРИСТОЛЬ|BRISTOL
КРАСНОЕ БЕЛОЕ|КРАСНОЕ И БЕЛОЕ|KRASNOE BELOE|KRASNOE I BELOE
СПАР|SPAR|EUROSPAR|ЕВРОСПАР
АЗБУКА ВКУСА|AZBUKA VKUSA
ГЛОБУС|GLOBUS
ГИПЕРГЛОБУС|GIPERGLOBUS
МАРИЯ РА|MARIYA RA|MARIA RA
ЯРЧЕ|YARCHE
ХЛЕБ СОЛЬ|HLEB SOL
МИРАТОРГ|MIRATORG
КОМАНДОР|KOMANDOR
СВЕТОФОР|SVETOFOR
ВИКТОРИЯ|VIKTORIYA
БИЛЛА|BILLA
МАГНОЛИЯ|MAGNOLIYA
АТАК|ATAK
МЕГАМАРТ|MEGAMART
КОПЕЙКА|KOPEJKA|KOPEYKA
СЕМЬЯ|SEMYA
ТАВРИЯ|TAVRIYA
БАХЕТЛЕ|BAHETLE
ПОЛУШКА|POLUSHKA
КУПЕР|KUPER
СБЕРМАРКЕТ|SBERMARKET
САМОКАТ|SAMOKAT*
ЯНДЕКС ЛАВКА|YANDEX LAVKA|LAVKA
ДЕЛИВЕРИ КЛАБ|DELIVERY CLUB|DELIVERYCLUB
ОКЕЙ ЭКСПРЕСС|ЕВРООПТ|EVROOPT
НАШ УНИВЕРСАМ|NASH UNIVERSAM
ЭКОНОМ|ECONOM
МИНИМАРКЕТ|MINIMARKET|MINI MARKET
ПРОДУКТЫ|PRODUKTY|PRODUCTY
ГАСТРОНОМ|GASTRONOM
ФЕРМЕР|FERMER|FERMA

## 🍷 Алкоголь
ВИНЛАБ|VINLAB
ХМЕЛЬ И СОЛОД|KHMEL I SOLOD
ЖИВОЕ ПИВО|ZHIVOE PIVO
БИРМАРКЕТ|BIERMARKET|BIRMARKET
ОПИЛЛИ|OPILLI
ВИНОТЕКА|VINOTEKA
АРОМАТНЫЙ МИР|AROMATNYJ MIR
СИМПЛ ВАЙН|SIMPLE WINE|SIMPLEWINE
ВИНСТАР|VINSTAR
ЛАВКА ПИВО|PIVNOJ|PIVNOY|ПИВНОЙ
ДРИНКИТ|DRINKIT|DRINK IT

## 🧃 Напитки и соки
ВОДОМАТ|VODOMAT
ЭКОВОЛНА|ECOVOLNA
СВЯТОЙ ИСТОЧНИК|SVYATOJ ISTOCHNIK

## 💊 Аптека и здоровье
АПТЕКА|APTEKA*|APTEKI|APTEKARIUM
АПТЕЧНОЕ УЧРЕЖДЕНИЕ|APTECHNOE UCHREZHDENIE|APTECHNOE*
ВИТА АПТЕКА|VITA APTEKA*
ЗДОРОВ РУ|ZDOROV RU
РИГЛА|RIGLA
36 6|APTEKA 36 6
ГОРЗДРАВ|GORZDRAV
АСНА|ASNA
НЕОФАРМ|NEOFARM|NEO FARM
ЕАПТЕКА|EAPTEKA|E APTEKA
ЭВАЛАР|EVALAR
ОЗЕРКИ|OZERKI
СТОЛЕТОВ|STOLETOV
ФАРМЛЕНД|PHARMLAND
ПЛАНЕТА ЗДОРОВЬЯ|PLANETA ZDOROVYA
АПРЕЛЬ|APREL
МАКСАВИТ|MAKSAVIT
САМСОН ФАРМА|SAMSON PHARMA
МЕЛОДИЯ ЗДОРОВЬЯ|MELODIYA ZDOROVYA
МОНАСТЫРЕВ|MONASTYREV
АПТЕКА НИЗКИХ ЦЕН|NIZKIH CEN
АПТЕКА РУ|APTEKA RU
ЗДРАВСИТИ|ZDRAVSITI|ZDRAVCITY
ФАРМАЦИЯ|FARMACIYA|FARMATSIYA
ОПТИКА|OPTIKA
ЛЕКАРСТВА|LEKARSTVA|LEKARSTVO

## 🏥 Медицинские услуги
ИНВИТРО|INVITRO
ГЕМОТЕСТ|GEMOTEST
ХЕЛИКС|HELIX
МЕДСИ|MEDSI
СМ КЛИНИКА|SM CLINIC|SM KLINIKA
КДЛ|KDL
СИТИЛАБ|CITYLAB
ЕМС|EMC
МАТЬ И ДИТЯ|MAT I DITYA
СКАНДИНАВИЯ|SKANDINAVIYA
МЕДИКАЛ ОН ГРУПП|MEDICAL ON GROUP
К 31|K 31
ПРОДОКТОРОВ|PRODOCTOROV
СБЕРЗДОРОВЬЕ|SBERZDOROVE
КЛИНИКА|KLINIKA|CLINIC
МЕДИЦИНСКИЙ ЦЕНТР|MEDITSINSKIJ TSENTR|MEDCENTR
ПОЛИКЛИНИКА|POLIKLINIKA
СТОМАТОЛОГИЯ|STOMATOLOG*|DENTAL
ЛАБОРАТОРИЯ|LABORATORIYA

## ☕ Кофейные зависимости
ЭТЛОН|ETLON*
КОФЕ ТЕРАПИЯ|COFFE THERAPY|COFFEE THERAPY
COFFE|COFFEE|КОФЕ|KOFE|KOFEJNYA|KOFEYNYA
СТАРБАКС|STARBUCKS
СТАРС КОФЕ|STARS COFFEE
ШОКОЛАДНИЦА|SHOKOLADNITSA|SHOKOLADNICA
КОФЕМАНИЯ|COFFEEMANIA|KOFEMANIYA
ДАБЛБИ|DOUBLE B|DOUBLEB
КОФИКС|COFIX
ВАН ПРАЙС КОФЕ|ONE PRICE COFFEE
СЕРФ КОФЕ|SURF COFFEE
СКУРАТОВ|SKURATOV
ПРАВДА КОФЕ|PRAVDA COFFEE
ТРАВЕЛЕРС КОФЕ|TRAVELERS COFFEE|TRAVELER S COFFEE
КОФЕ ХАУС|COFFEE HOUSE|COFFEEHOUSE
КОФЕЙНЯ|KOFEJNIA
ЧАЙКОФ|CHAYKOF|CHAYKOFF
КОФЕ ПОРТ|KOFE PORT|COFFEE PORT
ЖАН ЖАК|JEAN JACQUES
ЧАЙНАЯ|CHAJNAYA|CHAYNAYA
ВЕНДИНГ|VENDING

## 🍔 Фастфуд
ВКУСНО И ТОЧКА|VKUSNO I TOCHKA|VKUSNO*
МАКДОНАЛДС|МАКДОНАЛЬДС|MC ?DONALD S?|MCDONALDS
БУРГЕР КИНГ|BURGER KING|BURGERKING
KFC|КФС|РОСТИКС|ROSTICS
ТЕРЕМОК|TEREMOK
ДОДО ПИЦЦА|DODO PIZZA|DODOPIZZA*
ПАПА ДЖОНС|PAPA JOHNS|PAPAJOHNS
ПИЦЦА ХАТ|PIZZA HUT|PIZZAHUT
ДОМИНОС|DOMINOS|DOMINO S PIZZA
САББВЭЙ|SUBWAY
КРОШКА КАРТОШКА|KROSHKA KARTOSHKA
ЧЕБУРЕЧНАЯ|CHEBURECHNAYA
ДВА КУСОЧКА|DVA KUSOCHKA
ПИЦЦАФАБРИКА|PIZZAFABRIKA|PIZZA FABRIKA
БЛЭК СТАР БУРГЕР|BLACK STAR BURGER
СТАРДОГС|STARDOGS
БИ БИ БУРГЕРС|BB BURGERS|BB&BURGERS
СУББОТА|ПИРОЖКОВАЯ|PIROZHKOVAYA
ШАУРМА|SHAURMA*|SHAWARMA|SHAVERMA|ШАВЕРМА
ДОНЕР|DONER
ШАШЛЫК|SHASHLYK|SHASHLIK
БАСКИН РОББИНС|BASKIN ROBBINS
КРИСПИ КРИМ|KRISPY KREME
СИННАБОН|CINNABON
ПОНЧИКИ|PONCHIKI|DONUTS
БЛИННАЯ|BLINNAYA
ФАСТФУД|FASTFOOD|FAST FOOD
ПИЦЦЕРИЯ|PIZZERIA|PIZZA|ПИЦЦА
БУРГЕР|BURGER

## 🍽️ Кафе и рестораны
МУ МУ|MU MU
ГРАБЛИ|GRABLI
ЕЛКИ ПАЛКИ|ELKI PALKI|YOLKI PALKI
ШТОЛЛЕ|STOLLE|SHTOLLE
ХЛЕБ НАСУЩНЫЙ|HLEB NASUSHCHNYJ
ТАРАС БУЛЬБА|TARAS BULBA
МАКАРОННИКИ|MAKARONNIKI
ИЛЬ ПАТИО|IL PATIO
ИЛ ФОРНО|IL FORNO
ТАНУКИ|TANUKI
ЯКИТОРИЯ|YAKITORIYA
СУШИ ВЕСЛО|SUSHI VESLO|SUSHI VESLA
ЁБИДОЁБИ|EBIDOEBI|YOBIDOYOBI
ПЛАНЕТА СУШИ|PLANETA SUSHI
МИЛТИ|MILTI
МАКИМАКА|MAKIMAKA
ЧАЙХОНА|CHAYHONA|CHAIHANA
ЯН ПРИМУС|YAN PRIMUS
ДЖОН ДЖОЛИ|JOHN JOLLY
ТБИЛИСО|TBILISO
МАМА РОМА|MAMA ROMA
ХИНКАЛЬНАЯ|ХИНКАЛИ|KHINKALI|HINKALI
ГИНЗА|GINZA
ТОКИО СИТИ|TOKYO CITY
ШИКАРИ|SHIKARI
CHILI|ЧИЛИ
РЕСТОРАН|RESTORAN*|RESTAURANT*
^REST [A-Z]+
КАФЕ|KAFE|CAFE
СТОЛОВАЯ|STOLOVAYA|STOLOVAJA
БУФЕТ|BUFET|BUFFET
БУЛОЧНАЯ|BULOCHNAYA
ПЕЛЬМЕННАЯ|PELMENNAYA
БИСТРО|BISTRO
ПАБ|PUB
ЛАУНЖ|LOUNGE

## 🚖 YandexGO Taxi
ЯНДЕКС GO|YANDEX( [0-9]+)? ?GO|YANDEX TAXI|YANDEX TAKSI|YANDEXGO*|ЯНДЕКС ТАКСИ|ЯНДЕКС ГО
ЯНДЕКС ДРАЙВ|YANDEX DRIVE

## 🚕 Такси
СИТИМОБИЛ|CITYMOBIL*|CITY MOBIL
ИНДРАЙВЕР|INDRIVER|IN DRIVER
ВЕЗЕТ|VEZET
МАКСИМ ТАКСИ|TAXI MAXIM
GETT|ГЕТТ
UBER|УБЕР
ТАКСОМОТОР|TAKSOMOTOR
ТАКСИ|TAKSI|TAXI*

## 🚗 Каршеринг
ДЕЛИМОБИЛЬ|DELIMOBIL*
ЛИФКАР|LIFCAR
БЕЛКАКАР|BELKACAR
СИТИДРАЙВ|CITYDRIVE
КАРШЕРИНГ|CARSHARING

## 🚇 Транспорт и проезд
ПЕТЕРБУРГСКИЙ МЕТРОПОЛИТЕН|SPB METRO|PETERBURGSKIJ METROPOLITEN
МЕТРОПОЛИТЕН|METROPOLITEN|METROPOLITAN
МОСМЕТРО|MOSMETRO
ПОДОРОЖНИК|PODOROZHNIK
ТРОЙКА|TROIKA|TROYKA
ГОРЭЛЕКТРОТРАНС|GORELECTROTRANS|GORELEKTROTRANS
ТРАМВАЙ|TRAMVAJ|TRAMVAY
ТРОЛЛЕЙБУС|TROLLEYBUS
АВТОБУСНЫЙ ПАРК|AVTOBUSNYJ PARK|AVTOBUSNYY PARK
ПАССАЖИРАВТОТРАНС|PASSAZHIRAVTOTRANS
ОПЛАТА ПРОЕЗДА|PROEZD*
ЭЛЕКТРИЧКА|ELEKTRICHKA
СЗППК|SZPPK
ЦППК|CPPK|TSPPK
ЗСД|ZSD
АВТОДОР|AVTODOR
ПЛАТОН|PLATON
ВУШ|WHOOSH
ЮРЕНТ|URENT
ДРОПП|DROPP
ЯНДЕКС САМОКАТ|YANDEX SAMOKAT

## 🚂 Поезд
РЖД|RZD*
САПСАН|SAPSAN
ЛАСТОЧКА|LASTOCHKA
ФПК|FPK
ТУТУ|TUTU*
ЖД БИЛЕТ|ZHD BILET

## ⛽ Бензин и заправка
ЛУКОЙЛ|LUKOIL*
РОСНЕФТЬ|ROSNEFT*
ГАЗПРОМНЕФТЬ|GAZPROMNEFT*|GAZPROM NEFT|GPN
ТАТНЕФТЬ|TATNEFT*
ШЕЛЛ|SHELL
ТЕБОЙЛ|TEBOIL
НЕСТЕ|NESTE
ТНК|TNK
БАШНЕФТЬ|BASHNEFT*
НЕФТЬМАГИСТРАЛЬ|NEFTMAGISTRAL
КИРИШИАВТОСЕРВИС|KIRISHIAVTOSERVIS|KAS
ОПТИ|OPTI
АЗС|AZS*
ЗАПРАВКА|ZAPRAVKA
ЭКТО|EKTO
ПЕТРОЛ|PETROL

## 🅿️ Парковка
ПАРКОВКА|PARKOVKA|PARKING*|ПАРКИНГ
МОСПАРКИНГ|MOSPARKING

## 🧽 Мойка машины
АВТОМОЙКА|AVTOMOJKA|AVTOMOYKA|CAR WASH|CARWASH
ДЕТЕЙЛИНГ|DETAILING

## 🛠️ СТО и техобслуживание
АВТОСЕРВИС|AVTOSERVIS|AVTOSERVICE
ШИНОМОНТАЖ|SHINOMONTAZH
КОЛЕСА ДАРОМ|KOLESA DAROM
ЭМЕКС|EMEX
ЭКЗИСТ|EXIST
АВТОДОК|AVTODOK
АВТОЗАПЧАСТИ|AVTOZAPCHASTI|ZAPCHASTI

## 📱 Мобильная связь и интернет
МТС|MTS*
БИЛАЙН|BEELINE*
МЕГАФОН|MEGAFON*
ТЕЛЕ2|TELE2
Т2|T2 MOBILE
ТМОБАЙЛ|TMOBILE|T MOBILE|T BANK MOBILE|ТБАНК МОБАЙЛ
ЙОТА|YOTA
СБЕРМОБАЙЛ|SBERMOBILE
ВТБ МОБАЙЛ|VTB MOBILE
ЛАЙФ|LIFE
МОТИВ|MOTIV
ПОПОЛНЕНИЕ ТЕЛЕФОНА|MOBILE

## 🌐 Интернет
УЮТ ТЕЛЕКОМ|UYUT TELEKOM|UJUT TELEKOM|UYUT TELECOM|UJUT TELECOM
РОСТЕЛЕКОМ|ROSTELECOM*|RTK
ДОМ РУ|DOM RU|DOMRU|ЭР ТЕЛЕКОМ|ER TELECOM
НЕТБАЙНЕТ|NETBYNET
ТТК|TTK
АКАДО|AKADO
ВИМПЕЛКОМ|VIMPELCOM
ПЕТЕРСТАР|PETERSTAR
ВЕСТЕЛ|VESTEL
ИНТЕРНЕТ|INTERNET|WIFI

## 🔌 Электроника
ДНС|DNS
М ВИДЕО|MVIDEO*|M VIDEO
ЭЛЬДОРАДО|ELDORADO
СИТИЛИНК|CITILINK
РЕ СТОР|RE STORE|RESTORE
СВЯЗНОЙ|SVYAZNOJ|SVYAZNOY
ТЕХНОПАРК|TEHNOPARK
ТЕХНОПОИНТ|TEHNOPOINT
ОНЛАЙН ТРЕЙД|ONLINETRADE|ONLINE TRADE
РЕГАРД|REGARD
НИКС|NIX
КОМПЬЮТЕРНЫЙ|КОМПЬЮТЕР|KOMPUTER
EPLAZA|ЕПЛАЗА
SC MARKET*

## 🛍️ Покупки
АВИТО|AVITO*
ЮЛА|YULA
ДЕТСКИЙ МИР|DETSKIJ MIR|DETSKIY MIR|DETMIR
ИСКУСНИЦА|ISKUSNICA
ЛЕРУА МЕРЛЕН|LEROY MERLIN|LEROYMERLIN
ИКЕА|IKEA
ОБИ|OBI
КАСТОРАМА|CASTORAMA
ПЕТРОВИЧ|PETROVICH
МАКСИДОМ|MAXIDOM
ФЛАМИНГО|FLAMINGO
ТРЦ|TRC|TRK|ТРК
`;

/** Доходы: описания из российских выписок → категория. Порядок важен. */
export const RU_INCOME_SRC = `
## 💳 Кэшбек
КЭШБЭК|КЭШБЕК|КЕШБЕК|КЕШБЭК|CASHBACK|CASH BACK
## 🏦 Проценты от вклада
ПРОЦЕНТЫ НА ОСТАТОК|ПРОЦЕНТЫ ПО ВКЛАДУ|ПРОЦЕНТЫ ПО НАКОПИТЕЛЬНОМУ|ВЫПЛАТА ПРОЦЕНТОВ|НАЧИСЛЕНИЕ ПРОЦЕНТОВ|ПРОЦЕНТЫ|PROCENTY
## ↩️ Возврат покупки
ВОЗВРАТ ТОВАРА|ВОЗВРАТ ПЛАТЕЖА|ВОЗВРАТ ПОКУПКИ|ВОЗВРАТ|REFUND|REVERSAL|ОТМЕНА ОПЕРАЦИИ|ОТМЕНА ПЛАТЕЖА
## 💸 Возврат с налогов, как манна небесная
НАЛОГОВЫЙ ВЫЧЕТ|ВОЗВРАТ НАЛОГА|ВОЗВРАТ НДФЛ|ИМУЩЕСТВЕННЫЙ ВЫЧЕТ|ФНС
## 🏛️ Гос. выплата / пенсия
ПЕНСИЯ|ПОСОБИЕ|СОЦИАЛЬНАЯ ВЫПЛАТА|СФР|ПФР|СТИПЕНДИЯ|МАТЕРИНСКИЙ КАПИТАЛ|ЕДИНОЕ ПОСОБИЕ|ЕДВ|СУБСИДИЯ
## 🧾 Дивиденды, будто я Уоррен Баффет
ДИВИДЕНДЫ|ДИВИДЕНД|КУПОННЫЙ ДОХОД|КУПОН|DIVIDEND*
## 💰 Зарплата
ЗАРПЛАТА|ЗАРАБОТНАЯ ПЛАТА|ЗП|SALARY|ОКЛАД|ЗАРПЛАТНЫЙ ПРОЕКТ
## 💼 Аванс
АВАНС|AVANS
## 🏠 Доход от аренды
АРЕНДНАЯ ПЛАТА|ПЛАТА ЗА АРЕНДУ|ARENDA|RENT
## 📦 Авито-деньги
АВИТО|AVITO*|ЮЛА|YULA
## 🎁 Подарок / бонус
ЧАЕВЫЕ|БОНУС|ПРЕМИЯ|BONUS|ПОДАРОК|PODAROK|С ДНЕМ РОЖДЕНИЯ
## 💼 Оплата по договору
ОПЛАТА ПО ДОГОВОРУ|ОПЛАТА ПО АКТУ|ПО АКТУ|ЗА УСЛУГИ|ГОНОРАР|ВОЗНАГРАЖДЕНИЕ|ПО ДОГОВОРУ|ДОГОВОР
## 🔄 Входящий перевод СБП
СИСТЕМА БЫСТРЫХ ПЛАТЕЖЕЙ|СБП|SBP
## 🔄 Входящий перевод
ВХОДЯЩИЙ ПЕРЕВОД|ПЕРЕВОД|PEREVOD|C2C|С2С
`;
