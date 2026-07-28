'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { PencilIcon, SettingsIcon } from '@/components/icons/AppIcons';
import { getLocalizedLanguageName } from '@/lib/i18n/languages';
import type { I18nKey } from '@/lib/i18n/locales/en';
import { buildFollowUpChips } from '../followUpChips';
import type { WordChatHistory, WordChatPreferencePatch } from '../hooks/useWordChat';
import { splitWordChatLevelLabel, wordChatLevelLabelKey } from '../levelLabels';
import type {
  WordChatAddressRegister,
  WordChatLanguageLevel,
  WordChatMessage,
  WordChatSalutationGender,
} from '../types';
import { WORD_CHAT_LANGUAGE_LEVELS } from '../preferences';
import { ChatSettingsModal } from './ChatSettingsModal';
import { SalutationGenderIcon } from './SalutationGenderIcon';
import { StreamedText, TypingDots, TypingText } from './TypingText';

type ProfileSetupStep = 'address' | 'level' | 'salutation';

/**
 * Starter chips. Short labels so they scan on a phone; the full brief is what
 * gets sent, so the model still gets something concrete to work with.
 *
 * Both halves come from the interface catalog. The brief lands in the
 * transcript as the learner's own message, and the chat is written in the
 * interface language, so anything else would put a sentence in their mouth in
 * a language the rest of the screen is not using.
 */
type StarterChip = { labelKey: I18nKey; promptKey: I18nKey };

