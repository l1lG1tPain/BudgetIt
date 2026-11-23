import test from 'node:test';
import assert from 'node:assert/strict';
import { routeUtterance, cardOf, optionsOf, answerClarification, commitIntent } from '../src/shark/chatFlow.js';
import { buildParserContext } from '../src/shark/parser/chatContext.js';
import { expenseCategories, incomeCategories } from '../constants/index.js';

const ctx = buildParserContext({ expense: expenseCategories, income: incomeCategories, now: new Date('2026-11-23T10:00:00+05:00') });
const fakeBm = () => ({ added: [], paid: [], addTransaction(t) { this.added.push(t); }, markDebtPayment(id, a) { this.paid.push([id, a]); } });

test('ветки: пусто, не понято, сводка, подтверждение', () => {
    assert.equal(routeUtterance('   ', ctx).branch, 'empty');
    assert.equal(routeUtterance('привет как дела', ctx).branch, 'unparsed');
    assert.equal(routeUtterance('сколько я потратил на еду в этом месяце', ctx).branch, 'summary');
    const r = routeUtterance('вчера такси 45к', ctx);
    assert.equal(r.branch, 'confirm');
    assert.equal(r.intents.length, 1);
});

test('ветка уточнения: нет суммы', () => {
    const r = routeUtterance('такси вчера', ctx);
    assert.equal(r.branch, 'clarify');
    assert.equal(r.clarification.field, 'amount');
});

test('карточка: строки и предупреждения', () => {
    const c = cardOf(routeUtterance('вчера такси 45к', ctx).intents[0]);
    assert.ok(c.canSave);
    assert.deepEqual(c.rows.find(r => r[0] === 'Сумма'), ['Сумма', '45 000']);
    assert.deepEqual(c.rows.find(r => r[0] === 'Дата'), ['Дата', '22.11.2026']);
    const h = cardOf(routeUtterance('такси 5 000 000 000', ctx).intents[0]);
    assert.ok(h.warnings.length > 0 && h.strong);
});

test('будущая дата: не пишется без выбора, выбор снимает блок', () => {
    const r = routeUtterance('такси 45к 25.12.2026', ctx);
    assert.equal(r.branch, 'clarify');
    assert.equal(r.clarification.field, 'future_date');
    const intent = r.result.intents[0];
    const bm = fakeBm();
    assert.equal(commitIntent(intent, bm).ok, false);
    assert.equal(bm.added.length, 0);
    const opts = optionsOf(r.clarification, intent, r.result.meta.today).map(o => o.value);
    assert.deepEqual(opts, ['keep', 'today']);
    const today = answerClarification(r.result, 'today', 'такси 45к 25.12.2026');
    assert.equal(today.kind, 'result');
    assert.equal(today.result.intents[0].tx.date, '2026-11-23');
    assert.equal(today.result.needsClarification, null);
    const keep = answerClarification(r.result, 'keep', 'такси 45к 25.12.2026');
    assert.equal(keep.result.intents[0].tx.date, '2026-12-25');
    assert.equal(commitIntent(keep.result.intents[0], bm, { id: 1 }).ok, true);
    assert.equal(bm.added[0].date, '2026-12-25');
    // исходный результат не изменён
    assert.ok(intent.flags.includes('future_date'));
});

test('уточнение суммы: досыпается к фразе и разбирается заново', () => {
    const r = routeUtterance('такси вчера', ctx);
    const a = answerClarification(r.result, '45к', 'такси вчера');
    assert.equal(a.kind, 'reparse');
    assert.equal(routeUtterance(a.text, ctx).branch, 'confirm');
});

test('запись: расход, долг, отмена ничего не меняет', () => {
    const bm = fakeBm();
    const exp = routeUtterance('вчера такси 45к', ctx).intents[0];
    const res = commitIntent(exp, bm, { id: 7 });
    assert.equal(res.ok, true);
    assert.deepEqual([bm.added[0].type, bm.added[0].amount, bm.added[0].id], ['expense', 45000, 7]);
    const bm2 = fakeBm();
    routeUtterance('одолжил Али 200к до пятницы', ctx); // разбор сам ничего не пишет
    assert.equal(bm2.added.length + bm2.paid.length, 0);
});

test('нечего писать: неполное намерение', () => {
    const bm = fakeBm();
    const r = routeUtterance('такси вчера', ctx);
    assert.deepEqual(commitIntent(r.result.intents[0], bm), { ok: false, reason: 'incomplete' });
    assert.equal(bm.added.length, 0);
});

test('долг: направление по фразе', () => {
    const dir = t => routeUtterance(t, ctx).result.intents[0].tx.direction;
    const cases = {
        'у меня занял денег Саша 50к': 'owed',
        'Саша занял у меня 50к': 'owed',
        'Саша занял 50к': 'owed',
        'дал в долг Саше 50к': 'owed',
        'я одолжил Саше 50к': 'owed',
        'мне занял Саша 50к': 'owe',
        'мне одолжил Саша 50к': 'owe',
        'я занял у Саши 50к': 'owe',
        'одолжил у Саши 50к': 'owe'
    };
    for (const [t, d] of Object.entries(cases)) assert.equal(dir(t), d, t);
    assert.equal(routeUtterance('у меня занял денег Саша 50к', ctx).result.intents[0].tx.name, 'Саша');
});

test('категории без истории: общая, а не бренд', () => {
    const cat = t => routeUtterance(t, ctx).result.intents[0].tx.category;
    assert.equal(cat('такси 45к'), '🚖 Такси');
    assert.equal(cat('яндекс такси 45к'), '🚖 Такси');
});

test('«еда»: берутся все похожие категории, включая свои, без чужих', () => {
    const c = buildParserContext({ expense: expenseCategories, income: incomeCategories, custom: { expense: ['🏷️ Еда с работы'], income: [] }, now: new Date('2026-11-23T10:00:00+05:00') });
    const cats = routeUtterance('сколько я потратил на еду в этом месяце', c).intent.categories;
    assert.ok(cats.length > 20);
    for (const n of ['Продукты', 'Кафе и рестораны', 'Яндекс Еда', 'Молочка', 'Еда с работы']) assert.ok(cats.some(x => x.includes(n)), n);
    for (const n of ['Крепкий алкоголь', 'Бойлер', 'Вода и канализация', 'Кофемашина', 'Магадан']) assert.ok(!cats.some(x => x.includes(n)), n);
});

