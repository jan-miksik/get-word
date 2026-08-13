import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import type { NormalizedWord } from '@/lib/words';
import { MultipleChoiceGame } from '../MultipleChoiceGame';
import { MatchingPairsGame } from '../MatchingPairsGame';
import { TypingChallengeGame } from '../TypingChallengeGame';

/**
 * The interface is deliberately left translatable so Chrome/Edge can render it
 * in languages the app does not ship (see `app/layout.tsx`, which no longer
 * carries a document-wide `translate="no"`). That makes every element holding
 * list content responsible for opting itself out — otherwise the browser
 * rewrites the very words the learner is being quizzed on, while grading still
 * compares against untranslated state.
 *
 * These assertions exist so removing an opt-out fails a test rather than
 * silently corrupting study content in one locale.
 */

const WORDS: NormalizedWord[] = [
  { id: 'a', cz: 'pes', vi: 'con chó', en: '', category: ['word'] },
  { id: 'b', cz: 'kočka', vi: 'con mèo', en: '', category: ['word'] },
  { id: 'c', cz: 'auto', vi: 'xe hơi', en: '', category: ['word'] },
  { id: 'd', cz: 'voda', vi: 'nước', en: '', category: ['word'] },
];

/** The nearest ancestor (or self) that opts out of browser translation. */
function translationOptOut(element: HTMLElement): HTMLElement | null {
  return element.closest<HTMLElement>('[translate="no"]');
}

function expectOptedOut(element: HTMLElement) {
  const guard = translationOptOut(element);
  expect(guard).not.toBeNull();
  // Both forms: `translate` is the standard, `notranslate` is what Google
  // Translate has always honoured.
  expect(guard).toHaveClass('notranslate');
}

describe('study text opts out of browser translation', () => {
  it('protects the prompt and every option in the multiple-choice game', () => {
    render(<MultipleChoiceGame words={WORDS} role="knownLanguage" />);

    expectOptedOut(screen.getByText('pes'));
    for (const word of WORDS) {
      expectOptedOut(screen.getByRole('button', { name: word.vi }));
    }
  });

  it('protects the revealed answer after a wrong multiple-choice pick', () => {
    render(<MultipleChoiceGame words={WORDS} role="knownLanguage" />);

    fireEvent.click(screen.getByRole('button', { name: 'con mèo' }));

    // The option button also reads "con chó", so anchor on the feedback marker.
    expectOptedOut(screen.getByText(/^✗\s+con chó$/));
  });

  it('protects both columns of the matching game', () => {
    render(<MatchingPairsGame words={WORDS} role="knownLanguage" />);

    for (const word of WORDS) {
      expectOptedOut(screen.getByRole('button', { name: word.cz }));
      expectOptedOut(screen.getByRole('button', { name: word.vi }));
    }
  });

  it('protects the prompt and the correct answer in the typing game', () => {
    render(<TypingChallengeGame words={WORDS} role="knownLanguage" />);

    expectOptedOut(screen.getByText('pes'));

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'zzz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));

    expectOptedOut(screen.getByText('con chó'));
  });
});
