'use client';

import { useCallback, useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { LanguagePairChangedBanner } from './LanguagePairChangedBanner';
import { WordChatFlow } from './WordChatFlow';
import type { WordChatStep } from '../hooks/useWordChat';

type Props = {
  languageFrom: string;
  languageTo: string;
  baseListId?: string | null;
  refreshAfterCommit?: () => Promise<void>;
  /** Persists the chat's pair as the app-wide learning-language preference. */
  onLanguagePairChange: (pair: { from: string; to: string }) => void | Promise<void>;
  /** Back to studying. */
  onClose: () => void;
  /** Whether this mounted workspace surface is currently visible. */
  active?: boolean;
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
 * Deliberately not the onboarding screen: no account row and no ready-made-list
 * offer. The opener picks up from the stored brief (see
 * `/api/word-chat/context`) so a returning learner is not re-introduced every
 * time.
 */
export function AddWordsScreen({
  languageFrom,
  languageTo,
  baseListId,
  refreshAfterCommit,
  onLanguagePairChange,
  active = true,
  onCommitted,
}: Props) {
  const { t } = useI18n();
  const [step, setStep] = useState<WordChatStep>('chat');
  const [headerBackAction, setHeaderBackAction] = useState<(() => void) | null>(null);
  const [changedPair, setChangedPair] = useState<{ from: string; to: string } | null>(null);
  const changeLanguagePair = useCallback(
    async (nextPair: { from: string; to: string }) => {
      if (nextPair.from === languageFrom && nextPair.to === languageTo) return;
      await onLanguagePairChange(nextPair);
      setChangedPair(nextPair);
      setStep('chat');
    },
    [languageFrom, languageTo, onLanguagePairChange],
  );
  const stayInChatAfterDone = useCallback(() => {
    setStep('chat');
  }, []);
  const handleHeaderBackActionChange = useCallback((action: (() => void) | null) => {
    setHeaderBackAction(action ? () => action : null);
  }, []);

  return (
    // Full-bleed on a phone: the chat is the whole screen there, so the card's
    // side gutters and rounded corners only cost width that word chips, inputs
    // and the transcript can use. From `sm` up it goes back to a card.
    <div className="mx-auto flex w-full max-w-[800px] flex-col px-0 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-4 sm:pb-8">
      <section className="onboarding-card relative w-full rounded-2xl! border-2! p-4 max-sm:rounded-none! max-sm:border-x-0! max-sm:border-t-0! max-sm:px-3 sm:p-7">
        <div className="mb-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          {headerBackAction ? (
            <button
              type="button"
              onClick={headerBackAction}
              className="justify-self-start rounded-full border-2 border-[#2A2218]/60 bg-[#F4EFE2]/70 px-3.5 py-2 text-xs font-bold text-[#2A2218] transition hover:-translate-y-0.5 hover:border-[#2A2218] hover:bg-[#FFF8E8] hover:shadow-md"
            >
              ← {t('wordChat.back')}
            </button>
          ) : (
            <span />
          )}
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

        {changedPair ? (
          <LanguagePairChangedBanner
            pair={changedPair}
            onDismiss={() => setChangedPair(null)}
          />
        ) : null}

        <WordChatFlow
          key={`${languageFrom}\u0000${languageTo}`}
          languageFrom={languageFrom}
          languageTo={languageTo}
          baseListId={baseListId}
          refreshAfterCommit={refreshAfterCommit}
          onLanguagePairChange={changeLanguagePair}
          onDone={stayInChatAfterDone}
          doneActionLabel={t('wordChat.back')}
          onStepChange={setStep}
          onHeaderBackActionChange={handleHeaderBackActionChange}
          settingsPlacement="screen-header"
          active={active}
          embedded
          onCommitted={onCommitted}
        />
      </section>
    </div>
  );
}