test('сводка смотрит и на название позиции, а не только на категорию', async () => {
    const { runSummary } = await import('../src/shark/parser/index.js');
    const tx = [
        { id: 1, type: 'expense', date: '2026-11-05', category: '🥦 Продукты', amount: 100000 },
        { id: 2, type: 'expense', date: '2026-11-06', category: '🛍 Прочее', amount: 30000, products: [{ name: 'Молоко и хлеб', quantity: 1, price: 30000 }] },
        { id: 3, type: 'expense', date: '2026-11-07', category: '🛍 Прочее', amount: 5000, note: 'жвачка' },
        { id: 4, type: 'expense', date: '2026-11-08', category: '🛍 Прочее', amount: 70000, products: [{ name: 'Пицца на всех', quantity: 1, price: 70000 }] }
    ];
    const food = routeUtterance('сколько я потратил на еду в этом месяце', ctx).intent;
    assert.equal(runSummary(food, tx).total, 200000);
    const pizza = routeUtterance('сколько я потратил на пиццу в этом месяце', ctx).intent;
    assert.equal(runSummary(pizza, tx).total, 70000);
});

test('сводка по названию позиции: склонение, список найденных', async () => {
    const { runSummary } = await import('../src/shark/parser/summary.js');
    const tx = [{ type: 'expense', date: '2026-11-10', amount: 30000, category: 'Прочее', name: 'Кока-кола' }, { type: 'expense', date: '2026-11-11', amount: 5000, category: 'Прочее', name: 'Хлеб' }];
    const r = routeUtterance('сколько я потратил на колу', ctx);
    assert.equal(r.branch, 'summary');
    assert.equal(r.intent.subject, 'колу');
    const s = runSummary(r.intent, tx);
    assert.equal(s.total, 30000);
    assert.equal(s.items.length, 1);
    assert.equal(s.items[0].name, 'Кока-кола');
});

test('периоды: месяцы списком, диапазон, N месяцев, квартал; команды уступают парсеру', async () => {
    const { periodQuery } = await import('../src/shark/chatFlow.js');
    const p = q => routeUtterance(q, ctx).intent.period;
    assert.deepEqual([p('топ расходов за октябрь').from, p('топ расходов за октябрь').to], ['2026-10-01', '2026-10-31']);
    assert.deepEqual([p('итог за октябрь ноябрь').from, p('итог за октябрь ноябрь').to], ['2026-10-01', '2026-11-30']);
    assert.deepEqual([p('итог за июль и ноябрь').from, p('итог за июль и ноябрь').to], ['2026-07-01', '2026-11-30']);
    assert.deepEqual([p('расходы с октября по июль').from, p('расходы с октября по июль').to], ['2025-10-01', '2026-07-31']);
    assert.equal(p('итоги за 2 месяца').from, '2026-10-01');
    assert.equal(p('расходы за полгода').from, '2026-06-01');
    assert.equal(p('топ расходов за квартал').from, '2026-10-01');
    assert.equal(p('расходы за прошлый квартал').to, '2026-09-30');
    assert.notEqual(routeUtterance('через 3 дня такси 50к', ctx).branch, 'summary');
    assert.equal(periodQuery('итог за октябрь', ctx), true);
    assert.equal(periodQuery('итог месяца', ctx), false);
});

test('периоды: «с …» без конца — до сегодня', () => {
    const p = q => routeUtterance(q, ctx).intent.period;
    assert.deepEqual([p('расходы с октября').from, p('расходы с октября').to], ['2026-10-01', '2026-11-23']);
    assert.deepEqual([p('сколько потратил с 5 ноября').from, p('сколько потратил с 5 ноября').to], ['2026-11-05', '2026-11-23']);
    assert.equal(p('расходы с октября по ноябрь').to, '2026-11-30');
});
/* ───── аудит чата 5.0.6 ───── */
test('транслит в парсере: латиница без разбора пробуется кириллицей', () => {
    const r = routeUtterance('taksi 45k', ctx);
    assert.equal(r.branch, 'confirm');
    assert.equal(r.intents[0].tx.amount, 45000);
    assert.equal(routeUtterance('skolko potratil v oktyabre', ctx).intent.period.kind, 'month');
    // узбекская латиница по-прежнему разбирается напрямую
    assert.equal(routeUtterance('kecha taksi 30 ming', ctx).branch, 'confirm');
});

test('periodQuery: категория после «на/по» отдаёт фразу парсеру, случайное совпадение — нет', async () => {
    const { periodQuery } = await import('../src/shark/chatFlow.js');
    for (const t of ['сколько на продукты за прошлую неделю', 'расходы на транспорт за неделю', 'сколько за неделю на еду', 'траты на кафе за неделю']) assert.equal(periodQuery(t, ctx), true, t);
    for (const t of ['сколько свободно', 'сколько накоплено', 'день без трат', 'итог месяца', 'как моя неделя']) assert.equal(periodQuery(t, ctx), false, t);
});

test('карточка: предупреждение о нулях написано по-русски', async () => {
    const { FLAG_WARNINGS } = await import('../src/shark/chatFlow.js');
    assert.equal(FLAG_WARNINGS.huge_amount, 'Очень большая сумма. Проверь, нет ли лишних нулей.');
});

/* ───── категории, которой нет: варианты, своя категория, ответ словами ───── */
test('вопрос о категории: похожие варианты, «➕ Своя» и «✏️ Другая», заметка с предметом', async () => {
    const F = await import('../src/shark/chatFlow.js');
    const r = routeUtterance('купил штуку за 50к', ctx);
    assert.equal(r.branch, 'clarify');
    const it = r.result.intents[0];
    assert.equal(it.tx.note, 'штуку');                                  // «за» ушло вместе с суммой
    const opts = optionsOf(r.clarification, it, r.result.meta.today, ctx);
    assert.ok(opts.length >= 4 && opts.some(o => o.value === '🥦 Продукты'));
    assert.ok(opts.some(o => o.value === F.CAT_NEW + 'Штуку' && /Своя/.test(o.label)));
    assert.equal(opts.at(-1).value, F.CAT_OTHER);
    assert.match(F.questionOf(r.clarification, it), /«штуку»/);
    // без ctx — как раньше: только подсказки парсера
    assert.deepEqual(optionsOf(r.clarification, it, r.result.meta.today), []);
    // доход: свои варианты
    const inc = routeUtterance('заработал 500к', ctx);
    const io = optionsOf(inc.clarification, inc.result.intents[0], inc.result.meta.today, ctx);
    assert.ok(io.some(o => o.value === '💰 Зарплата'));
    assert.match(F.questionOf(inc.clarification, inc.result.intents[0]), /доход/);
});

