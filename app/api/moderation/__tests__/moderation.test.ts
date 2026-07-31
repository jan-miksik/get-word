import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockResolveUserFromRequest = vi.fn();
const mockGetListById = vi.fn();
const mockGetListCategories = vi.fn();
const mockGetListItems = vi.fn();
const mockCountRecentReportsByUser = vi.fn();
const mockCreateContentReport = vi.fn();
const mockBlockListOwner = vi.fn();
const mockGetBlocksCreatedByUser = vi.fn();
const mockGetReportsByReporter = vi.fn();

vi.mock('@/lib/auth', () => ({
  resolveUserFromRequest: (...args: unknown[]) => mockResolveUserFromRequest(...args),
  unauthorizedResponse: () => Response.json({ error: 'Authentication required' }, { status: 401 }),
}));

vi.mock('@/lib/db', () => ({
  getListById: (...args: unknown[]) => mockGetListById(...args),
  getListCategories: (...args: unknown[]) => mockGetListCategories(...args),
  getListItems: (...args: unknown[]) => mockGetListItems(...args),
  countRecentReportsByUser: (...args: unknown[]) => mockCountRecentReportsByUser(...args),
  createContentReport: (...args: unknown[]) => mockCreateContentReport(...args),
  blockListOwner: (...args: unknown[]) => mockBlockListOwner(...args),
  getBlocksCreatedByUser: (...args: unknown[]) => mockGetBlocksCreatedByUser(...args),
  getReportsByReporter: (...args: unknown[]) => mockGetReportsByReporter(...args),
}));

vi.mock('@/features/admin/server/userHandle', () => ({
  userHandle: (id: string) => `user-${id}`,
}));

import { GET as getOwnReports, POST as reportContent } from '../reports/route';
import { GET as getBlocks, POST as blockAuthor } from '../blocks/route';

const user = { id: 'reporter-1', deviceId: 'device-1', userRole: 'user' };
const publicList = {
  id: 'list-1',
  ownerId: 'owner-1',
  name: 'Public list',
  description: 'Description',
  isPublic: true,
  isCommon: false,
  isRecommended: false,
};

describe('public content moderation API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveUserFromRequest.mockResolvedValue(user);
    mockGetListById.mockResolvedValue(publicList);
    mockGetListCategories.mockResolvedValue([{ id: 'category-1', name: 'Basics' }]);
    mockGetListItems.mockResolvedValue([
      { categoryId: 'category-1', textKnown: 'hello', textTarget: 'ahoj' },
    ]);
    mockCountRecentReportsByUser.mockResolvedValue(0);
    mockCreateContentReport.mockResolvedValue({
      report: { id: 'report-1' },
      duplicate: false,
      blocked: true,
    });
  });

  it('captures a report snapshot, hides an ordinary public list, and can block its author', async () => {
    const request = new NextRequest('http://localhost/api/moderation/reports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        listId: publicList.id,
        reason: 'hate_or_harassment',
        details: 'Abusive content',
        blockAuthor: true,
      }),
    });

    const response = await reportContent(request);

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      reportId: 'report-1',
      blocked: true,
      hiddenPendingReview: true,
    });
    expect(mockCreateContentReport).toHaveBeenCalledWith(expect.objectContaining({
      reporterId: user.id,
      reportedOwnerId: publicList.ownerId,
      autoHide: true,
      blockAuthor: true,
      contentExcerpt: '[Basics] hello → ahoj',
    }));
  });

  it('does not allow users to report their own list', async () => {
    mockGetListById.mockResolvedValue({ ...publicList, ownerId: user.id });
    const request = new NextRequest('http://localhost/api/moderation/reports', {
      method: 'POST',
      body: JSON.stringify({ listId: publicList.id, reason: 'other' }),
    });

    const response = await reportContent(request);

    expect(response.status).toBe(400);
    expect(mockCreateContentReport).not.toHaveBeenCalled();
  });

  it('returns a user-visible outcome for the reporter without internal notes', async () => {
    mockGetReportsByReporter.mockResolvedValue([{
      id: 'report-1',
      listNameSnapshot: 'Public list',
      reason: 'spam_or_misleading',
      details: 'Misleading title',
      status: 'dismissed',
      decisionCode: 'no_violation',
      publicNote: 'The title accurately describes the list.',
      createdAt: new Date('2026-07-31T10:00:00Z'),
      resolvedAt: new Date('2026-07-31T12:00:00Z'),
      moderatorNote: 'must never be returned',
    }]);

    const response = await getOwnReports(new NextRequest('http://localhost/api/moderation/reports'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockGetReportsByReporter).toHaveBeenCalledWith(user.id);
    expect(body.reports[0]).toEqual({
      id: 'report-1',
      listName: 'Public list',
      reason: 'spam_or_misleading',
      details: 'Misleading title',
      status: 'dismissed',
      decisionCode: 'no_violation',
      publicNote: 'The title accurately describes the list.',
      createdAt: '2026-07-31T10:00:00.000Z',
      resolvedAt: '2026-07-31T12:00:00.000Z',
    });
    expect(JSON.stringify(body)).not.toContain('must never be returned');
  });

  it('rate-limits repeated reports', async () => {
    mockCountRecentReportsByUser.mockResolvedValue(25);
    const request = new NextRequest('http://localhost/api/moderation/reports', {
      method: 'POST',
      body: JSON.stringify({ listId: publicList.id, reason: 'spam_or_misleading' }),
    });

    const response = await reportContent(request);

    expect(response.status).toBe(429);
    expect(mockCreateContentReport).not.toHaveBeenCalled();
  });

  it('blocks a list author and returns the current block list', async () => {
    mockBlockListOwner.mockResolvedValue({ id: 'block-1', created: true });
    const postRequest = new NextRequest('http://localhost/api/moderation/blocks', {
      method: 'POST',
      body: JSON.stringify({ listId: publicList.id }),
    });

    const postResponse = await blockAuthor(postRequest);
    expect(postResponse.status).toBe(201);
    expect(mockBlockListOwner).toHaveBeenCalledWith(user.id, publicList.id);

    mockGetBlocksCreatedByUser.mockResolvedValue([
      { id: 'block-1', blockedUserId: 'owner-1', createdAt: new Date('2026-07-31T00:00:00Z') },
    ]);
    const getResponse = await getBlocks(new NextRequest('http://localhost/api/moderation/blocks'));
    expect(await getResponse.json()).toEqual({
      blocks: [{ id: 'block-1', handle: 'user-owner-1', createdAt: '2026-07-31T00:00:00.000Z' }],
    });
  });
});
