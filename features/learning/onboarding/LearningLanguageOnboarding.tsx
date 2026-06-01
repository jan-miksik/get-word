'use client';

import { formatDurationEstimate } from '@/features/learning/onboarding/listRecommendations';
import { formatNumber } from '@/features/learning/onboarding/commonListAudioGeneration';
import { useI18n } from '@/components/I18nProvider';
import { LanguageCombobox } from './LanguageCombobox';
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
  onComplete: (languageFrom: string, languageTo: string) => void | Promise<void>;
  onSelectList: (listId: string) => void;
};

export function LearningLanguageOnboarding({
  initialFrom,
  initialTo,
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
    showListSetupActions,
    hasFallbackSeedRecommendation,
    showAutogenerateCommonList,
  } = useLearningOnboardingData({ initialFrom, initialTo });

  const {
    workingId,
    generationStatus,
    error,
    subscribeToList,
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

  function getItemCountLabel(count: number | undefined) {
    const safeCount = count ?? 0;
    return `${safeCount} ${safeCount === 1 ? 'word' : 'words'}`;
  }

  const introBlock = (
    <>
      <p className="hidden text-sm leading-relaxed onboarding-text-soft md:block">
        {t('onboarding.intro')}
      </p>
      <p className="text-sm leading-relaxed onboarding-text-soft md:hidden">
        {t('onboarding.introMobile')}
      </p>
      <p className="onboarding-notice rounded-md px-3 py-2 text-xs md:hidden">
        {t('onboarding.desktopOnlyNote')}
      </p>
    </>
  );

  return (
    <div className="onboarding-screen min-h-screen flex items-start justify-center px-4 py-8 sm:py-14">
      {generationStatus ? (
        <div className="onboarding-overlay fixed inset-0 z-[80] flex items-center justify-center px-4">
          <section className="onboarding-card w-full max-w-md p-6 text-center">
            <div
              className="onboarding-spinner mx-auto mb-4 h-10 w-10 animate-spin rounded-full"
              aria-hidden="true"
            />
            <h2 className="text-base font-extrabold">{generationStatus.title}</h2>
            <p className="mt-2 text-sm leading-relaxed onboarding-text-soft">{generationStatus.detail}</p>
            {generationStatus.estimateSeconds ? (
              <p className="mt-3 text-xs font-bold onboarding-text-soft">
                Estimated time: {formatDurationEstimate(generationStatus.estimateSeconds)}
              </p>
            ) : null}
          </section>
        </div>
      ) : null}
      <section className="onboarding-card w-full max-w-3xl p-5 sm:p-7">
        <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
          <LanguageCombobox
            id="language-from"
            label="I know"
            value={languageFrom}
            languages={languages}
            loading={loadingLanguages}
            onChange={setLanguageFrom}
          />
          <LanguageCombobox
            id="language-to"
            label="I want to learn"
            value={languageTo}
            languages={languages}
            loading={loadingLanguages}
            onChange={setLanguageTo}
          />
        </div>

        {targetLanguage && !targetLanguage.ttsAvailable ? (
          <p className="onboarding-notice mt-3 rounded-md px-3 py-2 text-xs">
            {targetLanguage.name} is available for translation. Google TTS voice availability was not found, so audio can be added later if a provider supports it.
          </p>
        ) : null}

        {languageFrom === languageTo ? (
          <p className="onboarding-error mt-3 text-sm">it does not make much sense</p>
        ) : null}

        <div className="onboarding-divider mt-6 pt-5">
          {!languageFrom || !languageTo ? (
            <p className="text-sm onboarding-text-soft">Choose both languages to find matching word lists.</p>
          ) : loadingMatches ? (
            <div className="space-y-3">
              {introBlock}
              <p className="text-sm onboarding-text-soft">Looking for existing lists...</p>
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
                        seed
                      </span>
                      <span className="text-xs text-[color:var(--ob-surface)] opacity-[0.85]">
                        {getItemCountLabel(recommendedList.itemCount)}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--ob-surface)] opacity-[0.85]">
                      No exact selected list exists yet. Create a fork from this basic seed.
                    </div>
                  </div>
                  <button
                    type="button"
                    className="onboarding-option-secondary hidden shrink-0 self-center px-3 py-1.5 text-xs font-bold disabled:opacity-50 md:inline-block"
                    disabled={workingId === `fork:${recommendedList.id}`}
                    onClick={() => forkList(recommendedList)}
                  >
                    {workingId === `fork:${recommendedList.id}` ? 'Forking...' : 'Fork'}
                  </button>
                </div>
              ) : null}
              <h2 className="text-sm font-extrabold uppercase tracking-wide">
                Existing {languagePairLabel} lists
              </h2>
              {matches.map((list) => {
                const isRecommended = list.id === recommendedList?.id && recommendedReason !== 'fallback_seed';
                const optionTextSoftClass = isRecommended
                  ? 'text-[color:var(--ob-surface)] opacity-[0.85]'
                  : 'onboarding-text-soft';

                return (
                  <div key={list.id} className="flex items-stretch gap-2">
                    <button
                      type="button"
                      className={[
                        'onboarding-option min-w-0 flex-1 px-3 py-2 text-left disabled:opacity-50',
                        isRecommended ? 'onboarding-option-highlight' : '',
                      ].join(' ')}
                      disabled={workingId === list.id}
                      onClick={() => subscribeToList(list)}
                    >
                      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="font-bold">{list.name}</span>
                        {isRecommended ? (
                          <span className="rounded-full border border-[var(--ob-ink)] bg-[var(--ob-surface)] px-2 py-0.5 text-[10px] font-black uppercase text-[color:var(--ob-ink)]">
                            recommended
                          </span>
                        ) : null}
                        <span className={`text-xs ${optionTextSoftClass}`}>{getItemCountLabel(list.itemCount)}</span>
                      </div>
                      <div className={`mt-1 text-xs ${optionTextSoftClass}`}>
                        {list.description?.trim() || (list.isOwner ? 'Your list' : 'Public list')}
                      </div>
                    </button>
                    <button
                      type="button"
                      className="onboarding-option-secondary hidden shrink-0 self-center px-3 py-1.5 text-xs font-bold disabled:opacity-50 md:inline-block"
                      disabled={workingId === `fork:${list.id}`}
                      onClick={() => forkList(list)}
                    >
                      {workingId === `fork:${list.id}` ? 'Forking...' : 'Fork'}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : hasFallbackSeedRecommendation && recommendedList ? (
            <div className="space-y-3">
              <p className="text-sm onboarding-text-soft">
                No exact selected list exists yet for {languagePairLabel}. You can create a fork from the basic seed and customize it.
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
                    {recommendedList.description?.trim() || 'Basic list seed'}
                  </div>
                </div>
                <button
                  type="button"
                  className="onboarding-option-secondary shrink-0 self-center px-3 py-1.5 text-xs font-bold disabled:opacity-50"
                  disabled={workingId === `fork:${recommendedList.id}`}
                  onClick={() => forkList(recommendedList)}
                >
                  {workingId === `fork:${recommendedList.id}` ? 'Forking...' : 'Fork'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm onboarding-text-soft">
                No matching lists yet for {languagePairLabel}. You can generate a common list from the best available seed, browse other lists, or start your own.
              </p>
            </div>
          )}

          {showListSetupActions ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {showAutogenerateCommonList ? (
                <button
                  type="button"
                  className="onboarding-option px-4 py-3 text-left disabled:opacity-50"
                  onClick={autogenerateCommonList}
                  disabled={!canContinue || workingId === 'common'}
                >
                  <span className="block text-sm font-extrabold">
                    {workingId === 'common' ? 'Autogenerating...' : 'Autogenerate common list'}
                  </span>
                  <span className="mt-1 block text-xs onboarding-text-soft">
                    {commonListEstimate?.status === 'loading'
                      ? 'Checking how many words will be generated...'
                      : commonListEstimate?.status === 'ready'
                        ? `${formatNumber(commonListEstimate.wordCount ?? 0)} ${commonListEstimate.wordCount === 1 ? 'word' : 'words'} will be generated${commonListEstimate.seedName ? ` from ${commonListEstimate.seedName}` : ''}.`
                        : commonListEstimate?.status === 'unavailable'
                          ? 'Word count is not available yet; the best available seed will be used.'
                          : 'Most used words and phrases from the best available seed list.'}
                  </span>
                </button>
              ) : null}
              {matches.length === 0 ? (
                <button
                  type="button"
                  className="onboarding-option hidden px-4 py-3 text-left md:block"
                  onClick={goToListsForExisting}
                  disabled={!canContinue}
                >
                  <span className="block text-sm font-extrabold">Go through existing lists</span>
                  <span className="mt-1 block text-xs onboarding-text-soft">Find what suits you most and fork it.</span>
                </button>
              ) : null}
              <button
                type="button"
                className="onboarding-option hidden px-4 py-3 text-left md:block"
                onClick={createOwnList}
                disabled={!canContinue}
              >
                <span className="block text-sm font-extrabold">Create own list</span>
                <span className="mt-1 block text-xs onboarding-text-soft">Start empty on the lists page.</span>
              </button>
            </div>
          ) : null}
        </div>

        {error ? <p className="onboarding-error mt-4 text-sm">{error}</p> : null}
      </section>
    </div>
  );
}
