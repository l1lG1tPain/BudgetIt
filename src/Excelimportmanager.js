// ExcelImportManager.js — быстрый импорт транзакций из Excel/CSV
// Подключается к transaction-sheet, добавляет таб «⚡ Залётом»
// Зависимости: SheetJS (xlsx), budgetManager, uiManager

export class ExcelImportManager {
    constructor(budgetManager, uiManager) {
        this.budgetManager = budgetManager;
        this.uiManager     = uiManager;
        this._xlsxLoaded   = false;
        this._pdfLoaded    = false;
        this._rows         = []; // спарсенные строки из файла
        this._headers      = [];
        this._detectedSource = null;

        // Метаданные последнего импорта — нужны для точного отката пачки в settings.js
        this._currentImportBatchId  = null;
        this._currentImportFileName = '';
        this._currentImportSource   = '';
        this._currentImportedAt     = '';
    }

    /* ────────────────────────────────────────────────
       1. Точка входа — вызывается из UIManager.initialize()
    ──────────────────────────────────────────────── */
    init() {
        this._injectChip();
        this._injectForm();
        this._bindChip();
        this._loadXlsx(); // подгружаем SheetJS лениво

        // Чип добавлен — форма откроется при явном нажатии пользователем
    }

    /* ────────────────────────────────────────────────
       2. Добавляем чип «⚡ Залётом» в transaction-type-chips
    ──────────────────────────────────────────────── */
    _injectChip() {
        const chips = document.querySelector('.transaction-type-chips');
        if (!chips || chips.querySelector('[data-type="excel-import"]')) return;

        const btn = document.createElement('button');
        btn.className    = 'chip-btn';
        btn.dataset.type = 'excel-import';
        btn.textContent  = '⚡ Залётом';
        btn.title        = 'Быстрый импорт из Excel / CSV / PDF';

        chips.prepend(btn);
    }

    /* ────────────────────────────────────────────────
       3. Инжектируем форму импорта в transaction-sheet
    ──────────────────────────────────────────────── */
    _injectForm() {
        const sheet = document.getElementById('transaction-sheet');
        if (!sheet || document.getElementById('excel-import-form')) return;

        const form = document.createElement('div');
        form.id        = 'excel-import-form';
        form.className = 'transaction-form hidden';
        form.innerHTML = this._formHTML();
        sheet.appendChild(form);

        this._bindFormEvents(form);
    }

    /* ────────────────────────────────────────────────
       4. HTML формы
    ──────────────────────────────────────────────── */
    _formHTML() {
        return `
      <div class="excel-import-wrap">

        <!-- Шаг 1: загрузка файла -->
        <div id="ei-step-upload" class="ei-step">

          <div class="ei-feature-banner">
            <div class="ei-feature-bg-glow"></div>

            <div class="ei-shark-frame">
              <img src="assets/akulka-transaction-hero.png" alt="Акулка" class="ei-shark-img">
            </div>

            <div class="ei-feature-text">
              <div class="ei-feature-title">⚡ Залётом</div>
              <div class="ei-feature-desc">
                Закинь выписку — Акулка распарсит платежи, определит доходы/расходы и подготовит транзакции.
              </div>

              <div class="ei-feature-tags">
                <span>Excel</span>
                <span>CSV</span>
                <span>PDF</span>
              </div>
            </div>
          </div>

          <div class="ei-instructions">
            <div class="ei-inst-title">📋 Как загрузить выписку?</div>
            <div class="ei-inst-body">
              <div class="ei-inst-sources">
                <div class="ei-inst-source">
                  <span class="ei-inst-icon">🏦</span>
                  <div>
                    <b>Click.uz / Payme / Uzcard</b>
                    <span>Личный кабинет → История → Экспорт в Excel/CSV</span>
                  </div>
                </div>
                <div class="ei-inst-source">
                  <span class="ei-inst-icon">💳</span>
                  <div>
                    <b>Сбер / Т-Банк / другие RU банки</b>
                    <span>Онлайн-банк → Выписка по счёту → Скачать PDF</span>
                  </div>
                </div>
                <div class="ei-inst-source">
                  <span class="ei-inst-icon">📊</span>
                  <div>
                    <b>PDF и Excel</b>
                    <span>Акулка сама определит формат — Сбер, Т-Банк, Click, Payme и другие. Просто закинь файл!</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <label class="ei-dropzone" for="ei-file-input">
            <span class="ei-drop-icon">📂</span>
            <span class="ei-drop-title">Выбери или перетащи файл</span>
            <span class="ei-drop-sub">.xlsx, .xls, .csv, .pdf</span>
            <input type="file" id="ei-file-input" accept=".xlsx,.xls,.csv,.pdf" style="display:none">
          </label>
          <div id="ei-file-name" class="ei-file-name hidden"></div>
          <div id="ei-upload-error" class="ei-error hidden"></div>

          <button type="button" id="ei-btn-cancel-upload" class="close-form">Закрыть</button>
        </div>

        <!-- Шаг 2: маппинг колонок + превью -->
        <div id="ei-step-map" class="ei-step hidden">
          <div id="ei-detected-source" class="ei-detected-source" style="display:none"></div>
          <div class="ei-section-title">Настрой колонки</div>
          <div class="ei-map-grid">
            <label class="ei-map-label">Дата</label>
            <select id="ei-col-date" class="ei-select"></select>

            <label class="ei-map-label">Сумма</label>
            <select id="ei-col-amount" class="ei-select"></select>

            <label class="ei-map-label">Тип транзакции</label>
            <select id="ei-col-type" class="ei-select">
              <option value="__sign" selected>Авто по знаку суммы (– расход / + доход)</option>
              <option value="__plusminus">Из колонки «+» / «–»</option>
              <option value="__income">Всё — Доходы</option>
              <option value="__expense">Всё — Расходы</option>
              <option value="__col">Из колонки (текст)</option>
            </select>

            <label class="ei-map-label" id="ei-type-col-label" style="display:none">Колонка типа</label>
            <select id="ei-col-type-src" class="ei-select" style="display:none"></select>

            <label class="ei-map-label">Категория (колонка или авто)</label>
            <select id="ei-col-cat" class="ei-select">
              <option value="__auto">Авто-определить</option>
            </select>

            <label class="ei-map-label">Описание / название</label>
            <select id="ei-col-desc" class="ei-select">
              <option value="__none">— не использовать —</option>
            </select>
          </div>
          <div class="ei-desc-hint">💡 Описание будет показано в списке доходов как название поступления</div>

          <div class="ei-section-title" style="margin-top:14px">
            Превью <span id="ei-preview-count"></span>
          </div>
          <div id="ei-preview-table-wrap" class="ei-preview-wrap">
            <table id="ei-preview-table" class="ei-preview-table"></table>
          </div>

          <div id="ei-map-error" class="ei-error hidden"></div>

          <div class="ei-actions">
            <button type="button" id="ei-btn-back" class="ei-btn-secondary">← Назад</button>
            <button type="button" id="ei-btn-import" class="ei-btn-primary">⚡ Импортировать</button>
          </div>
          <button type="button" id="ei-btn-cancel-map" class="ei-btn-close-link">✕ Отмена</button>
        </div>

        <!-- Шаг 3: результат -->
        <div id="ei-step-done" class="ei-step hidden">
          <div class="ei-done-icon">✅</div>
          <div id="ei-done-text" class="ei-done-text"></div>
          <button type="button" id="ei-btn-close" class="ei-btn-primary">Готово</button>
        </div>

      </div>
    `;
    }

    /* ────────────────────────────────────────────────
       5. Бинд клика по чипу
    ──────────────────────────────────────────────── */
    _bindChip() {
        document.addEventListener('click', e => {
            const btn = e.target.closest('[data-type="excel-import"]');
            if (!btn) return;

            document.querySelectorAll('.transaction-type-chips .chip-btn')
                .forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            if (this.uiManager?.hideAllForms) this.uiManager.hideAllForms();
            this._showStep('upload');
            document.getElementById('excel-import-form')?.classList.remove('hidden');
        });
    }

    /* ────────────────────────────────────────────────
       6. Обработка PDF-выписок
    ──────────────────────────────────────────────── */
    _handlePDF(file) {
        const nameEl = document.getElementById('ei-file-name');
        if (nameEl) {
            nameEl.textContent = `📄 ${file.name} (PDF)`;
            nameEl.classList.remove('hidden');
        }

        this._setCurrentImportMeta(
            this._createImportBatchMeta(file.name, 'PDF')
        );

        this._loadPdfJs((loadErr) => {
            if (loadErr) {
                this._showError('upload', loadErr.message);
                return;
            }

            const reader = new FileReader();

            reader.onload = async ev => {
                try {
                    const pdfjsLib = window['pdfjs-dist/build/pdf'];
                    pdfjsLib.GlobalWorkerOptions.workerSrc =
                        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

                    const pdfData = new Uint8Array(ev.target.result);
                    const pdfDoc = await pdfjsLib.getDocument({ data: pdfData }).promise;

                    let fullText = '';
                    const allTokens = [];

                    for (let p = 1; p <= pdfDoc.numPages; p++) {
                        const page = await pdfDoc.getPage(p);
                        const content = await page.getTextContent();
                        const viewport = page.getViewport({ scale: 1 });

                        fullText += content.items.map(i => i.str).join('\n') + '\n';

                        const pageOffset = (p - 1) * 10000;
                        for (const item of content.items) {
                            if (!item.str.trim()) continue;

                            allTokens.push({
                                str: item.str,
                                x: item.transform[4],
                                y: pageOffset + (viewport.height - item.transform[5]),
                            });
                        }
                    }

                    const parsed = this._parsePDFText(fullText, allTokens);

                    if (!parsed.length) {
                        this._showError('upload', 'Не удалось распознать транзакции в PDF. Попробуй Excel-выписку.');
                        return;
                    }

                    this._importParsedRows(parsed);
                } catch (err) {
                    this._showError('upload', 'Ошибка чтения PDF: ' + err.message);
                }
            };

            reader.onerror = () => {
                this._showError('upload', 'Не удалось прочитать PDF-файл. Попробуй выбрать файл ещё раз.');
            };

            reader.readAsArrayBuffer(file);
        });
    }

    _loadPdfJs(cb) {
        if (window['pdfjs-dist/build/pdf']) {
            this._pdfLoaded = true;
            cb(null);
            return;
        }

        const existingScript = document.querySelector('script[data-budgetit-pdfjs]');
        if (existingScript) {
            existingScript.addEventListener('load', () => {
                this._pdfLoaded = true;
                cb(null);
            }, { once: true });

            existingScript.addEventListener('error', () => {
                cb(new Error('Не удалось загрузить PDF-парсер. Проверь интернет и попробуй ещё раз.'));
            }, { once: true });

            return;
        }

        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        script.async = true;
        script.dataset.budgetitPdfjs = '1';

        script.onload = () => {
            this._pdfLoaded = true;
            cb(null);
        };

        script.onerror = () => {
            this._pdfLoaded = false;
            cb(new Error('Не удалось загрузить PDF-парсер. Проверь интернет и попробуй ещё раз.'));
        };

        document.head.appendChild(script);
    }

    /* ────────────────────────────────────────────────
       7. Парсинг PDF
    ──────────────────────────────────────────────── */
    _parsePDFText(text, tokens) {
        const formatters = [
            () => this._parseOzonBankPDF(text),
            () => this._parseSberPDF(text, tokens),
            () => this._parseTBankPDF(text, tokens),
            () => this._parseGenericBankPDF(text),
        ];

        for (const fn of formatters) {
            const result = fn();
            if (result.length > 0) return result;
        }

        return [];
    }

