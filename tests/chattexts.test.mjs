import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAT_TEXTS, chatLine } from '../src/shark/texts/chat.js';

const CH = ['kind', 'normal', 'strict'];
const BAD = /(молодец|молодц|умниц|\(а\)|\.\.\.|…|рубл|долл|\bсам\b|\bсама\b|вернулся|справился|потратил\b|забыл\b|записал\b|\bсум\b)/i;
const ALLOWED = new Set(['sum', 'what', 'date', 'name', 'per', 'n']);
const JOKE = /[😂🤣😜😏🙈🎉🌈]/u;

test('чат: у каждого вида есть все три характера', () => {
    for (const [kind, by] of Object.entries(CHAT_TEXTS)) {
        for (const c of CH) assert.ok(Array.isArray(by[c]) && by[c].length > 0, `${kind}.${c}`);
    }
});

test('чат: длина, плейсхолдеры и запретные слова', () => {
    for (const [kind, by] of Object.entries(CHAT_TEXTS)) {
        for (const c of CH) for (const s of by[c]) {
            assert.ok(s.length >= 8 && s.length <= 170, `${kind}.${c} длина: ${s}`);
            assert.ok(!BAD.test(s), `${kind}.${c} запретное слово: ${s}`);
            for (const m of s.matchAll(/\{(\w+)\}/g)) assert.ok(ALLOWED.has(m[1]), `${kind}.${c} плейсхолдер ${m[1]}`);
            assert.ok(!/\{[^}]*$|^[^{]*\}/.test(s), `${kind}.${c} скобки: ${s}`);
        }
    }
});

test('чат: записанное начинается с факта, а долги и крупные суммы без шуток', () => {
    for (const kind of ['saved', 'plain', 'repaid']) {
        for (const c of CH) for (const s of CHAT_TEXTS[kind][c]) assert.match(s, /^(Записала|Готово|Добавила|Сохранила|Погашение)/, `${kind}.${c}: ${s}`);
    }
    for (const kind of ['plain', 'repaid']) {
        for (const c of CH) for (const s of CHAT_TEXTS[kind][c]) assert.ok(!JOKE.test(s) && !/[💙🦈🌱✨]/u.test(s), `${kind}.${c}: ${s}`);
    }
});

test('чат: chatLine подставляет значения и не оставляет скобок', () => {
    const vars = { sum: '45 000', what: 'Такси', date: '22.11.2026', name: 'Али' };
    for (const kind of Object.keys(CHAT_TEXTS)) for (const c of CH) for (let i = 0; i < 6; i++) {
        const s = chatLine(kind, c, vars, i / 6);
        assert.ok(s && !/[{}]/.test(s), `${kind}.${c}: ${s}`);
    }
    assert.match(chatLine('saved', 'normal', vars, 0), /45 000/);
    assert.equal(chatLine('saved', 'неизвестный', vars, 0), chatLine('saved', 'normal', vars, 0));
});
/* ───── аудит 5.0.6: короткие реплики, пустые подстановки, числа, род ───── */
test('короткие реплики: у каждой есть все характеры и разные варианты', () => {
    for (const kind of ['hello', 'thanks', 'bye', 'praise', 'ack']) {
        for (const c of CH) {
            const list = CHAT_TEXTS[kind][c];
            assert.ok(list.length >= 3, `${kind}.${c}`);
            assert.equal(new Set(list).size, list.length, `${kind}.${c}: повтор`);
        }
    }
});

test('chatLine: пустая подстановка не оставляет «, ,» и пустых кавычек', () => {
    assert.equal(chatLine('saved', 'normal', { sum: '50 000', what: '', date: '23.11.2026' }, 0), 'Записала: 50 000, 23.11.2026.');
    assert.ok(!/«»|,\s*,/.test(chatLine('spendWhat', 'normal', { what: '', sum: '10', per: '' }, 0)));
});

test('числа согласуются со словом после подстановки', async () => {
    const { agreeNumbers } = await import('../src/shark/SharkMood.js');
    const cases = [['21 дней подряд', '21 день подряд'], ['22 дней в лимите', '22 дня в лимите'], ['11 дней', '11 дней'], ['в 5 раза больше', 'в 5 раз больше'], ['в 3 раза больше', 'в 3 раза больше'],
        ['за 1 операций', 'за 1 операцию'], ['2 записей', '2 записи'], ['подтверждено 1 днями', 'подтверждено 1 днём'], ['10 000 операций', '10 000 операций'], ['из 21 дней', 'из 21 дней']];
    for (const [a, b] of cases) assert.equal(agreeNumbers(a), b, a);
});

test('Акул (classic) говорит о себе в мужском роде, в том числе в новых словах', async () => {
    const { masculine } = await import('../src/shark/SharkMood.js');
    assert.equal(masculine('Чтобы я могла прикинуть'), 'Чтобы я мог прикинуть');
    assert.equal(masculine('Я устала, я присела, я растерялась'), 'Я устал, я присел, я растерялся');
    assert.equal(masculine('Всегда рада помочь'), 'Всегда рад помочь');
    assert.equal(masculine('Неделя вышла дороже, серия жива'), 'Неделя вышла дороже, серия жива');   // чужие подлежащие не трогаем
});

test('пулы реплик: нет одинаковых вариантов внутри одного набора', async () => {
    const T = await import('../src/shark/texts/index.js');
    const key = s => s.toLowerCase().replace(/ё/g, 'е').replace(/[^а-яa-z{}0-9]+/g, ' ').trim();
    const walk = (v, path) => {
        if (Array.isArray(v)) {
            const strs = v.filter(x => typeof x === 'string').map(key);
            assert.equal(new Set(strs).size, strs.length, `повтор в ${path}`);
            v.forEach((x, i) => typeof x === 'object' && walk(x, `${path}[${i}]`));
        } else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
    };
    for (const name of ['ANSWERS', 'ANSWERS_C', 'MOOD_TEXTS', 'TOAST_TEXTS', 'MORNING', 'STREAK', 'GREETINGS', 'MOTIVATION']) walk(T[name], name);
    walk(CHAT_TEXTS, 'CHAT_TEXTS');
});

