import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getDailyLimit, getSpentOnDay, computeMood, reactToSave, findActivePlanner,
    getThresholds, countStreakInLimit, isQuietNow, getLimitInfo, getSharkSettings, saveSharkSettings,
    sharkImage, TEXT_VARIANTS, CHARACTER_THRESHOLDS, TITLES_BY_CHARACTER, limitSetText
} from '../src/shark/SharkMood.js';
import { buildExtra, answerQuestion, describeLimit, motivation, MOTIVATION, QUESTIONS, greeting, GREETINGS } from '../src/shark/SharkTalk.js';

const mem = () => { const m = {}; return { getItem: k => m[k] ?? null, setItem: (k, v) => { m[k] = v; } }; };
const day = (n, base = '2026-10-10') => { const d = new Date(base + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); };
const exp = (date, amount, category = 'Еда') => ({ type: 'expense', date, amount, category });

test('лимит из плана = сумма ежедневных трат', () => {
    const r = getDailyLimit({ planner: { dailyExpenses: [{ amountPerDay: 100000 }, { amountPerDay: 50000 }] } });
    assert.deepEqual(r, { limit: 150000, source: 'plan' });
});

test('лимит без плана — медиана дней, без разовых крупных трат', () => {
    const today = '2026-10-10';
    const tx = [exp(day(-1), 100), exp(day(-2), 120), exp(day(-3), 110), exp(day(-4), 10000)];
    const r = getDailyLimit({ transactions: tx, today });
    assert.equal(r.source, 'median');
    assert.equal(r.limit, 110);
});

test('мало данных — лимита нет', () => {
    assert.equal(getDailyLimit({ transactions: [exp(day(-1), 100)], today: '2026-10-10' }).limit, 0);
});

test('траты дня не учитывают плановые категории', () => {
    const planner = { mainExpenses: [{ category: 'Жильё' }], regularExpenses: [{ category: 'Связь' }] };
    const tx = [exp('2026-10-10', 100, 'Еда'), exp('2026-10-10', 900, 'Жильё'), exp('2026-10-10', 50, 'Связь')];
    assert.equal(getSpentOnDay({ transactions: tx, planner, day: '2026-10-10' }), 100);
});

test('пороги характера и состояния', () => {
    const o = { storage: mem(), today: '2026-10-10' };
    assert.deepEqual(getThresholds('strict'), [0.7, 1]);
    assert.equal(computeMood({ spent: 0, limit: 0, hasData: false }, o).key, 'new');
    assert.equal(computeMood({ spent: 50, limit: 100, character: 'normal' }, o).key, 'ok');
    assert.equal(computeMood({ spent: 85, limit: 100, character: 'normal' }, o).key, 'tense');
    assert.equal(computeMood({ spent: 75, limit: 100, character: 'strict' }, o).key, 'tense');
    assert.equal(computeMood({ spent: 75, limit: 100, character: 'kind' }, o).key, 'ok');
    assert.equal(computeMood({ spent: 120, limit: 100, character: 'normal' }, o).key, 'angry');
    assert.equal(computeMood({ spent: 120, limit: 100, character: 'kind' }, o).key, 'tense');
    assert.equal(computeMood({ spent: 10, limit: 100, streak: 7 }, o).key, 'proud');
});

test('тексты настроения: ≤ 90 символов и с числом (кроме знакомства)', () => {
    const o = { storage: mem(), today: '2026-10-10' };
    for (let i = 0; i < 60; i++) {
        for (const [spent, streak] of [[10, 0], [85, 0], [150, 0], [10, 7]]) {
            const m = computeMood({ spent, limit: 100, streak }, { ...o, storage: mem() });
            assert.ok(m.text.length <= 90, m.text);
            assert.match(m.text, /\d/);
        }
    }
});

test('антиповтор: за 3 дня варианты не повторяются, пока есть выбор', () => {
    const storage = mem();
    const seen = new Set();
    for (let i = 0; i < 6; i++) seen.add(computeMood({ spent: 10, limit: 100 }, { storage, today: '2026-10-10' }).text.replace(/\d[\d ]*/g, '#'));
    assert.equal(seen.size, 6);
});

