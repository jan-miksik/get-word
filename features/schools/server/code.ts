import { createHmac, randomBytes } from 'crypto';
import {
  SCHOOL_CODE_MAX_LENGTH,
  SCHOOL_CODE_MIN_LENGTH,
} from '@/features/schools/server/config';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function normalizeSchoolCode(code: string) {
  return code.trim();
}

export function assertUsableSchoolCode(code: string) {
  const normalized = normalizeSchoolCode(code);
  if (
    normalized.length < SCHOOL_CODE_MIN_LENGTH ||
    normalized.length > SCHOOL_CODE_MAX_LENGTH ||
    !/^[A-Za-z0-9_-]+$/.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

/**
 * Derived from the session secret rather than a dedicated variable: one fewer
 * thing to configure, and it cannot be missing in production (login already
 * requires it). The `school-code-v1:` prefix keeps this hash domain-separated
 * from session cookie signing even though both share key material.
 *
 * Changing either the secret or the prefix invalidates every issued code, so
 * treat the version tag as the migration hook if this ever needs to move.
 */
function getSchoolCodeSecret(): string {
  const configured = process.env.APP_SESSION_SECRET;
  if (configured && configured.length > 0) return configured;
  if (process.env.NODE_ENV !== 'production') return 'dev-only-insecure-secret';
  throw new Error('APP_SESSION_SECRET is required to hash school access codes.');
}

export function hashSchoolCode(code: string) {
  return createHmac('sha256', getSchoolCodeSecret())
    .update(`school-code-v1:${normalizeSchoolCode(code)}`)
    .digest('hex');
}

export function generateSchoolCode(length = 20) {
  const size = Math.max(16, Math.min(24, Math.floor(length)));
  const bytes = randomBytes(size);
  let out = '';
  for (const byte of bytes) {
    out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  return out;
}
