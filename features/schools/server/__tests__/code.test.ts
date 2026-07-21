import { afterEach, describe, expect, it } from 'vitest';
import {
  assertUsableSchoolCode,
  generateSchoolCode,
  hashSchoolCode,
} from '@/features/schools/server/code';

const originalSecret = process.env.APP_SESSION_SECRET;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.APP_SESSION_SECRET;
  else process.env.APP_SESSION_SECRET = originalSecret;
});

describe('hashSchoolCode', () => {
  /**
   * The regression this file exists for: a code was once hashed with whatever
   * secret the issuing shell happened to hold, so a code issued from an
   * operator's terminal was rejected by the server as invalid and rotating the
   * session secret killed every link already sent out. The hash must not depend
   * on ambient environment.
   */
  it('does not depend on APP_SESSION_SECRET', () => {
    process.env.APP_SESSION_SECRET = 'one-secret';
    const first = hashSchoolCode('ABCDEFGH2345');
    process.env.APP_SESSION_SECRET = 'a-completely-different-secret';
    const second = hashSchoolCode('ABCDEFGH2345');
    delete process.env.APP_SESSION_SECRET;
    const third = hashSchoolCode('ABCDEFGH2345');

    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it('never stores anything resembling the code itself', () => {
    const code = generateSchoolCode();
    const hash = hashSchoolCode(code);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(code);
  });

  it('ignores surrounding whitespace so a pasted code still matches', () => {
    expect(hashSchoolCode('  ABCDEFGH2345\n')).toBe(hashSchoolCode('ABCDEFGH2345'));
  });

  it('separates codes that differ by one character', () => {
    expect(hashSchoolCode('ABCDEFGH2345')).not.toBe(hashSchoolCode('ABCDEFGH2346'));
  });
});

describe('generateSchoolCode', () => {
  it('emits unambiguous alphabet characters only', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateSchoolCode()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{20}$/);
    }
  });

  it('clamps the length into the range the redeem validator accepts', () => {
    expect(generateSchoolCode(4)).toHaveLength(16);
    expect(generateSchoolCode(999)).toHaveLength(24);
    expect(assertUsableSchoolCode(generateSchoolCode(4))).not.toBeNull();
    expect(assertUsableSchoolCode(generateSchoolCode(999))).not.toBeNull();
  });

  it('does not repeat itself', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateSchoolCode()));
    expect(codes.size).toBe(200);
  });
});

describe('assertUsableSchoolCode', () => {
  it('rejects codes that are too short, too long, or oddly punctuated', () => {
    expect(assertUsableSchoolCode('SHORT')).toBeNull();
    expect(assertUsableSchoolCode('A'.repeat(65))).toBeNull();
    expect(assertUsableSchoolCode('HAS SPACE 12')).toBeNull();
    expect(assertUsableSchoolCode("BOBBY'); DROP--")).toBeNull();
  });

  it('accepts the hyphenated codes an operator writes by hand', () => {
    expect(assertUsableSchoolCode('TEST-SCHOOL-2026')).toBe('TEST-SCHOOL-2026');
  });
});
