const DEFAULT_API_ORIGIN = 'https://getword.app';

function normalizeOrigin(value: string): string {
  return value.replace(/\/+$/, '');
}

export const apiOrigin = normalizeOrigin(
  import.meta.env.VITE_GET_WORD_API_ORIGIN || DEFAULT_API_ORIGIN,
);

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${apiOrigin}${normalizedPath}`;
}