test('ответ словами: категория ищется отдельно, заметка не портится', () => {
    const r = routeUtterance('купил штуку за 50к', ctx);
    const a = answerClarification(r.result, 'фрукты', 'купил штуку за 50к', ctx);
    assert.equal(a.kind, 'result');
    const it = a.result.intents[0];
    assert.equal(it.tx.category, '🍏 Фрукты');
    assert.equal(it.tx.note, 'штуку');
    assert.equal(a.result.needsClarification, null);
    // «Трата» — это тип, а не категория: спрашиваем снова, заметка не меняется
    const b = answerClarification(r.result, 'Трата', 'купил штуку за 50к', ctx);
    assert.equal(b.kind, 'result');
    assert.equal(b.result.needsClarification.field, 'category');
    assert.equal(b.result.intents[0].tx.note, 'штуку');
});

test('своя категория: предлагается для незнакомого слова и создаётся только вместе с операцией', async () => {
    const F = await import('../src/shark/chatFlow.js');
    const r = routeUtterance('купил штуку за 50к', ctx);
    const a = answerClarification(r.result, 'кракозябра', 'купил штуку за 50к', ctx);
    assert.equal(a.result.needsClarification.typed, 'Кракозябра');
    const opts = optionsOf(a.result.needsClarification, a.result.intents[0], a.result.meta.today, ctx);
    assert.ok(opts.some(o => o.value === F.CAT_NEW + 'Кракозябра'));
    assert.match(F.questionOf(a.result.needsClarification, a.result.intents[0]), /«Кракозябра» пока нет/);
    const b = answerClarification(a.result, F.CAT_NEW + 'Кракозябра', 'купил штуку за 50к', ctx);
    const it = b.result.intents[0];
    assert.equal(it.tx.category, '🏷️ Кракозябра');
    assert.deepEqual(cardOf(it).rows.find(r => r[0] === 'Категория'), ['Категория', '🏷️ Кракозябра (новая)']);
    // до записи категории нет; после «Записать» — есть и операция тоже
    const bm = { ...fakeBm(), customCategories: { income: [], expense: [] } };
    assert.deepEqual(bm.customCategories.expense, []);
    const res = commitIntent(it, bm);
    assert.ok(res.ok);
    assert.equal(res.newCategory, '🏷️ Кракозябра');
    assert.deepEqual(bm.customCategories.expense, ['🏷️ Кракозябра']);
    assert.equal(bm.added[0].category, '🏷️ Кракозябра');
    // уже существующее название не дублируется, а выбирается
    const c = answerClarification(r.result, F.CAT_NEW + 'Продукты', 'купил штуку за 50к', ctx);
    assert.equal(c.result.intents[0].tx.category, '🥦 Продукты');
    assert.equal(c.result.intents[0].newCategory, undefined);
    // лимит своих категорий: ничего не записано
    const full = { ...fakeBm(), customCategories: { income: [], expense: Array.from({ length: 30 }, (_, i) => `🏷️ К${i}`) } };
    const bad = commitIntent(it, full);
    assert.equal(bad.ok, false);
    assert.equal(full.added.length, 0);
});

test('«удали трату …» не создаёт новую трату', () => {
    const r = routeUtterance('удали трату такси 30к', ctx);
    assert.equal(r.branch, 'unparsed');
    assert.ok(r.deleteHint);
    assert.equal(routeUtterance('такси 30к', ctx).branch, 'confirm');
});

test('записи: последняя, средний чек, крупная трата, ближайшая зарплата', async () => {
    const F = await import('../src/shark/chatFlow.js');
    const tx = [
        { id: 1, type: 'expense', date: '2026-11-03', amount: 50000, category: '🍏 Фрукты' },
        { id: 5, type: 'expense', date: '2026-11-20', amount: 200000, category: '🛍️ Покупки' },
        { id: 3, type: 'income', date: '2026-10-05', amount: 5000000, category: '💰 Зарплата' },
        { id: 4, type: 'income', date: '2026-11-05', amount: 5000000, category: '💰 Зарплата' },
        { id: 6, type: 'debt', date: '2026-11-21', name: 'Али', initialAmount: 100000, direction: 'owed' }
    ];
    const last = F.lastRecord(tx);
    assert.equal(last.id, 6);
    assert.equal(F.canUndo(last), false);
    assert.equal(F.recordLabel(last), 'долг 100 000 · Али · 21.11.2026');
    assert.equal(F.canUndo(F.lastRecord(tx.slice(0, 4))), true);
    assert.equal(F.lastRecord([]), null);
    assert.deepEqual(F.averageSpend(tx, '2026-11-23'), { avg: 125000, perDay: 10870, count: 2, total: 250000, days: 23 });
    assert.equal(F.averageSpend(tx, '2026-12-01'), null);
    assert.equal(F.biggestSpend(tx, '2026-11-23').amount, 200000);
    assert.deepEqual(F.nextPayday(tx, '2026-11-23'), { date: '2026-12-05', days: 12 });
    assert.deepEqual(F.nextPayday(tx, '2026-11-05'), { date: '2026-11-05', days: 0 });
    assert.deepEqual(F.nextPayday(tx, '2026-12-20'), { date: '2027-01-05', days: 16 });
    assert.equal(F.nextPayday([], '2026-11-23'), null);
});

test('periodQuery: накопления за период — парсеру, за месяц — команде', async () => {
    const { periodQuery } = await import('../src/shark/chatFlow.js');
    for (const t of ['накопления за неделю', 'накопления за полгода', 'сколько отложил за 3 месяца', 'накопления с 1 ноября']) assert.equal(periodQuery(t, ctx), true, t);
    assert.equal(periodQuery('накопления за месяц', ctx), false);
});

