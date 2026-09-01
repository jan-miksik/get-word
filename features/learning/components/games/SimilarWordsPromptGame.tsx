'use client';

import { useI18n } from '@/components/I18nProvider';
import { noTranslateProps } from '@/lib/i18n/no-translate';
import { useSimilarWords } from '@/features/learning/similar-words/useSimilarWords';
import type { NormalizedWord } from '@/lib/words';
import type { LearningRole } from '@/features/learning/state/learningRole';
import { getWordTextBySide, learningSideForRole } from './types';
import { SuccessMark } from './SuccessMark';
import { StageBadge } from '../StageBadge';
import { CardTopControls } from '../CardTopControls';
import { ContinueButton } from '../ContinueButton';

/**
 * Offers to fill in the confusable neighbours a word is missing, and — once the
 * learner says yes — generates and saves them right here.
 *
 * Handing this off to the chat meant leaving the session and starting from an
 * empty prompt, which is why nobody finished it. The words are the point; the
 * conversation was scaffolding.
 */
export function SimilarWordsPromptGame({
  word,
  role,
  languageFrom,
  languageTo,
  baseListId,
  onOpenChat,
  onSaved,
  onDismiss,
  stageIndex,
}: {
  word: NormalizedWord;
  role: LearningRole;
  languageFrom: string;
  languageTo: string;
  baseListId: string | null;
  /** Fallback for when there is no personal list to save into yet. */
  onOpenChat: () => void;
  /** Pull the committed words into the mounted learning surface. */
  onSaved?: () => void | Promise<void>;
  onDismiss: () => void;
  stageIndex?: number;
}) {
  const { t, language } = useI18n();
  const { status, proposals, selected, savedCount, generate, toggle, save } = useSimilarWords({
    seed: word,
    languageFrom,
    languageTo,
    chatLanguage: language,
    baseListId,
  });

  const shell = (children: React.ReactNode) => (
    <article className="study-ink-scope relative mx-auto flex min-h-80 max-w-xl flex-col items-center justify-center gap-5 px-6 py-8 text-center">
      <CardTopControls>
        <StageBadge stageIndex={stageIndex} />
      </CardTopControls>
      {children}
    </article>
  );

  if (status === 'saved') {
    return shell(
      <>
        <SuccessMark label="" />
        <h2 className="m-0 text-2xl font-extrabold text-text">
          {t('game.similarWordsSaved', { count: savedCount })}
        </h2>
        <ContinueButton
          variant="slab"
          className="max-w-[22rem]"
          onClick={() => {
            onDismiss();
            void (async () => {
              try {
                await onSaved?.();
              } catch {
                // The commit already succeeded. Normal sync will reconcile a
                // transient refresh failure when the app next regains focus.
              }
            })();
          }}
        />
      </>,
    );
  }

  if (status === 'loading' || status === 'saving') {
    return shell(
      <>
        <p className="m-0 text-sm text-text-soft">
          {t(status === 'loading' ? 'game.similarWordsWorking' : 'game.similarWordsSaving')}
        </p>
        <div className="h-1.5 w-48 overflow-hidden rounded-full" style={{ background: 'var(--rail-track)' }}>
          <div className="h-full w-2/5 rounded-full motion-safe:animate-pulse" style={{ background: 'var(--rail-review)' }} />
        </div>
      </>,
    );
  }

  if (status === 'ready') {
    return shell(
      <>
        <h2 className="m-0 text-xl font-extrabold text-text">{t('game.similarWordsPreview')}</h2>
        <ul className="m-0 flex w-full list-none flex-col gap-1.5 p-0">
          {proposals.map((item) => {
            const checked = selected.has(item.id);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => toggle(item.id)}
                  aria-pressed={checked}
                  className={[
                    'flex w-full items-center gap-3 rounded-xl border-2 px-3 py-2 text-left transition-colors',
                    checked
                      ? 'border-accent bg-accent/10'
                      : 'border-border-subtle opacity-60 hover:opacity-100',
                  ].join(' ')}
                >
                  <span aria-hidden className="text-sm font-black text-accent">{checked ? '✓' : '+'}</span>
                  <span className="min-w-0 flex-1">
                    <span {...noTranslateProps('block truncate text-sm font-bold text-text')}>{item.learning}</span>
                    <span {...noTranslateProps('block truncate text-xs text-text-soft')}>{item.known}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => void save()}
            disabled={selected.size === 0}
            className="rounded-xl bg-accent px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {t('game.similarWordsSave', { count: selected.size })}
          </button>
          <button type="button" onClick={onDismiss} className="rounded-xl border border-border-subtle px-5 py-3 text-sm font-bold text-text-soft">
            {t('game.similarWordsSkip')}
          </button>
        </div>
      </>,
    );
  }

  return shell(
    <>
      <div className="text-4xl" aria-hidden>🔎</div>
      <div>
        <h2 className="m-0 text-2xl font-extrabold text-text">{t('game.similarWordsTitle')}</h2>
        <p className="mb-0 mt-3 text-sm leading-relaxed text-text-soft">
          {status === 'error'
            ? t('game.similarWordsFailed')
            : t('game.similarWordsBody', { word: getWordTextBySide(word, learningSideForRole(role)) })}
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => (baseListId ? void generate() : onOpenChat())}
          className="rounded-xl bg-accent px-5 py-3 text-sm font-bold text-white"
        >
          {status === 'error' ? t('game.similarWordsRetry') : t('game.similarWordsAdd')}
        </button>
        <button type="button" onClick={onDismiss} className="rounded-xl border border-border-subtle px-5 py-3 text-sm font-bold text-text-soft">
          {t('game.similarWordsSkip')}
        </button>
      </div>
    </>,
  );
}
