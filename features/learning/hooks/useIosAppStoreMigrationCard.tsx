'use client';

import { useCallback, useState } from 'react';
import {
  persistIosAppStoreMigrationAnswered,
  readIosAppStoreMigrationAnswered,
} from '@/features/learning/app-state/storage';
import { IosAppStoreMigrationCard } from '@/features/learning/components/IosAppStoreMigrationCard';
import { useIosPwaMigration } from '@/hooks/usePWAInstallState';

/**
 * The "move to the App Store build" card, or null.
 *
 * Only the old iOS home-screen web app ever gets one — see
 * `resolveIosPwaMigration` in `lib/app-install` for why an installed iOS app is
 * not a finished state. The answer is remembered per device rather than per
 * account, because so is the thing it is about.
 */
export function useIosAppStoreMigrationCard() {
  const migration = useIosPwaMigration();
  const [answered, setAnswered] = useState(readIosAppStoreMigrationAnswered);

  const dismiss = useCallback(() => {
    persistIosAppStoreMigrationAnswered(true);
    setAnswered(true);
  }, []);

  if (!migration || answered) return null;
  return <IosAppStoreMigrationCard url={migration.url} onDismiss={dismiss} />;
}
