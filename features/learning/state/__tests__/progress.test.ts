import { describe, expect, it } from 'vitest';
import { serializeProgressForSync } from '../progress';

describe('serializeProgressForSync', () => {
  it('maps legacy word ids to word_id payloads', () => {
    expect(
      serializeProgressForSync({
        w001: { stageIndex: 1, knownCount: 2, unknownCount: 3 },
      })
    ).toEqual([
      {
        word_id: 'w001',
        stage_index: 1,
        known_count: 2,
        unknown_count: 3,
        last_known_at: null,
        last_unknown_at: null,
        next_due_at: null,
      },
    ]);
  });

  it('maps uuid ids to word_list_item_id payloads', () => {
    expect(
      serializeProgressForSync({
        '123e4567-e89b-12d3-a456-426614174000': { stageIndex: 4, knownCount: 5, unknownCount: 1 },
      })
    ).toEqual([
      {
        word_list_item_id: '123e4567-e89b-12d3-a456-426614174000',
        stage_index: 4,
        known_count: 5,
        unknown_count: 1,
        last_known_at: null,
        last_unknown_at: null,
        next_due_at: null,
      },
    ]);
  });
});