test('окно своей категории: эмодзи и название из окна, эмодзи по умолчанию', async () => {
    const F = await import('../src/shark/chatFlow.js');
    assert.equal(F.newCategoryAnswer('🍉', 'Арбуз'), F.CAT_NEW + '🍉|Арбуз');
    assert.equal(F.suggestEmoji('Арбуз', 'expense', ctx), '🥦');          // как у «Продуктов»
    assert.equal(F.suggestEmoji('Кракозябра', 'expense', ctx), '🏷️');
    const all = F.EMOJI_GROUPS.flatMap(g => g.list);
    assert.ok(all.includes('🏷️'));
    for (const g of F.EMOJI_GROUPS) assert.equal(new Set(g.list).size, g.list.length, g.id);
    const r = routeUtterance('купил штуку за 50к', ctx);
    const a = answerClarification(r.result, F.newCategoryAnswer('🍉', 'Штуки сезонные'), 'купил штуку за 50к', ctx);
    const it = a.result.intents[0];
    assert.equal(it.tx.category, '🍉 Штуки сезонные');
    assert.deepEqual([it.newCategory.emoji, it.newCategory.name], ['🍉', 'Штуки сезонные']);
    const bm = { ...fakeBm(), customCategories: { income: [], expense: [] } };
    assert.ok(commitIntent(it, bm).ok);
    assert.deepEqual(bm.customCategories.expense, ['🍉 Штуки сезонные']);
});

test('без бренда — унифицированная категория, бренд — если назван, история не перебивает словарь', () => {
    const H = [];
    for (let i = 1; i <= 6; i++) H.push({ id: i, type: 'expense', date: `2026-11-0${i}`, amount: 30000, category: '🛒 KorzinkaGO', products: [{ name: 'масло' }, { name: 'хлеб' }] });
    const c = buildParserContext({ expense: expenseCategories, income: incomeCategories, transactions: H, now: new Date('2026-11-23T10:00:00+05:00') });
    const cat = t => routeUtterance(t, c).result.intents[0].tx.category;
    for (const t of ['масло 30к', 'хлеб 5к', 'молоко 10к', 'арбуз 40к', 'продукты 100к']) assert.equal(cat(t), '🥦 Продукты', t);
    assert.equal(cat('такси 30к'), '🚖 Такси');
    assert.equal(cat('korzinka 50к'), '🛒 Korzinka');
    assert.equal(cat('корзинка 50к'), '🛒 Korzinka');
    assert.equal(cat('корзинка го 50к'), '🛒 KorzinkaGO');
    assert.equal(cat('yandex go 30к'), '🚖 YandexGO Taxi');
    assert.equal(cat('makro 100к'), '🛒 Makro');
    assert.equal(cat('масло в машину 200к'), '🚗 Машина');
});

test('память Акулки: общая категория по умолчанию, привычная — вариантом в карточке', () => {
    const H = [];
    for (let i = 1; i <= 6; i++) H.push({ id: i, type: 'expense', date: `2026-11-0${i}`, amount: 30000, category: '🛒 KorzinkaGO', products: [{ name: 'масло' }, { name: 'вкусняшки' }] });
    H.push({ id: 9, type: 'expense', date: '2026-11-09', amount: 5000, category: '🛒 KorzinkaGO', products: [{ name: 'сыр' }] });
    const c = buildParserContext({ expense: expenseCategories, income: incomeCategories, transactions: H, now: new Date('2026-11-23T10:00:00+05:00') });
    const it = t => routeUtterance(t, c).result.intents[0];
    // словарь знает слово: «Продукты», а KorzinkaGO — предложение (6 раз)
    const oil = it('масло 30к');
    assert.equal(oil.tx.category, '🥦 Продукты');
    assert.deepEqual(oil.memory, { word: 'масло', category: '🛒 KorzinkaGO', count: 6, same: false });
    // словарь слово не знает: берём по памяти и честно об этом говорим
    const sweet = it('вкусняшки 20к');
    assert.equal(sweet.tx.category, '🛒 KorzinkaGO');
    assert.equal(sweet.memory.same, true);
    // один раз — ещё не привычка; бренд назван — память не нужна
    assert.equal(it('сыр 45к').memory, undefined);
    assert.equal(it('korzinka 50к').memory, undefined);
    // без истории памяти нет
    assert.equal(routeUtterance('масло 30к', ctx).result.intents[0].memory, undefined);
});

test('свои категории: ищутся первыми и с другим окончанием, частичное совпадение — вариантом', () => {
    const H = [];
    for (let i = 1; i <= 3; i++) H.push({ id: i, type: 'expense', date: `2026-11-0${i}`, amount: 30000, category: '📦 Wildberries', products: [{ name: 'нож' }] });
    const mk = custom => buildParserContext({ expense: expenseCategories, income: incomeCategories, custom: { expense: custom, income: [] }, transactions: H, now: new Date('2026-11-23T10:00:00+05:00') });
    const it = (t, c) => routeUtterance(t, c).result.intents[0];
    for (const custom of [['🔪 Нож'], ['🔪 Ножи']]) {
        const c = mk(custom);
        for (const t of ['Нож 25к', 'ножи 25к', 'купил нож 25к']) assert.equal(it(t, c).tx.category, custom[0], `${custom[0]}: ${t}`);
        // раньше «нож» записывали в Wildberries — это остаётся вариантом в карточке
        assert.equal(it('нож 25к', c).memory?.category, '📦 Wildberries');
    }
    // словарь слова не знает — своя по первому слову названия
    assert.equal(it('нож 25к', mk(['🏷️ Нож кухонный'])).tx.category, '🏷️ Нож кухонный');
    // словарь знает слово: общая категория, своя «Кофе дома» — вариантом ✨
    const coffee = it('кофе 20к', mk(['🏷️ Кофе дома']));
    assert.equal(coffee.tx.category, '☕ Кофе на улице');
    assert.deepEqual([coffee.memory.category, coffee.memory.own], ['🏷️ Кофе дома', true]);
    assert.equal(it('кофе дома 20к', mk(['🏷️ Кофе дома'])).tx.category, '🏷️ Кофе дома');
    // свои категории есть среди вариантов при вопросе о категории
    const c = mk(['🔪 Нож']);
    const r = routeUtterance('купил штуку за 50к', c);
    assert.ok(optionsOf(r.clarification, r.result.intents[0], r.result.meta.today, c).some(o => o.value === '🔪 Нож'));
});

