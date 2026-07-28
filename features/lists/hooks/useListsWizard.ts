'use client';

// Owns wizard-only state and handlers for the lists page composition shell.
//
// The page coordinates lists/categories/items/error/sidebar/google-usage
// concerns; this hook isolates the inner wizard flow: which step the user is
// on, what they are editing, the diff/translation/audio in-flight payloads,
// and step transitions. The page exposes the data the wizard needs (selected
// list id, current items, helpers to reload list details and audio step
// items, google-usage refresher) and calls a few imperative entries when
// outside events should drive the wizard (list change, server-cleared sides
// after `handleUpdateList`, initial URL-triggered audio fix).

import { useCallback, useState } from 'react';
import * as listActions from '@/features/lists/client/actions';
import { useBuildAudioStepItems } from '@/features/lists/hooks/useListWizardItems';
import { orderItemsByCategoryDisplay } from '@/features/lists/orderItems';
import type {
  CompletedTranslationRow,
  DiffResult,
  WizardActiveStep,
  WordCategory,
  WordListItem,
} from '@/features/lists/types';

type WizardStep = 'browse' | WizardActiveStep;
type TranslateHeadingMode = 'translate' | 'review';
type PendingListItems = NonNullable<
  Awaited<ReturnType<typeof listActions.confirmCategoryItems>>['pending_items']
>;

const WIZARD_ORDER: WizardActiveStep[] = [
  'edit',
  'preview',
  'translate',
  'audio-target',
  'audio-known',
];

function itemsToPending(items: WordListItem[]): PendingListItems {
  return items.map((item) => ({
    id: item.id,
    text_known: item.textKnown,
    text_target: item.textTarget ?? null,
    accepted_known: item.acceptedKnown ?? [],
    accepted_target: item.acceptedTarget ?? [],
    position: item.position,
    // Surface the existing study-note text so the review editor shows it.
    comment: item.comment?.text ?? null,
    // Lets the review step flag/fix words that have no category.
    category_id: item.categoryId ?? null,
  }));
}

export type UseListsWizardDeps = {
  selectedListId: string | null;
  items: WordListItem[];
  categories: WordCategory[];
  itemsByCategory: Map<string, WordListItem[]>;
  reloadListDetails: (options?: { includeMedia?: boolean }) => Promise<WordListItem[]>;
  loadGoogleUsage: () => Promise<void> | void;
};

