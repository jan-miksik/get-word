import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  readStoredVoiceSelection,
  writeStoredVoiceSelection,
} from '@/features/lists/client/storage';
import { getBaseLanguage, type TtsLanguageOption } from './language';
import {
  DEFAULT_VOICE_SELECTION,
  getChirp3HdVoiceOptions,
  getDefaultVoiceSelectionForVoices,
  resolveVoiceForText,
  serializeVoiceSelection,
  type VoiceSelection,
} from './voiceMix';

type LanguageScopedSelection = {
  languageCode: string;
  selection: VoiceSelection;
};

function readSelection(languageCode: string): VoiceSelection {
  return readStoredVoiceSelection(languageCode) ?? DEFAULT_VOICE_SELECTION;
}

function reconcileStoredSelection(
  stored: VoiceSelection | null,
  voiceOptions: string[],
): VoiceSelection {
  const defaultSelection = getDefaultVoiceSelectionForVoices(voiceOptions);
  if (!stored) return defaultSelection;

  if (stored.mode === 'single') {
    if (stored.voiceId === 'default' || voiceOptions.includes(stored.voiceId)) return stored;
    return defaultSelection;
  }

  const availableVoiceIds = stored.voiceIds.filter((voiceId) => voiceOptions.includes(voiceId));
  if (availableVoiceIds.length === stored.voiceIds.length) return stored;
  if (availableVoiceIds.length > 0) return { mode: 'mix', voiceIds: availableVoiceIds };
  return defaultSelection;
}

export function useGoogleTtsVoiceSelection(activeLanguageCode: string) {
  const [voiceOptions, setVoiceOptions] = useState<string[]>([]);
  const [voiceGenders, setVoiceGenders] = useState<Record<string, string>>({});
  const [scoped, setScoped] = useState<LanguageScopedSelection>(() => ({
    languageCode: activeLanguageCode,
    selection: readSelection(activeLanguageCode),
  }));
  const [loadingVoices, setLoadingVoices] = useState(false);

  const selection = scoped.languageCode === activeLanguageCode
    ? scoped.selection
    : readSelection(activeLanguageCode);

  useEffect(() => {
    let cancelled = false;

    async function loadVoices() {
      setLoadingVoices(true);
      try {
        const res = await fetch('/api/languages');
        if (!res.ok) throw new Error('Failed to load Google TTS voices');
        const data = await res.json();
        const languages = Array.isArray(data.languages)
          ? data.languages as TtsLanguageOption[]
          : [];
        const activeBase = getBaseLanguage(activeLanguageCode);
        const language = languages.find((candidate) =>
          candidate.code.toLowerCase() === activeLanguageCode.toLowerCase()
          || getBaseLanguage(candidate.code) === activeBase
        );
        const voices = Array.from(new Set(language?.ttsVoices ?? []));
        if (cancelled) return;
        setVoiceOptions(voices);
        setVoiceGenders(language?.ttsVoiceGenders ?? {});
        setScoped(() => {
          const stored = readStoredVoiceSelection(activeLanguageCode);
          return {
            languageCode: activeLanguageCode,
            selection: reconcileStoredSelection(stored, voices),
          };
        });
      } catch {
        if (cancelled) return;
        setVoiceOptions([]);
        setVoiceGenders({});
        setScoped({ languageCode: activeLanguageCode, selection: DEFAULT_VOICE_SELECTION });
      } finally {
        if (!cancelled) setLoadingVoices(false);
      }
    }

    void loadVoices();

    return () => {
      cancelled = true;
    };
  }, [activeLanguageCode]);

  const updateSelection = useCallback((next: VoiceSelection) => {
    setScoped({ languageCode: activeLanguageCode, selection: next });
    writeStoredVoiceSelection(activeLanguageCode, next);
  }, [activeLanguageCode]);

  const setSingleVoice = useCallback((voiceId: string) => {
    updateSelection({ mode: 'single', voiceId });
  }, [updateSelection]);

  const enableChirp3HdMix = useCallback(() => {
    const chirp3HdVoices = getChirp3HdVoiceOptions(voiceOptions);
    if (chirp3HdVoices.length === 0) {
      updateSelection(DEFAULT_VOICE_SELECTION);
      return;
    }
    if (chirp3HdVoices.length === 1) {
      updateSelection({ mode: 'single', voiceId: chirp3HdVoices[0] });
      return;
    }
    updateSelection({ mode: 'mix', voiceIds: chirp3HdVoices });
  }, [updateSelection, voiceOptions]);

  const enableMix = useCallback(() => {
    // Start with every voice selected; users narrow down from there.
    updateSelection({ mode: 'mix', voiceIds: [...voiceOptions] });
  }, [updateSelection, voiceOptions]);

  const toggleMixVoice = useCallback((voiceId: string) => {
    const current = selection.mode === 'mix' ? selection.voiceIds : [];
    const next = current.includes(voiceId)
      ? current.filter((id) => id !== voiceId)
      : [...current, voiceId];
    updateSelection({ mode: 'mix', voiceIds: next });
  }, [selection, updateSelection]);

  const selectAllMixVoices = useCallback(() => {
    updateSelection({ mode: 'mix', voiceIds: [...voiceOptions] });
  }, [updateSelection, voiceOptions]);

  const clearMixVoices = useCallback(() => {
    updateSelection({ mode: 'mix', voiceIds: [] });
  }, [updateSelection]);

  const selectionKey = useMemo(() => serializeVoiceSelection(selection), [selection]);

  const resolveVoice = useCallback(
    (text: string) => resolveVoiceForText(text, selection, voiceOptions),
    [selection, voiceOptions],
  );

  return {
    voiceOptions,
    voiceGenders,
    selection,
    selectionKey,
    loadingVoices,
    setSingleVoice,
    enableChirp3HdMix,
    enableMix,
    toggleMixVoice,
    selectAllMixVoices,
    clearMixVoices,
    resolveVoice,
  };
}
