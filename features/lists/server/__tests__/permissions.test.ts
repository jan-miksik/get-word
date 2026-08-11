import { describe, expect, it } from 'vitest';

import { getListPermissions } from '@/packages/domain/lists/permissions';

const list = { ownerId: 'owner', isCommon: false, isPublic: false };

describe('list permission policy', () => {
  it.each([
    ['owner', { user: { id: 'owner', userRole: 'user' } }, true, true],
    ['common-list editor', { list: { ...list, isCommon: true }, user: { id: 'editor', userRole: 'editor' } }, true, true],
    ['private subscriber', { user: { id: 'subscriber' }, isSubscribed: true }, true, false],
    ['public visitor', { list: { ...list, isPublic: true }, user: { id: 'visitor' } }, true, false],
    ['unrelated visitor', { user: { id: 'visitor' } }, false, false],
    ['blocked subscriber', { user: { id: 'blocked' }, isSubscribed: true, isBlocked: true }, false, false],
  ] as const)('%s', (_label, overrides, canRead, canManageContent) => {
    expect(getListPermissions({ list, ...overrides })).toMatchObject({ canRead, canManageContent });
  });
});
