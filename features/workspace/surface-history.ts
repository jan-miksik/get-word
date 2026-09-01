export type AppSurface = 'study' | 'chat' | 'photo' | 'progress';

const APP_SURFACES: readonly AppSurface[] = ['study', 'chat', 'photo', 'progress'];

export function isAppSurface(value: unknown): value is AppSurface {
  return typeof value === 'string' && (APP_SURFACES as readonly string[]).includes(value);
}

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
  if (surface === 'progress') return 'progress';
  if (!surface && url.searchParams.get('wordChat') === '1') return 'chat';
  return 'study';
}

/**
 * The nav entry a surface belongs under. The photo lab is a tab of the
 * add-words screen rather than a destination of its own, so the top bar and
 * the menu keep naming that errand while the camera is up — the learner is
 * still inside "Add words", just on another tab of it.
 */
export function appSurfaceSection(surface: AppSurface): AppSurface {
  return surface === 'photo' ? 'chat' : surface;
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
    !isAppSurface(entry.baseSurface) ||
    !isAppSurface(entry.surface)
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
