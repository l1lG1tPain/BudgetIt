/**
 * Разбор PDF-выписок российских банков: Т-Банк, Ozon Банк, Газпромбанк.
 * Чистые функции без DOM: на вход — текст PDF, как его отдаёт pdf.js
 * (элементы страницы, склеенные через «\n»). Категории подставляют переданные
 * ctx.mapExpense(desc) / ctx.mapIncome(desc) — так модуль легко тестируется.
 *
 * Каждый парсер возвращает массив строк { date, type, amount, category, description, own? }
 * и (через .meta) контрольные итоги из шапки выписки — по ним в тестах сверяется сумма.
 */

export const OWN_TRANSFER_CATEGORY = '🔁 Перевод между своими счетами';
export const REFUND_CATEGORY = '↩️ Возврат покупки';

/* ───────── общие помощники ───────── */

/** Строки без пустых элементов и одиночных пробелов. */
export function pdfLines(text) {
    return String(text || '').split('\n').map(s => s.replace(/ /g, ' ').trim()).filter(Boolean);
}

/** «1 012,95» / «+ 1 500.00» / «- 17 645.29» → число (знак отдельно не возвращается). */
export function parseMoney(s) {
    const t = String(s || '').replace(/[+\-−–]/g, '').replace(/[\s\u00a0]+/g, '').replace(/[^\d.,]/g, '');
    if (!t) return NaN;
    return parseFloat(t.replace(',', '.'));
}

function iso(d, m, y) {
    const yy = String(y).length === 2 ? '20' + y : String(y);
    return `${yy}-${m}-${d}`;
}

/** Склеивает перенесённые по слогам куски («SANKT-» + «PETERBU RUS»). */
function joinWrapped(parts) {
    return parts.join(' ').replace(/-\s+/g, '-').replace(/\s{2,}/g, ' ').trim();
}

/** Имя владельца из шапки (для определения переводов самому себе). */
export function findOwner(text) {
    const lines = pdfLines(text).slice(0, 80);
    const NAME = /^([А-ЯЁA-Z][А-ЯЁа-яёA-Za-z\-]+)\s+([А-ЯЁA-Z][А-ЯЁа-яёA-Za-z\-]+)\s+([А-ЯЁA-Z][А-ЯЁа-яёA-Za-z\-]+)$/;
    for (let i = 0; i < lines.length; i++) {
        if (/^(Владелец:?|Держатель)$/i.test(lines[i]) && lines[i + 1]) {
            const m = NAME.exec(lines[i + 1].replace(/^Владелец:\s*/i, ''));
            if (m) return { surname: m[1], name: m[2], patronymic: m[3] };
        }
        const inl = /^(?:Владелец|Держатель):?\s+(.+)$/i.exec(lines[i]);
        if (inl) { const m = NAME.exec(inl[1]); if (m) return { surname: m[1], name: m[2], patronymic: m[3] }; }
    }
    // Т-Банк: строка ФИО капсом сразу после даты в шапке
    for (const l of lines.slice(0, 12)) {
        const m = NAME.exec(l);
        if (m && l === l.toUpperCase()) return { surname: m[1], name: m[2], patronymic: m[3] };
    }
    return null;
}

/** «Мария Петровна И.» — это сам владелец? */
export function isOwnerName(owner, str) {
    if (!owner || !str) return false;
    const w = String(str).replace(/[.,]/g, ' ').trim().split(/\s+/).map(x => x.toLowerCase());
    const n = owner.name.toLowerCase(), p = owner.patronymic.toLowerCase(), s0 = owner.surname[0].toLowerCase();
    if (w.length >= 3 && w[0] === n && w[1] === p && w[2][0] === s0) return true;
    if (w.length >= 3 && w[0] === owner.surname.toLowerCase() && w[1] === n && w[2] === p) return true;
    return false;
}

function pushRow(out, { date, income, amount, description, own, category }, ctx) {
    if (!date || !amount || isNaN(amount)) return;
    const type = income ? 'income' : 'expense';
    const cat = category
        || (own ? OWN_TRANSFER_CATEGORY : (income ? ctx.mapIncome(description) : ctx.mapExpense(description)));
    out.push({ date, type, amount: Math.round(amount * 100) / 100, category: cat, description, ...(own ? { own: true } : {}) });
}

/* ───────── определение банка ───────── */

