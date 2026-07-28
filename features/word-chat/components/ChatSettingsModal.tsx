'use client';

import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/components/I18nProvider';
import { AppInterfaceLanguageSelector } from '@/features/shared/languages/AppInterfaceLanguageSelector';
import { warmPaletteVars } from '@/features/shared/theme/warm-palette';
import type { WordChatPreferencePatch } from '../hooks/useWordChat';
import { splitWordChatLevelLabel, wordChatLevelLabelKey } from '../levelLabels';
import { WORD_CHAT_LANGUAGE_LEVELS } from '../preferences';
import type {
  WordChatAddressRegister,
  WordChatLanguageLevel,
  WordChatSalutationGender,
} from '../types';

type Props = {
  isOpen: boolean;
  addressRegister: WordChatAddressRegister | null;
  salutationGender: WordChatSalutationGender | null;
  languageLevel: WordChatLanguageLevel | null;
  addressRegisterApplies: boolean;
  salutationGenderApplies: boolean;
  saving: boolean;
  onChange: (patch: WordChatPreferencePatch) => void | Promise<void>;
  onClose: () => void;
};

export function ChatSettingsModal({
  isOpen,
  addressRegister,
  salutationGender,
  languageLevel,
  addressRegisterApplies,
  salutationGenderApplies,
  saving,
  onChange,
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

          <div className="mt-6 space-y-7">
            <section className="space-y-3">
              <h3 className="m-0 text-xs font-black uppercase tracking-wide onboarding-text-soft">
                {t('onboarding.interfaceLanguageLabel')}
              </h3>
              <AppInterfaceLanguageSelector compact className="w-full" />
            </section>

            {addressRegisterApplies ? (
              <section
                role="radiogroup"
                aria-label={t('wordChat.addressSettingLabel')}
                className="space-y-3"
              >
                <h3 className="m-0 text-xs font-black uppercase tracking-wide onboarding-text-soft">
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
                <h3 className="m-0 text-xs font-black uppercase tracking-wide onboarding-text-soft">
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
                        'onboarding-option min-h-12 rounded-xl px-4 py-3 text-left text-sm font-extrabold disabled:opacity-50',
                        salutationGender === value ? 'onboarding-option-highlight' : '',
                      ].join(' ')}
                    >
                      {value === 'female'
                        ? t('wordChat.salutationFemale')
                        : value === 'male'
                          ? t('wordChat.salutationMale')
                          : t('wordChat.salutationNeutral')}
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
              <h3 className="m-0 text-xs font-black uppercase tracking-wide onboarding-text-soft">
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
                      <span className="block text-sm font-black">{levelLabel.code}</span>
                      <span className="mt-0.5 block text-xs font-bold leading-snug onboarding-text-soft">
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
