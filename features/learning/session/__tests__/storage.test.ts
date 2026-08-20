import { beforeEach, describe, expect, it } from 'vitest';
import { planSessionBlocks } from '../blocks';
import type { SessionPlan } from '../plan';
import { pruneSessionPlans, readSessionPlan, sessionPlanStorageKey, storeSessionPlan } from '../storage';

const scope = { dayKey: '2026-08-20', scopeKey: 'pair:cs:vi|categories:all', goalVersionId: 'goal-1' };
const plan: SessionPlan = {
  enabled: true, sessionItemCap: 5, priorityIds: [], dueIds: ['r0'], newIds: ['n0'],
  deferredDueCount: 0, reason: 'normal', blocks: planSessionBlocks(['r0'], ['n0']),
};

describe('session-plan storage', () => {
  beforeEach(() => localStorage.clear());

  it('validates its envelope and rejects pre-block payloads', () => {
    storeSessionPlan(scope, plan);
    expect(readSessionPlan(scope)).toEqual(plan);
    expect(readSessionPlan({ ...scope, scopeKey: 'other' })).toBeNull();
    localStorage.setItem(sessionPlanStorageKey(scope), JSON.stringify({ version: 1, ...scope, plan: { ...plan, blocks: undefined } }));
    expect(readSessionPlan(scope)).toBeNull();
  });

  it('retains only the latest fourteen local days', () => {
    const oldScope = { ...scope, dayKey: '2026-08-01' };
    storeSessionPlan(oldScope, plan);
    storeSessionPlan(scope, plan);
    pruneSessionPlans(scope.dayKey);
    expect(localStorage.getItem(sessionPlanStorageKey(oldScope))).toBeNull();
    expect(localStorage.getItem(sessionPlanStorageKey(scope))).not.toBeNull();
  });
});