export function detectPdfBank(text) {
    const head = String(text || '').slice(0, 4500);
    if (/Газпромбанк|ГАЗПРОМБАНК|GAZPRUMM|gazprombank/i.test(head)
        || (/ВЫПИСКА ПО КАРТЕ/.test(head) && /Дата отражения/.test(head))) return 'gazprom';
    if ((/ОЗОН\s*Банк|Ozon\s*Bank/i.test(head)) && /Справка о движении/i.test(head)) return 'ozon';
    if (/Выписка по договору\s*№/.test(head) && /Операции по карте\s*№|Сумма\s*в валюте|в валюте счёта/i.test(head)) return 'tbank';
    if (/T-Банк|Т-Банк|ТБАНК|тинькофф|tinkoff|TBANK\.RU/i.test(head)) return 'tbank';
    return null;
}

/* ───────── Т-Банк ───────── */

const TB_DT = /^(\d{2})\.(\d{2})\.(\d{2})(?:\s+\d{2}:\d{2})?$/;
const TB_D  = /^(\d{2})\.(\d{2})\.(\d{2})$/;
const TB_AMT = /^([+\-])?\s*(\d[\d ]*[.,]\d{2})$/;
const TB_STOP = /^(Пополнения:|Расходы:|АО\s|АКЦИОНЕРНОЕ|БИК\s|ИНН\s|КПП\s|Руководител|Управлен|Бэк-офис|С уважен|Дата и время|операции$|Дата$|обработки$|Сумма$|Описание$|в валюте счёта$|в валюте счета$|Операции по карте|Баланс на|Выписка по договору|•)/i;

export function parseTBank(text, ctx) {
    const L = pdfLines(text);
    const out = [];
    const meta = { expense: null, income: null, cashback: null };
    for (let i = 0; i < L.length; i++) {          // шапка: итоги
        let m;
        if (L[i] === 'Поступления' && (m = L[i + 1])) { /* на случай разнесённых колонок */ }
        if (/^Расходы$/.test(L[i]) && TB_AMT.test(L[i + 1] || '')) meta.expense = parseMoney(L[i + 1]);
    }
    const mm = String(text).match(/Поступления\s*\n?\s*([\d ]+\.\d{2})/);
    if (mm) meta.income = parseMoney(mm[1]);
    const me = String(text).match(/Расходы\s*\n\s*(?:-\s*)?([\d ]+\.\d{2})/);
    if (me) meta.expense = parseMoney(me[1]);
    const mc = String(text).match(/Кэшбэк\s*\n\s*([\d ]+\.\d{2})/);
    if (mc) meta.cashback = parseMoney(mc[1]);

    let i = 0;
    const isStart = (k) => TB_DT.test(L[k] || '') && TB_D.test(L[k + 1] || '');
    while (i < L.length) {
        if (!isStart(i)) { i++; continue; }
        const d = TB_DT.exec(L[i]);
        const date = iso(d[1], d[2], d[3]);
        let j = i + 2;
        // суммы: первая — в валюте операции (со знаком), вторая — в валюте счёта
        const amts = [];
        while (j < L.length && amts.length < 2) {
            if (/^₽$/.test(L[j])) { j++; continue; }
            const a = TB_AMT.exec(L[j].replace(/\s*₽$/, ''));
            if (a) { amts.push({ sign: a[1] || '', val: parseMoney(a[2]) }); j++; continue; }
            break;
        }
        while (j < L.length && /^₽$/.test(L[j])) j++;
        if (!amts.length) { i++; continue; }
        const parts = [];
        while (j < L.length && !isStart(j)) {
            const s = L[j];
            if (TB_STOP.test(s) || /^\d{1,3}$/.test(s)) { j++; if (TB_STOP.test(s)) break; continue; }
            parts.push(s);
            j++;
        }
        i = j;
        let desc = joinWrapped(parts);
        const income = amts[0].sign === '+';
        const own = /Перевод с договора|Внутренний перевод на договор|Перевод между своими/i.test(desc);
        desc = desc
            .replace(/^Оплата (?:в|услуг)\s+/i, '')
            .replace(/\s*SANKT-?\s*PETERBU(?:RG)?(?:\s+RUS?)?/gi, '')
            .replace(/\s+(?:MOSCOW|MOSKVA|Moskva)\s+RUS?$/i, '')
            .replace(/\s+(?:Sankt-Peterbu|SANKT-PETERBU)\s+RUS?$/i, '')
            .replace(/\s+RUS?$/i, '')
            .replace(/\+7\d{10}/g, '')
            .replace(/\s{2,}/g, ' ').trim();
        if (/^Внутренний перевод на договор/i.test(desc)) desc = 'Перевод между своими договорами (исходящий)';
        if (/^Перевод с договора/i.test(desc)) desc = 'Перевод между своими договорами (входящий)';
        let category;
        if (!own && /^(Зачисление кэшбэка|Кэшбэк)/i.test(desc)) category = '💳 Кэшбек';
        pushRow(out, { date, income, amount: amts[0].val, description: desc, own, category }, ctx);
    }
    out.meta = meta;
    return out;
}

