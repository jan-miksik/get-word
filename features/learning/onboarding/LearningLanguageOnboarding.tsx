'use client';

import { useCallback, useState } from 'react';
import { isReverseDirectionList } from '@/features/learning/onboarding/listRecommendations';
import { formatNumber } from '@/features/learning/onboarding/commonListAudioGeneration';
import { useI18n } from '@/components/I18nProvider';
import { RisingLettersBackground } from '@/components/RisingLettersBackground';
import { SupportButton, SUPPORT_TELEGRAM_URL } from '@/components/SupportButton';
import { OnboardingGenerationOverlay } from './OnboardingGenerationOverlay';
import { LanguageCombobox } from '@/features/shared/languages/LanguageCombobox';
import { OnboardingLanguageSwitcher } from './OnboardingLanguageSwitcher';
import { useLearningOnboardingActions } from './useLearningOnboardingActions';
import { useLearningOnboardingData } from './useLearningOnboardingData';
import { LanguagePairChangedBanner } from '@/features/word-chat/components/LanguagePairChangedBanner';
import { WordChatFlow } from '@/features/word-chat/components/WordChatFlow';
import type { WordChatStep } from '@/features/word-chat/hooks/useWordChat';

export {
  estimateCommonListGenerationSeconds,
  formatDurationEstimate,
  pickAutogenerateCommonSeed,
  sortMatchedWordLists,
} from '@/features/learning/onboarding/listRecommendations';

type Props = {
  initialFrom?: string | null;
  initialTo?: string | null;
  /** Skip the pickers and open the word chat straight away (landing-page hand-off). */
  autoOpenWordChat?: boolean;
  accountEmail?: string;
  onSignOut?: () => void | Promise<void>;
  /**
   * Leave this screen without finishing it. Only set when the learner already
   * has a list to go back to — someone who opened the word chat from the app
   * menu must not be stuck here because they changed their mind.
   */
  onExit?: () => void;
  onComplete: (languageFrom: string, languageTo: string) => void | Promise<void>;
  onSelectList: (listId: string) => void;
};