    _parseOzonBankPDF(text) {
        if (!/ОЗОН\s*Банк|Ozon\s*Bank|Справка о движении|движении денежных средств/i.test(text)) return [];

        const result = [];
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

        const AMT_RE = /^([+\-])\s*([\d][\d\s]*[.,]\d{2})\s*₽?$/;
        const DATE_RE = /^(\d{2})\.(\d{2})\.(\d{4})$/;

        let currentDate = null;
        let currentDesc = [];

        for (const line of lines) {
            const dm = DATE_RE.exec(line);
            if (dm) {
                currentDate = `${dm[3]}-${dm[2]}-${dm[1]}`;
                currentDesc = [];
                continue;
            }

            if (/^\d{2}:\d{2}:\d{2}$/.test(line) || /^\d{7,}$/.test(line)) continue;

            const am = AMT_RE.exec(line);
            if (am && currentDate) {
                const sign = am[1];
                const amount = parseFloat(am[2].replace(/\s/g, '').replace(',', '.'));
                if (isNaN(amount) || amount === 0) continue;

                const isIncome = sign === '+';
                const desc = currentDesc
                    .filter(l => !AMT_RE.test(l))
                    .join(' ')
                    .replace(/\s{2,}/g, ' ')
                    .replace(/\.\s*Без\s*НДС\.?/i, '')
                    .trim();

                const category = isIncome
                    ? this._mapOzonBankIncomeCategory(desc)
                    : this._mapOzonBankExpenseCategory(desc);

                result.push({
                    date: currentDate,
                    type: isIncome ? 'income' : 'expense',
                    amount,
                    category,
                    description: desc,
                });

                currentDesc = [];
                continue;
            }

            if (currentDate) currentDesc.push(line);
        }

        return result;
    }

    _mapOzonBankExpenseCategory(desc) {
        const d = (desc || '').toUpperCase();

        if (/OZON|ПЛАТФОРМ/i.test(d)) return '📦 Ozon';
        if (/СБП|СИСТЕМА БЫСТРЫХ/i.test(d)) return '🔄 Перевод СБП';
        if (/ПЕРЕВОД/i.test(d)) return '🔄 P2P переводы';

        return this._mapExpenseCategory(desc);
    }

    _mapOzonBankIncomeCategory(desc) {
        const d = (desc || '').toUpperCase();

        if (/KORONAPAY|КОРОНА/i.test(d)) return '💳 Зачисление (КоронаПей)';
        if (/СБП|СИСТЕМА БЫСТРЫХ/i.test(d)) return '🔄 Входящий перевод СБП';
        if (/ЗАЧИСЛЕНИЕ/i.test(d)) return '🔄 Зачисление на счёт';
        if (/OZON|ПЛАТФОРМ/i.test(d)) return '🔄 Возврат Ozon';
        if (/ПЕРЕВОД/i.test(d)) return '🔄 Входящий перевод';
        if (/ДОГ\.|ИР-|ОПЛАТА ЗА УСЛ/i.test(d)) return '💼 Оплата по договору';

        return this._mapIncomeCategory(desc);
    }

    _parseSberPDF(text, tokens) {
        if (!/Сбербанк|СберБанк|sberbank|Выписка по платёжному счёту/i.test(text)) return [];
        if (!tokens || !tokens.length) return [];

        const result = [];

        const Y_TOL = 5;
        const groups = [];

        for (const tok of tokens) {
            if (!tok.str?.trim()) continue;

            const group = groups.find(g => Math.abs(g.y - tok.y) <= Y_TOL);
            if (group) group.tokens.push(tok);
            else groups.push({ y: tok.y, tokens: [tok] });
        }

        groups.sort((a, b) => a.y - b.y);

        const X_DATE_MAX = 150;
        const X_DESC_MIN = 150;
        const X_AMT_MIN = 380;
        const X_AMT_MAX = 490;

        const AMT_RE = /^(\+)?([\d][\d\s]*,\d{2})$/;
        const DATE4 = /^(\d{2})\.(\d{2})\.(\d{4})$/;
        const AUTH_RE = /^\d{6,7}$/;
        const TIME_RE = /^\d{2}:\d{2}$/;

        const SKIP_TEXT = /^(Продолжение|Страница|Выписка|Заказано|ДАТА|КАТЕГОРИЯ|СУММА|ОСТАТОК|Описание|Расшифровка|ПАО |ул\.|Действителен|Для проверки|Зайдите|Нажмите|Получите|Предоставляя|Скачать|Проверить|Денежные|В выписке|Срок|По курсу|Согласно|900|www\.|Итого|Дата форм|Сертификат|Владелец|Действит)/i;

        const ops = [];
        let current = null;

        const flush = () => {
            if (current) {
                ops.push(current);
                current = null;
            }
        };

        for (const group of groups) {
            const toks = group.tokens.sort((a, b) => a.x - b.x);
            const lineText = toks.map(t => t.str).join(' ').trim();

            if (!lineText || SKIP_TEXT.test(lineText)) continue;

            const amtTok = toks.find(t =>
                t.x >= X_AMT_MIN &&
                t.x <= X_AMT_MAX &&
                AMT_RE.test(t.str.trim())
            );

            const dateTok = toks.find(t =>
                t.x < X_DATE_MAX &&
                DATE4.test(t.str.trim())
            );

            const authTok = toks.find(t => AUTH_RE.test(t.str.trim()));

            if (amtTok && authTok && dateTok) {
                flush();

                const dm = DATE4.exec(dateTok.str.trim());
                const date = `${dm[3]}-${dm[2]}-${dm[1]}`;

                const am = AMT_RE.exec(amtTok.str.trim());
                const amount = parseFloat(am[2].replace(/\s/g, '').replace(',', '.'));

                if (isNaN(amount) || amount === 0) {
                    current = null;
                    continue;
                }

                const catToks = toks.filter(t =>
                    t.x >= X_DESC_MIN &&
                    t.x < X_AMT_MIN &&
                    !AUTH_RE.test(t.str.trim()) &&
                    !TIME_RE.test(t.str.trim())
                );

                const categoryRaw = catToks.map(t => t.str).join(' ').trim();

                current = {
                    date,
                    isIncome: !!am[1],
                    amount,
                    categoryRaw,
                    desc: ''
                };

                continue;
            }

            if (current && !amtTok && !authTok) {
                const descToks = toks.filter(t => t.x >= X_DESC_MIN);
                const piece = descToks
                    .map(t => t.str)
                    .join(' ')
                    .replace(/\.\s*Операция по (карте|счету) \*+\d+/gi, '')
                    .trim();

                if (piece && !SKIP_TEXT.test(piece)) {
                    current.desc = (current.desc ? current.desc + ' ' : '') + piece;
                }
            }
        }

        flush();

        for (const op of ops) {
            const category = op.isIncome
                ? this._mapSberIncomeCategory(op.categoryRaw, op.desc)
                : this._mapSberExpenseCategory(op.categoryRaw, op.desc);

            result.push({
                date: op.date,
                type: op.isIncome ? 'income' : 'expense',
                amount: op.amount,
                category,
                description: op.desc
            });
        }

        return result;
    }

    _parseTBankPDF(text, tokens) {
        if (!/Выписка по договору|T-Банк|Т-Банк|тинькофф|tinkoff/i.test(text)) return [];
        if (!tokens || !tokens.length) return [];

        const Y_TOL = 3;
        const groups = [];
        for (const tok of tokens) {
            if (!tok.str.trim()) continue;
            const g = groups.find(g => Math.abs(g.y - tok.y) <= Y_TOL);
            if (g) g.tokens.push(tok);
            else groups.push({ y: tok.y, tokens: [tok] });
        }
        groups.sort((a, b) => a.y - b.y);

        const X_OP_MAX = 100;
        const X_DESC_MIN = 200;
        const X_AMT_MIN = 380;
        const X_AMT_MAX = 480;

        const DATE2 = /^(\d{2})\.(\d{2})\.(\d{2})(?:\s+\d{2}:\d{2})?$/;
        const AMT_RE = /^([+\-])?\s*([\d][\d\s]*\.\d{2})\s*₽\s*$/;
        const SKIP = /^(Расходы:|Поступления|Баланс|Кэшбэк|Операции по карте|Дата и время|Дата обработки|Сумма|Описание в валюте|ЦВЕТИКОВА|Выписка по договору|—|•)/i;

        const ops = [];
        let cur = null;
        const flush = () => { if (cur && cur.amount != null) ops.push(cur); cur = null; };

        for (const grp of groups) {
            const toks = grp.tokens.sort((a, b) => a.x - b.x);
            const lineText = toks.map(t => t.str).join(' ').trim();
            if (SKIP.test(lineText)) continue;

            const amtTok = toks.find(t => t.x >= X_AMT_MIN && t.x <= X_AMT_MAX && AMT_RE.test(t.str.trim()));
            const dateTok = toks.find(t => t.x < X_OP_MAX && DATE2.test(t.str.trim()));
            const descToks = toks.filter(t => t.x >= X_DESC_MIN && t.x < X_AMT_MIN);
            const descRaw = tbClean(descToks.map(t => t.str).join(' '));

            if (dateTok && amtTok) {
                flush();
                const m = AMT_RE.exec(amtTok.str.trim());
                const amount = parseFloat(m[2].replace(/\s/g, ''));
                if (isNaN(amount) || amount === 0) continue;
                cur = { date: tbDate(dateTok.str), amount, isIncome: (m[1] || '') === '+', desc: descRaw };
                continue;
            }

            if (dateTok && !amtTok) {
                flush();
                cur = { date: tbDate(dateTok.str), amount: null, isIncome: false, desc: descRaw };
                continue;
            }

            if (amtTok && !dateTok && cur && cur.amount == null) {
                const m = AMT_RE.exec(amtTok.str.trim());
                const amount = parseFloat(m[2].replace(/\s/g, ''));
                if (!isNaN(amount) && amount !== 0) {
                    cur.amount = amount;
                    cur.isIncome = (m[1] || '') === '+';
                    if (descRaw) cur.desc += (cur.desc ? ' ' : '') + descRaw;
                }
                continue;
            }

            if (cur && !amtTok && !dateTok) {
                const piece = tbClean(toks.filter(t => t.x < X_AMT_MIN).map(t => t.str).join(' '));
                if (/\+7\d{10}/.test(piece)) cur._hasPhone = true;
                if (piece && !SKIP.test(piece)) cur.desc += (cur.desc ? ' ' : '') + piece;
            }
        }
        flush();

        const result = [];
        for (const op of ops) {
            if (!op.date || op.amount == null) continue;
            const isIncome = op.isIncome && !op._hasPhone && !/Внешний перевод по номеру телефона/i.test(op.desc);
            const category = isIncome
                ? this._mapTBankIncomeCategory(op.desc)
                : this._mapExpenseCategory(op.desc);
            result.push({ date: op.date, type: isIncome ? 'income' : 'expense', amount: op.amount, category, description: op.desc });
        }
        return result;

        function tbDate(str) {
            const m = /^(\d{2})\.(\d{2})\.(\d{2})/.exec(str.trim());
            return m ? `20${m[3]}-${m[2]}-${m[1]}` : null;
        }
        function tbClean(str) {
            return str
                .replace(/^Оплата в\s+/i, '')
                .replace(/\s+(SANKT-PETERBU|PETERBU|MOSKVA|MOSCOW)\s+RUS\s*$/i, '')
                .replace(/\s+SANKT-\s*$/i, '')
                .replace(/\bPETERBU\s*RUS\s*$/i, '')
                .replace(/\bPETERBU\s*$/i, '')
                .replace(/\bRUS\s*$/i, '')
                .replace(/\s{2,}/g, ' ')
                .trim();
        }
    }

