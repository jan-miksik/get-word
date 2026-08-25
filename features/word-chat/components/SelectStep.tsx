'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/components/I18nProvider';
import { noTranslateProps } from '@/lib/i18n/no-translate';
import {
  PencilIcon,
  RobotIcon,
  SettingsIcon,
  ShareIcon,
} from '@/components/icons/AppIcons';
import { ShareVisibilityDialog } from '@/features/lists/components/ShareVisibilityDialog';
import { HeadingMenu, HeadingMenuItem } from './HeadingMenu';
import { getLocalizedLanguageName } from '@/lib/i18n/languages';
import { LanguagePairSummary } from '@/features/shared/languages/LanguagePairSummary';
import type { WordList } from '@/features/lists/types';
import { MAX_WORD_CHAT_ITEM_CHARS } from '../limits';
import type { ProposedItem, ReviewItem, WordChatTranslationRegister } from '../types';
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
  audioDisabledKeys?: string[];
  onToggleAudioDisabled?: (key: string) => void;
  languageFrom?: string;
  onOpenLanguagePair?: () => void;
  onUpdateProposal: (item: ProposedItem, text: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  customItems: { kind: 'sentence' | 'word'; text: string }[];
  onAddCustom: (text: string) => void;
  onRemoveCustom: (text: string) => void;
  /**
   * Pairs that arrived already translated — the words picked off a photo. They
   * sit in the same basket as everything else, showing both sides because both
   * are already written; nothing here can be sent to the translator again.
   */
  pretranslatedItems?: ReviewItem[];
  /** Removes one such pair, addressed by `known\u0000target` in lower case. */
  onRemovePretranslated?: (key: string) => void;
  limits: WordChatLimits;
  selectedCount: number;
  /** Rows in the basket that still consume the translation allowance. */
  translatedSelectionCount?: number;
  /** Additional untranslated rows that fit both the session and monthly caps. */
  remainingSelections?: number;
  overSoftLimit: boolean;
  atHardCap: boolean;
  monthlyRemaining: number;
  overMonthlyLimit: boolean;
  atSelectionLimit: boolean;
  busy: boolean;
  /** An on-screen keyboard is covering the lower part of a phone screen. */
  keyboardOpen?: boolean;
  /**
   * The already-saved personal list, when there is one. Its presence puts Share
   * in the heading's overflow menu.
   */
  shareList?: WordList | null;
  onShareListUpdated?: (list: WordList) => void;
  /** The study pair's target, named in the register question. */
  languageTo: string;
  /**
   * Whether the target language words a phrase differently depending on who is
   * being addressed. When it does, the choice below is required before anything
   * can be translated — the model would otherwise have to guess, on every row.
   *
   * This describes THIS batch of words, not the learner: it is asked again for
   * every batch, because the next set can be for a different audience.
   */
  registerApplies: boolean;
  register: WordChatTranslationRegister | null;
  onRegisterChange: (value: WordChatTranslationRegister) => void;
  /**
   * The screen around this step already carries its heading — the tabbed
   * "Add your own words" surface does. Drawing a second one here would name the
   * same screen twice, so only the line of guidance is kept.
   */
  titleInHost?: boolean;
  /**
   * The screen header this step's overflow menu belongs in. Given one, the menu
   * is portalled there so it sits in the same place on every tab; without one
   * it stays in this step's own heading row, which is what onboarding uses.
   */
  headerSlot?: HTMLElement | null;
  /**
   * True while another tab is showing. The step stays mounted — a half-typed
   * batch is not thrown away for a look at the photo tab — but its menu is
   * portalled into a header that is still on screen, so the entries that only
   * make sense next to the typing field have to stand down.
   */
  offScreen?: boolean;
  /** Omitted when this step is the first one: there is nothing behind it. */
  onBack?: () => void;
  /** Manual entry only: hand the word-finding over to the conversation. */
  onStartChat?: () => void;
  /** Opens the settings modal, which now lives in this step's overflow menu. */
  onOpenSettings?: () => void;
  /**
   * Anything still typed in the entry field is handed over here, so a learner
   * who typed a word and pressed Translate does not lose it to an unpressed +.
   */
  onContinue: (pendingTexts: string[]) => void;
};

