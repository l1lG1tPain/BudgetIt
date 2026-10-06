// ===============================
//   AccountsPage.js — страница «Счета»: накопления и долги
//   Только показывает данные; пополнение/снятие/платежи — в карточке операции (UIManager).
// ===============================

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Категории «Залётом», связанные со вкладами (👉 с их эмодзи): «🏦 Вклад», «🏦 Перевод на вклад»,
// «🏦 Перевод с вклада», «🏦 Депозит», «🏦 Проценты от вклада». Это обычные траты/поступления,
// поэтому «Счета» отдельно считают по ним движение: на вклад (+), со вклада (−), проценты.
const DEPOSIT_CAT_RE = /(вклад|депозит|deposit|vklad|depozit)/i;
const INTEREST_RE = /процент|interest|percent/i;
const FROM_RE = /(с|со|из)\s+(вклада|депозита)|снят|списан/i;
const TO_RE = /(на|в)\s+(вклад|депозит)|пополн/i;

function splitCategory(cat) {
    const m = /^(\p{Extended_Pictographic}\uFE0F?(?:\u200D\p{Extended_Pictographic}\uFE0F?)*)\s*(.*)$/u.exec(String(cat || '').trim());
    return m ? { emoji: m[1], label: m[2] || cat } : { emoji: '🏦', label: String(cat || '') };
}

// kind: 'in' — деньги ушли на вклад, 'out' — вернулись со вклада, 'interest' — проценты, null — не про вклады
export function classifyDepositFlow(tx) {
    if (!tx || (tx.type !== 'expense' && tx.type !== 'income')) return null;
    const cat = String(tx.category || '');
    if (!DEPOSIT_CAT_RE.test(cat)) return null;
    // «Проценты от вклада» из выписок (Click/Alliance Pay) на деле — все поступления с вклада: тело + проценты,
    // отличить проценты от возврата тела нельзя, поэтому считаем их возвратом со вклада (см. «получено сверх внесённого»)
    if (INTEREST_RE.test(cat)) return tx.type === 'income' ? 'out' : null;
    // направление берём из самой категории: в выписке вклада «Перевод с вклада» приходит расходом,
    // а «Перевод на вклад» — поступлением; для нейтральных «Вклад»/«Депозит» решает тип операции
    if (FROM_RE.test(cat)) return 'out';
    if (TO_RE.test(cat)) return 'in';
    return tx.type === 'expense' ? 'in' : 'out';
}

export class AccountsPage {
    constructor({ budgetManager, uiManager }) {
        this.bm = budgetManager;
        this.ui = uiManager;
        this.page = document.getElementById('accounts-page');
    }

    init() {
        this.ui.accountsHook = this;
        document.getElementById('open-accounts')?.addEventListener('click', () => this.open());
        this.page?.querySelector('[data-close-accounts]')?.addEventListener('click', () => this.close());
        this.refreshRow();
    }

    open() {
        if (!this.page) return;
        this.render();
        this.page.classList.remove('hidden');
        window.dispatchEvent(new CustomEvent('budgetit:page-open', { detail: { id: 'accounts-page' } }));
    }

    close() {
        this.page?.classList.add('hidden');
        window.dispatchEvent(new CustomEvent('budgetit:page-close', { detail: { id: 'accounts-page' } }));
    }

    // ───── данные ─────
    collect() {
        const ui = this.ui;
        const budget = this.bm.getCurrentBudget();
        const txs = budget?.transactions || [];

        // Ручные накопления старого формата (без depositId): «Пополнение», «Уже лежало» и «Снятие» — один общий пул,
        // иначе каждое снятие становилось отдельным «счётом» и ничего не вычитало
        const roots = ui.getDepositRoots?.() || [];
        const newRootIds = new Set(roots.filter(r => ui.isNewDepositRoot?.(r)).map(r => r.depositId));
        const today = new Date().toLocaleDateString('en-CA');
        const legacyTxs = txs.filter(t => t.type === 'deposit' && !(t.depositId && newRootIds.has(t.depositId)));
        const legacyNet = legacyTxs.reduce((a, t) => {
            if ((t.date || '') > today) return a;
            const amt = Number(t.amount) || 0;
            return a + (String(t.status || '').trim() === '➖ Снятие' ? -amt : amt);
        }, 0);
        const legacy = legacyNet > 0 ? { tx: [...legacyTxs].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0],
            name: 'Накопления (вручную)', count: legacyTxs.length, balance: legacyNet, legacyPool: true,
            meta: { annualRate: 0, termMonths: 0, totalInterest: 0, currentBalance: legacyNet, initialAmount: legacyNet } } : null;
        const legacyClosed = legacyTxs.length > 0 && !legacy;

