// src/StorageManager.js
const DB_NAME    = 'AkulkaVault';
const DB_VERSION = 1;
const STORE_NAME = 'DeepSeaState';
const STATE_KEY  = 'mainShark'; // один объект состояния

export class StorageManager {
    constructor() {
        this.dbPromise = this.#openDB();
    }

    #openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = event => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    store.createIndex('id', 'id', { unique: true });
                }
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror   = () => reject(request.error);
        });
    }

    async #getRawStateFromIndexedDB() {
        const db = await this.dbPromise;
        return new Promise((resolve, reject) => {
            const tx    = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req   = store.get(STATE_KEY);

            req.onsuccess = () => resolve(req.result || null);
            req.onerror   = () => reject(req.error);
        });
    }

    async #putStateToIndexedDB(state) {
        const db = await this.dbPromise;
        return new Promise((resolve, reject) => {
            const tx    = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const req   = store.put({ id: STATE_KEY, ...state });

            req.onsuccess = () => resolve();
            req.onerror   = () => reject(req.error);
        });
    }

    /* ───────────── Загрузка с миграцией ───────────── */

    async loadInitialState() {
        // 1. Пытаемся взять из IndexedDB
        let fromIDB = null;
        try {
            fromIDB = await this.#getRawStateFromIndexedDB();
        } catch (e) {
            console.warn('[StorageManager] IndexedDB read failed, will fallback to localStorage', e);
        }

        if (fromIDB && Array.isArray(fromIDB.budgets)) {
            return this.#normalizeState(fromIDB);
        }

        // 2. Ничего в IndexedDB — пробуем собрать из localStorage (старый пользователь)
        const migrated = this.#loadFromLocalStorageLegacy();

        // Сохраняем в IndexedDB (миграция)
        try {
            await this.#putStateToIndexedDB(migrated);
        } catch (e) {
            console.warn('[StorageManager] Failed to write migrated state to IndexedDB', e);
        }

        return migrated;
    }

    #loadFromLocalStorageLegacy() {
        let budgets = [];
        let idx     = 0;
        let productNames = [];
        let userId  = null;

        try {
            const rawBudgets = localStorage.getItem('budgets');
            budgets = rawBudgets ? JSON.parse(rawBudgets) : [];
        } catch {
            budgets = [];
        }

        try {
            idx = parseInt(localStorage.getItem('currentBudgetIndex') || '0', 10);
            if (Number.isNaN(idx)) idx = 0;
        } catch {
            idx = 0;
        }

        try {
            productNames = JSON.parse(localStorage.getItem('productNames') || '[]') || [];
        } catch {
            productNames = [];
        }

        try {
            userId = localStorage.getItem('budgetit-user-id') || null;
        } catch {
            userId = null;
        }

        return this.#normalizeState({ budgets, currentBudgetIndex: idx, productNames, userId });
    }

    #normalizeState(raw = {}) {
        return {
            budgets           : Array.isArray(raw.budgets) ? raw.budgets : [],
            currentBudgetIndex: typeof raw.currentBudgetIndex === 'number' ? raw.currentBudgetIndex : 0,
            productNames      : Array.isArray(raw.productNames) ? raw.productNames : [],
            userId            : raw.userId || null
        };
    }

    /* ───────────── Сохранение ───────────── */

    async saveState(snapshot) {
        // 0) Берём текущее состояние из IndexedDB, чтобы не затирать userId и прочее
        let existing = null;
        try {
            existing = await this.#getRawStateFromIndexedDB();
        } catch (e) {
            console.warn('[StorageManager] Failed to read existing state before save', e);
        }

        // userId, который мог быть создан/обновлён где-то ещё и лежит только в localStorage
        let userIdFromLS = null;
        try {
            userIdFromLS = localStorage.getItem('budgetit-user-id') || null;
        } catch {
            userIdFromLS = null;
        }

        // Мержим старое состояние и новый снапшот от BudgetManager
        const merged = {
            ...(existing || {}),
            ...(snapshot || {}),
        };

        // Если нам НЕ передали userId в snapshot — сохраняем старый (из IndexedDB или LS)
        if (!snapshot || snapshot.userId === undefined) {
            merged.userId =
                (existing && existing.userId) ||
                userIdFromLS ||
                null;
        }

        const normalized = this.#normalizeState(merged);

        // 1) Пишем в IndexedDB — основной storage
        try {
            await this.#putStateToIndexedDB(normalized);
        } catch (e) {
            console.warn('[StorageManager] Failed to save to IndexedDB', e);
        }

        // 2) Дублируем в localStorage для обратной совместимости
        try { localStorage.setItem('budgets', JSON.stringify(normalized.budgets)); } catch {}
        try { localStorage.setItem('currentBudgetIndex', String(normalized.currentBudgetIndex)); } catch {}
        try { localStorage.setItem('productNames', JSON.stringify(normalized.productNames)); } catch {}
        if (normalized.userId) {
            try { localStorage.setItem('budgetit-user-id', normalized.userId); } catch {}
        }
    }

    /* ───────────── Экспорт / импорт ───────────── */

    /**
     * Возвращает строку JSON для экспорта.
     * Формат: { budgets, currentBudgetIndex, productNames, userId, version }
     */
    async exportState() {
        const state = await this.loadInitialState(); // уже нормализованный
        const payload = {
            version           : 2, // новый формат
            budgets           : state.budgets,
            currentBudgetIndex: state.currentBudgetIndex,
            productNames      : state.productNames,
            userId            : state.userId
        };
        return JSON.stringify(payload, null, 2);
    }

    /**
     * Принимает строку JSON. Поддерживает:
     * - старый формат: [ {name, transactions...}, ... ]
     * - новый формат: { budgets, currentBudgetIndex, productNames, userId, version? }
     */
    async importState(jsonString) {
        let data;
        try {
            data = JSON.parse(jsonString);
        } catch (e) {
            throw new Error('Некорректный JSON — не удалось распарсить файл');
        }

        let normalized;
        if (Array.isArray(data)) {
            // Совсем старый формат — просто массив бюджетов
            normalized = this.#normalizeState({ budgets: data, currentBudgetIndex: 0 });
        } else if (data && typeof data === 'object') {
            normalized = this.#normalizeState({
                budgets           : data.budgets,
                currentBudgetIndex: data.currentBudgetIndex,
                productNames      : data.productNames,
                userId            : data.userId
            });
        } else {
            throw new Error('Неизвестный формат файла экспорта');
        }

        await this.saveState(normalized);
        return normalized;
    }
}