    _parseGenericBankPDF(text) {
        const result = [];
        const lines = text.split('\n');

        const DATE_RE = /(\d{2}[.\/-]\d{2}[.\/-]\d{2,4})/;
        const AMT_RE = /([+\-])?\s*([\d\s]+[.,]\d{2})\s*[₽$€]?/;

        for (const line of lines) {
            const dm = DATE_RE.exec(line);
            const am = AMT_RE.exec(line);
            if (!dm || !am) continue;

            const date = this._parseDate(dm[1]);
            if (!date) continue;

            const sign = am[1];
            const amount = parseFloat(am[2].replace(/\s/g, '').replace(',', '.'));
            if (isNaN(amount) || amount === 0) continue;

            const isIncome = sign === '+';
            const desc = line.replace(dm[0], '').replace(am[0], '').trim();
            const category = isIncome
                ? this._mapIncomeCategory(desc)
                : this._mapExpenseCategory(desc);

            result.push({ date, type: isIncome ? 'income' : 'expense', amount, category, description: desc });
        }

        return result;
    }

    _mapSberExpenseCategory(sberCat, desc) {
        const c = (sberCat || '').toLowerCase();

        const catMap = {
            'рестораны и кафе': '🍽️ Кафе и рестораны',
            'супермаркеты': '🥦 Продукты',
            'транспорт': '🚇 Транспорт',
            'одежда и аксессуары': '👗 Одежда',
            'развлечения': '🎮 Развлечения',
            'красота и здоровье': '💄 Красота',
            'аптеки': '💊 Аптека и здоровье',
            'медицина': '🏥 Медицина',
            'связь': '📱 Мобильная связь',
            'топливо': '⛽ Топливо',
            'жкх': '🏠 Коммунальные услуги',
            'такси': '🚕 Такси',
            'образование': '📚 Образование',
            'страхование': '🛡️ Страхование',
            'путешествия': '✈️ Путешествия',
            'перевод с карты': '🔄 Перевод',
            'оплата по qr–коду сбп': '💳 Оплата QR',
            'прочие операции': '🗿 Прочее',
        };

        for (const [key, val] of Object.entries(catMap)) {
            if (c.includes(key)) return val;
        }

        return this._mapExpenseCategory(desc);
    }

    _mapSberIncomeCategory(sberCat, desc) {
        const c = (sberCat || '').toLowerCase();
        const d = (desc || '').toLowerCase();

        if (c.includes('перевод сбп') || d.includes('перевод от')) return '🔄 Входящий перевод СБП';
        if (d.includes('заработная плата') || d.includes('зарплата')) return '💰 Зарплата';
        if (c.includes('прочие') && d.includes('зарплат')) return '💰 Зарплата';
        if (d.includes('кэшбэк') || d.includes('cashback')) return '💳 Кэшбэк';
        if (c.includes('прочие')) return '🔮 Загадочное поступление';

        return this._mapIncomeCategory(desc);
    }

    _mapTBankIncomeCategory(desc) {
        const d = (desc || '').toLowerCase();

        if (/кэшбэк/i.test(d)) return '💳 Кэшбэк';
        if (/пополнение.*сбербанк|сбер/i.test(d)) return '🔄 Входящий перевод';
        if (/пополнение.*быстрых платеж|пополнение.*сбп/i.test(d)) return '🔄 Входящий перевод СБП';
        if (/пополнение.*avosend|avosend/i.test(d)) return '💰 Зарплата';
        if (/пополнение/i.test(d)) return '🔄 Пополнение счёта';

        return this._mapIncomeCategory(desc);
    }

    _parseDateDMY(raw) {
        if (!raw) return null;
        const m = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
        if (m) return `${m[3]}-${m[2]}-${m[1]}`;
        return this._parseDate(raw);
    }

    /* ────────────────────────────────────────────────
       8. Метаданные пачки импорта
    ──────────────────────────────────────────────── */
    _createImportBatchMeta(fileName = '', sourceName = '') {
        const now = new Date();

        return {
            importBatchId : `import_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`,
            importFileName: fileName || 'unknown_file',
            importSource  : sourceName || 'unknown',
            importedAt    : now.toISOString()
        };
    }

    _setCurrentImportMeta(meta) {
        this._currentImportBatchId  = meta?.importBatchId || null;
        this._currentImportFileName = meta?.importFileName || '';
        this._currentImportSource   = meta?.importSource || 'unknown';
        this._currentImportedAt     = meta?.importedAt || new Date().toISOString();
    }

    _applyImportMeta(tx, fallbackSource = '') {
        return {
            ...tx,
            importBatchId : this._currentImportBatchId,
            importFileName: this._currentImportFileName,
            importSource  : this._currentImportSource || fallbackSource || 'unknown',
            importedAt    : this._currentImportedAt || new Date().toISOString()
        };
    }

    /* ────────────────────────────────────────────────
       9. Прямой импорт распарсенных строк — PDF
    ──────────────────────────────────────────────── */
    _importParsedRows(parsed) {
        let imported = 0;
        let skipped = 0;

        for (const row of parsed) {
            if (!row.date || !row.amount) {
                skipped++;
                continue;
            }

            let tx = {
                id: Date.now() * 1000 + imported,
                type: row.type,
                date: row.date,
                category: row.category,
                amount: row.amount,
            };

            if (row.type === 'expense') {
                tx.products = [{
                    name: row.description || row.category,
                    quantity: 1,
                    price: row.amount,
                }];
            }

            if (row.type === 'income' && row.description) {
                tx.name = row.description;
            }

            tx = this._applyImportMeta(tx, 'PDF');

            this.budgetManager.addTransaction(tx);
            imported++;
        }

        if (this.uiManager?.updateUI) this.uiManager.updateUI();

        const incomeCount = parsed.filter(r => r.type === 'income').length;
        const expenseCount = parsed.filter(r => r.type === 'expense').length;

        const doneText = document.getElementById('ei-done-text');
        if (doneText) {
            doneText.innerHTML = `
              <strong>Импортировано: ${imported}</strong><br>
              💚 Доходов: ${incomeCount} &nbsp; 🔴 Расходов: ${expenseCount}<br>
              <small>
                Пачка: ${this._currentImportSource || 'PDF'}
                ${this._currentImportFileName ? ` · ${this._currentImportFileName}` : ''}
              </small>
              ${skipped > 0 ? `<br><small>Пропущено: ${skipped}</small>` : ''}
            `;
        }

        this._showStep('done');

        if (typeof window.trackSafe === 'function') {
            trackSafe('pdf-import', {
                imported,
                skipped,
                importBatchId: this._currentImportBatchId,
                importFileName: this._currentImportFileName,
                importSource: this._currentImportSource
            });
        }
    }

    /* ────────────────────────────────────────────────
       10. Ленивая загрузка SheetJS
    ──────────────────────────────────────────────── */
    _loadXlsx(onReady = null, onError = null) {
        if (window.XLSX) {
            this._xlsxLoaded = true;
            if (typeof onReady === 'function') onReady();
            return;
        }

        const existingScript = document.querySelector('script[data-budgetit-xlsx]');
        if (existingScript) {
            existingScript.addEventListener('load', () => {
                this._xlsxLoaded = true;
                if (typeof onReady === 'function') onReady();
            }, { once: true });

            existingScript.addEventListener('error', () => {
                const msg = 'Не удалось загрузить библиотеку Excel. Проверь интернет и попробуй ещё раз.';
                this._showError('upload', msg);
                if (typeof onError === 'function') onError(new Error(msg));
            }, { once: true });

            return;
        }

        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        script.async = true;
        script.dataset.budgetitXlsx = '1';

        script.onload = () => {
            this._xlsxLoaded = true;
            if (typeof onReady === 'function') onReady();
        };

        script.onerror = () => {
            this._xlsxLoaded = false;
            const msg = 'Не удалось загрузить библиотеку Excel. Проверь интернет и попробуй ещё раз.';
            this._showError('upload', msg);
            if (typeof onError === 'function') onError(new Error(msg));
        };

        document.head.appendChild(script);
    }

