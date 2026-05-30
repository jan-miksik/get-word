import { useCallback, useEffect, useState } from 'react';
import {
  readStoredGoogleVoiceId,
  writeStoredGoogleVoiceId,
} from '@/features/lists/client/storage';
import { getBaseLanguage, type TtsLanguageOption } from './language';

export function useGoogleTtsVoiceSelection(activeLanguageCode: string) {
  const [voiceOptions, setVoiceOptions] = useState<string[]>([]);
  const [selectedVoice, setSelectedVoice] = useState(() => ({
    languageCode: activeLanguageCode,
    voiceId: readStoredGoogleVoiceId(activeLanguageCode),
  }));
  const [loadingVoices, setLoadingVoices] = useState(false);
  const selectedGoogleVoiceId = selectedVoice.languageCode === activeLanguageCode
    ? selectedVoice.voiceId
    : readStoredGoogleVoiceId(activeLanguageCode);

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
        setSelectedVoice((current) => {
          const currentVoiceId = current.languageCode === activeLanguageCode
            ? current.voiceId
            : readStoredGoogleVoiceId(activeLanguageCode);
          const voiceId = currentVoiceId !== 'default' && voices.includes(currentVoiceId)
            ? currentVoiceId
            : 'default';
          return { languageCode: activeLanguageCode, voiceId };
        });
      } catch {
        if (cancelled) return;
        setVoiceOptions([]);
        setSelectedVoice({ languageCode: activeLanguageCode, voiceId: 'default' });
      } finally {
        if (!cancelled) setLoadingVoices(false);
      }
    }

    void loadVoices();

    return () => {
      cancelled = true;
    };
  }, [activeLanguageCode]);

  const handleGoogleVoiceChange = useCallback((voiceId: string) => {
    setSelectedVoice({ languageCode: activeLanguageCode, voiceId });
    writeStoredGoogleVoiceId(activeLanguageCode, voiceId);
  }, [activeLanguageCode]);

  return {
    voiceOptions,
    selectedGoogleVoiceId,
    loadingVoices,
    handleGoogleVoiceChange,
  };
}