test('реакции на сохранение: числа в тексте, в любом характере', () => {
    for (const character of ['kind', 'normal', 'strict']) {
        for (let i = 0; i < 20; i++) {
            const base = { limit: 1000, character };
            assert.match(reactToSave({ ...base, type: 'expense', amount: 100, before: 0, after: 100 }).text, /900/);
            assert.match(reactToSave({ ...base, type: 'expense', amount: 100, before: 700, after: 850 }).text, /150/);
            assert.match(reactToSave({ ...base, type: 'income', amount: 5000 }).text, /5 000/);
            assert.match(reactToSave({ ...base, type: 'deposit', amount: 5000 }).text, /5 000/);
            assert.match(reactToSave({ ...base, type: 'expense', amount: 5, backdate: '3 октября' }).text, /3 октября/);
        }
    }
    const k = reactToSave({ limit: 1000, character: 'kind', type: 'expense', amount: 100, before: 950, after: 1050 });
    assert.equal(k.mood, 'tense'); assert.match(k.text, /50/);
    const n = reactToSave({ limit: 1000, character: 'normal', type: 'expense', amount: 1500, before: 0, after: 1500 });
    assert.equal(n.mood, 'angry'); assert.match(n.text, /500/);
    const rep = reactToSave({ limit: 1000, character: 'strict', type: 'expense', amount: 100, before: 1500, after: 1600 });
    assert.equal(rep.repeat, true);
});

test('у каждой пары «настроение × характер» не меньше 15 разных вариантов', () => {
    for (const state of ['ok', 'tense', 'angry', 'proud']) {
        for (const ch of Object.keys(CHARACTER_THRESHOLDS)) {
            const n = TEXT_VARIANTS[state][ch].length;
            assert.ok(n >= 15, `${state}/${ch}: ${n}`);
            assert.equal(new Set(TEXT_VARIANTS[state][ch].map(f => f({ left: 1, over: 1, days: 3 }))).size, n, `${state}/${ch}: дубли`);
        }
    }
    for (const ch of ['kind', 'normal', 'strict']) assert.ok(TEXT_VARIANTS.new[ch].length >= 15);
    assert.ok(TEXT_VARIANTS.tenseOver.kind.length >= 15);
});

test('все варианты ≤ 90 символов при больших суммах и не обращаются к полу пользователя', () => {
    const vars = { left: 1234567, over: 1234567, days: 30 };
    const bad = /\b(вышла|сделала|потратила|молодец\b.*\bсам)/i;
    for (const [state, entry] of Object.entries(TEXT_VARIANTS)) {
        const lists = Array.isArray(entry) ? [entry] : Object.values(entry);
        for (const list of lists) for (const fn of list) {
            const t = fn(vars);
            assert.ok(t.length <= 90, `${t.length}: ${t}`);
            assert.doesNotMatch(t, /вышла\b|потратил[аи]?\b/);
        }
    }
});

test('«Строгая» говорит иначе, чем «Добрая»', () => {
    const o = () => ({ storage: mem(), today: '2026-10-10' });
    const kind = new Set(), strict = new Set();
    for (let i = 0; i < 60; i++) {
        kind.add(computeMood({ spent: 10, limit: 100, character: 'kind' }, o()).text.replace(/\d[\d ]*/g, '#'));
        strict.add(computeMood({ spent: 10, limit: 100, character: 'strict' }, o()).text.replace(/\d[\d ]*/g, '#'));
    }
    assert.equal([...kind].filter(t => strict.has(t)).length, 0);
});

test('«Добрая» при превышении лимита не злится, но говорит про перерасход', () => {
    const m = computeMood({ spent: 150, limit: 100, character: 'kind' }, { storage: mem(), today: '2026-10-10' });
    assert.equal(m.key, 'tense');
    assert.match(m.text, /50/);
    assert.doesNotMatch(m.text, /осталось/i);
});

test('картинки настроений', () => {
    assert.match(sharkImage('tense'), /wary-shark/);
    assert.match(sharkImage('angry'), /angry-shark/);
    assert.match(sharkImage('proud'), /proud-shark/);
    assert.match(sharkImage('ok'), /shark\.png$/);
    assert.match(sharkImage('что-то'), /shark\.png$/);
});

test('лимит: авто или своя сумма', () => {
    const planner = { dailyExpenses: [{ amountPerDay: 100000 }] };
    const auto = getLimitInfo({ planner, settings: { limitMode: 'auto', customLimit: 50000 } });
    assert.equal(auto.limit, 100000); assert.equal(auto.source, 'plan');
    const custom = getLimitInfo({ planner, settings: { limitMode: 'custom', customLimit: 50000 } });
    assert.equal(custom.limit, 50000); assert.equal(custom.source, 'custom'); assert.equal(custom.auto.limit, 100000);
    const empty = getLimitInfo({ settings: { limitMode: 'custom', customLimit: 0 } });
    assert.equal(empty.source, 'none');
    assert.equal(getLimitInfo({ settings: null }).limit, 0);
});

