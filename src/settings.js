// settings.js  —  ESM-модуль без глобальных window-утечек
// -----------------------------------------------------------------
import { initThemeSelector }   from './ThemeManager.js';
import { initializeAnalytics } from '../widgets/charts.js';
import { FAQ_ITEMS }           from '../constants/faq-constants.js';


function showTweak(text, type = 'success', duration = 3000) {
    const container = document.getElementById('tweak-container');
    if (!container) return;

    // Убираем скрытие, если оно было
    container.classList.remove('hidden');

    // Создаём элемент твикса
    const tweakEl = document.createElement('div');
    tweakEl.classList.add('tweak', type);
    tweakEl.textContent = text;

    // Кнопка «×» для ручного закрытия
    const closeBtn = document.createElement('button');
    closeBtn.classList.add('tweak-close');
    closeBtn.innerHTML = '&times;'; // символ крестика
    closeBtn.addEventListener('click', () => {
        // Сразу прячем твикс
        hideTweak(tweakEl);
    });
    tweakEl.appendChild(closeBtn);

    // Вставляем в контейнер
    container.appendChild(tweakEl);

    // Через duration мс анимируем исчезновение
    setTimeout(() => {
        hideTweak(tweakEl);
    }, duration);
}

function hideTweak(tweakEl) {
    // Запускаем анимацию скрытия
    tweakEl.style.animation = 'tweak-slide-out 0.3s forwards';
    // После окончания анимации удаляем элемент
    tweakEl.addEventListener('animationend', () => {
        tweakEl.remove();
        // Если контейнер пуст, скрываем его
        const container = document.getElementById('tweak-container');
        if (container && container.children.length === 0) {
            container.classList.add('hidden');
        }
    }, { once: true });
}

/* =================================================================
   Локальные переменные
   ================================================================= */
let localBudgetManager = null;
let exportChartInstance = null;

/* =================================================================
   FAQ renderer
   ================================================================= */
function renderFAQ() {
    const box = document.getElementById('faq-container');
    if (!box) return;
    box.innerHTML = FAQ_ITEMS.map(({ question, answer }) => `
    <details class="faq-item">
      <summary>${question}</summary>
      <p>${answer}</p>
    </details>
  `).join('');
}

/* =================================================================
   Навигация между подстраницами (без window.*)
   ================================================================= */
function openSubPage(pageId) {
    document.querySelectorAll('.bottom-sheet').forEach(el => el.classList.add('hidden'));

    const page = document.getElementById(pageId);
    if (!page) {
        console.warn(`[Settings] Не найдена страница: ${pageId}`);
        showTweak(`❌ Страница «${pageId}» не найдена`, 'error', 2000);
        return;
    }

    page.classList.remove('hidden');
    document.getElementById('bottom-sheet-backdrop')?.classList.remove('hidden');

    if (pageId === 'faq-page')           renderFAQ();
    if (pageId === 'analytics-page')     initializeAnalytics(localBudgetManager);
    if (pageId === 'export-import-page') refreshExportAnalytics(localBudgetManager);
}

function goBackFromSubPage() {
    document.querySelectorAll('.bottom-sheet').forEach(el => el.classList.add('hidden'));
    document.getElementById('settings-page')?.classList.remove('hidden');
    document.getElementById('bottom-sheet-backdrop')?.classList.remove('hidden');
}

/* =================================================================
   Инициализация настроек
   ================================================================= */
export function initSettings(budgetManager, ui) {
    localBudgetManager = budgetManager;

    /* ---------- EXPORT ---------- */
    document.getElementById('export-btn')
        ?.addEventListener('click', () => {
            trackSafe?.('export-from-settings');

            const blob = new Blob([JSON.stringify(budgetManager.budgets)], {
                type: 'application/json'
            });
            const url = URL.createObjectURL(blob);

            Object.assign(document.createElement('a'), {
                href: url,
                download: 'budgets.json'
            }).click();

            URL.revokeObjectURL(url);
            showTweak('📁 Бюджеты экспортированы', 'success', 2000);
        });

    /* ---------- IMPORT (с «твиксами» вместо модалок) ---------- */
    document.getElementById('import-file')
        ?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = () => {
                try {
                    budgetManager.budgets = JSON.parse(reader.result);
                    budgetManager.currentBudgetIndex = 0;
                    budgetManager.saveToStorage();
                    ui.updateHeader();
                    ui.updateUI();
                    refreshExportAnalytics(budgetManager);

                    // Показываем «твикс» об успехе
                    showTweak('✅ Данные успешно импортированы', 'success', 2500);

                } catch {
                    // Показываем «твикс» при ошибке
                    showTweak('❌ Ошибка при чтении файла', 'error', 4000);
                }
            };
            reader.readAsText(file);
        });

    /* ============================= */
    /* 1) ОЧИСТКА КЭША ЧЕРЕЗ МОДАЛКУ  */
    /* ============================= */
    document.getElementById('clear-cache-btn')?.addEventListener('click', () => {
        // Показываем модалку «clear-cache-modal»
        document.getElementById('clear-cache-modal')?.classList.remove('hidden');
        document.getElementById('bottom-sheet-backdrop')?.classList.remove('hidden');
    });

