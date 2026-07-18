import type { I18nKey } from '@/lib/i18n/messages';

export function formatSyncTime(
  timestamp: number | null,
  t: (key: I18nKey, values?: Record<string, string | number>) => string,
): string | null {
  if (!timestamp) return null;
  const diffMs = Date.now() - timestamp;
  if (diffMs < 60_000) return t('common.justNow');
  if (diffMs < 60 * 60_000) {
    return t('common.minutesAgo', { count: Math.max(1, Math.round(diffMs / 60_000)) });
  }
  if (diffMs < 24 * 60 * 60_000) {
    return t('common.hoursAgo', { count: Math.max(1, Math.round(diffMs / (60 * 60_000))) });
  }
  return new Date(timestamp).toLocaleDateString();
}

export function formatByteSize(bytes: number, locale: string): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = Math.max(0, bytes);
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const maximumFractionDigits = unitIndex === 0 || value >= 10 ? 0 : 1;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value)} ${units[unitIndex]}`;
}