        const allSavings = roots.filter(r => newRootIds.has(r.depositId)).map(root => {
            let meta = { currentBalance: root.amount || 0, annualRate: root.annualRate || 0, termMonths: root.termMonths || 0, totalInterest: 0, initialAmount: root.amount || 0 };
            try { meta = ui.buildDepositSchedule(root).meta || meta; } catch (e) { /* старые вклады без графика */ }
            return { tx: root, name: root.name || root.category || 'Накопление', meta, balance: this.balanceToday(root) };
        });
        // счёт показываем, пока на нём что-то лежит; полностью снятые («потрачены») — только в счётчике
        const savings = allSavings.filter(s => s.balance > 0);
        if (legacy) savings.push(legacy);
        const closedCount = allSavings.length - savings.filter(s => !s.legacyPool).length + (legacyClosed ? 1 : 0);

        const debts = txs.filter(t => t.type === 'debt').map(t => {
            const total = t.initialAmount || t.amount || 0;
            const paid = (t.payments || []).reduce((a, p) => a + (Number(p.amount) || 0), 0);
            const remaining = t.paid ? 0 : Math.max(0, total - paid);
            return { tx: t, name: t.name || t.category || 'Долг', total, paid, remaining, owed: t.direction !== 'owe' };
        });

        // движение по вкладам из выписок (обычные траты/поступления с «вкладными» категориями)
        const flowMap = new Map();
        txs.forEach(t => {
            const kind = classifyDepositFlow(t);
            if (!kind) return;
            const key = `${kind}|${t.category}`;
            const g = flowMap.get(key) || { kind, category: t.category, ...splitCategory(t.category), count: 0, sum: 0 };
            g.count += 1;
            g.sum += Number(t.amount) || 0;
            flowMap.set(key, g);
        });
        const flows = [...flowMap.values()].sort((a, b) => b.sum - a.sum);
        const flowIn = flows.filter(g => g.kind === 'in').reduce((a, g) => a + g.sum, 0);
        const flowOut = flows.filter(g => g.kind === 'out').reduce((a, g) => a + g.sum, 0);
        const flowInterest = Math.max(0, flowOut - flowIn); // получено сверх внесённого — проценты
        const flowNet = Math.max(0, flowIn - flowOut);

