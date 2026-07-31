import { NextRequest, NextResponse } from 'next/server';
import {
  countRecentReportsByUser,
  createContentReport,
  getListById,
  getListCategories,
  getListItems,
  getReportsByReporter,
} from '@/lib/db';
import { resolveUserFromRequest, unauthorizedResponse } from '@/lib/auth';
import { isContentReportReason } from '@/features/moderation/types';

const MAX_DETAILS_LENGTH = 1000;
const MAX_EXCERPT_LENGTH = 8000;
const MAX_REPORTS_PER_DAY = 25;

export async function GET(request: NextRequest) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();
  const rows = await getReportsByReporter(user.id);
  return NextResponse.json({
    reports: rows.map((report) => ({
      id: report.id,
      listName: report.listNameSnapshot,
      reason: report.reason,
      details: report.details,
      status: report.status,
      decisionCode: report.decisionCode,
      publicNote: report.publicNote,
      createdAt: report.createdAt.toISOString(),
      resolvedAt: report.resolvedAt?.toISOString() ?? null,
    })),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

function buildContentExcerpt(
  categories: Awaited<ReturnType<typeof getListCategories>>,
  items: Awaited<ReturnType<typeof getListItems>>,
): string | null {
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const lines = items.slice(0, 100).map((item) => {
    const category = item.categoryId ? categoryNames.get(item.categoryId) : null;
    const translation = item.textTarget ? ` → ${item.textTarget}` : '';
    return `${category ? `[${category}] ` : ''}${item.textKnown}${translation}`;
  });
  if (items.length > lines.length) lines.push(`… ${items.length - lines.length} more items`);
  const excerpt = lines.join('\n').trim();
  return excerpt ? excerpt.slice(0, MAX_EXCERPT_LENGTH) : null;
}

export async function POST(request: NextRequest) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const body = await request.json().catch(() => null) as {
    listId?: unknown;
    reason?: unknown;
    details?: unknown;
    blockAuthor?: unknown;
  } | null;
  const listId = typeof body?.listId === 'string' ? body.listId.trim() : '';
  if (!listId || !isContentReportReason(body?.reason)) {
    return NextResponse.json({ error: 'A valid list and reason are required' }, { status: 400 });
  }
  const details = typeof body?.details === 'string' ? body.details.trim() : '';
  if (details.length > MAX_DETAILS_LENGTH) {
    return NextResponse.json({ error: 'Report details are too long' }, { status: 400 });
  }

  const list = await getListById(listId);
  if (!list || !list.isPublic) {
    return NextResponse.json({ error: 'Public list not found' }, { status: 404 });
  }
  if (list.ownerId === user.id) {
    return NextResponse.json({ error: 'You cannot report your own list' }, { status: 400 });
  }

  const recentReports = await countRecentReportsByUser(
    user.id,
    new Date(Date.now() - 24 * 60 * 60 * 1000),
  );
  if (recentReports >= MAX_REPORTS_PER_DAY) {
    return NextResponse.json({ error: 'Report limit reached. Please try again later.' }, { status: 429 });
  }

  const [categories, items] = await Promise.all([
    getListCategories(list.id),
    getListItems(list.id),
  ]);
  const canBlockAuthor = Boolean(list.ownerId && !list.isCommon && !list.isRecommended);
  const result = await createContentReport({
    reporterId: user.id,
    listId: list.id,
    reportedOwnerId: list.ownerId,
    reason: body.reason,
    details: details || null,
    listNameSnapshot: list.name,
    listDescriptionSnapshot: list.description,
    contentExcerpt: buildContentExcerpt(categories, items),
    autoHide: !list.isCommon && !list.isRecommended,
    blockAuthor: body.blockAuthor === true && canBlockAuthor,
  });

  return NextResponse.json(
    {
      reportId: result.report.id,
      duplicate: result.duplicate,
      blocked: result.blocked,
      hiddenPendingReview: !list.isCommon && !list.isRecommended,
    },
    { status: result.duplicate ? 200 : 201 },
  );
}
