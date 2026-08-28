'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { PencilIcon, PhotoLabIcon, RobotIcon } from '@/components/icons/AppIcons';
import { warmPaletteVars } from '@/features/shared/theme/warm-palette';
import { LanguagePairSummary } from '@/features/shared/languages/LanguagePairSummary';
import { WordChatFlow, type WordChatEntryActions } from './WordChatFlow';
import { WordChatProgress } from './WordChatProgress';
import { loadDraft, readAddWordsTab, storeAddWordsTab } from '../client/storage';
import { useMobileKeyboardOpen } from '../hooks/useMobileKeyboardOpen';
import type { WordChatStep } from '../hooks/useWordChat';

/** The three ways in. Not three screens — three ways of filling the same step. */
export type AddWordsTab = 'manual' | 'photo' | 'ai';

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
  /**
   * The photo lab, rendered by the host — this screen owns the tab, not what is
   * behind it. Undefined until the tab has actually been opened once: the lab is
   * a second app (camera, IndexedDB, a zoom canvas) and nobody should pay for it
   * on a visit that only ever typed words.
   *
   * Called with `pickWords`, which is how the picked pairs reach this screen's
   * basket: they are already translated and voiced, so they wait for the Check
   * step beside the typed ones instead of being saved from the lab.
   */
  photoTab?: (api: {
    pickWords: (items: { known: string; target: string; audioHash?: string | null }[]) => void;
  }) => ReactNode;
  /**
   * Whether the photo tab belongs on the bar at all. Separate from `photoTab`,
   * which is empty until the tab is first opened — the tab has to be there
   * before it can be pressed.
   */
  photoTabAvailable?: boolean;
  /**
   * True while the photo tab is the one showing. Owned by the host because it
   * is a URL-level fact (`?surface=photo`), not a local toggle: the top menu
   * and old bookmarks still link straight to it.
   */
  photoTabActive?: boolean;
  /** Asks the host to show another tab. See `photoTabActive` for why it is theirs. */
  onTabChange?: (tab: AddWordsTab) => void;
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
 * One screen with one heading and three ways in — typing, a photo, the
 * conversation — instead of a chat screen here and a photo lab behind a camera
 * button in the top menu.
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
  photoTab,
  photoTabAvailable = false,
  photoTabActive = false,
  onTabChange,
  onCommitted,
}: Props) {
  const { t } = useI18n();
  const [step, setStep] = useState<WordChatStep>('select');
  const [headerBackAction, setHeaderBackAction] = useState<(() => void) | null>(null);
  // Held above the keyed WordChatFlow so the settings modal survives the remount
  // a language-pair change forces — the learner can change both languages in one
  // sitting instead of having the modal close after the first.
  const [settingsOpen, setSettingsOpen] = useState(false);
  // The chat step's gear and share button used to be pinned to the card's
  // top-right corner, which is exactly where this header puts the language
  // pair — they landed on top of it. They render into this row instead.
  const [headerSlot, setHeaderSlot] = useState<HTMLDivElement | null>(null);
  // The tab bar is here; the two doors it opens belong to the flow below it.
  // State rather than a ref: the photo tab is a render prop, so its handler is
  // built during render and cannot read a ref to find the flow's actions.
  const [entryActions, setEntryActions] = useState<WordChatEntryActions | null>(null);
  // Later steps no longer identify how this batch was started. Preserve the
  // entry choice so an AI-created proposal does not highlight "By typing" as
  // soon as the conversation advances from `chat` to `select`.
  const [entryTab, setEntryTab] = useState<Exclude<AddWordsTab, 'photo'>>(() => {
    const draft = loadDraft(languageFrom, languageTo);
    if (draft) {
      return draft.messages.length > 0 || draft.proposals.length > 0 ? 'ai' : 'manual';
    }
    return readAddWordsTab() === 'ai' ? 'ai' : 'manual';
  });
  const restoredTabRef = useRef(false);
  const screenRef = useRef<HTMLDivElement | null>(null);
  const keyboardOpen = useMobileKeyboardOpen(screenRef, active && !photoTabActive);
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
  const handleEntryActionsChange = useCallback((actions: WordChatEntryActions | null) => {
    setEntryActions(actions);
  }, []);

  const activeTab: AddWordsTab = photoTabActive ? 'photo' : entryTab;
  // Collecting words is what the tabs are for. Once the translations are on
  // screen the learner is working on one batch, and switching the way in would
  // only be a way to lose it.
  const showTabs = photoTabActive || step === 'select' || step === 'chat';

  const selectTab = useCallback(
    (tab: AddWordsTab) => {
      if (tab === activeTab) return;
      storeAddWordsTab(tab);
      if (tab !== 'photo') setEntryTab(tab);
      // The surface moves first — the flow's own tabs live behind `?surface=chat`,
      // and telling it to switch while the photo tab is still up would run the
      // change on a screen nobody is looking at.
      if (tab !== 'photo') onTabChange?.(tab);
      if (tab === 'manual') entryActions?.startManual();
      else if (tab === 'ai') entryActions?.startChat();
      else onTabChange?.('photo');
    },
    [activeTab, entryActions, onTabChange],
  );

  // Words picked off a photo join the basket and the learner comes back to it:
  // the picking is done, and the next thing to look at is the batch they are
  // building, not the picture they built it from.
  const pickPhotoWords = useCallback(
    (items: { known: string; target: string; audioHash?: string | null }[]) => {
      if (items.length === 0 || !entryActions) return;
      entryActions.addPretranslatedItems(
        items.map((item) => ({
          textKnown: item.known,
          textTarget: item.target,
          audioHash: item.audioHash ?? null,
        })),
      );
      selectTab('manual');
    },
    [entryActions, selectTab],
  );

  // Reopening on the way in the learner used last. The two addresses are the
  // host's call (see `openAddWords`); the conversation is settled here, because
  // this is the only place that can see whether a draft is waiting — an
  // interrupted batch of typed words outranks a remembered preference.
  useEffect(() => {
    if (!active || !entryActions || restoredTabRef.current) return;
    restoredTabRef.current = true;
    if (photoTabActive) return;
    if (loadDraft(languageFrom, languageTo)) return;
    if (entryTab !== 'ai') return;
    entryActions.startChat();
  }, [active, entryActions, entryTab, languageFrom, languageTo, photoTabActive]);

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
  const fullHeight = !photoTabActive && step === 'chat';

  const tabs: { id: AddWordsTab; label: string; icon: ReactNode }[] = [
    { id: 'manual', label: t('addWords.tabManual'), icon: <PencilIcon size={15} /> },
    ...(photoTabAvailable
      ? [
          {
            id: 'photo' as const,
            label: t('addWords.tabPhoto'),
            icon: <PhotoLabIcon size={15} />,
          },
        ]
      : []),
    { id: 'ai', label: t('addWords.tabAi'), icon: <RobotIcon size={15} /> },
  ];

  return (
    // The screen, not a card on a page — at every width. It used to become an
    // inset bordered card from `sm` up, which cost the photo tab exactly the
    // width a picture wants and drew a frame around a surface that already runs
    // edge to edge (see `[data-app-surface='chat']` in `styles/layout.css`).
    <div
      ref={screenRef}
      className={[
        'flex w-full flex-col px-0',
        fullHeight ? 'min-h-0 flex-1 pb-0' : 'flex-1',
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
          // No side padding of its own: the reading column and the header carry
          // theirs, and the photo lab pads itself — a shared gutter here would
          // stack on top of the lab's and narrow the picture twice over.
          'relative flex w-full flex-col bg-[var(--ob-surface)] pt-4 text-[color:var(--ob-ink)] sm:pt-6',
          // The screen tightens up as the keyboard arrives; it does so over the
          // same beat as the menu sliding away above it, so it settles rather
          // than snaps.
          'motion-safe:transition-[padding] motion-safe:duration-200',
          keyboardOpen ? 'max-sm:pt-2' : '',
          fullHeight ? 'min-h-0 flex-1' : 'flex-1',
        ].join(' ')}
      >
        {/* One header for every tab and every step: the screen's name, the study
            pair, and — while words are still being collected — the three ways in.
            Past that the tabs give way to the step rail and a Back, because from
            there on the learner is working on one batch rather than choosing how
            to start it. */}
        <div
          className={[
            // The same column on every tab. Widening it for the photo tab lined
            // the title up with the gallery, but it also made the heading jump
            // sideways the moment a tab was pressed — and a header that moves
            // when you switch tabs reads as a different screen, not the same one.
            'mx-auto flex w-full max-w-[800px] flex-col gap-3 px-3 sm:px-4',
            'motion-safe:transition-[margin] motion-safe:duration-200',
            keyboardOpen ? 'mb-3' : 'mb-5',
          ].join(' ')}
        >
          <div className="flex items-start gap-3">
            <h1
              className={[
                'm-0 min-w-0 flex-1 font-black leading-tight',
                keyboardOpen ? 'text-lg' : 'text-2xl sm:text-3xl',
              ].join(' ')}
            >
              {t('addWords.title')}
            </h1>
            <div ref={setHeaderSlot} className="flex shrink-0 items-center gap-2">
              <LanguagePairSummary
                from={languageFrom}
                to={languageTo}
                onOpen={() => setSettingsOpen(true)}
              />
            </div>
          </div>

          {showTabs ? (
            // A tab strip, not three buttons: the ways in are one choice among
            // siblings, so they share a baseline and the active one is marked by
            // an underline rather than by being filled in like an action.
            <div
              role="tablist"
              aria-label={t('addWords.title')}
              className="-mx-1 flex items-stretch gap-1 overflow-x-auto border-b-2 border-[color:color-mix(in_srgb,var(--ob-ink,#2A2218)_16%,transparent)] px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {tabs.map((tab) => {
                const selected = tab.id === activeTab;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => selectTab(tab.id)}
                    className={[
                      // The 2px pull-down parks each tab's own bottom border on
                      // the strip's line, so the selected one reads as sitting
                      // on the surface below instead of floating above it.
                      'relative -mb-[2px] inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-2',
                      'whitespace-nowrap rounded-t-lg border-b-[3px] bg-transparent px-3 py-2',
                      'text-xs font-extrabold transition-[color,border-color,background] duration-150',
                      selected
                        ? 'border-[color:var(--ob-accent,#1E6FA8)] text-[color:var(--ob-accent,#1E6FA8)]'
                        : [
                            'border-transparent text-[color:color-mix(in_srgb,var(--ob-ink,#2A2218)_68%,transparent)]',
                            'hover:bg-[color:color-mix(in_srgb,var(--ob-ink,#2A2218)_6%,transparent)]',
                            'hover:text-[color:var(--ob-ink,#2A2218)]',
                          ].join(' '),
                    ].join(' ')}
                  >
                    {tab.icon}
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              {headerBackAction ? (
                <button
                  type="button"
                  onClick={headerBackAction}
                  className="onboarding-option-secondary inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-extrabold"
                >
                  <span aria-hidden="true" className="text-base leading-none">←</span>
                  <span>{t('wordChat.back')}</span>
                </button>
              ) : null}
              <div className="min-w-0 flex-1">
                <WordChatProgress step={step} compact={keyboardOpen} />
              </div>
            </div>
          )}
        </div>

        {/* Both tabs stay mounted: a half-typed batch and an analyzed photo are
            both work in progress, and swapping tabs is not a reason to throw
            either away. */}
        {/* The photo tab spends the whole window: a labelled picture is the
            content there, and the lab caps and pads itself. Typing and the
            conversation stay on a reading column. */}
        {photoTab ? (
          <div className={photoTabActive ? 'flex min-h-0 w-full flex-1 flex-col' : 'hidden'}>
            {photoTab({ pickWords: pickPhotoWords })}
          </div>
        ) : null}
        <div
          className={[
            'mx-auto w-full max-w-[800px] px-3 sm:px-4',
            photoTabActive
              ? 'hidden'
              : fullHeight
                ? 'flex min-h-0 flex-1 flex-col pb-[max(0.5rem,env(safe-area-inset-bottom))]'
                : 'flex flex-1 flex-col pb-[max(2rem,env(safe-area-inset-bottom))]',
          ].join(' ')}
        >
          <WordChatFlow
            key={`${languageFrom}\u0000${languageTo}`}
            languageFrom={languageFrom}
            languageTo={languageTo}
            baseListId={baseListId}
            refreshAfterCommit={refreshAfterCommit}
            onLanguagePairChange={changeLanguagePair}
            onDone={returnToStudyAfterDone}
            onStepChange={(nextStep) => {
              setStep(nextStep);
              // Also covers a restored conversation that enters chat from
              // inside the flow instead of through the host tab button.
              if (nextStep === 'chat') setEntryTab('ai');
            }}
            onHeaderBackActionChange={handleHeaderBackActionChange}
            settingsPlacement="screen-header"
            headerSlot={headerSlot}
            settingsOpen={settingsOpen}
            onSettingsOpenChange={setSettingsOpen}
            // Typing your own words is the plain way in; the conversation and
            // the photo lab are the other two tabs above.
            entryStep="manual"
            hostEntryTabs
            offScreen={photoTabActive}
            onEntryActionsChange={handleEntryActionsChange}
            keyboardOpen={keyboardOpen}
            active={active && !photoTabActive}
            embedded
            onCommitted={onCommitted}
          />
        </div>
      </section>
    </div>
  );
}