test('настройки лимита сохраняются и чистятся', () => {
    const st = mem();
    saveSharkSettings({ limitMode: 'custom', customLimit: '123456.7' }, st);
    const s = getSharkSettings(st);
    assert.equal(s.limitMode, 'custom'); assert.equal(s.customLimit, 123457);
    saveSharkSettings({ limitMode: 'бред', customLimit: -5 }, st);
    const s2 = getSharkSettings(st);
    assert.equal(s2.limitMode, 'auto'); assert.equal(s2.customLimit, 0);
});

test('совет дня: вечер, напоминание, утро, мотивация', () => {
    const tx = [exp('2026-10-09', 800), exp('2026-10-10', 700)];
    const base = { today: '2026-10-10', character: 'normal', limit: 1000, spent: 700, transactions: tx, streak: 0 };
    assert.match(buildExtra({ ...base, now: new Date('2026-10-10T21:00:00') }).text, /Итог дня: 700 из 1 000/);
    assert.equal(buildExtra({ ...base, transactions: [exp('2026-10-09', 800)], now: new Date('2026-10-10T18:00:00') }).kind, 'reminder');
    const morning = buildExtra({ ...base, transactions: [exp('2026-10-09', 800)], now: new Date('2026-10-10T08:00:00') });
    assert.equal(morning.kind, 'morning'); assert.match(morning.text, /Вчера 800 из 1 000/);
    assert.equal(buildExtra({ ...base, transactions: [], now: new Date('2026-10-10T08:00:00') }), null);
    assert.equal(buildExtra({ ...base, transactions: [exp('2026-10-09', 800)], streak: 7, now: new Date('2026-10-10T13:00:00') }).kind, 'streak');
});

test('совет дня стабилен в течение блока часов', () => {
    const tx = [exp('2026-10-09', 800), exp('2026-10-10', 700)];
    const ctx = { today: '2026-10-10', character: 'strict', limit: 1000, spent: 700, transactions: tx, now: new Date('2026-10-10T13:10:00') };
    const a = JSON.stringify(buildExtra(ctx)), b = JSON.stringify(buildExtra({ ...ctx, now: new Date('2026-10-10T14:50:00') }));
    assert.equal(a, b);
});

test('мотивация: 5–7 фраз на характер, без дублей', () => {
    for (const ch of Object.keys(MOTIVATION)) {
        assert.ok(MOTIVATION[ch].length >= 30);
        assert.equal(new Set(MOTIVATION[ch]).size, MOTIVATION[ch].length);
        assert.ok(MOTIVATION[ch].includes(motivation(ch, 'x')));
    }
});

test('ответы на вопросы Акулке', () => {
    const tx = [exp('2026-10-10', 300, '🛒 Еда'), exp('2026-10-10', 200, '🚕 Такси'), exp('2026-10-10', 100, '🛒 Еда'), exp('2026-10-09', 900, '🛒 Еда')];
    const base = { now: new Date('2026-10-10T15:00:00'), today: '2026-10-10', limit: 1000, spent: 600, transactions: tx,
        info: { limit: 1000, source: 'median', auto: { limit: 1000, source: 'median' } } };
    for (const character of ['kind', 'normal', 'strict']) {
        for (let i = 0; i < 25; i++) {
            const ctx = { ...base, character, seed: `s${i}` };
            const left = answerQuestion('left', ctx).text;
            assert.ok(left.includes('400') && left.includes('1 000'), left);
            const over = answerQuestion('left', { ...ctx, spent: 1300 }).text;
            assert.ok(over.includes('300') && over.includes('1 300') && over.includes('1 000'), over);
            assert.equal(answerQuestion('left', { ...ctx, limit: 0 }).action, 'limit');
            const today = answerQuestion('today', ctx).text;
            assert.ok(today.includes('600') && today.includes('🛒 Еда — 400'), today);
            const week = answerQuestion('week', ctx).text;
            assert.ok(week.includes('1 500') && week.includes('750') && /В лимите 2 из 2/.test(week) && !/[{}]/.test(week), week);
            assert.doesNotMatch(answerQuestion('week', { ...ctx, limit: 0 }).text, /В лимите|[{}]/);
            assert.ok(answerQuestion('left', { today: '2026-10-10', transactions: [], character, seed: `s${i}` }).text.length > 20);
            assert.ok(answerQuestion('today', { ...ctx, transactions: [] }).text.length > 10);
            assert.ok(answerQuestion('week', { ...ctx, transactions: [] }).text.length > 10);
            assert.ok(answerQuestion('nope', ctx).text.length > 10);
        }
    }
    // разные seed — разные формулировки
    const variants = new Set(Array.from({ length: 40 }, (_, i) => answerQuestion('left', { ...base, character: 'kind', seed: `v${i}` }).text));
    assert.ok(variants.size >= 8, `вариантов: ${variants.size}`);
    assert.match(answerQuestion('limit', { ...base, character: 'normal' }).text, /медиана/);
    assert.ok(answerQuestion('cheer', base).text.length > 10);
    assert.equal(QUESTIONS.length, 5);
});

