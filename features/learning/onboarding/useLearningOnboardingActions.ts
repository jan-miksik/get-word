'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/I18nProvider';
import * as listActions from '@/features/lists/client/actions';
import { logGenerationStats } from '@/features/lists/client/generationStatsLog';
import type { WordList } from '@/features/lists/types';
import { syncUserData } from '@/lib/sync';
import {
  generateCommonListAudio,
  formatNumber,
  getCommonListAudioFailureNotice,
  getCommonListFailureNotice,
  type GenerationStatus,
} from './commonListAudioGeneration';
import {
  buildReversedListName,
  estimateCommonListGenerationSeconds,
  isReverseDirectionList,
  type MatchedWordList,
} from './listRecommendations';

// Rough size of a typical recommended common list, used only for the provisional
// progress estimate shown before the real item count is known.
const PROVISIONAL_COMMON_LIST_ITEM_COUNT = 200;

type UseLearningOnboardingActionsOptions = {
  languageFrom: string;
  languageTo: string;
  canContinue: boolean;
  onComplete: (languageFrom: string, languageTo: string) => void | Promise<void>;
  onSelectList: (listId: string) => void;
};

export function useLearningOnboardingActions({
  languageFrom,
  languageTo,
  canContinue,
  onComplete,
  onSelectList,
}: UseLearningOnboardingActionsOptions) {
  const router = useRouter();
  const { t } = useI18n();
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function savePreferences() {
    if (!canContinue) return false;
    await onComplete(languageFrom, languageTo);
    return true;
  }

  async function savePreferencesForListNavigation() {
    if (!canContinue) return false;
    await syncUserData({
      language_from: languageFrom,
      language_to: languageTo,
      onboarding_completed: true,
    });
    return true;
  }

  async function subscribeToList(list: MatchedWordList) {
    setWorkingId(list.id);
    // Show the loader overlay while the list is prepared so the streamlined
    // Continue flow never flashes an empty app and then reloads. No estimate is
    // shown: subscribing is a single attach request that finishes in seconds —
    // it does no translation or audio generation, so the item-count-based
    // estimate (which assumes that work) would wildly overstate the wait.
    setGenerationStatus({
      title: 'Opening word list',
      detail: `Preparing ${list.name}...`,
    });
    setError(null);
    try {
      if (!list.isOwner) {
        const res = await fetch(`/api/lists/${list.id}/subscribe`, { method: 'POST' });
        if (!res.ok && res.status !== 409) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? 'Subscribe failed');
        }
      }
      onSelectList(list.id);
      if (!(await savePreferences())) return;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not select list');
    } finally {
      setWorkingId(null);
      setGenerationStatus(null);
    }
  }

  // A reverse-direction match can't be plain-subscribed (that studies it in the
  // wrong direction with mismatched audio). Instead fork it into a separate
  // reversed list: the fork route maps each side by language, so it swaps text
  // AND audio with no translation or TTS work, then lands in the learning app.
  async function useReversedList(list: MatchedWordList) {
    setWorkingId(`reverse:${list.id}`);
    setGenerationStatus({
      title: 'Creating reversed list',
      detail: `Building ${list.name} in your study direction...`,
    });
    setError(null);
    try {
      if (!(await savePreferencesForListNavigation())) return;
      const result = await listActions.forkList(list.id, {
        // Name the reversed list in its own direction (e.g. "Arabic - English"),
        // not the source name with a "(ar / en)" suffix.
        name: buildReversedListName(languageFrom, languageTo),
        languageFrom,
        languageTo,
        // Both languages already exist in the source list, so no translation is
        // needed — the route copies the existing sides (and their audio) swapped.
        translationProvider: 'none',
        sourceLanguage: list.languageFrom,
      });
      onSelectList(result.list.id);
      logGenerationStats({
        flow: 'fork',
        listName: result.list.name,
        listId: result.list.id,
        strategy: 'reverse_fork',
        seedListId: list.id,
        translations: {
          reused: result.stats?.translations.reused ?? result.copied,
          generated: result.stats?.translations.generated ?? 0,
        },
        audio: {
          reused: result.stats?.audio.reused ?? 0,
          generated: 0,
          failed: 0,
        },
      });
      if (!(await savePreferences())) return;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create reversed list');
    } finally {
      setWorkingId(null);
      setGenerationStatus(null);
    }
  }

  // Pick the right action for a matched list: a reverse-direction list must be
  // reverse-forked; an exact-direction list can be subscribed directly.
  async function selectMatchedList(list: MatchedWordList) {
    if (isReverseDirectionList(list, languageFrom, languageTo)) {
      await useReversedList(list);
      return;
    }
    await subscribeToList(list);
  }

  async function forkList(list: MatchedWordList) {
    setWorkingId(`fork:${list.id}`);
    setGenerationStatus({
      title: 'Forking word list',
      detail: `Copying ${list.name} and preparing the editor...`,
      estimateSeconds: list.itemCount
        ? estimateCommonListGenerationSeconds({
            itemCount: list.itemCount,
            audioCharacterCount: 0,
            audioClipCount: 0,
          })
        : undefined,
    });
    setError(null);
    let didNavigate = false;
    try {
      if (!(await savePreferencesForListNavigation())) return;
      const result = await listActions.forkList(
        list.id,
        {
          languageFrom,
          languageTo,
          translationProvider: 'google',
          sourceLanguage: list.languageFrom,
        },
        {
          onProgress: (progress) => {
            setGenerationStatus({
              title: 'Forking word list',
              detail:
                progress.phase === 'saving'
                  ? `Saving ${list.name}...`
                  : `Translating ${list.name} (${progress.processed}/${progress.total})...`,
            });
          },
        },
      );
      const params = new URLSearchParams({
        selected: result.list.id,
        forked: '1',
        forkedFromName: list.name,
      });
      setGenerationStatus({
        title: 'Opening word list editor',
        detail: 'Your fork is ready.',
      });
      didNavigate = true;
      router.push(`/lists?${params.toString()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fork failed');
    } finally {
      if (!didNavigate) {
        setWorkingId(null);
        setGenerationStatus(null);
      }
    }
  }

  async function goToListsForExisting() {
    setError(null);
    setGenerationStatus({
      title: 'Opening word lists',
      detail: 'Saving your languages before showing available lists...',
    });
    let didNavigate = false;
    try {
      if (!(await savePreferencesForListNavigation())) return;
      didNavigate = true;
      router.push(
        `/lists?sourcePair=any&targetFrom=${encodeURIComponent(languageFrom)}&targetTo=${encodeURIComponent(languageTo)}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save learning languages');
    } finally {
      if (!didNavigate) setGenerationStatus(null);
    }
  }

  async function autogenerateCommonList() {
    setWorkingId('common');
    setGenerationStatus({
      title: t('onboarding.statusPreparingCommonList'),
      detail: t('onboarding.commonListSetupDetail'),
      note: t('onboarding.commonListSetupNote'),
      // The list-generation request can run for a while before we know the real
      // item count, so show a provisional whole-flow estimate up front to avoid a
      // long gap with no estimate. It is refined once the list is created.
      estimateSeconds: estimateCommonListGenerationSeconds({
        itemCount: PROVISIONAL_COMMON_LIST_ITEM_COUNT,
        audioCharacterCount: 0,
        audioClipCount: PROVISIONAL_COMMON_LIST_ITEM_COUNT * 2,
      }),
      progress: { label: t('onboarding.commonListPreparingList') },
    });
    setError(null);
    let didComplete = false;
    try {
      if (!(await savePreferencesForListNavigation())) return;
      const createRes = await fetch('/api/lists/autogenerate-common', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language_from: languageFrom,
          language_to: languageTo,
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData.error ?? 'Could not create list');
      const generatedList: WordList = createData.list;
      const itemCount = Number(createData.item_count ?? 0);
      onSelectList(createData.list.id);
      setGenerationStatus({
        title: createData.reused_existing
          ? t('onboarding.statusCommonListFound')
          : t('onboarding.statusCommonListCreated'),
        detail: createData.reused_existing
          ? t('onboarding.commonListFoundDetail')
          : itemCount
            ? t('onboarding.commonListCreatedDetail', { count: formatNumber(itemCount) })
            : t('onboarding.commonListCreatedUnknownDetail'),
        note: t('onboarding.commonListAudioNote'),
        estimateSeconds: itemCount
          ? estimateCommonListGenerationSeconds({
              itemCount,
              audioCharacterCount: 0,
              audioClipCount: itemCount * 2,
            })
          : undefined,
        progress: { label: t('onboarding.commonListCheckingAudio') },
      });
      const audioSummary = await generateCommonListAudio({
        list: generatedList,
        setGenerationStatus,
        t,
      });
      const translationStats = createData.translation_stats ?? { reused: 0, generated: 0 };
      logGenerationStats({
        flow: 'autogenerate',
        listName: generatedList.name,
        listId: generatedList.id,
        strategy: [createData.provider, createData.seed_kind].filter(Boolean).join(' / '),
        seedListId: createData.seed_list_id ?? null,
        translations: {
          reused: Number(translationStats.reused ?? 0),
          generated: Number(translationStats.generated ?? 0),
        },
        audio: {
          reused: audioSummary.reusedCount,
          generated: audioSummary.generatedCount,
          failed: audioSummary.failedCount,
        },
      });
      if (audioSummary.failedCount > 0) {
        setError(getCommonListAudioFailureNotice(audioSummary));
      }
      setGenerationStatus({
        title: t('onboarding.statusOpeningApp'),
        detail: audioSummary.notice
          ? t('onboarding.commonListReadyEditorDetail')
          : t('onboarding.commonListReadyDetail'),
      });
      await onComplete(languageFrom, languageTo);
      didComplete = true;
    } catch (err) {
      // Stay on the onboarding screen and surface the problem inline rather
      // than redirecting to the list editor.
      setError(
        getCommonListFailureNotice(
          err instanceof Error ? err.message : 'Could not autogenerate list',
        ),
      );
    } finally {
      if (!didComplete) {
        setWorkingId(null);
        setGenerationStatus(null);
      }
    }
  }

  async function createOwnList() {
    setError(null);
    setGenerationStatus({
      title: 'Opening word list editor',
      detail: 'Saving your languages before creating the list...',
    });
    let didNavigate = false;
    try {
      if (!(await savePreferencesForListNavigation())) return;
      didNavigate = true;
      router.push(
        `/lists?create=1&languageFrom=${encodeURIComponent(languageFrom)}&languageTo=${encodeURIComponent(languageTo)}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save learning languages');
    } finally {
      if (!didNavigate) setGenerationStatus(null);
    }
  }

  return {
    workingId,
    generationStatus,
    error,
    subscribeToList,
    selectMatchedList,
    useReversedList,
    forkList,
    goToListsForExisting,
    autogenerateCommonList,
    createOwnList,
  };
}