test('«⇄ Это доход / Это трата»: тип меняется, категория подбирается заново, ничего не пишется', async () => {
    const F = await import('../src/shark/chatFlow.js');
    const cb = routeUtterance('кэшбэк 25к', ctx).result.intents[0];
    assert.equal(cb.tx.type, 'income');
    const asExp = F.switchType(cb, ctx);
    assert.equal(asExp.tx.type, 'expense');
    assert.equal(asExp.tx.category, null);
    assert.ok(asExp.missing.includes('category'));
    assert.equal(cardOf(asExp).rows[0][1], 'Трата');
    assert.equal(cardOf(asExp).canSave, false);
    const tr = F.switchType(routeUtterance('перевод от Али 100к', ctx).result.intents[0], ctx);
    assert.equal(tr.tx.type, 'income');
    assert.ok(tr.tx.category && !tr.missing.includes('category'));
    // долг тип не меняет
    assert.equal(F.switchType(routeUtterance('одолжил Али 200к', ctx).result.intents[0], ctx), null);
});

test('своя категория без операции («мало категорий»): проверка названия и дублей', async () => {
    const F = await import('../src/shark/chatFlow.js');
    const ok = F.createCustomCategory({ income: [], expense: [] }, 'expense', '🔪', 'Нож', ctx);
    assert.equal(ok.value, '🔪 Нож');
    assert.deepEqual(ok.categories.expense, ['🔪 Нож']);
    assert.equal(F.createCustomCategory({ income: [], expense: [] }, 'income', '💼', 'Блог', ctx).categories.income[0], '💼 Блог');
    assert.ok(F.createCustomCategory({}, 'expense', '', 'Такси', ctx).error);       // такая уже есть
    assert.ok(F.createCustomCategory({}, 'expense', '', '   ', ctx).error);
});

test('валюты: курс, пересчёт с вопросом или «в …», запись с валютой не трогаем', async () => {
    const { parseFxRequest } = await import('../src/shark/chatFlow.js');
    const fx = t => parseFxRequest(t, 'UZS');
    assert.deepEqual(fx('курс доллара'), { kind: 'rates', code: 'USD' });
    assert.deepEqual(fx('курсы валют'), { kind: 'rates', code: null });
    assert.deepEqual(fx('доллар сколько стоит'), { kind: 'rates', code: 'USD' });
    assert.deepEqual(fx('курс тенге'), { kind: 'rates', code: 'KZT' });
    const cases = [['100$?', 100, 'USD', 'UZS'], ['?$ 100', 100, 'USD', 'UZS'], ['12.5$?', 12.5, 'USD', 'UZS'], ['50€?', 50, 'EUR', 'UZS'], ['100 долларов в сумах', 100, 'USD', 'UZS'],
        ['1 млн сум в долларах', 1e6, 'UZS', 'USD'], ['1,5 млн сум в $?', 1.5e6, 'UZS', 'USD'], ['1 млн сум в $', 1e6, 'UZS', 'USD'], ['200к сум?', 2e5, 'UZS', 'USD'],
        ['3 млн сум в рублях', 3e6, 'UZS', 'RUB'], ['сколько 100 баксов', 100, 'USD', 'UZS'], ['100 usd to uzs', 100, 'USD', 'UZS'], ['1 265 040 сум в $?', 1265040, 'UZS', 'USD']];
    for (const [t, amount, from, to] of cases) assert.deepEqual(fx(t), { kind: 'convert', amount, from, to }, t);
    for (const t of ['100$ на такси', 'потратил 100 долларов', 'зарплата 500$', '100$ кофе', 'кофе 25к', 'привет?', 'сколько осталось']) assert.equal(fx(t), null, t);
    assert.deepEqual(parseFxRequest('1000 руб?', 'KZT'), { kind: 'convert', amount: 1000, from: 'RUB', to: 'KZT' });
});

test('частые категории для чипсов и запись из чипса', async () => {
    const F = await import('../src/shark/chatFlow.js');
    const tx = [];
    for (let i = 1; i <= 5; i++) tx.push({ id: i, type: 'expense', date: `2026-11-1${i}`, amount: 20000 + i * 5000, category: '🚖 Такси' });
    for (let i = 1; i <= 3; i++) tx.push({ id: 10 + i, type: 'expense', date: `2026-11-0${i}`, amount: 18000, category: '☕ Кофе на улице' });
    tx.push({ id: 20, type: 'income', date: '2026-11-05', amount: 5e6, category: '💰 Зарплата' }, { id: 21, type: 'income', date: '2026-10-05', amount: 5e6, category: '💰 Зарплата' });
    tx.push({ id: 30, type: 'expense', date: '2026-11-20', amount: 999, category: '🎁 Подарки и праздники' });          // один раз — не частая
    tx.push({ id: 31, type: 'expense', date: '2026-01-01', amount: 1, category: '🎁 Подарки и праздники' }, { id: 32, type: 'expense', date: '2026-01-02', amount: 1, category: '🎁 Подарки и праздники' }); // давно
    const list = F.frequentCategories(tx, '2026-11-23');
    assert.deepEqual(list.map(x => x.category), ['🚖 Такси', '☕ Кофе на улице', '💰 Зарплата']);
    assert.deepEqual(list[0].amounts, [45000, 40000, 35000]);
    assert.deepEqual(list[1].amounts, [18000]);
    assert.equal(list[2].type, 'income');
    // запись из чипса: категория из чипса, сумма, дата и заметка из текста
    const q = { category: '🚖 Такси', type: 'expense' };
    const r = F.routeQuick('вчера 30к до работы', q, ctx);
    assert.equal(r.branch, 'confirm');
    const it = r.intents[0];
    assert.deepEqual([it.tx.type, it.tx.category, it.tx.amount, it.tx.date], ['expense', '🚖 Такси', 30000, '2026-11-22']);
    assert.equal(F.routeQuick('45 000', q, ctx).intents[0].tx.amount, 45000);
    const inc = F.routeQuick('5 млн', { category: '💰 Зарплата', type: 'income' }, ctx);
    assert.deepEqual([inc.intents[0].tx.type, inc.intents[0].tx.category], ['income', '💰 Зарплата']);
    // слово «долг» или «вклад» в тексте не меняет тип и категорию чипса
    assert.deepEqual([F.routeQuick('30к долг', q, ctx).intents[0].tx.type, F.routeQuick('30к долг', q, ctx).intents[0].tx.category], ['expense', '🚖 Такси']);
});

