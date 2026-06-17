'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import * as listActions from '@/features/lists/client/actions';
import type { WordList, WordListItem } from '@/features/lists/types';
import { syncUserData } from '@/lib/sync';
import {
  countTextUnits,
  formatNumber,
  generateCommonListAudio,
  getCommonListAudioFailureNotice,
  getCommonListFailureNotice,
  type GenerationStatus,
} from './commonListAudioGeneration';
import {
  estimateCommonListGenerationSeconds,
  pickAutogenerateCommonSeed,
  type MatchedWordList,
} from './listRecommendations';

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
    setError(null);
    try {
      if (!(await savePreferences())) return;
      onSelectList(list.id);
      if (!list.isOwner) {
        const res = await fetch(`/api/lists/${list.id}/subscribe`, { method: 'POST' });
        if (!res.ok && res.status !== 409) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? 'Subscribe failed');
        }
        window.location.reload();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not select list');
    } finally {
      setWorkingId(null);
    }
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
      title: 'Preparing common list',
      detail: 'Finding the best common seed...',
    });
    setError(null);
    let didComplete = false;
    try {
      const listsRes = await fetch('/api/lists');
      const listsData = await listsRes.json();
      const availableLists: WordList[] = Array.isArray(listsData.lists) ? listsData.lists : [];
      const seedList = pickAutogenerateCommonSeed(availableLists, languageFrom, languageTo);

      if (seedList) {
        const seedDetailsRes = await fetch(`/api/lists/${seedList.id}?include_media=false`);
        const seedDetails = seedDetailsRes.ok ? await seedDetailsRes.json() : null;
        const seedItems: WordListItem[] = Array.isArray(seedDetails?.items)
          ? seedDetails.items
          : [];
        const seedCharacterCount = countTextUnits(
          seedItems.flatMap((item) => [item.textKnown, item.textTarget ?? '']),
        );
        setGenerationStatus({
          title: 'Creating common list',
          detail: `Copying and translating ${formatNumber(seedItems.length)} entries from ${seedList.name}.`,
          estimateSeconds: estimateCommonListGenerationSeconds({
            itemCount: seedItems.length,
            audioCharacterCount: seedCharacterCount,
            audioClipCount: seedItems.length * 2,
          }),
        });
        // The fork route streams NDJSON progress, so consume it through the
        // shared action (raw `.json()` would choke on the multi-line stream).
        const forkResult = await listActions.forkList(
          seedList.id,
          {
            name: `Common ${languageFrom.toUpperCase()} / ${languageTo.toUpperCase()}`,
            languageFrom,
            languageTo,
            translationProvider: 'google',
            sourceLanguage: seedList.languageFrom,
          },
          {
            onProgress: (progress) => {
              setGenerationStatus({
                title: 'Creating common list',
                detail:
                  progress.phase === 'saving'
                    ? 'Saving the common list...'
                    : `Translating (${progress.processed}/${progress.total})...`,
              });
            },
          },
        );
        const newListId = forkResult.list.id;
        onSelectList(newListId);

        // Generate audio while the learner still owns the list. (The audio
        // endpoint does not require ownership, so a partial failure here does
        // not block the promotion step below.)
        const audioSummary = await generateCommonListAudio({
          list: forkResult.list,
          setGenerationStatus,
        });
        if (audioSummary.failedCount > 0) {
          setError(getCommonListAudioFailureNotice(audioSummary));
        }

        // Promote to the shared, recommended, app-owned common list. Best
        // effort: if it fails the list still works as the learner's own.
        setGenerationStatus({
          title: 'Publishing common list',
          detail: 'Marking it as a recommended common list...',
        });
        try {
          await fetch(`/api/lists/${newListId}/promote-common`, { method: 'POST' });
        } catch {
          // Ignore — promotion is not required for the list to be usable.
        }

        setGenerationStatus({
          title: 'Opening app',
          detail: audioSummary.notice
            ? 'The common list is ready. Audio can continue from the editor later.'
            : 'The list and audio are ready.',
        });
        await onComplete(languageFrom, languageTo);
        didComplete = true;
        return;
      }

      // No seed available yet — start from an empty list. (LLM word generation
      // is the next phase.)
      const createRes = await fetch('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Common ${languageFrom.toUpperCase()} / ${languageTo.toUpperCase()}`,
          language_from: languageFrom,
          language_to: languageTo,
          description: 'Autogenerated common list seed',
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData.error ?? 'Could not create list');
      onSelectList(createData.list.id);
      setGenerationStatus({
        title: 'Opening app',
        detail: 'Your empty list is ready.',
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
    forkList,
    goToListsForExisting,
    autogenerateCommonList,
    createOwnList,
  };
}
