import { deviceJsonFetch } from '@/features/shared/http/device-json-fetch';

export function listsApiFetch(path: string, options: RequestInit = {}) {
  return deviceJsonFetch(path, options);
}
