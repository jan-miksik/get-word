import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncResponse } from '@/features/sync/types';

const mockListOps = vi.fn();

vi.mock('../availability', () => ({
  ensureLocalFirstAvailability: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('../outbox', () => ({
  listOps: () => mockListOps(),
}));

import { applyPendingOutboxToSyncResponse } from '../hydrate';

function baseResponse(): SyncResponse {
  return {
    success: true,
    user: { id: 'user-1' },
    progress: {},
    memory_hooks: {},
    survey_responses: {},
    category_filters: [],
  } as unknown as SyncResponse;
}

function surveyResponseOp(payload: {
  surveyId: string;
  choice: string | null;
  freeText: string | null;
  dismissed: boolean;
}) {
  return {
    entity: 'survey_response' as const,
    opType: 'set' as const,
    clientOpId: 'op-1',
    clientCreatedAt: new Date().toISOString(),
    deviceId: 'device-1',
    attempts: 0,
    payload,
  };
}

describe('applyPendingOutboxToSyncResponse — survey_response pending guard', () => {
  beforeEach(() => {
    mockListOps.mockReset();
  });

  it('fills in a pending local answer the server snapshot does not know about yet', async () => {
    mockListOps.mockResolvedValue([
      surveyResponseOp({ surveyId: 'bug_check', choice: 'no_issues', freeText: null, dismissed: false }),
    ]);

    const result = await applyPendingOutboxToSyncResponse(baseResponse());

    expect(result.survey_responses?.bug_check).toEqual({
      choice: 'no_issues',
      free_text: null,
      dismissed: false,
    });
  });

  it('never lets a pending local write override a value the server already reported (write-once, first-server-write wins)', async () => {
    mockListOps.mockResolvedValue([
      surveyResponseOp({ surveyId: 'bug_check', choice: 'no_issues', freeText: null, dismissed: false }),
    ]);

    const server = baseResponse();
    // Another device's answer already landed on the server first.
    server.survey_responses = {
      bug_check: { choice: 'minor_issues', free_text: 'slow sync', dismissed: false },
    };

    const result = await applyPendingOutboxToSyncResponse(server);

    expect(result.survey_responses?.bug_check).toEqual({
      choice: 'minor_issues',
      free_text: 'slow sync',
      dismissed: false,
    });
  });

  // An "unchanged" conditional GET carries no survey state at all. Defaulting
  // it to `{}` here made an empty map indistinguishable from the server saying
  // "you have answered nothing", and the apply path treats that as an
  // authoritative full replace — so a survey the learner had already answered
  // came back the next time the app returned to the foreground with anything
  // sitting in the outbox.
  it('leaves survey_responses absent when the payload does not carry it', async () => {
    mockListOps.mockResolvedValue([
      // Some unrelated op, so the outbox is not empty and the overlay runs.
      { ...surveyResponseOp({ surveyId: 'bug_check', choice: 'no_issues', freeText: null, dismissed: false }),
        entity: 'game_score' as const, opType: 'max' as const, payload: { score: 3 } },
    ]);

    const unchanged = baseResponse();
    delete (unchanged as { survey_responses?: unknown }).survey_responses;

    const result = await applyPendingOutboxToSyncResponse(unchanged);

    expect(result.survey_responses).toBeUndefined();
  });

  it('fills in a pending dismissal the same way', async () => {
    mockListOps.mockResolvedValue([
      surveyResponseOp({ surveyId: 'recent_changes', choice: null, freeText: null, dismissed: true }),
    ]);

    const result = await applyPendingOutboxToSyncResponse(baseResponse());

    expect(result.survey_responses?.recent_changes).toEqual({
      choice: null,
      free_text: null,
      dismissed: true,
    });
  });
});
