import test from 'node:test';
import assert from 'node:assert/strict';
import { matchCommand, COMMANDS, EXAMPLES } from '../src/shark/chatCommands.js';
import { routeUtterance, parseFxRequest, statRequest, incomeRequest } from '../src/shark/chatFlow.js';
import { buildParserContext } from '../src/shark/parser/chatContext.js';
import { QUESTIONS, STATS_ITEMS, FUN_ITEMS, MENUS } from '../src/shark/SharkTalk.js';
import { expenseCategories, incomeCategories } from '../constants/index.js';

const ctx = buildParserContext({ expense: expenseCategories, income: incomeCategories, now: new Date('2026-11-23T10:00:00+05:00') });
const id = t => matchCommand(t)?.id ?? null;

test('помощь и примеры: разные формулировки и опечатки', () => {
    for (const t of ['помощь', 'Помоги!', 'хелп', 'комманды', 'какие у меня есть команды', 'какие команды доступны', 'что ты умеешь?', 'что я могу сделать через чат',
        'покажи примеры сообщений', 'примеры', 'пример', 'как пользоватся', 'как записать долг', 'как добавить трату', 'что можно', 'какие есть возможности', '/help']) {
        assert.equal(id(t), 'examples', t);
    }
});

test('кнопки работают словами: все id из чипов покрыты командами', () => {
    const ids = new Set(COMMANDS.map(c => c.id));
    for (const q of [...QUESTIONS, ...STATS_ITEMS, ...FUN_ITEMS]) assert.ok(ids.has(q.id), `нет команды для кнопки ${q.id}`);
    for (const m of ['stats', 'fun', 'help', 'glossary', 'tips']) { assert.ok(MENUS[m]); assert.ok(ids.has(m), `нет команды для раздела ${m}`); }
    for (const r of ['recap:month', 'recap:week', 'recap:year', 'nospend']) assert.ok(ids.has(r), r);
});

test('команды: синонимы и порядок слов', () => {
    const cases = {
        'как моя неделя': 'week', 'моя неделя': 'week', 'мои долги': 'debts', 'покажи мои долги': 'debts', 'кто мне должен': 'debts',
        'расскажи шутку': 'joke', 'пошути': 'joke', 'шутку': 'joke', 'сколько осталось': 'left', 'итог месяца': 'month', 'итоги месяца': 'month',
        'мне грустно': 'cheer', 'дай совет': 'tips', 'покажи статистику': 'stats', 'мои накопления': 'savings', 'мои значки': 'badges',
        'правило 50/30/20': 'rule', 'сегодня без трат': 'nospend', 'каким был мой год': 'recap:year', 'а вчера': 'day:-1'
    };
    for (const [t, want] of Object.entries(cases)) assert.equal(id(t), want, t);
});

test('операции и вопросы с суммами и периодами не принимаются за команды', () => {
    for (const t of ['вчера такси 45к', 'зарплата 5 млн 20-го', 'одолжил Али 200к до пятницы', 'сколько я потратил на еду в этом месяце',
        'сколько осталось в этом месяце', 'кофе', 'такси', 'привет', 'топ расходов за неделю', 'у меня занял Саша 50к', '']) {
        assert.equal(matchCommand(t), null, t);
    }
});

test('примеры сообщений реально работают: команда, сводка или карточка', () => {
    for (const g of EXAMPLES) {
        assert.ok(g.title && g.hint && g.items.length);
        for (const t of g.items) {
            if (matchCommand(t) || parseFxRequest(t, 'UZS') || statRequest(t, '2026-11-23') || incomeRequest(t, ['💼 Аванс'])) continue;   // команды, валюты, средний чек за период и доходы отвечают сами
            const b = routeUtterance(t, ctx).branch;
            assert.ok(b === 'confirm' || b === 'summary', `${t} → ${b}`);
        }
    }
});

test('команды: похожие слова и опечатки понимаются по проценту совпадения', async () => {
    const { matchCommand: m, sim } = await import('../src/shark/chatCommands.js');
    assert.equal(m('каким была мой неделя')?.id, 'recap:week');
    assert.equal(m('какой была моя неделя')?.id, 'recap:week');
    assert.equal(m('мои долгги')?.id, 'debts');
    assert.equal(m('итог месяцa')?.id, 'month');
    assert.equal(m('помошь')?.type, 'help');
    assert.ok(sim('каким', 'какой') >= 0.75);
    assert.equal(m('абракадабра'), null);
});