    /* ────────────────────────────────────────────────
       11. События внутри формы
    ──────────────────────────────────────────────── */
    _bindFormEvents(form) {
        form.querySelector('#ei-btn-cancel-upload')?.addEventListener('click', () => {
            if (this.uiManager?.closeModal) this.uiManager.closeModal('transaction-sheet');
            else document.getElementById('excel-import-form')?.classList.add('hidden');
        });

        form.querySelector('#ei-btn-cancel-map')?.addEventListener('click', () => {
            if (this.uiManager?.closeModal) this.uiManager.closeModal('transaction-sheet');
            else document.getElementById('excel-import-form')?.classList.add('hidden');
        });

        form.addEventListener('change', e => {
            if (e.target.id === 'ei-file-input') this._handleFile(e.target.files[0]);
        });

        const dropzone = form.querySelector('.ei-dropzone');
        dropzone?.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('ei-drag-over'); });
        dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('ei-drag-over'));
        dropzone?.addEventListener('drop', e => {
            e.preventDefault();
            dropzone.classList.remove('ei-drag-over');
            const file = e.dataTransfer?.files[0];
            if (file) this._handleFile(file);
        });

        form.addEventListener('change', e => {
            if (e.target.id === 'ei-col-type') this._toggleTypeColVisibility();
            if (['ei-col-date', 'ei-col-amount', 'ei-col-type', 'ei-col-type-src', 'ei-col-cat', 'ei-col-desc'].includes(e.target.id)) {
                this._renderPreview();
            }
        });

        form.querySelector('#ei-btn-back')?.addEventListener('click', () => {
            this._rows = [];
            this._showStep('upload');
            form.querySelector('#ei-file-input').value = '';
            form.querySelector('#ei-file-name')?.classList.add('hidden');
        });

        form.querySelector('#ei-btn-import')?.addEventListener('click', () => this._doImport());

        form.querySelector('#ei-btn-close')?.addEventListener('click', () => {
            if (this.uiManager?.closeModal) this.uiManager.closeModal('transaction-sheet');
        });
    }

    /* ────────────────────────────────────────────────
       12. Парсинг файла Excel / CSV / PDF
    ──────────────────────────────────────────────── */
    _handleFile(file) {
        if (!file) return;

        const allowed = ['.xlsx', '.xls', '.csv', '.pdf'];
        const ext = '.' + file.name.split('.').pop().toLowerCase();

        if (!allowed.includes(ext)) {
            this._showError('upload', 'Поддерживаются .xlsx, .xls, .csv и .pdf');
            return;
        }

        this._showError('upload', '');

        if (ext === '.pdf') {
            this._handlePDF(file);
            return;
        }

        const nameEl = document.getElementById('ei-file-name');
        if (nameEl) {
            nameEl.textContent = `📄 ${file.name}`;
            nameEl.classList.remove('hidden');
        }

        this._setCurrentImportMeta(
            this._createImportBatchMeta(file.name, ext.replace('.', '').toUpperCase())
        );

        if (!window.XLSX) {
            this._showError('upload', 'Библиотека Excel загружается, файл обработается автоматически через секунду...');

            this._loadXlsx(
                () => {
                    this._showError('upload', '');
                    this._handleFile(file);
                },
                (err) => {
                    this._showError('upload', err.message);
                }
            );

            return;
        }

        const reader = new FileReader();

        reader.onload = ev => {
            try {
                const XLSX = window.XLSX;

                let wb;
                if (ext === '.csv') {
                    const text = new TextDecoder('utf-8').decode(ev.target.result);
                    wb = XLSX.read(text, { type: 'string' });
                } else {
                    wb = XLSX.read(ev.target.result, { type: 'array' });
                }

                const ws = wb.Sheets[wb.SheetNames[0]];
                const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

                if (!raw || raw.length < 2) {
                    this._showError('upload', 'Файл пустой или неверный формат');
                    return;
                }

                let hIdx = raw.findIndex(r => r.some(c => String(c).trim() !== ''));
                if (hIdx < 0) hIdx = 0;

                const headers = raw[hIdx].map((h, i) => String(h || `Колонка ${i + 1}`).trim());
                const dataRows = raw.slice(hIdx + 1).filter(r => r.some(c => String(c).trim() !== ''));

                this._rows = dataRows;
                this._headers = headers;

                this._detectedSource = this._detectSource(headers, dataRows);

                if (this._detectedSource?.name) {
                    this._currentImportSource = this._detectedSource.name;
                }

                this._populateSelects(headers);
                this._autoDetectColumns(headers);
                this._toggleTypeColVisibility();
                this._renderPreview();
                this._showStep('map');

                const srcEl = document.getElementById('ei-detected-source');
                if (srcEl && this._detectedSource) {
                    srcEl.textContent = `${this._detectedSource.icon} Формат: ${this._detectedSource.name}`;
                    srcEl.style.display = '';
                }

                this._showError('upload', '');
            } catch (err) {
                this._showError('upload', 'Ошибка чтения файла: ' + err.message);
            }
        };

        reader.onerror = () => {
            this._showError('upload', 'Не удалось прочитать файл. Попробуй выбрать его ещё раз.');
        };

        reader.readAsArrayBuffer(file);
    }

    /* ────────────────────────────────────────────────
       13. Заполнение селектов колонками
    ──────────────────────────────────────────────── */
    _populateSelects(headers) {
        const colOption = (h, i) => `<option value="${i}">${this._escapeHTML(h)}</option>`;
        const cols = headers.map(colOption).join('');

        const dateEl = document.getElementById('ei-col-date');
        const amtEl = document.getElementById('ei-col-amount');
        const typeSrcEl = document.getElementById('ei-col-type-src');
        const catEl = document.getElementById('ei-col-cat');
        const descEl = document.getElementById('ei-col-desc');

        if (dateEl) dateEl.innerHTML = cols;
        if (amtEl) amtEl.innerHTML = cols;
        if (typeSrcEl) typeSrcEl.innerHTML = cols;
        if (catEl) catEl.innerHTML = `<option value="__auto">Авто-определить</option>` + cols;
        if (descEl) descEl.innerHTML = `<option value="__none">— не использовать —</option>` + cols;
    }

    /* ────────────────────────────────────────────────
       14. Авто-угадывание колонок
    ──────────────────────────────────────────────── */
    _autoDetectColumns(headers) {
        const guess = (keywords) => {
            const idx = headers.findIndex(h =>
                keywords.some(k => String(h || '').toLowerCase().includes(k.toLowerCase()))
            );
            return idx >= 0 ? String(idx) : null;
        };

        const dateEl = document.getElementById('ei-col-date');
        const amtEl = document.getElementById('ei-col-amount');
        const typeEl = document.getElementById('ei-col-type');
        const typeSrcEl = document.getElementById('ei-col-type-src');
        const catEl = document.getElementById('ei-col-cat');
        const descEl = document.getElementById('ei-col-desc');

        if (!dateEl || !amtEl || !typeEl || !typeSrcEl || !catEl || !descEl) return;

        dateEl.value = guess(['дата', 'date', 'время', 'time', 'день', 'day', 'sana', 'дата платежа', 'operation date', 'transaction date', 'processed']) ?? '0';
        amtEl.value = guess(['сумм', 'amount', 'деньг', 'money', 'sum', 'руб', 'uzs', 'цена', 'price', 'miqdor', 'summa', 'debit', 'credit', 'withdrawal', 'deposit amount']) ?? '1';

        const descIdx = guess(['назначен', 'сервис', 'описан', 'наименован', 'поставщик', 'service', 'description', 'note', 'comment', 'товар', 'merchant', 'имя', 'xizmat', 'nomi', 'imя поставщика', 'details', 'narration', 'reference']);
        descEl.value = descIdx ?? '__none';

        const catIdx = guess(['катег', 'categor', 'вид']);
        catEl.value = catIdx ?? '__auto';

        const typeColIdx = guess(['тип опер', 'тип тран', 'operation', 'type', 'тип']);
        if (typeColIdx !== null) {
            const sampleValues = this._rows.slice(0, 20)
                .map(r => String(r[parseInt(typeColIdx)] ?? '').trim());
            const hasPlusMinus = sampleValues.some(v => v === '+' || v === '-');
            const hasTextType = sampleValues.some(v =>
                /поступлен|списан|зачислен|приход|расход|income|expense|debit|credit/i.test(v)
            );

            if (hasPlusMinus) {
                typeEl.value = '__plusminus';
                typeSrcEl.value = typeColIdx;
                this._toggleTypeColVisibility();
                return;
            }

            if (hasTextType) {
                typeEl.value = '__col';
                typeSrcEl.value = typeColIdx;
                this._toggleTypeColVisibility();
                return;
            }
        }

        const sampleAmounts = this._rows.slice(0, 20)
            .map(r => this._parseAmount(r[parseInt(amtEl.value)]))
            .filter(n => !isNaN(n));

        const hasNegative = sampleAmounts.some(n => n < 0);
        typeEl.value = hasNegative ? '__sign' : '__expense';
    }

    /* ────────────────────────────────────────────────
       15. Показ/скрытие колонки типа
    ──────────────────────────────────────────────── */
    _toggleTypeColVisibility() {
        const typeVal = document.getElementById('ei-col-type')?.value;
        const label = document.getElementById('ei-type-col-label');
        const srcSelect = document.getElementById('ei-col-type-src');
        const needsCol = typeVal === '__col' || typeVal === '__plusminus';

        if (label) {
            label.style.display = needsCol ? '' : 'none';
            label.textContent = typeVal === '__plusminus'
                ? 'Колонка со знаком (+ / –)'
                : 'Колонка типа';
        }

        if (srcSelect) srcSelect.style.display = needsCol ? '' : 'none';
    }

    /* ────────────────────────────────────────────────
       16. Превью таблицы
    ──────────────────────────────────────────────── */
    _renderPreview() {
        const table = document.getElementById('ei-preview-table');
        const countEl = document.getElementById('ei-preview-count');
        if (!table) return;

        const parsed = this._parseRows();
        if (countEl) countEl.textContent = `(${parsed.length} транзакций)`;

        const preview = parsed.slice(0, 10);

        table.innerHTML = `
          <thead>
            <tr>
              <th>Дата</th><th>Тип</th><th>Категория</th><th>Сумма</th><th>Описание</th>
            </tr>
          </thead>
          <tbody>
            ${preview.map(r => `
              <tr class="ei-preview-row ei-type-${this._escapeHTML(r.type)}">
                <td>${this._escapeHTML(r.date || '?')}</td>
                <td>${r.type === 'income' ? '💚 Доход' : '🔴 Расход'}</td>
                <td>${this._escapeHTML(r.category)}</td>
                <td>${this._fmtNum(r.amount)}</td>
                <td class="ei-desc-cell">${this._escapeHTML(r.description || '—')}</td>
              </tr>
            `).join('')}
            ${parsed.length > 10 ? `<tr><td colspan="5" class="ei-more-rows">... и ещё ${parsed.length - 10} строк</td></tr>` : ''}
          </tbody>
        `;
    }

    /* ────────────────────────────────────────────────
       17. Парсинг строк по текущим настройкам маппинга
    ──────────────────────────────────────────────── */
    _parseRows() {
        if (!this._rows?.length) return [];

        const colDate = parseInt(document.getElementById('ei-col-date')?.value ?? 0);
        const colAmount = parseInt(document.getElementById('ei-col-amount')?.value ?? 1);
        const typeMode = document.getElementById('ei-col-type')?.value ?? '__sign';
        const colTypeSrc = parseInt(document.getElementById('ei-col-type-src')?.value ?? 0);
        const colCat = document.getElementById('ei-col-cat')?.value ?? '__auto';
        const colDesc = document.getElementById('ei-col-desc')?.value ?? '__none';

        const result = [];

        for (const row of this._rows) {
            const rawDate = String(row[colDate] ?? '').trim();
            const rawAmount = row[colAmount];
            if (!rawDate || rawAmount === '' || rawAmount == null) continue;

            const date = this._parseDate(rawDate);
            if (!date) continue;

            const amount = this._parseAmount(rawAmount);
            if (isNaN(amount) || amount === 0) continue;

            let type;
            if (typeMode === '__sign') {
                type = amount < 0 ? 'expense' : 'income';
            } else if (typeMode === '__plusminus') {
                const sign = String(row[colTypeSrc] ?? '').trim();
                type = sign === '+' ? 'income' : 'expense';
            } else if (typeMode === '__income') {
                type = 'income';
            } else if (typeMode === '__expense') {
                type = 'expense';
            } else if (typeMode === '__col') {
                const raw = String(row[colTypeSrc] ?? '').toLowerCase();
                type = this._detectTypeFromString(raw);
            } else {
                type = amount < 0 ? 'expense' : 'income';
            }

            const absAmount = Math.abs(amount);

            let category;
            const description = colDesc !== '__none' ? String(row[colDesc] ?? '').trim() : '';

            if (colCat === '__auto') {
                category = type === 'income'
                    ? this._mapIncomeCategory(description)
                    : this._mapExpenseCategory(description);
            } else {
                const rawCat = String(row[colCat] ?? '').trim();
                const mappedFromDesc = description
                    ? (type === 'income'
                        ? this._mapIncomeCategory(description)
                        : this._mapExpenseCategory(description))
                    : null;
                const mappedFromCat = this._mapPaymeCategory(rawCat, type);
                const descIsGeneric = !mappedFromDesc
                    || mappedFromDesc === '🗿 Прочее'
                    || mappedFromDesc === '🔮 Загадочное поступление';

                category = (!descIsGeneric ? mappedFromDesc : null)
                    || mappedFromCat
                    || rawCat
                    || (type === 'income' ? '💰 Прочие доходы' : '🗿 Прочее');
            }

            result.push({ date, type, category, amount: absAmount, description });
        }

        return result;
    }

    /* ────────────────────────────────────────────────
       18. Непосредственный импорт транзакций
    ──────────────────────────────────────────────── */
    _doImport() {
        const parsed = this._parseRows();

        if (!parsed.length) {
            this._showError('map', 'Нет строк для импорта — проверь настройки колонок');
            return;
        }

        this._showError('map', '');

        let imported = 0;
        let skipped = 0;

        for (const row of parsed) {
            if (!row.date || !row.amount) {
                skipped++;
                continue;
            }

            let tx = {
                id: Date.now() + imported,
                type: row.type,
                date: row.date,
                category: row.category,
                amount: row.amount,
            };

            if (row.type === 'expense') {
                tx.products = [{
                    name: row.description || row.category,
                    quantity: 1,
                    price: row.amount
                }];
            }

            if (row.type === 'income' && row.description) {
                tx.name = row.description;
            }

            tx = this._applyImportMeta(
                tx,
                this._detectedSource?.name || 'Excel/CSV'
            );

            this.budgetManager.addTransaction(tx);
            imported++;
        }

        if (this.uiManager?.updateUI) this.uiManager.updateUI();

        const doneText = document.getElementById('ei-done-text');
        if (doneText) {
            doneText.innerHTML = `
                <strong>Импортировано: ${imported}</strong><br>
                <small>
                    Пачка: ${this._currentImportSource || this._detectedSource?.name || 'Excel/CSV'}
                    ${this._currentImportFileName ? ` · ${this._currentImportFileName}` : ''}
                </small>
                ${skipped > 0 ? `<br><small>Пропущено: ${skipped}</small>` : ''}
            `;
        }
        this._showStep('done');

        if (typeof window.trackSafe === 'function') {
            trackSafe('excel-import', {
                imported,
                skipped,
                importBatchId: this._currentImportBatchId,
                importFileName: this._currentImportFileName,
                importSource: this._currentImportSource || this._detectedSource?.name || 'Excel/CSV'
            });
        }
    }

    /* ────────────────────────────────────────────────
       19. Вспомогательные методы
    ──────────────────────────────────────────────── */
    _showStep(step) {
        ['upload', 'map', 'done'].forEach(s => {
            document.getElementById(`ei-step-${s}`)?.classList.toggle('hidden', s !== step);
        });
    }

    _showError(area, msg) {
        const el = document.getElementById(`ei-${area}-error`);
        if (!el) return;
        el.textContent = msg || '';
        el.classList.toggle('hidden', !msg);
    }

    _detectSource(headers, rows) {
        const h = headers.join('|').toLowerCase();

        // ── По заголовкам ──────────────────────────────────────────
        if (h.includes('дата платежа') && h.includes('имя поставщика')) return { name: 'Payme', icon: '🟢' };
        if (h.includes('процессинг') && h.includes('сумма кэшбека'))    return { name: 'Click', icon: '🔵' };
        if (h.includes('uzcard'))                                         return { name: 'Uzcard', icon: '🟡' };
        if (h.includes('uzum bank') || h.includes('uzumbank'))           return { name: 'Uzum Bank', icon: '🟠' };
        if (h.includes('kapitalbank') || h.includes('капитал банк'))     return { name: 'Kapitalbank', icon: '🔷' };
        if (h.includes('ipak yuli') || h.includes("ipak yo'li"))        return { name: 'Ipak Yuli', icon: '🏦' };
        if (h.includes('tbc') && (h.includes('сумма') || h.includes('amount'))) return { name: 'TBC UZ', icon: '🔴' };
        if (h.includes('xalq bank') || h.includes('xalqbank'))           return { name: 'Xalq Bank', icon: '🏦' };
        if (h.includes('asaka') || h.includes('асака'))                  return { name: 'Asaka Bank', icon: '🏦' };
        if (h.includes('transaction') && h.includes('amount'))           return { name: 'Visa/MC', icon: '💳' };
        if (h.includes('date') && h.includes('debit') && h.includes('credit')) return { name: 'Международный формат', icon: '💳' };

        // ── По содержимому первых строк ────────────────────────────
        const sample = (rows.slice(0, 3)).map(r => (r || []).join('|')).join('|').toLowerCase();
        if (sample.includes('payme'))     return { name: 'Payme', icon: '🟢' };
        if (sample.includes('click.uz') || sample.includes('click uz')) return { name: 'Click', icon: '🔵' };
        if (sample.includes('uzum'))      return { name: 'Uzum Bank', icon: '🟠' };
        if (sample.includes('tbc'))       return { name: 'TBC UZ', icon: '🔴' };
        if (sample.includes('humo'))      return { name: 'Humo', icon: '🟡' };

        return { name: 'Excel/CSV', icon: '📄' };
    }

    _parseDate(raw) {
        if (raw == null || raw === '') return null;

        if (raw instanceof Date && !isNaN(raw.getTime())) {
            return this._formatDateLocal(raw);
        }

        const value = String(raw).trim();

        if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);

        const dmy = value.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/);
        if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;

        const dmyShort = value.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2})/);
        if (dmyShort) return `20${dmyShort[3]}-${dmyShort[2].padStart(2, '0')}-${dmyShort[1].padStart(2, '0')}`;

        const serial = parseFloat(value);
        if (!isNaN(serial) && serial > 10000) {
            const excelEpoch = new Date(1899, 11, 30);
            const d = new Date(excelEpoch.getTime() + serial * 86400000);
            if (!isNaN(d.getTime())) return this._formatDateLocal(d);
        }

        const d = new Date(value);
        if (!isNaN(d.getTime())) return this._formatDateLocal(d);

        return null;
    }

    _formatDateLocal(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    _parseAmount(value) {
        if (value == null || value === '') return NaN;

        if (typeof value === 'number') return value;

        let raw = String(value)
            .replace(/\s/g, '')
            .replace(/[₽$€₸]/g, '')
            .replace(/UZS|RUB|KZT|USD|EUR|сум|so'm|sum/gi, '')
            .replace(',', '.')
            .trim();

        const isWrappedNegative = /^\(.+\)$/.test(raw);
        raw = raw.replace(/[()]/g, '');

        const number = parseFloat(raw);

        if (isNaN(number)) return NaN;

        return isWrappedNegative ? -Math.abs(number) : number;
    }

    _detectTypeFromString(str) {
        const s = (str || '').toLowerCase().trim();

        if (s === '+') return 'income';
        if (/поступлен|зачислен|доход|income|приход|пополн|получ|credit|kirim|tushum|daromad/.test(s)) return 'income';

        if (s === '-') return 'expense';
        if (/списан|расход|expense|debit|платёж|оплат|chiqim|xarajat|to'lov/.test(s)) return 'expense';

        return 'expense';
    }

    _escapeHTML(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

/**
     * Маппинг категорий из банковских выписок (Payme, Click и др.)
     * Принимает короткое слово ("такси", "продукты", "перевод") → иконка+название
     * Возвращает null если категория неизвестна (тогда идём дальше по цепочке)
     */
    _mapPaymeCategory(rawCat, type) {
        if (!rawCat) return null;
        const c = rawCat.toLowerCase().trim();

        // ── Расходные категории Payme ──
        const expenseMap = {
            'такси':        '🚕 Такси',
            'транспорт':    '🚇 Транспорт',
            'продукты':     '🛒 Продукты',
            'общепит':      '🍽️ Кафе и рестораны',
            'ресторан':     '🍽️ Кафе и рестораны',
            'кафе':         '☕ Кофе и кафе',
            'здоровье':     '💊 Аптека и здоровье',
            'медицина':     '🏥 Медицина',
            'интернет':     '🌐 Интернет',
            'телефон':      '📱 Мобильная связь',
            'связь':        '📱 Мобильная связь',
            'ком. услуги':  '🏠 Коммунальные услуги',
            'коммуналка':   '🏠 Коммунальные услуги',
            'налоги':       '🏛️ Налоги и госплатежи',
            'кредит':       '🏦 Кредит',
            'кредиты':      '🏦 Кредит',
            'наличные':     '🏧 Снятие наличных',
            'одежда':       '👗 Одежда',
            'образование':  '📚 Образование',
            'развлечения':  '🎮 Развлечения',
            'спорт':        '⚽ Спорт',
            'красота':      '💄 Красота',
            'питомцы':      '🐾 Животные',
            'телевидение':  '📺 Телевидение',
            'страхование':  '🛡️ Страхование',
            'путешествия':  '✈️ Путешествия',
            'отель':        '🏨 Отель',
            'авто':         '🚗 Авто',
            'топливо':      '⛽ Топливо',
            'электрон':     '💻 Электроника',
            'услуги':       '🔧 Услуги',
            'подписки':     '📺 Подписки',
        };

        // ── Категории переводов (и доходы, и расходы) ──
        if (c === 'перевод' || c === 'переводы') {
            return type === 'income' ? '🔄 Перевод на карту' : '🔄 P2P переводы';
        }
        if (c === 'прочее' || c === 'другое' || c === 'other') {
            return type === 'income' ? '🔮 Прочие поступления' : '🗿 Прочее';
        }

        if (type === 'expense' && expenseMap[c]) return expenseMap[c];

        // Частичное совпадение
        for (const [key, val] of Object.entries(expenseMap)) {
            if (c.includes(key) || key.includes(c)) return val;
        }

        return null; // неизвестно — идём дальше
    }

    /** Маппинг merchant-строки на реальную категорию из expenseCategories.js */
    _mapExpenseCategory(text) {
        if (!text) return '🗿 Прочее';
        const t = text.toUpperCase();

        // ── Переводы / P2P / банковские операции ──
        if (/HUMO2VISA|VISA2HUMO|HUMO.*VISA|VISA.*HUMO|TBC.*P2P|TBC.*HUMO|TBC.*VISA|XAZNA|ALLIANCE*PAY|P2P|PEREVOD|ПЕРЕВОД|UB H2H|H2H|PAYME|CLICK|UZCARD|HUMODR|UZUM.*BANK|UZUMB/i.test(t))
            return '🔄 P2P переводы';
        if (/GNK.*CASHBACK|CASHBACK|КЭШБЕК/i.test(t))
            return '🔄 P2P переводы';
        if (/KONVERSIYA|КОНВЕРТАЦИЯ|KONVERTASIYA|OBMEN|AVOSEND/i.test(t))
            return '💱 Обмен валют (онлайн)';
        if (/ATM.*BONUS/i.test(t))
            return '🔄 P2P переводы';
        if (/TOSHKENT SH.,  IPAK YULI/i.test(t)) return '🏧 Снятие наличных';

// ── Банкоматы / Снятие наличных ──
        if (/\bATM\b|БАНКОМАТ|NALICHN|СНЯТИЕ|APEX BANK|KHALK BANK.*YAKKASA|TRASTBANK|MEHNAT|BANT B\d|XKKM|IPAK YULI|ASAKA BANK|NBU ATM/i.test(t)) return '🏧 Снятие наличных';

// ── Коммунальные платежи ──
        if (/HUDUDGAZ|HUDUD.*GAS|ГАЗОСНАБЖ|GORGAZ|ГАЗОВАЯ СЛУЖБ|GAZ/i.test(t))    return '🔥 Газ';
        if (/VEOLIA|ВОДОКАНАЛ|SUVOQAVA|SUVQUVVAT|ВОДОСНАБЖ|VODA|SUV|ВОДА/i.test(t))          return '💧 Холодная Вода';
        if (/TOSHKENTENERGOSOT|ENERGOSOT|КВИТАНЦИЯ.*ЭЛЕКТР/i.test(t))           return '⚡ Электричество';
        if (/IQTISOD SERVIS|PAYNET.*MUNIS|KOMUNAL|КОМУНАЛ|ЖКХ|PAYNET/i.test(t)) return '🏠 Коммунальные услуги';
        if (/ГК РУЗ.*ЭКОЛОГ|ОХРАНА ОКРУЖАЮЩ|ЭКОЛОГИЧЕ|YASHIL MEROS/i.test(t))               return '🌿 Экологические платежи';

// ── Кредиты / погашения ──
        if (/POGASHENIE KREDITA|BSS KREDIT|TBC DEBIT LOAN|NASIYA|KREDIT|КРЕДИТ|ЗАЙМ|ИПОТЕКА|DEBIT/i.test(t)) return '🏦 Кредит';
        if (/DEPOSIT|DEPOZIT|ДЕПОЗИТ|ВКЛАД|NAKOPDEPOZIT|VKLAD|ALLIANCE PAY VKLAD|VCLAD|ALLIANCE PAY.*VKLA/i.test(t)) return '🏦 Вклад';

// ── Продуктовые магазины ──

        if (/KORZINKA|КОРЗИНКА|KORZINKA\.UZ|KORZINKA MAHALLA| ANGLESEY.*FOOD|FOOD.*ANGLESEY|ANGLESEY FOOD|ANGLESEY/i.test(t)) return '🛒 Korzinka';
        if (/ANDALUS/i.test(t)) return '🍇 Andalus';
        if (/MAKRO|MACRO|M6/i.test(t)) return '🛒 Makro';
        if (/HAVAS MARKET|Havas|H0/i.test(t)) return '🛍️ Havas Market';
        if (/BARAKA MARKET/i.test(t)) return '🛍️ Baraka Market';
        if (/OLMA|OLMA MARKET|XALQ RETAIL/i.test(t)) return '🍏 Olma';
        if (/ECO MARKET/i.test(t)) return '🍃 Eco Market';
        if (/GREEN APPLE/i.test(t)) return '🍏 Green Apple';
        if (/GALMART/i.test(t)) return '🏪 Galmart';
        if (/FIXPRICE|FIX.PRICE|FIX PRICE/i.test(t)) return '🏷️ Fix Price';
        if (/WB INT EXPORT OPLATA|WB|WILDBERRIES/i.test(t)) return '📦 Wildberries';
        if (/BAZAAR|BAZAR|RYNOK/i.test(t)) return '🧄 Базар / Рынок';
        if (/XA XA XA|XAXAXA|1000 MELOCHEY/i.test(t)) return '🧹 Домашние покупки';
        if (/BOOBS MARKET|BOB'S MARKET|BOBS MARKET|BOB.?S|BOB PREMIUM|BOB.?S PREMIUM|AQVALON PLUS|АКВАЛОН/i.test(t)) return '🛍️ Boobs Market';
        if (/FRUTTY/i.test(t)) return '🍇 Frutty';
        if (/ASIA\.UZ|ASIA\.UZ SUPERMARKET/i.test(t)) return '🧃 Asia.uz';
        if (/SUPERMARCET|MAGAZIN|MINI-MARKET|MAGAZIN U DOMA|FULL CART|SUPERMARKET|MARKET/i.test(t)) return '🏪 Магазин';
        if (/МАГНИТ|MAGNIT/i.test(t)) return '🛍️ Магнит';
        if (/BUYUK.*IPAK|IPAK.*YOLI|Маркет/i.test(t)) return '🥦 Продукты';
        if (/RAHMAT/i.test(t)) return '🍽️ Кафе и рестораны';

// ── Доставка еды и маркетов ──
        if (/YANDEX.*EATS|YANDEXEATS|OCTOBANK.*YANDEX|Lavka/i.test(t)) return '🍽️ Яндекс Еда';
        if (/UZUM.*TEZKOR|TEZKOR|NORD BIZNES/i.test(t)) return '⚡ Uzum Tezkor';
        if (/UZUM.*MARKET|ZENIT TEHNOLOGII/i.test(t)) return '🛍️ Uzum Market';
        if (/BIR BIR/i.test(t)) return '🍱 Bir Bir';
        if (/EXPRESS24|MCHJ NORD BEK BIZNES/i.test(t)) return '🚀 Express24';
        if (/KORZINKAGO/i.test(t)) return '🛒 KorzinkaGO';
        if (/EVOS|MCHJ MAK FOOD SERVIS|MAK FOOD/i.test(t)) return '🍔 Evos';
        if (/MAXWAY|MAX WAY/i.test(t)) return '🍟 MaxWay';
        if (/DODO.*PIZZA|DODO PIZZA/i.test(t)) return '🍕 Dodo Пицца';
        if (/BELLISSIMO.*PIZZA|BELLISSIMO/i.test(t)) return '🍕 Bellissimo';
        if (/BRINGO/i.test(t)) return '📦 Bringo';
        if (/RAMENONTHEGO/i.test(t)) return '🍜 RamenOnTheGo';
        if (/BENTOBOX/i.test(t)) return '🥡 BentoBox';
        if (/COFFEEEXPRESS/i.test(t)) return '☕ CoffeeExpress';
        if (/SANDWICHGO/i.test(t)) return '🥪 SandwichGo';
        if (/DONUTRUN/i.test(t)) return '🍩 DonutRun';
        if (/SHEF BURGER/i.test(t)) return '🍔 Шеф бургер';
        if (/KFC/i.test(t)) return '🍗 KFC';
        if (/LEPESHKA.UZ/i.test(t)) return '🥟 Lepeshka.uz';
        if (/OSHXONA24/i.test(t)) return '🍖 Oshxona24';
        if (/RODENA/i.test(t)) return '🍲 Rodena';
        if (/MYFOOD/i.test(t)) return '🍔 MyFood';
        if (/CENTRAL FOOD|MCHJ CENTRAL FOOD GROUP/i.test(t)) return '🍔 Central Food';
        if (/CHICKO/i.test(t)) return '🍗 Chicko';
        if (/SOMSA|СОМСА|САМСА|SAMSA/i.test(t)) return '🥧 Сомса';
        if (/MAESTRO PIZZA/i.test(t)) return '🍕 Maestro Pizza';
        if (/LAGMANHOUSE/i.test(t)) return '🍜 LagmanHouse';
        if (/PLOV.COM/i.test(t)) return '🥤 PLOV.com';
        if (/TANOVAR/i.test(t)) return '🍱 Tanovar';
        if (/SALADBAR/i.test(t)) return '🥗 SaladBar';
        if (/FOODEXPRESS/i.test(t)) return '🍟 FoodExpress';

// ── Такси / транспорт ──
        if (/YANDEXGO|YANDEX.*GO|YANDEX.*TAXI/i.test(t)) return '🚖 YandexGO Taxi';
        if (/MYTAXI|MY.TAXI/i.test(t)) return '🚗 MyTaxi';
        if (/TAXI|ТАКСИ|TRANSPORT|ТРАНСПОРТ/i.test(t)) return '🚖 Транспорт, такси и доставка';
        if (/LUKOIL|UZNEFTEPRODUKT|UZNEFTEGAS/i.test(t)) return '⛽ Бензин и заправка';
        if (/TEZQR|Единый QR|QR|MULTICARD|Перфектум 2|ШЕВЧЕНКО/i.test(t)) return '💳 Оплата терминал / QR';

// ── Кофе / кафе / рестораны ──
        if (/CAFFELITO|CAFFE/i.test(t)) return '☕ Кофейные зависимости';
        if (/COFFEE|КОФЕ/i.test(t)) return '☕ Кофейные зависимости';
        if (/BRASSERIE/i.test(t)) return '🥖 Brasserie';
        if (/CAFE|КАФЕ|RESTAURANT|РЕСТОРАН|KAFE/i.test(t)) return '🍽️ Кафе и рестораны';
        if (/YANDEX LAVKA/i.test(t)) return '🍽️ Яндекс Еда';
        if (/FASTFOOD/i.test(t)) return '🍕 Фастфуд и ночные заказы';
        if (/SHASHLYCHOK|SHASHLIK|SHASHLICHOK|MARINAD|MARINAT/i.test(t)) return '🍢 Шашлычок';
        if (/BEKON/i.test(t)) return '🥓 Бекон, мясной вайб';
        if (/POHAVAL V RESTIKE/i.test(t)) return '🍽️ Похавал в рестике';
        if (/YAPONSKAYA KUHNYA/i.test(t)) return '🍣 Японская кухня';
        if (/ZAKAZAL EDY/i.test(t)) return '🥡 Заказал еды на 3 дня, съел за вечер';
        if (/KURINYE KRYLYSHKI/i.test(t)) return '🍗 Куриные крылышки';
        if (/VSYO DLYA KUHNI/i.test(t)) return '🍳 Всё для кухни';
        if (/BULOCHNYE IZDELIYA/i.test(t)) return '🥖 Булочные изделия';
        if (/HLEB I LAVASH/i.test(t)) return '🍞 Хлеб и лаваш';
        if (/KRUPY I RIS/i.test(t)) return '🍚 Крупы и рис';
        if (/MAKARONY/i.test(t)) return '🍝 Макароны';
        if (/MOLOCHKA/i.test(t)) return '🥛 Молочка';
        if (/MASLO/i.test(t)) return '🧈 Масло';
        if (/YAYTSA/i.test(t)) return '🥚 Яйца';
        if (/MYASNYE DELIKATESY/i.test(t)) return '🍗 Мясные деликатесы';
        if (/\bSYR\b/i.test(t)) return '🧀 Сыр';
        if (/SEZONNYE OVOSHI/i.test(t)) return '🌽 Сезонные овощи';
        if (/POMIDORY I OGURTSY/i.test(t)) return '🍅 Помидоры и огурцы';
        if (/ZELEN I TRAVY/i.test(t)) return '🥬 Зелень и травы';
        if (/FRUKTY/i.test(t)) return '🍌 Фрукты';
        if (/SPETSII I PRIPRAVY/i.test(t)) return '🧂 Специи и приправы';
        if (/MED DZHEMY I NUTELLA/i.test(t)) return '🍯 Мед, джемы и нутелла';
        if (/SOUSY/i.test(t)) return '🍶 Соусы';
        if (/ZAMOROZKA/i.test(t)) return '🧊 Заморозка';
        if (/PELMENI I VARENIKI/i.test(t)) return '🥟 Пельмени и вареники';
        if (/MOROJENOYE NA DUBOVOI|DUBOVOY|Дубовой/i.test(t)) return '🍨 Мороженое на Дубовой';
        if (/ZAMOROZHENNAYA PITSA/i.test(t)) return '🍕 Замороженная пицца';
        if (/DETSKOE PITANIE/i.test(t)) return '🍼 Детское питание';
        if (/FITNES PRODUKTY/i.test(t)) return '🥗 Фитнес-продукты';
        if (/CHESNOK/i.test(t)) return '🧄 Купил чеснок';
        if (/\bSOL\b/i.test(t)) return '🧂 Соль жизни';
        if (/KARTOShKA/i.test(t)) return '🥔 Картошка';
        if (/DOSHIRAK/i.test(t)) return '🍜 Доширак';
        if (/\bLUK\b/i.test(t)) return '🧅 Купил лук';
        if (/KONSERVY/i.test(t)) return '🥫 Консервы';
        if (/ANANAS/i.test(t)) return '🍍 Ананас';
        if (/ZAKRUTKI/i.test(t)) return '🫙 Закрутки';
        if (/KONSERVANTY/i.test(t)) return '🧪 Консерванты';
        if (/BANKI STEKLYANNYE/i.test(t)) return '🍶 Банки стеклянные';
        if (/REAL BUSINESS TRADE|Gustimo|MOROJENOYE|NA DUBOVOI|NA DUBOVOY/i.test(t)) return '🍦 Мороженое';
        if (/POMIDORY/i.test(t)) return '🍅 Помидоры';
        if (/OGURTSY/i.test(t)) return '🥒 Огурцы';
        if (/\bSALAT\b/i.test(t)) return '🥗 Салат';
        if (/\bSOM\b/i.test(t)) return '🐟 Сом';
        if (/\bRYBA\b/i.test(t)) return '🐠 Рыба';
        if (/\bMYASO\b/i.test(t)) return '🥩 Мясо';
        if (/\bOVOSHI\b/i.test(t)) return '🥕 Овощи';
        if (/\bZELEN\b/i.test(t)) return '🌿 Зелень';
        if (/ZULYA/i.test(t)) return '🧞‍♀️ Zulya';
        if (/MUNISA/i.test(t)) return '🥘 Munisa';
        if (/YASHNOBOD/i.test(t)) return '🍲 Yashnobod';
        if (/SAMOSH/i.test(t)) return '🥟 СамOsh';
        if (/MILLIY TAOMLAR|TAOM/i.test(t)) return '🍛 Миллий таомлар';
        if (/MMM MUNISA TAOM MCHJ|MUNISA/i.test(t)) return '🍛 Муниса Миллий таомлар';
        if (/RAYHON/i.test(t)) return '🌸 Rayhon';
        if (/SORRENTO/i.test(t)) return '🍝 Сорренто';
        if (/PRO.HINKALI/i.test(t)) return '🥟 Pro.Хинкали';
        if (/LALI/i.test(t)) return '🥐 Lali';
        if (/YUZHANIN/i.test(t)) return '🌞 Южанин';
        if (/KITANA/i.test(t)) return '🥢 Kitana';
        if (/SYROVARNYA/i.test(t)) return '🧀 Сыроварня';
        if (/TAKAHULI/i.test(t)) return '🌮 ТакаХули';
        if (/CHENSON/i.test(t)) return '🥡 Chenson';
        if (/UGOLOK/i.test(t)) return '🍲 Уголок';
        if (/NAVVAT/i.test(t)) return '📍 Navvat';
        if (/KEY-TAUN/i.test(t)) return '🍔 Кей-таун';
        if (/PLOVLOUNGE/i.test(t)) return '🥘 PlovLounge';
        if (/HAMMERSMITH/i.test(t)) return '🍻 Hammersmith';
        if (/L'OPERA/i.test(t)) return "🍰 L'Opera";
        if (/BELLE MAMAN/i.test(t)) return '👩‍🍳 Belle maman';
        if (/ASSORT/i.test(t)) return '🍱 Assort';
        if (/PIE REPUBLIC/i.test(t)) return '🥧 Pie Republic';
        if (/BASILIC/i.test(t)) return '🌿 Basilic';
        if (/EFENDI/i.test(t)) return '☕ Efendi';
        if (/\bWOK\b/i.test(t)) return '🍜 Wok';
        if (/YAPONAMAMA/i.test(t)) return '🍣 Yaponamama';
        if (/SITI GRIL/i.test(t)) return '🍖 Сити Гриль';
        if (/BELLA NAPOLI/i.test(t)) return '🍕 Bella Napoli';
        if (/MCDONALD'S/i.test(t)) return "🍔 McDonald's";
        if (/SUSHIKO/i.test(t)) return '🍣 Sushiko';
        if (/FOOD PLANET/i.test(t)) return '🥗 Food Planet';
        if (/CHAYHONA №1/i.test(t)) return '🥤 Chayhona №1';
        if (/PLOV/i.test(t)) return '🇺🇿 Плов';
        if (/MANTY/i.test(t)) return '🇺🇿 Манты';
        if (/SHASHLYK/i.test(t)) return '🇺🇿 Шашлык';
        if (/KATLAMA/i.test(t)) return '🇺🇿 Катлама';
        if (/SHURPA/i.test(t)) return '🇺🇿 Шурпа';
        if (/DONER/i.test(t)) return '🇹🇷 Донер';
        if (/KEBAB/i.test(t)) return '🇹🇷 Кебаб';
        if (/ISKENDER/i.test(t)) return '🇹🇷 Искендер';
        if (/BÖREKI/i.test(t)) return '🇹🇷 Бёреки';
        if (/CHORBA/i.test(t)) return '🇹🇷 Чорба';
        if (/SUSHI/i.test(t)) return '🇯🇵 Суши';
        if (/RAMEN/i.test(t)) return '🇯🇵 Рамен';
        if (/BENTO/i.test(t)) return '🇯🇵 Бенто';
        if (/TAKOYAKI/i.test(t)) return '🇯🇵 Такояки';
        if (/TEMPURA/i.test(t)) return '🇯🇵 Темпура';
        if (/KIMCHI RAMEN/i.test(t)) return '🇰🇷 Кимчи рамен';
        if (/KOREYSKIY FRAYD CHIKEN/i.test(t)) return '🇰🇷 Корейский фрайд чикен';
        if (/KIMCHI-CHIGE/i.test(t)) return '🇰🇷 Кимчи-чиге';
        if (/BIBIMBAP/i.test(t)) return '🇰🇷 Бибимбап';
        if (/MANDU/i.test(t)) return '🇰🇷 Манду';
        if (/LAPSHA PO-KITAYSKI/i.test(t)) return '🇨🇳 Лапша по-китайски';
        if (/DIMSAM/i.test(t)) return '🇨🇳 Димсам';
        if (/\bBAO\b/i.test(t)) return '🇨🇳 Бао';
        if (/KANTONSKAYA KUHNYA/i.test(t)) return '🇨🇳 Кантонская кухня';
        if (/NATSIONALNAYA KUHNYA/i.test(t)) return '🇺🇿 Национальная кухня';
        if (/\bCHAY\b/i.test(t)) return '🍵 Чай';
        if (/KITAYSKIY CHAY/i.test(t)) return '🇨🇳 Китайский чай';
        if (/ULUN/i.test(t)) return '🟦 Улун';
        if (/ZELYONYY CHAY/i.test(t)) return '🟩 Зелёный чай';
        if (/KRASNYY CHAY/i.test(t)) return '🟥 Красный чай';
        if (/PUER/i.test(t)) return '⚫ Пуэр';
        if (/CHAY S DOBAVKAMI/i.test(t)) return '🍋 Чай с добавками';
        if (/ANGAR/i.test(t)) return '🏗️ Ангар';
        if (/INBAZAR/i.test(t)) return '🏬 Inbazar';
        if (/MALIKA BAZAR/i.test(t)) return '🧺 Малика базар';
        if (/OPTIMUM/i.test(t)) return '📦 Optimum';
        if (/ASIA UZGOODS/i.test(t)) return '🧃 Asia Uzgoods';
        if (/SNEAKER LAB/i.test(t)) return '👟 Sneaker Lab';
        if (/STREET 77/i.test(t)) return '🌯 Street 77';
        if (/FISH AND BREAD/i.test(t)) return '🐟 Fish and Bread';
        if (/MAR-MAR/i.test(t)) return '🍗 Mar-Mar';
        if (/TEPPANYAKI/i.test(t)) return '🍱 Теппаняки';
        if (/HACHAPURI HOUSE/i.test(t)) return '🧀 Хачапури House';
        if (/SAZANCHIK/i.test(t)) return '🐟 Сазанчик';
        if (/G'OSHT/i.test(t)) return '🥩 G`osht';
        if (/GOLUBYE KUPOLA/i.test(t)) return '💠 Голубые купола';
        if (/TYAN'TSZIN/i.test(t)) return '🥡 Тяньцзинь';
        if (/7 PYATNITS/i.test(t)) return '📅 7 Пятниц';
        if (/KHIVA/i.test(t)) return '🏛️ Khiva';
        if (/CHESTER/i.test(t)) return '🛋️ Chester';
        if (/PODUSHECHNAYA/i.test(t)) return '🛏️ Подушечная';
        if (/\bTONG\b/i.test(t)) return '🔥 Tong';
        if (/STORIES/i.test(t)) return '📖 Stories';
        if (/SANTINI/i.test(t)) return '🍦 Santini';
        if (/ANJIR/i.test(t)) return '🍃 Anjir';
        if (/VFARSH/i.test(t)) return '🍔 ВФарш';
        if (/DAYAKO CHICKEN&BEER/i.test(t)) return '🍗 Dayako Chicken&Beer';
        if (/WENDY'S/i.test(t)) return '🍔 Wendy`s';
        if (/CHAYKOF/i.test(t)) return '☕ Чайкоф';
        if (/BNB|B&B/i.test(t)) return '🍳 BnB';
        if (/CINEMATICA.UZ|CINEMATICA/i.test(t)) return '🎥 Cinematica';
        if (/GIZHDUVON/i.test(t)) return '🍢 Гиждувон';
        if (/KOFE NA ULITSE/i.test(t)) return '☕ Кофе на улице';
        if (/MANTY HOUSE/i.test(t)) return '🥟 Manty House';
        if (/LAGMAN BAR/i.test(t)) return '🍲 Lagman Bar';
        if (/SUBWAY/i.test(t)) return '🥪 Subway';
        if (/HARDEE’S/i.test(t)) return '🍔 Hardee’s';
        if (/STEAK HOUSE/i.test(t)) return '🥩 Steak House';
        if (/OQTEPA LAVASH/i.test(t)) return '🍲 Oqtepa Lavash';
        if (/SALADBAR FRESH/i.test(t)) return '🥗 SaladBar Fresh';
        if (/SHASHLIKMASTER/i.test(t)) return '🍖 ShashlikMaster';
        if (/PHO HANOI/i.test(t)) return '🍜 Pho Hanoi';
        if (/TOM YUM BAR/i.test(t)) return '🍲 Tom Yum Bar';
        if (/SUSHI MASTER/i.test(t)) return '🍣 Sushi Master';
        if (/TEREMOK/i.test(t)) return '🥞 Teremok';
        if (/BASKIN ROBBINS/i.test(t)) return '🍧 Baskin Robbins';
        if (/CINNABON/i.test(t)) return '🍰 Cinnabon';
        if (/OBEDBUFET/i.test(t)) return '🥗 ObedBufet';
        if (/TEMPURA BOX/i.test(t)) return '🍤 Tempura Box';
        if (/TACO BELL/i.test(t)) return '🌮 Taco Bell';
        if (/CHUCHVARA HOUSE/i.test(t)) return '🍲 Chuchvara House';
        if (/CURRY POINT/i.test(t)) return '🍛 Curry Point';
        if (/UZBEKOSH/i.test(t)) return '🥘 UzbekOsh';
        if (/RAMEN HOUSE/i.test(t)) return '🍜 Ramen House';
        if (/MISTER DONUT/i.test(t)) return '🍩 Mister Donut';
        if (/GELATO DIVINO/i.test(t)) return '🍦 Gelato Divino';
        if (/SHRIMP & GO/i.test(t)) return '🍤 Shrimp & Go';
        if (/PAUL BAKERY/i.test(t)) return '🥐 Paul Bakery';
        if (/BARBEQUE NATION/i.test(t)) return '🍖 Barbeque Nation';
        if (/SMOOTHIE KING/i.test(t)) return '🍹 Smoothie King';
        if (/HEALTHY CHOICE/i.test(t)) return '🥒 Healthy Choice';
        if (/GREEK FOOD/i.test(t)) return '🌯 Greek Food';
        if (/PANDA EXPRESS/i.test(t)) return '🥡 Panda Express';
        if (/ЦВЕТЫ|BUCHET|SVETI/i.test(t)) return '💐 Цветы';

        if (/TASHKENT AQUARIUM|MAGIC CITY/i.test(t)) return '🎡 Magic City';


// ── Аптека / здоровье ──
        if (/PHARM|APTEKA|APTЕKA|DORIXONA|АПТЕКА|ALSTOM|EXCLUSIVE LEADER TRADE|VAKSINA|HEALTH|AMIR APPS|DELTA|DELTA MAX|LEADER TRADE|OXYMED|OXY|ARZON|PHAR|ФАРМ|FARM|МЕД/i.test(t)) return '💊 Аптека и здоровье';

// ── Связь / интернет ──
        if (/MOBIUZ|MOBI.UZ|BEELINE|БИЛАЙН|UCELL|UMS|OPLATA UCELL|Perfectum|МТС|MTS|MEGAFON|МЕГАФОН|TELE2|T2|OQ|YOTA|KCELL|Altel|А1|Ucom|MegaCom|Silknet|Magti/i.test(t)) return '📱 Мобильная связь и интернет';
        if (/UZMOBILE|UzMobile|UZ.MOBILE/i.test(t)) return '📱 Мобильная связь и интернет';
        if (/FIBERNET|FIBER.NET|UZTEL|UZTELECOM|TPS|SARKOR|TURON|TELECOM|COMNET|SHARQ|Ростелеком|ТТК|ТрансТелеКом|Уфанет|COMNET|East Telecom|TURON|KRON|DIGITAL TEL|VERIZON/i.test(t)) return '🌐 Интернет';

// ── Коммуналка ──
        if (/ELEKTRO|ELEKTROENERGIYA|ЭЛЕКТРО|ЭНЕРГИЯ/i.test(t)) return '⚡ Электричество';
        if (/\bGAS\b|ГАЗ.*СЛУЖБ|КОММУН/i.test(t)) return '🏠 Коммунальные услуги';

// ── Подписки ──
        if (/YANDEX.*PLUS|ЯНДЕКС.*ПЛЮС/i.test(t)) return '🎵 Яндекс Плюс';
        if (/NETFLIX/i.test(t)) return '🎬 Netflix';
        if (/SPOTIFY/i.test(t)) return '🎵 Музыка и подкасты';
        if (/APPLE|GOOGLE.*PLAY|YOUTUBE.*PREMIUM|Istoriya po karte|ISTORIYA|HISTORY/i.test(t)) return '📺 Подписки';
        if (/TELEGRAM.*PREMIUM/i.test(t)) return '✈️ Telegram Premium';

// ── Одежда / шопинг ──
        if (/NEW.YORKER|NEWYORKER/i.test(t)) return '👔 Деловая одежда';
        if (/LETUAL|LETU|ЛЕТУАЛЬ/i.test(t)) return '💄 Летуаль';
        if (/LEGION|ALKO|ALCO|DEMEYA PLUS|ASIA GRADUS|GRADUS|BROOKLYN|AION/i.test(t)) return '🍷 Алкоголь';
        if (/ZARA|H&M|UNIQLO|PAUL&BEAR|SELFIE|JUST|DIESEL|SIM|CAPSULA|VANS|TERRA PRO|RED TAG/i.test(t)) return '👗 Одежда и аксессуары';
        if (/ACCESSORY|АКСЕССУАРЫ|АКСЕССУАР|GOOD FOR EVERYONE/i.test(t)) return '🕶️ Аксессуары';
        if (/IFOX|I FOX/i.test(t)) return '🦊 IFox';


// ── Финансы / DUT / прочее ──
        if (/\bDUT\b|\bWORK\b|\bFINANCE\b/i.test(t)) return '💼 Работа и финансы';

// ── Дополнительные узбекистанские места (заведения, магазины, ТЦ) ──
        if (/SOFIA|SAFIA|OOO MADINA QANDOLAT|MADINA QANDOLAT/i.test(t)) return '🧁 Safia';
        if (/UZTOBACO BUTCOIN|UZTOBACO|UZTOBACCO|BUTCOIN/i.test(t)) return '🚬 Uztobaco Butcoin';
        if (/THE CHEF/i.test(t)) return '🍽️ The Chef';
        if (/BRASSERIE PASIFICO/i.test(t)) return '🌶️ Brasserie Pasifico';
        if (/ASSORTI/i.test(t)) return '🥘 Assorti';
        if (/MANAS ART CAFÉ/i.test(t)) return '🎨 Manas Art Café';
        if (/BASKIN ROBBINS/i.test(t)) return '🍦 Baskin Robbins';
        if (/SUNDUK CAFÉ/i.test(t)) return '🍛 Sunduk Café';
        if (/OSH MARKAZI/i.test(t)) return '🍚 Osh Markazi';
        if (/B&B COFFEE HOUSE/i.test(t)) return '☕ B&B Coffee House';
        if (/ICE AND BEAN/i.test(t)) return '🍨 Ice and Bean';
        if (/SMOKY MONKEY/i.test(t)) return '🐒 Smoky Monkey';
        if (/KALYANNAYA|SMOK ROOM|SLON|SLON CHEKHOV/i.test(t)) return '💨 Кальяная';
        if (/LOUNGE BAR/i.test(t)) return '🍹 Lounge Bar';
        if (/SHISHKA|ШИШКА/i.test(t)) return '🌲 Шишка';
        if (/TOPOR|ТОПОР/i.test(t)) return '💈 Топор';
        if (/BARBER|БАРБЕРШОП/i.test(t)) return '💈 Барбершоп (просто стрижка)';
        if (/INDENIM/i.test(t)) return '👖 Indenim';
        if (/FASHION LAB/i.test(t)) return '👠 Fashion Lab';
        if (/LC WAIKIKI|WAIKIKI/i.test(t)) return '🧥 LC Waikiki';
        if (/MAGIC CITY/i.test(t)) return '🎡 Magic City';
        if (/NEXT MALL/i.test(t)) return '🏬 Next Mall';
        if (/SAMARKAND DARVOZA/i.test(t)) return '🏢 Samarkand Darvoza';
        if (/ATLAS MALL/i.test(t)) return '🛍️ Atlas Mall';
        if (/ICE CITY/i.test(t)) return '⛸️ Ice City';
        if (/TASHKENT CITY PARK/i.test(t)) return '🌆 Tashkent City Park';
        if (/BROADWAY/i.test(t)) return '🎭 Broadway';
        if (/ESKI SHAHAR/i.test(t)) return '🏰 Eski Shahar';
        if (/U VLADA/i.test(t)) return '👨‍🍳 У Влада';
        if (/U MAMY/i.test(t)) return '👩‍🍳 У Мамы';
        if (/U BABUSHKI/i.test(t)) return '👵 У Бабушки';
        if (/U TYOTUSHKI/i.test(t)) return '🧕 У Тётушки';
        if (/\bBON\b/i.test(t)) return '🥞 BON';

// ── Прочие (fallback) ──
        return '🗿 Прочее';
    }

    /** Маппинг текста на категорию дохода */

    /** Маппинг текста на категорию дохода */
    _mapIncomeCategory(text) {
        if (!text || !text.trim()) return '💰 Зарплата';
        const t = text.toUpperCase();

        // ── Зарплата / оклад ──
        if (/SALARY|ЗАРПЛАТ|ЗП\b|ОКЛАД|MAOSH/.test(t))                        return '💰 Зарплата';
        if (/АВАНС|AVANS/.test(t))                        return '💼 Аванс';

        // ── Возвраты / кэшбек ──
        if (/REFUND|ВОЗВРАТ|VOZVRAT|QAYTARISH|ANGLESEY FOOD/.test(t))                         return '💳 Вернули долг';
        if (/CASHBACK|КЭШБЕК|VIVOD.*KOSHELK/.test(t))             return '💳 Кэшбек';

        // ── Банковские зачисления (Payme: «UZSQB AMALIYOT», «Зачисление средств банком») ──
        if (/AMALIYOT|ЗАЧИСЛЕН.*БАНК|ЗАЧИСЛЕНИЕ СРЕДСТВ/.test(t))              return '🏦 Зачисление от банка';

        // ── Cash-in / пополнение через банкомат ──
        if (/CASH.IN|ПОПОЛНЕН.*БАНКОМ|ПОПОЛНЕН.*БАНКОМАТ/.test(t))             return '🏧 Пополнение через банкомат';

        // ── Перевод с карты (Payme: «Перевод на карту», «Пополнение счёта») ──
        if (/ПЕРЕВОД НА КАРТУ|ПЕРЕВОД.*КАРТ|PEREVOD.*KART|ПОПОЛНЕН.*СЧЁТ|ПОПОЛНЕН.*SCHET/.test(t)) return '🔁 Перевод с карты';

        // ── P2P / межбанк переводы ──
        if (/PEREVOD S KARTI NA KARTU|ПЕРЕВОД С КАРТЫ НА КАРТУ/.test(t))       return '🔁 Перевод с карты';
        if (/TBC.*HUMO|TBC.*P2P|HUMO.*P2P|UB.*VISA.*HUMO|VISA.*TO.*HUMO/.test(t)) return '🔄 Входящий перевод';
        if (/P2P|HUMO2VISA|VISA2HUMO|HUMODR|UB H2H|H2H/.test(t)) return '🔄 P2P перевод';
        if (/PEREVOD|ПЕРЕВОД|XAZNA|UZCARD|PAYME|CLICK/.test(t))                return '🔄 P2P перевод';
        if (/ASTERIUM POPOLN NA KARTU|ASTERIUM/.test(t))                return '🪙 Крипта';

        // ── Фриланс / работа ──
        if (/FREELAN|ФРИЛАН/.test(t))                                           return '🛠️ Фриланс';

        // ── Подарки / бонусы ──
        if (/BONUS|БОНУС|ПРЕМИЯ|GIFT|ПОДАРОК|ДАРЕНИЕ/.test(t))                 return '🎁 Подарок / бонус';

        // ── Проценты / вклады ──
        if (/PERCENT|ПРОЦЕНТ|INTEREST|ВКЛАД|ДЕПОЗИТ|ALLIANCE PAY.*ONLINE/.test(t))                  return '🏦 Проценты от вклада';
        if (/DEPOSIT|DEPOZIT|ВКЛАД|NAKOPDEPOZIT|VKLAD|ALLIANCE PAY VKLAD|VCLAD|ALLIANCE PAY.*VKLA/i.test(t))             return '🏦 Депозит';

        // ── Аренда ──
        if (/RENT|АРЕНДА/.test(t))                                              return '🏠 Доход от аренды';

        // ── Продажа ──
        if (/SALE|ПРОДАЖА|ПРОДАЛ/.test(t))                                      return '📦 Продажа';

        // ── Возврат долга от друга ──
        if (/UZUM BANK|UZUMBANK|VISA UZS KB|ДЕНЬГИ ОТ ДРУГА/.test(t))           return '🤝 Деньги от друга';

        // ── Гос. выплаты / пенсии / пособия ──
        if (/NAFAQA|PENSIYA|ПЕНСИЯ|ПОСОБИЕ|NAFAQA|STIPENDIYA|STИПЕНДИЯ|STIPEND/.test(t)) return '🏛️ Гос. выплата / пенсия';

        // ── Переводы от физлиц (общий случай) ──
        if (/OT FIZLITSA|OT FRIEND|DRUG|QARZDORLIK/.test(t)) return '🤝 Деньги от друга';

        return '🔮 Загадочное поступление';
    }

    /** Форматирование числа с разрядами */
    _fmtNum(n) {
        return new Intl.NumberFormat('ru-RU').format(Math.round(n || 0));
    }
}