// The learner's level calibrates the proposed vocabulary, not what they might
// need it for. Keep these broad situations stable across every CEFR level so a
// level change never hides an otherwise relevant starting point.
const STARTER_CHIPS: StarterChip[] = [
  { labelKey: 'wordChat.chipCustomers', promptKey: 'wordChat.chipCustomersPrompt' },
  { labelKey: 'wordChat.chipOffice', promptKey: 'wordChat.chipOfficePrompt' },
  { labelKey: 'wordChat.chipFamily', promptKey: 'wordChat.chipFamilyPrompt' },
  { labelKey: 'wordChat.chipTravel', promptKey: 'wordChat.chipTravelPrompt' },
];

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
  onLanguagePairChange: (pair: { from: string; to: string }) => void | Promise<void>;
  settingsPlacement?: 'inline' | 'screen-header';
  busy: 'chat' | 'propose' | null;
  /** What earlier sessions left behind; null while unknown or on a first visit. */
  history: WordChatHistory | null;
  onSend: (text: string) => void;
  onStartManualEntry?: () => void;
  active?: boolean;
  embedded?: boolean;
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
  onLanguagePairChange,
  settingsPlacement = 'inline',
  busy,
  history,
  onSend,
  onStartManualEntry,
  active = true,
  embedded = false,
}: Props) {
  const { t, language: uiLanguage } = useI18n();
  const [input, setInput] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [setupAddressRegister, setSetupAddressRegister] =
    useState<WordChatAddressRegister | null>(null);
  const [setupSalutationGender, setSetupSalutationGender] =
    useState<WordChatSalutationGender | null>(null);
  const [setupLanguageLevel, setSetupLanguageLevel] =
    useState<WordChatLanguageLevel | null>(null);
  const [profileSetupStep, setProfileSetupStep] = useState<ProfileSetupStep>(
    addressRegisterApplies ? 'address' : 'level',
  );
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // The target language's name is dropped into i18n copy, so it has to be
  // localized the same way that copy is — see `chatLanguage` in `useWordChat`.
  const locale = uiLanguage || languageFrom;
  const targetName = getLocalizedLanguageName(languageTo, locale) ?? languageTo.toUpperCase();

  const scrollToEnd = useCallback(() => {
    if (!active) return;
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [active]);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  // The reply is revealed a few characters at a frame, so following it means
  // scrolling as it is drawn rather than when the text arrives — the message
  // grows for a moment after the last delta has landed. Rate-limited: a smooth
  // scroll restarted on every frame fights itself.
  const lastFollowAtRef = useRef(0);
  const followRevealedText = useCallback(() => {
    const now = Date.now();
    if (now - lastFollowAtRef.current < 120) return;
    lastFollowAtRef.current = now;
    scrollToEnd();
  }, [scrollToEnd]);

  useEffect(() => {
    scrollToEnd();
  }, [messages.length, busy, scrollToEnd]);

  // The input is disabled while a reply is in flight, which drops focus. Give it
  // back so the learner can just keep typing.
  useEffect(() => {
    if (active && !embedded && busy === null) inputRef.current?.focus();
  }, [active, busy, embedded]);

  // The surface stays mounted when the learner switches away, so settings left
  // open would silently reappear on their next visit. Adjusted during render
  // (React's documented pattern for deriving state from a prop change) rather
  // than in an effect, which would cost an extra render pass.
  const [wasActive, setWasActive] = useState(active);
  if (wasActive !== active) {
    setWasActive(active);
    if (!active) setSettingsOpen(false);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!input.trim() || busy) return;
    onSend(input);
    setInput('');
  }

  const showIntro = messages.length === 0;
  const showProfileSetup = showIntro && !preferencesComplete;
  const useFormalUiCopy = addressRegisterApplies && addressRegister === 'formal';
  const introGreetingKey: I18nKey =
    salutationGenderApplies && salutationGender
      ? (`wordChat.${
          useFormalUiCopy ? 'introGreetingFormal' : 'introGreeting'
        }${salutationGender === 'female' ? 'Female' : salutationGender === 'male' ? 'Male' : 'Neutral'}` as I18nKey)
      : useFormalUiCopy
        ? 'wordChat.introGreetingFormal'
        : 'wordChat.introGreeting';
  const profileSetupSteps: ProfileSetupStep[] = [
    ...(addressRegisterApplies ? (['address'] as const) : []),
    'level',
    ...(salutationGenderApplies ? (['salutation'] as const) : []),
  ];
  const profileSetupStepIndex = Math.max(0, profileSetupSteps.indexOf(profileSetupStep));
  const profileSetupProgress =
    ((profileSetupStepIndex + 1) / profileSetupSteps.length) * 100;
  const returning = history?.hasHistory === true;
  // Three labels is enough to say "I remember"; more turns the opener into a list.
  const coveredSummary = (history?.coveredTopics ?? []).slice(0, 3).join(', ');
  // Chips for someone who has been here before come from their brief, so they
  // follow on from the last session instead of repeating the generic starters.
  const followUpChips = returning
    ? buildFollowUpChips({
        missingTopics: history?.missingTopics ?? [],
        situations: history?.situations ?? [],
        goals: history?.goals ?? [],
        coveredTopics: history?.coveredTopics ?? [],
      })
    : [];
  const lastAssistantIndex = messages.reduce(
    (last, message, index) => (message.role === 'assistant' ? index : last),
    -1,
  );
  const settingsButton = (
    <button
      type="button"
      onClick={() => setSettingsOpen(true)}
      className="onboarding-option-secondary flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
      aria-label={t('wordChat.settings')}
      title={t('wordChat.settings')}
      aria-haspopup="dialog"
    >
      <SettingsIcon size={18} />
    </button>
  );
  const settingsModal = (
    <ChatSettingsModal
      isOpen={active && settingsOpen}
      languageFrom={languageFrom}
      languageTo={languageTo}
      addressRegister={addressRegister}
      salutationGender={salutationGender}
      languageLevel={languageLevel}
      addressRegisterApplies={addressRegisterApplies}
      salutationGenderApplies={salutationGenderApplies}
      saving={preferencesSaving}
      onChange={onPreferencesChange}
      onLanguagePairChange={onLanguagePairChange}
      onClose={closeSettings}
    />
  );
  const settingsControls =
    settingsPlacement === 'screen-header' ? (
      <div className="absolute right-3 top-3 z-20 sm:right-7 sm:top-7">
        {settingsButton}
        {settingsModal}
      </div>
    ) : (
      <div className="relative flex justify-end">
        {settingsButton}
        {settingsModal}
      </div>
    );

  if (showProfileSetup && preferencesLoading) {
    return (
      <div>
        {settingsControls}
        <div className="flex min-h-24 items-center justify-center">
          <TypingDots label={t('wordChat.thinking')} />
        </div>
      </div>
    );
  }

  if (showProfileSetup) {
    const saveSetupPreferences = (
      finalPatch: Pick<
        WordChatPreferencePatch,
        'languageLevel' | 'salutationGender'
      >,
    ) => {
      void onPreferencesChange({
        ...(setupAddressRegister ? { addressRegister: setupAddressRegister } : {}),
        ...(setupLanguageLevel ? { languageLevel: setupLanguageLevel } : {}),
        ...finalPatch,
      });
    };

    return (
      <div className="space-y-5">
        {settingsControls}
        <div className="flex items-center justify-between gap-4">
          <p className="text-base font-bold">
            <TypingText text={t('wordChat.profileTitle')} animate />
          </p>
          <span
            aria-hidden="true"
            className="shrink-0 rounded-full border border-[color:color-mix(in_srgb,var(--ob-ink)_24%,transparent)] px-2.5 py-1 text-[11px] font-black tabular-nums onboarding-text-soft"
          >
            {profileSetupStepIndex + 1} / {profileSetupSteps.length}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={t('wordChat.profileTitle')}
          aria-valuemin={1}
          aria-valuemax={profileSetupSteps.length}
          aria-valuenow={profileSetupStepIndex + 1}
          className="h-1.5 overflow-hidden rounded-full bg-[color:color-mix(in_srgb,var(--ob-ink)_12%,transparent)]"
        >
          <div
            className="h-full rounded-full bg-[var(--ob-accent)] transition-[width] duration-500 ease-out motion-reduce:transition-none"
            style={{ width: `${profileSetupProgress}%` }}
          />
        </div>

        {profileSetupStepIndex > 0 ? (
          <div className="flex">
            <button
              type="button"
              disabled={preferencesSaving}
              aria-label={t('wordChat.profileBack')}
              onClick={() => {
                const previousStep = profileSetupSteps[profileSetupStepIndex - 1];
                if (previousStep) setProfileSetupStep(previousStep);
              }}
              className="onboarding-option-secondary inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-extrabold shadow-sm transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50"
            >
              <span aria-hidden="true" className="text-lg leading-none">←</span>
              <span>{t('wordChat.back')}</span>
            </button>
          </div>
        ) : null}

        <section
          key={profileSetupStep}
          className="relative space-y-4 overflow-hidden rounded-3xl border border-[color:color-mix(in_srgb,var(--ob-ink)_18%,transparent)] bg-[color:color-mix(in_srgb,var(--ob-surface)_82%,white)] p-4 shadow-[0_14px_35px_color-mix(in_srgb,var(--ob-ink)_9%,transparent)] motion-safe:animate-[word-chat-setup-enter_320ms_cubic-bezier(0.16,1,0.3,1)_both] sm:p-5"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-6 -top-7 h-24 w-24 rounded-full bg-[var(--ob-accent)] opacity-[0.08] blur-2xl"
          />
          <div className="relative flex items-start gap-3">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--ob-accent)] text-sm text-[var(--ob-surface)] shadow-sm motion-safe:animate-[word-chat-setup-spark_2.4s_ease-in-out_infinite]"
            >
              ✦
            </span>
            <h2 className="pt-1.5 text-base font-black leading-snug">
              {profileSetupStep === 'address'
                ? t('wordChat.addressTitle')
                : profileSetupStep === 'level'
                  ? t(
                      setupAddressRegister === 'casual'
                        ? 'wordChat.levelTitleCasual'
                        : setupAddressRegister === 'formal'
                          ? 'wordChat.levelTitleFormal'
                          : 'wordChat.levelTitle',
                    )
                  : t(
                      setupAddressRegister === 'casual'
                        ? 'wordChat.salutationTitleCasual'
                        : setupAddressRegister === 'formal'
                          ? 'wordChat.salutationTitleFormal'
                          : 'wordChat.salutationTitle',
                    )}
            </h2>
          </div>

          <div
            className={[
              'relative grid gap-2',
              profileSetupStep === 'address' ? 'sm:grid-cols-2' : '',
              profileSetupStep === 'salutation' ? 'sm:grid-cols-3' : '',
            ].join(' ')}
          >
            {profileSetupStep === 'address'
              ? (['casual', 'formal'] as const).map((value, index) => (
                  <button
                    key={value}
                    type="button"
                    disabled={preferencesSaving}
                    onClick={() => {
                      setSetupAddressRegister(value);
                      setProfileSetupStep('level');
                    }}
                    className={[
                      'onboarding-option group flex items-center justify-between rounded-2xl px-4 py-3.5 text-left transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] motion-safe:animate-[word-chat-setup-option-in_260ms_ease-out_both]',
                      setupAddressRegister === value ? 'onboarding-option-highlight' : '',
                    ].join(' ')}
                    style={{ animationDelay: `${80 + index * 55}ms` }}
                  >
                    <span className="text-sm font-extrabold">
                      {value === 'casual'
                        ? t('wordChat.addressCasual')
                        : t('wordChat.addressFormal')}
                    </span>
                    <span
                      aria-hidden="true"
                      className="translate-x-0 text-lg transition-transform duration-200 group-hover:translate-x-1"
                    >
                      →
                    </span>
                  </button>
                ))
              : null}

            {profileSetupStep === 'level'
              ? WORD_CHAT_LANGUAGE_LEVELS.map((value, index) => {
                  const levelLabel = splitWordChatLevelLabel(
                    value,
                    t(wordChatLevelLabelKey(value)),
                  );
                  const accessibleLabel = t(wordChatLevelLabelKey(value));
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-label={accessibleLabel}
                      disabled={preferencesSaving}
                      onClick={() => {
                        setSetupLanguageLevel(value);
                        if (salutationGenderApplies) {
                          setProfileSetupStep('salutation');
                          return;
                        }
                        saveSetupPreferences({ languageLevel: value });
                      }}
                      className={[
                        'onboarding-option group flex items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-left transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] motion-safe:animate-[word-chat-setup-option-in_260ms_ease-out_both]',
                        setupLanguageLevel === value ? 'onboarding-option-highlight' : '',
                      ].join(' ')}
                      style={{ animationDelay: `${60 + index * 45}ms` }}
                    >
                      <span className="min-w-0">
                        <span className="block text-[11px] font-bold uppercase tracking-wide onboarding-text-soft">
                          {levelLabel.code}
                        </span>
                        <span className="mt-0.5 block text-base font-extrabold leading-snug sm:text-lg">
                          {levelLabel.description}
                        </span>
                      </span>
                      <span
                        aria-hidden="true"
                        className="shrink-0 translate-x-0 text-lg transition-transform duration-200 group-hover:translate-x-1"
                      >
                        →
                      </span>
                    </button>
                  );
                })
              : null}

            {profileSetupStep === 'salutation'
              ? (['female', 'male', 'neutral'] as const).map((value, index) => (
                  <button
                    key={value}
                    type="button"
                    disabled={preferencesSaving}
                    onClick={() => {
                      setSetupSalutationGender(value);
                      saveSetupPreferences({ salutationGender: value });
                    }}
                    className={[
                      'onboarding-option group flex items-center justify-between rounded-2xl px-4 py-3.5 text-left transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] motion-safe:animate-[word-chat-setup-option-in_260ms_ease-out_both]',
                      setupSalutationGender === value ? 'onboarding-option-highlight' : '',
                    ].join(' ')}
                    style={{ animationDelay: `${80 + index * 55}ms` }}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span
                        aria-hidden="true"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--ob-accent)_14%,transparent)] text-[var(--ob-accent)]"
                      >
                        <SalutationGenderIcon gender={value} />
                      </span>
                      <span className="text-sm font-extrabold">
                        {value === 'female'
                          ? t('wordChat.salutationFemale')
                          : value === 'male'
                            ? t('wordChat.salutationMale')
                            : t('wordChat.salutationNeutral')}
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className="shrink-0 translate-x-0 text-lg transition-transform duration-200 group-hover:translate-x-1"
                    >
                      →
                    </span>
                  </button>
                ))
              : null}
          </div>
        </section>
        {preferencesSaving ? (
          <p className="text-center text-xs font-bold onboarding-text-soft">
            {t('wordChat.profileSaving')}
          </p>
        ) : null}
        {onStartManualEntry ? (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={onStartManualEntry}
              disabled={preferencesSaving}
              className="onboarding-option-secondary inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold disabled:opacity-50"
            >
              <PencilIcon size={14} />
              <span>{t('wordChat.manualStart')}</span>
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {settingsControls}

      {/* The opener stays above the transcript once the conversation starts: it
          is the only thing on screen that says what this chat is for and which
          language it is about, and losing it after the first message left the
          learner looking at a bare exchange with no framing. */}
      <div className="space-y-2">
        <p className={showIntro ? 'text-base font-bold' : 'text-sm font-bold'}>
          {/* A first-time opener can type in. Returning copy is already-known
              context, so reopening the chat must render it immediately. */}
          <TypingText
            text={
              returning
                ? t('wordChat.returningGreeting')
                : t(introGreetingKey, { language: targetName })
            }
            animate={showIntro && !returning}
          />
        </p>
        {showIntro ? (
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
        ) : null}
      </div>

      {messages.length > 0 ? (
        <div className={`${embedded ? '' : 'max-h-[45vh] overflow-y-auto'} space-y-3 pr-1`}>
          {messages.map((message, index) => {
            // The in-flight assistant entry starts empty. The working status
            // below already communicates progress, so do not render a blank
            // speech bubble (previously it contained only a blinking caret).
            if (message.role === 'assistant' && message.incomplete && !message.content) {
              return null;
            }

            return (
              <div
                key={message.id ?? `${message.role}-${index}`}
                className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
              >
                <p
                  className={[
                    'max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed',
                    message.role === 'assistant' &&
                    message.incomplete &&
                    index === lastAssistantIndex
                      ? 'motion-safe:animate-[word-chat-message-in_180ms_ease-out_both]'
                      : '',
                    message.role === 'user'
                      ? 'onboarding-option onboarding-option-highlight'
                      : 'word-chat-assistant-message',
                  ].join(' ')}
                >
                  {message.role === 'assistant' ? (
                    <StreamedText
                      text={message.content}
                      // Only a reply that is still being streamed when its
                      // bubble appears types itself out; anything already
                      // finished (an earlier turn, a restored draft) is text
                      // the learner has seen and must not replay.
                      animate={message.incomplete === true}
                      onReveal={followRevealedText}
                    />
                  ) : (
                    message.content
                  )}
                </p>
              </div>
            );
          })}
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
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {showIntro
              ? followUpChips.length > 0
                ? // What this learner told us, minus what they already studied.
                  // Far better starting points than the generic situations.
                  followUpChips.map(({ topic, kind }) => (
                    <button
                      key={`${kind}-${topic}`}
                      type="button"
                      onClick={() =>
                        onSend(
                          t(
                            kind === 'continue'
                              ? useFormalUiCopy
                                ? 'wordChat.continueTopicPromptFormal'
                                : 'wordChat.continueTopicPrompt'
                              : useFormalUiCopy
                                ? 'wordChat.followUpPromptFormal'
                                : 'wordChat.followUpPrompt',
                            { topic },
                          ),
                        )
                      }
                      className="onboarding-option rounded-full px-3 py-1.5 text-xs font-bold"
                    >
                      {kind === 'continue' ? t('wordChat.chipContinueTopic', { topic }) : topic}
                    </button>
                  ))
                : STARTER_CHIPS.map((chip) => (
                    <button
                      key={chip.labelKey}
                      type="button"
                      onClick={() =>
                        // The chip's label and the message it sends are the same
                        // sentence in two lengths, so both come from the
                        // interface catalog — the language the chat itself now
                        // speaks.
                        onSend(t(chip.promptKey))
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
          {showIntro && onStartManualEntry ? (
            <button
              type="button"
              onClick={onStartManualEntry}
              className="onboarding-option-secondary inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold"
            >
              <PencilIcon size={14} />
              <span>{t('wordChat.manualStart')}</span>
            </button>
          ) : null}
        </div>
      ) : null}

      <form
        onSubmit={submit}
        className={`flex gap-2 ${
          embedded
            ? 'sticky bottom-0 z-10 -mx-2 bg-[var(--ob-surface)]/95 px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur'
            : ''
        }`}
      >
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
          autoFocus={!embedded}
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
    </div>
  );
}
