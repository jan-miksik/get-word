'use client';

import { useCallback, useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { SettingsIcon, ShareIcon } from '@/components/icons/AppIcons';
import { ShareVisibilityDialog } from '@/features/lists/components/ShareVisibilityDialog';
import type { WordList } from '@/features/lists/types';
import type { WordChatPreferencePatch } from '../hooks/useWordChat';
import type {
  WordChatAddressRegister,
  WordChatLanguageLevel,
  WordChatSalutationGender,
} from '../types';
import { ChatSettingsModal } from './ChatSettingsModal';

type Props = {
  languageFrom: string;
  languageTo: string;
  /** List/category naming, shared by the AI-chat and manual-entry surfaces. */
  listName?: string;
  categoryName?: string;
  onListNameChange?: (value: string) => void;
  onCategoryNameChange?: (value: string) => void;
  /** List visibility, editable in the modal. Omitted before a list is named. */
  isPublic?: boolean | null;
  onVisibilityChange?: (value: boolean) => void;
  /**
   * The already-saved personal list, when one exists. Its presence adds a share
   * button beside the gear that opens the same share-and-visibility dialog the
   * list rows use. Absent before the learner's first commit — there is nothing
   * to share yet.
  */
  shareList?: WordList | null;
  /** Synchronizes the cached list metadata after the share dialog saves it. */
  onShareListUpdated?: (list: WordList) => void;
  addressRegister: WordChatAddressRegister | null;
  salutationGender: WordChatSalutationGender | null;
  languageLevel: WordChatLanguageLevel | null;
  addressRegisterApplies: boolean;
  salutationGenderApplies: boolean;
  saving: boolean;
  onChange: (patch: WordChatPreferencePatch) => void | Promise<void>;
  onLanguagePairChange: (pair: { from: string; to: string }) => void | Promise<void>;
  /**
   * `none` renders the modal without any trigger of its own — for surfaces that
   * open it from somewhere else, such as the select step's overflow menu.
   */
  placement?: 'inline' | 'screen-header' | 'none';
  /** Whether the surface holding this button is the one on screen. */
  active?: boolean;
  /**
   * Optional controlled open state. The caller owns it when the modal has to
   * survive a remount — changing the study pair remounts the whole flow, and a
   * learner mid-way through swapping both languages should not have the modal
   * vanish out from under them. Left uncontrolled (local state) otherwise.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/**
 * The gear that opens the language pair and study-profile settings.
 *
 * Shared rather than owned by the chat: the same settings decide how manually
 * entered words are translated, so the manual step needs the same button in the
 * same place — moving it between the two entry points would read as two
 * different settings.
 */
export function WordChatSettingsControls({
  languageFrom,
  languageTo,
  listName,
  categoryName,
  onListNameChange,
  onCategoryNameChange,
  isPublic,
  onVisibilityChange,
  shareList,
  onShareListUpdated,
  addressRegister,
  salutationGender,
  languageLevel,
  addressRegisterApplies,
  salutationGenderApplies,
  saving,
  onChange,
  onLanguagePairChange,
  placement = 'inline',
  active = true,
  open: controlledOpen,
  onOpenChange,
}: Props) {
  const { t } = useI18n();
  const [shareOpen, setShareOpen] = useState(false);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      onOpenChange?.(next);
      if (controlledOpen === undefined) setUncontrolledOpen(next);
    },
    [controlledOpen, onOpenChange],
  );
  const close = useCallback(() => setOpen(false), [setOpen]);

  // The surface stays mounted when the learner switches away, so a locally-owned
  // open state left set would silently reappear on their next visit. Adjusted
  // during render (React's documented pattern for deriving state from a prop
  // change). Only the uncontrolled path is reset here — writing the caller's
  // state during render is not allowed, and while inactive the modal is hidden
  // by `active && open` regardless of who owns the flag.
  const [wasActive, setWasActive] = useState(active);
  if (wasActive !== active) {
    setWasActive(active);
    if (!active && controlledOpen === undefined && uncontrolledOpen) {
      setUncontrolledOpen(false);
    }
  }

  const button = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="onboarding-option-secondary flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
      aria-label={t('wordChat.settings')}
      title={t('wordChat.settings')}
      aria-haspopup="dialog"
    >
      <SettingsIcon size={18} />
    </button>
  );

  // The saved list can be shared straight from here — the same dialog the list
  // rows open, so a learner never has to leave Add words to hand it out.
  const shareButton = shareList ? (
    <button
      type="button"
      onClick={() => setShareOpen(true)}
      className="onboarding-option-secondary flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
      aria-label={t('share.manageTitle')}
      title={t('share.manageTitle')}
      aria-haspopup="dialog"
    >
      <ShareIcon size={18} />
    </button>
  ) : null;

  const shareModal =
    shareList && active && shareOpen ? (
      <ShareVisibilityDialog
        list={shareList}
        canManage
        appearance="warm"
        onClose={() => setShareOpen(false)}
        onListUpdated={onShareListUpdated}
      />
    ) : null;

  const modal = (
    <ChatSettingsModal
      isOpen={active && open}
      languageFrom={languageFrom}
      languageTo={languageTo}
      listName={listName}
      categoryName={categoryName}
      onListNameChange={onListNameChange}
      onCategoryNameChange={onCategoryNameChange}
      isPublic={isPublic}
      onVisibilityChange={onVisibilityChange}
      addressRegister={addressRegister}
      salutationGender={salutationGender}
      languageLevel={languageLevel}
      addressRegisterApplies={addressRegisterApplies}
      salutationGenderApplies={salutationGenderApplies}
      saving={saving}
      onChange={onChange}
      onLanguagePairChange={onLanguagePairChange}
      onClose={close}
    />
  );

  if (placement === 'none') {
    return (
      <>
        {modal}
        {shareModal}
      </>
    );
  }

  return placement === 'screen-header' ? (
    <div className="absolute right-3 top-3 z-20 flex items-center gap-2 sm:right-7 sm:top-7">
      {shareButton}
      {button}
      {modal}
      {shareModal}
    </div>
  ) : (
    <div className="relative flex items-center justify-end gap-2">
      {shareButton}
      {button}
      {modal}
      {shareModal}
    </div>
  );
}