test("разговорные формы: чо умеешь / чё можешь / скока осталось", () => {
    for (const t of ["чо умеешь", "чё можешь", "Чо ты умеешь?", "ну чо можешь кароче", "че умеешь", "короче что умеешь", "чем занимаешься", "кто ты", "расскажи о себе"]) assert.equal(id(t), "examples", t);
    assert.equal(id("скока осталось"), "left");
    assert.equal(id("чо по деньгам"), "left");
    assert.equal(id("чо по неделе"), "week");
    assert.equal(id("хватит ли денег"), "runout");
    assert.equal(id("приободри меня"), "cheer");
});

test('сокращённые команды: по смыслу те же, что полные', () => {
    const cases = {
        left: ['сколько могу', 'сколько можно', 'сколько есть', 'свободно'],
        today: ['траты дня', 'итог сегодня'],
        'day:-1': ['вчера траты', 'расходы за вчера'],
        week: ['итог за неделю', 'сводка недели'],
        lastweek: ['прошлая неделя траты'],
        limit: ['мой лимит', 'лимит дня'],
        cheer: ['поддержка', 'мотивируй меня'],
        topcat: ['главные категории', 'топ по тратам'],
        runout: ['хватит на сегодня', 'до вечера хватит'],
        debts: ['долг', 'должники', 'кто должен'],
        savings: ['сбережения', 'заначка'],
        waste: ['лишнее', 'где зря трачу'],
        month: ['за месяц', 'итог за месяц'],
        goal: ['цель', 'мои цели'],
        level: ['звание', 'уровень'],
        badges: ['награды', 'медали'],
        fact: ['факты', 'удиви'],
        joke: ['шутки', 'юмор', 'шутку'],
        nospend: ['без трат', 'ноль трат'],
        'recap:year': ['за год', 'итоги за год'],
        stats: ['стата', 'графики'],
        fun: ['скучно', 'развлеки меня'],
        glossary: ['термин', 'расшифруй'],
        tips: ['посоветуй', 'как сэкономить']
    };
    for (const [want, list] of Object.entries(cases)) for (const t of list) assert.equal(id(t), want, t);
    assert.equal(id('топ расходов за неделю'), null);
});

test('поступления = доходы; триместр = 3 месяца; период без «сколько»', () => {
    const q = t => routeUtterance(t, ctx);
    for (const t of ['за год поступлений', 'сколько поступлений за год', 'выручка за год', 'заработок за год']) {
        assert.equal(matchCommand(t), null, t);
        const i = q(t).intent;
        assert.equal(i.metric, 'income', t);
        assert.equal(i.period.from, '2026-01-01', t);
    }
    assert.equal(q('сколько трат за триместр').intent.period.from, '2026-09-01');
    assert.equal(q('расходы за квартал').intent.period.from, '2026-10-01');
    assert.equal(q('траты за 3 месяца').intent.period.from, '2026-09-01');
    assert.equal(q('доходы за 10 дней').intent.metric, 'income');
    assert.equal(id('затраты за неделю'), 'week');
    assert.equal(id('потратила сегодня'), 'today');
});

test('недели: «за неделю» — текущая, «на той/прошлой» — прошлая, «позапрошлая» — на неделю раньше', () => {
    const per = t => { assert.equal(matchCommand(t), null, t); return routeUtterance(t, ctx).intent.period; };
    assert.equal(routeUtterance('сколько потратил за неделю', ctx).intent?.period?.from ?? '2026-11-23', '2026-11-23');
    assert.equal(per('доходы за неделю').from, '2026-11-23');
    assert.equal(per('доходы на прошлой неделе').from, '2026-11-16');
    assert.equal(per('доходы на той неделе').from, '2026-11-16');
    assert.equal(per('расходы за позапрошлую неделю').from, '2026-11-09');
    assert.equal(per('расходы на позапрошлой неделе').to, '2026-11-15');
    assert.equal(id('прошлая неделя'), 'lastweek');
    assert.equal(id('на той неделе'), 'lastweek');
    assert.equal(id('траты за неделю'), 'week');
});

