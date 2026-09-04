/**
 * Statistics primitives shared by the app-wide admin dashboard and the
 * per-school dashboard. Kept in `lib` so neither feature depends on the other.
 */

export type ActivityWindow = 'rolling' | 'calendar';

/**
 * Which population the admin dashboard is reporting on. Store-review and QA
 * accounts register in waves and never come back, so `hide` — the default —
 * is the only reading that answers "how is the app doing"; `only` is how you
 * check that a testing wave actually opened the app.
 */
export type TesterScope = 'hide' | 'only' | 'all';

export interface UsageWeekBucket {
  weekStart: string;
  count: number;
  partial?: boolean;
}

export interface StudyWeekBucket {
  weekStart: string;
  reviews: number;
  activeUsers: number;
  partial?: boolean;
}
