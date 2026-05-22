import { useEffect, useState } from 'react';
import { fetchUserData } from '@/lib/sync';
import { subscribeTabMessages } from '@/lib/tab-sync';

export function useListsSettingsLanguage(): string {
  const [settingsLanguage, setSettingsLanguage] = useState('en');

  useEffect(() => {
    let cancelled = false;

    void fetchUserData()
      .then((data) => {
        if (cancelled) return;
        const language = data.user?.settings_language;
        if (typeof language === 'string' && language.trim()) {
          setSettingsLanguage(language);
        }
      })
      .catch(() => {
        // Keep English fallback until the saved language is available.
      });

    const unsubscribe = subscribeTabMessages((message) => {
      if (message.type !== 'preferences_changed') return;
      const language = message.patch.settingsLanguage;
      if (typeof language === 'string' && language.trim()) {
        setSettingsLanguage(language);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return settingsLanguage;
}