/* ───── аудит чата 5.0.6: новые формулировки, транслит, короткие реплики, защита от перехвата ───── */
test('новые формулировки команд: разговорные, с опечатками и сленгом', () => {
    const cases = {
        'сколько можно потратить сегодня': 'left', 'сколько осталось на сегодня': 'left', 'сколько до лимита': 'left', 'что по бабкам': 'left', 'как дела с бюджетом': 'left',
        'ск осталось': 'left', 'можно ли еще тратить': 'left', 'сколько ушло сегодня': 'today', 'итог за день': 'today', 'что я потратил за сегодня': 'today',
        'вчерашние покупки': 'day:-1', 'итоги вчерашнего дня': 'day:-1', 'что я потратил за вчера': 'day:-1', 'сколько я потратил на этой неделе': 'week', 'как неделя прошла': 'week',
        'итоги этой недели': 'week', 'что было на прошлой неделе': 'lastweek', 'сколько потратил за прошлую неделю': 'lastweek', 'сколько потратил за месяц': 'month',
        'сколько я потратила в этом месяце': 'month', 'какой лимит на сегодня': 'limit', 'почему лимит такой маленький': 'limit', 'дотяну до вечера': 'runout',
        'кто мне не вернул': 'debts', 'у кого я занимал': 'debts', 'сколько я задолжал': 'debts', 'сколько я отложила': 'savings', 'что в копилке': 'savings',
        'на что уходят деньги': 'topcat', 'где можно сэкономить': 'waste', 'что можно урезать': 'waste', 'могу ли я купить': 'whatif', 'сколько до цели': 'goal',
        'нет настроения': 'cheer', 'я сорвалась': 'cheer', 'анекдот про деньги': 'joke', 'расскажи анегдот': 'joke', 'факт про деньги': 'fact', 'что такое 50 30 20': 'rule',
        'покажи достижения': 'badges', 'статистеку покажи': 'stats', 'чё умеешь': 'examples', 'я сегодня ничего не тратила': 'nospend', 'сравни эту неделю с прошлой': 'vsweek'
    };
    for (const [t, want] of Object.entries(cases)) assert.equal(id(t), want, t);
});

test('транслит: латиница понимается как русский текст', async () => {
    const { translitRu, isLatin } = await import('../src/shark/chatCommands.js');
    assert.equal(translitRu('skolko ostalos'), 'сколко осталос');
    assert.equal(translitRu('moy limit'), 'мой лимит');
    assert.equal(translitRu('nedelyu'), 'неделю');
    assert.ok(isLatin('dolgi') && !isLatin('долги') && !isLatin('45000'));
    const cases = { 'skolko ostalos': 'left', 'balans': 'left', 'moi dolgi': 'debts', 'kto mne dolzhen': 'debts', 'moi nakopleniya': 'savings', 'shutka': 'joke',
        'pomogi': 'examples', 'statistika': 'stats', 'skolko potratil za nedelyu': 'week', 'skolko potratil vchera': 'day:-1', 'itog mesyaca': 'month' };
    for (const [t, want] of Object.entries(cases)) assert.equal(id(t), want, t);
    assert.equal(id('help'), 'examples');                       // английские команды не ломаются транслитом
});

test('короткие реплики: привет, спасибо, пока, похвала, «ок» — только без вопроса', async () => {
    const { smallTalk } = await import('../src/shark/chatCommands.js');
    const cases = { 'привет': 'hello', 'Привет, Акулка!': 'hello', 'доброе утро': 'hello', 'privet': 'hello', 'спасибо': 'thanks', 'спс': 'thanks', 'спасибо большое!': 'thanks',
        'spasibo': 'thanks', 'пока': 'bye', 'ну пока': 'bye', 'спасибо, пока': 'bye', 'молодец': 'praise', 'ты лучшая': 'praise', 'ок': 'ack', 'понятно': 'ack' };
    for (const [t, want] of Object.entries(cases)) assert.equal(smallTalk(t), want, t);
    for (const t of ['пока траты', 'привет сколько осталось', 'спасибо 50к', 'кофе', '']) assert.equal(smallTalk(t), null, t);
    // и не становятся командами: «пока» больше не похоже на «показатели»
    assert.equal(id('пока'), null);
    assert.equal(id('привет'), null);
});

