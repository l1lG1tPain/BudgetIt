import test from 'node:test';
import assert from 'node:assert/strict';
import { planReminder, registerShown, registerOpen, gapDaysBefore, shiftDay } from '../src/reminders/reminderPlan.js';
import {
    normalizeReminderSettings, normalizeReminderState, getReminderSettings, saveReminderSettings,
    getReminderState, saveReminderState, REMINDER_DEFAULTS, IGNORED_LIMIT
} from '../src/reminders/reminderSettings.js';
import { renderReminderText, plural, REMINDER_TEXTS } from '../src/reminders/reminderTexts.js';

const mem = () => { const m = {}; return { getItem: k => m[k] ?? null, setItem: (k, v) => { m[k] = v; } }; };
const at = (iso, h = 21, m = 0) => new Date(`${iso}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
const exp = (date, amount = 100, category = 'Еда') => ({ type: 'expense', date, amount, category });
const inc = (date, amount = 1000) => ({ type: 'income', date, amount, category: 'Зарплата' });
const on = (patch = {}) => normalizeReminderSettings({ enabled: true, ...patch });
const st = (patch = {}) => normalizeReminderState(patch);
const plan = (over = {}) => planReminder({
    now: at('2026-11-18'), settings: on(), state: st(),
    data: { transactions: [exp('2026-11-17')], currency: 'сум', ...over.data }, ...over.args
});

// ───── настройки ─────
test('настройки: по умолчанию выключены, все типы включены', () => {
    const s = normalizeReminderSettings({});
    assert.equal(s.enabled, false);
    assert.deepEqual(s.types, REMINDER_DEFAULTS.types);
});
test('настройки: время итога ограничено 18:00–22:30, мусор заменяется значением по умолчанию', () => {
    assert.equal(normalizeReminderSettings({ eveningTime: '12:00' }).eveningTime, '18:00');
    assert.equal(normalizeReminderSettings({ eveningTime: '23:30' }).eveningTime, '22:30');
    assert.equal(normalizeReminderSettings({ eveningTime: 'abc' }).eveningTime, '21:00');
    assert.equal(normalizeReminderSettings({ eveningTime: '20:15' }).eveningTime, '20:15');
});
test('настройки: сохраняются отдельным ключом и сливаются с патчем', () => {
    const s = mem();
    saveReminderSettings({ enabled: true, types: { gap: false } }, s);
    const got = getReminderSettings(s);
    assert.equal(got.enabled, true);
    assert.equal(got.types.gap, false);
    assert.equal(got.types.evening, true);
});
test('состояние: хранит только последние 7 дней', () => {
    const s = mem();
    const shown = {};
    for (let i = 1; i <= 10; i++) shown[`2026-11-${String(i).padStart(2, '0')}`] = ['evening'];
    saveReminderState({ shown }, s);
    assert.equal(Object.keys(getReminderState(s).shown).length, 7);
});
test('состояние: битый JSON не ломает чтение', () => {
    const s = { getItem: () => '{oops', setItem() {} };
    assert.equal(getReminderState(s).ignored, 0);
    assert.equal(getReminderSettings(s).enabled, false);
});

// ───── ворота ─────
test('выключено → ничего', () => {
    assert.equal(plan({ args: { settings: on({ enabled: false }) } }), null);
});
test('тихие часы: ночью молчит', () => {
    assert.equal(plan({ args: { now: at('2026-11-18', 23, 30) } }), null);
    assert.equal(plan({ args: { now: at('2026-11-18', 7, 0) } }), null);
});
test('пользователь только что был в приложении → молчим', () => {
    const now = at('2026-11-18');
    assert.equal(plan({ args: { now, state: st({ lastActiveAt: now.getTime() - 30 * 60 * 1000 }) } }), null);
    assert.ok(plan({ args: { now, state: st({ lastActiveAt: now.getTime() - 3 * 60 * 60 * 1000 }) } }));
});
test('пауза → молчим', () => {
    assert.equal(plan({ args: { state: st({ paused: true }) } }), null);
});
test('вечерний слот уже использован → второго уведомления нет', () => {
    assert.equal(plan({ args: { state: st({ shown: { '2026-11-18': ['evening'] } }) } }), null);
});
test('до времени итога дня вечерний итог не показывается', () => {
    assert.notEqual(plan({ args: { now: at('2026-11-18', 14, 0) } })?.type, 'evening');
    const r = plan({ args: { now: at('2026-11-18', 20, 30), settings: on({ eveningTime: '21:30' }) } });
    assert.notEqual(r?.type, 'evening');
});
test('новичок без единой записи → ничего', () => {
    assert.equal(plan({ data: { transactions: [] } }), null);
});

// ───── вечерний итог ─────
test('итог дня: записи были, лимит не превышен', () => {
    const r = plan({ data: { transactions: [exp('2026-11-18', 40000), exp('2026-11-18', 10000, 'Кафе')], limit: 100000, currency: 'сум' } });
    assert.equal(r.type, 'evening');
    assert.equal(r.slot, 'evening');
    assert.match(r.body, /50 000/);
    assert.match(r.body, /2 операции/);
    assert.match(r.body, /Крупнее всего: «Еда», 40 000 сум/);
});
test('итог дня: лимит превышен', () => {
    const r = plan({ data: { transactions: [exp('2026-11-18', 150000)], limit: 100000, currency: 'сум' } });
    assert.match(r.body, /50 000/);
    assert.match(r.body, /лимит/i);
});
test('итог дня: spentToday из приложения важнее собственной суммы', () => {
    const r = plan({ data: { transactions: [exp('2026-11-18', 999)], limit: 1000, spentToday: 200, currency: 'сум' } });
    assert.match(r.body, /200/);
    assert.match(r.body, /800/);
});
test('итог дня: нет лимита → простая сводка', () => {
    const r = plan({ data: { transactions: [exp('2026-11-18', 5000)], currency: 'сум' } });
    assert.match(r.body, /5 000/);
});
test('итог дня: только доход → без «потрачено», есть строка про поступление', () => {
    const r = plan({ data: { transactions: [exp('2026-11-10'), inc('2026-11-18', 3000000)], currency: 'сум' } });
    assert.match(r.body, /Поступило 3 000 000 сум/);
    assert.doesNotMatch(r.body, /потрачено/i);
});
test('итог дня: первая запись после перерыва отмечается', () => {
    const r = plan({ data: { transactions: [exp('2026-11-10'), exp('2026-11-18', 100)], currency: 'сум' } });
    assert.match(r.body, /Первая запись за 7 дней/);
});
test('итог дня: завтра плановый платёж попадает в текст', () => {
    const planner = { mainExpenses: [{ category: 'Аренда', amount: 3000000, date: '2026-11-19' }] };
    const r = plan({ data: { transactions: [exp('2026-11-18', 100)], planner, currency: 'сум' } });
    assert.match(r.body, /Завтра по плану: «Аренда», 3 000 000 сум/);
});

// ───── «записей не было» ─────
test('нет записей сегодня → вопрос «как прошёл день» с кнопками', () => {
    const r = plan();
    assert.equal(r.type, 'evening');
    assert.equal(r.title, 'Как прошёл день?');
    assert.deepEqual(r.actions.map(a => a.action), ['add', 'nospend']);
    assert.equal(r.url, '/?reminder=add');
});
test('день уже отмечен «без трат» → молчим', () => {
    assert.equal(plan({ data: { transactions: [exp('2026-11-17')], noSpend: ['2026-11-18'] } }), null);
});
test('характер kind даёт другой заголовок', () => {
    const r = plan({ data: { transactions: [exp('2026-11-17')], character: 'kind' } });
    assert.match(r.title, /🦈/);
});

// ───── план месяца ─────
test('план: платёж сегодня приоритетнее недельного итога', () => {
    const planner = { mainExpenses: [{ category: 'Кредит', amount: 500000, date: '2026-11-16' }] };
    const r = planReminder({
        now: at('2026-11-16', 10, 0), settings: on(), state: st(),
        data: { transactions: [exp('2026-11-12', 100)], planner, currency: 'сум' }   // понедельник
    });
    assert.equal(r.type, 'planner');
    assert.match(r.body, /сегодня/);
    assert.match(r.body, /«Кредит», 500 000 сум/);
    assert.equal(r.url, '/?reminder=planner');
});
test('план: просроченный доход', () => {
    const r = planReminder({
        now: at('2026-11-18', 10, 0), settings: on(), state: st(),
        data: { transactions: [exp('2026-11-17')], plannerIncomeOverdue: { item: 'Зарплата', amount: 8000000 }, currency: 'сум' }
    });
    assert.equal(r.type, 'planner');
    assert.match(r.body, /Зарплата/);
});
test('план: выключенный тип не приходит', () => {
    const planner = { mainExpenses: [{ category: 'Кредит', amount: 5, date: '2026-11-18' }] };
    const r = planReminder({
        now: at('2026-11-18', 10, 0), settings: on({ types: { planner: false } }), state: st(),
        data: { transactions: [exp('2026-11-17')], planner }
    });
    assert.equal(r, null);
});
test('план: архивный план игнорируется', () => {
    const planner = { archived: true, mainExpenses: [{ category: 'Кредит', amount: 5, date: '2026-11-18' }] };
    const r = planReminder({
        now: at('2026-11-18', 10, 0), settings: on(), state: st(),
        data: { transactions: [exp('2026-11-17')], planner }
    });
    assert.equal(r, null);
});

// ───── недельный и месячный итоги ─────
test('недельный итог в понедельник утром, один раз за неделю', () => {
    const tx = [exp('2026-11-10', 70000, 'Еда'), exp('2026-11-12', 30000, 'Такси'), exp('2026-11-13', 7000, 'Еда')];
    const args = { now: at('2026-11-16', 10, 0), settings: on(), data: { transactions: tx, currency: 'сум' } };
    const r = planReminder({ ...args, state: st() });
    assert.equal(r.type, 'weekly');
    assert.match(r.body, /107 000/);
    assert.match(r.body, /Еда/);
    const next = registerShown(st(), r, args.now);
    assert.equal(planReminder({ ...args, state: next }), null);
});
test('недельный итог: вторник подходит, среда уже нет', () => {
    const tx = [exp('2026-11-10', 100)];
    const mk = day => planReminder({ now: at(day, 10), settings: on(), state: st(), data: { transactions: tx } });
    assert.equal(mk('2026-11-17')?.type, 'weekly');
    assert.notEqual(mk('2026-11-18')?.type, 'weekly');
});
test('недельный итог: прошлая неделя без расходов → пропуск', () => {
    const r = planReminder({ now: at('2026-11-16', 10), settings: on(), state: st(), data: { transactions: [exp('2026-11-01')] } });
    assert.notEqual(r?.type, 'weekly');
});
test('месячный итог: первого числа, считает прошлый месяц', () => {
    const tx = [exp('2026-10-05', 600000, 'Аренда'), exp('2026-10-20', 100000, 'Еда'), inc('2026-10-10', 9000000), exp('2026-11-01', 5)];
    const r = planReminder({ now: at('2026-11-01', 10), settings: on(), state: st(), data: { transactions: tx, currency: 'сум' } });
    assert.equal(r.type, 'monthly');
    assert.match(r.body, /700 000/);
    assert.match(r.body, /9 000 000/);
    assert.match(r.body, /Аренда/);
    assert.deepEqual(r.mark, { monthly: '2026-10' });
});

// ───── вклады ─────
test('вклад: за 3 дня и в день окончания', () => {
    const run = day => planReminder({
        now: at(day, 10), settings: on(), state: st(),
        data: { transactions: [exp('2026-11-17')], deposits: [{ title: 'Накопительный', endDate: '2026-11-21' }] }
    });
    assert.match(run('2026-11-18').body, /через 3 дня/);
    assert.match(run('2026-11-21').body, /сегодня/);
    assert.equal(run('2026-11-19'), null);
});

// ───── пропуск записей ─────
test('пропуск: gapDaysBefore считает дни без записей и без отметки', () => {
    const tx = [exp('2026-11-10')];
    assert.equal(gapDaysBefore('2026-11-14', tx, []), 3);
    assert.equal(gapDaysBefore('2026-11-14', tx, ['2026-11-12']), 1);
    assert.equal(gapDaysBefore('2026-11-11', tx, []), 0);
});
test('пропуск: у новичка без прошлых записей пропуска нет', () => {
    assert.equal(gapDaysBefore('2026-11-14', [], []), 0);
    assert.equal(gapDaysBefore('2026-11-14', [exp('2026-11-14')], []), 0);
});
test('пропуск: утром после 2+ пустых дней, затем не чаще раза в 3 дня и не больше 3 раз', () => {
    const tx = [exp('2026-11-10')];
    const run = (day, state) => planReminder({ now: at(day, 10), settings: on(), state, data: { transactions: tx, currency: 'сум' } });
    const first = run('2026-11-13', st());
    assert.equal(first.type, 'gap');
    assert.match(first.body, /2 дня/);
    const state = registerShown(st(), first, at('2026-11-13', 10));
    assert.equal(run('2026-11-14', state), null);
    assert.equal(run('2026-11-15', state), null);
    assert.equal(run('2026-11-19', state).type, 'gap');
    assert.equal(run('2026-11-30', st({ gapSent: 3 })), null);
});
test('пропуск: один пустой день — утром тишина (вопрос придёт вечером)', () => {
    const r = planReminder({ now: at('2026-11-18', 10), settings: on(), state: st(), data: { transactions: [exp('2026-11-17')] } });
    assert.equal(r, null);
});
test('пропуск: registerOpen сбрасывает счётчик, когда пропуска нет', () => {
    assert.equal(registerOpen(st({ gapSent: 2 }), new Date(), { gapDays: 0 }).gapSent, 0);
    assert.equal(registerOpen(st({ gapSent: 2 }), new Date(), { gapDays: 5 }).gapSent, 2);
});

// ───── игнорирование и пауза ─────
test('игнор: после IGNORED_LIMIT неоткрытых уведомлений Акулка прощается и затихает', () => {
    let state = st();
    let farewell = null;
    for (let i = 0; i < IGNORED_LIMIT + 2 && !farewell; i++) {
        const t = at(shiftDay('2026-11-01', i), 21);
        const r = plan({ args: { now: t, state }, data: { transactions: [exp('2026-10-30')] } });
        assert.ok(r, `день ${i}`);
        if (r.type === 'farewell') farewell = r;
        state = registerShown(state, r, t);
    }
    assert.ok(farewell);
    assert.equal(state.paused, true);
    assert.equal(plan({ args: { now: at('2026-11-20'), state }, data: { transactions: [exp('2026-10-30')] } }), null);
});
test('игнор: открытие приложения обнуляет счётчик и снимает паузу', () => {
    const s = registerOpen(st({ ignored: 5, paused: true }), at('2026-11-18', 12));
    assert.equal(s.ignored, 0);
    assert.equal(s.paused, false);
});
test('игнор: уведомление, после которого приложение открывали, не считается проигнорированным', () => {
    let state = registerShown(st(), { day: '2026-11-17', slot: 'evening', mark: {} }, at('2026-11-17', 21));
    state = registerOpen(state, at('2026-11-17', 22));
    state = registerShown(state, { day: '2026-11-18', slot: 'evening', mark: {} }, at('2026-11-18', 21));
    assert.equal(state.ignored, 0);
});

// ───── тексты ─────
test('тексты: детерминированы по seed, без хвостов из пустых плейсхолдеров', () => {
    const v = { spent: '5 000', count: 'Записано: 1 операция', cur: 'сум' };
    const a = renderReminderText('eveningPlain', v, { seed: 'x' });
    const b = renderReminderText('eveningPlain', v, { seed: 'x' });
    assert.deepEqual(a, b);
    assert.doesNotMatch(a.body, /[{}]|undefined/);
    assert.doesNotMatch(a.body, /\s{2,}| \.|\.\./);
});
test('тексты: строгий характер использует обычные', () => {
    const r = renderReminderText('farewell', {}, { character: 'strict' });
    assert.equal(r.title, REMINDER_TEXTS.farewell.title.normal);
});
test('тексты: все шаблоны заполняются без остатков плейсхолдеров', () => {
    const vars = { spent: '1', left: '2', over: '3', count: 'c', extra: '', cur: 'сум', days: '3 дня', item: 'x', amount: '5', when: 'сегодня', total: '9', avg: '1', top: 'Еда', income: '7' };
    for (const key of Object.keys(REMINDER_TEXTS)) {
        for (const ch of ['kind', 'normal']) {
            for (let i = 0; i < REMINDER_TEXTS[key][ch].length; i++) {
                const r = renderReminderText(key, vars, { character: ch, seed: `s${i}${key}` });
                assert.doesNotMatch(r.body, /\{\w+\}/, `${key}/${ch}`);
                assert.ok(r.body.length > 10, `${key}/${ch}`);
            }
        }
    }
});
test('тексты: склонение', () => {
    assert.equal(plural(1, ['день', 'дня', 'дней']), 'день');
    assert.equal(plural(3, ['день', 'дня', 'дней']), 'дня');
    assert.equal(plural(11, ['день', 'дня', 'дней']), 'дней');
    assert.equal(plural(22, ['день', 'дня', 'дней']), 'дня');
});
