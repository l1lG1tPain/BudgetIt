import {
    addDays,
    buildPeriodDates,
    calculateSimpleDepositInterest,
    ensureBudgetId,
    formatLocalISODate,
    normalizePlanner,
    validatePlannerPayload,
    normalizeISODate
} from './plannerUtils.js';
import { formatNumber } from '../utils/utils.js';

export class PlannerManager {
    constructor(budgetManager) {
        this.budgetManager = budgetManager;
    }

    getCurrentBudget() {
        return this.budgetManager?.getCurrentBudget?.() || null;
    }

    getCurrentBudgetId() {
        const budget = this.getCurrentBudget();
        if (!budget) return '';

        const id = ensureBudgetId(budget);
        this.budgetManager?.saveToStorage?.();
        return id;
    }

    getAllPlanners() {
        if (!Array.isArray(this.budgetManager.planners)) {
            this.budgetManager.planners = [];
        }
        return this.budgetManager.planners;
    }

    getPlannersForCurrentBudget() {
        const budgetId = this.getCurrentBudgetId();
        return this.getAllPlanners().filter(item => item.budgetId === budgetId && !item.archived);
    }

    getPlannerById(plannerId) {
        return this.getAllPlanners().find(item => item.id === plannerId) || null;
    }

    createPlanner(payload) {
        const validation = validatePlannerPayload(payload);
        if (!validation.isValid) {
            return { ok: false, errors: validation.errors };
        }

        const budgetId = this.getCurrentBudgetId();
        const planner = normalizePlanner(
            {
                ...payload,
                budgetId,
                endDate: addDays(payload.startDate, (Number(payload.periodDays) || 15) - 1)
            },
            budgetId
        );

        this.getAllPlanners().push(planner);
        this.budgetManager?.saveToStorage?.();

        return { ok: true, planner };
    }

    updatePlanner(plannerId, payload) {
        const planner = this.getPlannerById(plannerId);
        if (!planner) {
            return { ok: false, errors: { common: 'План не найден' } };
        }

        const merged = {
            ...planner,
            ...payload,
            incomePlan: {
                ...planner.incomePlan,
                ...(payload.incomePlan || {})
            }
        };

        const validation = validatePlannerPayload(merged);
        if (!validation.isValid) {
            return { ok: false, errors: validation.errors };
        }

        const normalized = normalizePlanner(merged, planner.budgetId);
        Object.assign(planner, normalized);

        this.budgetManager?.saveToStorage?.();
        return { ok: true, planner };
    }

    deletePlanner(plannerId) {
        const planners = this.getAllPlanners();
        const idx = planners.findIndex(item => item.id === plannerId);
        if (idx === -1) return false;

        planners.splice(idx, 1);
        this.budgetManager?.saveToStorage?.();
        return true;
    }

    duplicatePlanner(plannerId) {
        const planner = this.getPlannerById(plannerId);
        if (!planner) return { ok: false, errors: { common: 'План не найден' } };

        const clone = structuredClone(planner);
        delete clone.id;
        clone.name = `${planner.name} (копия)`;
        delete clone.createdAt;
        delete clone.updatedAt;

        const result = this.createPlanner(clone);
        return result;
    }

    getTodayIso(today = new Date()) {
        return formatLocalISODate(today instanceof Date ? today : new Date(today));
    }

    normalizeCategory(value) {
        return String(value || '').trim();
    }

    sumAmounts(values = []) {
        return values.reduce((sum, value) => sum + (Number(value) || 0), 0);
    }

    aggregateByCategory(items = [], amountKey = 'amount') {
        const map = new Map();

        for (const item of items) {
            const category = this.normalizeCategory(item?.category);
            const amount = Number(item?.[amountKey]) || 0;
            if (!category || amount <= 0) continue;

            const prev = map.get(category) || {
                category,
                amount: 0,
                items: []
            };

            prev.amount += amount;
            prev.items.push(item);
            map.set(category, prev);
        }

        return [...map.values()];
    }

    getPlannedMainForDate(planner, date) {
        return this.aggregateByCategory(
            (planner.mainExpenses || []).filter(item => item.date === date),
            'amount'
        );
    }

    getPlannedDailyForStart(planner) {
        return this.aggregateByCategory(planner.dailyExpenses || [], 'amountPerDay');
    }