export function LearningLanguageOnboarding({
  initialFrom,
  initialTo,
  autoOpenWordChat = false,
  accountEmail,
  onSignOut,
  onExit,
  onComplete,
  onSelectList,
}: Props) {
  const { t } = useI18n();
  const {
    languages,
    loadingLanguages,
    languageFrom,
    setLanguageFrom,
    languageTo,
    setLanguageTo,
    matches,
    recommendedList,
    recommendedReason,
    matchesLoadFailed,
    loadingMatches,
    commonListEstimate,
    targetLanguage,
    canContinue,
    languagePairLabel,
    hasFallbackSeedRecommendation,
    hasReverseRecommendation,
    reverseRecommendationSourceName,
    showAutogenerateCommonList,
  } = useLearningOnboardingData({ initialFrom, initialTo });

  const {
    workingId,
    generationStatus,
    error,
    selectMatchedList,
    completeWithWordChat,
    forkList,
    goToListsForExisting,
    autogenerateCommonList,
    createOwnList,
  } = useLearningOnboardingActions({
    languageFrom,
    languageTo,
    canContinue,
    onComplete,
    onSelectList,
  });

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [wordChatOpen, setWordChatOpen] = useState(autoOpenWordChat);
  const [wordChatStep, setWordChatStep] = useState<WordChatStep>('chat');
  const [wordChatChangedPair, setWordChatChangedPair] =
    useState<{ from: string; to: string } | null>(null);
  const [wordChatBackAction, setWordChatBackAction] = useState<(() => void) | null>(null);
  // Above the keyed WordChatFlow, so the settings modal survives the remount a
  // language-pair change forces.
  const [wordChatSettingsOpen, setWordChatSettingsOpen] = useState(false);
  const updateWordChatBackAction = useCallback((action: (() => void) | null) => {
    setWordChatBackAction(() => action);
  }, []);

  // Reverse-direction lists are never offered for direct selection: subscribing
  // to one would study it the wrong way round. They are surfaced only as the
  // "flip into your direction" autogenerate option, so we hide them from the
  // matched-list picker and only ever act on exact-direction matches here.
  const exactDirectionMatches = matches.filter(
    (list) => !isReverseDirectionList(list, languageFrom, languageTo),
  );

  // The primary "Continue" button opens the word chat, which builds the learner
  // a small personal list from what they actually need the language for. It
  // replaces the old behaviour of silently subscribing to a recommended list or
  // autogenerating a ~120-word common one.
  //
  // Those paths are not gone — `startReadyMadeList` below keeps them available
  // as the fallback when the model is unavailable. Nobody is trapped in a
  // conversation if the LLM is down.
  function handleContinue() {
    if (!canContinue || loadingMatches || matchesLoadFailed || workingId !== null) return;
    setWordChatOpen(true);
  }

  // The escape hatch, and the old Continue behaviour: subscribe to the
  // recommended exact-direction list when one exists, otherwise autogenerate a
  // common list (including flipping a reverse-direction recommendation into the
  // requested direction). Public-but-not-recommended exact matches are
  // deliberately NOT auto-selected — they remain a manual pick under advanced
  // options — and a seed-only recommendation is not forked, because forking
  // opens the editor with an untranslated list.
  function startReadyMadeList() {
    if (workingId !== null) return;
    if (recommendedList && recommendedReason === 'exact') {
      void selectMatchedList(recommendedList);
    } else {
      void autogenerateCommonList();
    }
  }

  function wordUnit(count: number) {
    return count === 1 ? t('onboarding.wordOne') : t('onboarding.wordOther');
  }

  function getItemCountLabel(count: number | undefined) {
    const safeCount = count ?? 0;
    return `${safeCount} ${wordUnit(safeCount)}`;
  }

  const introBlock = (
    <>
      <p className="hidden text-sm leading-relaxed onboarding-text-soft md:block">
        {t('onboarding.intro')}
      </p>
      <p className="text-sm leading-relaxed onboarding-text-soft md:hidden">
        {t('onboarding.introMobile')}
      </p>
    </>
  );

  const handleWordChatBack = () => {
    if (wordChatBackAction) {
      wordChatBackAction();
      return;
    }
    if (onExit) onExit();
    else setWordChatOpen(false);
  };

  return (
    <div
      className={[
        'onboarding-screen min-h-screen flex items-start justify-center py-8 sm:py-14',
        wordChatOpen ? 'px-1 sm:px-4' : 'px-4',
      ].join(' ')}
    >
      <RisingLettersBackground variant="ambient" className="z-0" />
      <SupportButton />
      {generationStatus ? <OnboardingGenerationOverlay status={generationStatus} /> : null}
      <section
        className={[
          'onboarding-card relative z-10 w-full max-w-3xl sm:p-7',
          wordChatOpen ? 'p-4' : 'p-5',
        ].join(' ')}
      >
        {!wordChatOpen ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          {accountEmail && onSignOut ? (
            <div className="relative flex min-w-0 items-center">
              <button
                type="button"
                onClick={() => setAccountMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={accountMenuOpen}
                title={accountEmail}
                className="flex min-w-0 items-center gap-2 rounded-full px-1.5 py-1 onboarding-text-soft transition-opacity hover:opacity-80"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full bg-[color:var(--ob-accent)]"
                  aria-hidden="true"
                />
                <span className="truncate text-xs font-semibold">{accountEmail}</span>
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 20 20"
                  fill="none"
                  className={`shrink-0 transition-transform duration-200 ${accountMenuOpen ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                >
                  <path
                    d="M5 8l5 5 5-5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              {accountMenuOpen ? (
                <>
                  <button
                    type="button"
                    aria-hidden="true"
                    tabIndex={-1}
                    className="fixed inset-0 z-[70] cursor-default"
                    onClick={() => setAccountMenuOpen(false)}
                  />
                  <div
                    role="menu"
                    className="onboarding-card absolute left-0 top-full z-[71] mt-1 min-w-[8rem] p-1"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        void onSignOut();
                      }}
                      className="w-full rounded-md px-3 py-2 text-left text-xs font-bold onboarding-text-soft transition-colors hover:bg-[color:var(--ob-surface-hover)]"
                    >
                      {t('common.signOut')}
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          ) : accountEmail ? (
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="h-2 w-2 shrink-0 rounded-full bg-[color:var(--ob-accent)]"
                aria-hidden="true"
              />
              <span
                className="truncate text-xs font-semibold onboarding-text-soft"
                title={accountEmail}
              >
                {accountEmail}
              </span>
            </div>
          ) : (
            <span />
          )}
          <OnboardingLanguageSwitcher />
        </div>
        ) : null}
        {wordChatOpen ? (
          <>
            <div className="mb-5 grid min-h-10 grid-cols-[1fr_auto_1fr] items-center gap-3">
              <button
                type="button"
                onClick={handleWordChatBack}
                className="justify-self-start text-xs font-bold underline onboarding-text-soft"
              >
                {t('wordChat.back')}
              </button>
              {/* Only the chat needs a screen title; the later steps carry their
                  own heading, and two stacked titles just say the same thing. */}
              {wordChatStep === 'chat' ? (
                <h1 className="text-center text-sm font-extrabold uppercase tracking-wide">
                  {t('wordChat.title')}
                </h1>
              ) : (
                <span />
              )}
              <span />
            </div>
            {wordChatChangedPair ? (
              <LanguagePairChangedBanner
                pair={wordChatChangedPair}
                onDismiss={() => setWordChatChangedPair(null)}
              />
            ) : null}
            <WordChatFlow
              key={`${languageFrom}\u0000${languageTo}`}
              languageFrom={languageFrom}
              languageTo={languageTo}
              onLanguagePairChange={({ from, to }) => {
                setLanguageFrom(from);
                setLanguageTo(to);
                setWordChatChangedPair({ from, to });
                setWordChatStep('chat');
              }}
              onStepChange={setWordChatStep}
              onHeaderBackActionChange={updateWordChatBackAction}
              settingsPlacement="screen-header"
              settingsOpen={wordChatSettingsOpen}
              onSettingsOpenChange={setWordChatSettingsOpen}
              onUseReadyMade={() => {
                setWordChatOpen(false);
                startReadyMadeList();
              }}
              onCommitted={(result) => {
                void completeWithWordChat(result.listId);
              }}
            />
          </>
        ) : (
        <>
        {!advancedOpen ? (
        <>
        <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
          <LanguageCombobox
            id="language-from"
            label={t('onboarding.iKnow')}
            value={languageFrom}
            languages={languages}
            loading={loadingLanguages}
            onChange={setLanguageFrom}
            disabledCodes={languageTo ? [languageTo] : []}
          />
          <LanguageCombobox
            id="language-to"
            label={t('onboarding.iWantToLearn')}
            value={languageTo}
            languages={languages}
            loading={loadingLanguages}
            onChange={setLanguageTo}
            disabledCodes={languageFrom ? [languageFrom] : []}
            highlight
          />
        </div>

        {targetLanguage && !targetLanguage.ttsAvailable ? (
          <p className="onboarding-notice mt-3 rounded-md px-3 py-2 text-xs">
            {t('onboarding.ttsUnavailable', { language: targetLanguage.name })}
          </p>
        ) : null}

        {languageFrom === languageTo ? (
          <p className="onboarding-text-soft mt-3 text-sm">{t('onboarding.samePairWarning')}</p>
        ) : null}
        </>
        ) : null}

        <div className="onboarding-divider mt-6 pt-5">
          {!advancedOpen ? (
            <div
              className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${
                canContinue ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
              }`}
            >
              <div
                className={`min-h-0 overflow-hidden ${canContinue ? '' : 'pointer-events-none'}`}
                aria-hidden={!canContinue}
              >
                <div className="space-y-3 px-1 pt-1">
                  <button
                    type="button"
                    className="onboarding-option onboarding-option-highlight group flex w-full items-center justify-center gap-2 rounded-xl px-5 py-4 text-center text-lg font-extrabold shadow-sm transition-all duration-150 enabled:hover:-translate-y-0.5 enabled:hover:shadow-lg enabled:hover:brightness-110 enabled:active:translate-y-0 enabled:active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={handleContinue}
                    disabled={!canContinue || loadingMatches || matchesLoadFailed || workingId !== null}
                  >
                    {workingId !== null ? t('onboarding.autogenerating') : t('onboarding.continue')}
                    {workingId === null ? (
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 20 20"
                        fill="none"
                        className="transition-transform duration-150 group-enabled:group-hover:translate-x-1"
                        aria-hidden="true"
                      >
                        <path
                          d="M4 10h11M11 6l4 4-4 4"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : null}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <div
            className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
              advancedOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
            }`}
          >
            <div
              className={`min-h-0 overflow-hidden ${advancedOpen ? '' : 'pointer-events-none'}`}
              aria-hidden={!advancedOpen}
            >
          {!languageFrom || !languageTo ? null : loadingMatches ? (
            <div className="space-y-3">
              {introBlock}
              <p className="text-sm onboarding-text-soft">{t('onboarding.lookingForLists')}</p>
            </div>
          ) : matchesLoadFailed ? (
            <div className="space-y-3">
              {introBlock}
              <p className="text-sm onboarding-text-soft">{t('lists.loadFailed')}</p>
            </div>
          ) : exactDirectionMatches.length > 0 ? (
            <div className="space-y-3">
              {introBlock}
              {hasFallbackSeedRecommendation && recommendedList ? (
                <div className="flex items-stretch gap-2">
                  <div className="onboarding-option onboarding-option-highlight min-w-0 flex-1 px-3 py-2 text-left">
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="font-bold">{recommendedList.name}</span>
                      <span className="rounded-full border border-[var(--ob-ink)] bg-[var(--ob-surface)] px-2 py-0.5 text-[10px] font-black uppercase text-[color:var(--ob-ink)]">
                        {t('onboarding.seedBadge')}
                      </span>
                      <span className="text-xs text-[color:var(--ob-surface)] opacity-[0.85]">
                        {getItemCountLabel(recommendedList.itemCount)}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--ob-surface)] opacity-[0.85]">
                      {t('onboarding.noExactCreateFork')}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="onboarding-option-secondary shrink-0 self-center px-3 py-1.5 text-xs font-bold disabled:opacity-50"
                    disabled={workingId === `fork:${recommendedList.id}`}
                    onClick={() => forkList(recommendedList)}
                  >
                    {workingId === `fork:${recommendedList.id}` ? t('onboarding.forking') : t('onboarding.fork')}
                  </button>
                </div>
              ) : null}
              <h2 className="text-sm font-extrabold uppercase tracking-wide">
                {t('onboarding.existingLists', { pair: languagePairLabel })}
              </h2>
              {exactDirectionMatches.map((list) => {
                const isRecommended = list.id === recommendedList?.id && recommendedReason !== 'fallback_seed';
                const optionTextSoftClass = 'onboarding-text-soft';

                return (
                  <div key={list.id} className="flex items-stretch gap-2">
                    <button
                      type="button"
                      className={[
                        'onboarding-option min-w-0 flex-1 px-3 py-2 text-left disabled:opacity-50',
                        isRecommended ? 'onboarding-option-recommended' : '',
                      ].join(' ')}
                      disabled={workingId === list.id || workingId === `reverse:${list.id}`}
                      onClick={() => selectMatchedList(list)}
                    >
                      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="font-bold">{list.name}</span>
                        {isRecommended ? (
                          <span className="rounded-full border border-[var(--ob-accent)] bg-[var(--ob-surface)] px-2 py-0.5 text-[10px] font-black uppercase text-[color:var(--ob-accent)]">
                            {t('onboarding.recommendedBadge')}
                          </span>
                        ) : null}
                        <span className={`text-xs ${optionTextSoftClass}`}>{getItemCountLabel(list.itemCount)}</span>
                      </div>
                      <div className={`mt-1 text-xs ${optionTextSoftClass}`}>
                        {list.description?.trim() || (list.isOwner ? t('onboarding.yourList') : t('onboarding.publicList'))}
                      </div>
                    </button>
                    <button
                      type="button"
                      className="onboarding-option-secondary shrink-0 self-center px-3 py-1.5 text-xs font-bold disabled:opacity-50"
                      disabled={workingId === `fork:${list.id}`}
                      onClick={() => forkList(list)}
                    >
                      {workingId === `fork:${list.id}` ? t('onboarding.forking') : t('onboarding.fork')}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : hasReverseRecommendation && reverseRecommendationSourceName ? (
            <div className="space-y-3">
              {introBlock}
              <p className="onboarding-notice rounded-md px-3 py-2 text-xs font-bold leading-relaxed">
                {t('onboarding.reversedListNote', {
                  pair: languagePairLabel,
                  source: reverseRecommendationSourceName,
                })}
              </p>
            </div>
          ) : hasFallbackSeedRecommendation && recommendedList ? (
            <div className="space-y-3">
              <p className="text-sm onboarding-text-soft">
                {t('onboarding.noExactForPair', { pair: languagePairLabel })}
              </p>
              <div className="flex items-stretch gap-2">
                <div className="onboarding-option onboarding-option-highlight min-w-0 flex-1 px-3 py-2 text-left">
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="font-bold">{recommendedList.name}</span>
                    <span className="rounded-full border border-[var(--ob-ink)] bg-[var(--ob-surface)] px-2 py-0.5 text-[10px] font-black uppercase text-[color:var(--ob-ink)]">
                      seed
                    </span>
                    <span className="text-xs text-[color:var(--ob-surface)] opacity-[0.85]">
                      {getItemCountLabel(recommendedList.itemCount)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-[color:var(--ob-surface)] opacity-[0.85]">
                    {recommendedList.description?.trim() || t('onboarding.basicListSeed')}
                  </div>
                </div>
                <button
                  type="button"
                  className="onboarding-option-secondary shrink-0 self-center px-3 py-1.5 text-xs font-bold disabled:opacity-50"
                  disabled={workingId === `fork:${recommendedList.id}`}
                  onClick={() => forkList(recommendedList)}
                >
                  {workingId === `fork:${recommendedList.id}` ? t('onboarding.forking') : t('onboarding.fork')}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm onboarding-text-soft">
                {t('onboarding.noMatchingLists', { pair: languagePairLabel })}
              </p>
            </div>
          )}

          {!loadingMatches ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {!matchesLoadFailed && (showAutogenerateCommonList || !canContinue) ? (
                <button
                  type="button"
                  className="onboarding-option onboarding-option-recommended px-4 py-3 text-left disabled:opacity-50 sm:col-span-2"
                  onClick={autogenerateCommonList}
                  disabled={!canContinue || workingId === 'common'}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-extrabold">
                      {workingId === 'common'
                        ? t('onboarding.autogenerating')
                        : hasReverseRecommendation && reverseRecommendationSourceName
                          ? t('onboarding.autogenerateReversedList', {
                              source: reverseRecommendationSourceName,
                            })
                          : t('onboarding.autogenerateCommonList')}
                    </span>
                    <span className="rounded-full border border-[var(--ob-accent)] bg-[var(--ob-surface)] px-2 py-0.5 text-[10px] font-black uppercase text-[color:var(--ob-accent)]">
                      {t('onboarding.easiestBadge')}
                    </span>
                  </div>
                  <span className="mt-1 block text-xs onboarding-text-soft">
                    {commonListEstimate?.status === 'loading'
                      ? t('onboarding.checkingWordCount')
                      : hasReverseRecommendation && reverseRecommendationSourceName
                        ? commonListEstimate?.status === 'ready'
                          ? t('onboarding.willFlipWords', {
                              count: formatNumber(commonListEstimate.wordCount ?? 0),
                              unit: wordUnit(commonListEstimate.wordCount ?? 0),
                              source: reverseRecommendationSourceName,
                            })
                          : t('onboarding.willFlipWordsUnknown', {
                              source: reverseRecommendationSourceName,
                            })
                        : commonListEstimate?.status === 'ready'
                          ? t('onboarding.willGenerateWords', {
                              count: formatNumber(commonListEstimate.wordCount ?? 0),
                              unit: wordUnit(commonListEstimate.wordCount ?? 0),
                            })
                          : commonListEstimate?.status === 'unavailable'
                            ? t('onboarding.wordCountUnavailable')
                            : t('onboarding.mostUsedWordsHint')}
                  </span>
                  <span className="mt-1.5 block text-[11px] italic onboarding-text-soft">
                    {t('onboarding.autogeneratedNote')}
                  </span>
                </button>
              ) : null}
              {!matchesLoadFailed && matches.length === 0 ? (
                <button
                  type="button"
                  className="onboarding-option px-4 py-3 text-left"
                  onClick={goToListsForExisting}
                  disabled={!canContinue}
                >
                  <span className="block text-sm font-extrabold">{t('onboarding.goThroughExisting')}</span>
                  <span className="mt-1 block text-xs onboarding-text-soft">{t('onboarding.goThroughExistingHint')}</span>
                </button>
              ) : null}
              <button
                type="button"
                className="onboarding-option px-4 py-3 text-left"
                onClick={createOwnList}
                disabled={!canContinue}
              >
                <span className="block text-sm font-extrabold">{t('onboarding.createOwnList')}</span>
                <span className="mt-1 block text-xs onboarding-text-soft">{t('onboarding.createOwnListHint')}</span>
              </button>
            </div>
          ) : null}
            </div>
          </div>

          {advancedOpen ? (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-xs font-bold underline onboarding-text-soft"
                onClick={() => {
                  setAdvancedOpen(false);
                  setWordChatOpen(true);
                }}
              >
                {t('wordChat.back')}
              </button>
            </div>
          ) : null}
        </div>
        </>
        )}

        {error ? (
          <div className="onboarding-error mt-4 text-sm">
            <p>{error}</p>
            <p className="mt-1">
              {t('onboarding.errorHelpContact')}{' '}
              <a
                href={SUPPORT_TELEGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-black text-[color:var(--ob-ink)] underline decoration-[color:var(--ob-accent)] decoration-2 underline-offset-2"
              >
                {t('onboarding.errorHelpTelegram')}
              </a>{' '}
              {t('onboarding.errorHelpOrFinish')}{' '}
              <a
                href="/lists"
                className="font-black text-[color:var(--ob-ink)] underline decoration-[color:var(--ob-accent)] decoration-2 underline-offset-2"
              >
                {t('onboarding.errorHelpEditor')}
              </a>
              .
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
