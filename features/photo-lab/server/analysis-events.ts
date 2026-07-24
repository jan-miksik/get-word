import { db } from "@/lib/db/client";
import { photoAnalysisEvents } from "@/lib/db/schema";

/**
 * When photo-analysis event logging went live. The admin dashboard reports this
 * as the point measurement started, so `photoAnalyses: 0` reads as "not used
 * since tracking began", not "never used". A fixed constant — never MIN(events),
 * which would drift forward as old rows are removed by account deletion.
 */
export const PHOTO_ANALYSIS_TRACKING_STARTED_AT = "2026-07-24T00:00:00Z";

/**
 * Record one successfully returned photo analysis. Behaviour only: the label
 * count, never the image or the produced vocabulary text.
 *
 * Best-effort — a logging failure must never fail the analysis the user already
 * received, so callers should not await this in a way that can reject the
 * request. It swallows its own errors for that reason.
 */
export async function recordPhotoAnalysisEvent(params: {
  userId: string;
  labelCount: number;
  languageFrom: string;
  languageTo: string;
}): Promise<void> {
  try {
    await db.insert(photoAnalysisEvents).values({
      userId: params.userId,
      labelCount: Math.max(0, Math.trunc(params.labelCount)),
      languageFrom: params.languageFrom,
      languageTo: params.languageTo,
    });
  } catch (err) {
    console.error("[photo-lab] failed to record analysis event", err);
  }
}