    getPlannedDailyForDay(planner, isStartDay) {
        if (isStartDay) return [];
        return this.aggregateByCategory(planner.dailyExpenses || [], 'amountPerDay');
    }

    getPlannedRegularForDay(planner, offsetDay, isStartDay) {
        if (isStartDay) return [];

        const triggered = (planner.regularExpenses || []).filter(item => {
            const startOffset = Number(item.startOffsetDay) || 0;
            const everyNDays = Math.max(1, Number(item.everyNDays) || 1);

            return (
                offsetDay >= startOffset &&
                ((offsetDay - startOffset) % everyNDays === 0)
            );
        });

        return this.aggregateByCategory(triggered, 'amount');
    }

    getPlannedRegularForStart(planner) {
        const triggered = (planner.regularExpenses || []).filter(item => {
            const startOffset = Number(item.startOffsetDay) || 0;
            const everyNDays = Math.max(1, Number(item.everyNDays) || 1);
            return startOffset === 0 && everyNDays >= 1;
        });

        return this.aggregateByCategory(triggered, 'amount');
    }

    classifyTransaction(tx) {
        const amount = Number(tx?.amount) || 0;
        if (amount <= 0) return null;

        const date = normalizeISODate(tx?.date);
        if (!date) return null;

        const category = this.normalizeCategory(tx?.category || tx?.name || '');
        const type = String(tx?.type || '').trim();

        if (type === 'income') {
            return {
                id: tx.id || `${date}_${category}_${amount}_income`,
                date,
                amount,
                category,
                kind: 'income',
                sourceType: 'income',
                original: tx
            };
        }

        if (type === 'expense') {
            return {
                id: tx.id || `${date}_${category}_${amount}_expense`,
                date,
                amount,
                category,
                kind: 'expense',
                sourceType: 'expense',
                original: tx
            };
        }

        if (type === 'deposit') {
            const status = String(tx?.status || '').trim();
            const isWithdraw = status === '➖ Снятие';

            return {
                id: tx.id || `${date}_${category}_${amount}_deposit`,
                date,
                amount,
                category: category || 'Вклад',
                kind: isWithdraw ? 'income' : 'expense',
                sourceType: isWithdraw ? 'deposit_withdraw' : 'deposit_topup',
                original: tx
            };
        }

        if (type === 'debt') {
            const direction = String(tx?.direction || '').trim();
            const isOwe = direction === 'owe';

            return {
                id: tx.id || `${date}_${category}_${amount}_debt`,
                date,
                amount,
                category: category || (isOwe ? 'Долг' : 'Возврат долга'),
                kind: isOwe ? 'expense' : 'income',
                sourceType: isOwe ? 'debt_owe' : 'debt_lent',
                original: tx
            };
        }

        return null;
    }

    getRealTransactionsForPlannerPeriod(plannerId) {
        const planner = this.getPlannerById(plannerId);
        const budget = this.getCurrentBudget();

        if (!planner || !budget?.transactions?.length) return [];

        const start = planner.startDate;
        const end = planner.endDate;

        return budget.transactions
            .map(tx => this.classifyTransaction(tx))
            .filter(Boolean)
            .filter(tx => tx.date >= start && tx.date <= end);
    }

    buildRealTransactionsByDate(plannerId) {
        const txs = this.getRealTransactionsForPlannerPeriod(plannerId);
        const map = new Map();

        for (const tx of txs) {
            if (!map.has(tx.date)) {
                map.set(tx.date, []);
            }
            map.get(tx.date).push(tx);
        }

        return map;
    }

    matchPlanEntries(plannedEntries = [], realEntries = []) {
        const leftovers = [...realEntries];
        const matched = [];
        let matchedTotal = 0;

        for (const planned of plannedEntries) {
            const safeCategory = this.normalizeCategory(planned.category);

            const currentMatches = leftovers.filter(
                entry => this.normalizeCategory(entry.category) === safeCategory
            );

            const currentFact = currentMatches.reduce(
                (sum, entry) => sum + (Number(entry.amount) || 0),
                0
            );

            const plannedAmount = Number(planned.amount) || 0;

            matched.push({
                category: safeCategory,
                planned: plannedAmount,
                fact: currentFact,
                effective: currentFact > 0 ? currentFact : plannedAmount,
                deviation: currentFact - plannedAmount
            });

            matchedTotal += currentFact;

            for (const used of currentMatches) {
                const idx = leftovers.findIndex(item => item.id === used.id);
                if (idx !== -1) leftovers.splice(idx, 1);
            }
        }

        return {
            rows: matched,
            matchedTotal,
            leftovers
        };
    }