// Отмена очистки кэша
    document.getElementById('cancel-clear-cache')?.addEventListener('click', () => {
        document.getElementById('clear-cache-modal')?.classList.add('hidden');
        document.getElementById('bottom-sheet-backdrop')?.classList.add('hidden');
    });

// Подтверждение очистки кэша
    document.getElementById('confirm-clear-cache')?.addEventListener('click', () => {
        console.log('confirm-clear-cache handler вызван');

        // 1) Скрываем модалку немедленно
        document.getElementById('clear-cache-modal')?.classList.add('hidden');
        document.getElementById('bottom-sheet-backdrop')?.classList.add('hidden');

        // 2) Показываем твикс об успешной очистке (за 1500 мс)
        showTweak('🧹 Кэш очищен, сейчас перезагружаемся', 'success', 1500);

        // 3) Удаляем ключи из localStorage сразу же (без ожидания)
        [
            'appTheme',
            'current-budget-index',
            'last-category',
            'product-names',
            'analytics-consent',
            'chart-mode'
        ].forEach(key => {
            localStorage.removeItem(key);
            console.log(`Удалён ключ localStorage: ${key}`);
        });

        // 4) Через 1500 мс удаляем весь кеш и вызываем reload:
        setTimeout(() => {
            console.log('Запускаем удаление всех кэшей через caches.keys()');

            if (!('caches' in window)) {
                console.warn('API caches не доступен в этом браузере. Выполняем только location.reload()');
                location.reload();
                return;
            }

            caches.keys()
                .then(keys => {
                    console.log('Найдены кэши:', keys);
                    return Promise.all(keys.map(key => {
                        console.log(`Удаляем кэш: ${key}`);
                        return caches.delete(key);
                    }));
                })
                .then(results => {
                    console.log('Статусы удаления кэшей:', results);
                    console.log('Вызов location.reload()');
                    location.reload();
                })
                .catch(err => {
                    console.error('Ошибка при удалении кэшей:', err);
                    // В любом случае перезагрузим страницу
                    location.reload();
                });
        }, 1500);
    });
    /* ============================================== */
    /* 2) ОЧИСТКА ВСЕХ ДАННЫХ ЧЕРЕЗ МОДАЛКУ (С БЭКАПОМ) */
    /* ============================================== */
    document.getElementById('clear-data-btn')?.addEventListener('click', () => {
        // Показываем модалку «clear-data-modal»
        document.getElementById('clear-data-modal')?.classList.remove('hidden');
        document.getElementById('bottom-sheet-backdrop')?.classList.remove('hidden');
    });

    // Отмена удаления всех данных
    document.getElementById('cancel-clear-data')?.addEventListener('click', () => {
        document.getElementById('clear-data-modal')?.classList.add('hidden');
        document.getElementById('bottom-sheet-backdrop')?.classList.add('hidden');
    });

    // Подтверждение очистки всех данных
    document.getElementById('confirm-clear-data')?.addEventListener('click', () => {
        // …скрыли модалку, сделали бэкап
        showTweak('🗑️ Все данные бэкапированы и удаляются...', 'success', 1500);
        setTimeout(() => {
            localStorage.clear();
            indexedDB.databases?.().then(dbs => {
                dbs.forEach(db => indexedDB.deleteDatabase(db.name));
                location.reload();
            });
        }, 70000);
        document.getElementById('clear-data-modal')?.classList.add('hidden');
        document.getElementById('bottom-sheet-backdrop')?.classList.add('hidden');

        // Создаём бэкап текущих бюджетов
        const backup = new Blob([JSON.stringify(localBudgetManager.budgets)], {
            type: 'application/json'
        });
        const url = URL.createObjectURL(backup);
        Object.assign(document.createElement('a'), {
            href: url,
            download: 'budgets_backup_before_delete.json'
        }).click();
        URL.revokeObjectURL(url);

        // Ждём секунду, чтобы файл успел скачаться
        setTimeout(() => {
            // Полная очистка LocalStorage и IndexedDB
            localStorage.clear();
            indexedDB.databases?.().then(dbs => {
                dbs.forEach(db => indexedDB.deleteDatabase(db.name));
                location.reload();
            });
        }, 10000);
    });

    /* ---------- «Назад» со всех подстраниц ---------- */
    document.querySelectorAll('.bottom-sheet .close-settings-btn')
        ?.forEach(btn => btn.addEventListener('click', goBackFromSubPage));

    /* ---------- Закрыть профиль ---------- */
    document.getElementById('close-settings-btn')
        ?.addEventListener('click', () => {
            document.getElementById('settings-page')?.classList.add('hidden');
            document.getElementById('bottom-sheet-backdrop')?.classList.add('hidden');
        });

    /* ---------- Темы ---------- */
    initThemeSelector();

    /* ---------- Навигационные кнопки ---------- */
    // Кнопки с data-page переключают подстраницы
    document.querySelectorAll('.open-subpage-btn[data-page]')
        .forEach(btn => btn.addEventListener('click', () => openSubPage(btn.dataset.page)));
}

