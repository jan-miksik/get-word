'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { warmPaletteVars } from '@/features/shared/theme/warm-palette';
import { WordChatFlow } from './WordChatFlow';
import { useMobileKeyboardOpen } from '../hooks/useMobileKeyboardOpen';
import type { WordChatStep } from '../hooks/useWordChat';

type Props = {
  languageFrom: string;
  languageTo: string;
  baseListId?: string | null;
  refreshAfterCommit?: () => Promise<void>;
  /** Persists the chat's pair as the app-wide learning-language preference. */
  onLanguagePairChange: (pair: { from: string; to: string }) => void | Promise<void>;
  /** Back to studying. */
  onClose: () => void;
  /** Whether this mounted workspace surface is currently visible. */
  active?: boolean;
  onCommitted: (result: {
    listId: string;
    categoryId: string | null;
    itemCount: number;
    takeoverCount: number;
    upgradedTakeoverCount: number;
  }) => void;
};

/**
 * "Add words" opened from inside the app.
 *
 * Deliberately not the onboarding screen: no account row and no ready-made-list
 * offer. The opener picks up from the stored brief (see
 * `/api/word-chat/context`) so a returning learner is not re-introduced every
 * time.
 */
export function AddWordsScreen({
  languageFrom,
  languageTo,
  baseListId,
  refreshAfterCommit,
  onLanguagePairChange,
  onClose,
  active = true,
  onCommitted,
}: Props) {
  const { t } = useI18n();
  const [step, setStep] = useState<WordChatStep>('select');
  const [headerBackAction, setHeaderBackAction] = useState<(() => void) | null>(null);
  // Held above the keyed WordChatFlow so the settings modal survives the remount
  // a language-pair change forces — the learner can change both languages in one
  // sitting instead of having the modal close after the first.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const screenRef = useRef<HTMLDivElement | null>(null);
  const keyboardOpen = useMobileKeyboardOpen(screenRef, active);
  // No confirmation banner: the pickers in the settings modal already show which
  // pair is in force, so announcing the change a second time on the screen
  // behind them only took a line away from the chat.
  const changeLanguagePair = useCallback(
    async (nextPair: { from: string; to: string }) => {
      if (nextPair.from === languageFrom && nextPair.to === languageTo) return;
      await onLanguagePairChange(nextPair);
      setStep('select');
    },
    [languageFrom, languageTo, onLanguagePairChange],
  );
  // Saving words is the end of this errand, not a prompt to start another one:
  // hand the learner straight back to the study stream the new words just
  // landed in. The flow has already reset itself, so reopening Add words starts
  // from a fresh chat.
  const returnToStudyAfterDone = useCallback(() => {
    setStep('select');
    onClose();
  }, [onClose]);
  const handleHeaderBackActionChange = useCallback((action: (() => void) | null) => {
    setHeaderBackAction(action ? () => action : null);
  }, []);

  // While the keyboard is up on a phone there is barely a third of the screen
  // left, and the top menu is not usable mid-sentence anyway. Hand its space to
  // this screen (see `[data-app-keyboard]` in `styles/layout.css`).
  useEffect(() => {
    if (!keyboardOpen) return;
    const root = document.documentElement;
    // The menu slides out instead of blinking away, and a negative margin is
    // the only collapse that animates from an `auto` height — so it needs the
    // bar's real height, measured here while it is still open.
    const headerHeight = document.querySelector<HTMLElement>('.app-header-bar')?.offsetHeight;
    if (headerHeight) root.style.setProperty('--app-header-height', `${headerHeight}px`);
    root.dataset.appKeyboard = 'open';
    return () => {
      delete root.dataset.appKeyboard;
    };
  }, [keyboardOpen]);

  // The chat step is a screen, not a document: it takes the height the surface
  // gives it, scrolls the conversation inside itself and keeps the composer on
  // the bottom edge. Everything below the card — the wrapper's padding included
  // — would otherwise be slack the composer slides up into at the end of a
  // scroll. The later steps stay ordinary documents the surface scrolls.
  const fullHeight = step === 'chat';

  return (
    // Full-bleed on a phone: the chat is the whole screen there, so the card's
    // side gutters and rounded corners only cost width that word chips, inputs
    // and the transcript can use. From `sm` up it goes back to a card.
    <div
      ref={screenRef}
      className={[
        'mx-auto flex w-full max-w-[800px] flex-col px-0 sm:px-4 sm:pb-8',
        fullHeight
          ? 'min-h-0 flex-1 pb-0'
          : // On a phone the card is the screen at every step, not just the
            // chat: it grows into whatever height is left so the paper-coloured
            // background runs to the bottom edge instead of stopping under the
            // last row with app background showing below it. The bottom breathing
            // room moves inside the card for the same reason. From `sm` up
            // nothing changes — it stays a card on the page.
            'max-sm:flex-1 sm:pb-[max(2rem,env(safe-area-inset-bottom))]',
      ].join(' ')}
    >
      <section
        // The `.onboarding-*` classes and every `var(--ob-…)` in this subtree
        // read these. They are declared on `.onboarding-screen`, which this
        // in-app surface is not inside — so without them the ones written
        // without a fallback (the sticky composer's background, the dashed and
        // hairline borders built with `color-mix`) resolved to nothing and fell
        // back to `currentColor`, painting dark patches on the beige.
        style={warmPaletteVars}
        className={[
          // Borderless on a phone: the sheet and the page are one cream surface
          // there (see `[data-app-surface='chat']` in `styles/layout.css`), and
          // a leftover edge would draw a dark line across it. From `sm` up it is
          // an inset card on sand again and keeps its full border.
          'onboarding-card relative w-full rounded-2xl! border-2! p-4 max-sm:rounded-none! max-sm:border-0! max-sm:px-3 sm:p-7',
          // The card tightens up as the keyboard arrives; it does so over the
          // same beat as the menu sliding away above it, so the screen settles
          // rather than snaps.
          'motion-safe:transition-[padding] motion-safe:duration-200',
          keyboardOpen ? 'max-sm:pt-2' : '',
          fullHeight
            ? 'flex min-h-0 flex-1 flex-col max-sm:pb-[max(0.5rem,env(safe-area-inset-bottom))]'
            : 'max-sm:flex-1 max-sm:pb-[max(2rem,env(safe-area-inset-bottom))]',
        ].join(' ')}
      >
        <div
          className={[
            'grid grid-cols-[1fr_auto_1fr] items-center gap-3',
            'motion-safe:transition-[margin] motion-safe:duration-200',
            keyboardOpen ? 'mb-2' : 'mb-4',
          ].join(' ')}
        >
          {headerBackAction ? (
            <button
              type="button"
              onClick={headerBackAction}
              className="justify-self-start rounded-full border-2 border-[#2A2218]/60 bg-[#F4EFE2]/70 px-3.5 py-2 text-xs font-bold text-[#2A2218] transition hover:-translate-y-0.5 hover:border-[#2A2218] hover:bg-[#FFF8E8] hover:shadow-md"
            >
              ← {t('wordChat.back')}
            </button>
          ) : (
            <span />
          )}
          {/* Every step past the chat carries its own heading — and with the
              keyboard up, even the one heading is a line the transcript needs
              more than the learner does. */}
          {step === 'chat' && !keyboardOpen ? (
            <h1 className="text-center text-sm font-extrabold uppercase tracking-wide">
              {t('wordChat.addWords')}
            </h1>
          ) : (
            <span />
          )}
          <span />
        </div>

        <WordChatFlow
          key={`${languageFrom}\u0000${languageTo}`}
          languageFrom={languageFrom}
          languageTo={languageTo}
          baseListId={baseListId}
          refreshAfterCommit={refreshAfterCommit}
          onLanguagePairChange={changeLanguagePair}
          onDone={returnToStudyAfterDone}
          onStepChange={setStep}
          onHeaderBackActionChange={handleHeaderBackActionChange}
          settingsPlacement="screen-header"
          settingsOpen={settingsOpen}
          onSettingsOpenChange={setSettingsOpen}
          // Typing your own words is the plain way in; the conversation waits
          // behind a button on that step for when the learner wants ideas.
          entryStep="manual"
          keyboardOpen={keyboardOpen}
          active={active}
          embedded
          onCommitted={onCommitted}
        />
      </section>
    </div>
  );
}
