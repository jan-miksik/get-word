/** Browser/server-safe helpers for immutable local-day stamps on source events. */
export function currentIanaTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function normalizeIanaTimezone(value: string | null | undefined): string {
  const timezone = value?.trim();
  if (!timezone) return 'UTC';
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone }).format(0);
    return timezone;
  } catch {
    return 'UTC';
  }
}

export function localDayKeyAt(epochMs: number, timezone = currentIanaTimezone()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date(epochMs));
    const take = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value;
    const year = take('year');
    const month = take('month');
    const day = take('day');
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    // Use UTC only when the runtime cannot resolve a local zone at all.
  }
  return new Date(epochMs).toISOString().slice(0, 10);
}
