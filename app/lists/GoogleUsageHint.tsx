'use client';

import type { GoogleUsageAccountScope } from '@/features/lists/types';

const numberFmt = new Intl.NumberFormat('en-US');
function fmt(n: number) {
  return numberFmt.format(Math.max(0, Math.floor(n)));
}

interface GoogleUsageHintProps {
  scope: GoogleUsageAccountScope;
}

export function GoogleUsageHint({ scope }: GoogleUsageHintProps) {
  const used = Math.max(0, Math.floor(scope.used_units));
  const limit = Math.max(0, Math.floor(scope.account_limit));
  const percent = limit > 0 ? Math.round((used / limit) * 100) : 0;

  const tooltip = `This account: ${fmt(used)} / ${fmt(limit)} chars · Resets on the 1st of each month`;

  return (
    <p className="mt-1.5 text-[11px] text-text-soft cursor-default" title={tooltip}>
      {fmt(used)} / {fmt(limit)} chars used ({percent}%) · Resets 1st of month
    </p>
  );
}
