import type { SessionPlan } from './plan';

const PREFIX = 'get-word-session-plan:v2:';
const VERSION = 2;
const RETENTION_DAYS = 14;

interface StoredSessionPlan {
  version: typeof VERSION;
  dayKey: string;
  scopeKey: string;
  goalVersionId: string | null;
  plan: SessionPlan;
}

export interface SessionPlanStorageScope {
  dayKey: string;
  scopeKey: string;
  goalVersionId: string | null;
}

export function sessionPlanStorageKey({ dayKey, scopeKey, goalVersionId }: SessionPlanStorageScope): string {
  return `${PREFIX}${dayKey}:${scopeKey}:${goalVersionId ?? 'none'}`;
}

export function sessionPlanIdentity(scope: SessionPlanStorageScope): string {
  return sessionPlanStorageKey(scope);
}

function isSessionPlan(value: unknown): value is SessionPlan {
  if (!value || typeof value !== 'object') return false;
  const plan = value as SessionPlan;
  return Array.isArray(plan.priorityIds) &&
    Array.isArray(plan.dueIds) &&
    Array.isArray(plan.newIds) &&
    Array.isArray(plan.blocks) &&
    plan.blocks.every((block) =>
      block &&
      (block.kind === 'review' || block.kind === 'new') &&
      typeof block.key === 'string' &&
      Array.isArray(block.ids),
    );
}

export function readSessionPlan(expected: SessionPlanStorageScope): SessionPlan | null {
  try {
    const raw = window.localStorage.getItem(sessionPlanStorageKey(expected));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredSessionPlan>;
    if (
      value.version !== VERSION ||
      value.dayKey !== expected.dayKey ||
      value.scopeKey !== expected.scopeKey ||
      value.goalVersionId !== expected.goalVersionId ||
      !isSessionPlan(value.plan)
    ) return null;
    return value.plan;
  } catch { return null; }
}

export function storeSessionPlan(scope: SessionPlanStorageScope, plan: SessionPlan): void {
  try {
    const value: StoredSessionPlan = { version: VERSION, ...scope, plan };
    window.localStorage.setItem(sessionPlanStorageKey(scope), JSON.stringify(value));
  } catch { /* optional cache */ }
}

function ordinal(dayKey: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return null;
  const value = Date.parse(`${dayKey}T00:00:00Z`);
  return Number.isFinite(value) ? Math.floor(value / 86_400_000) : null;
}

/** Removes only this feature's plans older than the retained local-day window. */
export function pruneSessionPlans(todayDayKey: string): void {
  try {
    const today = ordinal(todayDayKey);
    if (today === null) return;
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(PREFIX)) continue;
      const dayKey = key.slice(PREFIX.length, PREFIX.length + 10);
      const day = ordinal(dayKey);
      if (day !== null && day < today - (RETENTION_DAYS - 1)) window.localStorage.removeItem(key);
    }
  } catch { /* optional cache */ }
}
