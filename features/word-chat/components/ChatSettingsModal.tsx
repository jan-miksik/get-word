'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/components/I18nProvider';
import { AppInterfaceLanguageSelector } from '@/features/shared/languages/AppInterfaceLanguageSelector';
import { LanguageCombobox } from '@/features/shared/languages/LanguageCombobox';
import { useSupportedLanguages } from '@/features/shared/languages/useSupportedLanguages';
import { warmPaletteVars } from '@/features/shared/theme/warm-palette';
import type { WordChatPreferencePatch } from '../hooks/useWordChat';
import { splitWordChatLevelLabel, wordChatLevelLabelKey } from '../levelLabels';
import { WORD_CHAT_LANGUAGE_LEVELS } from '../preferences';
import { SalutationGenderBadge } from './SalutationGenderIcon';
import type {
  WordChatAddressRegister,
  WordChatLanguageLevel,
  WordChatSalutationGender,
} from '../types';

/**
 * One look for every section heading in this modal, with a little more air under
 * it than the `space-y` alone gave: the headings are what the learner scans, and
 * sitting almost on top of their own controls made the modal read as one list.
 */
const SECTION_HEADING_CLASS =
  'mt-0 mb-2.5 text-xs font-black uppercase tracking-wide onboarding-text-soft';

type LanguagePairSettingsProps = {
  languageFrom: string;
  languageTo: string;
  onLanguagePairChange: (pair: { from: string; to: string }) => void | Promise<void>;
};

/**
 * The study pair, applied as it is picked.
 *
 * Picking a language in a settings selector is the decision — a separate
 * "use these languages" button asked the learner to confirm what they had just
 * said. The two sides are still applied as one pair, so switching only the
 * target keeps the known side as it was.
 */
function LanguagePairSettings({
  languageFrom,
  languageTo,
  onLanguagePairChange,
}: LanguagePairSettingsProps) {
  const { t } = useI18n();
  const { languages, loading: languagesLoading } = useSupportedLanguages();
  const [draftFrom, setDraftFrom] = useState(languageFrom);
  const [draftTo, setDraftTo] = useState(languageTo);
  const [pairSaving, setPairSaving] = useState(false);
  const [pairError, setPairError] = useState(false);

  const applyPair = async (pair: { from: string; to: string }) => {
    setDraftFrom(pair.from);
    setDraftTo(pair.to);
    // Same pair, or one side still empty: nothing has been decided yet.
    if (!pair.from || !pair.to || pair.from === pair.to) return;
    if (pair.from === languageFrom && pair.to === languageTo) return;
    setPairSaving(true);
    setPairError(false);
    try {
      await onLanguagePairChange(pair);
    } catch {
      setPairError(true);
    } finally {
      setPairSaving(false);
    }
  };

  return (
    <section className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-2">
        <LanguageCombobox
          id="word-chat-language-from"
          label={t('photoLab.knownLanguage')}
          value={draftFrom}
          languages={languages}
          loading={languagesLoading}
          onChange={(from) => void applyPair({ from, to: draftTo })}
          disabledCodes={draftTo ? [draftTo] : []}
        />
        <LanguageCombobox
          id="word-chat-language-to"
          label={t('photoLab.targetLanguage')}
          value={draftTo}
          languages={languages}
          loading={languagesLoading}
          onChange={(to) => void applyPair({ from: draftFrom, to })}
          disabledCodes={draftFrom ? [draftFrom] : []}
        />
      </div>
      <p className="m-0 text-xs leading-relaxed onboarding-text-soft">
        {t('wordChat.studyPairHint')}
      </p>
      {pairSaving ? (
        <p className="m-0 text-xs onboarding-text-soft" role="status">
          {t('wordChat.profileSaving')}
        </p>
      ) : null}
      {pairError ? (
        <p className="onboarding-error m-0 text-xs" role="alert">
          {t('wordChat.languageChangeFailed')}
        </p>
      ) : null}
    </section>
  );
}

