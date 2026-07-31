import { apiFetch } from './api-runtime';

export function deviceJsonFetch(path: string, options: RequestInit = {}) {
  return apiFetch(path, {
    ...options,
    cache: options.cache ?? 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}
