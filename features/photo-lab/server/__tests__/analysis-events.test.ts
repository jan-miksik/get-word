import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  values: vi.fn(),
  insert: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  db: { insert: (...args: unknown[]) => mocks.insert(...args) },
}));
vi.mock('@/lib/db/schema', () => ({ photoAnalysisEvents: { __table: 'photo_analysis_events' } }));

import { recordPhotoAnalysisEvent } from '../analysis-events';

describe('recordPhotoAnalysisEvent', () => {
  beforeEach(() => {
    mocks.insert.mockReset();
    mocks.values.mockReset();
    mocks.insert.mockReturnValue({ values: mocks.values });
    mocks.values.mockResolvedValue(undefined);
  });

  it('inserts one behaviour-only row (count, not content)', async () => {
    await recordPhotoAnalysisEvent({ userId: 'u1', labelCount: 5, languageFrom: 'en', languageTo: 'cs' });

    expect(mocks.values).toHaveBeenCalledWith({
      userId: 'u1',
      labelCount: 5,
      languageFrom: 'en',
      languageTo: 'cs',
    });
  });

  it('clamps a negative or fractional label count to a non-negative integer', async () => {
    await recordPhotoAnalysisEvent({ userId: 'u1', labelCount: -3, languageFrom: 'en', languageTo: 'cs' });
    expect(mocks.values).toHaveBeenLastCalledWith(expect.objectContaining({ labelCount: 0 }));

    await recordPhotoAnalysisEvent({ userId: 'u1', labelCount: 2.9, languageFrom: 'en', languageTo: 'cs' });
    expect(mocks.values).toHaveBeenLastCalledWith(expect.objectContaining({ labelCount: 2 }));
  });

  it('is best-effort: swallows a DB failure so it can never fail the analysis', async () => {
    mocks.values.mockRejectedValue(new Error('db down'));

    await expect(
      recordPhotoAnalysisEvent({ userId: 'u1', labelCount: 1, languageFrom: 'en', languageTo: 'cs' }),
    ).resolves.toBeUndefined();
  });
});
