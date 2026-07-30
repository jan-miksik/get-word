'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { ArrowUpIcon, PencilIcon } from '@/components/icons/AppIcons';
import type { WordList } from '@/features/lists/types';
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
import { WordChatSettingsControls } from './WordChatSettingsControls';
import { SalutationGenderBadge } from './SalutationGenderIcon';
import { StreamedText, TypingDots, TypingText } from './TypingText';

type ProfileSetupStep = 'address' | 'level' | 'salutation';

/** How tall the composer may grow before it starts scrolling instead. */
const COMPOSER_MAX_ROWS = 6;

/**
 * A suggested answer is a whole sentence often enough that a pill which clips it
 * is worse than no chip at all: the learner is choosing between texts they can
 * only half read. So a chip wraps onto as many lines as it needs, and the rounded
 * corners drop from a pill to a radius that survives being two lines tall.
 */
const CHIP_CLASS =
  'onboarding-option max-w-full whitespace-normal break-words rounded-2xl px-3.5 py-2 text-left text-xs font-bold leading-snug';

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
  /**
   * The already-saved personal list, when there is one. Passed straight through
   * to the settings controls, which put a share button beside the gear — the
   * chat step needs it as much as the select step does, since a learner who
   * wants to hand their list out should not have to walk forward a step first.
  */
  shareList?: WordList | null;
  onShareListUpdated?: (list: WordList) => void;
  settingsPlacement?: 'inline' | 'screen-header';
  /** Controlled open state for the settings gear; see WordChatFlow. */
  settingsOpen?: boolean;
  onSettingsOpenChange?: (open: boolean) => void;
  busy: 'chat' | 'propose' | null;
  /** What earlier sessions left behind; null while unknown or on a first visit. */
  history: WordChatHistory | null;
  /** False means the chat rejected the message before starting a turn. */
  onSend: (text: string) => void | boolean | Promise<void | boolean>;
  onStartManualEntry?: () => void;
  /** An on-screen keyboard is covering the lower part of a phone screen. */
  keyboardOpen?: boolean;
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
  shareList,
  onShareListUpdated,
  settingsPlacement = 'inline',
  settingsOpen,
  onSettingsOpenChange,
  busy,
  history,
  onSend,
  onStartManualEntry,
  keyboardOpen = false,
  active = true,
  embedded = false,
}: Props) {
  const { t, language: uiLanguage } = useI18n();
  const [input, setInput] = useState('');
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
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // The target language's name is dropped into i18n copy, so it has to be
  // localized the same way that copy is — see `chatLanguage` in `useWordChat`.
  const locale = uiLanguage || languageFrom;
  const targetName = getLocalizedLanguageName(languageTo, locale) ?? languageTo.toUpperCase();

  const scrollToEnd = useCallback(() => {
    if (!active) return;
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [active]);

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

  // Opening the keyboard collapses the chrome above and shortens the visible
  // area from below; without this the last reply ends up behind the keys.
  useEffect(() => {
    if (!keyboardOpen) return;
    const frame = window.requestAnimationFrame(() => scrollToEnd());
    return () => window.cancelAnimationFrame(frame);
  }, [keyboardOpen, scrollToEnd]);

  // The input is disabled while a reply is in flight, which drops focus. Give it
  // back so the learner can just keep typing.
  useEffect(() => {
    if (active && !embedded && busy === null) inputRef.current?.focus();
  }, [active, busy, embedded]);

  // Grow the composer with what is being typed, up to a few rows. The height has
  // to be released first: `scrollHeight` on an element with an explicit height
  // never reports anything smaller than that height, so deleting text would
  // leave the field stuck at its tallest.
  const resizeComposer = useCallback(() => {
    const node = inputRef.current;
    if (!node) return;
    node.style.height = 'auto';
    const styles = window.getComputedStyle(node);
    const lineHeight = Number.parseFloat(styles.lineHeight) || 20;
    const frame =
      Number.parseFloat(styles.paddingTop) +
      Number.parseFloat(styles.paddingBottom) +
      Number.parseFloat(styles.borderTopWidth) +
      Number.parseFloat(styles.borderBottomWidth);
    const framePx = Number.isFinite(frame) ? frame : 0;
    const maxHeight = lineHeight * COMPOSER_MAX_ROWS + framePx;
    // One row is the floor. The workspace keeps this screen mounted and
    // `display: none` behind the study stream, where a field measures as zero —
    // written back unclamped, that collapsed the composer to a sliver which
    // survived the surface coming back. Now the worst a bogus measurement can
    // do is one row, and the effect below re-measures once the field is on
    // screen again.
    const minHeight = lineHeight + framePx;
    const borders =
      Number.parseFloat(styles.borderTopWidth) + Number.parseFloat(styles.borderBottomWidth);
    const contentHeight = node.scrollHeight + (Number.isFinite(borders) ? borders : 0);
    node.style.height = `${Math.min(Math.max(contentHeight, minHeight), maxHeight)}px`;
    node.style.overflowY = contentHeight > maxHeight ? 'auto' : 'hidden';
  }, []);

  // Re-measure on the text, and again whenever the field could have been
  // measured under conditions that no longer hold: the surface was hidden, or
  // the phone keyboard opened and reflowed the screen around it.
  useEffect(() => {
    resizeComposer();
  }, [input, active, keyboardOpen, resizeComposer]);

  async function sendInput() {
    if (!input.trim() || busy) return;
    const submitted = input;
    const accepted = await onSend(submitted);
    if (accepted !== false) setInput('');
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void sendInput();
  }

  const showIntro = messages.length === 0;
  // A restored draft can contain messages from before profile fields became
  // required. Do not render an apparently usable composer while the hook will
  // reject every message for missing preferences.
  const showProfileSetup = !preferencesComplete;
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
  // A first-time learner gets no chips at all: generic situations ("Travel",
  // "At the office") were guesses that steered the conversation more than they
  // helped it. Someone who has been here before gets a single chip built from
  // their own brief — one concrete next step, not a menu.
  const followUpChips = returning
    ? buildFollowUpChips(
        {
          missingTopics: history?.missingTopics ?? [],
          situations: history?.situations ?? [],
          goals: history?.goals ?? [],
          coveredTopics: history?.coveredTopics ?? [],
        },
        1,
      )
    : [];
  const lastAssistantIndex = messages.reduce(
    (last, message, index) => (message.role === 'assistant' ? index : last),
    -1,
  );
  const settingsControls = (
    <WordChatSettingsControls
      languageFrom={languageFrom}
      languageTo={languageTo}
      shareList={shareList}
      onShareListUpdated={onShareListUpdated}
      addressRegister={addressRegister}
      salutationGender={salutationGender}
      languageLevel={languageLevel}
      addressRegisterApplies={addressRegisterApplies}
      salutationGenderApplies={salutationGenderApplies}
      saving={preferencesSaving}
      onChange={onPreferencesChange}
      onLanguagePairChange={onLanguagePairChange}
      placement={settingsPlacement}
      active={active}
      open={settingsOpen}
      onOpenChange={onSettingsOpenChange}
    />
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
      <div
        className={`space-y-5 ${embedded ? 'min-h-0 flex-1 overflow-y-auto overflow-x-hidden' : ''}`}
      >
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
                      <SalutationGenderBadge
                        gender={value}
                        selected={setupSalutationGender === value}
                      />
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
    // Embedded, this is a chat screen rather than a page: the surface hands it a
    // fixed height, the conversation is the only thing that scrolls, and the
    // composer is a static last row. It used to be `sticky bottom-0` inside the
    // surface's own scroller, which let the padding below the card push it back
    // up over the last stretch of the scroll.
    <div className={embedded ? 'flex min-h-0 flex-1 flex-col gap-4' : 'space-y-4'}>
      {settingsControls}

      <div
        className={
          embedded
            ? 'flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden'
            : 'space-y-4'
        }
      >
        {/* The opener stays above the transcript once the conversation starts: it
            is the only thing on screen that says what this chat is for and which
            language it is about, and losing it after the first message left the
            learner looking at a bare exchange with no framing. The exception is a
            phone with the keyboard up — mid-conversation, those two lines cost
            the learner the replies they are answering. */}
        <div className={`space-y-2 ${keyboardOpen && !showIntro ? 'hidden' : ''}`}>
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
                ? // What this learner told us, minus what they already studied.
                  // Empty for a first visit, where we know nothing yet.
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
                      className={CHIP_CLASS}
                    >
                      {kind === 'continue' ? t('wordChat.chipContinueTopic', { topic }) : topic}
                    </button>
                  ))
                : suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => onSend(suggestion)}
                      className={CHIP_CLASS}
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
      </div>

      <form
        onSubmit={submit}
        className={`flex items-end gap-2 ${
          // No rule above it: the field's own border already sets the composer
          // apart from the transcript, and a second line across the screen only
          // narrowed what little height a phone has left.
          embedded ? 'shrink-0 pt-2' : ''
        }`}
      >
        {/* A textarea, not a single-line input: someone describing their
            situation writes two or three lines, and a single line scrolls the
            beginning of that out of sight while they are still typing it. It
            starts one row tall and grows with the text up to `COMPOSER_MAX_ROWS`,
            after which it scrolls — same as every chat people already use. */}
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends, Shift+Enter breaks the line. `isComposing` guards the
            // IME candidate window, where Enter means "accept this word".
            if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
              return;
            }
            event.preventDefault();
            void sendInput();
          }}
          placeholder={t(
            useFormalUiCopy ? 'wordChat.inputPlaceholderFormal' : 'wordChat.inputPlaceholder',
          )}
          disabled={busy !== null}
          maxLength={1000}
          // The chat is the point of this screen, so the caret starts here.
          autoFocus={!embedded}
          // Phone keyboards otherwise offer a plain return key, which several
          // of them treat as "new line" rather than submit.
          enterKeyHint="send"
          // 16px on a phone: iOS zooms the page into any field it considers
          // too small to read, and never zooms back out.
          className="word-chat-input min-w-0 flex-1 resize-none px-3 py-2.5 text-base leading-snug sm:text-sm disabled:opacity-50"
        />
        {/* A phone has no room for a word here: the label costs the input about
            a fifth of its width, and an arrow in a circle is what every chat
            has trained people to look for. From `sm` up the word comes back. */}
        <button
          type="submit"
          disabled={busy !== null || !input.trim()}
          aria-label={t('wordChat.send')}
          className="onboarding-option onboarding-option-highlight flex h-11 w-11 shrink-0 items-center justify-center rounded-full p-0 text-sm font-extrabold disabled:opacity-50 sm:h-auto sm:w-auto sm:px-4 sm:py-2.5"
        >
          <ArrowUpIcon size={20} className="sm:hidden" />
          <span className="hidden sm:inline">{t('wordChat.send')}</span>
        </button>
      </form>
    </div>
  );
}