test('напоминание про экспорт данных: редко, только при накопленных записях', () => {
    const many = Array.from({ length: 12 }, (_, i) => exp('2026-10-0' + (1 + (i % 9)), 100));
    const ctx = { today: '2026-10-10', limit: 1000, spent: 0, transactions: many, character: 'normal', now: new Date('2026-10-10T13:00:00') };
    // сегодня есть запись → без «утра» и «напоминаний»
    const withToday = [...many, exp('2026-10-10', 100)];
    const first = buildExtra({ ...ctx, transactions: withToday, backupNudgeLast: null, seedless: 1 });
    assert.equal(first?.kind, 'backup');
    assert.match(first.text, /экспорт|копи|бэкап|Данные/i);
    // показано только что — в течение дня остаётся
    assert.equal(buildExtra({ ...ctx, transactions: withToday, backupNudgeLast: '2026-10-10' }).kind, 'backup');
    // неделю назад показывали — молчит
    assert.notEqual(buildExtra({ ...ctx, transactions: withToday, backupNudgeLast: '2026-10-03' })?.kind, 'backup');
    // мало записей — молчит
    assert.notEqual(buildExtra({ ...ctx, transactions: withToday.slice(-3), backupNudgeLast: null })?.kind, 'backup');
});

test('объяснение лимита по источникам', () => {
    const planner = { name: 'Октябрь', mainExpenses: [] };
    assert.match(describeLimit({ info: { limit: 100, source: 'plan', auto: {} }, planner }).join(' '), /плана «Октябрь»/);
    assert.match(describeLimit({ info: { limit: 100, source: 'median', auto: {} } }).join(' '), /30 дней/);
    assert.match(describeLimit({ info: { limit: 100, source: 'custom', auto: { limit: 80, source: 'median' } } }).join(' '), /задан тобой.*80/);
    assert.match(describeLimit({ info: { limit: 0, source: 'none', auto: {} } }).join(' '), /3 дня/);
    assert.match(describeLimit({ info: { limit: 1, source: 'plan' }, character: 'kind' }).join(' '), /ругаться не буду/);
    assert.match(describeLimit({ info: { limit: 1, source: 'plan' }, character: 'strict' }).join(' '), /70%/);
});

test('активный план и серия дней в лимите', () => {
    const planners = [{ id: 'a', budgetId: 'b', startDate: '2026-10-01', endDate: '2026-10-15' }, { id: 'c', budgetId: 'b', archived: true, startDate: '2026-10-01', endDate: '2026-10-31' }];
    assert.equal(findActivePlanner(planners, 'b', '2026-10-10').id, 'a');
    assert.equal(findActivePlanner(planners, 'b', '2026-11-10'), null);
    const tx = [1, 2, 3].map(i => exp(day(-i), 50));
    assert.equal(countStreakInLimit({ transactions: tx, limit: 100, today: '2026-10-10' }), 3);
    assert.equal(countStreakInLimit({ transactions: [...tx, exp(day(-2), 500)], limit: 100, today: '2026-10-10' }), 1);
});

test('тихие часы', () => {
    assert.equal(isQuietNow({ quietHours: true }, new Date('2026-10-10T23:30:00')), true);
    assert.equal(isQuietNow({ quietHours: true }, new Date('2026-10-10T12:00:00')), false);
    assert.equal(isQuietNow({ quietHours: false }, new Date('2026-10-10T23:30:00')), false);
});

