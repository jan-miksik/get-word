export type AppSurface = 'study' | 'chat' | 'photo';

export const APP_SURFACE_HISTORY_KEY = 'getWordSurface';
export const APP_SURFACE_HISTORY_MARKER = 'get-word-surface-v1';

export type AppSurfaceHistoryEntry = {
  marker: typeof APP_SURFACE_HISTORY_MARKER;
  depth: number;
  baseSurface: AppSurface;
  surface: AppSurface;
};

export function parseAppSurface(
  href: string,
  { photoEnabled = true }: { photoEnabled?: boolean } = {},
): AppSurface {
  const url = new URL(href, 'https://getword.app');
  const surface = url.searchParams.get('surface');
  if (surface === 'chat') return 'chat';
  if (surface === 'photo') return photoEnabled ? 'photo' : 'study';
  if (!surface && url.searchParams.get('wordChat') === '1') return 'chat';
  return 'study';
}

export function appSurfaceHref(surface: AppSurface, href: string): string {
  const url = new URL(href, 'https://getword.app');
  if (surface === 'study') url.searchParams.delete('surface');
  else url.searchParams.set('surface', surface);
  url.searchParams.delete('wordChat');
  return `${url.pathname}${url.search}${url.hash}`;
}

export function readAppSurfaceHistoryEntry(state: unknown): AppSurfaceHistoryEntry | null {
  if (!state || typeof state !== 'object') return null;
  const candidate = (state as Record<string, unknown>)[APP_SURFACE_HISTORY_KEY];
  if (!candidate || typeof candidate !== 'object') return null;
  const entry = candidate as Partial<AppSurfaceHistoryEntry>;
  if (
    entry.marker !== APP_SURFACE_HISTORY_MARKER ||
    typeof entry.depth !== 'number' ||
    !Number.isInteger(entry.depth) ||
    entry.depth < 0 ||
    (entry.baseSurface !== 'study' &&
      entry.baseSurface !== 'chat' &&
      entry.baseSurface !== 'photo') ||
    (entry.surface !== 'study' && entry.surface !== 'chat' && entry.surface !== 'photo')
  ) {
    return null;
  }
  return entry as AppSurfaceHistoryEntry;
}

export function withAppSurfaceHistoryEntry(
  state: unknown,
  entry: AppSurfaceHistoryEntry,
): Record<string, unknown> {
  const base = state && typeof state === 'object' ? state as Record<string, unknown> : {};
  return { ...base, [APP_SURFACE_HISTORY_KEY]: entry };
}
