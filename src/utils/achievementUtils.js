export function calculateAchievementContext(transactions = [], budget = {}) {
    const lastTx = transactions[transactions.length - 1] || {};
    const categories = new Set();
    let coffeeTxCount = 0;
    let kalyanTxCount = 0;
    let akulaTxCount = 0;
    let loveTxCount = 0;
    let amountsMap = {};
    let sameAmountRepeated = false;
    let lastCoffeeAmount = 0;
    let hasExpenseButNoFood = false;

    let monthlyIncome = 0;
    let monthlyExpense = 0;
    let totalIncome = 0;
    let totalExpense = 0;
    let depositCount = 0;
    let debtCount = 0;

    const transactionsToday = [];
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const currentMonth = todayStr.slice(0, 7);

    let lastIncomeCategory = '';

    for (let i = transactions.length - 1; i >= 0; i--) {
        const tx = transactions[i];
        if (!lastIncomeCategory && tx.type === 'income') {
            lastIncomeCategory = tx.category || '';
        }
    }

    for (const tx of transactions) {
        const cat = tx.category?.trim();
        if (cat) categories.add(cat);

        if (cat?.toLowerCase().includes('кофе')) {
            coffeeTxCount++;
            lastCoffeeAmount = tx.amount;
        }

        if (cat?.includes('Кальян')) kalyanTxCount++;
        if (cat?.includes('Акулка')) akulaTxCount++;
        if (cat?.includes('Девушка') || cat?.includes('💘')) loveTxCount++;

        if (tx.amount) {
            amountsMap[tx.amount] = (amountsMap[tx.amount] || 0) + 1;
            if (amountsMap[tx.amount] >= 3) sameAmountRepeated = true;
        }

        if (tx.type === 'expense') {
            totalExpense += tx.amount || 0;
            const isFood = cat?.toLowerCase().includes('еда') || cat?.toLowerCase().includes('продукты');
            if (!isFood) hasExpenseButNoFood = true;
            if (tx.date?.slice(0, 7) === currentMonth) monthlyExpense += tx.amount || 0;
        }

        if (tx.type === 'income') {
            totalIncome += tx.amount || 0;
            if (tx.date?.slice(0, 7) === currentMonth) monthlyIncome += tx.amount || 0;
        }

        if (tx.type === 'deposit') {
            depositCount++;
        }

        if (tx.type === 'debt') {
            debtCount++;
        }

        if (tx.date?.slice(0, 10) === todayStr) {
            transactionsToday.push(tx);
        }
    }

    const lastHour = lastTx.date ? new Date(lastTx.date).getHours() : null;

    return {
        lastAmount: lastTx.amount || 0,
        lastHour,
        lastDepositDay: lastTx.type === 'deposit' && lastTx.date ? new Date(lastTx.date).getDay() : null,
        usedCategories: Array.from(categories),
        coffeeTxCount,
        kalyanTxCount,
        akulaTxCount,
        loveTxCount,
        sameAmountRepeated,
        lastCoffeeAmount,
        hasExpenseButNoFood,
        txOnBudgetBirthday: budget?.createdAt
            ? now.toISOString().slice(5, 10) === budget.createdAt.slice(5, 10)
            : false,
        currentBalance: budget?.balance || 0,
        monthlyIncome,
        monthlyExpense,
        totalIncome,
        totalExpense,
        debtCount,
        depositCount,
        exported: budget?.exported || false,
        cacheCleared: budget?.cacheCleared || false,
        currentBudgetName: budget?.name || '',
        lastIncomeCategory,
        transactionsToday
    };
}


export function calculateAchievementPoints(unlockedIds = [], allAchievements = []) {
    return unlockedIds.reduce((total, id) => {
        const ach = allAchievements.find(a => a.id === id);
        if (!ach) return total;
        return total + (ach.hidden ? 10 : 5);
    }, 0);
}

export function calculateUserLevel(totalPoints = 0) {
    const levels = [50, 100, 200, 500, 1000, 2500, 5000];
    let currentLevel = 1;
    let nextThreshold = levels[0];

    for (let i = 0; i < levels.length; i++) {
        if (totalPoints >= levels[i]) {
            currentLevel = i + 2;
            nextThreshold = levels[i + 1] || levels.at(-1);
        }
    }

    const progress = Math.min(100, Math.round((totalPoints / nextThreshold) * 100));
    return { currentLevel, nextThreshold, progress };
}
