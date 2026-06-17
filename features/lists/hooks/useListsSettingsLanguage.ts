import { useEffect, useState } from 'react';
import { readPreferredPublicLanguage } from '@/lib/i18n/client-language';
import { fetchUserData } from '@/lib/sync';
import { subscribeTabMessages } from '@/lib/tab-sync';

export function useListsSettingsLanguage(): string {
  // Seed from the locally-known interface language so the editor renders in the
  // user's language immediately instead of flashing English until the synced
  // settings_language arrives.
  const [settingsLanguage, setSettingsLanguage] = useState(readPreferredPublicLanguage);

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
