'use client';

import { useState, type FormEvent } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { getLocalizedLanguageName } from '@/lib/i18n/languages';
import type { ProposedItem } from '../types';
import type { WordChatLimits } from '../hooks/useWordChat';

type Props = {
  languageFrom: string;
  /** The personal list these words are saved into, by name. */
  listName: string;
  proposals: ProposedItem[];
  isSelected: (item: ProposedItem) => boolean;
  onToggle: (item: ProposedItem) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  customItems: { kind: 'sentence' | 'word'; text: string }[];
  onAddCustom: (text: string) => void;
  onRemoveCustom: (text: string) => void;
  categoryName: string;
  onCategoryNameChange: (value: string) => void;
  askVisibility: boolean;
  isPublic: boolean | null;
  onVisibilityChange: (value: boolean) => void;
  limits: WordChatLimits;
  selectedCount: number;
  overSoftLimit: boolean;
  atHardCap: boolean;
  monthlyRemaining: number;
  overMonthlyLimit: boolean;
  atSelectionLimit: boolean;
  busy: boolean;
  onBack: () => void;
  onContinue: () => void;
};

export function SelectStep({
  languageFrom,
  listName,
  proposals,
  isSelected,
  onToggle,
  onSelectAll,
  onClearSelection,
  customItems,
  onAddCustom,
  onRemoveCustom,
  categoryName,
  onCategoryNameChange,
  askVisibility,
  isPublic,
  onVisibilityChange,
  limits,
  selectedCount,
  overSoftLimit,
  atHardCap,
  monthlyRemaining,
  overMonthlyLimit,
  atSelectionLimit,
  busy,
  onBack,
  onContinue,
}: Props) {
  const { t, language: uiLanguage } = useI18n();
  const [customInput, setCustomInput] = useState('');

  const knownName =
    getLocalizedLanguageName(languageFrom, languageFrom || uiLanguage) ??
    languageFrom.toUpperCase();

  // The visibility choice is asked once, on the first session, and belongs to
  // the list from then on. Nothing may be saved before it is answered.
  const visibilityAnswered = !askVisibility || isPublic !== null;
  const monthlyExhausted = monthlyRemaining <= 0;

  function submitCustom(event: FormEvent) {
    event.preventDefault();
    if (!customInput.trim() || atSelectionLimit) return;
    onAddCustom(customInput);
    setCustomInput('');
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-extrabold">{t('wordChat.selectTitle')}</h2>
        <p className="mt-1 text-sm onboarding-text-soft">{t('wordChat.selectHint')}</p>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-bold uppercase tracking-wide onboarding-text-soft">
          {t('wordChat.categoryLabel')}
        </span>
        <input
          type="text"
          value={categoryName}
          onChange={(event) => onCategoryNameChange(event.target.value)}
          maxLength={60}
          className="word-chat-input w-full rounded-xl px-3 py-2.5 text-sm font-bold"
        />
      </label>

      {/* Bulk actions sit where the checkboxes do — left edge, reading order —
          and look like the buttons they are. */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSelectAll}
          className="onboarding-option-secondary rounded-full px-3 py-1.5 text-xs font-bold"
        >
          {t('wordChat.selectAll')}
        </button>
        <button
          type="button"
          onClick={onClearSelection}
          className="onboarding-option-secondary rounded-full px-3 py-1.5 text-xs font-bold"
        >
          {t('wordChat.clearAll')}
        </button>
      </div>

      <ul className="space-y-2">
        {proposals.map((item) => {
          const selected = isSelected(item);
          const key = item.source === 'corpus' ? item.corpusItemId : item.text;
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => onToggle(item)}
                role="checkbox"
                aria-checked={selected}
                disabled={!selected && atSelectionLimit}
                className={[
                  'onboarding-option flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left disabled:opacity-40',
                  selected ? 'onboarding-option-highlight' : '',
                ].join(' ')}
              >
                <span
                  aria-hidden
                  className={[
                    'word-chat-checkbox',
                    selected ? 'word-chat-checkbox-checked' : '',
                  ].join(' ')}
                >
                  {selected ? '✓' : ''}
                </span>
                <span className="min-w-0 flex-1 text-sm leading-snug">{item.text}</span>
                {/* Provenance, not content: a quiet badge on the right rather
                    than a second line under the text. */}
                {item.source === 'corpus' ? (
                  <span className="shrink-0 rounded-full border border-current px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide opacity-60">
                    {t('wordChat.badgeReused')}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}

        {customItems.map((item) => (
          <li
            key={`custom-${item.text}`}
            className="onboarding-option onboarding-option-highlight group relative rounded-xl"
          >
            <span className="block min-w-0 py-2.5 pl-3 pr-10 text-sm">
              {item.text}
            </span>
            <button
              type="button"
              onClick={() => onRemoveCustom(item.text)}
              className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-lg leading-none opacity-80 transition-opacity hover:bg-black/10 sm:opacity-0 sm:group-hover:opacity-80 sm:focus:opacity-80"
              aria-label={t('wordChat.remove')}
              title={t('wordChat.remove')}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={submitCustom} className="space-y-1.5">
        <span className="block text-xs font-bold uppercase tracking-wide onboarding-text-soft">
          {t('wordChat.addOwnLabel', { language: knownName })}
        </span>
        <div className="flex gap-2">
          <input
            type="text"
            value={customInput}
            onChange={(event) => setCustomInput(event.target.value)}
            placeholder={t('wordChat.addOwnPlaceholder')}
            disabled={atSelectionLimit}
            maxLength={200}
            className="word-chat-input min-w-0 flex-1 rounded-xl px-3 py-2.5 text-sm disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={atSelectionLimit || !customInput.trim()}
            className="onboarding-option shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-50"
          >
            {t('wordChat.add')}
          </button>
        </div>
      </form>

      <div className="space-y-2 text-xs">
        <p className="font-bold onboarding-text-soft">
          {t('wordChat.selectedCount', { count: selectedCount })}
        </p>
        {overSoftLimit ? (
          <p className="onboarding-notice rounded-md px-3 py-2 leading-relaxed">
            {t('wordChat.softWarning')}
          </p>
        ) : null}
        {atHardCap ? (
          <p className="onboarding-notice rounded-md px-3 py-2 leading-relaxed">
            {t('wordChat.hardCap', { limit: limits.maxItemsPerSession })}
          </p>
        ) : null}
        {overMonthlyLimit ? (
          <p className="onboarding-notice rounded-md px-3 py-2 leading-relaxed">
            {t('wordChat.monthlySelectionLimit', { remaining: monthlyRemaining })}
          </p>
        ) : null}
        <p className="onboarding-text-soft">
          {monthlyExhausted
            ? t('wordChat.monthlyReached', { limit: limits.monthlyLimit })
            : t('wordChat.monthlyUsage', {
                used: limits.monthlyUsed,
                limit: limits.monthlyLimit,
              })}
        </p>
      </div>

      {askVisibility ? (
        <fieldset className="space-y-2">
          <legend className="text-xs font-bold uppercase tracking-wide onboarding-text-soft">
            {t('wordChat.visibilityTitle')}
          </legend>
          {/* Which list, by name. The choice is made once and then belongs to
              this list forever, so "this list" should not be an abstraction. */}
          <p className="mb-1 text-sm font-bold">{listName}</p>
          {[false, true].map((value) => (
            <button
              key={String(value)}
              type="button"
              role="radio"
              aria-checked={isPublic === value}
              onClick={() => onVisibilityChange(value)}
              className={[
                'onboarding-option block w-full rounded-xl px-3 py-2.5 text-left',
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
          <p className="text-[11px] leading-relaxed onboarding-text-soft">
            {t('wordChat.visibilityChangeLater')}
          </p>
        </fieldset>
      ) : null}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className="onboarding-option-secondary shrink-0 rounded-xl px-4 py-3 text-sm font-bold disabled:opacity-50"
        >
          {t('wordChat.back')}
        </button>
        <button
          type="button"
          onClick={onContinue}
          disabled={
            busy ||
            selectedCount === 0 ||
            !visibilityAnswered ||
            monthlyExhausted ||
            overMonthlyLimit
          }
          className="onboarding-option onboarding-option-highlight flex-1 rounded-xl px-5 py-3 text-center text-base font-extrabold disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? t('wordChat.translating') : t('wordChat.continueToReview')}
        </button>
      </div>
    </div>
  );
}