function getProposalKey(item: ProposedItem) {
  return item.source === 'corpus' ? `corpus:${item.corpusItemId}` : `gen:${item.draftId ?? item.text}`;
}

function normalizeCustomText(text: string) {
  return text.trim().replace(/\s+/g, ' ');
}

export function SelectStep({
  mode = 'suggestions',
  listName,
  proposals,
  isSelected,
  onToggle,
  audioDisabledKeys = [],
  onToggleAudioDisabled = () => {},
  languageFrom,
  onOpenLanguagePair,
  onUpdateProposal,
  onSelectAll,
  onClearSelection,
  customItems,
  onAddCustom,
  onRemoveCustom,
  pretranslatedItems = [],
  onRemovePretranslated,
  limits,
  selectedCount,
  translatedSelectionCount: translatedSelectionCountFromBasket,
  remainingSelections: remainingSelectionsFromBasket,
  overSoftLimit,
  atHardCap,
  monthlyRemaining,
  overMonthlyLimit,
  atSelectionLimit,
  busy,
  keyboardOpen = false,
  shareList,
  onShareListUpdated,
  languageTo,
  registerApplies,
  register,
  onRegisterChange,
  onBack,
  titleInHost = false,
  headerSlot,
  offScreen = false,
  onStartChat,
  onOpenSettings,
  onContinue,
}: Props) {
  const { t, language: uiLanguage } = useI18n();
  const [customInput, setCustomInput] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
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
  const registerMissing = registerApplies && !register;
  const translatedSelectionCount = translatedSelectionCountFromBasket ?? selectedCount;
  const remainingSelections = remainingSelectionsFromBasket ?? Math.max(
    0,
    Math.min(limits.maxItemsPerSession, monthlyRemaining) - selectedCount,
  );
  const selectionLimit = selectedCount + remainingSelections;
  // The same reading of the field in both modes: one line is one item, so the
  // single-line field simply yields at most one. What is typed but not yet added
  // is a pending entry — it counts towards the round either way, whether the
  // learner presses + or goes straight to Translate.
  const typedLines = customInput
    .split(/\r?\n/)
    .map((text, index) => ({
      text: normalizeCustomText(text),
      line: index + 1,
      characterCount: text.trim().length,
    }))
    .filter((entry) => entry.text.length > 0);
  const firstOverlongLine = typedLines.find(
    (entry) => entry.characterCount > MAX_WORD_CHAT_ITEM_CHARS,
  );
  const existingTexts = new Set(
    [
      ...customItems.map((item) => item.text),
      ...pretranslatedItems.map((item) => item.textKnown),
      ...proposals.filter(isSelected).map((item) => item.text),
    ].map((text) => normalizeCustomText(text).toLowerCase()),
  );
  const pendingEntries = typedLines
    .filter((entry) => {
      const key = entry.text.toLowerCase();
      if (existingTexts.has(key)) return false;
      existingTexts.add(key);
      return true;
    })
    .map((entry) => entry.text);
  const projectedSelectedCount = selectedCount + pendingEntries.length;
  const projectedTranslatedCount = translatedSelectionCount + pendingEntries.length;
  const overSelectionLimit = projectedSelectedCount > selectionLimit;
  const inputInvalid = Boolean(firstOverlongLine) || overSelectionLimit;
  const canAddTyped = Boolean(customInput.trim()) && !atSelectionLimit && !inputInvalid;

  function submitCustom(event: FormEvent) {
    event.preventDefault();
    if (!canAddTyped) return;
    for (const entry of pendingEntries) onAddCustom(entry);
    setCustomInput('');
    // One at a time is a loop — type, add, type the next one — so the cursor
    // goes back to the empty field even when + was clicked rather than pressed.
    if (!bulkEntry) customInputRef.current?.focus();
  }

  function handleContinue() {
    // Whatever is in the field goes with it; the caller adds it to the round.
    onContinue(pendingEntries);
    setCustomInput('');
  }

  // Arriving on the step no longer takes the cursor. On a phone that threw the
  // keyboard up over the screen before the learner had read a word of it, and
  // tapping the field is a single tap away. The cursor still follows a
  // deliberate switch between the single-line and bulk fields, where the
  // learner has just said which one they mean to type in.
  const focusedEntryModeRef = useRef(bulkEntry);
  useEffect(() => {
    if (mode !== 'manual') return;
    if (focusedEntryModeRef.current === bulkEntry) return;
    focusedEntryModeRef.current = bulkEntry;
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

  // Beside the study pair in the screen header, which every tab shares. The menu
  // used to sit in this step's own heading row, so it moved whenever the tab
  // changed — and on the conversation tab it was two loose icons instead.
  //
  // Nothing to offer when there is no settings modal to open, no bulk field to
  // switch to and no saved list to hand out: an empty menu is worse than none.
  const overflowMenu =
    onOpenSettings || (mode === 'manual' && !offScreen) || shareList ? (
      <HeadingMenu label={t('wordChat.moreActions')}>
        {onOpenSettings ? (
          <HeadingMenuItem onClick={onOpenSettings} icon={<SettingsIcon size={16} />}>
            {/* Short here on purpose: the gear's own long label spelled out
                which settings these are because it was an icon with no text. In
                a menu on this screen, that is already clear. */}
            {t('common.settings')}
          </HeadingMenuItem>
        ) : null}
        {mode === 'manual' && !offScreen ? (
          <HeadingMenuItem onClick={() => setBulkEntry((current) => !current)}>
            {t(bulkEntry ? 'wordChat.manualSingleToggle' : 'wordChat.manualBulkToggle')}
          </HeadingMenuItem>
        ) : null}
        {shareList ? (
          <HeadingMenuItem onClick={() => setShareOpen(true)} icon={<ShareIcon size={16} />}>
            {t('share.manageTitle')}
          </HeadingMenuItem>
        ) : null}
      </HeadingMenu>
    ) : null;

  return (
    <div className="space-y-5">
      {overflowMenu && headerSlot ? createPortal(overflowMenu, headerSlot) : null}
      <div className="space-y-3">
        {/* The step's own title, at the size the onboarding screens give theirs.
            It used to be a truncated `text-sm` line squeezed between the study
            pair and an overflow menu, which read as a toolbar label rather than
            as the heading of the screen the learner is on. Hosts with a header
            of their own supply both the title and the place the overflow menu
            goes; onboarding has neither, so it keeps them here. */}
        <div className="flex min-w-0 items-start gap-2">
          <div className="min-w-0 flex-1">
            {titleInHost ? null : (
              <h2 className="text-2xl font-black leading-tight sm:text-3xl">
                {t(mode === 'manual' ? 'wordChat.manualTitle' : 'wordChat.selectTitle')}
              </h2>
            )}
            <p className={`text-sm leading-relaxed onboarding-text-soft ${titleInHost ? '' : 'mt-1.5'}`}>
              {t(
                mode !== 'manual'
                  ? 'wordChat.selectHint'
                  : bulkEntry
                    ? 'wordChat.manualHint'
                    : 'wordChat.manualHintSingle',
              )}
            </p>
          </div>
          {languageFrom && onOpenLanguagePair ? (
            <LanguagePairSummary
              from={languageFrom}
              to={languageTo}
              onOpen={onOpenLanguagePair}
              className="!gap-0.5 !border !px-2 !py-1.5 !text-xs sm:!gap-1"
            />
          ) : null}
          {overflowMenu && !headerSlot ? overflowMenu : null}
        </div>
        {/* The other way to get words: letting the AI bot propose them. It sits
            directly under the heading, as the alternative to the whole step
            rather than an afterthought under the field. */}
        {mode === 'manual' && onStartChat ? (
          <button
            type="button"
            onClick={onStartChat}
            className="onboarding-option-secondary inline-flex min-h-10 items-center gap-2 rounded-full px-4 py-2 text-xs font-extrabold"
          >
            <RobotIcon size={15} />
            <span>{t('wordChat.chatStart')}</span>
          </button>
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
        {proposals.map((item, index) => {
          const selected = isSelected(item);
          const key = getProposalKey(item);
          const editing = editingKey === key;
          return (
            <li key={key} className="word-chat-row" style={{ ['--row-index' as string]: index }}>
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
                      className="word-chat-input min-h-10 min-w-0 flex-1 resize-none rounded-lg px-2 py-1.5 text-base font-bold leading-snug sm:text-sm"
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
                    <span {...noTranslateProps('min-w-0 flex-1 break-words text-sm leading-snug')}>
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
            {mode === 'manual' ? (
              <button
                type="button"
                aria-pressed={audioDisabledKeys.includes(`custom:${item.text}`)}
                aria-label={t(
                  audioDisabledKeys.includes(`custom:${item.text}`)
                    ? 'wordChat.generateAudio'
                    : 'wordChat.skipAudio',
                )}
                title={t(
                  audioDisabledKeys.includes(`custom:${item.text}`)
                    ? 'wordChat.generateAudio'
                    : 'wordChat.skipAudio',
                )}
                onClick={() => onToggleAudioDisabled(`custom:${item.text}`)}
                className="absolute right-9 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-sm transition-colors hover:bg-black/10"
              >
                {audioDisabledKeys.includes(`custom:${item.text}`) ? '🔇' : '🔊'}
              </button>
            ) : null}
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

        {/* Both sides on the chip: these came off a photo with the translation
            already made, so hiding the target would make them look like the
            typed ones that still have to go through the translator. */}
        {pretranslatedItems.map((item) => {
          const key = `${item.textKnown.trim().toLocaleLowerCase()}\u0000${item.textTarget
            .trim()
            .toLocaleLowerCase()}`;
          return (
            <li
              key={`photo-${key}`}
              className="onboarding-option onboarding-option-highlight group relative rounded-xl"
            >
              <span className="block min-w-0 py-2 pl-3 pr-10 text-sm leading-tight">
                <span className="block truncate">{item.textKnown}</span>
                <span className="block truncate text-xs opacity-80">{item.textTarget}</span>
              </span>
              {onRemovePretranslated ? (
                <button
                  type="button"
                  onClick={() => onRemovePretranslated(key)}
                  className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-lg leading-none opacity-80 transition-opacity hover:bg-black/10 sm:opacity-0 sm:group-hover:opacity-80 sm:focus:opacity-80"
                  aria-label={t('wordChat.remove')}
                  title={t('wordChat.remove')}
                >
                  ×
                </button>
              ) : null}
            </li>
          );
        })}
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
          // Pinning to the bottom is instant by nature, but the padding and the
          // backing it grows do not have to be — they fade in with the rest of
          // the screen's reflow.
          'motion-safe:transition-[padding,background-color] motion-safe:duration-200',
          keyboardOpen
            ? 'max-sm:sticky max-sm:bottom-0 max-sm:z-10 max-sm:-mx-1 max-sm:bg-[var(--ob-surface)]/95 max-sm:px-1 max-sm:py-2 max-sm:backdrop-blur'
            : '',
        ].join(' ')}
      >
        {mode === 'manual' && bulkEntry ? (
          <textarea
            ref={customTextareaRef}
            value={customInput}
            onChange={(event) => setCustomInput(event.target.value)}
            placeholder={t('wordChat.manualAddPlaceholder')}
            disabled={atSelectionLimit}
            aria-invalid={inputInvalid}
            rows={4}
            className="word-chat-input w-full resize-y rounded-xl px-3 py-2.5 text-base sm:text-sm disabled:opacity-50"
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
            className="word-chat-input w-full rounded-xl px-3 py-2.5 text-base sm:text-sm disabled:opacity-50"
          />
        )}
        {/* Under the field, not beside it: typing a word and continuing is the
            through-line, and + is the optional detour for a second one. */}
        <div className="flex items-center gap-2">
          <button
            type="submit"
            // Pressing + used to take two taps on a phone: the first blurred
            // the field, the keyboard closed, the sticky form slid down the
            // reflowed viewport, and the tap never landed on the button that
            // had moved. Suppressing the default of the press keeps focus (and
            // the keyboard) exactly where it was, so the click lands the first
            // time — and the learner can type the next word straight away.
            onMouseDown={(event) => event.preventDefault()}
            disabled={!canAddTyped}
            aria-label={t('wordChat.add')}
            title={t('wordChat.add')}
            className="onboarding-option flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl font-bold leading-none disabled:opacity-50"
          >
            <span aria-hidden="true">+</span>
          </button>
        </div>
        {mode === 'manual' && bulkEntry ? (
          <div className="space-y-1 text-xs" aria-live="polite">
            <p className={inputInvalid ? 'text-danger' : 'onboarding-text-soft'}>
              {t('wordChat.manualBulkCount', {
                count: projectedSelectedCount,
                limit: selectionLimit,
              })}
            </p>
            {firstOverlongLine ? (
              <p className="text-danger">
                {t('wordChat.manualBulkLineTooLong', {
                  line: firstOverlongLine.line,
                  count: firstOverlongLine.characterCount,
                  limit: MAX_WORD_CHAT_ITEM_CHARS,
                })}
              </p>
            ) : null}
            {overSelectionLimit ? (
              <p className="text-danger">
                {t('wordChat.manualBulkTooMany', { limit: selectionLimit })}
              </p>
            ) : null}
          </div>
        ) : null}
      </form>

      {/* Who these phrases are spoken to decides how the target words them, so
          it is asked here — right above the button that spends a translation —
          rather than being guessed row by row. Never pre-filled: it describes
          this batch, and the next batch can be for someone else entirely. */}
      {registerApplies ? (
        <section
          role="radiogroup"
          aria-label={t('wordChat.targetRegisterTitle')}
          className="space-y-2 rounded-xl border-2 border-dashed border-[color:color-mix(in_srgb,var(--ob-ink)_30%,transparent)] p-3"
        >
          <div>
            <h3 className="text-xs font-black uppercase tracking-wide onboarding-text-soft">
              {t('wordChat.targetRegisterTitle')}
            </h3>
            <p className="mt-1 text-xs leading-relaxed onboarding-text-soft">
              {t('wordChat.targetRegisterHint', {
                language:
                  getLocalizedLanguageName(languageTo, uiLanguage) ?? languageTo.toUpperCase(),
              })}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {(['casual', 'formal'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={register === value}
                onClick={() => onRegisterChange(value)}
                className={[
                  'onboarding-option min-h-12 rounded-xl px-3 py-2.5 text-left',
                  register === value ? 'onboarding-option-highlight' : '',
                ].join(' ')}
              >
                <span className="block text-sm font-extrabold">
                  {value === 'casual'
                    ? t('wordChat.targetRegisterCasual')
                    : t('wordChat.targetRegisterFormal')}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug onboarding-text-soft">
                  {value === 'casual'
                    ? t('wordChat.targetRegisterCasualHint')
                    : t('wordChat.targetRegisterFormalHint')}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

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

      <div className="flex gap-2 pt-2">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            disabled={busy}
            className="onboarding-option-secondary shrink-0 rounded-xl px-4 py-3.5 text-sm font-extrabold disabled:opacity-50"
          >
            {t('wordChat.back')}
          </button>
        ) : null}
        <button
          type="button"
          onClick={handleContinue}
          // Same first-tap problem as +: with the keyboard up, letting the press
          // blur the field closes the keyboard, the page reflows under the
          // finger and the tap lands where the button no longer is. Keeping
          // focus means one tap is enough.
          onMouseDown={(event) => event.preventDefault()}
          // One typed character is enough: a word that is on screen counts,
          // whether or not + was pressed for it.
          disabled={
            busy ||
            !listName.trim() ||
            projectedSelectedCount === 0 ||
            (monthlyExhausted && projectedTranslatedCount > 0) ||
            overMonthlyLimit ||
            projectedTranslatedCount > monthlyRemaining ||
            inputInvalid ||
            (registerMissing && projectedTranslatedCount > 0)
          }
          className="onboarding-option onboarding-option-highlight flex-1 rounded-xl px-5 py-3.5 text-center text-base font-extrabold transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {busy ? t('wordChat.translating') : t('wordChat.continueToReview')}
        </button>
      </div>

      {/* The monthly allowance is a running total, not an action — it belongs
          under the button that spends it, where it reads as a receipt rather
          than a gate. */}
      <p className="text-center text-xs onboarding-text-soft">
        {monthlyExhausted
          ? t('wordChat.monthlyReached', { limit: limits.monthlyLimit })
          : t('wordChat.monthlyUsage', {
              used: limits.monthlyUsed,
              limit: limits.monthlyLimit,
            })}
      </p>

      {shareList && shareOpen ? (
        <ShareVisibilityDialog
          list={shareList}
          canManage
          appearance="warm"
          onClose={() => setShareOpen(false)}
          onListUpdated={onShareListUpdated}
        />
      ) : null}
    </div>
  );
}
