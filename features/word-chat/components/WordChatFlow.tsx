'use client';

import { useEffect } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { ChatStep } from './ChatStep';
import { SelectStep } from './SelectStep';
import { ReviewStep } from './ReviewStep';
import { DoneStep } from './DoneStep';
import { WordChatDebugPanel } from './WordChatDebugPanel';
import { useWordChat, type WordChatStep } from '../hooks/useWordChat';

type Props = {
  languageFrom: string;
  languageTo: string;
  baseListId?: string | null;
  refreshAfterCommit?: () => Promise<void>;
  onDone?: () => void;
  doneActionLabel?: string;
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
  active?: boolean;
  embedded?: boolean;
};

export function WordChatFlow({
  languageFrom,
  languageTo,
  baseListId,
  refreshAfterCommit,
  onDone,
  doneActionLabel,
  onUseReadyMade,
  onLanguagePairChange,
  onCommitted,
  onStepChange,
  onHeaderBackActionChange,
  settingsPlacement,
  active = true,
  embedded = false,
}: Props) {
  const { t } = useI18n();
  const chat = useWordChat({
    languageFrom,
    languageTo,
    baseListId,
    onLanguagePairChange,
    onCommitted,
    refreshAfterCommit,
  });
  const resetChat = chat.reset;

  useEffect(() => {
    onStepChange?.(chat.step);
  }, [chat.step, onStepChange]);

  useEffect(() => {
    const action =
      chat.step === 'select'
        ? chat.backToChat
        : chat.step === 'review'
          ? chat.backToSelect
          : null;
    onHeaderBackActionChange?.(action);
    return () => onHeaderBackActionChange?.(null);
  }, [chat.backToChat, chat.backToSelect, chat.step, onHeaderBackActionChange]);

  useEffect(() => {
    if (chat.step !== 'done' || chat.refreshStatus !== 'success' || !onDone) return;

    resetChat();
    onDone();
  }, [chat.refreshStatus, chat.step, onDone, resetChat]);

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

  return (
    <div className="space-y-4">
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
          settingsPlacement={settingsPlacement}
          busy={chat.busy === 'chat' || chat.busy === 'propose' ? chat.busy : null}
          history={chat.history}
          onSend={chat.sendMessage}
          onStartManualEntry={chat.startManualEntry}
          active={active}
          embedded={embedded}
        />
      ) : null}

      {chat.step === 'select' ? (
        <SelectStep
          mode={chat.proposals.length === 0 ? 'manual' : 'suggestions'}
          languageFrom={languageFrom}
          listName={chat.listName}
          onListNameChange={chat.setListName}
          proposals={chat.proposals}
          isSelected={chat.isSelected}
          onToggle={chat.toggleSelected}
          onUpdateProposal={chat.updateProposal}
          onSelectAll={chat.selectAll}
          onClearSelection={chat.clearSelection}
          customItems={chat.customItems}
          onAddCustom={chat.addCustomItem}
          onRemoveCustom={chat.removeCustomItem}
          categoryName={chat.categoryName}
          onCategoryNameChange={chat.setCategoryName}
          askVisibility={chat.askVisibility}
          isPublic={chat.isPublic}
          onVisibilityChange={chat.setIsPublic}
          limits={chat.limits}
          selectedCount={chat.selectedCount}
          overSoftLimit={chat.overSoftLimit}
          atHardCap={chat.atHardCap}
          monthlyRemaining={chat.monthlyRemaining}
          overMonthlyLimit={chat.overMonthlyLimit}
          atSelectionLimit={chat.atSelectionLimit}
          busy={chat.busy === 'translate'}
          onBack={chat.backToChat}
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
          doneLabel={doneActionLabel}
        />
      ) : null}
    </div>
  );
}