        const savedTotal = savings.reduce((a, s) => a + s.balance, 0) + flowNet;
        const owedToMe = debts.filter(d => d.owed && !d.tx.paid).reduce((a, d) => a + d.remaining, 0);
        const iOwe = debts.filter(d => !d.owed && !d.tx.paid).reduce((a, d) => a + d.remaining, 0);
        return { savings, debts, savedTotal, owedToMe, iOwe, closedCount, flows, flowIn, flowOut, flowInterest, flowNet };
    }

    // Баланс накопления НА СЕГОДНЯ: внесено − снято (с учётом уже начисленных за прошедшие месяцы процентов).
    // Раньше брался баланс в конце срока вклада (прогноз) и не учитывались снятия — отсюда «28 млн» при нуле на главной.
    balanceToday(root) {
        const ui = this.ui;
        const today = new Date().toLocaleDateString('en-CA');
        const group = ui.getDepositGroup?.(root) || [root];
        const net = group.reduce((a, t) => {
            if ((t.date || '') > today) return a;
            const amt = Number(t.amount) || 0;
            return a + (String(t.status || '').trim() === '➖ Снятие' ? -amt : amt);
        }, 0);
        if (!ui.isNewDepositRoot?.(root)) return Math.max(0, net);
        try {
            const { rows } = ui.buildDepositSchedule(root);
            if (!rows.length) return Math.max(0, net);
            const cm = today.slice(0, 7);
            if (cm < rows[0].monthKey) return 0;
            const cur = rows.find(r => r.monthKey === cm);
            let bal = cur ? cur.startBalance + cur.topups - cur.withdrawals : rows[rows.length - 1].endBalance;
            if (cur) {
                // операции текущего месяца с датой позже сегодняшней ещё не случились
                group.forEach(t => {
                    if (t === root || (t.date || '') <= today || (t.date || '').slice(0, 7) !== cm) return;
                    const amt = Number(t.amount) || 0;
                    bal += String(t.status || '').trim() === '➖ Снятие' ? amt : -amt;
                });
            }
            return Math.max(0, bal);
        } catch (e) {
            return Math.max(0, net);
        }
    }

    refresh() {
        this.refreshRow();
        if (this.page && !this.page.classList.contains('hidden')) {
            const sc = this.page.querySelector('.subpage-content') || this.page;
            const top = sc.scrollTop;
            this.render();
            sc.scrollTop = top;
        }
    }

    refreshRow() {
        const el = document.getElementById('accounts-row-text');
        if (!el) return;
        const { savedTotal, owedToMe, iOwe } = this.collect();
        const f = n => this.ui.formatNumber(Math.round(n));
        el.textContent = `${f(savedTotal)} · ${f(iOwe)}`;
    }

    // ───── рендер ─────
    render() {
        const body = document.getElementById('accounts-body');
        if (!body) return;
        const f = n => this.ui.formatNumber(Math.round(n));
        const { savings, debts, savedTotal, owedToMe, iOwe, closedCount, flows, flowIn, flowOut, flowInterest, flowNet } = this.collect();

        const savRows = savings.length ? savings.map((s, i) => {
            if (s.legacyPool) {
                return `<button class="acc-row" data-kind="saving" data-i="${i}">
                <span class="acc-emoji">💎</span>
                <span class="acc-main"><b>${esc(s.name)}</b><small>пополнения минус снятия · ${s.count} операц.</small></span>
                <span class="acc-sum">${f(s.balance)}</span>
            </button>`;
            }
            const term = s.meta.termMonths ? `${s.meta.termMonths} мес.` : 'Бессрочно';
            const gain = Math.round(s.meta.totalInterest || 0);
            return `<button class="acc-row" data-kind="saving" data-i="${i}">
                <span class="acc-emoji">💎</span>
                <span class="acc-main"><b>${esc(s.name)}</b><small>${(s.meta.annualRate || 0).toFixed(1)}% · ${term}${gain > 0 ? ` · +${f(gain)} за срок` : ''}</small></span>
                <span class="acc-sum">${f(s.balance)}</span>
            </button>`;
        }).join('') : '<div class="acc-empty">Сейчас на накоплениях пусто. Добавь операцию «Накопл.».</div>';

        const flowRows = flows.map(g => {
            const sign = g.kind === 'out' ? '−' : '+';
            const cls = g.kind === 'out' ? 'is-out' : 'is-in';
            const note = g.kind === 'out' ? (INTEREST_RE.test(g.category) ? 'получено со вклада' : 'снято со вклада') : 'переведено на вклад';
            return `<div class="acc-row acc-flow ${cls}">
                <span class="acc-emoji">${esc(g.emoji)}</span>
                <span class="acc-main"><b>${esc(g.label)}</b><small>${note} · ${g.count} операц.</small></span>
                <span class="acc-sum">${sign}${f(g.sum)}</span>
            </div>`;
        }).join('');
        const flowBlock = flows.length ? `
            <h3 class="acc-h">Вклады из выписок</h3>
            <div class="acc-flow-note">Считается по категориям «Залётом»: на вклад минус со вклада = <b>${f(flowNet)}</b>${flowInterest > 0 ? ` · получено сверх внесённого (проценты): <b>${f(flowInterest)}</b>` : ''}</div>
            <div class="acc-list">${flowRows}</div>` : '';

        const debtRows = debts.length ? debts.map((d, i) => {
            const pct = d.total > 0 ? Math.min(100, Math.round(d.paid / d.total * 100)) : 0;
            return `<button class="acc-row ${d.tx.paid ? 'is-done' : ''}" data-kind="debt" data-i="${i}">
                <span class="acc-emoji">${d.owed ? '📈' : '📉'}</span>
                <span class="acc-main"><b>${esc(d.name)}</b><small>${d.owed ? 'Мне должны' : 'Я должен'}${d.tx.paid ? ' · оплачено' : ` · осталось ${f(d.remaining)}`}</small>
                    <span class="acc-bar"><i style="width:${pct}%"></i></span></span>
                <span class="acc-sum">${f(d.total)}</span>
            </button>`;
        }).join('') : '<div class="acc-empty">Долгов нет.</div>';

        body.innerHTML = `
            <div class="acc-hero">
                <div class="acc-hero-label">Накоплено всего</div>
                <div class="acc-hero-value">${f(savedTotal)}</div>
                <div class="acc-hero-note">Сейчас на счетах: внесено минус снятое, плюс начисленные проценты${closedCount ? ` · потрачено полностью: ${closedCount}` : ''}</div>
            </div>
            <div class="acc-two">
                <div class="acc-mini"><small>Мне должны</small><b>${f(owedToMe)}</b></div>
                <div class="acc-mini"><small>Я должен</small><b>${f(iOwe)}</b></div>
            </div>
            <h3 class="acc-h">Накопления</h3>
            <div class="acc-list">${savRows}</div>
            ${flowBlock}
            <h3 class="acc-h">Долги</h3>
            <div class="acc-list">${debtRows}</div>`;

        body.querySelectorAll('.acc-row').forEach(btn => {
            btn.addEventListener('click', () => {
                const item = (btn.dataset.kind === 'saving' ? savings : debts)[Number(btn.dataset.i)];
                if (item) this.ui.openTransactionDetail(item.tx);
            });
        });
    }
}
