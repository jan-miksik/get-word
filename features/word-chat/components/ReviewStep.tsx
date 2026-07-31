'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { resolveClipUrl } from '../client/clip-playback';
import { MAX_WORD_CHAT_ITEM_CHARS } from '../limits';
import type { TranslationDiagnostics } from '../hooks/useWordChat';
import type { ReviewItem } from '../types';

type Props = {
  items: ReviewItem[];
  /** The personal list these rows are saved into, by name. */
  listName: string;
  /** What the learner called this batch; shown so the target is not a mystery. */
  categoryName: string;
  warningsByKnown: Record<string, string[]>;
  translationDiagnostics: TranslationDiagnostics | null;
  isPublic: boolean | null;
  busy: boolean;
  onUpdate: (index: number, patch: Partial<Pick<ReviewItem, 'textKnown' | 'textTarget'>>) => void;
  onRemove: (index: number) => void;
  onEnsureAudio: (index: number) => void;
  onBack: () => void;
  onSave: () => void;
};

function PreparingAudio({ label }: { label: string }) {
  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-accent/30 bg-accent/10 text-accent"
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-full border border-accent/40 motion-safe:animate-[word-chat-audio-ring_1.8s_ease-out_infinite] motion-reduce:hidden"
      />
      <span aria-hidden="true" className="flex h-4 items-center gap-[3px]">
        <span className="h-2.5 w-[3px] rounded-full bg-current motion-safe:animate-[word-chat-audio-bar_900ms_ease-in-out_infinite] motion-safe:[animation-delay:-300ms]" />
        <span className="h-4 w-[3px] rounded-full bg-current motion-safe:animate-[word-chat-audio-bar_900ms_ease-in-out_infinite] motion-safe:[animation-delay:-150ms]" />
        <span className="h-3 w-[3px] rounded-full bg-current motion-safe:animate-[word-chat-audio-bar_900ms_ease-in-out_infinite]" />
      </span>
    </span>
  );
}

