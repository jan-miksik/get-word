'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { getLocalizedLanguageName, normalizeLanguageCode } from '@/lib/i18n/languages';
import { bundledMessages } from '@/lib/i18n/messages';
import type { I18nKey } from '@/lib/i18n/locales/en';
import type { WordChatHistory } from '../hooks/useWordChat';
import type { WordChatMessage } from '../types';
import { hasRegisterDistinction } from '../registerLanguages';
import { TypingDots, TypingText } from './TypingText';

/**
 * Starter chips. Short labels so they scan on a phone; the full brief is what
 * gets sent, so the model still gets something concrete to work with.
 *
 * The full brief lands in the transcript as the learner's own message. Resolve
 * it in the known language rather than blindly using the UI locale: those can
 * differ, and an English UI must not put English words in a Czech learner's
 * mouth. For languages without a bundled dictionary, the UI translation is the
 * readable fallback.
 */
const STARTER_CHIPS: { labelKey: I18nKey; promptKey: I18nKey }[] = [
  { labelKey: 'wordChat.chipCustomers', promptKey: 'wordChat.chipCustomersPrompt' },
  { labelKey: 'wordChat.chipMoving', promptKey: 'wordChat.chipMovingPrompt' },
  { labelKey: 'wordChat.chipFamily', promptKey: 'wordChat.chipFamilyPrompt' },
  { labelKey: 'wordChat.chipTravel', promptKey: 'wordChat.chipTravelPrompt' },
  { labelKey: 'wordChat.chipWork', promptKey: 'wordChat.chipWorkPrompt' },
];

function resolveStarterPrompt(
  promptKey: I18nKey,
  languageFrom: string,
  uiLanguage: string,
  translateUi: (key: I18nKey) => string,
): string {
  const knownLanguage = normalizeLanguageCode(languageFrom);
  const normalizedUiLanguage = normalizeLanguageCode(uiLanguage);
  if (!knownLanguage || knownLanguage === normalizedUiLanguage) return translateUi(promptKey);
  return bundledMessages[knownLanguage]?.[promptKey] ?? translateUi(promptKey);
}

type Props = {
  languageFrom: string;
  languageTo: string;
  messages: WordChatMessage[];
  suggestions: string[];
  busy: 'chat' | 'propose' | null;
  /** What earlier sessions left behind; null while unknown or on a first visit. */
  history: WordChatHistory | null;
  onSend: (text: string) => void;
  /**
   * The ready-made-list escape hatch. Omitted inside the app, where the learner
   * already has lists and a subscribe shortcut would just be noise.
   */
  onUseReadyMade?: () => void;
};

