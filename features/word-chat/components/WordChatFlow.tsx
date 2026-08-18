'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import type { WordList } from '@/features/lists/types';
import { ChatStep } from './ChatStep';
import { SelectStep } from './SelectStep';
import { ReviewStep } from './ReviewStep';
import { DoneStep } from './DoneStep';
import { WordChatDebugPanel } from './WordChatDebugPanel';
import { WordChatSettingsControls } from './WordChatSettingsControls';
import { useWordChat, type WordChatStep } from '../hooks/useWordChat';

type Props = {
  languageFrom: string;
  languageTo: string;
  baseListId?: string | null;
  refreshAfterCommit?: () => Promise<void>;
  onDone?: () => void;
  /**
   * The escape hatch: subscribe to the ready-made list for this pair. Owned by
   * the caller (onboarding already has the matched-list data loaded) and used
   * as the fallback when the model is unavailable — nobody should be trapped in
   * a conversation during onboarding.
   *
   * Omitted by the in-app "Add words" screen: someone who is already studying
   * has lists, and offering them a starter pack there is noise.
   */
  onUseReadyMade?: () => void;
  /** Changes the known/target pair from settings or an explicit bot action. */
  onLanguagePairChange: (pair: { from: string; to: string }) => void | Promise<void>;
  onCommitted: (result: {
    listId: string;
    categoryId: string | null;
    itemCount: number;
    takeoverCount: number;
    upgradedTakeoverCount: number;
  }) => void;
  /**
   * Lets the host chrome follow the flow — every step after the chat carries its
   * own heading, so the outer screen title would only repeat it.
   */
  onStepChange?: (step: WordChatStep) => void;
  /**
   * Lets the host Back button move one step inside the flow when possible.
   * `null` means the host should use its normal close/exit action.
   */
  onHeaderBackActionChange?: (action: (() => void) | null) => void;
  settingsPlacement?: 'inline' | 'screen-header';
  /**
   * The header element a `screen-header` settings cluster belongs in. Hosts with
   * a header row of their own pass it so the gear and share button sit in that
   * row; without one the cluster floats in the card's top-right corner.
   */
  headerSlot?: HTMLElement | null;
  /**
   * Controlled open state for the settings modal, owned by the host so it can
   * outlive the remount a language-pair change forces (the host keys this whole
   * flow by the pair). Left undefined, the gear keeps its own local state.
   */
  settingsOpen?: boolean;
  onSettingsOpenChange?: (open: boolean) => void;
  /** An on-screen keyboard is covering the lower part of a phone screen. */
  keyboardOpen?: boolean;
  active?: boolean;
  embedded?: boolean;
  /**
   * Which way the learner comes in. `manual` opens on typing your own words and
   * keeps the conversation one button away; `chat` (the onboarding route) opens
   * on the conversation.
   */
  entryStep?: 'chat' | 'manual';
};

