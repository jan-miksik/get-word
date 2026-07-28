'use client';

import { useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { WordChatFlow } from './WordChatFlow';
import type { WordChatStep } from '../hooks/useWordChat';

type Props = {
  languageFrom: string;
  languageTo: string;
  baseListId?: string | null;
  refreshAfterCommit?: () => Promise<void>;
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
  active = true,
  onCommitted,
}: Props) {
  const { t } = useI18n();
  const [step, setStep] = useState<WordChatStep>('chat');

  return (
    <div className="mx-auto flex w-full max-w-[800px] flex-col px-3 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-4 sm:pb-8">
      <section className="onboarding-card relative w-full rounded-2xl! border-2! p-4 sm:p-7">
        <div className="mb-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="justify-self-start rounded-full border-2 border-[#2A2218]/60 bg-[#F4EFE2]/70 px-3.5 py-2 text-xs font-bold text-[#2A2218] transition hover:-translate-y-0.5 hover:border-[#2A2218] hover:bg-[#FFF8E8] hover:shadow-md"
          >
            ← {t('wordChat.back')}
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
          active={active}
          embedded
          onCommitted={onCommitted}
        />
      </section>
    </div>
  );
}
