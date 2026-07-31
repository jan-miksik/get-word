import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockResolveAuthenticatedUser = vi.fn();
const mockModerateContentReport = vi.fn();

vi.mock('@/lib/auth', () => ({
  resolveAuthenticatedUser: (...args: unknown[]) => mockResolveAuthenticatedUser(...args),
  isEditor: (user: { userRole?: string }) => user.userRole === 'editor',
  unauthorizedResponse: () => Response.json({ error: 'Authentication required' }, { status: 401 }),
  forbiddenResponse: () => Response.json({ error: 'Forbidden' }, { status: 403 }),
}));

vi.mock('@/lib/db', () => ({
  moderateContentReport: (...args: unknown[]) => mockModerateContentReport(...args),
}));

import { PATCH } from '../[id]/route';

const context = { params: Promise.resolve({ id: 'report-1' }) };

describe('PATCH /api/admin/moderation/reports/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveAuthenticatedUser.mockResolvedValue({ id: 'editor-1', userRole: 'editor' });
    mockModerateContentReport.mockResolvedValue({ id: 'report-1', status: 'resolved' });
  });

  it('requires a public decision reason when restricting content', async () => {
    const request = new NextRequest('http://localhost/api/admin/moderation/reports/report-1', {
      method: 'PATCH',
      body: JSON.stringify({ action: 'restrict' }),
    });

    const response = await PATCH(request, context);

    expect(response.status).toBe(400);
    expect(mockModerateContentReport).not.toHaveBeenCalled();
  });

  it('keeps the public explanation separate from the internal moderator note', async () => {
    const request = new NextRequest('http://localhost/api/admin/moderation/reports/report-1', {
      method: 'PATCH',
      body: JSON.stringify({
        action: 'restrict',
        decisionCode: 'hate_or_harassment',
        publicNote: 'The list contained targeted insults.',
        internalNote: 'Repeat offender; related report 42.',
      }),
    });

    const response = await PATCH(request, context);

    expect(response.status).toBe(200);
    expect(mockModerateContentReport).toHaveBeenCalledWith({
      reportId: 'report-1',
      reviewerId: 'editor-1',
      action: 'restrict',
      decisionCode: 'hate_or_harassment',
      publicNote: 'The list contained targeted insults.',
      internalNote: 'Repeat offender; related report 42.',
    });
  });

  it('records a no-violation outcome when dismissing a report', async () => {
    const request = new NextRequest('http://localhost/api/admin/moderation/reports/report-1', {
      method: 'PATCH',
      body: JSON.stringify({
        action: 'dismiss',
        decisionCode: 'spam_or_misleading',
        publicNote: 'The list matches its description.',
      }),
    });

    await PATCH(request, context);

    expect(mockModerateContentReport).toHaveBeenCalledWith(expect.objectContaining({
      action: 'dismiss',
      decisionCode: 'no_violation',
      publicNote: 'The list matches its description.',
    }));
  });
});
