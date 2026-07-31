import { and, count, desc, eq, gte, inArray, ne, or } from 'drizzle-orm';
import { db } from '../client';
import type { Executor } from './executor';
import {
  contentReports,
  userBlocks,
  userListSubscriptions,
  wordLists,
  type ContentReport,
} from '../schema';
import type {
  ModerationDecisionCode,
  ContentReportReason,
  ContentReportStatus,
} from '@/features/moderation/types';

const OPEN_REPORT_STATUSES = ['pending', 'reviewing'] as const;

export async function isBlockedBetweenUsers(
  firstUserId: string,
  secondUserId: string | null,
  executor: Executor = db,
): Promise<boolean> {
  if (!secondUserId || firstUserId === secondUserId) return false;
  const [row] = await executor
    .select({ id: userBlocks.id })
    .from(userBlocks)
    .where(
      or(
        and(eq(userBlocks.blockerId, firstUserId), eq(userBlocks.blockedId, secondUserId)),
        and(eq(userBlocks.blockerId, secondUserId), eq(userBlocks.blockedId, firstUserId)),
      ),
    )
    .limit(1);
  return Boolean(row);
}

async function removeCrossUserSubscriptions(
  firstUserId: string,
  secondUserId: string,
  executor: Executor,
): Promise<void> {
  const firstUserLists = executor
    .select({ id: wordLists.id })
    .from(wordLists)
    .where(eq(wordLists.ownerId, firstUserId));
  const secondUserLists = executor
    .select({ id: wordLists.id })
    .from(wordLists)
    .where(eq(wordLists.ownerId, secondUserId));

  await executor.delete(userListSubscriptions).where(
    or(
      and(
        eq(userListSubscriptions.userId, firstUserId),
        inArray(userListSubscriptions.listId, secondUserLists),
      ),
      and(
        eq(userListSubscriptions.userId, secondUserId),
        inArray(userListSubscriptions.listId, firstUserLists),
      ),
    ),
  );
}

async function blockUser(
  blockerId: string,
  blockedId: string,
  executor: Executor = db,
): Promise<{ id: string; created: boolean }> {
  if (blockerId === blockedId) throw new Error('Cannot block your own account');

  const [created] = await executor
    .insert(userBlocks)
    .values({ blockerId, blockedId })
    .onConflictDoNothing()
    .returning({ id: userBlocks.id });

  await removeCrossUserSubscriptions(blockerId, blockedId, executor);

  if (created) return { id: created.id, created: true };
  const [existing] = await executor
    .select({ id: userBlocks.id })
    .from(userBlocks)
    .where(and(eq(userBlocks.blockerId, blockerId), eq(userBlocks.blockedId, blockedId)))
    .limit(1);
  if (!existing) throw new Error('Failed to create block');
  return { id: existing.id, created: false };
}

export async function blockListOwner(
  blockerId: string,
  listId: string,
): Promise<{ id: string; created: boolean; blockedUserId: string } | null> {
  const [list] = await db
    .select({
      ownerId: wordLists.ownerId,
      isCommon: wordLists.isCommon,
      isRecommended: wordLists.isRecommended,
    })
    .from(wordLists)
    .where(eq(wordLists.id, listId))
    .limit(1);
  if (!list?.ownerId || list.ownerId === blockerId || list.isCommon || list.isRecommended) return null;
  const result = await db.transaction((tx) => blockUser(blockerId, list.ownerId!, tx));
  return { ...result, blockedUserId: list.ownerId };
}

export async function getBlocksCreatedByUser(userId: string) {
  return db
    .select({ id: userBlocks.id, blockedUserId: userBlocks.blockedId, createdAt: userBlocks.createdAt })
    .from(userBlocks)
    .where(eq(userBlocks.blockerId, userId))
    .orderBy(desc(userBlocks.createdAt));
}

export async function removeUserBlock(userId: string, blockId: string): Promise<boolean> {
  const deleted = await db
    .delete(userBlocks)
    .where(and(eq(userBlocks.id, blockId), eq(userBlocks.blockerId, userId)))
    .returning({ id: userBlocks.id });
  return deleted.length > 0;
}

export async function createContentReport(input: {
  reporterId: string;
  listId: string;
  reportedOwnerId: string | null;
  reason: ContentReportReason;
  details: string | null;
  listNameSnapshot: string;
  listDescriptionSnapshot: string | null;
  contentExcerpt: string | null;
  autoHide: boolean;
  blockAuthor: boolean;
}): Promise<{ report: ContentReport; duplicate: boolean; blocked: boolean }> {
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(contentReports)
      .values({
        reporterId: input.reporterId,
        listId: input.listId,
        reportedOwnerId: input.reportedOwnerId,
        reason: input.reason,
        details: input.details,
        listNameSnapshot: input.listNameSnapshot,
        listDescriptionSnapshot: input.listDescriptionSnapshot,
        contentExcerpt: input.contentExcerpt,
      })
      .onConflictDoNothing()
      .returning();

    let report = created;
    if (!report) {
      [report] = await tx
        .select()
        .from(contentReports)
        .where(
          and(
            eq(contentReports.reporterId, input.reporterId),
            eq(contentReports.listId, input.listId),
            inArray(contentReports.status, [...OPEN_REPORT_STATUSES]),
          ),
        )
        .limit(1);
    }
    if (!report) throw new Error('Failed to create report');

    if (created && input.autoHide) {
      await tx
        .update(wordLists)
        .set({
          moderationStatus: 'under_review',
          moderationUpdatedAt: new Date(),
          moderationDecisionCode: null,
          moderationPublicNote: null,
          moderationNote: null,
          updatedAt: new Date(),
        })
        .where(and(eq(wordLists.id, input.listId), eq(wordLists.moderationStatus, 'visible')));
    }

    let blocked = false;
    if (
      input.blockAuthor &&
      input.reportedOwnerId &&
      input.reportedOwnerId !== input.reporterId
    ) {
      await blockUser(input.reporterId, input.reportedOwnerId, tx);
      blocked = true;
    }

    return { report, duplicate: !created, blocked };
  });
}

