'use client';

import { useI18n } from '@/components/I18nProvider';
import { useAppStateContext } from '@/context/AppStateContext';
import { persistLearningRoleForPair } from '@/features/learning/app-state/storage';
import { Section, LearningLanguageButton } from './primitives';
import { formatLanguageLabel } from './format';

export function LearningLanguageSection() {
  const { t, language } = useI18n();
  const {
    role,
    setRole,
    subscribedLists = [],
    activeList = null,
    activeListId,
  } = useAppStateContext();

  const currentLearningList = activeList
    ?? subscribedLists.find((list) => list.id === activeListId)
    ?? null;

  return (
    <Section label={t('settings.iWantToLearn')}>
      {currentLearningList ? (
        <div className="flex gap-2">
          <LearningLanguageButton
            label={formatLanguageLabel(currentLearningList.languageTo, language)}
            code={currentLearningList.languageTo}
            selected={role === 'knownLanguage'}
            onClick={() => {
              persistLearningRoleForPair(
                currentLearningList.languageFrom,
                currentLearningList.languageTo,
                'knownLanguage',
              );
              setRole('knownLanguage');
            }}
          />
          <LearningLanguageButton
            label={formatLanguageLabel(currentLearningList.languageFrom, language)}
            code={currentLearningList.languageFrom}
            selected={role === 'languageToLearn'}
            onClick={() => {
              persistLearningRoleForPair(
                currentLearningList.languageFrom,
                currentLearningList.languageTo,
                'languageToLearn',
              );
              setRole('languageToLearn');
            }}
          />
        </div>
      ) : (
        <p className="m-0 text-sm text-text-soft">{t('settings.chooseListFirst')}</p>
      )}
    </Section>
  );
}
