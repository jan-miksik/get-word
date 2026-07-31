const DEFAULT_API_ORIGIN = 'https://getword.app';
const DEFAULT_SUPABASE_URL = 'https://hammcskxrzztdviauvdk.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_yfZXu79KE4BYl_Xmn_zegQ_eXWW8BXW';

function normalizeOrigin(value: string): string {
  return value.replace(/\/+$/, '');
}

export const apiOrigin = normalizeOrigin(
  import.meta.env.VITE_GET_WORD_API_ORIGIN || DEFAULT_API_ORIGIN,
);

export const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  (import.meta.env.DEV ? import.meta.env.NEXT_PUBLIC_SUPABASE_URL : '') ||
  DEFAULT_SUPABASE_URL;

export const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  (import.meta.env.DEV
    ? import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    : '') ||
  DEFAULT_SUPABASE_PUBLISHABLE_KEY;

export function hasMobileAuthConfiguration(): boolean {
  return Boolean(supabaseUrl && supabasePublishableKey);
}

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${apiOrigin}${normalizedPath}`;
}
