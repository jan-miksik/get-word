/**
 * Reminder copy, in every language the app bundles a dictionary for.
 *
 * A push payload is built on the server, so the browser's own dictionary never
 * gets a say: whatever this file sends is what the learner reads. That makes it
 * a second copy of four strings that already live in `lib/i18n/locales/*`, and
 * a second copy is only safe if something fails when the two drift —
 * `features/learning/goals/__tests__/reminder-push-copy.test.ts` compares them
 * key by key.
 *
 * Deliberately dependency-free: the Edge Function is deployed on its own and
 * cannot reach into the Next.js app, and the test must be able to import this
 * without dragging Deno globals into the repo's TypeScript program.
 */

export interface ReminderCopy {
  title: string;
  body: string;
}

const DEFAULT_REMINDER_LANGUAGE = 'en';

export const REMINDER_COPY: Record<string, ReminderCopy> = {
  en: {
    title: "Time for today's words",
    body: 'A short study session is ready.',
  },
  cs: {
    title: 'Čas na dnešní slovíčka',
    body: 'Krátké kolo je připravené.',
  },
  uk: {
    title: 'Час для сьогоднішніх слів',
    body: 'Коротка сесія вже готова.',
  },
  vi: {
    title: 'Đến giờ học từ hôm nay',
    body: 'Một phiên học ngắn đã sẵn sàng.',
  },
};

/**
 * The stored preference is a BCP-47-ish tag (`cs`, `pt-BR`), and the copy is
 * keyed by base language only. A language we have no copy for falls back to
 * English rather than sending nothing — the same thing the interface does for
 * an unbundled locale.
 */
export function reminderCopyFor(language: string | null | undefined): ReminderCopy {
  const base = typeof language === 'string'
    ? language.trim().toLowerCase().split('-')[0]
    : '';
  return REMINDER_COPY[base] ?? REMINDER_COPY[DEFAULT_REMINDER_LANGUAGE];
}
