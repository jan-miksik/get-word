'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  WORD_CHAT_LANGUAGE_LEVELS,
  fetchWordChatContext,
  saveWordChatPreferences,
  type WordChatLanguageLevel,
} from '@/features/word-chat/public.client';

function readLevel(value: unknown): WordChatLanguageLevel | null {
  return WORD_CHAT_LANGUAGE_LEVELS.includes(value as WordChatLanguageLevel)
    ? (value as WordChatLanguageLevel)
    : null;
}

/**
 * The learner's level in the language they are learning, for the onboarding
 * step that asks for it.
 *
 * Only fetched while onboarding is actually unfinished — the caller passes
 * `enabled` — so an ordinary app open costs nothing. A failed read or write is
 * never allowed to trap someone on this screen: the step counts as answered
 * locally either way, and the word chat asks again if the value never landed.
 */
export function useLanguageLevelStep({
  enabled,
  languageFrom,
  languageTo,
}: {
  enabled: boolean;
  languageFrom: string | null;
  languageTo: string | null;
}) {
  const pairKey = `${languageFrom ?? ''}->${languageTo ?? ''}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [level, setLevel] = useState<WordChatLanguageLevel | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!enabled || !languageFrom || !languageTo || loadedKey === pairKey) return;
    let cancelled = false;
    void fetchWordChatContext({ languageFrom, languageTo })
      .then((context) => {
        if (cancelled) return;
        setLevel(readLevel((context as { language_level?: unknown }).language_level));
        setLoadedKey(pairKey);
      })
      .catch(() => {
        if (cancelled) return;
        // Unreachable server: ask the question rather than stalling on it.
        setLevel(null);
        setLoadedKey(pairKey);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, languageFrom, languageTo, loadedKey, pairKey]);

  const save = useCallback(async (next: WordChatLanguageLevel) => {
    setSaving(true);
    try {
      if (languageFrom && languageTo) {
        await saveWordChatPreferences({ languageLevel: next, languageFrom, languageTo });
      }
    } catch (error) {
      console.error('[onboarding] could not save the language level:', error);
    } finally {
      setLevel(next);
      setLoadedKey(pairKey);
      setSaving(false);
    }
  }, [languageFrom, languageTo, pairKey]);

  return {
    loaded: loadedKey === pairKey,
    level,
    saving,
    save,
  };
}
