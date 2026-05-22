/**
 * Accepts either ISO 8601 timestamps or numeric epoch ms (the format
 * getUserSyncRevision returns). Returns null for malformed input so callers
 * can fall back to a full snapshot rather than serve stale deltas anchored at
 * the epoch.
 */
export function parseSinceCursor(value: string | null): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && numeric > 0) {
    const date = new Date(numeric);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