type Props = {
  isOpen: boolean;
  languageFrom: string;
  languageTo: string;
  /**
   * The list and category names, edited here rather than on the select step.
   * Optional: the chat step opens the same modal before a list is being named,
   * and omits them.
   */
  listName?: string;
  categoryName?: string;
  onListNameChange?: (value: string) => void;
  onCategoryNameChange?: (value: string) => void;
  /**
   * The list's visibility, editable here so a learner can change it after the
   * one-time question on the select step. Omitted where no list is being named
   * yet (the chat step opens the same modal before there is a list).
   */
  isPublic?: boolean | null;
  onVisibilityChange?: (value: boolean) => void;
  addressRegister: WordChatAddressRegister | null;
  salutationGender: WordChatSalutationGender | null;
  languageLevel: WordChatLanguageLevel | null;
  addressRegisterApplies: boolean;
  salutationGenderApplies: boolean;
  saving: boolean;
  onChange: (patch: WordChatPreferencePatch) => void | Promise<void>;
  onLanguagePairChange: (pair: { from: string; to: string }) => void | Promise<void>;
  onClose: () => void;
};

export function ChatSettingsModal({
  isOpen,
  languageFrom,
  languageTo,
  listName,
  categoryName,
  onListNameChange,
  onCategoryNameChange,
  isPublic,
  onVisibilityChange,
  addressRegister,
  salutationGender,
  languageLevel,
  addressRegisterApplies,
  salutationGenderApplies,
  saving,
  onChange,
  onLanguagePairChange,
  onClose,
}: Props) {
  const { t } = useI18n();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus({ preventScroll: true });

    // The page behind stays mounted and scrollable, so an `aria-modal` dialog
    // has to hold both the scroll and the tab order itself.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((node) => node.offsetParent !== null || node === document.activeElement);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] overflow-y-auto bg-black/55 p-3 backdrop-blur-[2px] sm:p-6"
      onClick={onClose}
    >
      <div
        className="flex min-h-full w-full items-start justify-center sm:items-center"
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          style={warmPaletteVars}
          className="isolate w-full max-w-2xl overflow-visible rounded-3xl border-2 border-[var(--ob-ink)] bg-[var(--ob-surface)] p-5 text-[var(--ob-ink)] shadow-2xl outline-none sm:p-7"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-4">
            <h2 id={titleId} className="m-0 text-lg font-black uppercase tracking-wide">
              {t('wordChat.settings')}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="onboarding-option-secondary flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-2xl leading-none"
            >
              ×
            </button>
          </div>

          <div className="mt-6 space-y-8">
            {/* Languages first: which language the app speaks, then the pair
                being studied. Everything below is a detail of how these words
                get written — these two decide what the screen even says. */}
            <section>
              <h3 className={SECTION_HEADING_CLASS}>
                {t('onboarding.interfaceLanguageLabel')}
              </h3>
              {/* Not `compact`: full width made a button as wide as the modal for
                  a flag and one short word. */}
              <AppInterfaceLanguageSelector />
            </section>

            <LanguagePairSettings
              key={`${languageFrom}\u0000${languageTo}`}
              languageFrom={languageFrom}
              languageTo={languageTo}
              onLanguagePairChange={onLanguagePairChange}
            />

            {onListNameChange || onCategoryNameChange ? (
              <section className="space-y-3">
                {onListNameChange ? (
                  <label className="block">
                    <span className="mb-1 block text-xs font-black uppercase tracking-wide onboarding-text-soft">
                      {t('wordChat.listNameLabel')}
                    </span>
                    <input
                      type="text"
                      value={listName ?? ''}
                      onChange={(event) => onListNameChange(event.target.value)}
                      maxLength={80}
                      className="word-chat-input w-full rounded-xl px-3 py-2.5 text-base font-bold sm:text-sm"
                    />
                  </label>
                ) : null}
                {onCategoryNameChange ? (
                  <label className="block">
                    <span className="mb-1 block text-xs font-black uppercase tracking-wide onboarding-text-soft">
                      {t('wordChat.categoryLabel')}
                    </span>
                    <input
                      type="text"
                      value={categoryName ?? ''}
                      onChange={(event) => onCategoryNameChange(event.target.value)}
                      maxLength={60}
                      className="word-chat-input w-full rounded-xl px-3 py-2.5 text-base font-bold sm:text-sm"
                    />
                  </label>
                ) : null}
              </section>
            ) : null}

            {onVisibilityChange ? (
              <section
                role="radiogroup"
                aria-label={t('wordChat.visibilityTitle')}
                className="space-y-3"
              >
                <h3 className={SECTION_HEADING_CLASS}>
                  {t('wordChat.visibilityTitle')}
                </h3>
                {[false, true].map((value) => (
                  <button
                    key={String(value)}
                    type="button"
                    role="radio"
                    aria-checked={isPublic === value}
                    onClick={() => onVisibilityChange(value)}
                    className={[
                      'onboarding-option block w-full rounded-xl px-4 py-3 text-left',
                      isPublic === value ? 'onboarding-option-highlight' : '',
                    ].join(' ')}
                  >
                    <span className="block text-sm font-extrabold">
                      {value ? t('wordChat.visibilityPublic') : t('wordChat.visibilityPrivate')}
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed onboarding-text-soft">
                      {value
                        ? t('wordChat.visibilityPublicHint')
                        : t('wordChat.visibilityPrivateHint')}
                    </span>
                  </button>
                ))}
              </section>
            ) : null}

            {addressRegisterApplies ? (
              <section
                role="radiogroup"
                aria-label={t('wordChat.addressSettingLabel')}
                className="space-y-3"
              >
                <h3 className={SECTION_HEADING_CLASS}>
                  {t('wordChat.addressSettingLabel')}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(['casual', 'formal'] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={addressRegister === value}
                      disabled={saving}
                      onClick={() => void onChange({ addressRegister: value })}
                      className={[
                        'onboarding-option min-h-12 rounded-xl px-4 py-3 text-left text-sm font-extrabold disabled:opacity-50',
                        addressRegister === value ? 'onboarding-option-highlight' : '',
                      ].join(' ')}
                    >
                      {value === 'casual'
                        ? t('wordChat.addressCasual')
                        : t('wordChat.addressFormal')}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {salutationGenderApplies ? (
              <section
                role="radiogroup"
                aria-label={t('wordChat.salutationSettingLabel')}
                className="space-y-3"
              >
                <h3 className={SECTION_HEADING_CLASS}>
                  {t('wordChat.salutationSettingLabel')}
                </h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  {(['female', 'male', 'neutral'] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={salutationGender === value}
                      disabled={saving}
                      onClick={() => void onChange({ salutationGender: value })}
                      className={[
                        'onboarding-option group flex min-h-12 items-center gap-2.5 rounded-xl px-4 py-3 text-left text-sm font-extrabold disabled:opacity-50',
                        salutationGender === value ? 'onboarding-option-highlight' : '',
                      ].join(' ')}
                    >
                      <SalutationGenderBadge
                        gender={value}
                        selected={salutationGender === value}
                      />
                      <span className="min-w-0">
                        {value === 'female'
                          ? t('wordChat.salutationFemale')
                          : value === 'male'
                            ? t('wordChat.salutationMale')
                            : t('wordChat.salutationNeutral')}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            <section
              role="radiogroup"
              aria-label={t('wordChat.levelSettingLabel')}
              className="space-y-3"
            >
              <h3 className={SECTION_HEADING_CLASS}>
                {t('wordChat.levelSettingLabel')}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {WORD_CHAT_LANGUAGE_LEVELS.map((value) => {
                  const levelLabel = splitWordChatLevelLabel(
                    value,
                    t(wordChatLevelLabelKey(value)),
                  );
                  const accessibleLabel = t(wordChatLevelLabelKey(value));
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-label={accessibleLabel}
                      aria-checked={languageLevel === value}
                      disabled={saving}
                      onClick={() => void onChange({ languageLevel: value })}
                      className={[
                        'onboarding-option min-h-16 rounded-xl px-4 py-3 text-left disabled:opacity-50',
                        languageLevel === value ? 'onboarding-option-highlight' : '',
                      ].join(' ')}
                    >
                      <span className="block text-[11px] font-bold uppercase tracking-wide onboarding-text-soft">
                        {levelLabel.code}
                      </span>
                      <span className="mt-0.5 block text-sm font-extrabold leading-snug sm:text-base">
                        {levelLabel.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          <div className="mt-7 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="onboarding-option onboarding-option-highlight min-h-11 rounded-xl px-5 py-2.5 text-sm font-extrabold"
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
