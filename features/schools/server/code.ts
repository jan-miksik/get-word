import { createHash, randomBytes } from 'crypto';
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
 * Unkeyed on purpose. What the stored hash has to guarantee is that read access
 * to the database does not hand out redeemable codes — that is preimage
 * resistance, and SHA-256 gives it outright. A key would only add resistance to
 * precomputation, which needs guessable inputs to matter; `generateSchoolCode`
 * emits 20 symbols from a 32-symbol alphabet, so there is nothing to precompute
 * against. Codes an operator types by hand are the exception, which is why
 * issuing one is restricted to non-production databases in
 * `scripts/school-access.ts` rather than papered over with a key here.
 *
 * A key also made the hash environment-bound: a code issued against production
 * from a shell holding any other secret was written happily and then rejected
 * at redeem as invalid, and rotating the session secret silently killed every
 * `/school/redeem` link already in teachers' hands. Neither is a trade worth
 * making for protection that high-entropy codes do not need.
 *
 * The `school-code-v2:` prefix keeps the digest domain-separated and marks the
 * scheme; bump it if the input format ever changes, and treat that bump as
 * invalidating every issued code.
 */
export function hashSchoolCode(code: string) {
  return createHash('sha256')
    .update(`school-code-v2:${normalizeSchoolCode(code)}`)
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
