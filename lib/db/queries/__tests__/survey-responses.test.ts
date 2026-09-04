import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockOnConflictDoNothing = vi.fn();
const mockReturning = vi.fn();
const mockSelect = vi.fn();

vi.mock('../../client', () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

import { getUserSurveyResponses, recordSurveyResponseIfAbsent } from '../survey-responses';

describe('recordSurveyResponseIfAbsent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReturning.mockResolvedValue([]);
    mockOnConflictDoNothing.mockReturnValue({ returning: mockReturning });
    mockValues.mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });
    mockInsert.mockReturnValue({ values: mockValues });
  });

  it('returns its own row when the insert wins the race', async () => {
    mockReturning.mockResolvedValue([
      { userId: 'user-1', surveyId: 'bug_check', choice: 'no_issues', freeText: null, dismissed: false },
    ]);

    const result = await recordSurveyResponseIfAbsent('user-1', 'bug_check', {
      choice: 'no_issues',
      freeText: null,
      dismissed: false,
    });

    expect(result).toEqual({ choice: 'no_issues', freeText: null, dismissed: false });
    // Never reads back on the winning path — no conflict to resolve.
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('write-once: on conflict, returns the row that already stands (not its own payload)', async () => {
    // The insert lost the race — another write already landed for this pair.
    mockReturning.mockResolvedValue([]);
    mockSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve([
              {
                userId: 'user-1',
                surveyId: 'bug_check',
                choice: 'minor_issues',
                freeText: 'slow sync',
                dismissed: false,
              },
            ]),
        }),
      }),
    });

    const result = await recordSurveyResponseIfAbsent('user-1', 'bug_check', {
      choice: 'no_issues',
      freeText: null,
      dismissed: false,
    });

    // The caller's own answer ("no_issues") did not win — the standing row did.
    expect(result).toEqual({ choice: 'minor_issues', freeText: 'slow sync', dismissed: false });
  });

  it('a dismissal loses the same way to an earlier answer', async () => {
    mockReturning.mockResolvedValue([]);
    mockSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve([
              {
                userId: 'user-1',
                surveyId: 'recent_changes',
                choice: 'great',
                freeText: null,
                dismissed: false,
              },
            ]),
        }),
      }),
    });

    const result = await recordSurveyResponseIfAbsent('user-1', 'recent_changes', {
      choice: null,
      freeText: null,
      dismissed: true,
    });

    expect(result).toEqual({ choice: 'great', freeText: null, dismissed: false });
  });
});

describe('getUserSurveyResponses', () => {
  it('returns a map keyed by survey id', async () => {
    mockSelect.mockReturnValue({
      from: () => ({
        where: () =>
          Promise.resolve([
            { userId: 'user-1', surveyId: 'bug_check', choice: 'no_issues', freeText: null, dismissed: false },
            { userId: 'user-1', surveyId: 'recent_changes', choice: null, freeText: null, dismissed: true },
          ]),
      }),
    });

    const result = await getUserSurveyResponses('user-1');

    expect(result).toEqual({
      bug_check: { choice: 'no_issues', freeText: null, dismissed: false },
      recent_changes: { choice: null, freeText: null, dismissed: true },
    });
  });
});
