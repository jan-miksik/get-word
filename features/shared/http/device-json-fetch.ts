import { getDeviceId } from '@/lib/device-id';

export function deviceJsonFetch(path: string, options: RequestInit = {}) {
  return fetch(path, {
    ...options,
    cache: options.cache ?? 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'x-device-id': getDeviceId(),
      ...options.headers,
    },
  });
}