test('перехват: общие слова, лишний предмет и слова про деньги уходят парсеру', () => {
    // «кто ты» = «кто»: без лишних слов только помощь
    assert.equal(id('кто ты'), 'examples');
    assert.notEqual(id('кто занимал у меня'), 'examples');
    assert.equal(id('что можно'), 'examples');
    assert.notEqual(id('что можно урезать'), 'examples');
    // «я всё потратил» — утешение, но «я всё потратил на такси» уже не оно
    assert.equal(id('я все потратил'), 'cheer');
    assert.notEqual(id('я все потратил на такси'), 'cheer');
    // фраза с деньгами + предмет: «сколько я потратил на еду за месяц» — не итог месяца
    for (const t of ['сколько я потратил на еду за месяц', 'сколько потратил сегодня на такси', 'траты за неделю на кафе', 'сколько потратил в прошлом месяце']) assert.equal(matchCommand(t), null, t);
    // одно слово фразы не засчитывается за два слова шаблона
    assert.notEqual(id('как неделя прошла'), 'lastweek');
    // запрещённые короткие фразы в каталог не попали
    const all = new Set(COMMANDS.flatMap(c => c.phrases.map(p => p.replace(/^=/, ''))));
    for (const w of ['вчера', 'хватит', 'топ', 'как ты']) assert.ok(!all.has(w), w);
    // «сегодня» есть, но только как отдельное слово («=»): с лишним словом это вопрос или запись для парсера
    assert.ok(COMMANDS.find(c => c.id === 'today').phrases.includes('=сегодня'));
    assert.equal(id('сегодня'), 'today');
    assert.equal(id('Сегодня?'), 'today');
    for (const t of ['сегодня такси', 'сегодня кафе', 'сегодня на еду']) assert.notEqual(id(t), 'today', t);
});

test('каталог: фразы не повторяются внутри команды и узнаются своей командой', () => {
    for (const c of COMMANDS) {
        const norm = c.phrases.map(p => p.replace(/^=/, '').toLowerCase().replace(/ё/g, 'е'));
        assert.equal(new Set(norm).size, norm.length, `повтор в ${c.id}`);
        for (const p of c.phrases) {
            const m = matchCommand(p.replace(/^=/, ''));
            if (c.id === 'dialog' && m?.id === 'today') continue;
            assert.equal(m?.id, c.id, `${c.id}: «${p}» → ${m?.id}`);
        }
    }
});

test('новые команды: последняя запись, удаление последней, средний чек, крупная трата, зарплата', () => {
    const cases = { 'последняя запись': 'last', 'последняя трата': 'last', 'что я последнее записал': 'last', 'удали последнюю запись': 'undo', 'отмени последнюю трату': 'undo',
        'я ошиблась удали': 'undo', 'средний чек': 'avg', 'сколько в среднем трачу': 'avg', 'самая крупная трата': 'biggest', 'самая дорогая покупка': 'biggest',
        'когда зарплата': 'payday', 'сколько дней до зарплаты': 'payday', 'сколько до зп': 'payday', 'когда аванс': 'payday' };
    for (const [t, want] of Object.entries(cases)) assert.equal(id(t), want, t);
    assert.equal(id('самые большие траты'), 'topcat');
    assert.equal(id('зарплата 5 млн'), null);
});

test('накопления с периодом не перехватываются итогом недели или месяца', () => {
    assert.equal(id('накопления за месяц'), 'savings');
    for (const t of ['накопления за неделю', 'сколько сэкономил за неделю', 'накопления за 3 месяца']) assert.ok(!['week', 'month'].includes(id(t)), t);
});

test('«мало категорий» и похожие — команда создания своей категории', () => {
    for (const t of ['мне не хватает категорий', 'мало категорий', 'нету нужной категории', 'нет нужной категории', 'добавь категорию', 'как добавить категорию', 'создать свою категорию', 'категорий мало']) assert.equal(id(t), 'addcat', t);
    assert.equal(id('как добавить трату'), 'examples');
});

