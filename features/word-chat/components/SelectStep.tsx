'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { PencilIcon, RobotIcon } from '@/components/icons/AppIcons';
import type { ProposedItem } from '../types';
import type { WordChatLimits } from '../hooks/useWordChat';

type Props = {
  mode?: 'suggestions' | 'manual';
  /**
   * The personal list these words are saved into, by name. Read-only here —
   * naming the list (and its category) now lives behind the settings gear.
   */
  listName: string;
  proposals: ProposedItem[];
  isSelected: (item: ProposedItem) => boolean;
  onToggle: (item: ProposedItem) => void;
  onUpdateProposal: (item: ProposedItem, text: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  customItems: { kind: 'sentence' | 'word'; text: string }[];
  onAddCustom: (text: string) => void;
  onRemoveCustom: (text: string) => void;
  limits: WordChatLimits;
  selectedCount: number;
  overSoftLimit: boolean;
  atHardCap: boolean;
  monthlyRemaining: number;
  overMonthlyLimit: boolean;
  atSelectionLimit: boolean;
  busy: boolean;
  /** An on-screen keyboard is covering the lower part of a phone screen. */
  keyboardOpen?: boolean;
  /** Omitted when this step is the first one: there is nothing behind it. */
  onBack?: () => void;
  /** Manual entry only: hand the word-finding over to the conversation. */
  onStartChat?: () => void;
  onContinue: () => void;
};

function getProposalKey(item: ProposedItem) {
  return item.source === 'corpus' ? `corpus:${item.corpusItemId}` : `gen:${item.draftId ?? item.text}`;
}

export function SelectStep({
  mode = 'suggestions',
  listName,
  proposals,
  isSelected,
  onToggle,
  onUpdateProposal,
  onSelectAll,
  onClearSelection,
  customItems,
  onAddCustom,
  onRemoveCustom,
  limits,
  selectedCount,
  overSoftLimit,
  atHardCap,
  monthlyRemaining,
  overMonthlyLimit,
  atSelectionLimit,
  busy,
  keyboardOpen = false,
  onBack,
  onStartChat,
  onContinue,
}: Props) {
  const { t } = useI18n();
  const [customInput, setCustomInput] = useState('');
  // Typing one word, adding it, seeing it land is the whole loop for most
  // people, so that is what manual entry opens on. Pasting a prepared batch is
  // the rarer errand and waits behind the toggle.
  const [bulkEntry, setBulkEntry] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const customTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const customInputRef = useRef<HTMLInputElement | null>(null);
  const editInputRef = useRef<HTMLTextAreaElement | null>(null);

  // Who sees the list is a property of the list, not a step in adding words: it
  // is asked (and changed) behind the settings gear, private until told
  // otherwise, so nothing on this step waits on an answer.
  const monthlyExhausted = monthlyRemaining <= 0;
  const remainingSelections = Math.max(
    0,
    Math.min(limits.maxItemsPerSession, monthlyRemaining) - selectedCount,
  );

  function submitCustom(event: FormEvent) {
    event.preventDefault();
    if (!customInput.trim() || atSelectionLimit) return;
    const entries = customInput
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .slice(0, Math.max(1, remainingSelections));
    for (const entry of entries) onAddCustom(entry);
    setCustomInput('');
    // One at a time is a loop — type, add, type the next one — so the cursor
    // goes back where the next word is typed even when Add was clicked.
    if (!bulkEntry) customInputRef.current?.focus();
  }

  // The field the learner is meant to type in gets the cursor: on arrival, and
  // again whenever the toggle swaps one field for the other.
  useEffect(() => {
    if (mode !== 'manual') return;
    if (bulkEntry) customTextareaRef.current?.focus();
    else customInputRef.current?.focus();
  }, [bulkEntry, mode]);

  useEffect(() => {
    if (!editingKey) return;
    editInputRef.current?.focus();
    editInputRef.current?.select();
  }, [editingKey]);

  // Keep the open editor as tall as its text. Height is released first because
  // `scrollHeight` never reports less than an explicitly set height, so deleting
  // words would otherwise leave the field stuck at its tallest.
  const editedText = proposals.find((item) => getProposalKey(item) === editingKey)?.text ?? '';
  useEffect(() => {
    const node = editInputRef.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${node.scrollHeight}px`;
  }, [editedText, editingKey]);

  return (
    <div className="space-y-4">
      {/* The settings gear floats in this corner on the select step in both
          modes now, so the heading keeps clear of it either way. */}
      <div className="pr-12 sm:pr-14">
        <h2 className="text-base font-extrabold">
          {t(mode === 'manual' ? 'wordChat.manualTitle' : 'wordChat.selectTitle')}
        </h2>
        {/* The single-entry step needs no line of instruction — the field and
            its Add button say it. Only the suggestions list and the bulk paste
            box carry a hint. */}
        {mode !== 'manual' || bulkEntry ? (
          <p className="mt-1 text-sm onboarding-text-soft">
            {t(mode !== 'manual' ? 'wordChat.selectHint' : 'wordChat.manualHint')}
          </p>
        ) : null}
      </div>

      {proposals.length > 0 ? (
        <>
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
        </>
      ) : null}

      <ul className="space-y-2">
        {proposals.map((item) => {
          const selected = isSelected(item);
          const key = getProposalKey(item);
          const editing = editingKey === key;
          return (
            <li key={key}>
              <div
                className={[
                  'onboarding-option group flex w-full items-center gap-2 rounded-xl p-1.5 pl-3 text-left',
                  selected ? 'onboarding-option-highlight' : '',
                ].join(' ')}
              >
                {editing ? (
                  <>
                    <span
                      className={[
                        'word-chat-checkbox',
                        selected ? 'word-chat-checkbox-checked' : '',
                      ].join(' ')}
                      aria-hidden="true"
                    >
                      {selected ? '✓' : ''}
                    </span>
                    {/* Editing a sentence in a one-line field hides the half
                        being edited, so this grows with the text too. Enter
                        commits (a study item is never multi-line), Escape
                        leaves. */}
                    <textarea
                      ref={editInputRef}
                      rows={1}
                      value={item.text}
                      onChange={(event) => onUpdateProposal(item, event.target.value)}
                      onBlur={() => setEditingKey(null)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === 'Escape') {
                          event.preventDefault();
                          event.currentTarget.blur();
                        }
                      }}
                      maxLength={200}
                      className="word-chat-input min-w-0 flex-1 resize-none rounded-lg px-2 py-1.5 text-base font-bold leading-snug sm:text-sm"
                    />
                  </>
                ) : (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={selected}
                    onClick={() => onToggle(item)}
                    disabled={!selected && atSelectionLimit}
                    className="flex min-h-10 min-w-0 flex-1 items-center gap-3 rounded-lg py-1 pr-1 text-left disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={item.text}
                  >
                    <span
                      className={[
                        'word-chat-checkbox',
                        selected ? 'word-chat-checkbox-checked' : '',
                      ].join(' ')}
                      aria-hidden="true"
                    >
                      {selected ? '✓' : ''}
                    </span>
                    {/* Wraps rather than truncates: a proposed sentence is the
                        thing being decided on, and half of it is not enough to
                        decide with. The row grows instead. */}
                    <span className="min-w-0 flex-1 break-words text-sm leading-snug">
                      {item.text}
                    </span>
                  </button>
                )}
                {/* Provenance, not content: a quiet badge on the right rather
                    than a second line under the text. */}
                {item.source === 'corpus' ? (
                  <span className="shrink-0 rounded-full border border-current px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide opacity-60">
                    {item.takeoverCandidate
                      ? t('wordChat.badgeTakeoverCandidate')
                      : t('wordChat.badgeReused')}
                  </span>
                ) : null}
                {!editing ? (
                  <button
                    type="button"
                    onClick={() => setEditingKey(key)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full opacity-70 transition-opacity hover:bg-black/10 hover:opacity-100 focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-70 sm:focus:opacity-100"
                    aria-label={`${t('lists.edit')}: ${item.text}`}
                    title={t('lists.edit')}
                  >
                    <PencilIcon size={15} />
                  </button>
                ) : null}
              </div>
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

      {/* Typing a word here is a loop — type, add, watch it join the list — so
          with the keyboard up the field stays pinned to the bottom of the
          visible area and the list keeps scrolling behind it. Sticky releases
          at the form's natural place, so the totals and Continue below it are
          still reachable. */}
      <form
        onSubmit={submitCustom}
        className={[
          'space-y-1.5',
          keyboardOpen
            ? 'max-sm:sticky max-sm:bottom-0 max-sm:z-10 max-sm:-mx-1 max-sm:bg-[var(--ob-surface)]/95 max-sm:px-1 max-sm:py-2 max-sm:backdrop-blur'
            : '',
        ].join(' ')}
      >
        <div className="flex gap-2">
          {mode === 'manual' && bulkEntry ? (
            <textarea
              ref={customTextareaRef}
              value={customInput}
              onChange={(event) => setCustomInput(event.target.value)}
              placeholder={t('wordChat.manualAddPlaceholder')}
              disabled={atSelectionLimit}
              maxLength={1200}
              rows={4}
              className="word-chat-input min-w-0 flex-1 resize-y rounded-xl px-3 py-2.5 text-base sm:text-sm disabled:opacity-50"
            />
          ) : (
            <input
              ref={customInputRef}
              type="text"
              value={customInput}
              onChange={(event) => setCustomInput(event.target.value)}
              placeholder={t('wordChat.addOwnPlaceholder')}
              disabled={atSelectionLimit}
              maxLength={200}
              className="word-chat-input min-w-0 flex-1 rounded-xl px-3 py-2.5 text-base sm:text-sm disabled:opacity-50"
            />
          )}
          <button
            type="submit"
            disabled={atSelectionLimit || !customInput.trim()}
            className="onboarding-option shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-50"
          >
            {t('wordChat.add')}
          </button>
        </div>
        {/* Pasting a prepared batch is the rarer errand, so it sits quietly
            under the field rather than competing with it. Beside it, the other
            way to get words: letting the AI bot propose them — a model call, so
            it waits here rather than leading. Manual entry only — on the
            suggestions step the field is a small addition, not the way words
            get in. */}
        {mode === 'manual' ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setBulkEntry((current) => !current)}
              className="onboarding-option-secondary rounded-full px-3 py-1.5 text-[11px] font-bold"
              aria-pressed={bulkEntry}
            >
              {t(bulkEntry ? 'wordChat.manualSingleToggle' : 'wordChat.manualBulkToggle')}
            </button>
            {onStartChat ? (
              <button
                type="button"
                onClick={onStartChat}
                className="onboarding-option-secondary inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold"
              >
                <RobotIcon size={14} />
                <span>{t('wordChat.chatStart')}</span>
              </button>
            ) : null}
          </div>
        ) : null}
      </form>

      <div className="space-y-2 text-xs">
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
      </div>

      <div className="flex gap-2 pt-4">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            disabled={busy}
            className="onboarding-option-secondary shrink-0 rounded-xl px-4 py-3 text-sm font-bold disabled:opacity-50"
          >
            {t('wordChat.back')}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onContinue}
          disabled={
            busy ||
            !listName.trim() ||
            selectedCount === 0 ||
            monthlyExhausted ||
            overMonthlyLimit
          }
          className="onboarding-option onboarding-option-highlight flex-1 rounded-xl px-5 py-3 text-center text-base font-extrabold disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? t('wordChat.translating') : t('wordChat.continueToReview')}
        </button>
      </div>

      {/* The monthly allowance is a running total, not an action — it belongs
          under the button that spends it, where it reads as a receipt rather
          than a gate. */}
      <p className="text-xs onboarding-text-soft">
        {monthlyExhausted
          ? t('wordChat.monthlyReached', { limit: limits.monthlyLimit })
          : t('wordChat.monthlyUsage', {
              used: limits.monthlyUsed,
              limit: limits.monthlyLimit,
            })}
      </p>
    </div>
  );
}
