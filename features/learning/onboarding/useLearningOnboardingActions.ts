'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import * as listActions from '@/features/lists/client/actions';
import type { WordList } from '@/features/lists/types';
import { syncUserData } from '@/lib/sync';
import {
  generateCommonListAudio,
  getCommonListAudioFailureNotice,
  getCommonListFailureNotice,
  type GenerationStatus,
} from './commonListAudioGeneration';
import {
  estimateCommonListGenerationSeconds,
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
      detail: 'Generating a recommended common list...',
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
        title: createData.reused_existing ? 'Common list found' : 'Common list created',
        detail: createData.reused_existing
          ? 'Using the existing recommended list for this language pair.'
          : `Generated ${itemCount || 'the'} common entries. Preparing audio...`,
        estimateSeconds: itemCount
          ? estimateCommonListGenerationSeconds({
              itemCount,
              audioCharacterCount: 0,
              audioClipCount: itemCount * 2,
            })
          : undefined,
      });
      const audioSummary = await generateCommonListAudio({
        list: generatedList,
        setGenerationStatus,
      });
      if (audioSummary.failedCount > 0) {
        setError(getCommonListAudioFailureNotice(audioSummary));
      }
      setGenerationStatus({
        title: 'Opening app',
        detail: audioSummary.notice
          ? 'The common list is ready. Audio can continue from the editor later.'
          : 'The list and audio are ready.',
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
