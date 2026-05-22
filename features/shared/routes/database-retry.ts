import { NextResponse } from 'next/server';
import type { createRouteTimer } from './timing';

const PG_STATEMENT_TIMEOUT = '57014';
const TRANSIENT_DATABASE_ERROR_CODES = new Set([
  PG_STATEMENT_TIMEOUT,
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENETUNREACH',
  'EHOSTUNREACH',
]);
const DATABASE_UNAVAILABLE_MESSAGE =
  'Database is temporarily unavailable. Please try again shortly.';

function isStatementTimeout(err: unknown): boolean {
  return hasRecoverableDatabaseCode(err, new Set([PG_STATEMENT_TIMEOUT]));
}

function hasRecoverableDatabaseCode(err: unknown, codes = TRANSIENT_DATABASE_ERROR_CODES): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as {
    code?: string;
    cause?: unknown;
    errors?: unknown[];
  };

  if (e.code && codes.has(e.code)) return true;
  if (e.cause && hasRecoverableDatabaseCode(e.cause, codes)) return true;
  if (Array.isArray(e.errors) && e.errors.some((item) => hasRecoverableDatabaseCode(item, codes))) {
    return true;
  }

  return false;
}

export function isTransientDatabaseError(err: unknown): boolean {
  if (hasRecoverableDatabaseCode(err)) return true;
  if (err instanceof Error && /getaddrinfo (ENOTFOUND|EAI_AGAIN)/i.test(err.message)) {
    return true;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetryOnRecoverableDatabaseError<T>(fn: () => Promise<T>): Promise<T> {
  const maxAttempts = 3;
  const retryDelayMs = process.env.NODE_ENV === 'test' ? 0 : 800;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!isTransientDatabaseError(error) || attempt === maxAttempts) {
        throw error;
      }
      if (isStatementTimeout(error)) {
        console.warn('Database statement timeout during sync; retrying', { attempt });
      }
      await sleep(retryDelayMs);
    }
  }

  throw new Error('Unreachable database retry state');
}

export function databaseUnavailableResponse(
  timer: ReturnType<typeof createRouteTimer>,
  error: unknown,
  logLabel: string,
) {
  console.error(logLabel, error);
  const failed = NextResponse.json(
    { success: false, error: DATABASE_UNAVAILABLE_MESSAGE },
    { status: 503 },
  );
  failed.headers.set('Retry-After', '2');
  return timer.applyHeaders(failed);
}