export function useListsWizard({
  selectedListId,
  items,
  categories,
  itemsByCategory,
  reloadListDetails,
  loadGoogleUsage,
}: UseListsWizardDeps) {
  const [wizardStep, setWizardStep] = useState<WizardStep>('browse');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingAllWords, setEditingAllWords] = useState(false);
  const [editInputLanguage, setEditInputLanguage] = useState<'known' | 'target'>('known');
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [pendingItems, setPendingItems] = useState<PendingListItems>([]);
  // Ids of words freshly added in this edit pass. The translate step shows them
  // first, ahead of the category's existing words, with a spacer between the two
  // groups so the user can see the new words in the context of the whole
  // category.
  const [newPendingItemIds, setNewPendingItemIds] = useState<Set<string>>(new Set());
  const [audioStepItems, setAudioStepItems] = useState<WordListItem[] | null>(null);
  const [translateHeadingMode, setTranslateHeadingMode] = useState<TranslateHeadingMode>('translate');
  const [triggerEditSignal, setTriggerEditSignal] = useState(0);
  const [isEditDirty, setIsEditDirty] = useState(false);
  // Items the user marked for removal in an audio step. Kept here (not in the
  // items/audioStepItems that drive the AudioStep reset key) so marking one
  // does not remount the step and wipe in-progress audio generation. The
  // actual delete is bundled and committed when the audio step completes.
  const [removedItemIds, setRemovedItemIds] = useState<Set<string>>(new Set());

  const buildAudioStepItems = useBuildAudioStepItems({
    categories,
    editingCategoryId,
    pendingItems,
    selectedListId,
  });

  // External triggers — used by the page when something outside the wizard
  // (URL state, server-driven side cleanup, list change) should update the
  // wizard's view.
  const resetForListChange = useCallback(() => {
    setEditingCategoryId(null);
    setEditingAllWords(false);
  }, []);

  const showBrowse = useCallback(() => setWizardStep('browse'), []);

  const openAudioStepFromFix = useCallback(
    (freshItems: WordListItem[], step: WizardActiveStep) => {
      setAudioStepItems(freshItems);
      setWizardStep(step);
    },
    [],
  );

  const startAllWordsReviewAfterSideClear = useCallback(
    (clearedSides: Array<'known' | 'target'>, freshItems: WordListItem[]) => {
      setEditingCategoryId(null);
      setEditingAllWords(true);
      setAudioStepItems(null);
      setDiffResult(null);
      setEditInputLanguage(clearedSides.includes('target') ? 'known' : 'target');
      setTranslateHeadingMode('translate');
      setPendingItems(itemsToPending(orderItemsByCategoryDisplay(freshItems, categories)));
      setNewPendingItemIds(new Set());
      setWizardStep('translate');
    },
    [categories],
  );

  const triggerEdit = useCallback(() => {
    setTriggerEditSignal((value) => value + 1);
  }, []);

  const markItemRemoved = useCallback((itemId: string) => {
    setRemovedItemIds((prev) => {
      if (prev.has(itemId)) return prev;
      const next = new Set(prev);
      next.add(itemId);
      return next;
    });
  }, []);

  // Commit any pending removals before the surrounding step reloads list
  // details. Deleting first means the reload naturally excludes them.
  const finalizeRemovals = useCallback(async () => {
    if (!selectedListId || removedItemIds.size === 0) return;
    await listActions.removeListItems(selectedListId, [...removedItemIds]);
    setRemovedItemIds(new Set());
  }, [removedItemIds, selectedListId]);

  // Wizard handlers — referenced by the page render and child components.
  const handleEditCategory = useCallback(
    (categoryId: string, inputLang: 'known' | 'target') => {
      setEditingCategoryId(categoryId);
      setEditingAllWords(false);
      setEditInputLanguage(inputLang);
      setAudioStepItems(null);
      setIsEditDirty(false);
      setWizardStep('edit');
    },
    [],
  );

  const handleEditAllWords = useCallback(() => {
    setEditingCategoryId(null);
    setEditingAllWords(true);
    setEditInputLanguage('known');
    setAudioStepItems(null);
    setDiffResult({
      added: [],
      removed: [],
      reordered: [],
      unchanged: items.length,
    });
    setTranslateHeadingMode('review');
    setPendingItems(itemsToPending(orderItemsByCategoryDisplay(items, categories)));
    setNewPendingItemIds(new Set());
    setIsEditDirty(false);
    setWizardStep('translate');
  }, [categories, items]);

  const handlePreview = useCallback(
    async (lines: string[]) => {
      if (!selectedListId || !editingCategoryId) return;
      const diff = await listActions.previewCategoryItems(
        selectedListId,
        editingCategoryId,
        lines,
        editInputLanguage,
      );
      setDiffResult(diff);
      setWizardStep('preview');
    },
    [selectedListId, editingCategoryId, editInputLanguage],
  );

  const handleConfirm = useCallback(async () => {
    if (!selectedListId || !editingCategoryId || !diffResult) return;
    setAudioStepItems(null);
    const result = await listActions.confirmCategoryItems(
      selectedListId,
      editingCategoryId,
      diffResult,
      editInputLanguage,
    );

    // Reload first so freshItems includes any just-confirmed new words.
    const freshItems = await reloadListDetails();
    const categoryItems = freshItems.filter((i) => i.categoryId === editingCategoryId);

    if (result.needs_translation && result.pending_items) {
      // Show the whole category, with the newly added (untranslated) words first
      // and the existing words after a spacer for context.
      const newIds = new Set(result.pending_items.map((item) => item.id));
      const newItems = categoryItems.filter((i) => newIds.has(i.id));
      const existingItems = categoryItems.filter((i) => !newIds.has(i.id));
      setNewPendingItemIds(newIds);
      setTranslateHeadingMode('translate');
      setPendingItems(itemsToPending([...newItems, ...existingItems]));
      setWizardStep('translate');
      return;
    }

    setNewPendingItemIds(new Set());
    if (categoryItems.length > 0) {
      setTranslateHeadingMode('review');
      setPendingItems(itemsToPending(categoryItems));
      setWizardStep('translate');
    } else {
      setWizardStep('browse');
    }
  }, [diffResult, editInputLanguage, editingCategoryId, reloadListDetails, selectedListId]);

  const handleTranslationComplete = useCallback(
    async (translationRows: CompletedTranslationRow[]) => {
      await finalizeRemovals();
      const [freshItems] = await Promise.all([
        reloadListDetails({ includeMedia: true }),
        loadGoogleUsage(),
      ]);
      // Carry category_id forward (from the reloaded canonical items, falling
      // back to the prior pending item) so going Back to the review step does
      // not flag every word as having no category.
      const categoryById = new Map(freshItems.map((item) => [item.id, item.categoryId ?? null]));
      setPendingItems(
        translationRows.map((row, index) => {
          const prior = pendingItems.find((item) => item.id === row.id);
          return {
            id: row.id,
            text_known: row.textKnown,
            text_target: row.textTarget || null,
            accepted_known: row.acceptedKnown ?? [],
            accepted_target: row.acceptedTarget ?? [],
            position: prior?.position ?? index,
            // Carry the editor's current note forward so Back doesn't blank it.
            comment: row.comment ?? null,
            category_id: categoryById.has(row.id)
              ? categoryById.get(row.id) ?? null
              : prior?.category_id ?? null,
          };
        }),
      );
      setAudioStepItems(buildAudioStepItems(freshItems, translationRows));
      setWizardStep('audio-target');
    },
    [buildAudioStepItems, finalizeRemovals, loadGoogleUsage, pendingItems, reloadListDetails],
  );

  const handleTargetAudioComplete = useCallback(async () => {
    await finalizeRemovals();
    const [freshItems] = await Promise.all([
      reloadListDetails({ includeMedia: true }),
      loadGoogleUsage(),
    ]);
    setAudioStepItems(buildAudioStepItems(freshItems));
    setWizardStep('audio-known');
  }, [buildAudioStepItems, finalizeRemovals, loadGoogleUsage, reloadListDetails]);

  const handleKnownAudioComplete = useCallback(async () => {
    const shouldOpenStudy = (diffResult?.added.length ?? 0) > 0;
    await finalizeRemovals();
    await Promise.all([reloadListDetails(), loadGoogleUsage()]);
    setWizardStep('browse');
    setEditingCategoryId(null);
    setEditingAllWords(false);
    setPendingItems([]);
    setAudioStepItems(null);
    setDiffResult(null);
    return shouldOpenStudy;
  }, [diffResult, finalizeRemovals, loadGoogleUsage, reloadListDetails]);

  const handleSkipTranslation = useCallback(async () => {
    await finalizeRemovals();
    if (editingAllWords) {
      const [freshItems] = await Promise.all([
        reloadListDetails({ includeMedia: true }),
        loadGoogleUsage(),
      ]);
      setAudioStepItems(buildAudioStepItems(freshItems));
      setWizardStep('audio-target');
      return;
    }

    await Promise.all([reloadListDetails(), loadGoogleUsage()]);
    setWizardStep('browse');
    setEditingCategoryId(null);
    setEditingAllWords(false);
    setAudioStepItems(null);
  }, [buildAudioStepItems, editingAllWords, finalizeRemovals, loadGoogleUsage, reloadListDetails]);

  const handleCancelWizard = useCallback(() => {
    setWizardStep('browse');
    setEditingCategoryId(null);
    setEditingAllWords(false);
    setDiffResult(null);
    setPendingItems([]);
    setNewPendingItemIds(new Set());
    setAudioStepItems(null);
    setTranslateHeadingMode('translate');
    setIsEditDirty(false);
    // Abandon any uncommitted removals — they were never deleted server-side.
    setRemovedItemIds(new Set());
  }, []);

  const handleGoBack = useCallback(() => {
    if (editingAllWords && wizardStep === 'translate') {
      handleCancelWizard();
    } else if (wizardStep === 'preview') {
      setWizardStep('edit');
    } else if (wizardStep === 'translate') {
      setWizardStep('preview');
    } else if (wizardStep === 'audio-target') {
      setWizardStep('translate');
    } else if (wizardStep === 'audio-known') {
      setWizardStep('audio-target');
    } else {
      handleCancelWizard();
    }
  }, [editingAllWords, handleCancelWizard, wizardStep]);

  const handleGoToStep = useCallback(
    async (step: WizardActiveStep) => {
      if (editingAllWords && (step === 'edit' || step === 'preview')) return;
      const currentIdx = WIZARD_ORDER.indexOf(wizardStep as WizardActiveStep);
      const targetIdx = WIZARD_ORDER.indexOf(step);

      // Always allow going back.
      if (targetIdx <= currentIdx) {
        setWizardStep(step);
        return;
      }

      // Blocked if currently editing with unsaved changes.
      if (isEditDirty) return;

      // From edit step: set up diff/pending so later steps have data.
      if (wizardStep === 'edit' && editingCategoryId) {
        const categoryItems = itemsByCategory.get(editingCategoryId) ?? [];
        setDiffResult({
          added: [],
          removed: [],
          reordered: [],
          unchanged: categoryItems.length,
        });
        setTranslateHeadingMode('review');
        setPendingItems(itemsToPending(categoryItems));
        setNewPendingItemIds(new Set());
      }

      if (step === 'audio-target' || step === 'audio-known') {
        const freshItems = await reloadListDetails({ includeMedia: true });
        setAudioStepItems(buildAudioStepItems(freshItems));
      }

      setWizardStep(step);
    },
    [
      buildAudioStepItems,
      editingAllWords,
      editingCategoryId,
      isEditDirty,
      itemsByCategory,
      reloadListDetails,
      wizardStep,
    ],
  );

  return {
    // State
    wizardStep,
    editingCategoryId,
    editingAllWords,
    editInputLanguage,
    diffResult,
    pendingItems,
    newPendingItemIds,
    audioStepItems,
    translateHeadingMode,
    triggerEditSignal,
    isEditDirty,
    // Setters used by child components / external code.
    setEditInputLanguage,
    setIsEditDirty,
    markItemRemoved,
    // External triggers — only call from outside-the-wizard effects.
    resetForListChange,
    showBrowse,
    openAudioStepFromFix,
    startAllWordsReviewAfterSideClear,
    triggerEdit,
    // Handlers wired to child components.
    handleEditCategory,
    handleEditAllWords,
    handlePreview,
    handleConfirm,
    handleTranslationComplete,
    handleTargetAudioComplete,
    handleKnownAudioComplete,
    handleSkipTranslation,
    handleCancelWizard,
    handleGoBack,
    handleGoToStep,
  } as const;
}