export function WordChatFlow({
  languageFrom,
  languageTo,
  baseListId,
  refreshAfterCommit,
  onDone,
  onUseReadyMade,
  onLanguagePairChange,
  onCommitted,
  onStepChange,
  onHeaderBackActionChange,
  settingsPlacement,
  headerSlot,
  settingsOpen,
  onSettingsOpenChange,
  keyboardOpen = false,
  active = true,
  embedded = false,
  entryStep = 'chat',
}: Props) {
  const { t } = useI18n();
  const chat = useWordChat({
    languageFrom,
    languageTo,
    baseListId,
    onLanguagePairChange,
    onCommitted,
    refreshAfterCommit,
    active,
    entryStep,
  });
  const resetChat = chat.reset;

  // The select step opens the settings from its overflow menu rather than a gear
  // of its own, so the flow needs a handle on the modal's open state even when
  // the host does not own one.
  const [localSettingsOpen, setLocalSettingsOpen] = useState(false);
  const settingsIsOpen = settingsOpen ?? localSettingsOpen;
  const setSettingsIsOpen = useCallback(
    (next: boolean) => {
      onSettingsOpenChange?.(next);
      if (settingsOpen === undefined) setLocalSettingsOpen(next);
    },
    [onSettingsOpenChange, settingsOpen],
  );
  const openSettings = useCallback(() => setSettingsIsOpen(true), [setSettingsIsOpen]);

  // This surface stays mounted when the learner switches away, so a locally-held
  // open flag left set would silently reappear on their next visit. Adjusted
  // during render, React's documented pattern for deriving state from a prop.
  const [wasActive, setWasActive] = useState(active);
  if (wasActive !== active) {
    setWasActive(active);
    if (!active && localSettingsOpen) setLocalSettingsOpen(false);
  }

  useEffect(() => {
    onStepChange?.(chat.step);
  }, [chat.step, onStepChange]);

  // Back moves one step inside the flow — but only where there is a step to move
  // to. Entering on manual entry means nothing is behind it until the learner
  // has actually opened the chat, so the host keeps its own close action.
  useEffect(() => {
    const action =
      chat.step === 'select'
        ? chat.canReturnToChat
          ? chat.openChat
          : null
        : chat.step === 'review'
          ? chat.backToSelect
          : null;
    onHeaderBackActionChange?.(action);
    return () => onHeaderBackActionChange?.(null);
  }, [
    chat.backToSelect,
    chat.canReturnToChat,
    chat.openChat,
    chat.step,
    onHeaderBackActionChange,
  ]);

  const completeDoneStep = () => {
    resetChat();
    onDone?.();
  };

  if (chat.unavailable) {
    return (
      <div className="space-y-3">
        <h2 className="text-base font-extrabold">{t('wordChat.unavailableTitle')}</h2>
        <p className="text-sm leading-relaxed onboarding-text-soft">
          {t('wordChat.unavailableBody')}
        </p>
        {chat.error ? (
          <p className="onboarding-notice rounded-md px-3 py-2 text-xs leading-relaxed">
            {chat.error}
          </p>
        ) : null}
        {/* Even here, trying again comes first: the conversation and any
            proposal are still in memory, so a recovered provider picks up
            exactly where the learner was. */}
        {chat.canRetry ? (
          <button
            type="button"
            onClick={() => void chat.retry()}
            disabled={chat.busy !== null}
            className="onboarding-option w-full rounded-xl px-5 py-3 text-center text-sm font-extrabold disabled:opacity-50"
          >
            {t('wordChat.retry')}
          </button>
        ) : null}
        {onUseReadyMade ? (
          <button
            type="button"
            onClick={onUseReadyMade}
            className="onboarding-option onboarding-option-highlight w-full rounded-xl px-5 py-3.5 text-center text-base font-extrabold"
          >
            {t('wordChat.readyMadeAction')}
          </button>
        ) : null}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={chat.reset}
            className="text-xs font-bold underline onboarding-text-soft"
          >
            {t('wordChat.startOver')}
          </button>
        </div>
      </div>
    );
  }

  // The embedded chat is a fixed-height screen (see `ChatStep`), so every box
  // between the surface and the composer has to pass the height down. The other
  // steps are ordinary documents that grow and let the surface scroll them.
  const fillsHeight = embedded && chat.step === 'chat';
  // Nothing to pick from means there is nothing to select: the step is the
  // learner typing their own words, whether they arrived here directly or came
  // back from a conversation that produced nothing.
  const manualMode = chat.step === 'select' && chat.proposals.length === 0;

  // A personal list that already exists can be shared from the header. Built
  // from the study pair and the list's saved name/visibility — enough for the
  // share dialog, which fetches its own link and manages visibility by id.
  const shareList: WordList | null = chat.existingList
    ? {
        id: chat.existingList.id,
        ownerId: null,
        name: chat.listName,
        description: null,
        languageFrom,
        languageTo,
        isPublic: chat.existingList.isPublic,
        isOwner: true,
      }
    : null;

  return (
    <div className={fillsHeight ? 'flex min-h-0 flex-1 flex-col gap-4' : 'space-y-4'}>
      {/* The chat carries its own gear; on the select step the same settings sit
          in the heading's overflow menu (see `SelectStep`), so only the modal is
          rendered here. The list and category names live behind it, alongside
          the settings that decide how these words get translated. */}
      {chat.step === 'select' ? (
        <WordChatSettingsControls
          languageFrom={languageFrom}
          languageTo={languageTo}
          listName={chat.listName}
          categoryName={chat.categoryName}
          onListNameChange={chat.setListName}
          onCategoryNameChange={chat.setCategoryName}
          // Who sees the list lives here and nowhere else — the select step used
          // to ask it inline, which put a question about the list in the middle
          // of adding words to it. Offered while there is no list yet; an
          // existing one changes visibility through the share dialog.
          isPublic={chat.askVisibility ? chat.isPublic : undefined}
          onVisibilityChange={chat.askVisibility ? chat.setIsPublic : undefined}
          // Sharing lives in the heading's overflow menu on this step (see
          // `SelectStep`), so the gear does not carry a second copy of it.
          addressRegister={chat.addressRegister}
          salutationGender={chat.salutationGender}
          languageLevel={chat.languageLevel}
          addressRegisterApplies={chat.addressRegisterApplies}
          salutationGenderApplies={chat.salutationGenderApplies}
          saving={chat.preferencesSaving}
          onChange={chat.savePreferences}
          onLanguagePairChange={chat.changeLanguagePair}
          placement="none"
          active={active}
          open={settingsIsOpen}
          onOpenChange={setSettingsIsOpen}
        />
      ) : null}

      {/* Editors get a live view of model, spend and prompts. Nobody else is
          even told the panel exists — the server withholds the diagnostics. */}
      {chat.isEditor ? (
        <WordChatDebugPanel
          models={chat.modelSettings}
          overrides={chat.modelOverrides}
          onOverridesChange={chat.setModelOverrides}
          entries={chat.debugLog}
          busy={chat.busy}
        />
      ) : null}

      {chat.error ? (
        <div className="flex flex-wrap items-center gap-2" role="alert">
          <p className="onboarding-error text-sm">{chat.error}</p>
          {chat.canRetry ? (
            <button
              type="button"
              onClick={() => void chat.retry()}
              disabled={chat.busy !== null}
              className="onboarding-option rounded-full px-3 py-1.5 text-xs font-bold disabled:opacity-50"
            >
              {t('wordChat.retry')}
            </button>
          ) : null}
        </div>
      ) : null}

      {chat.step === 'chat' ? (
        <ChatStep
          languageFrom={languageFrom}
          languageTo={languageTo}
          messages={chat.messages}
          suggestions={chat.suggestions}
          addressRegister={chat.addressRegister}
          salutationGender={chat.salutationGender}
          languageLevel={chat.languageLevel}
          preferencesComplete={chat.preferencesComplete}
          preferencesLoading={chat.preferencesLoading}
          preferencesSaving={chat.preferencesSaving}
          addressRegisterApplies={chat.addressRegisterApplies}
          salutationGenderApplies={chat.salutationGenderApplies}
          onPreferencesChange={chat.savePreferences}
          onLanguagePairChange={chat.changeLanguagePair}
          listName={chat.listName}
          categoryName={chat.categoryName}
          onListNameChange={chat.setListName}
          onCategoryNameChange={chat.setCategoryName}
          shareList={shareList}
          onShareListUpdated={chat.updateExistingList}
          settingsPlacement={settingsPlacement}
          headerSlot={headerSlot}
          busy={chat.busy === 'chat' || chat.busy === 'propose' ? chat.busy : null}
          history={chat.history}
          onSend={chat.sendMessage}
          onStartManualEntry={chat.startManualEntry}
          settingsOpen={settingsIsOpen}
          onSettingsOpenChange={setSettingsIsOpen}
          keyboardOpen={keyboardOpen}
          active={active}
          embedded={embedded}
        />
      ) : null}

      {chat.step === 'select' ? (
        <SelectStep
          mode={manualMode ? 'manual' : 'suggestions'}
          listName={chat.listName}
          proposals={chat.proposals}
          isSelected={chat.isSelected}
          onToggle={chat.toggleSelected}
          audioDisabledKeys={chat.audioDisabledKeys}
          onToggleAudioDisabled={chat.toggleAudioDisabled}
          languageFrom={languageFrom}
          onOpenLanguagePair={openSettings}
          onUpdateProposal={chat.updateProposal}
          onSelectAll={chat.selectAll}
          onClearSelection={chat.clearSelection}
          customItems={chat.customItems}
          onAddCustom={chat.addCustomItem}
          onRemoveCustom={chat.removeCustomItem}
          limits={chat.limits}
          selectedCount={chat.selectedCount}
          overSoftLimit={chat.overSoftLimit}
          atHardCap={chat.atHardCap}
          monthlyRemaining={chat.monthlyRemaining}
          overMonthlyLimit={chat.overMonthlyLimit}
          atSelectionLimit={chat.atSelectionLimit}
          busy={chat.busy === 'translate'}
          keyboardOpen={keyboardOpen}
          shareList={shareList}
          onShareListUpdated={chat.updateExistingList}
          languageTo={languageTo}
          registerApplies={chat.translationRegisterApplies}
          register={chat.translationRegister}
          onRegisterChange={chat.setTranslationRegister}
          onBack={chat.canReturnToChat ? chat.openChat : undefined}
          onStartChat={manualMode ? chat.openChat : undefined}
          onOpenSettings={openSettings}
          onContinue={chat.continueToReview}
        />
      ) : null}

      {chat.step === 'review' ? (
        <ReviewStep
          items={chat.reviewItems}
          listName={chat.listName}
          categoryName={chat.categoryName}
          warningsByKnown={chat.warningsByKnown}
          translationDiagnostics={chat.translationDiagnostics}
          isPublic={chat.isPublic}
          busy={chat.busy === 'commit'}
          onUpdate={chat.updateReviewItem}
          onRemove={chat.removeReviewItem}
          onEnsureAudio={chat.regenerateAudio}
          onBack={chat.backToSelect}
          onSave={chat.commit}
        />
      ) : null}

      {chat.step === 'done' && chat.commitResult ? (
        <DoneStep
          result={chat.commitResult}
          refreshStatus={chat.refreshStatus}
          onRetryRefresh={chat.retryRefresh}
          onDone={onDone ? completeDoneStep : undefined}
        />
      ) : null}
    </div>
  );
}
