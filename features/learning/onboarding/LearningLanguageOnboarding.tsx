'use client';

import { useState } from 'react';
import { formatDurationEstimate } from '@/features/learning/onboarding/listRecommendations';
import { formatNumber } from '@/features/learning/onboarding/commonListAudioGeneration';
import { useI18n } from '@/components/I18nProvider';
import { RisingLettersBackground } from '@/components/RisingLettersBackground';
import { SupportButton, SUPPORT_TELEGRAM_URL } from '@/components/SupportButton';
import { LanguageCombobox } from './LanguageCombobox';
import { OnboardingLanguageSwitcher } from './OnboardingLanguageSwitcher';
import { useLearningOnboardingActions } from './useLearningOnboardingActions';
import { useLearningOnboardingData } from './useLearningOnboardingData';

export {
  estimateCommonListGenerationSeconds,
  formatDurationEstimate,
  pickAutogenerateCommonSeed,
  sortMatchedWordLists,
} from '@/features/learning/onboarding/listRecommendations';

type Props = {
  initialFrom?: string | null;
  initialTo?: string | null;
  reason?: 'onboarding' | 'noListSelected';
  onComplete: (languageFrom: string, languageTo: string) => void | Promise<void>;
  onSelectList: (listId: string) => void;
};

export function LearningLanguageOnboarding({
  initialFrom,
  initialTo,
  reason = 'onboarding',
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
    loadingMatches,
    commonListEstimate,
    targetLanguage,
    canContinue,
    languagePairLabel,
    hasFallbackSeedRecommendation,
    showAutogenerateCommonList,
  } = useLearningOnboardingData({ initialFrom, initialTo });

  const {
    workingId,
    generationStatus,
    error,
    selectMatchedList,
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

  const [advancedOpen, setAdvancedOpen] = useState(reason === 'noListSelected');

  // The primary "Continue" button hides the advanced list-setup options and just
  // picks a sensible default, always landing in the learning app (never the
  // editor): subscribe to a ready-to-use recommended/matching list when one
  // exists, otherwise autogenerate a common list. A seed-only recommendation
  // (`fallback_seed`) is intentionally NOT forked here — forking opens the editor
  // with an untranslated list; autogenerate produces a finished list with audio.
  function handleContinue() {
    if (!canContinue || loadingMatches || workingId !== null) return;
    if (recommendedList && recommendedReason !== 'fallback_seed') {
      void selectMatchedList(recommendedList);
    } else if (matches.length > 0) {
      void selectMatchedList(matches[0]);
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

  return (
    <div className="onboarding-screen min-h-screen flex items-start justify-center px-4 py-8 sm:py-14">
      <RisingLettersBackground variant="ambient" className="z-0" />
      <SupportButton />
      {generationStatus ? (
        <div className="onboarding-overlay fixed inset-0 z-[80] flex items-center justify-center px-4">
          <section className="onboarding-card w-full max-w-md p-6 text-center">
            <div
              className="onboarding-spinner mx-auto mb-4 h-10 w-10 animate-spin rounded-full"
              aria-hidden="true"
            />
            <h2 className="text-base font-extrabold">{generationStatus.title}</h2>
            <p className="mt-2 text-sm leading-relaxed onboarding-text-soft">{generationStatus.detail}</p>
            {generationStatus.progress ? (
              <div className="mt-4 text-left">
                <div className="h-2 overflow-hidden rounded-full bg-[color:var(--ob-border)]">
                  {typeof generationStatus.progress.value === 'number' ? (
                    <div
                      className="h-full rounded-full bg-[color:var(--ob-accent)] transition-[width] duration-300"
                      style={{
                        width: `${Math.max(0, Math.min(1, generationStatus.progress.value)) * 100}%`,
                      }}
                    />
                  ) : (
                    <div className="h-full w-1/3 animate-pulse rounded-full bg-[color:var(--ob-accent)]" />
                  )}
                </div>
                {generationStatus.progress.label ? (
                  <p className="mt-2 text-center text-xs font-bold onboarding-text-soft">
                    {generationStatus.progress.label}
                  </p>
                ) : null}
              </div>
            ) : null}
            {generationStatus.estimateSeconds ? (
              <p className="mt-3 text-xs font-bold onboarding-text-soft">
                {t('onboarding.estimatedTime', {
                  time: formatDurationEstimate(generationStatus.estimateSeconds),
                })}
              </p>
            ) : null}
            {generationStatus.note ? (
              <p className="onboarding-notice mt-4 rounded-md px-3 py-2 text-xs font-bold leading-relaxed">
                {generationStatus.note}
              </p>
            ) : null}
          </section>
        </div>
      ) : null}
      <section className="onboarding-card relative z-10 w-full max-w-3xl p-5 sm:p-7">
        <div className="mb-4 flex justify-end">
          <OnboardingLanguageSwitcher />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
          <LanguageCombobox
            id="language-from"
            label={t('onboarding.iKnow')}
            value={languageFrom}
            languages={languages}
            loading={loadingLanguages}
            onChange={setLanguageFrom}
          />
          <LanguageCombobox
            id="language-to"
            label={t('onboarding.iWantToLearn')}
            value={languageTo}
            languages={languages}
            loading={loadingLanguages}
            onChange={setLanguageTo}
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
                    disabled={!canContinue || loadingMatches || workingId !== null}
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
          ) : matches.length > 0 ? (
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
              {matches.map((list) => {
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
              {showAutogenerateCommonList || !canContinue ? (
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
                        : t('onboarding.autogenerateCommonList')}
                    </span>
                    <span className="rounded-full border border-[var(--ob-accent)] bg-[var(--ob-surface)] px-2 py-0.5 text-[10px] font-black uppercase text-[color:var(--ob-accent)]">
                      {t('onboarding.easiestBadge')}
                    </span>
                  </div>
                  <span className="mt-1 block text-xs onboarding-text-soft">
                    {commonListEstimate?.status === 'loading'
                      ? t('onboarding.checkingWordCount')
                      : commonListEstimate?.status === 'ready'
                        ? commonListEstimate.seedName
                          ? t('onboarding.willGenerateWordsFromSeed', {
                              count: formatNumber(commonListEstimate.wordCount ?? 0),
                              unit: wordUnit(commonListEstimate.wordCount ?? 0),
                              seed: commonListEstimate.seedName,
                            })
                          : t('onboarding.willGenerateWords', {
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
              {matches.length === 0 ? (
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

          <div
            className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${
              canContinue || advancedOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
            }`}
          >
            <div
              className={`min-h-0 overflow-hidden ${canContinue || advancedOpen ? '' : 'pointer-events-none'}`}
              aria-hidden={!canContinue && !advancedOpen}
            >
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 text-xs font-bold underline onboarding-text-soft"
                  onClick={() => setAdvancedOpen((open) => !open)}
                >
                  {advancedOpen ? t('onboarding.hideAdvanced') : t('onboarding.advancedOptions')}
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 20 20"
                    fill="none"
                    className={`transition-transform duration-300 ${advancedOpen ? 'rotate-180' : ''}`}
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
              </div>
            </div>
          </div>
        </div>

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
