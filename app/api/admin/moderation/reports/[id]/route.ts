import { NextRequest, NextResponse } from 'next/server';
import { moderateContentReport } from '@/lib/db';
import {
  forbiddenResponse,
  isEditor,
  resolveAuthenticatedUser,
  unauthorizedResponse,
} from '@/lib/auth';
import { isModerationViolationDecision } from '@/features/moderation/types';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) return unauthorizedResponse();
  if (!isEditor(user)) return forbiddenResponse();
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as {
    action?: unknown;
    decisionCode?: unknown;
    publicNote?: unknown;
    internalNote?: unknown;
    note?: unknown;
  } | null;
  if (body?.action !== 'dismiss' && body?.action !== 'restrict') {
    return NextResponse.json({ error: 'Invalid moderation action' }, { status: 400 });
  }
  if (body.action === 'restrict' && !isModerationViolationDecision(body.decisionCode)) {
    return NextResponse.json({ error: 'A public decision reason is required' }, { status: 400 });
  }
  const publicNote = typeof body.publicNote === 'string'
    ? body.publicNote.trim().slice(0, 1000)
    : '';
  const rawInternalNote = body.internalNote ?? body.note;
  const internalNote = typeof rawInternalNote === 'string'
    ? rawInternalNote.trim().slice(0, 1000)
    : '';
  const decisionCode = body.action === 'dismiss'
    ? 'no_violation' as const
    : body.decisionCode as Exclude<import('@/features/moderation/types').ModerationDecisionCode, 'no_violation'>;
  const report = await moderateContentReport({
    reportId: id,
    reviewerId: user.id,
    action: body.action,
    decisionCode,
    publicNote: publicNote || null,
    internalNote: internalNote || null,
  });
  if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  return NextResponse.json({ reportId: report.id, status: report.status });
}
