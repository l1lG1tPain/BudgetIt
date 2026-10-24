import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

globalThis.window = globalThis;
globalThis.document = { getElementById: () => null, addEventListener() {}, querySelector: () => null };
globalThis.localStorage = { getItem: () => null, setItem() {} };

const mod = await import('../src/Excelimportmanager.js');
const x = new (mod.ExcelImportManager || Object.values(mod)[0])({}, {});
const M = await import('../src/import/merchants/index.js');
const B = await import('../src/import/pdfBanks.js');
const fx = f => fs.readFileSync(new URL('./fixtures/' + f, import.meta.url), 'utf8');
const ctx = {
    mapExpense: d => M.mapRuExpense(d) || x._mapExpenseCategory(d),
    mapIncome:  d => M.mapRuIncome(d)  || x._mapIncomeCategory(d),
};
const sum = (rows, t) => Math.round(rows.filter(r => r.type === t).reduce((a, r) => a + r.amount, 0) * 100) / 100;

test('словари: не меньше 500 организаций в РФ и УЗ', () => {
    assert.ok(M.ruExpenseRules().length >= 500, 'RU ' + M.ruExpenseRules().length);
    assert.ok(M.uzExtraRules().length >= 500, 'UZ ' + M.uzExtraRules().length);
});

test('словари: у каждого правила есть категория и скомпилированные шаблоны', () => {
    for (const r of [...M.ruExpenseRules(), ...M.uzExtraRules(), ...M.ruIncomeRules()]) {
        assert.ok(r.category && r.res.length > 0, r.name);
    }
});

test('узбекские результаты не изменились (снимок)', () => {
    const snap = JSON.parse(fs.readFileSync(new URL('./fixtures/uz-map-snapshot.json', import.meta.url), 'utf8'));
    const bad = [];
    for (const [kind, inp, oi] of snap.rows) {
        const old = snap.outs[oi];
        if (old === '🗿 Прочее' || old === '🔮 Загадочное поступление') continue;
        const now = kind === 'i' ? x._mapIncomeCategory(inp) : x._mapExpenseCategory(inp);
        if (now !== old) bad.push(kind + ' ' + inp + ': ' + old + ' → ' + now);
    }
    assert.deepEqual(bad, []);
});

test('Т-Банк: суммы сходятся с шапкой выписки', () => {
    const r = B.parseTBank(fx('pdf-tbank.txt'), ctx);
    assert.equal(sum(r, 'expense'), 17645.29);
    assert.equal(sum(r, 'income'), Math.round((13859.61 + 744.11) * 100) / 100);
});

test('Ozon Банк: суммы сходятся', () => {
    const r = B.parseOzon(fx('pdf-ozon.txt'), ctx);
    assert.equal(sum(r, 'income'), 13220);
    assert.equal(sum(r, 'expense'), 13220);
});

test('Газпромбанк: суммы сходятся', () => {
    const r = B.parseGazprom(fx('pdf-gazprom.txt'), ctx);
    assert.equal(sum(r, 'income'), 263211.84);
    assert.equal(sum(r, 'expense'), 262113.48);
});

test('определение банка и общий разбор', () => {
    assert.equal(B.detectPdfBank(fx('pdf-tbank.txt')), 'tbank');
    assert.equal(B.detectPdfBank(fx('pdf-ozon.txt')), 'ozon');
    assert.equal(B.detectPdfBank(fx('pdf-gazprom.txt')), 'gazprom');
    assert.ok(x._parsePDFText(fx('pdf-gazprom.txt'), []).length > 0);
});

test('РФ-названия: примеры', () => {
    const cases = {
        'PYATEROCHKA 1234 MOSKVA RUS': '🥦 Продукты',
        'ПЕРЕКРЕСТОК': '🥦 Продукты',
        'WILDBERRIES': '📦 Wildberries',
        'ЯНДЕКС ЕДА': '🍽️ Яндекс Еда',
        'ЛЭТУАЛЬ': '🧴 Косметика',
    };
    for (const [k, v] of Object.entries(cases)) assert.equal(M.mapRuExpense(k), v, k);
});

test('ложные срабатывания: обычные слова не попадают в бренды', () => {
    for (const s of ['Перевод', 'Кошелек', 'Прочее 123']) assert.equal(M.mapRuExpense(s), null, s);
});

test('собственные переводы: категория существует в списках', () => {
    const inc = fs.readFileSync(new URL('../constants/incomeCategories.js', import.meta.url), 'utf8');
    const exp = fs.readFileSync(new URL('../constants/expenseCategories.js', import.meta.url), 'utf8');
    assert.ok(inc.includes(B.OWN_TRANSFER_CATEGORY) && exp.includes(B.OWN_TRANSFER_CATEGORY));
    assert.ok(exp.includes(B.REFUND_CATEGORY) || inc.includes(B.REFUND_CATEGORY));
});

test('PDF идёт через предпросмотр и запоминает правила категорий', () => {
    const store = {};
    globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
    const y = new (mod.ExcelImportManager || Object.values(mod)[0])({}, {});
    const rows = B.parseGazprom(fx('pdf-gazprom.txt'), ctx);
    y._startPdfPreview(rows, { name: 'x.pdf' });
    assert.equal(y._pdfMode, true);
    const before = y._parseRows();
    assert.equal(before.length, rows.length);
    const target = before.find(r => r.type === 'expense' && r.description);
    assert.equal(y._saveCatRule(target.description, 'expense', '💐 Цветы'), true);
    const after = y._parseRows();
    const same = after.filter(r => r.type === 'expense' && r.description === target.description);
    assert.ok(same.length > 0 && same.every(r => r.category === '💐 Цветы'));
    // новый файл не должен тащить за собой режим PDF
    y._pdfMode = false; y._rows = [];
    assert.deepEqual(y._parseRows(), []);
});