test('память Акулки: реплики с подстановкой слова, категории и числа', () => {
    for (const kind of ['memoOther', 'memoSwapped', 'memoSame']) for (const c of CH) {
        const s = chatLine(kind, c, { what: 'масло', name: '🛒 KorzinkaGO', n: '6 раз' }, 0);
        assert.ok(s.includes('KorzinkaGO') && !/[{}]/.test(s), `${kind}.${c}: ${s}`);
        assert.ok(!/записывал\b|ты записал\b/.test(s), `${kind}.${c}: род пользователя`);
    }
});

test('отклик на имя: по 15 разных реплик на характер и настроение, короткие для «Тихой»', async () => {
    const { CALL_TEXTS, CALL_QUIET, callLine } = await import('../src/shark/texts/chat.js');
    const { masculine } = await import('../src/shark/SharkMood.js');
    for (const c of CH) {
        for (const mood of ['ok', 'tense', 'angry', 'proud']) {
            const list = CALL_TEXTS[c][mood];
            assert.equal(list.length, 15, `${c}.${mood}`);
            assert.equal(new Set(list).size, 15, `${c}.${mood}: повтор`);
            for (const s of list) {
                assert.ok(s.length >= 5 && s.length <= 120, `${c}.${mood}: ${s}`);
                assert.ok(!/\(а\)|записал\b|купил\b|потратил\b/.test(s), `${c}.${mood}: род пользователя: ${s}`);
            }
        }
        assert.equal(CALL_QUIET[c].length, 15, `quiet.${c}`);
        assert.equal(new Set(CALL_QUIET[c]).size, 15);
        // болтливость и настроение выбирают свой набор; неизвестное — как обычное
        assert.ok(CALL_TEXTS[c].angry.includes(callLine(c, 'angry', 'normal', 0.3)));
        assert.ok(CALL_QUIET[c].includes(callLine(c, 'angry', 'quiet', 0.3)));
        assert.ok(CALL_TEXTS[c].ok.includes(callLine(c, 'new', 'chatty', 0.9)));
    }
    // Акул говорит о себе в мужском роде
    assert.equal(masculine('Вынырнула! И уже подплыла. Готова записывать'), 'Вынырнул! И уже подплыл. Готов записывать');
});

test('крик в ответ: «Акууулка!» — по 15 громких реплик на характер и настроение', async () => {
    const { CALL_SHOUT, CALL_TEXTS, callLine } = await import('../src/shark/texts/chat.js');
    for (const c of CH) for (const mood of ['ok', 'tense', 'angry', 'proud']) {
        const list = CALL_SHOUT[c][mood];
        assert.equal(list.length, 15, `${c}.${mood}`);
        assert.equal(new Set(list).size, 15, `${c}.${mood}: повтор`);
        for (const s of list) {
            assert.ok(!CALL_TEXTS[c][mood].includes(s), `${c}.${mood}: совпадает с обычным откликом: ${s}`);
            assert.ok(!/\(а\)|записал\b|купил\b|потратил\b/.test(s), `${c}.${mood}: ${s}`);
            assert.ok(!/АКУЛК/.test(s), `${c}.${mood}: имя капсом не переводится в «Акул»: ${s}`);
        }
        assert.ok(list.includes(callLine(c, mood, 'normal', 0.5, true)));
    }
});

test('ответы на смену настроек: у каждого варианта есть реплики', async () => {
    const { SHARK_SET_LINES } = await import('../src/shark/texts/chat.js');
    const { SHARK_OPTIONS } = await import('../src/shark/chatFlow.js');
    for (const [key, opts] of Object.entries(SHARK_OPTIONS)) for (const o of opts) assert.ok(SHARK_SET_LINES[key][o.value]?.length >= 3, `${key}:${o.value}`);
});

test('«потише с тратами»: по 15–20 подколок на характер; «поболтаем»: просьбы записать и факты', async () => {
    const { SPEND_TEASE, DIALOG_IDLE, DIALOG_FACTS } = await import('../src/shark/texts/chat.js');
    const check = (list, name, min, max = 99) => {
        assert.ok(list.length >= min && list.length <= max, `${name}: ${list.length}`);
        assert.equal(new Set(list).size, list.length, `${name}: повтор`);
        for (const s of list) {
            assert.ok(s.length >= 8 && s.length <= 170, `${name}: длина ${s}`);
            assert.ok(!BAD.test(s), `${name}: запретное слово: ${s}`);
        }
    };
    for (const c of CH) { check(SPEND_TEASE[c], `tease.${c}`, 15, 20); check(DIALOG_IDLE[c], `idle.${c}`, 15); }
    check(DIALOG_FACTS.features, 'facts.features', 15);
    check(DIALOG_FACTS.saving, 'facts.saving', 15);
});

test('бюджеты из чата: у всех ответов есть реплики на каждый характер', () => {
    for (const k of ['budgetCreateOpen', 'budgetCreated', 'budgetExists', 'budgetLong', 'budgetChars', 'budgetPick', 'budgetNotFound', 'budgetOnlyOne', 'budgetSwitched', 'budgetSame', 'budgetDelete'])
        for (const c of CH) assert.ok(CHAT_TEXTS[k]?.[c]?.length, `${k}.${c}`);
    assert.match(chatLine('budgetDelete', 'normal'), /навсегда/);
});