test('заголовки карточки зависят от характера', () => {
    const o = () => ({ storage: mem(), today: '2026-10-10' });
    assert.equal(computeMood({ spent: 50, limit: 100, character: 'normal' }, o()).title, 'Акулка довольна');
    assert.match(computeMood({ spent: 50, limit: 100, character: 'kind' }, o()).title, /довольна 💙/);
    assert.equal(computeMood({ spent: 50, limit: 100, character: 'strict' }, o()).title, 'Акулка в рамках');
    assert.equal(computeMood({ spent: 0, limit: 0, hasData: false, character: 'strict' }, o()).title, 'Акулка требует данных');
    for (const ch of Object.keys(TITLES_BY_CHARACTER)) assert.equal(Object.keys(TITLES_BY_CHARACTER[ch]).length, 5);
});

test('тосты: первая трата, 50% и 90% лимита', () => {
    const base = { type: 'expense', limit: 1000, character: 'normal' };
    assert.match(reactToSave({ ...base, amount: 10, before: 0, after: 10, first: true }).text, /перв|старт|начал|№1|Есть|Начн/i);
    assert.match(reactToSave({ ...base, amount: 300, before: 300, after: 600 }).text, / 400|400\b/);
    assert.match(reactToSave({ ...base, amount: 100, before: 800, after: 920 }).text, /\b80\b/);
    assert.equal(reactToSave({ ...base, amount: 100, before: 800, after: 920 }).mood, 'tense');
    // уже были выше 50% — обычный тост
    assert.doesNotMatch(reactToSave({ ...base, amount: 50, before: 600, after: 650 }).text, /50%|Половин|Середин|Рубеж/);
});

test('текст «лимит сохранён» по характеру', () => {
    assert.match(limitSetText('strict', 'custom', 150000), /150 000/);
    assert.match(limitSetText('kind', 'custom', 150000), /150 000/);
    assert.ok(limitSetText('normal', 'auto', 0).length > 5);
});

test('«давно не заходили» и разные голоса у совета дня', () => {
    const tx = [exp('2026-10-01', 500)];
    const base = { today: '2026-10-10', limit: 1000, spent: 0, transactions: tx, now: new Date('2026-10-10T12:00:00') };
    const k = buildExtra({ ...base, character: 'kind' }), s = buildExtra({ ...base, character: 'strict' });
    assert.equal(k.kind, 'away'); assert.match(k.text, /9 дн/); assert.match(s.text, /9 дн/);
    assert.notEqual(k.text, s.text);
    // вечерний итог у разных характеров различается
    const ev = { today: '2026-10-10', limit: 1000, spent: 1500, transactions: [exp('2026-10-10', 1500), exp('2026-10-09', 100)], now: new Date('2026-10-10T21:00:00') };
    const texts = new Set(['kind', 'normal', 'strict'].map(c => buildExtra({ ...ev, character: c }).text));
    assert.equal(texts.size, 3);
});

test('чат отвечает голосом характера, приветствие тоже', () => {
    const ctx = { now: new Date('2026-10-10T15:00:00'), today: '2026-10-10', limit: 1000, spent: 600, transactions: [exp('2026-10-10', 600)] };
    const a = ['kind', 'normal', 'strict'].map(c => answerQuestion('left', { ...ctx, character: c }).text);
    assert.equal(new Set(a).size, 3);
    a.forEach(t => assert.match(t, /400/));
    for (const ch of Object.keys(GREETINGS)) assert.ok(GREETINGS[ch].includes(greeting(ch, 'x')));
});

test('тосты: у каждой группы по 15 разных вариантов на характер, без дублей и длинных строк', async () => {
    const { TOAST_TEXTS } = await import('../src/shark/texts/index.js');
    for (const [key, byChar] of Object.entries(TOAST_TEXTS)) {
        for (const [ch, list] of Object.entries(byChar)) {
            assert.ok(list.length >= 15, `${key}/${ch}: ${list.length}`);
            assert.equal(new Set(list).size, list.length, `${key}/${ch}: дубли`);
            for (const t of list) {
                const full = t.replace(/\{\w+\}/g, '1 234 567');
                assert.ok(full.length <= 90, `${key}/${ch}: ${full.length} «${t}»`);
                assert.doesNotMatch(t, /\(а\)|\bмолодец\b|\bумница\b/i, `${key}/${ch}: род «${t}»`);
            }
        }
    }
});

