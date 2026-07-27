'use client';

import { useCallback, useRef, useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { resolveClipUrl } from '../client/clip-playback';
import type { TranslationDiagnostics } from '../hooks/useWordChat';
import type { ReviewItem } from '../types';

type Props = {
  items: ReviewItem[];
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

/**
 * The single confirmation step. Translations and audio are already generated;
 * the learner edits anything that looks wrong and saves once.
 *
 * Editing the target text clears that row's audio (the clip no longer says what
 * the row says); leaving the field triggers a fresh best-effort clip.
 */
export function ReviewStep({
  items,
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
      .map((item) => `${item.textKnown}\t${item.textTarget}`)
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
        <p className="onboarding-notice mt-2 rounded-md px-3 py-2 text-xs leading-relaxed">
          {t('wordChat.reviewNotice')}
          {isPublic ? ` ${t('wordChat.reviewNoticePublic')}` : ''}
        </p>
        {translationDiagnostics ? (
          <p className="mt-1.5 text-[10px] font-medium onboarding-text-soft">
            {t('wordChat.translationDiagnostics', {
              model: translationDiagnostics.model,
              cost: translationDiagnostics.estimatedCostUsd.toFixed(6),
              input: translationDiagnostics.inputTokens,
              output: translationDiagnostics.outputTokens,
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
                    className="onboarding-option-secondary flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                    aria-label={t('wordChat.play')}
                    title={t('wordChat.play')}
                  >
                    ▶
                  </button>
                ) : null}

                <div className="min-w-0 flex-1 space-y-1.5">
                  <input
                    type="text"
                    value={item.textKnown}
                    onChange={(event) => onUpdate(index, { textKnown: event.target.value })}
                    className="w-full bg-transparent text-base outline-none sm:text-lg"
                    aria-label={t('wordChat.badgeWord')}
                  />
                  <input
                    type="text"
                    value={item.textTarget}
                    onChange={(event) => onUpdate(index, { textTarget: event.target.value })}
                    onBlur={() => {
                      if (!item.audioAssetId) onEnsureAudio(index);
                    }}
                    className="w-full bg-transparent text-base font-bold outline-none sm:text-lg"
                    aria-label={t('wordChat.badgeSentence')}
                  />
                </div>
              </div>

              {warnings.length > 0 ? (
                <p className="mt-1 text-[11px] leading-relaxed onboarding-text-soft">
                  {warnings.join(' · ')}
                </p>
              ) : null}

              {!item.audioAssetId ? (
                <span className="mt-2 block text-[11px] onboarding-text-soft">
                  {t('wordChat.noAudio')}
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
