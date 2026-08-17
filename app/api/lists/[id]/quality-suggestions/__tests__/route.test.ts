import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockResolveUserFromRequest = vi.fn();
const mockGetListById = vi.fn();
const mockGetListQualitySuggestions = vi.fn();
const mockDismissQualitySuggestion = vi.fn();

vi.mock('@/lib/auth', () => ({
  resolveUserFromRequest: (...args: unknown[]) => mockResolveUserFromRequest(...args),
  unauthorizedResponse: () => Response.json({ error: 'Authentication required' }, { status: 401 }),
  forbiddenResponse: (message?: string) => Response.json({ error: message }, { status: 403 }),
}));

vi.mock('@/lib/db', () => ({
  getListById: (...args: unknown[]) => mockGetListById(...args),
  getListQualitySuggestions: (...args: unknown[]) => mockGetListQualitySuggestions(...args),
  dismissQualitySuggestion: (...args: unknown[]) => mockDismissQualitySuggestion(...args),
}));

import { POST } from '../route';

const context = { params: Promise.resolve({ id: 'list-1' }) };

function dismissRequest(body: unknown) {
  return new NextRequest('http://localhost/api/lists/list-1/quality-suggestions', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/lists/[id]/quality-suggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveUserFromRequest.mockResolvedValue({ id: 'user-1' });
    mockGetListById.mockResolvedValue({ id: 'list-1', ownerId: 'user-1' });
    mockGetListQualitySuggestions.mockResolvedValue([
      { itemId: 'item-1', poolKey: 'p1:abc', suggestionVersion: 2 },
    ]);
    mockDismissQualitySuggestion.mockResolvedValue(undefined);
  });

  /**
   * The reason the version is checked at all: `getListQualitySuggestions`
   * hides a pair whose dismissal version is `>=` the review's, so accepting an
   * arbitrarily high number from the client would bury every FUTURE correction
   * for this pair — the exact opposite of what versioned dismissals are for.
   */
  it('refuses to dismiss a version that is not the one on offer', async () => {
    const response = await POST(dismissRequest({ poolKey: 'p1:abc', suggestionVersion: 999999 }), context);

    expect(response.status).toBe(409);
    expect(mockDismissQualitySuggestion).not.toHaveBeenCalled();
  });

  it('records the server’s own version, not the number the client sent', async () => {
    const response = await POST(dismissRequest({ poolKey: 'p1:abc', suggestionVersion: 2 }), context);

    expect(response.status).toBe(200);
    expect(mockDismissQualitySuggestion).toHaveBeenCalledWith('user-1', 'p1:abc', 2);
  });

  /**
   * The pool key carries a foreign key into the review table, so an unknown
   * key used to raise and surface as an unhandled 500.
   */
  it('reports an unknown pool key as a bad request, not a server fault', async () => {
    const response = await POST(dismissRequest({ poolKey: 'p1:nope', suggestionVersion: 2 }), context);

    expect(response.status).toBe(404);
    expect(mockDismissQualitySuggestion).not.toHaveBeenCalled();
  });

  it('rejects a negative version outright', async () => {
    const response = await POST(dismissRequest({ poolKey: 'p1:abc', suggestionVersion: -1 }), context);

    expect(response.status).toBe(400);
    expect(mockDismissQualitySuggestion).not.toHaveBeenCalled();
  });

  it('lets nobody but the owner dismiss', async () => {
    mockGetListById.mockResolvedValue({ id: 'list-1', ownerId: 'someone-else' });

    const response = await POST(dismissRequest({ poolKey: 'p1:abc', suggestionVersion: 2 }), context);

    expect(response.status).toBe(403);
    expect(mockDismissQualitySuggestion).not.toHaveBeenCalled();
  });
});