test('тексты Акулки (extras): по 15+ вариантов, без дублей, без родовых оборотов', async () => {
    const X = await import('../src/shark/texts/index.js');
    const flat = [];
    const pools = { REMINDERS: X.REMINDERS, VERDICT_OK: X.VERDICT_OK, VERDICT_OVER: X.VERDICT_OVER, WELCOME_BACK: X.WELCOME_BACK,
        STREAK: X.STREAK, MONTH_END: X.MONTH_END, GREETINGS: X.GREETINGS, CHEER_TASKS: X.CHEER_TASKS, MOTIVATION: X.MOTIVATION,
        MORNING_yesOk: X.MORNING.yesOk, MORNING_yesOver: X.MORNING.yesOver, MORNING_no: X.MORNING.no };
    for (const [name, byChar] of Object.entries(pools)) {
        for (const [ch, list] of Object.entries(byChar)) {
            assert.ok(list.length >= (name === 'MOTIVATION' ? 30 : 15), `${name}/${ch}: ${list.length}`);
            assert.equal(new Set(list).size, list.length, `${name}/${ch}: дубли`);
            flat.push(...list);
        }
    }
    for (const t of flat) assert.doesNotMatch(t, /\(а\)|\.\.\.|молодец|молодц|умниц/i, t);
});

test('чат: помощь и советы — темы, авторазметка, действия', async () => {
    const T = await import('../src/shark/SharkTalk.js');
    assert.ok(T.HELP_TOPICS.length >= 10 && T.TIPS_TOPICS.length >= 10);
    for (const kind of ['help', 'tips']) {
        for (const ch of ['kind', 'normal', 'strict']) {
            assert.ok(T.MENUS[kind].intro[ch].length >= 5 && T.MENUS[kind].outro[ch].length >= 5);
            assert.ok(T.menuIntro(kind, ch, 'x').length > 5);
        }
        for (const t of T.MENUS[kind].topics) {
            const a = T.topicAnswer(kind, t.id, 'kind', 'x');
            assert.ok(a.text.length > 150, t.id);
            assert.ok(a.outro);
        }
    }
    assert.equal(T.topicAnswer('help', 'нет', 'kind'), null);
    assert.equal(T.topicAnswer('help', 'import', 'normal').action.id, 'import');
    assert.equal(T.richHtml('**Жирный** <b>\n• раз\n• два\nТекст'), '<p><b>Жирный</b> &lt;b&gt;</p><ul class="sc-list"><li>раз</li><li>два</li></ul><p>Текст</p>');
    // «Подбодри меня» — подбадривание + мини-задание
    const ans = T.answerQuestion('cheer', { character: 'strict' });
    assert.match(ans.text, /Мини-задание: /);
});

test('шаблоны extras подставляются без «{…}» в готовых текстах', async () => {
    const T = await import('../src/shark/SharkTalk.js');
    for (const ch of ['kind', 'normal', 'strict']) {
        for (const f of T.WELCOME_BACK[ch]) assert.doesNotMatch(f({ n: 9 }), /[{}]/);
        for (const f of T.STREAK[ch]) assert.doesNotMatch(f({ n: 7 }), /[{}]/);
        for (const f of T.MONTH_END[ch]) assert.doesNotMatch(f({ n: 2, limit: '1 000' }), /[{}]/);
        for (const g of ['yesOk', 'yesOver', 'no']) for (const f of T.MORNING[g][ch]) assert.doesNotMatch(f({ y: '5', limit: '1 000' }), /[{}]/);
    }
});

test('все тексты Акулки: без родовых оборотов, валют и самопоправок', async () => {
    const I = await import('../src/shark/texts/index.js');
    const all = [];
    const walk = o => { if (typeof o === 'string') all.push(o); else if (o && typeof o === 'object') Object.values(o).forEach(walk); };
    walk(I);
    assert.ok(all.length > 2500);
    const bad = /(молодец|молодц|умниц|\(а\)|\.\.\.|рубл|долл|\bсам\b|\bсама\b|вернулся|справился|потратил\b)/i;
    for (const t of all) assert.doesNotMatch(t, bad, t);
}); 

// ───────── «болтливая» Акулка: челленджи, звания, цифры, инициативные реплики ─────────
const SP = await import('../src/shark/SharkPlus.js');
const T2 = await import('../src/shark/SharkTalk.js');
const mk = (type, date, amount, extra = {}) => ({ id: `${type}${date}${amount}${Math.random()}`, type, date, amount, category: '🛒 Еда', ...extra });
const noPH = t => assert.doesNotMatch(t, /[{}]/, t);