    // Дата, в которую «ожидается» плановое поступление: до начала периода — стартовый день,
    // после конца периода поступление в расчёт не входит (возвращается '').
    getPlanIncomeDate(planner) {
        const d = planner.incomePlan?.incomeDate || planner.startDate;
        if (d < planner.startDate) return planner.startDate;
        if (d > planner.endDate) return '';
        return d;
    }

    // Состояние планового поступления.
    // Реальные поступления плановой категории в любой день периода засчитываются в свой день и «закрывают» план:
    //   • дата плана уже наступила — если факт есть, план не считаем; если фактов нет, считаем, что деньги придут по плану;
    //   • дата плана ещё впереди — ожидаем только недостающую часть (план минус уже полученное).
    // Пустая сумма плана = «считать по факту»: учитываются только реальные поступления категории.
    getPlanIncomeState(planner, realByDate, todayIso) {
        const category = this.normalizeCategory(planner.incomePlan?.category);
        let received = 0;
        for (const list of realByDate.values()) {
            for (const entry of list) {
                if (entry.kind === 'income' && this.normalizeCategory(entry.category) === category) {
                    received += Number(entry.amount) || 0;
                }
            }
        }
        const planned = Number(planner.incomePlan?.amount) || 0;
        const planDate = this.getPlanIncomeDate(planner);
        const expected = !planDate ? 0
            : planDate > todayIso ? Math.max(0, planned - received)
            : (received > 0 ? 0 : planned);
        return { category, received, planned, planDate, expected };
    }

    buildDayFacts({
                      planner,
                      currentDate,
                      day,
                      isStartDay,
                      realByDate,
                      incomeState
                  }) {
        const isPlanIncomeDay = !!incomeState && incomeState.planDate === currentDate;
        const plannedIncome = isPlanIncomeDay ? incomeState.planned : 0;
        const expectedIncome = isPlanIncomeDay ? incomeState.expected : 0;

        const plannedMainEntries = this.getPlannedMainForDate(planner, currentDate);
        const plannedDailyEntries = this.getPlannedDailyForDay(planner, isStartDay);
        const plannedRegularEntries = this.getPlannedRegularForDay(planner, day.offsetDay, isStartDay);

        const plannedDepositOut = (planner.plannedDeposits || [])
            .filter(dep => dep.startDate === currentDate)
            .reduce((sum, dep) => sum + (Number(dep.amount) || 0), 0);

        // Стартовый день: реальные расходы считаются, как в любой другой день.
        // Реальные поступления — только плановой категории (остальные деньги этого дня в расчёт не входят).
        const allRealDay = [...(realByDate.get(currentDate) || [])];
        const planCategory = this.normalizeCategory(planner.incomePlan?.category);
        const realIncomeEntries = allRealDay.filter(item => item.kind === 'income');
        let realExpenseEntries = allRealDay.filter(item => item.kind === 'expense');

        const planIncomeEntries = realIncomeEntries
            .filter(entry => this.normalizeCategory(entry.category) === planCategory);
        const plannedIncomeFact = planIncomeEntries
            .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);

