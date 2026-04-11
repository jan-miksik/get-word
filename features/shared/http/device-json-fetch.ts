import { getDeviceId } from '@/lib/device-id';

export function deviceJsonFetch(path: string, options: RequestInit = {}) {
  return fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-device-id': getDeviceId(),
      ...options.headers,
    },
  });
}