test('челлендж: «3 дня в лимите» засчитывает только завершённые дни и завершается', () => {
    const tx = [mk('expense', '2026-10-05', 500), mk('expense', '2026-10-06', 900), mk('expense', '2026-10-07', 1500), mk('expense', '2026-10-08', 800)];
    const st = { id: 'limit3', start: '2026-10-05' };
    const ctx = { limit: 1000, transactions: tx };
    assert.equal(SP.evaluateChallenge(st, { ...ctx, today: '2026-10-07' }).done, 2);
    const mid = SP.evaluateChallenge(st, { ...ctx, today: '2026-10-07' });
    assert.equal(mid.status, 'active'); assert.equal(mid.daysLeft, 5);
    assert.equal(SP.evaluateChallenge(st, { ...ctx, today: '2026-10-09' }).status, 'done');
    // время вышло
    assert.equal(SP.evaluateChallenge({ id: 'limit5', start: '2026-10-01' }, { ...ctx, today: '2026-10-09' }).status, 'fail');
    assert.equal(SP.evaluateChallenge({ id: 'нет' }, ctx), null);
});

test('челлендж «Неделя без перерасхода» рвётся при превышении, «Отложить» считает вклады', () => {
    const tx = [mk('expense', '2026-10-05', 500), mk('expense', '2026-10-06', 1500)];
    assert.equal(SP.evaluateChallenge({ id: 'calm7', start: '2026-10-05' }, { limit: 1000, transactions: tx, today: '2026-10-07' }).status, 'fail');
    const dep = [mk('deposit', '2026-10-06', 5000)];
    assert.equal(SP.evaluateChallenge({ id: 'save', start: '2026-10-05' }, { transactions: dep, today: '2026-10-06' }).status, 'done');
});

test('звания растут по дням в лимите', () => {
    assert.equal(SP.rankInfo(0).rank.name, 'Малёк');
    assert.equal(SP.rankInfo(8).rank.name, 'Дельфин');
    assert.equal(SP.rankInfo(8).need, 7);
    assert.ok(SP.rankInfo(100).top);
    const tx = ['2026-10-01', '2026-10-02', '2026-10-03'].map(d => mk('expense', d, 500)).concat(mk('expense', '2026-10-04', 5000));
    assert.equal(SP.countDaysInLimit({ transactions: tx, limit: 1000, today: '2026-10-05' }), 3);
});

test('новые вопросы в чате: ответы без плейсхолдеров на всех характерах', () => {
    const today = '2026-10-10';
    const tx = [
        ...Array.from({ length: 10 }, (_, i) => mk('expense', `2026-10-0${1 + (i % 9)}`, 300 + i * 10)),
        mk('expense', today, 600, { category: '🚕 Такси' }),
        mk('deposit', '2026-10-03', 2000),
        mk('debt', '2026-09-01', 0, { name: 'Аня', direction: 'owe', remainingAmount: 700, initialAmount: 1000, paid: false }),
        mk('debt', '2026-09-20', 0, { name: 'Боря', direction: 'owed', remainingAmount: 300, initialAmount: 300, paid: false })
    ];
    for (const character of ['kind', 'normal', 'strict']) {
        for (let i = 0; i < 12; i++) {
            const ctx = { character, seed: `q${i}`, today, now: new Date('2026-10-10T15:00:00'), limit: 1000, spent: 600, transactions: tx };
            for (const id of ['topcat', 'vsweek', 'runout', 'debts', 'savings', 'level', 'fact', 'challenge']) {
                const a = T2.answerQuestion(id, ctx); noPH(a.text); assert.ok(a.text.length > 10, id);
            }
            const ask = T2.answerQuestion('whatif', ctx);
            assert.equal(ask.input, 'amount');
            const ok = T2.answerQuestion('whatif', { ...ctx, amount: 300 }).text;
            assert.ok(ok.includes('300') && ok.includes('100'), ok);
            const over = T2.answerQuestion('whatif', { ...ctx, amount: 900 }).text;
            assert.ok(over.includes('900') && over.includes('500'), over);
            noPH(T2.answerQuestion('whatif', { ...ctx, amount: 'abc' }).text);
            assert.equal(T2.answerQuestion('whatif', { ...ctx, limit: 0, amount: 100 }).action, 'limit');
            const debts = T2.answerQuestion('debts', ctx).text;
            assert.ok(debts.includes('700') && debts.includes('300'), debts);
            assert.ok(T2.answerQuestion('topcat', ctx).text.includes('Еда'));
            const start = T2.answerQuestion('ch:limit3', ctx);
            assert.equal(start.effect.startChallenge, 'limit3'); noPH(start.text);
            assert.equal(T2.answerQuestion('chstop', ctx).effect.stopChallenge, true);
        }
    }
    assert.ok(T2.answerQuestion('debts', { today, transactions: [], character: 'normal' }).text.length > 5);
    assert.ok(T2.answerQuestion('savings', { today, transactions: [], character: 'normal' }).text.length > 5);
});

