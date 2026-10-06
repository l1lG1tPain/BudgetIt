export const NUMBER_FORMAT_KEY = 'budgetit:numberFormat'; // 'space' (1 000 000) | 'comma' (1,000,000) | 'dot' (1.000.000)

export function getNumberFormat() {
    try { return globalThis.localStorage?.getItem(NUMBER_FORMAT_KEY) || 'space'; } catch (e) { return 'space'; }
}

const _nf = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const formatNumber = (num, fmt = getNumberFormat()) => {
    const base = _nf.format(num);
    if (fmt === 'comma') return base.replace(',', '.').replace(/[\u00A0\u202F]/g, ',');
    if (fmt === 'dot')   return base.replace(/[\u00A0\u202F]/g, '.');
    return base;
};

const _ISO = /^(\d{4})-(\d{2})-(\d{2})/;
export const formatDate = (dateStr) => {
    const m = _ISO.exec(dateStr || '');
    if (m) return `${m[3]}.${m[2]}.${m[1].slice(2)}`; // как ru-RU 2-digit, без создания Date/Intl на каждую строку
    return new Date(dateStr).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

export const getTypeColor = (type) => {
  const rs = getComputedStyle(document.documentElement);
  return {
    income: rs.getPropertyValue('--income-color').trim(),
    expense: rs.getPropertyValue('--expense-color').trim(),
    debt: rs.getPropertyValue('--debt-color').trim(),
    deposit: rs.getPropertyValue('--deposit-color').trim()
  }[type] || 'black';
};

export const getTypeName = (type) => {
  return { income: 'Поступление', expense: 'Трата', debt: 'Долг', deposit: 'Накопление' }[type] || 'Неизвестно';
};