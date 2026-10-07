// Сводные тексты Акулки: базовые наборы + «болтливые» дополнения.
import { MOOD_TEXTS as MOOD_BASE } from './mood.js';
import { MOOD_MORE } from './mood-more.js';
import { TOAST_TEXTS as TOAST_BASE } from './toasts.js';
import { TOAST_MORE } from './toasts-more.js';
import * as X from './extras.js';
import * as A from './extras-more-a.js';
import * as B from './extras-more-b.js';
import { ANSWERS as ANSWERS_BASE } from './answers.js';
import { ANSWERS_A } from './answers-a.js';
import { ANSWERS_B } from './answers-b.js';
import { PROACTIVE } from './proactive.js';
import { FUN } from './fun.js';
import { FLAVOR } from './flavor.js';
import { ANSWERS_C } from './answers-c.js';
import { GLOSSARY } from './glossary.js';
export { PROACTIVE, FUN, FLAVOR, ANSWERS_C, GLOSSARY };
export const ANSWERS = { ...ANSWERS_BASE, ...ANSWERS_A, ...ANSWERS_B };
export { BACKUP_NUDGES } from './extras-more-a.js';

// { pool: { kind:[…], … } } + { pool: { kind:[…], … } }
export const mergeChars = (base, more = {}) => {
    const out = {};
    for (const ch of new Set([...Object.keys(base), ...Object.keys(more)])) out[ch] = [...(base[ch] || []), ...(more[ch] || [])];
    return out;
};
// { key: { kind:[…] } }
export const mergePools = (base, more = {}) => Object.fromEntries(Object.keys(base).map(k => [k, mergeChars(base[k], more[k])]));

export const MOOD_TEXTS = mergePools(MOOD_BASE, MOOD_MORE);
export const TOAST_TEXTS = mergePools(TOAST_BASE, TOAST_MORE);
// В приложении у долга нет срока и напоминаний, поэтому прежние обещания про «срок» заменены честными фразами
TOAST_TEXTS.debt = mergeChars(
    Object.fromEntries(Object.entries(TOAST_TEXTS.debt).map(([ch, l]) => [ch, l.filter(t => !/срок|напомн|просроч|дедлайн/i.test(t))])),
    FUN.debtNew
);

export const MOTIVATION = mergeChars(X.MOTIVATION, A.MOTIVATION_MORE);
export const CHEER_TASKS = mergeChars(X.CHEER_TASKS, A.CHEER_TASKS_MORE);
export const REMINDERS = mergeChars(X.REMINDERS, A.REMINDERS_MORE);
export const GREETINGS = mergeChars(X.GREETINGS, A.GREETINGS_MORE);
export const VERDICT_OK = mergeChars(X.VERDICT_OK, B.VERDICT_OK_MORE);
export const VERDICT_OVER = mergeChars(X.VERDICT_OVER, B.VERDICT_OVER_MORE);
export const WELCOME_BACK = mergeChars(X.WELCOME_BACK, B.WELCOME_BACK_MORE);
export const STREAK = mergeChars(X.STREAK, B.STREAK_MORE);
export const MONTH_END = mergeChars(X.MONTH_END, B.MONTH_END_MORE);
export const MORNING = mergePools(X.MORNING, B.MORNING_MORE);