        const extraIncome = isStartDay
            ? 0
            : realIncomeEntries
                .filter(entry => this.normalizeCategory(entry.category) !== planCategory)
                .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);

        const mainMatch = this.matchPlanEntries(plannedMainEntries, realExpenseEntries);
        realExpenseEntries = mainMatch.leftovers;

        const regularMatch = this.matchPlanEntries(plannedRegularEntries, realExpenseEntries);
        realExpenseEntries = regularMatch.leftovers;

        const dailyMatch = this.matchPlanEntries(plannedDailyEntries, realExpenseEntries);
        realExpenseEntries = dailyMatch.leftovers;

        const realDepositFact = realExpenseEntries
            .filter(entry => entry.sourceType === 'deposit_topup')
            .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);

        if (realDepositFact > 0) {
            realExpenseEntries = realExpenseEntries.filter(entry => entry.sourceType !== 'deposit_topup');
        }

        const extraExpenses = realExpenseEntries.reduce(
            (sum, entry) => sum + (Number(entry.amount) || 0),
            0
        );

        const plannedMain = this.sumAmounts(plannedMainEntries.map(item => item.amount));
        const plannedDaily = this.sumAmounts(plannedDailyEntries.map(item => item.amount));
        const plannedRegular = this.sumAmounts(plannedRegularEntries.map(item => item.amount));

        const factMain = mainMatch.matchedTotal;
        const factDaily = dailyMatch.matchedTotal;
        const factRegular = regularMatch.matchedTotal;
        const factDeposits = realDepositFact;

        const effectiveIncome = plannedIncomeFact + expectedIncome;
        const effectiveMain = factMain > 0 ? factMain : plannedMain;
        const effectiveDaily = factDaily > 0 ? factDaily : plannedDaily;
        const effectiveRegular = factRegular > 0 ? factRegular : plannedRegular;
        const effectiveDeposits = factDeposits > 0 ? factDeposits : plannedDepositOut;

        const totalIncomeDay = effectiveIncome + extraIncome;
        const totalExpenseDay = effectiveMain + effectiveDaily + effectiveRegular + effectiveDeposits + extraExpenses;
        const netDay = totalIncomeDay - totalExpenseDay;

        return {
            planned: {
                income: plannedIncome,
                main: plannedMain,
                daily: plannedDaily,
                regular: plannedRegular,
                deposits: plannedDepositOut
            },
            fact: {
                income: plannedIncomeFact,
                main: factMain,
                daily: factDaily,
                regular: factRegular,
                deposits: factDeposits,
                extraIncome,
                extraExpenses
            },
            effective: {
                income: effectiveIncome,
                main: effectiveMain,
                daily: effectiveDaily,
                regular: effectiveRegular,
                deposits: effectiveDeposits
            },
            breakdown: {
                main: mainMatch.rows,
                daily: dailyMatch.rows,
                regular: regularMatch.rows
            },
            totalIncomeDay,
            totalExpenseDay,
            netDay
        };
    }

    getDayExpenseParts(row) {
        return {
            plannedExpense:
                (Number(row?.planned?.main) || 0) +
                (Number(row?.planned?.daily) || 0) +
                (Number(row?.planned?.regular) || 0) +
                (Number(row?.planned?.deposits) || 0),

            factExpense:
                (Number(row?.fact?.main) || 0) +
                (Number(row?.fact?.daily) || 0) +
                (Number(row?.fact?.regular) || 0) +
                (Number(row?.fact?.deposits) || 0) +
                (Number(row?.fact?.extraExpenses) || 0)
        };
    }

    getRiskEmojiByRatios({ planRatio = 0, limitRatio = 0, diff = 0 }) {
        if (diff < 0 && limitRatio <= 1) return '😎';
        if (diff === 0 && limitRatio <= 1) return '👌';

        const worstRatio = Math.max(planRatio, limitRatio);

        if (worstRatio >= 4) return '💀';
        if (worstRatio >= 3) return '🤯';
        if (worstRatio >= 2) return '😵';
        if (worstRatio >= 1.5) return '😬';
        if (worstRatio >= 1.2) return '🫠';
        if (worstRatio > 1) return '🙂';

        return '👌';
    }

    buildDayRiskMeta(row, dailyLimit = 0) {
        if (!row || row.isStartDay) {
            return {
                emoji: '🟦',
                status: 'start',
                diff: 0,
                planRatio: 0,
                limitRatio: 0,
                overPlanPercent: 0,
                overLimitPercent: 0,
                text: 'Стартовый день'
            };
        }

        const { plannedExpense, factExpense } = this.getDayExpenseParts(row);
        const diff = factExpense - plannedExpense;

        const safePlanned = plannedExpense > 0 ? plannedExpense : 0;
        const safeLimit = Number(dailyLimit) || 0;

        const planRatio = safePlanned > 0 ? factExpense / safePlanned : 0;
        const limitRatio = safeLimit > 0 ? factExpense / safeLimit : 0;

        const overPlanPercent = safePlanned > 0
            ? Math.max(0, Math.round(((factExpense - safePlanned) / safePlanned) * 100))
            : 0;

        const overLimitPercent = safeLimit > 0
            ? Math.max(0, Math.round(((factExpense - safeLimit) / safeLimit) * 100))
            : 0;

        const emoji = this.getRiskEmojiByRatios({ planRatio, limitRatio, diff });

        let status = 'ok';
        let text = '👌 В пределах плана';

        const safeDiff = Math.round(diff);
        const safeExtraIncome = Math.round(Number(row?.fact?.extraIncome) || 0);
        const safeOverLimit = Math.max(0, Math.round(factExpense - safeLimit));

        if (diff < 0 && (safeLimit <= 0 || factExpense <= safeLimit)) {
            status = 'below_plan';
            text = `${emoji} Ниже плана на ${formatNumber(Math.abs(safeDiff))}`;
        } else if (diff === 0 && (safeLimit <= 0 || factExpense <= safeLimit)) {
            status = 'on_plan';
            text = `${emoji} Чётко по плану`;
        } else if (safeLimit > 0 && factExpense > safeLimit) {
            status = 'over_limit';
            text = `${emoji} Выше лимита на ${formatNumber(safeOverLimit)}`;
        } else if (diff > 0) {
            status = 'over_plan';
            text = `${emoji} Выше плана на ${formatNumber(safeDiff)}`;
        }

        if (safeExtraIncome > 0 && status !== 'over_limit') {
            text += ` · доп. поступление ${formatNumber(safeExtraIncome)}`;
        }

        return {
            emoji,
            status,
            diff,
            planRatio,
            limitRatio,
            overPlanPercent,
            overLimitPercent,
            plannedExpense,
            factExpense,
            limit: safeLimit,
            text
        };
    }

    calculatePlannerProjection(plannerId, today = new Date()) {
        const planner = this.getPlannerById(plannerId);
        if (!planner) return null;

        const periodDays = buildPeriodDates(planner.startDate, planner.periodDays);
        const todayIso = this.getTodayIso(today);
        const realByDate = this.buildRealTransactionsByDate(plannerId);

        const incomeState = this.getPlanIncomeState(planner, realByDate, todayIso);

        // Стартовый день: плановое поступление (или полученное) минус траты этого дня по факту (или по плану).
        // Ежедневные и регулярные траты начинаются со 2-го дня.
        let startBase = { openingBalance: 0, incomeAtStart: 0, startMain: 0, startDaily: 0, startRegular: 0, startDeposits: 0, startExtra: 0 };
        let runningBalance = 0;
        const rows = [];

        if (periodDays.length > 0) {
            const startCalc = this.buildDayFacts({
                planner,
                currentDate: planner.startDate,
                day: periodDays[0],
                isStartDay: true,
                realByDate,
                incomeState
            });
            startBase = {
                openingBalance: startCalc.netDay,
                incomeAtStart: startCalc.totalIncomeDay,
                startMain: startCalc.effective.main,
                startDaily: 0,
                startRegular: 0,
                startDeposits: startCalc.effective.deposits,
                startExtra: startCalc.fact.extraExpenses
            };
            runningBalance = startCalc.netDay;

            rows.push({
                dayIndex: 1,
                date: planner.startDate,
                isToday: planner.startDate === todayIso,
                isStartDay: true,
                balanceStartOfDay: 0,
                startBreakdown: {
                    income: startBase.incomeAtStart,
                    main: startBase.startMain,
                    daily: 0,
                    regular: 0,
                    deposits: startBase.startDeposits,
                    extra: startBase.startExtra
                },
                planned: startCalc.planned,
                fact: startCalc.fact,
                effective: startCalc.effective,
                breakdown: startCalc.breakdown,
                totalIncomeDay: startCalc.totalIncomeDay,
                totalExpenseDay: startCalc.totalExpenseDay,
                netDay: startCalc.netDay,
                balanceEndOfDay: runningBalance
            });
        }

        for (let i = 1; i < periodDays.length; i++) {
            const day = periodDays[i];
            const currentDate = day.date;
            const isStartDay = false;
            const balanceStartOfDay = runningBalance;

            const dayCalc = this.buildDayFacts({
                planner,
                currentDate,
                day,
                isStartDay,
                realByDate,
                incomeState
            });

            runningBalance += dayCalc.netDay;

            rows.push({
                dayIndex: day.dayIndex,
                date: currentDate,
                isToday: currentDate === todayIso,
                isStartDay,
                balanceStartOfDay,
                planned: dayCalc.planned,
                fact: dayCalc.fact,
                effective: dayCalc.effective,
                breakdown: dayCalc.breakdown,
                totalIncomeDay: dayCalc.totalIncomeDay,
                totalExpenseDay: dayCalc.totalExpenseDay,
                netDay: dayCalc.netDay,
                balanceEndOfDay: runningBalance
            });
        }

        const totalPlannedDeposits = (planner.plannedDeposits || []).reduce(
            (sum, item) => sum + (Number(item.amount) || 0),
            0
        );

        const expectedDepositInterest = (planner.plannedDeposits || []).reduce(
            (sum, item) =>
                sum + calculateSimpleDepositInterest(item.amount, item.annualRate, item.termDays),
            0
        );

        const finalBalance = rows.length ? rows[rows.length - 1].balanceEndOfDay : startBase.openingBalance;
        const actionableRows = rows.filter(row => !row.isStartDay);

        const isPast   = todayIso > planner.endDate;
        const isFuture = todayIso < planner.startDate;
        const focusIndex = actionableRows.findIndex(row => row.isToday);

        // Для завершённого периода — остатка нет, всё уже потрачено.
        // Для будущего — все дни ещё впереди.
        // Для текущего — начиная с сегодня (или с первого дня если сегодня не найден).
        const remainingRows = isPast
            ? []
            : isFuture
                ? actionableRows
                : focusIndex >= 0 ? actionableRows.slice(focusIndex) : actionableRows;

        const currentBalance = remainingRows.length
            ? (Number(remainingRows[0].balanceStartOfDay) || 0)
            : finalBalance;

        const remainingIncome = this.sumAmounts(remainingRows.map(row => row.totalIncomeDay));
        const remainingExpense = this.sumAmounts(remainingRows.map(row => row.totalExpenseDay));
        const remainingBudget = currentBalance + remainingIncome - remainingExpense;

        // Для завершённого периода суточный лимит не имеет смысла.
        const dailyLimit = remainingRows.length > 0
            ? remainingBudget / remainingRows.length
            : 0;

        const rowsWithRisk = rows.map(row => ({
            ...row,
            riskMeta: this.buildDayRiskMeta(row, dailyLimit)
        }));

        const totalPlannedExpense = this.sumAmounts(rows.map(row => (
            (Number(row.planned.main) || 0) +
            (Number(row.planned.daily) || 0) +
            (Number(row.planned.regular) || 0) +
            (Number(row.planned.deposits) || 0)
        )));

        const totalFactExpense = this.sumAmounts(rows.map(row => (
            (Number(row.fact.main) || 0) +
            (Number(row.fact.daily) || 0) +
            (Number(row.fact.regular) || 0) +
            (Number(row.fact.deposits) || 0) +
            (Number(row.fact.extraExpenses) || 0)
        )));

        const totalPlannedIncome = this.sumAmounts(rows.map(row => Number(row.planned.income) || 0));
        const totalFactIncome = this.sumAmounts(rows.map(row => (
            (Number(row.fact.income) || 0) +
            (Number(row.fact.extraIncome) || 0)
        )));

        return {
            planner,
            rows: rowsWithRisk,
            summary: {
                budgetName: planner.name,
                incomeAmount: Number(planner.incomePlan.amount) || 0,
                incomeReceived: incomeState.received,
                incomeExpected: incomeState.expected,
                incomeByFact: !(Number(planner.incomePlan.amount) > 0),
                periodDays: planner.periodDays,
                startDate: planner.startDate,
                endDate: planner.endDate,
                totalPlannedDeposits,
                expectedDepositInterest,
                openingBalance: startBase.openingBalance,
                finalBalance,
                remainingBudget,
                dailyLimit,
                actionableDays: actionableRows.length,
                remainingDays: remainingRows.length,
                currentBalance,
                remainingIncome,
                remainingExpense,
                totalPlannedExpense,
                totalFactExpense,
                totalPlannedIncome,
                totalFactIncome
            }
        };
    }
}