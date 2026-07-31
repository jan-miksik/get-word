import { CapacitorHttp, type HttpOptions } from '@capacitor/core';
import { apiUrl } from '../config';
import { isNativeApp } from '../native';

class MobileApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload: unknown,
  ) {
    super(message);
    this.name = 'MobileApiError';
  }
}

type MobileApiOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  sessionToken?: string | null;
  headers?: Record<string, string>;
};

function parsePayload(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export async function mobileApiRequest<T>(
  path: string,
  options: MobileApiOptions = {},
): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    ...(options.sessionToken
      ? { Authorization: `Bearer ${options.sessionToken}` }
      : {}),
    ...options.headers,
  };

  if (isNativeApp()) {
    const nativeOptions: HttpOptions = {
      url: apiUrl(path),
      method,
      headers,
      data: options.body,
      connectTimeout: 8_000,
      readTimeout: 15_000,
    };
    const response = await CapacitorHttp.request(nativeOptions);
    const payload = parsePayload(response.data);
    if (response.status < 200 || response.status >= 300) {
      throw new MobileApiError('Get Word API request failed', response.status, payload);
    }
    return payload as T;
  }

  const response = await fetch(apiUrl(path), {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const payload = parsePayload(await response.text());
  if (!response.ok) {
    throw new MobileApiError('Get Word API request failed', response.status, payload);
  }
  return payload as T;
}