test('темы из чата: выбор без названия, сразу по названию, записи и обращение «Акулка» не трогаем', async () => {
    const { parseThemeRequest, THEME_ALIASES } = await import('../src/shark/chatFlow.js');
    const { THEMES } = await import('../src/ThemeManager.js');
    const th = t => parseThemeRequest(t, THEMES);
    for (const t of ['смени тему', 'сменить тему', 'поменяй тему', 'хочу другую тему', 'темы', 'какие есть темы']) assert.deepEqual(th(t), { kind: 'pick' }, t);
    const cases = { 'смени на светлую': 'light', 'смени тему на тёмную': 'dark', 'поставь тиффани': 'tiffany', 'тиффани': 'tiffany', 'тёмная тема': 'dark', 'тёмная': 'dark',
        'включи тёмную классик': 'dark-classic', 'светлая classic': 'light-classic', 'хочу оникс': 'onyx', 'бордо': 'burgundy', 'включи ночной режим': 'dark',
        'верни акулью тему': 'shark', 'тему акулку': 'shark', 'Sage Green': 'sage', 'смени на мятную': 'mint', 'Дельфинчик': 'dolphin', 'зеленая тема': 'sage' };
    for (const [t, value] of Object.entries(cases)) { const r = th(t); assert.deepEqual([r?.kind, r?.value], ['set', value], t); }
    assert.deepEqual(th('случайную тему'), { kind: 'random' });
    for (const t of ['Акулка', 'хочу другую акулку', 'виноград 25к', 'купил виноград', 'кальян', 'светлая сторона', 'мои долги', 'сделай строже', 'верни как было', 'тёмная тема 50к']) assert.equal(th(t), null, t);
    // у каждой темы приложения есть свои названия в чате, и её собственное имя тоже понимается
    for (const t of THEMES) {
        assert.ok(THEME_ALIASES[t.value]?.length, t.value);
        assert.deepEqual(th(`поставь ${t.name}`), { kind: 'set', value: t.value }, t.name);
    }
});

test('кто отвечает на фразу: тема, валюта, Q&A, продукт, команда, запись — в одном порядке', async () => {
    const F = await import('../src/shark/chatFlow.js');
    const C = await import('../src/shark/chatCommands.js');
    const { THEMES } = await import('../src/ThemeManager.js');
    const { AKULKA_PROJECTS } = await import('../constants/akulka-projects.js');
    const { FAQ_ITEMS } = await import('../constants/faq-constants.js');
    // те же проверки, что делает чат (SharkUI.say)
    const answer = text => {
        let cmd = C.matchCommand(text);
        if (cmd && F.periodQuery(text, ctx)) cmd = null;
        const pick = F.pickAnswer({ cmd, theme: F.parseThemeRequest(text, THEMES), fx: F.parseFxRequest(text, 'UZS'), faq: C.matchFaq(text, FAQ_ITEMS), project: C.matchProject(text, AKULKA_PROJECTS) });
        if (pick.kind === 'parse') return `parse:${routeUtterance(text, ctx).branch}`;
        return `${pick.kind}:${pick.value.id || pick.value.value || pick.value.kind || pick.value.question || ''}`;
    };
    // «trackit» одним словом — продукт, с глаголом или словом «тема» — тема
    assert.equal(answer('trackit'), 'project:trackit');
    assert.equal(answer('TrackIt'), 'project:trackit');
    assert.equal(answer('поставь trackit'), 'theme:trackit');
    assert.equal(answer('смени тему на trackit'), 'theme:trackit');
    assert.equal(answer('тиффани'), 'theme:tiffany');
    // вопрос из Q&A важнее продукта BudgetIt и общих команд
    assert.match(answer('как установить BudgetIt на iPhone'), /^faq:.*iPhone/);
    assert.match(answer('Как установить BudgetIt на iPhone?'), /^faq:.*iPhone/);
    assert.match(answer('как работает поиск'), /^faq:.*поиск/);
    assert.equal(answer('budgetit'), 'project:budgetit');
    // «чай» — обычная запись, а не TeaTimer
    assert.equal(answer('чай 15к'), 'parse:confirm');
    assert.equal(answer('купил чай'), 'parse:clarify');
    assert.equal(answer('купил чай 20к'), 'parse:confirm');
    assert.equal(answer('teatimer'), 'project:teatimer');
    // остальные ветки на своих местах
    assert.equal(answer('100$?'), 'fx:convert');
    assert.equal(answer('мои долги'), 'command:debts');
    assert.equal(answer('проекты акулки'), 'command:projects');
});

test('средний чек и крупная трата за период: «за неделю», «в октябре», «за 3 месяца»', async () => {
    const F = await import('../src/shark/chatFlow.js');
    const today = '2026-11-23';
    const s = t => { const r = F.statRequest(t, today); return r && `${r.id} ${F.periodLabel(r.period, today)}`; };
    assert.equal(s('средний чек за неделю'), 'avg на этой неделе');
    assert.equal(s('средний чек за октябрь'), 'avg в октябре');
    assert.equal(s('средний чек за 3 месяца'), 'avg за 01.09–23.11');
    assert.equal(s('в среднем в день за прошлую неделю'), 'avg на прошлой неделе');
    assert.equal(s('средний чек с 1 по 15 ноября'), 'avg за 01.11–15.11');
    assert.equal(s('самая крупная трата за год'), 'biggest в этом году');
    assert.equal(s('самая большая покупка в октябре'), 'biggest в октябре');
    for (const t of ['средний чек', 'самые крупные траты за октябрь', 'кофе 25к', 'траты за неделю']) assert.equal(F.statRequest(t, today), null, t);
    assert.equal(F.periodLabel(null, today), 'в этом месяце');
    const tx = [
        { id: 1, type: 'expense', date: '2026-10-03', amount: 30000, category: '☕ Кофе' },
        { id: 2, type: 'expense', date: '2026-10-20', amount: 90000, category: '🍔 Еда' },
        { id: 3, type: 'expense', date: '2026-11-20', amount: 500000, category: '🛍️ Покупки' }
    ];
    const oct = F.statRequest('средний чек за октябрь', today).period;
    assert.deepEqual(F.averageSpend(tx, today, oct), { avg: 60000, perDay: 4138, count: 2, total: 120000, days: 29 });   // записи с 3 октября — дни с 3-го
    assert.equal(F.biggestSpend(tx, today, oct).id, 2);
    assert.equal(F.averageSpend(tx, today, F.statRequest('средний чек за прошлую неделю', today).period).count, 1);
    assert.equal(F.averageSpend(tx, today, F.statRequest('средний чек за неделю', today).period), null);   // 23.11 — понедельник, трат ещё нет
});

