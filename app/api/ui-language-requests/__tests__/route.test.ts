import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  resolveUser: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  onConflictDoUpdate: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  resolveUserFromRequest: (...args: unknown[]) => mocks.resolveUser(...args),
  unauthorizedResponse: () =>
    new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    }),
}));

vi.mock('@/lib/db/client', () => ({
  db: { insert: (...args: unknown[]) => mocks.insert(...args) },
}));

vi.mock('@/lib/db/schema', () => ({
  uiLanguageRequests: {
    userId: 'user_id',
    languageCode: 'language_code',
  },
}));

import { POST } from '../route';

function request(languageCode: unknown) {
  return new NextRequest('http://localhost/api/ui-language-requests', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-device-id': 'device-1' },
    body: JSON.stringify({ languageCode }),
  });
}

describe('POST /api/ui-language-requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveUser.mockResolvedValue({ id: 'user-1' });
    mocks.onConflictDoUpdate.mockResolvedValue(undefined);
    mocks.values.mockReturnValue({ onConflictDoUpdate: mocks.onConflictDoUpdate });
    mocks.insert.mockReturnValue({ values: mocks.values });
  });

  it('requires a device or account identity', async () => {
    mocks.resolveUser.mockResolvedValue(null);
    expect((await POST(request('de'))).status).toBe(401);
  });

  it('rejects invalid and already bundled languages', async () => {
    expect((await POST(request('not-a-language'))).status).toBe(400);

    const bundled = await POST(request('cs'));
    expect(bundled.status).toBe(409);
    expect(await bundled.json()).toMatchObject({ code: 'already_supported' });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('upserts one request per user and normalized language', async () => {
    const response = await POST(request('DE'));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ languageCode: 'de' });
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', languageCode: 'de' }),
    );
    expect(mocks.onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        target: ['user_id', 'language_code'],
        set: { updatedAt: expect.any(Date) },
      }),
    );
  });
});
