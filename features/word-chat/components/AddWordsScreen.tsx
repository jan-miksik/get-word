'use client';

import { useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { RisingLettersBackground } from '@/components/RisingLettersBackground';
import { WordChatFlow } from './WordChatFlow';
import type { WordChatStep } from '../hooks/useWordChat';

type Props = {
  languageFrom: string;
  languageTo: string;
  baseListId?: string | null;
  refreshAfterCommit?: () => Promise<void>;
  /** Back to studying. */
  onClose: () => void;
  onCommitted: (result: {
    listId: string;
    categoryId: string | null;
    itemCount: number;
    takeoverCount: number;
    upgradedTakeoverCount: number;
  }) => void;
};

/**
 * "Add words" opened from inside the app.
 *
 * Deliberately not the onboarding screen: no account row, no UI-language
 * switcher, no ready-made-list offer, no language pickers. The learner has
 * already answered all of that — what is left is the chat itself, and a way
 * back to studying. The opener picks up from the stored brief (see
 * `/api/word-chat/context`), so a returning learner is not re-introduced to the
 * feature every time.
 */
export function AddWordsScreen({
  languageFrom,
  languageTo,
  baseListId,
  refreshAfterCommit,
  onClose,
  onCommitted,
}: Props) {
  const { t } = useI18n();
  const [step, setStep] = useState<WordChatStep>('chat');

  return (
    // Full-bleed on a phone: the card frame costs ~36px of horizontal room on
    // each side, which the word rows and the chat need more than the framing.
    // From `sm` up it becomes a card again, centred on the background.
    <div className="onboarding-screen flex min-h-screen items-start justify-center sm:px-4 sm:py-14">
      <RisingLettersBackground variant="ambient" className="z-0" />
      {/* `.onboarding-card` lives outside Tailwind's layers, so its border and
          radius beat plain utilities — dropping the frame needs `!`. */}
      <section className="onboarding-card relative z-10 min-h-screen w-full max-w-3xl rounded-none! border-0! p-4 sm:min-h-0 sm:rounded-2xl! sm:border-2! sm:p-7">
        <div className="mb-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="justify-self-start text-xs font-bold underline onboarding-text-soft"
          >
            {t('wordChat.back')}
          </button>
          {/* Every step past the chat carries its own heading. */}
          {step === 'chat' ? (
            <h1 className="text-center text-sm font-extrabold uppercase tracking-wide">
              {t('wordChat.addWords')}
            </h1>
          ) : (
            <span />
          )}
          <span />
        </div>

        <WordChatFlow
          languageFrom={languageFrom}
          languageTo={languageTo}
          baseListId={baseListId}
          refreshAfterCommit={refreshAfterCommit}
          onDone={onClose}
          onStepChange={setStep}
          settingsPlacement="screen-header"
          onCommitted={onCommitted}
        />
      </section>
    </div>
  );
}