export async function countRecentReportsByUser(userId: string, since: Date): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(contentReports)
    .where(and(eq(contentReports.reporterId, userId), gte(contentReports.createdAt, since)));
  return Number(row?.value ?? 0);
}

export async function getModerationReports(status: ContentReportStatus | 'all' = 'pending') {
  const query = db
    .select({
      report: contentReports,
      currentListName: wordLists.name,
      currentListDescription: wordLists.description,
    })
    .from(contentReports)
    .leftJoin(wordLists, eq(contentReports.listId, wordLists.id))
    .orderBy(desc(contentReports.createdAt));
  return status === 'all' ? query : query.where(eq(contentReports.status, status));
}

export async function getReportsByReporter(userId: string) {
  return db
    .select({
      id: contentReports.id,
      listNameSnapshot: contentReports.listNameSnapshot,
      reason: contentReports.reason,
      details: contentReports.details,
      status: contentReports.status,
      decisionCode: contentReports.decisionCode,
      publicNote: contentReports.publicNote,
      createdAt: contentReports.createdAt,
      resolvedAt: contentReports.resolvedAt,
    })
    .from(contentReports)
    .where(eq(contentReports.reporterId, userId))
    .orderBy(desc(contentReports.createdAt));
}

export async function moderateContentReport(input: {
  reportId: string;
  reviewerId: string;
  action: 'dismiss' | 'restrict';
  decisionCode: ModerationDecisionCode;
  publicNote: string | null;
  internalNote: string | null;
}): Promise<ContentReport | null> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(contentReports)
      .where(eq(contentReports.id, input.reportId))
      .limit(1)
      .for('update');
    if (!current) return null;

    const now = new Date();
    if (input.action === 'restrict') {
      if (current.listId) {
        await tx
          .update(wordLists)
          .set({
            isPublic: false,
            moderationStatus: 'rejected',
            moderationUpdatedAt: now,
            moderationDecisionCode: input.decisionCode,
            moderationPublicNote: input.publicNote,
            moderationNote: input.internalNote,
            updatedAt: now,
          })
          .where(eq(wordLists.id, current.listId));
      }
      // The reported list may have been deleted after the report was created,
      // which clears list_id through ON DELETE SET NULL. The moderation record
      // must still reach a terminal state instead of remaining pending forever.
      await tx
        .update(contentReports)
        .set({
          status: 'resolved',
          decisionCode: input.decisionCode,
          publicNote: input.publicNote,
          moderatorNote: input.internalNote,
          reviewedBy: input.reviewerId,
          resolvedAt: now,
          updatedAt: now,
        })
        .where(
          current.listId
            ? and(
                eq(contentReports.listId, current.listId),
                inArray(contentReports.status, [...OPEN_REPORT_STATUSES]),
              )
            : eq(contentReports.id, input.reportId),
        );
    } else {
      await tx
        .update(contentReports)
        .set({
          status: 'dismissed',
          decisionCode: 'no_violation',
          publicNote: input.publicNote,
          moderatorNote: input.internalNote,
          reviewedBy: input.reviewerId,
          resolvedAt: now,
          updatedAt: now,
        })
        .where(eq(contentReports.id, input.reportId));

      if (current.listId) {
        const [anotherOpen] = await tx
          .select({ id: contentReports.id })
          .from(contentReports)
          .where(
            and(
              eq(contentReports.listId, current.listId),
              ne(contentReports.id, input.reportId),
              inArray(contentReports.status, [...OPEN_REPORT_STATUSES]),
            ),
          )
          .limit(1);
        if (!anotherOpen) {
          await tx
            .update(wordLists)
            .set({
              moderationStatus: 'visible',
              moderationUpdatedAt: now,
              moderationDecisionCode: null,
              moderationPublicNote: null,
              moderationNote: input.internalNote,
              updatedAt: now,
            })
            .where(
              and(
                eq(wordLists.id, current.listId),
                eq(wordLists.moderationStatus, 'under_review'),
              ),
            );
        }
      }
    }

    const [updated] = await tx
      .select()
      .from(contentReports)
      .where(eq(contentReports.id, input.reportId))
      .limit(1);
    return updated ?? null;
  });
}