test('страницы и функции словами, одно слово — только без лишних', () => {
    const cases = { 'аналитика': 'nav:analytics', 'открой аналитику': 'nav:analytics', 'открой графики': 'nav:analytics', 'план': 'nav:planner', 'открой план месяца': 'nav:planner',
        'настроить акулку': 'nav:shark', 'будь добрее': 'nav:shark', 'поменять лимит': 'nav:limit', 'сделай бэкап': 'nav:backup', 'резервная копия': 'nav:backup',
        'загрузить выписку': 'nav:import', 'выписка': 'nav:import', 'залётом': 'nav:import', 'сменить тему': 'nav:theme', 'мои счета': 'nav:accounts', 'курсы валют': 'fx',
        'статистика': 'stats', 'настройки': 'nav:settings', 'добавить операцию': 'manual' };
    for (const [t, want] of Object.entries(cases)) assert.equal(id(t), want, t);
    for (const t of ['сколько денег на карте', 'сколько пришло на карту', 'тема для разговора есть']) assert.ok(!String(id(t)).startsWith('nav:'), t);
});

test('ручной ввод и кнопки словами', () => {
    for (const t of ['вручную', 'ввести вручную', 'хочу вручную', 'ручной ввод', 'добавить вручную', 'открой ручной ввод', 'добавить операцию', 'новая транзакция']) assert.equal(id(t), 'manual', t);
    for (const t of ['кнопки', 'покажи кнопки', 'верни кнопки']) assert.equal(id(t), 'chips', t);
    assert.equal(id('вопросы и ответы'), 'faq');
    // «вручную» с суммой или лишним словом — не открывает форму
    assert.notEqual(id('вручную такси'), 'manual');
    assert.equal(id('такси 30к вручную'), null);
});

test('«Вопросы и ответы» приложения: каждый вопрос узнаётся, похожие формулировки тоже', async () => {
    const { matchFaq } = await import('../src/shark/chatCommands.js');
    const { FAQ_ITEMS } = await import('../constants/faq-constants.js');
    for (const it of FAQ_ITEMS) assert.equal(matchFaq(it.question, FAQ_ITEMS)?.question, it.question, it.question);
    const q = t => matchFaq(t, FAQ_ITEMS)?.question || null;
    assert.equal(q('что нового'), FAQ_ITEMS.find(i => /нового в версии/.test(i.question)).question);
    assert.match(q('что нового в 5.0.3'), /5\.0\.3/);
    assert.equal(q('что нового в 9.9.9'), null);
    const cases = { 'как установить на айфон': /iPhone/, 'приложение работает без интернета?': /без интернета/, 'безопасны ли мои данные': /безопасны/,
        'как восстановить данные после переустановки': /восстановить/, 'что такое залетом': /Залётом/, 'почему курс отличается': /курс валют/,
        'импорт не сработал': /импорт не сработал/, 'как работает поиск': /поиск/, 'сколько бюджетов можно создать': /бюджетов/, 'как сделать акулку тише': /тише/ };
    for (const [t, re] of Object.entries(cases)) assert.match(String(q(t)), re, t);
    for (const t of ['привет', 'сколько осталось', 'кофе 25к', 'мои долги', 'как дела', '']) assert.equal(q(t), null, t);
});