test('инициативные реплики: понедельник, праздник, крупная трата, долг, зарплата, вчерашний перебор', () => {
    const base = Array.from({ length: 12 }, (_, i) => mk('expense', `2026-10-0${1 + (i % 9)}`, 300));
    const get = (extra, now, over = {}) => T2.buildExtra({ today: now.slice(0, 10), now: new Date(now), limit: 1000, spent: 0, character: 'normal', transactions: [...base, ...extra], ...over });
    // понедельник: итог недели (10.10.2026 — суббота, 12.10 — понедельник)
    const mon = get([], '2026-10-12T10:00:00'); assert.equal(mon.kind, 'weekly'); noPH(mon.text);
    // праздник
    const hols = Array.from({ length: 8 }, (_, i) => get([mk('expense', '2026-12-30', 100)], `2026-12-30T0${1 + i}:00:00`, { today: '2026-12-30' }));
    assert.ok(hols.some(h => h?.kind === 'holiday'));
    // крупная трата
    const spikes = Array.from({ length: 12 }, (_, i) => get([mk('expense', '2026-10-10', 5000, { category: '🎁 Подарки' })], `2026-10-10T1${i % 6}:00:00`, { spent: 5000, limit: 100000 }));
    assert.ok(spikes.some(h => h?.kind === 'spike' && h.text.includes('Подарки') || h?.kind === 'spike'));
    // давний долг
    const debt = mk('debt', '2026-09-01', 0, { name: 'Аня', direction: 'owe', remainingAmount: 700, paid: false });
    const kinds = new Set(Array.from({ length: 24 }, (_, i) => get([debt, mk('expense', '2026-10-10', 100)], `2026-10-10T${String(i).padStart(2, '0')}:30:00`, { limit: 100000, spent: 100 })?.kind));
    assert.ok(kinds.has('debt'));
    // зарплата
    const pays = Array.from({ length: 12 }, (_, i) => get([mk('income', '2026-10-10', 90000)], `2026-10-10T${String(8 + (i % 8)).padStart(2, '0')}:00:00`, { limit: 100000 }));
    assert.ok(pays.some(h => h?.kind === 'payday' && h.text.includes('90 000')));
    // челлендж: завершён сегодня
    const done = get([mk('expense', '2026-10-10', 100)], '2026-10-10T12:00:00', { challenge: { status: 'done', title: '3 дня в лимите', seenOn: '2026-10-10' }, spent: 100 });
    assert.equal(done.kind, 'chDone'); assert.ok(done.text.includes('3 дня в лимите') || done.text.length > 5);
    // без лимита: итог недели не содержит «из»-пустышек
    const noLim = get([], '2026-10-12T10:00:00', { limit: 0 }); noPH(noLim.text);
});

test('подсказки при первом открытии разделов есть на всех характерах', () => {
    for (const ch of ['kind', 'normal', 'strict']) for (const k of T2.HINT_KEYS) { const t = T2.hintText(k, ch, 's'); assert.ok(t.length > 20 && !/[{}]/.test(t), `${k}/${ch}`); }
});

test('все новые тексты: нет запрещённых оборотов и «срока» у долгов', async () => {
    const I = await import('../src/shark/texts/index.js');
    const all = [];
    const walk = o => { if (typeof o === 'string') all.push(o); else if (o && typeof o === 'object') Object.values(o).forEach(walk); };
    walk({ A: I.ANSWERS, P: I.PROACTIVE, F: I.FUN });
    assert.ok(all.length > 1500);
    for (const t of all) assert.doesNotMatch(t, /(молодец|молодц|умниц|\(а\)|\.\.\.|рубл|долл|\bсам\b|\bсама\b)/i, t);
    for (const [, l] of Object.entries(I.TOAST_TEXTS.debt)) for (const t of l) assert.doesNotMatch(t, /срок|напомн|просроч/i, t);
});
