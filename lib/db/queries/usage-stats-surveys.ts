import { sql, type SQL } from "drizzle-orm";

import type {
  SurveyFreeTextRow,
  SurveyResponseSummary,
  UsageStats,
} from "@/features/admin/types";
import { numberFromRow } from "./stats-shared";

/** The option id the dismissal bucket is filed under; no survey config uses it. */
const DISMISSED_BUCKET = "dismissed";

function toIso(value: unknown): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * The mini-survey panel of the admin dashboard: one breakdown row per
 * (survey, option) plus every free-text comment.
 *
 * Its own module rather than two more blocks inside `getUsageStats`, whose
 * queries and row-mapping sit hundreds of lines apart — a panel that reads as
 * one thing is easier to follow, and the page was already at its AI-context
 * budget.
 *
 * Every dependency is passed in rather than imported, so this stays inside the
 * `lib/**` boundary (shared foundations may not reach into feature server
 * internals, and `userHandle` is one). `runQuery` is the caller's
 * `executeOrEmpty`, so a survey table not yet migrated in this environment
 * costs an empty panel rather than a dead dashboard; `userScope` is the
 * caller's exclusion condition, so the counts mean the same population as
 * every other panel.
 */
export async function readSurveyStats({
  runQuery,
  userScope,
  toHandle,
}: {
  runQuery: (query: SQL, context: string) => Promise<Record<string, unknown>[]>;
  userScope: SQL;
  toHandle: (userId: string) => string;
}): Promise<UsageStats["surveys"]> {
  // Dismissals are counted, as their own bucket, rather than filtered out — a
  // survey with many dismissals and few real answers is itself a result.
  const [breakdownRows, freeTextRows] = await Promise.all([
    runQuery(
      sql`
      SELECT sr.survey_id AS survey_id,
             (CASE WHEN sr.dismissed THEN ${DISMISSED_BUCKET} ELSE sr.choice END) AS option_id,
             count(*)::int AS responses
      FROM survey_responses sr
      JOIN users u ON u.id = sr.user_id
      WHERE ${userScope}
      GROUP BY sr.survey_id, option_id
      ORDER BY sr.survey_id, count(*) DESC
    `,
      "survey_responses",
    ),
    runQuery(
      sql`
      SELECT u.id::text AS id, u.email AS email,
             sr.survey_id AS survey_id, sr.choice AS choice,
             sr.free_text AS free_text, sr.updated_at AS updated_at
      FROM survey_responses sr
      JOIN users u ON u.id = sr.user_id
      WHERE ${userScope}
        AND sr.free_text IS NOT NULL AND sr.free_text <> ''
      ORDER BY sr.updated_at DESC
    `,
      "survey_responses_free_text",
    ),
  ]);

  const summariesBySurveyId = new Map<string, SurveyResponseSummary>();
  for (const row of breakdownRows) {
    const surveyId = String(row.survey_id ?? "");
    if (!surveyId) continue;
    const optionId = String(row.option_id ?? "");
    const responses = numberFromRow(row, "responses");
    let summary = summariesBySurveyId.get(surveyId);
    if (!summary) {
      summary = { surveyId, totalAnswered: 0, totalDismissed: 0, options: [] };
      summariesBySurveyId.set(surveyId, summary);
    }
    if (optionId === DISMISSED_BUCKET) {
      summary.totalDismissed += responses;
    } else {
      summary.options.push({ optionId, responses });
      summary.totalAnswered += responses;
    }
  }

  const freeTextResponses: SurveyFreeTextRow[] = freeTextRows.map((row) => ({
    handle: toHandle(String(row.id ?? "")),
    email: row.email == null ? null : String(row.email),
    surveyId: String(row.survey_id ?? ""),
    optionId: String(row.choice ?? ""),
    freeText: String(row.free_text ?? ""),
    respondedAt: toIso(row.updated_at) ?? "",
  }));

  return {
    summaries: Array.from(summariesBySurveyId.values()).sort((a, b) =>
      a.surveyId.localeCompare(b.surveyId),
    ),
    freeTextResponses,
  };
}