test('Akulka Projects: список словами, продукт по названию, с опечаткой и описанию', async () => {
    const { matchProject } = await import('../src/shark/chatCommands.js');
    const { AKULKA_PROJECTS } = await import('../constants/akulka-projects.js');
    // у каждого продукта есть всё, что нужно карточке
    const ids = new Set();
    for (const p of AKULKA_PROJECTS) {
        assert.ok(p.id && p.name && p.icon && p.short && p.desc && Array.isArray(p.aliases), p.id);
        assert.ok(!ids.has(p.id), `повтор ${p.id}`); ids.add(p.id);
        assert.ok(p.current || /^https:\/\//.test(p.url), `${p.id}: ссылка`);
        assert.equal(matchProject(p.name, AKULKA_PROJECTS)?.id, p.id, p.name);
        for (const a of p.aliases) assert.equal(matchProject(a, AKULKA_PROJECTS)?.id, p.id, `${p.id}: ${a}`);
    }
    assert.equal(AKULKA_PROJECTS.filter(p => p.current).length, 1);
    const m = t => matchProject(t, AKULKA_PROJECTS)?.id ?? null;
    assert.equal(m('что такое TeaTimer?'), 'teatimer');
    assert.equal(m('тиатаймер'), 'teatimer');
    assert.equal(m('расскажи про мигри'), 'migri');
    assert.equal(m('лудамания'), 'ludomania');
    for (const t of ['trackit тема', 'кофе 25к', 'чай 15к', 'купил чай', 'привет', 'мои долги']) assert.equal(m(t), null, t);
    for (const t of ['проекты акулки', 'akulka projects', 'акулка проджектс', 'какие еще продукты', 'другие приложения', 'проекты', 'экосистема']) assert.equal(id(t), 'projects', t);
});

test('темы и продукты: «trackit» одним словом — продукт, «поставь trackit» — тема', async () => {
    const { parseThemeRequest } = await import('../src/shark/chatFlow.js');
    const { THEMES } = await import('../src/ThemeManager.js');
    assert.deepEqual(parseThemeRequest('trackit', THEMES), { kind: 'set', value: 'trackit', alone: true });
    assert.deepEqual(parseThemeRequest('поставь trackit', THEMES), { kind: 'set', value: 'trackit' });
});

test('краткое пособие «как вести бюджет»: фразы новичка ведут к нему, «что умеешь» — к полному списку', async () => {
    for (const t of ['как ввести бюджет', 'как вести бюджет', 'как вести учёт', 'с чего начать', 'инструкция', 'гайд', 'я новичок', 'научи', 'как записывать траты', 'быстрый старт']) assert.equal(id(t), 'guide', t);
    for (const t of ['что ты умеешь', 'как пользоваться', 'как добавить трату', 'помощь']) assert.equal(id(t), 'examples', t);
    const { GUIDE_STEPS } = await import('../src/shark/texts/chat.js');
    assert.ok(GUIDE_STEPS.length >= 4 && GUIDE_STEPS.length <= 6);
    // примеры в пособии работают: команда, сводка или карточка записи
    for (const s of GUIDE_STEPS) {
        assert.ok(s.icon && s.title && s.text.length <= 140, s.title);
        for (const t of s.ex) {
            if (matchCommand(t)) continue;
            const b = routeUtterance(t, ctx).branch;
            assert.ok(b === 'confirm' || b === 'summary', `${t} → ${b}`);
        }
    }
});

test('обращение по имени — отклик, «тема акулка» — тема, «другую акулку» — настройки', async () => {
    const { isCall } = await import('../src/shark/chatCommands.js');
    const { parseThemeRequest, pickAnswer } = await import('../src/shark/chatFlow.js');
    const { THEMES } = await import('../src/ThemeManager.js');
    for (const t of ['Акулка', 'акулка!', 'Акул', 'эй акулка', 'акулка ты тут?', 'ты тут?', 'ау', 'Акулька']) {
        assert.ok(isCall(t), t);
        assert.equal(pickAnswer({ call: true, cmd: matchCommand(t) }).kind, 'call', t);
    }
    for (const t of ['акулка сколько осталось', 'привет акулка', 'акулка кофе 25к', 'где', 'тема акулка']) assert.equal(isCall(t), false, t);
    for (const t of ['тема акулка', 'смени акулка', 'смени акулку', 'поставь акулку', 'тему акулку']) assert.equal(parseThemeRequest(t, THEMES)?.value, 'shark', t);
    for (const t of ['Акулка', 'хочу другую акулку', 'смени персонажа', 'настроить акулку']) assert.equal(parseThemeRequest(t, THEMES), null, t);
    for (const t of ['хочу другую акулку', 'смени персонажа', 'настроить акулку']) assert.equal(id(t), 'nav:shark', t);
});

test('сторисы: общий список и каждый сторис отдельно, «в сторис» не уходит в сводку', async () => {
    const { periodQuery } = await import('../src/shark/chatFlow.js');
    for (const t of ['сторис', 'сторисы', 'сториз', 'stories', 'истории', 'мои итоги', 'покажи сторисы', 'все сторис', 'какие есть сторис', 'рекапы']) assert.equal(id(t), 'stories', t);
    const one = { 'сторис за месяц': 'recap:month', 'каким был мой месяц': 'recap:month', 'месячный рекап': 'recap:month', 'рекап': 'recap:month',
        'сторис недели': 'recap:week', 'какой была моя неделя': 'recap:week', 'недельный рекап': 'recap:week',
        'сторис за год': 'recap:year', 'годовой рекап': 'recap:year', 'wrapped': 'recap:year', 'мой год': 'recap:year' };
    for (const [t, want] of Object.entries(one)) { assert.equal(id(t), want, t); assert.equal(periodQuery(t, ctx), false, t); }
    assert.equal(periodQuery('итоги года в сторис', ctx), false);
    // обычные итоги — по-прежнему сводки и команды, а не сторис
    assert.equal(id('итоги месяца'), 'month');
    assert.equal(id('как моя неделя'), 'week');
});

test('«Акууулка!» и «Аааакуллл» — громкий отклик, «Акулка» — обычный', async () => {
    const { callKind } = await import('../src/shark/chatCommands.js');
    for (const t of ['Акууулка', 'Акулкаааа', 'Аааакуллл', 'Акуул', 'АКУЛКА!!', 'АКУЛКА', 'ауууу', 'эй акулкааа', 'Акуууула', 'Акулкаа ты тууут']) assert.equal(callKind(t), 'shout', t);
    for (const t of ['Акулка', 'акулка!', 'Акул', 'Акулька', 'акулка ты тут?', 'ау', 'ты тут?']) assert.equal(callKind(t), 'call', t);
    for (const t of ['привет акулка', 'акулка 25к', 'акулка сколько осталось', 'кооофе']) assert.equal(callKind(t), null, t);
});

test('настройки Акулки из чата: сразу, выбором и панелью; темы и траты не трогаем', async () => {
    const { parseSharkSettingsRequest: p } = await import('../src/shark/chatFlow.js');
    assert.deepEqual(p('настроить акулку'), { kind: 'panel' });
    assert.deepEqual(p('сменить и настроить'), { kind: 'panel' });
    for (const t of ['сменить маскот', 'смени вид акулки', 'хочу другую акулку', 'смени персонажа', 'внешний вид']) assert.deepEqual(p(t), { kind: 'pick', key: 'shark' }, t);
    assert.deepEqual(p('сменить характер'), { kind: 'pick', key: 'character' });
    assert.deepEqual(p('характер'), { kind: 'pick', key: 'character' });
    assert.deepEqual(p('болтливость'), { kind: 'pick', key: 'talk' });
    const set = { 'будь добрее': ['character', 'kind'], 'сделай строже': ['character', 'strict'], 'строгая': ['character', 'strict'], 'помолчи': ['talk', 'quiet'], 'тише': ['talk', 'quiet'],
        'больше болтай': ['talk', 'chatty'], 'болтушка': ['talk', 'chatty'], 'хочу Акула': ['shark', 'classic'], 'классическая акула': ['shark', 'classic'], 'верни Акулку в худи': ['shark', 'hoodie'] };
    for (const [t, [key, value]] of Object.entries(set)) assert.deepEqual(p(t), { kind: 'set', key, value }, t);
    // «смени акулку» — выбор персонажа (pickAnswer ставит его раньше темы), «потише с тратами» — подколка (isSpendTease)
    for (const t of ['тема акулка', 'тихая тема', 'поболтаем', 'как дела', 'кофе 25к', 'добрый вечер', 'Акулка']) assert.equal(p(t), null, t);
});

test('«что нового»: последняя версия по номеру, а не по месту в списке', async () => {
    const { matchFaq: m, latestVersionItem } = await import('../src/shark/chatCommands.js');
    const items = [
        { question: '🆕 Что нового в версии 5.0.4?', answer: 'a' },
        { question: '🆕 Что нового в версии 5.0.10?', answer: 'b' },
        { question: '🦈 Как Акулка считает дневной лимит?', answer: 'c' },
        { question: '🆕 Что нового в версии 5.0.9?', answer: 'd' }
    ];
    assert.equal(latestVersionItem(items).answer, 'b');
    for (const t of ['что нового', 'апдейт', 'последнее обновление', 'какая версия', 'какая последняя версия', 'что добавили', 'что поменялось']) assert.equal(m(t, items)?.answer, 'b', t);
    assert.equal(m('что нового в 5.0.4', items)?.answer, 'a');
    assert.equal(m('что нового в версии 6.0.0', items), null);
    const { FAQ_ITEMS } = await import('../constants/faq-constants.js');
    const { APP_VERSION } = await import('../constants/constants.js');
    // свежий «Что нового» совпадает с версией приложения — не забыть добавить пункт при релизе
    assert.ok(latestVersionItem(FAQ_ITEMS).question.includes(APP_VERSION), `нет «Что нового в версии ${APP_VERSION}» в FAQ`);
});
