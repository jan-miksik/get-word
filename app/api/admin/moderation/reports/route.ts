import { NextRequest, NextResponse } from 'next/server';
import { getModerationReports } from '@/lib/db';
import {
  forbiddenResponse,
  isEditor,
  resolveAuthenticatedUser,
  unauthorizedResponse,
} from '@/lib/auth';
import type { ContentReportStatus, ModerationReportRow } from '@/features/moderation/types';
import { userHandle } from '@/features/admin/server/userHandle';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;
const ALLOWED_STATUSES: Array<ContentReportStatus | 'all'> = [
  'pending',
  'reviewing',
  'resolved',
  'dismissed',
  'all',
];

export async function GET(request: NextRequest) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) return unauthorizedResponse();
  if (!isEditor(user)) return forbiddenResponse();

  const requested = request.nextUrl.searchParams.get('status') ?? 'pending';
  const status = ALLOWED_STATUSES.includes(requested as ContentReportStatus | 'all')
    ? requested as ContentReportStatus | 'all'
    : 'pending';
  const rows = await getModerationReports(status);
  const reports: ModerationReportRow[] = rows.map(({ report, currentListName, currentListDescription }) => ({
    id: report.id,
    listId: report.listId,
    currentListName,
    currentListDescription,
    listNameSnapshot: report.listNameSnapshot,
    listDescriptionSnapshot: report.listDescriptionSnapshot,
    contentExcerpt: report.contentExcerpt,
    ownerHandle: report.reportedOwnerId ? userHandle(report.reportedOwnerId) : null,
    reason: report.reason as ModerationReportRow['reason'],
    details: report.details,
    status: report.status as ModerationReportRow['status'],
    decisionCode: report.decisionCode as ModerationReportRow['decisionCode'],
    publicNote: report.publicNote,
    moderatorNote: report.moderatorNote,
    createdAt: report.createdAt.toISOString(),
    resolvedAt: report.resolvedAt?.toISOString() ?? null,
  }));
  return NextResponse.json({ reports }, { headers: NO_STORE });
}