export function ChatStep({
  languageFrom,
  languageTo,
  messages,
  suggestions,
  busy,
  history,
  onSend,
  onUseReadyMade,
}: Props) {
  const { t, language: uiLanguage } = useI18n();
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const locale = languageFrom || uiLanguage;
  const targetName = getLocalizedLanguageName(languageTo, locale) ?? languageTo.toUpperCase();

  const scrollToEnd = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, []);

  useEffect(() => {
    scrollToEnd();
  }, [messages.length, busy, scrollToEnd]);

  // The input is disabled while a reply is in flight, which drops focus. Give it
  // back so the learner can just keep typing.
  useEffect(() => {
    if (busy === null) inputRef.current?.focus();
  }, [busy]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!input.trim() || busy) return;
    onSend(input);
    setInput('');
  }

  const showIntro = messages.length === 0;
  const returning = history?.hasHistory === true;
  // Three labels is enough to say "I remember"; more turns the opener into a list.
  const coveredSummary = (history?.coveredTopics ?? []).slice(0, 3).join(', ');
  const followUpChips = returning ? (history?.missingTopics ?? []).slice(0, 4) : [];
  const lastAssistantIndex = messages.reduce(
    (last, message, index) => (message.role === 'assistant' ? index : last),
    -1,
  );

  return (
    <div className="space-y-4">
      {showIntro ? (
        <div className="space-y-2">
          <p className="text-base font-bold">
            {/* The opener animates too — it is the first thing the learner sees,
                and a static wall of text reads less like a conversation.
                Someone who has done this before is picked up mid-thread instead
                of being introduced to the feature again. */}
            <TypingText
              text={
                returning
                  ? t('wordChat.returningGreeting')
                  : t('wordChat.introGreeting', { language: targetName })
              }
              animate
            />
          </p>
          <p className="text-sm leading-relaxed onboarding-text-soft">
            {returning
              ? coveredSummary
                ? t('wordChat.returningBodyCovered', { topics: coveredSummary })
                : t('wordChat.returningBody')
              : t('wordChat.introBody')}
          </p>
          {!returning && hasRegisterDistinction(languageTo) ? (
            <p className="text-sm leading-relaxed onboarding-text-soft">
              {t('wordChat.introRegister', { language: targetName })}
            </p>
          ) : null}
        </div>
      ) : null}

      {messages.length > 0 ? (
        <div className="max-h-[45vh] space-y-3 overflow-y-auto pr-1">
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
            >
              <p
                className={[
                  'max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed',
                  message.role === 'user'
                    ? 'onboarding-option onboarding-option-highlight'
                    : 'onboarding-option',
                ].join(' ')}
              >
                {message.role === 'assistant' ? (
                  <TypingText
                    text={message.content}
                    animate={index === lastAssistantIndex}
                    onTick={scrollToEnd}
                  />
                ) : (
                  message.content
                )}
              </p>
            </div>
          ))}
          {busy ? (
            <div className="flex items-center gap-2 text-xs onboarding-text-soft">
              <TypingDots
                label={busy === 'propose' ? t('wordChat.suggesting') : t('wordChat.thinking')}
              />
              <span className="italic">
                {busy === 'propose' ? t('wordChat.suggesting') : t('wordChat.thinking')}
              </span>
            </div>
          ) : null}
          <div ref={endRef} />
        </div>
      ) : null}

      {!busy && (showIntro || suggestions.length > 0) ? (
        <div className="flex flex-wrap gap-2">
          {showIntro
            ? followUpChips.length > 0
              ? // Things the learner said they wanted but never studied. Far
                // better starting points than the generic situations.
                followUpChips.map((topic) => (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => onSend(t('wordChat.followUpPrompt', { topic }))}
                    className="onboarding-option rounded-full px-3 py-1.5 text-xs font-bold"
                  >
                    {topic}
                  </button>
                ))
              : STARTER_CHIPS.map((chip) => (
                  <button
                    key={chip.labelKey}
                    type="button"
                    onClick={() =>
                      onSend(resolveStarterPrompt(chip.promptKey, languageFrom, uiLanguage, t))
                    }
                    className="onboarding-option rounded-full px-3 py-1.5 text-xs font-bold"
                  >
                    {t(chip.labelKey)}
                  </button>
                ))
            : suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => onSend(suggestion)}
                  className="onboarding-option rounded-full px-3 py-1.5 text-xs font-bold"
                >
                  {suggestion}
                </button>
              ))}
        </div>
      ) : null}

      <form onSubmit={submit} className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={t('wordChat.inputPlaceholder')}
          disabled={busy !== null}
          maxLength={1000}
          // The chat is the point of this screen, so the caret starts here.
          autoFocus
          className="word-chat-input min-w-0 flex-1 px-3 py-2.5 text-sm disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy !== null || !input.trim()}
          className="onboarding-option onboarding-option-highlight shrink-0 rounded-full px-4 py-2.5 text-sm font-extrabold disabled:opacity-50"
        >
          {t('wordChat.send')}
        </button>
      </form>

      {/* Onboarding only, and deliberately an escape hatch rather than a sixth,
          equally prominent answer. Inside the app the caller omits it. */}
      {onUseReadyMade ? (
      <div className="flex justify-center">
        <button
          type="button"
          onClick={onUseReadyMade}
          disabled={busy !== null}
          className="text-[11px] onboarding-text-soft opacity-50 transition-opacity hover:opacity-100 hover:underline disabled:cursor-not-allowed disabled:opacity-25"
        >
          {t('wordChat.readyMadeLink')}
        </button>
      </div>
      ) : null}
    </div>
  );
}
