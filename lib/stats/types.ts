/**
 * Statistics primitives shared by the app-wide admin dashboard and the
 * per-school dashboard. Kept in `lib` so neither feature depends on the other.
 */

export type ActivityWindow = 'rolling' | 'calendar';

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
