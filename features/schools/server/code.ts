import { createHash, createHmac, randomBytes } from 'crypto';
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

export function hashSchoolCode(code: string) {
  const normalized = normalizeSchoolCode(code);
  const secret = process.env.SCHOOL_CODE_HASH_SECRET;
  if (secret) {
    return createHmac('sha256', secret).update(normalized).digest('hex');
  }
  return createHash('sha256').update(normalized).digest('hex');
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
