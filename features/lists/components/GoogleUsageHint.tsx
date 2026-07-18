'use client';

import { useMemo } from 'react';
import { useI18n } from '@/components/I18nProvider';
import type { GoogleUsageAccountScope } from '@/features/lists/types';

interface GoogleUsageHintProps {
  scope: GoogleUsageAccountScope;
}

export function GoogleUsageHint({ scope }: GoogleUsageHintProps) {
  const { language, t } = useI18n();
  const numberFmt = useMemo(() => new Intl.NumberFormat(language === 'cs' ? 'cs-CZ' : language), [language]);
  const fmt = (n: number) => numberFmt.format(Math.max(0, Math.floor(n)));
  const used = Math.max(0, Math.floor(scope.used_units));
  const limit = Math.max(0, Math.floor(scope.account_limit));
  const percent = limit > 0 ? Math.round((used / limit) * 100) : 0;

  const tooltip = t('lists.googleUsageTooltip', { used: fmt(used), limit: fmt(limit) });

  return (
    <p className="mt-1.5 text-[11px] text-text-soft cursor-default" title={tooltip}>
      {t('lists.googleUsageCompact', { used: fmt(used), limit: fmt(limit), percent })}
    </p>
  );
}
