import { describe, expect, it } from 'vitest';
import { userHandle } from '../userHandle';

describe('userHandle', () => {
  const id = '11111111-1111-1111-1111-111111111111';

  it('produces a stable user_<12 hex> handle', () => {
    expect(userHandle(id)).toMatch(/^user_[0-9a-f]{12}$/);
  });

  it('is deterministic for the same id', () => {
    expect(userHandle(id)).toBe(userHandle(id));
  });

  it('does not leak the raw id and differs across ids', () => {
    const handle = userHandle(id);
    expect(handle).not.toContain('1111');
    expect(userHandle(id)).not.toBe(userHandle('22222222-2222-2222-2222-222222222222'));
  });
});