test('доходы по графику: зарплата, аванс, любая категория и «мало данных»', async () => {
    const F = await import('../src/shark/chatFlow.js');
    const cats = ['💰 Зарплата', '💼 Аванс', '🎁 Подарок', '🛠️ Фриланс, надеюсь не кидалово', '💳 Кэшбек, который даже не заметил', '🔪 Нож'];
    assert.deepEqual(F.incomeRequest('когда зарплата', cats), { salary: true });
    assert.deepEqual(F.incomeRequest('сколько дней до зарплаты и аванса', cats), { salary: true });
    assert.deepEqual(F.incomeRequest('сколько до аванса', cats), { salary: true, cats: ['💼 Аванс'] });
    assert.deepEqual(F.incomeRequest('когда фриланс', cats), { cats: ['🛠️ Фриланс, надеюсь не кидалово'] });
    assert.deepEqual(F.incomeRequest('сколько до кэшбэка', cats), { cats: ['💳 Кэшбек, который даже не заметил'] });
    assert.deepEqual(F.incomeRequest('когда придут доходы', cats), { all: true });
    for (const t of ['когда я потратил на такси', 'сколько осталось до конца месяца', 'сколько потратил до зарплаты', 'зарплата 5 млн', 'привет']) assert.equal(F.incomeRequest(t, cats), null, t);
    const tx = [['2026-08-05', '💰 Зарплата'], ['2026-08-20', '💼 Аванс'], ['2026-09-06', '💰 Зарплата'], ['2026-09-20', '💼 Аванс'], ['2026-10-04', '💰 Зарплата'],
        ['2026-10-21', '💼 Аванс'], ['2026-11-07', '💰 Зарплата'], ['2026-11-10', '🎁 Подарок']].map(([date, category], i) => ({ id: i, type: 'income', amount: 1, date, category }));
    const r = F.incomeSchedule(tx, '2026-11-23');
    const by = Object.fromEntries(r.map(x => [x.category, x]));
    // в ноябре зарплата пришла 7-го → то же число в декабре
    assert.deepEqual(by['💰 Зарплата'].slots, [{ avgDay: 6, next: '2026-12-07', days: 14, late: false }]);
    // аванс обычно ~20-го, в ноябре записи нет → «ждём»
    assert.equal(by['💼 Аванс'].slots[0].late, true);
    assert.equal(by['🎁 Подарок'].enough, false);
    // до аванса в этом месяце: ещё впереди
    assert.deepEqual(F.incomeSchedule(tx, '2026-11-15', c => /Аванс/.test(c))[0].slots[0], { avgDay: 20, next: '2026-11-20', days: 5, late: false });
    assert.equal(r[0].category, '💰 Зарплата');
    assert.equal(F.incomeSchedule(tx.slice(0, 2), '2026-08-25').every(x => !x.enough), true);
    assert.equal(F.pluralDays(1), '1 день');
    assert.equal(F.pluralDays(3), '3 дня');
    assert.equal(F.pluralDays(12), '12 дней');
    assert.equal(F.pluralDays(21), '21 день');
});

test('бюджеты из чата: создать, сменить по названию или списком, удалять нельзя', async () => {
    const F = await import('../src/shark/chatFlow.js');
    const B = [{ name: '🏠 Дом' }, { name: '✈️ Отпуск' }, { name: 'Работа' }];
    const p = t => F.parseBudgetRequest(t, B);
    assert.deepEqual(p('создать бюджет'), { kind: 'create' });
    assert.deepEqual(p('новый бюджет'), { kind: 'create' });
    assert.deepEqual(p('создай бюджет Отпуск 2'), { kind: 'create', name: 'Отпуск 2' });
    assert.deepEqual(p('создай новый бюджет «Машина»'), { kind: 'create', name: 'Машина' });
    assert.deepEqual(p('создай бюджет с названием 🚗 Машина'), { kind: 'create', name: '🚗 Машина' });
    assert.deepEqual(p('Акулка, создай бюджет на ремонт'), { kind: 'create', name: 'Ремонт' });
    assert.deepEqual(p('открой новый бюджет дача'), { kind: 'create', name: 'Дача' });
    for (const t of ['сменить бюджет', 'мои бюджеты', 'открой бюджет', 'другой бюджет']) assert.deepEqual(p(t), { kind: 'switch' }, t);
    assert.equal(p('смени бюджет на отпуск').index, 1);
    assert.equal(p('перейди в бюджет Дом').index, 0);
    assert.equal(p('переключись на работу').index, 2);
    assert.equal(p('смени бюджет на машину').index, -1);
    for (const t of ['удали бюджет', 'удалить этот бюджет', 'сотри бюджет Дом']) assert.deepEqual(p(t), { kind: 'delete' }, t);
    for (const t of ['открой аналитику', 'как вести бюджет', 'бюджет 500к', 'перейди в настройки', 'привет']) assert.equal(p(t), null, t);
    assert.equal(F.budgetNameProblem('Очень длинное имя бюджета', B), 'long');
    assert.equal(F.budgetNameProblem('дом', B), 'exists');
    assert.equal(F.budgetNameProblem('Дача!', B), 'chars');
    assert.equal(F.budgetNameProblem('🌴 Дача', B), '');
});

test('«потише с тратами» — подколка; вопросы про экономию — нет; «смени акулку» — выбор Акулки', async () => {
    const F = await import('../src/shark/chatFlow.js');
    for (const t of ['потише с тратами', 'Потише с тратами!', 'не трать так много', 'хватит тратить', 'поменьше трать', 'экономь давай', 'не транжирь', 'тормози с покупками', 'умерь аппетиты'])
        assert.equal(F.isSpendTease(t), true, t);
    for (const t of ['как тратить меньше', 'я хочу тратить меньше', 'мне надо меньше тратить', 'потише', 'хватит', 'кофе 25к', 'траты за неделю']) assert.equal(F.isSpendTease(t), false, t);
    assert.deepEqual(F.parseSharkSettingsRequest('смени акулку'), { kind: 'pick', key: 'shark' });
    assert.deepEqual(F.parseSharkSettingsRequest('поменяй акулку'), { kind: 'pick', key: 'shark' });
    assert.equal(F.parseSharkSettingsRequest('тема акулка'), null);
    assert.equal(F.parseSharkSettingsRequest('смени тему на акулку'), null);
    assert.equal(F.pickAnswer({ shark: { kind: 'pick', key: 'shark' }, theme: { id: 'akulka' } }).kind, 'shark');
});

