import { eq, and } from "drizzle-orm";
import { db } from "../client";
import { surveyResponses, type SurveyResponse } from "../schema";

export interface SurveyResponseValue {
  choice: string | null;
  freeText: string | null;
  dismissed: boolean;
}

function toValue(row: SurveyResponse): SurveyResponseValue {
  return { choice: row.choice, freeText: row.freeText, dismissed: row.dismissed };
}

/** Full snapshot of every survey a user has answered or dismissed. */
export async function getUserSurveyResponses(
  userId: string
): Promise<Record<string, SurveyResponseValue>> {
  const rows = await db
    .select()
    .from(surveyResponses)
    .where(eq(surveyResponses.userId, userId));

  const out: Record<string, SurveyResponseValue> = {};
  for (const row of rows) out[row.surveyId] = toValue(row);
  return out;
}

/**
 * Write-once: the first answer or dismissal for a (user, survey) pair is
 * terminal. `ON CONFLICT DO NOTHING` means a second write for the same pair
 * (e.g. an offline second device submitting after the first already did) is
 * silently ignored rather than overwriting the standing row. Either way, the
 * caller gets back the row that actually stands on the server — its own
 * write if it won the race, or the earlier one if it lost — so the client
 * can self-correct instead of assuming its own value took effect.
 */
export async function recordSurveyResponseIfAbsent(
  userId: string,
  surveyId: string,
  value: SurveyResponseValue
): Promise<SurveyResponseValue> {
  const inserted = await db
    .insert(surveyResponses)
    .values({
      userId,
      surveyId,
      choice: value.choice,
      freeText: value.freeText,
      dismissed: value.dismissed,
    })
    .onConflictDoNothing({
      target: [surveyResponses.userId, surveyResponses.surveyId],
    })
    .returning();

  if (inserted[0]) return toValue(inserted[0]);

  const existing = await db
    .select()
    .from(surveyResponses)
    .where(
      and(eq(surveyResponses.userId, userId), eq(surveyResponses.surveyId, surveyId))
    )
    .limit(1);
  // Only reachable if the conflicting row vanished between the insert and this
  // read (it can't — rows are never deleted), so this is defensive only.
  return existing[0] ? toValue(existing[0]) : value;
}
