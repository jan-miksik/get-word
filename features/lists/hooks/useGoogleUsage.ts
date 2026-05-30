import { useCallback, useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { listsApiFetch } from '@/features/lists/api';
import type { GoogleUsageResponse } from '@/features/lists/types';

export function useGoogleUsage() {
  const { t } = useI18n();
  const [googleUsage, setGoogleUsage] = useState<GoogleUsageResponse | null>(null);

  const loadGoogleUsage = useCallback(async () => {
    try {
      const res = await listsApiFetch('/api/google-usage');
      if (!res.ok) {
        if (res.status === 401) return;
        throw new Error(t('lists.googleUsageLoadFailed'));
      }
      const data = await res.json();
      setGoogleUsage(data);
    } catch {
      // Usage hints are advisory; keep the page usable if this request fails.
    }
  }, [t]);

  return { googleUsage, loadGoogleUsage };
}