/* ───────── Ozon Банк ───────── */

const OZ_DATE = /^(\d{2})\.(\d{2})\.(\d{4})(?:\s+\d{2}:\d{2}:\d{2})?$/;
const OZ_AMT = /^([+\-])\s*(\d[\d ]*[.,]\d{2})\s*₽?$/;

function ozonDescribe(raw, owner) {
    let d = raw.replace(/\.?\s*Без\s*НДС\.?/gi, '').replace(/\s{2,}/g, ' ').trim();
    let m;
    if ((m = /Перевод\s+(?:\S+\s+)*?через\s+СБП\.?\s*(Получатель|Отправитель):\s*(.+?)\.?$/i.exec(d))) {
        const who = m[2].replace(/\.$/, '').trim();
        const own = isOwnerName(owner, who);
        return { description: `Перевод через СБП${m[1].toLowerCase().startsWith('п') ? ' → ' : ' ← '}${who}`, own };
    }
    if ((m = /Оплата товаров по карте\s+\d+\s+сумма\s+[\d.,]+\s+в\s+(.+?)\s+дата\s+\d{4}-\d{2}-\d{2}/i.exec(d))) {
        return { description: m[1].replace(/\s*SANKT-?\s*PETERBU(?:RG)?(?:\s+RUS?)?/gi, '').replace(/\s+RUS?$/i, '').trim() };
    }
    if (/Платформе\s+Ozon/i.test(d)) return { description: 'Оплата на платформе Ozon' + ((m = /заказ\s*№\s*([\d-]+)/i.exec(d)) ? ` (заказ ${m[1]})` : ''), category: '📦 Ozon' };
    if (/^Оплата заказа/i.test(d)) return { description: 'Оплата заказа Ozon' + (/за доставку/i.test(d) ? ' (доставка)' : ''), category: '📦 Ozon' };
    if (/^Чаевые/i.test(d)) return { description: 'Чаевые по заказу', category: '🎁 Подарок / бонус' };
    if (/кешбека|кэшбэка|кэшбек/i.test(d)) return { description: 'Кешбек Ozon Банка', category: '💳 Кэшбек' };
    return { description: d.replace(/\b[A-Z0-9]{10,}\b/g, '').replace(/\s{2,}/g, ' ').trim() };
}

export function parseOzon(text, ctx) {
    const L = pdfLines(text);
    const out = [];
    const owner = findOwner(text);
    const meta = { income: null, expense: null };
    const zi = /Итого зачислений за период:\s*([\d ]+\.\d{2})/.exec(text);
    const zs = /Итого списаний за период:\s*([\d ]+\.\d{2})/.exec(text);
    if (zi) meta.income = parseMoney(zi[1]);
    if (zs) meta.expense = parseMoney(zs[1]);

    let i = 0;
    while (i < L.length) {
        const dm = OZ_DATE.exec(L[i]);
        if (!dm) { i++; continue; }
        // дата операции всегда с временем — отличаем от «открыт 16.06.2024» и т.п.
        if (!/\d{2}:\d{2}:\d{2}$/.test(L[i])) { i++; continue; }
        let j = i + 1;
        while (j < L.length && /^\d+$/.test(L[j])) j++;       // номер документа (может быть разорван)
        const parts = [];
        let am = null;
        while (j < L.length) {
            if (/^Итого зачислений/.test(L[j])) break;
            const a = OZ_AMT.exec(L[j]);
            if (a) { am = a; break; }
            if (OZ_DATE.test(L[j]) && /\d{2}:\d{2}:\d{2}$/.test(L[j])) break;
            parts.push(L[j]);
            j++;
        }
        if (!am) { i = j; continue; }
        j++;                                                     // первая сумма
        if (j < L.length && OZ_AMT.test(L[j])) j++;              // дубль «Валюта»
        i = j;
        const income = am[1] === '+';
        const { description, own, category } = ozonDescribe(joinWrapped(parts), owner);
        pushRow(out, { date: iso(dm[1], dm[2], dm[3]) ? `${dm[3]}-${dm[2]}-${dm[1]}` : null, income, amount: parseMoney(am[2]), description, own, category }, ctx);
    }
    out.meta = meta;
    return out;
}

