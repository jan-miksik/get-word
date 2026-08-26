import { describe, expect, it } from 'vitest';
import { hasDistinctVisibleAnswers } from '@/features/learning/minigames/word-pool';
import { resolveVariantDistractors } from '@/features/learning/fine-tune/distractors';
import { pickMatchRound } from '@/features/learning/fine-tune/pick';
import { DEFAULT_FINE_TUNE_CONFIG } from '@/features/learning/fine-tune/config';
import type { NormalizedWord } from '@/lib/words';

const word = (id: string, cz: string, vi: string): NormalizedWord => ({
  id,
  cz,
  vi,
  en: '',
  category: ['word'],
});

/**
 * The two cards of an address-form pair ask the SAME question ("How are you?")
 * and accept different answers. Putting them in one round makes it
 * unanswerable: the learner cannot tell which of the two is wanted, and one of
 * their two defensible answers is marked wrong.
 *
 * This is already prevented by `hasDistinctVisibleAnswers`, which every
 * candidate has to pass and which requires both sides to differ. These tests
 * pin that down, because the invariant now carries weight it did not before —
 * until address-form pairs existed, two items sharing a source side were not a
 * thing the app produced on purpose.
 */
const familiarTwin = word('twin-familiar', 'How are you?', 'Wie geht es dir?');
const politeTwin = word('twin-polite', 'How are you?', 'Wie geht es Ihnen?');

describe('address-form twins in minigames', () => {
  it('twins fail the shared-side check that every candidate must pass', () => {
    expect(hasDistinctVisibleAnswers(familiarTwin, politeTwin)).toBe(false);
    // A genuinely unrelated word still passes.
    expect(hasDistinctVisibleAnswers(familiarTwin, word('x', 'bread', 'Brot'))).toBe(true);
  });

  it('never offers a twin as a distractor in a choice round', () => {
    const pool = [
      familiarTwin,
      politeTwin,
      word('a', 'bread', 'Brot'),
      word('b', 'water', 'Wasser'),
      word('c', 'house', 'Haus'),
      word('d', 'cat', 'Katze'),
    ];

    const resolved = resolveVariantDistractors({
      target: familiarTwin,
      pool,
      count: 3,
      band: 'I',
      minInBand: () => 0,
      random: () => 0.5,
    });

    expect(resolved).not.toBeNull();
    expect(resolved?.distractors.map((w) => w.id)).not.toContain('twin-polite');
  });

  it('never puts both twins in one matching round', () => {
    const pool = [
      familiarTwin,
      politeTwin,
      word('a', 'bread', 'Brot'),
      word('b', 'water', 'Wasser'),
      word('c', 'house', 'Haus'),
      word('d', 'cat', 'Katze'),
      word('e', 'dog', 'Hund'),
      word('f', 'tree', 'Baum'),
    ];

    // Sweep seeds: the round is randomized, so one lucky pass proves nothing.
    for (let seed = 0; seed < 50; seed += 1) {
      const round = pickMatchRound({
        anchor: familiarTwin,
        stageIndex: 5,
        config: DEFAULT_FINE_TUNE_CONFIG,
        pool,
        seed,
      });
      if (!round) continue;
      const ids = round.words.map((w) => w.id);
      expect(ids).toContain('twin-familiar');
      expect(ids).not.toContain('twin-polite');
    }
  });
});