/* =================================================================
   Аналитика экспорта
   ================================================================= */
export function refreshExportAnalytics(budgetManager) {
    const exportPage  = document.getElementById('export-import-page');
    const chartCanvas = document.getElementById('chartContainerId');
    if (!exportPage || !chartCanvas) return;

    exportChartInstance?.destroy();

    /* ----------------- prepare data ----------------- */
    const ctx           = chartCanvas.getContext('2d');
    const budgets       = budgetManager.budgets || [];
    const totalCounts   = { income: 0, expense: 0, deposit: 0, debt: 0 };
    const budgetSummary = [];

    budgets.forEach(budget => {
        const txs = budget.transactions || [];
        txs.forEach(tx => totalCounts[tx.type] !== undefined && totalCounts[tx.type]++);
        budgetSummary.push({ name: budget.name, count: txs.length });
    });

    const chartData = [
        totalCounts.income,
        totalCounts.expense,
        totalCounts.deposit,
        totalCounts.debt
    ];
    const totalTx = chartData.reduce((s, v) => s + v, 0);

    /* ----------------- render chart ----------------- */
    exportChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Доходы', 'Расходы', 'Вклады', 'Долги'],
            datasets: [{
                data: chartData,
                backgroundColor: ['#2aace8', '#e82b2a', '#8a2be2', '#e8a22a'],
                borderWidth: 0
            }]
        },
        options: {
            plugins: {
                legend: { position: 'bottom' },
                title : {
                    display: true,
                    text   : `Всего транзакций: ${totalTx}`,
                    font   : { size: 16 }
                }
            }
        }
    });

    /* ----------------- summary blocks ----------------- */
    const txEl    = document.getElementById('tx-total');
    const countEl = document.getElementById('budget-count');

    if (txEl)    txEl.textContent    = String(totalTx);
    if (countEl) countEl.textContent = String(budgets.length);

    /* список бюджетов */
    document.querySelector('.budget-list-grid')?.remove();

    const list = document.createElement('div');
    list.className = 'budget-list-grid';
    list.style.cssText = `
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 16px;
    max-height: 90px;
    overflow-y: auto;
  `;

    budgetSummary.forEach(b => {
        const left  = Object.assign(document.createElement('div'), { textContent: b.name });
        const right = Object.assign(document.createElement('div'), {
            textContent: b.count,
            style      : 'text-align:right'
        });
        list.append(left, right);
    });

    const infoBlock = document.getElementById('budget-info-block')
        ?? document.getElementById('budget-count')?.parentElement;

    infoBlock?.parentNode
        ? infoBlock.parentNode.insertBefore(list, infoBlock.nextSibling)
        : exportPage.appendChild(list);
}

/* =================================================================
   Экспортируем навигационные функции —
   вдруг понадобятся из других модулей
   ================================================================= */
export { openSubPage, goBackFromSubPage };