function MissingAudio() {
  return (
    <span
      aria-hidden="true"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-background/30 text-text-soft/55"
    >
      <svg width="17" height="17" viewBox="0 0 18 18" fill="none">
        <path
          d="M3.25 7.15v3.7h2.6L9 13.35v-3.1M9 7.75v-3.1L7.55 5.8"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M3 3l12 12"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

/**
 * "Copy all" is intentionally spreadsheet-friendly. Neutralize leading formula
 * markers so a learner-authored value cannot become a formula when pasted into
 * Excel or Google Sheets.
 */
function safeSpreadsheetCell(value: string): string {
  return /^\s*[=+\-@]/.test(value) ? `'${value}` : value;
}

/**
 * The editable text of one review row.
 *
 * A textarea rather than an input because these rows are sentences as often as
 * they are words: a single-line input scrolls the tail of a long sentence out of
 * sight, so the learner is asked to confirm a translation they cannot read. This
 * wraps and grows the row instead, and still behaves like a one-line field —
 * Enter is not a newline here, it is "done".
 */
function AutoGrowingText({
  value,
  onChange,
  onBlur,
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  className: string;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // Height follows content on every change — including the ones this component
  // does not cause, such as a regenerated translation arriving from the server.
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${node.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      maxLength={MAX_WORD_CHAT_ITEM_CHARS}
      aria-label={ariaLabel}
      className={`w-full resize-none overflow-hidden break-words bg-transparent outline-none ${className}`}
    />
  );
}

/**
 * The single confirmation step. Translations are already generated; audio is
 * prepared in the background. The learner edits anything that looks wrong and
 * saves once.
 *
 * Editing the target text clears that row's audio (the clip no longer says what
 * the row says); leaving the field triggers a fresh best-effort clip.
 */
export function ReviewStep({
  items,
  listName,
  categoryName,
  warningsByKnown,
  translationDiagnostics,
  isPublic,
  busy,
  onUpdate,
  onRemove,
  onEnsureAudio,
  onBack,
  onSave,
}: Props) {
  const { t } = useI18n();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [copied, setCopied] = useState(false);

  /**
   * Hand the whole set over as tab-separated text so it can be checked
   * somewhere else — a spreadsheet, a message to a native speaker. Tabs rather
   * than a prettier layout precisely because it pastes into columns.
   */
  const copyAll = useCallback(async () => {
    const text = items
      .map(
        (item) =>
          `${safeSpreadsheetCell(item.textKnown)}\t${safeSpreadsheetCell(item.textTarget)}`,
      )
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied (permissions, insecure origin). Silent:
      // the learner can still select the rows by hand.
    }
  }, [items]);

  // Clips are addressed by content hash — `/api/audio/[hash]` has no idea what
  // an asset id is and answers one with a 404 — and served from the local cache
  // whenever we have the bytes, which for a clip generated moments ago is much
  // faster than waiting for an Arweave gateway to catch up.
  const play = useCallback(async (contentHash: string) => {
    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.src = await resolveClipUrl(contentHash);
    void audioRef.current.play().catch(() => {
      // Autoplay policies and transient network errors are not worth an alert.
    });
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-extrabold">{t('wordChat.reviewTitle')}</h2>
          <button
            type="button"
            onClick={() => void copyAll()}
            disabled={items.length === 0}
            className="onboarding-option-secondary shrink-0 rounded-full px-3 py-1.5 text-xs font-bold disabled:opacity-50"
          >
            {copied ? t('wordChat.copiedAll') : t('wordChat.copyAll')}
          </button>
        </div>
        <p className="mt-1 text-sm font-bold">
          {categoryName ? `${listName} · ${categoryName}` : listName}
        </p>
        <p className="onboarding-notice mt-2 rounded-md px-3 py-2 text-xs leading-relaxed">
          {t('wordChat.reviewNotice')}
          {isPublic ? ` ${t('wordChat.reviewNoticePublic')}` : ''}
        </p>
        {translationDiagnostics ? (
          <p className="mt-1.5 text-[10px] font-medium onboarding-text-soft">
            {/* Which model wrote these translations, and nothing else. Spend is
                a workbench number — it lives in the debug panel and in
                `word_chat_usage`, not on the learner's review screen. */}
            {t('wordChat.translationDiagnostics', {
              model: translationDiagnostics.model,
            })}
          </p>
        ) : null}
      </div>

      <ul className="space-y-2">
        {items.map((item, index) => {
          const warnings = warningsByKnown[item.textKnown] ?? [];
          return (
            <li
              key={`${item.textKnown}-${index}`}
              className="onboarding-option group relative rounded-xl px-3 py-3 pr-11"
            >
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full text-lg leading-none opacity-80 transition-opacity hover:bg-black/10 sm:opacity-0 sm:group-hover:opacity-80 sm:focus:opacity-80"
                aria-label={t('wordChat.remove')}
                title={t('wordChat.remove')}
              >
                ×
              </button>

              <div className="flex items-center gap-3">
                {item.audioHash ? (
                  <button
                    type="button"
                    onClick={() => void play(item.audioHash as string)}
                    className="onboarding-option-secondary relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold motion-safe:animate-[word-chat-audio-ready_420ms_ease-out_both]"
                    aria-label={t('wordChat.play')}
                    title={t('wordChat.play')}
                  >
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 rounded-full border border-accent/50 motion-safe:animate-[word-chat-audio-ready-ring_650ms_ease-out_both] motion-reduce:hidden"
                    />
                    <svg
                      aria-hidden="true"
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      className="translate-x-px"
                    >
                      <path d="M3.5 2.15v9.7L11.6 7 3.5 2.15Z" fill="currentColor" />
                    </svg>
                  </button>
                ) : item.audioStatus === 'pending' ? (
                  <PreparingAudio label={t('wordChat.audioPreparing')} />
                ) : (
                  <MissingAudio />
                )}

                <div className="min-w-0 flex-1 space-y-1.5">
                  {/* The source side is what the learner asked for — they typed
                      it, or picked it off the proposal list. Editing it here
                      would leave a translation of something else standing
                      underneath it, so it is shown, not offered. Changing it is
                      a step back, where re-translating is the point. */}
                  <p className="break-words text-base leading-snug sm:text-lg">
                    {item.textKnown}
                  </p>
                  <AutoGrowingText
                    value={item.textTarget}
                    onChange={(value) => onUpdate(index, { textTarget: value })}
                    onBlur={() => {
                      if (!item.audioAssetId) {
                        onEnsureAudio(index);
                      }
                    }}
                    className="text-base font-bold leading-snug sm:text-lg"
                    ariaLabel={t('wordChat.badgeSentence')}
                  />
                </div>
              </div>

              {warnings.length > 0 ? (
                <p className="mt-1 text-[11px] leading-relaxed onboarding-text-soft">
                  {warnings.join(' · ')}
                </p>
              ) : null}

              {item.takeover ? (
                <span className="mt-2 inline-block rounded-full border border-current px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide opacity-60">
                  {t('wordChat.badgeTakeover')}
                </span>
              ) : null}

              {!item.audioHash ? (
                <span
                  aria-live="polite"
                  className="mt-2 block text-[11px] onboarding-text-soft"
                >
                  {item.audioStatus === 'pending'
                    ? t('wordChat.audioPreparing')
                    : t('wordChat.noAudio')}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

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
          onClick={onSave}
          disabled={busy || items.length === 0}
          className="onboarding-option onboarding-option-highlight flex-1 rounded-xl px-5 py-3 text-center text-base font-extrabold disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? t('wordChat.saving') : t('wordChat.save')}
        </button>
      </div>
    </div>
  );
}
