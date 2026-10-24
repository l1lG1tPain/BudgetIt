/**
 * Словари организаций для «Залётом»: российские (RU) и дополнительные узбекские (UZ).
 * Узбекские правила, собранные вручную в Excelimportmanager._mapExpenseCategory, НЕ заменяются:
 * дополнения из uz*.js применяются только если старые правила ничего не нашли.
 */
import { compileRules, matchRules } from './engine.js';
import { RU_EXPENSE_SRC_1, RU_INCOME_SRC } from './ru.js';
import * as RU2 from './ru-2.js';
import * as RU3 from './ru-3.js';
import * as UZ1 from './uz.js';
import * as UZ2 from './uz-2.js';

let _ruExp = null, _ruInc = null, _uzExp = null;

function srcOf(mod) {
    return Object.keys(mod).filter(k => k.startsWith('RU_EXPENSE_SRC') || k.startsWith('UZ_EXPENSE_SRC')).sort().map(k => mod[k]).join('\n');
}

export function ruExpenseRules() {
    if (!_ruExp) _ruExp = compileRules([RU_EXPENSE_SRC_1, srcOf(RU2), srcOf(RU3)].join('\n'));
    return _ruExp;
}
export function ruIncomeRules() {
    if (!_ruInc) _ruInc = compileRules(RU_INCOME_SRC);
    return _ruInc;
}
export function uzExtraRules() {
    if (!_uzExp) _uzExp = compileRules([srcOf(UZ1), srcOf(UZ2)].join('\n'));
    return _uzExp;
}

export function mapRuExpense(text)    { return matchRules(ruExpenseRules(), text); }
export function mapRuIncome(text)     { return matchRules(ruIncomeRules(), text); }
export function mapUzExtraExpense(text) { return matchRules(uzExtraRules(), text); }
