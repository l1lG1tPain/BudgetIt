export const formatNumber = (num) => num.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });

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
  return { income: 'Доход', expense: 'Расход', debt: 'Долг', deposit: 'Вклад' }[type] || 'Неизвестно';
};