test('доходы без графика: проценты каждый день и случайный кэшбэк не дают «дня выплаты»', async () => {
    const F = await import('../src/shark/chatFlow.js');
    const mk = (cat, dates) => dates.map((date, i) => ({ id: cat + i, type: 'income', amount: 1, date, category: cat }));
    const tx = [
        ...mk('💰 Зарплата', ['2026-05-05', '2026-06-05', '2026-07-03', '2026-08-05', '2026-09-04', '2026-10-05', '2026-11-05']),
        ...mk('💳 Кэшбек', ['2026-05-04', '2026-06-21', '2026-07-13', '2026-08-26', '2026-09-12', '2026-09-26']),
        ...mk('🏦 Проценты', ['2026-08-08', '2026-08-10', '2026-08-12', '2026-08-13', '2026-09-07', '2026-09-09', '2026-09-11', '2026-09-12', '2026-10-02', '2026-10-03', '2026-11-03'])
    ];
    const by = Object.fromEntries(F.incomeSchedule(tx, '2026-11-23').map(r => [r.category, r]));
    assert.deepEqual(by['💰 Зарплата'].slots, [{ avgDay: 5, next: '2026-12-05', days: 12, late: false }]);
    assert.deepEqual(by['💳 Кэшбек'].slots, []);
    assert.deepEqual(by['🏦 Проценты'].slots, []);
    // «в день» за прошлый год — с первой записи, а не с 1 января
    const sp = [{ id: 1, type: 'expense', date: '2025-07-01', amount: 184000, category: '🍔 Еда' }];
    assert.equal(F.averageSpend(sp, '2026-11-23', { kind: 'last_year', from: '2025-01-01', to: '2025-12-31' }).days, 184);
});

test('план из чата: показать, открыть, создать с параметрами, продлить, удалять нельзя', async () => {
    const F = await import('../src/shark/chatFlow.js');
    const p = t => F.parsePlanRequest(t, '2026-11-23');
    for (const t of ['план', 'мой план', 'текущий план', 'что по плану', 'лимит по плану', 'сколько осталось по плану']) assert.deepEqual(p(t), { kind: 'show' }, t);
    assert.deepEqual(p('открой планировщик'), { kind: 'open' });
    assert.deepEqual(p('создай план'), { kind: 'create' });
    assert.deepEqual(p('создай план на 15 дней 10 млн'), { kind: 'create', days: 15, amount: 10000000 });
    assert.deepEqual(p('создай план с 1 декабря на 2 недели 8 млн'), { kind: 'create', days: 14, amount: 8000000, start: '2026-12-01' });
    assert.deepEqual(p('составь план с завтра на 20 дней'), { kind: 'create', days: 20, start: '2026-11-24' });
    assert.deepEqual(p('спланируй месяц'), { kind: 'create', days: 30 });
    assert.deepEqual(p('редактировать план'), { kind: 'edit' });
    assert.deepEqual(p('продли план на 5 дней'), { kind: 'update', addDays: 5 });
    assert.deepEqual(p('измени сумму плана на 12 млн'), { kind: 'update', amount: 12000000 });
    assert.deepEqual(p('удали план'), { kind: 'delete' });
    for (const t of ['как работает план', 'что такое планировщик', 'планшет 3 млн', 'план 50к', 'запланировал купить', 'кофе 25к']) assert.equal(p(t), null, t);
    const d = F.planDraft({ days: 15, amount: 10e6, today: '2026-11-23' });
    assert.equal(d.name, 'План 23.11–07.12');
    assert.equal(d.incomePlan.amount, 10e6);
    assert.equal(d.periodDays, 15);
    assert.equal(F.pickAnswer({ plan: { kind: 'show' }, cmd: { id: 'nav:planner' } }).kind, 'plan');
});

test('опечатки с телефона: повторы, лишний и пропущенный пробел, буква не та или пропущена', async () => {
    const { chatVocab, fixTypos } = await import('../src/shark/chatFlow.js');
    const { expenseCategories, incomeCategories } = await import('../constants/index.js');
    const flat = l => l.flatMap(x => (typeof x === 'string' ? [x] : x.options || []));
    const V = chatVocab([...flat(expenseCategories), ...flat(incomeCategories), 'Отпуск', '🍜 Булдак']);
    const fix = {
        'мой пла н': 'мой план', 'мойплан': 'мой план', 'сколко осталось': 'сколько осталось', 'скольоо осталось': 'сколько осталось',
        'средний чекк': 'средний чек', 'создай бюжет отпуск': 'создай бюджет отпуск', 'смени бюджетт': 'смени бюджет', 'когда зарплта': 'когда зарплата',
        'сколько до авнса': 'сколько до аванса', 'итог месца': 'итог месяца', 'мои долгии': 'мои долги', 'накоплени за полгода': 'накопления за полгода',
        'сменить характр': 'сменить характер', 'болтливост': 'болтливость', 'сколько потратил на таксии': 'сколько потратил на такси',
        'смени тему на светлю': 'смени тему на светлую', 'кофее 25к': 'кофе 25к', 'созадй план на 15 дней 10 млн': 'создай план на 15 дней 10 млн',
        'сколко я потратил вчеар': 'сколько я потратил вчера', 'покжи мой план': 'покажи мой план', 'моро женое 30к': 'мороженое 30к'
    };
    for (const [t, want] of Object.entries(fix)) assert.equal(fixTypos(t, V), want, t);
    // правильное и своё не трогаем: имена, бренды, свои категории, суммы
    for (const t of ['привет', 'спасибо', 'подарок маме 300к', 'вчера такси 45к', 'купил булдак 86к', 'зп 5 млн', 'Акулка', 'ок', 'норм', 'создай бюджет Отпуск'])
        assert.equal(fixTypos(t, V), t, t);
});
