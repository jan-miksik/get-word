'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { SettingsIcon } from '@/components/icons/AppIcons';
import { getLocalizedLanguageName, normalizeLanguageCode } from '@/lib/i18n/languages';
import { bundledMessages } from '@/lib/i18n/messages';
import type { I18nKey } from '@/lib/i18n/locales/en';
import type { WordChatHistory, WordChatPreferencePatch } from '../hooks/useWordChat';
import type {
  WordChatAddressRegister,
  WordChatLanguageLevel,
  WordChatMessage,
  WordChatSalutationGender,
} from '../types';
import { WORD_CHAT_LANGUAGE_LEVELS } from '../preferences';
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
  { labelKey: 'wordChat.chipOffice', promptKey: 'wordChat.chipOfficePrompt' },
  { labelKey: 'wordChat.chipFamily', promptKey: 'wordChat.chipFamilyPrompt' },
  { labelKey: 'wordChat.chipTravel', promptKey: 'wordChat.chipTravelPrompt' },
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
  addressRegister: WordChatAddressRegister | null;
  salutationGender: WordChatSalutationGender | null;
  languageLevel: WordChatLanguageLevel | null;
  preferencesComplete: boolean;
  preferencesLoading: boolean;
  preferencesSaving: boolean;
  addressRegisterApplies: boolean;
  salutationGenderApplies: boolean;
  onPreferencesChange: (patch: WordChatPreferencePatch) => void | Promise<void>;
  settingsPlacement?: 'inline' | 'screen-header';
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
  addressRegister,
  salutationGender,
  languageLevel,
  preferencesComplete,
  preferencesLoading,
  preferencesSaving,
  addressRegisterApplies,
  salutationGenderApplies,
  onPreferencesChange,
  settingsPlacement = 'inline',
  busy,
  history,
  onSend,
  onUseReadyMade,
}: Props) {
  const { t, language: uiLanguage } = useI18n();
  const [input, setInput] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [setupAddressRegisterOverride, setSetupAddressRegister] =
    useState<WordChatAddressRegister | null>(null);
  const [setupSalutationGenderOverride, setSetupSalutationGender] =
    useState<WordChatSalutationGender | null>(null);
  const [setupLanguageLevelOverride, setSetupLanguageLevel] =
    useState<WordChatLanguageLevel | null>(null);
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
  const showProfileSetup = showIntro && !preferencesComplete;
  const setupAddressRegister = setupAddressRegisterOverride ?? addressRegister;
  const setupSalutationGender = setupSalutationGenderOverride ?? salutationGender;
  const setupLanguageLevel = setupLanguageLevelOverride ?? languageLevel;
  const useFormalUiCopy = addressRegisterApplies && addressRegister === 'formal';
  const introGreetingKey: I18nKey =
    salutationGenderApplies && salutationGender
      ? (`wordChat.${
          useFormalUiCopy ? 'introGreetingFormal' : 'introGreeting'
        }${salutationGender === 'female' ? 'Female' : salutationGender === 'male' ? 'Male' : 'Neutral'}` as I18nKey)
      : useFormalUiCopy
        ? 'wordChat.introGreetingFormal'
        : 'wordChat.introGreeting';
  const setupReady = Boolean(
    setupLanguageLevel &&
      (!addressRegisterApplies || setupAddressRegister) &&
      (!salutationGenderApplies || setupSalutationGender),
  );
  const returning = history?.hasHistory === true;
  // Three labels is enough to say "I remember"; more turns the opener into a list.
  const coveredSummary = (history?.coveredTopics ?? []).slice(0, 3).join(', ');
  const followUpChips = returning ? (history?.missingTopics ?? []).slice(0, 4) : [];
  const lastAssistantIndex = messages.reduce(
    (last, message, index) => (message.role === 'assistant' ? index : last),
    -1,
  );

  if (showProfileSetup && preferencesLoading) {
    return (
      <div className="flex min-h-24 items-center justify-center">
        <TypingDots label={t('wordChat.thinking')} />
      </div>
    );
  }

  if (showProfileSetup) {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-base font-bold">
            <TypingText text={t('wordChat.profileTitle')} animate />
          </p>
          <p className="text-sm leading-relaxed onboarding-text-soft">
            {t('wordChat.profileBody')}
          </p>
        </div>
        {addressRegisterApplies ? (
          <section className="space-y-2">
            <p className="text-xs font-black uppercase tracking-wide onboarding-text-soft">
              {t('wordChat.addressTitle')}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(['casual', 'formal'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSetupAddressRegister(value)}
                  className={[
                    'onboarding-option rounded-xl px-4 py-3 text-left',
                    setupAddressRegister === value ? 'onboarding-option-highlight' : '',
                  ].join(' ')}
                >
                  <span className="block text-sm font-extrabold">
                    {value === 'casual'
                      ? t('wordChat.addressCasual')
                      : t('wordChat.addressFormal')}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-xs leading-relaxed onboarding-text-soft">
              {t('wordChat.addressBody')}
            </p>
          </section>
        ) : null}
        {salutationGenderApplies ? (
          <section className="space-y-2">
            <p className="text-xs font-black uppercase tracking-wide onboarding-text-soft">
              {t('wordChat.salutationTitle')}
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {(['female', 'male', 'neutral'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSetupSalutationGender(value)}
                  className={[
                    'onboarding-option rounded-xl px-4 py-3 text-left',
                    setupSalutationGender === value ? 'onboarding-option-highlight' : '',
                  ].join(' ')}
                >
                  <span className="block text-sm font-extrabold">
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
        <section className="space-y-2">
          <p className="text-xs font-black uppercase tracking-wide onboarding-text-soft">
            {t('wordChat.levelTitle')}
          </p>
          <div className="grid gap-2">
            {WORD_CHAT_LANGUAGE_LEVELS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setSetupLanguageLevel(value)}
                className={[
                  'onboarding-option rounded-xl px-4 py-3 text-left',
                  setupLanguageLevel === value ? 'onboarding-option-highlight' : '',
                ].join(' ')}
              >
                <span className="block text-sm font-extrabold">
                  {t(`wordChat.level${value}` as I18nKey)}
                </span>
              </button>
            ))}
          </div>
        </section>
        <button
          type="button"
          disabled={!setupReady || preferencesSaving}
          onClick={() => {
            if (!setupLanguageLevel) return;
            void onPreferencesChange({
              ...(setupAddressRegister ? { addressRegister: setupAddressRegister } : {}),
              ...(setupSalutationGender ? { salutationGender: setupSalutationGender } : {}),
              languageLevel: setupLanguageLevel,
            });
          }}
          className="onboarding-option onboarding-option-highlight w-full rounded-xl px-5 py-3 text-center text-sm font-extrabold disabled:opacity-50"
        >
          {preferencesSaving ? t('wordChat.profileSaving') : t('wordChat.profileContinue')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {preferencesComplete ? (
        <div
          className={
            settingsPlacement === 'screen-header'
              ? 'absolute right-4 top-4 z-20 flex justify-end sm:right-7 sm:top-7'
              : 'relative flex justify-end'
          }
        >
          <button
            type="button"
            onClick={() => setSettingsOpen((open) => !open)}
            className="onboarding-option-secondary flex h-9 w-9 items-center justify-center rounded-full"
            aria-label={t('wordChat.settings')}
            title={t('wordChat.settings')}
            aria-expanded={settingsOpen}
          >
            <SettingsIcon size={16} />
          </button>
          {settingsOpen ? (
            <div
              role="radiogroup"
              aria-label={t('wordChat.addressSettingLabel')}
              className="absolute right-0 top-full z-30 mt-2 w-[min(16rem,calc(100vw-2rem))] space-y-2 rounded-xl border-2 border-[var(--ob-ink)] bg-[var(--ob-surface)] p-3 text-[var(--ob-ink)] shadow-lg isolate"
            >
              <p className="m-0 px-1 pb-1 text-xs font-black uppercase tracking-wide text-[var(--ob-ink)]">
                {t('wordChat.settings')}
              </p>
              {addressRegisterApplies ? (
              <div className="grid gap-2">
                <p className="px-1 text-[11px] font-black uppercase onboarding-text-soft">
                  {t('wordChat.addressSettingLabel')}
                </p>
                {(['casual', 'formal'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={addressRegister === value}
                    onClick={() => {
                      void onPreferencesChange({ addressRegister: value });
                      setSettingsOpen(false);
                    }}
                    className={[
                      'onboarding-option rounded-lg px-3 py-2 text-left text-sm font-bold',
                      addressRegister === value ? 'onboarding-option-highlight' : '',
                    ].join(' ')}
                  >
                    {value === 'casual'
                      ? t('wordChat.addressCasual')
                      : t('wordChat.addressFormal')}
                  </button>
                ))}
              </div>
              ) : null}
              {salutationGenderApplies ? (
                <div className="grid gap-2">
                  <p className="px-1 text-[11px] font-black uppercase onboarding-text-soft">
                    {t('wordChat.salutationSettingLabel')}
                  </p>
                  {(['female', 'male', 'neutral'] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={salutationGender === value}
                      onClick={() => {
                        void onPreferencesChange({ salutationGender: value });
                        setSettingsOpen(false);
                      }}
                      className={[
                        'onboarding-option rounded-lg px-3 py-2 text-left text-sm font-bold',
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
              ) : null}
              <div className="grid gap-2">
                <p className="px-1 text-[11px] font-black uppercase onboarding-text-soft">
                  {t('wordChat.levelSettingLabel')}
                </p>
                {WORD_CHAT_LANGUAGE_LEVELS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={languageLevel === value}
                    onClick={() => {
                      void onPreferencesChange({ languageLevel: value });
                      setSettingsOpen(false);
                    }}
                    className={[
                      'onboarding-option rounded-lg px-3 py-2 text-left text-sm font-bold',
                      languageLevel === value ? 'onboarding-option-highlight' : '',
                    ].join(' ')}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

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
                  : t(introGreetingKey, { language: targetName })
              }
              animate
            />
          </p>
          <p className="text-sm leading-relaxed onboarding-text-soft">
            {returning
              ? coveredSummary
                ? t(
                    useFormalUiCopy
                      ? 'wordChat.returningBodyCoveredFormal'
                      : 'wordChat.returningBodyCovered',
                    { topics: coveredSummary },
                  )
                : t(useFormalUiCopy ? 'wordChat.returningBodyFormal' : 'wordChat.returningBody')
              : t(useFormalUiCopy ? 'wordChat.introBodyFormal' : 'wordChat.introBody')}
          </p>
        </div>
      ) : null}

      {messages.length > 0 ? (
        <div className="max-h-[45vh] space-y-3 overflow-y-auto pr-1">
          {messages.map((message, index) => (
            <div
              key={message.id ?? `${message.role}-${index}`}
              className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
            >
              <p
                className={[
                  'max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed',
                  message.role === 'assistant' && index === lastAssistantIndex
                    ? 'motion-safe:animate-[word-chat-message-in_180ms_ease-out_both]'
                    : '',
                  message.role === 'user'
                    ? 'onboarding-option onboarding-option-highlight'
                    : 'word-chat-assistant-message',
                ].join(' ')}
              >
                {message.role === 'assistant' && message.incomplete ? (
                  <>
                    {message.content}
                    <span className="word-chat-stream-caret" aria-hidden="true" />
                  </>
                ) : message.role === 'assistant' ? (
                  <TypingText
                    text={message.content}
                    animate={index === lastAssistantIndex}
                    animationKey={message.id ?? `${index}:${message.content}`}
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
                    onClick={() =>
                      onSend(
                        t(
                          useFormalUiCopy
                            ? 'wordChat.followUpPromptFormal'
                            : 'wordChat.followUpPrompt',
                          { topic },
                        ),
                      )
                    }
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
          placeholder={t(
            useFormalUiCopy ? 'wordChat.inputPlaceholderFormal' : 'wordChat.inputPlaceholder',
          )}
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
