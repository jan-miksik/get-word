import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STUDY_NOTE_MINIMIZE_FROM_STAGE,
  normalizeStudyNoteMinimizeFromStage,
  shouldMinimizeStudyNoteForStage,
} from '@/lib/words';

describe('normalizeStudyNoteMinimizeFromStage', () => {
  it('keeps valid in-range stages', () => {
    expect(normalizeStudyNoteMinimizeFromStage(3)).toBe(3);
  });

  it('falls back to the default for out-of-range or junk values', () => {
    expect(normalizeStudyNoteMinimizeFromStage(0)).toBe(DEFAULT_STUDY_NOTE_MINIMIZE_FROM_STAGE);
    expect(normalizeStudyNoteMinimizeFromStage(99)).toBe(DEFAULT_STUDY_NOTE_MINIMIZE_FROM_STAGE);
    expect(normalizeStudyNoteMinimizeFromStage('nope')).toBe(
      DEFAULT_STUDY_NOTE_MINIMIZE_FROM_STAGE,
    );
  });
});

describe('shouldMinimizeStudyNoteForStage', () => {
  it('expands below the cutoff and minimizes at/above it', () => {
    expect(shouldMinimizeStudyNoteForStage(1, 2)).toBe(false);
    expect(shouldMinimizeStudyNoteForStage(2, 2)).toBe(true);
    expect(shouldMinimizeStudyNoteForStage(5, 2)).toBe(true);
  });

  it('treats a junk cutoff as the default (stage 2)', () => {
    expect(shouldMinimizeStudyNoteForStage(2, Number.NaN)).toBe(true);
    expect(shouldMinimizeStudyNoteForStage(1, Number.NaN)).toBe(false);
  });
});
