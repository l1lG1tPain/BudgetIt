// src/SearchManager.js
// 🔍 Умный поиск BudgetIt v2
// Ищет только в активном месяце (или во всех месяцах, если выбран all)
// Поддерживает поиск по:
// - категории
// - названию дохода (tx.name)
// - типу
// - сумме
// - товарам
// - заметке
// - дате в разных форматах

export class SearchManager {
    constructor(budgetManager, uiManager) {
        this.budgetManager = budgetManager;
        this.uiManager = uiManager;
        this._sheet = null;
        this._input = null;
        this._results = null;
        this._openBtn = null;
        this._backdrop = null;
        this._filterState = 'all'; // 'all' | 'income' | 'expense' | 'deposit' | 'debt'
        this._lastQuery = '';
        this._debounceTimer = null;
        this._txMap = {}; // id → transaction
    }

    init() {
        this._sheet = document.getElementById('search-sheet');
        this._input = document.getElementById('search-input');
        this._results = document.getElementById('search-results');
        this._openBtn = document.getElementById('search-open-btn');
        this._backdrop = document.getElementById('bottom-sheet-backdrop');

        if (!this._sheet || !this._input || !this._results || !this._openBtn) {
            console.warn('[SearchManager] Elements not found');
            return;
        }

        this._openBtn.addEventListener('click', () => this.open());

        document.getElementById('search-close-btn')
            ?.addEventListener('click', () => this.close());

        this._initSwipeClose();

        this._input.addEventListener('input', () => {
            clearTimeout(this._debounceTimer);
            this._debounceTimer = setTimeout(() => this._runSearch(), 90);
        });

        document.querySelectorAll('.search-type-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                document.querySelectorAll('.search-type-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                this._filterState = chip.dataset.type || 'all';
                this._runSearch();
            });
        });

        this._backdrop?.addEventListener('click', () => {
            if (this._sheet.classList.contains('show')) {
                this.close();
            }
        });
    }

    open() {
        this._input.value = '';
        this._lastQuery = '';
        this._filterState = 'all';

        document.querySelectorAll('.search-type-chip').forEach(c => c.classList.remove('active'));
        document.querySelector('.search-type-chip[data-type="all"]')?.classList.add('active');

        this._renderEmpty();

        this._backdrop?.classList.remove('hidden');
        this._sheet.classList.remove('hidden');

        requestAnimationFrame(() => {
            this._sheet.classList.add('show');
        });

        setTimeout(() => this._input.focus(), 350);
    }

    close(keepBackdrop = false) {
        this._sheet.classList.remove('show');

        setTimeout(() => {
            this._sheet.classList.add('hidden');

            if (!keepBackdrop && !document.querySelector('.bottom-sheet.show') && this._backdrop) {
                this._backdrop.classList.add('hidden');
            }
        }, 300);
    }

    // ─────────────────────────────────────────────
    // Логика поиска
    // ─────────────────────────────────────────────

    _getTransactionsForSearch() {
        const budget = this.budgetManager.getCurrentBudget();
        if (!budget) return [];

        const allTx = budget.transactions || [];
        const mf = this.uiManager.monthFilter;
        const fy = this.uiManager.activeYearForMonthFilter || this.uiManager.yearFilter;

        if (mf === 'all') return allTx;

        if (mf === 'year') {
            return allTx.filter(tx => {
                const dateStr = tx.date || '';
                return parseInt(dateStr.slice(0, 4), 10) === fy;
            });
        }

        return allTx.filter(tx => {
            const dateStr = tx.date || '';
            return dateStr.slice(5, 7) === mf && parseInt(dateStr.slice(0, 4), 10) === fy;
        });
    }

    _runSearch() {
        const raw = this._input.value.trim();
        this._lastQuery = raw;

        if (!raw) {
            this._renderEmpty();
            return;
        }

        const transactions = this._getTransactionsForSearch();

        const byType = this._filterState === 'all'
            ? transactions
            : transactions.filter(tx => tx.type === this._filterState);

        const normalizedQuery = this._normalize(raw);
        const tokens = this._tokenize(normalizedQuery);

        const scored = byType
            .map(tx => {
                const index = this._buildSearchIndex(tx);
                return { tx, score: this._score(tx, raw, normalizedQuery, tokens, index) };
            })
            .filter(({ score }) => score > 0)
            .sort((a, b) => b.score - a.score || new Date(b.tx.date || 0) - new Date(a.tx.date || 0));

        this._renderResults(scored.map(s => s.tx), raw);
    }

    _score(tx, rawQuery, normalizedQuery, tokens, index) {
        let score = 0;

        if (!normalizedQuery) return 0;

        // ── Полные совпадения ──
        if (index.category === normalizedQuery) score += 120;
        else if (index.category.startsWith(normalizedQuery)) score += 75;
        else if (index.category.includes(normalizedQuery)) score += 45;

        if (index.incomeName) {
            if (index.incomeName === normalizedQuery) score += 110;
            else if (index.incomeName.startsWith(normalizedQuery)) score += 70;
            else if (index.incomeName.includes(normalizedQuery)) score += 40;
        }

        if (index.typeRu.includes(normalizedQuery)) score += 25;
        if (index.note.includes(normalizedQuery)) score += 20;

        // ── Сумма ──
        if (index.amountCompact === index.queryCompact) score += 95;
        else if (index.amountCompact.startsWith(index.queryCompact) && index.queryCompact.length >= 2) score += 60;
        else if (index.amountPretty.includes(rawQuery)) score += 35;
        else if (index.amountCompact.includes(index.queryCompact) && index.queryCompact.length >= 3) score += 30;

        // ── Дата ──
        if (this._dateMatches(index.dateForms, normalizedQuery, tokens)) {
            score += 65;
        }

        // ── Товары ──
        for (const name of index.productNames) {
            if (name === normalizedQuery) score += 85;
            else if (name.startsWith(normalizedQuery)) score += 55;
            else if (name.includes(normalizedQuery)) score += 30;
        }

        // ── Общая индексная строка ──
        if (index.searchBlob.includes(normalizedQuery)) {
            score += 18;
        }

        // ── Токены: чем больше совпало, тем выше релевантность ──
        let matchedTokens = 0;
        for (const token of tokens) {
            if (!token) continue;

            const tokenCompact = token.replace(/\s/g, '');

            if (
                index.searchBlob.includes(token) ||
                index.amountCompact.includes(tokenCompact) ||
                this._dateMatches(index.dateForms, token, [token])
            ) {
                matchedTokens += 1;
            }
        }

        if (tokens.length > 1) {
            score += matchedTokens * 14;

            // бонус, если совпали все токены
            if (matchedTokens === tokens.length) {
                score += 30;
            }
        }

        return score;
    }

    _buildSearchIndex(tx) {
        const category = this._normalize(tx.category || '');
        const incomeName = this._normalize(tx.name || '');
        const typeRu = this._normalize(this._typeToRu(tx.type));
        const note = this._normalize(tx.note || '');

        const amountValue = tx.type === 'debt'
            ? (tx.remainingAmount || tx.initialAmount || 0)
            : (tx.amount || 0);

        const amountCompact = String(Math.round(amountValue)).replace(/[^\d]/g, '');
        const amountPretty = this._formatAmount(tx);
        const queryCompact = amountCompact;

        const productNames = Array.isArray(tx.products)
            ? tx.products.map(p => this._normalize(p.name || '')).filter(Boolean)
            : [];

        const dateForms = this._buildDateForms(tx.date || '');

        const searchBlob = [
            category,
            incomeName,
            typeRu,
            note,
            ...productNames,
            ...dateForms,
            amountPretty.toLowerCase(),
            amountCompact
        ].join(' | ');

        return {
            category,
            incomeName,
            typeRu,
            note,
            amountCompact,
            amountPretty,
            productNames,
            dateForms,
            searchBlob,
            queryCompact
        };
    }

    _buildDateForms(dateStr) {
        if (!dateStr) return [];

        const raw = String(dateStr).slice(0, 10); // YYYY-MM-DD
        const [year, month, day] = raw.split('-');
        if (!year || !month || !day) return [];

        const yy = year.slice(-2);
        const d = day.padStart(2, '0');
        const m = month.padStart(2, '0');
        const dShort = String(parseInt(d, 10));
        const mShort = String(parseInt(m, 10));

        const monthNames = [
            'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
            'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'
        ];
        const monthShort = [
            'янв', 'фев', 'мар', 'апр', 'май', 'июн',
            'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'
        ];

        const monthFullName = monthNames[parseInt(m, 10) - 1] || '';
        const monthShortName = monthShort[parseInt(m, 10) - 1] || '';

        const forms = [
            raw,                    // 2026-04-30
            `${d}.${m}.${year}`,    // 30.04.2026
            `${d}.${m}.${yy}`,      // 30.04.26
            `${d}.${m}`,            // 30.04
            `${dShort}.${m}`,       // 30.04 / 3.04
            `${dShort}.${mShort}`,  // 30.4
            `${d} ${m}`,            // 30 04
            `${dShort} ${mShort}`,  // 30 4
            `${d} ${monthShortName}`,   // 30 апр
            `${dShort} ${monthShortName}`,
            `${d} ${monthFullName}`,    // 30 апрель
            `${dShort} ${monthFullName}`,
            `${monthShortName} ${d}`,   // апр 30
            `${monthShortName} ${dShort}`,
            `${monthFullName} ${d}`,    // апрель 30
            `${monthFullName} ${dShort}`,
            `${monthShortName}`,        // апр
            `${monthFullName}`,         // апрель
            `${m}.${yy}`,               // 04.26
            `${m}.${year}`,             // 04.2026
            `${year}`,                  // 2026
            `${yy}`,                    // 26
            d,                          // 30
            dShort,                     // 30 / 3
            m,                          // 04
            mShort                      // 4
        ];

        return [...new Set(forms.map(v => this._normalize(v)).filter(Boolean))];
    }

    _dateMatches(dateForms, normalizedQuery, tokens) {
        if (!dateForms.length) return false;

        if (dateForms.some(f => f.includes(normalizedQuery))) {
            return true;
        }

        if (tokens.length > 1) {
            return tokens.every(token => dateForms.some(f => f.includes(token)));
        }

        return false;
    }

    _normalize(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/ё/g, 'е')
            .replace(/[,_]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    _tokenize(query) {
        return this._normalize(query)
            .split(/[\s]+/)
            .filter(Boolean);
    }

    _typeToRu(type) {
        const map = {
            income: 'доход доходы',
            expense: 'расход расходы',
            deposit: 'вклад вклады',
            debt: 'долг долги'
        };
        return map[type] || '';
    }

    // ─────────────────────────────────────────────
    // Рендер
    // ─────────────────────────────────────────────

    _renderEmpty() {
        this._txMap = {};
        this._results.innerHTML = `
            <div class="search-placeholder">
                <div class="search-placeholder-icon">🔍</div>
                <div class="search-placeholder-text">Начни вводить запрос</div>
                <div class="search-placeholder-hint">Категория, сумма, товар, тип или дата</div>
            </div>
        `;
    }

    _renderResults(transactions, query) {
        this._txMap = {};

        if (transactions.length === 0) {
            this._results.innerHTML = `
                <div class="search-placeholder">
                    <div class="search-placeholder-icon">🤷</div>
                    <div class="search-placeholder-text">Ничего не найдено</div>
                    <div class="search-placeholder-hint">Попробуй другой запрос, дату или другой месяц</div>
                </div>
            `;
            return;
        }

        transactions.forEach(tx => { this._txMap[tx.id] = tx; });

        const monthLabel = this._getMonthLabel();

        this._results.innerHTML = `
            <div class="search-count">${transactions.length} результат${this._plural(transactions.length)} ${monthLabel}</div>
            <ul class="search-tx-list">
                ${transactions.map(tx => this._renderTxItem(tx, query)).join('')}
            </ul>
        `;

        this._results.querySelectorAll('.search-tx-item').forEach(li => {
            li.addEventListener('click', () => {
                const tx = this._txMap[Number(li.dataset.id)];
                if (!tx) return;

                this.close(true);

                setTimeout(() => {
                    this.uiManager.openTransactionDetail(tx);
                }, 250);
            });
        });
    }

    _renderTxItem(tx, query) {
        const typeColor = this._typeColor(tx.type);
        const emoji = this._typeEmoji(tx);
        const title = this._highlight(tx.category || this._typeToRuSingle(tx.type), query);
        const dateFormatted = this._formatDate(tx.date);
        const amount = this._formatAmount(tx);
        const amountClass = tx.type === 'expense' || (tx.type === 'debt' && tx.direction === 'owe')
            ? 'search-amount-neg'
            : 'search-amount-pos';

        const incomeNameHtml = tx.type === 'income' && tx.name
            ? `<div class="search-tx-income-name">${this._highlight(tx.name, query)}</div>`
            : '';

        let productsHtml = '';
        if (Array.isArray(tx.products) && tx.products.length > 0) {
            const relevant = tx.products.filter(p =>
                this._normalize(p.name || '').includes(this._normalize(query))
            );
            const show = relevant.length > 0 ? relevant : tx.products.slice(0, 3);
            const more = tx.products.length > 3 && relevant.length === 0
                ? `<span class="search-product-more">+${tx.products.length - 3}</span>`
                : '';

            productsHtml = `<div class="search-products">
                ${show.map(p => `<span class="search-product-tag">${this._highlight(p.name || '', query)}</span>`).join('')}
                ${more}
            </div>`;
        }

        return `
            <li class="search-tx-item" style="--tx-color: ${typeColor}" data-id="${tx.id}">
                <div class="search-tx-left">
                    <span class="search-tx-emoji">${emoji}</span>
                </div>
                <div class="search-tx-body">
                    <div class="search-tx-title">${title}</div>
                    ${incomeNameHtml}
                    ${productsHtml}
                    <div class="search-tx-date">${dateFormatted}</div>
                </div>
                <div class="search-tx-right">
                    <span class="search-tx-amount ${amountClass}">${amount}</span>
                    <span class="search-tx-chevron">›</span>
                </div>
            </li>
        `;
    }

    _highlight(text, query) {
        if (!query || !text) return text;

        let result = String(text);
        const tokens = [...new Set(this._tokenize(query))].sort((a, b) => b.length - a.length);

        for (const token of tokens) {
            if (!token || token.length < 2) continue;
            const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            result = result.replace(
                new RegExp(`(${escaped})`, 'gi'),
                '<mark class="search-highlight">$1</mark>'
            );
        }

        return result;
    }

    _formatAmount(tx) {
        const fmt = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        if (tx.type === 'debt') {
            const sign = tx.direction === 'owe' ? '-' : '+';
            return sign + fmt(tx.remainingAmount || tx.initialAmount || 0);
        }
        const sign = tx.type === 'expense' ? '-' : '+';
        return sign + fmt(tx.amount || 0);
    }

    _formatDate(dateStr) {
        if (!dateStr) return '';
        const [year, month, day] = dateStr.split('-');
        const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
        return `${parseInt(day, 10)} ${months[parseInt(month, 10) - 1] || ''} ${year}`;
    }

    _typeColor(type) {
        const colors = {
            income: '#27AE60',
            expense: '#ff4b5c',
            deposit: '#9B59B6',
            debt: '#F1C40F'
        };
        return colors[type] || '#999';
    }

    _typeEmoji(tx) {
        const cat = tx.category || tx.name || '';
        const match = cat.match(/^(\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Emoji}\ufe0f?)/u);
        if (match) return match[1];
        const map = { income: '💸', expense: '🛒', deposit: '🏦', debt: '📋' };
        return map[tx.type] || '💠';
    }

    _typeToRuSingle(type) {
        const map = { income: 'Доход', expense: 'Расход', deposit: 'Вклад', debt: 'Долг' };
        return map[type] || type;
    }

    _getMonthLabel() {
        const mf = this.uiManager.monthFilter;
        if (mf === 'all') return '• все месяцы';

        const fy = this.uiManager.activeYearForMonthFilter || this.uiManager.yearFilter;

        if (mf === 'year') return `• весь ${fy} год`;

        const months = {
            '01': 'янв', '02': 'фев', '03': 'мар', '04': 'апр',
            '05': 'май', '06': 'июн', '07': 'июл', '08': 'авг',
            '09': 'сен', '10': 'окт', '11': 'ноя', '12': 'дек'
        };

        const yearPart = fy !== new Date().getFullYear() ? ` ${fy}` : '';
        return `• ${months[mf] || mf}${yearPart}`;
    }

    _plural(n) {
        if (n % 10 === 1 && n % 100 !== 11) return '';
        if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return 'а';
        return 'ов';
    }

    // ─────────────────────────────────────────────
    // Свайп вниз для закрытия
    // ─────────────────────────────────────────────
    _initSwipeClose() {
        const sheet = this._sheet;
        let startY = null;
        let currentY = null;
        let isDragging = false;

        const handle = sheet.querySelector('.search-sheet-handle');
        const dragTarget = handle || sheet;

        dragTarget.addEventListener('touchstart', e => {
            startY = e.touches[0].clientY;
            currentY = startY;
            isDragging = true;
        }, { passive: true });

        dragTarget.addEventListener('touchmove', e => {
            if (!isDragging) return;
            currentY = e.touches[0].clientY;
            const dy = currentY - startY;
            if (dy > 0) {
                sheet.style.transform = `translateY(${dy}px)`;
                sheet.style.transition = 'none';
            }
        }, { passive: true });

        dragTarget.addEventListener('touchend', () => {
            if (!isDragging) return;
            isDragging = false;
            const dy = currentY - startY;
            sheet.style.transform = '';
            sheet.style.transition = '';
            if (dy > 80) this.close();
        });
    }
}