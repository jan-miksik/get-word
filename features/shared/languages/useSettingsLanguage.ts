import { useEffect, useState } from 'react';
import { usePreferredPublicLanguage } from '@/lib/i18n/client-language';
import { readPreferredPublicLanguageSelectedAt } from '@/lib/i18n/public-language';
import { fetchUserData } from '@/lib/sync';
import { subscribeTabMessages } from '@/lib/tab-sync';

function timestampMs(value: string | null | undefined): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function useSettingsLanguage(): string {
  // `usePreferredPublicLanguage` deliberately returns the server default for
  // the hydration render, then updates from localStorage after mount. That keeps
  // /lists SSR text and the first client text identical while still avoiding a
  // long English flash once the browser preference is available.
  const preferredPublicLanguage = usePreferredPublicLanguage();
  const [syncedSettingsLanguage, setSyncedSettingsLanguage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void fetchUserData()
      .then((data) => {
        if (cancelled) return;
        const language = data.user?.settings_language;
        if (typeof language === 'string' && language.trim()) {
          const serverSelectedAt = data.user?.settings_language_selected_at ?? null;
          const localSelectedAt = readPreferredPublicLanguageSelectedAt();
          if (timestampMs(serverSelectedAt) < timestampMs(localSelectedAt)) return;
          setSyncedSettingsLanguage(language);
        }
      })
      .catch(() => {
        // Keep English fallback until the saved language is available.
      });

    const unsubscribe = subscribeTabMessages((message) => {
      if (message.type !== 'preferences_changed') return;
      const language = message.patch.settingsLanguage;
      if (typeof language === 'string' && language.trim()) {
        setSyncedSettingsLanguage(language);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return syncedSettingsLanguage ?? preferredPublicLanguage;
}