/* ───────── Газпромбанк ───────── */

const GP_D = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const GP_AMT = /^([+\-])\s*(\d[\d ]*,\d{2})$/;
const GP_HEAD = /^(ВЫПИСКА ПО КАРТЕ|За период\b|Держатель\b|Дата$|совершения$|операции$|Дата отражения|операции по Счету|карты$|\(списания\/зачисления|денежных средств\)|Содержание операции|Приход$|Расход$|\d{1,3}$)/;

function gazpromDescribe(raw) {
    const d = raw.replace(/\s{2,}/g, ' ').trim();
    let m;
    if (/Перевод между своими счетами/i.test(d)) return { description: 'Перевод между своими счетами', own: true };
    if ((m = /ПЕРЕВОД С КАРТЫ НА КАРТУ \((ЗАЧИСЛЕНИЕ|СПИСАНИЕ)\)/i.exec(d))) {
        const into = /ЗАЧИСЛЕНИЕ/i.test(m[1]);
        const byNum = /PEREVOD PO NOMERU/i.test(d);
        return { description: into ? 'Входящий перевод (СБП)' : (byNum ? 'Перевод по номеру (СБП)' : 'Перевод (СБП)') };
    }
    if ((m = /П[OО]КУПКА[^.]*\.(?:\s*Карта\s*[\d*]+\.)?\s*Устройство:\s*(.+?)\.\s*Город:/i.exec(d))) {
        return { description: m[1].replace(/^SBP\s+/i, '').replace(/\s{2,}/g, ' ').trim() };
    }
    if (/Пополнение Счета карты по п\/п/i.test(d)) {
        const a = /Акт\s*N?\s*(\d+)/i.exec(d);
        return { description: 'Оплата по договору' + (a ? ` (Акт N${a[1]})` : ''), category: '💼 Оплата по договору' };
    }
    if (/^Коммунальные услуги/i.test(d)) return { description: 'Коммунальные услуги', category: '💡 Коммунальные услуги' };
    if (/Перевод с банковской карты/i.test(d)) return { description: 'Перевод со счёта карты на счёт' };
    return { description: d.replace(/Сумма операции:.*$/i, '').trim() };
}

export function parseGazprom(text, ctx) {
    const L = pdfLines(text);
    const out = [];
    const meta = { income: null, expense: null };
    const mi = /Поступления\s*\n?[^\n]*?\n?\s*([\d ]+,\d{2}) руб/.exec(text);
    const hi = /Поступления\s*\n(?:Расходы\s*\n)?\s*\n?([\d ]+,\d{2}) руб\.\s*\n([\d ]+,\d{2}) руб\./.exec(text);
    if (hi) { meta.income = parseMoney(hi[1]); meta.expense = parseMoney(hi[2]); }
    else if (mi) meta.income = parseMoney(mi[1]);

    let i = 0;
    while (i < L.length) {
        if (!(GP_D.test(L[i]) && GP_D.test(L[i + 1] || ''))) { i++; continue; }
        const dm = GP_D.exec(L[i]);
        let j = i + 2;
        const parts = [];
        const amts = [];
        while (j < L.length && amts.length < 2) {
            const a = GP_AMT.exec(L[j]);
            if (a) { amts.push({ sign: a[1], val: parseMoney(a[2]) }); j++; continue; }
            if (GP_D.test(L[j]) && GP_D.test(L[j + 1] || '')) break;       // началась следующая операция
            if (amts.length === 0 && !GP_HEAD.test(L[j])) parts.push(L[j]);
            j++;
        }
        i = j;
        if (amts.length < 2) continue;
        const incomeAmt = amts.find(a => a.sign === '+')?.val || 0;
        const expenseAmt = amts.find(a => a.sign === '-')?.val || 0;
        const income = incomeAmt > 0;
        const amount = income ? incomeAmt : expenseAmt;
        const { description, own, category } = gazpromDescribe(joinWrapped(parts));
        pushRow(out, { date: `${dm[3]}-${dm[2]}-${dm[1]}`, income, amount, description, own, category }, ctx);
    }
    out.meta = meta;
    return out;
}

/* ───────── точка входа ───────── */

export function parseRussianPdf(text, ctx) {
    const bank = detectPdfBank(text);
    const parsers = { tbank: parseTBank, ozon: parseOzon, gazprom: parseGazprom };
    if (bank && parsers[bank]) {
        const r = parsers[bank](text, ctx);
        if (r.length) { r.bank = bank; return r; }
    }
    return [];
}
