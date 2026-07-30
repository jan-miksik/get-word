import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { wordChatUsage } from "@/lib/db/schema";
import type { OpenRouterChatMeta } from "@/lib/openrouter-chat";
import {
  estimateCostUsd,
  estimateMaximumCostUsd,
  WORD_CHAT_MONTHLY_SPEND_LIMIT_USD,
} from "./config";
import { readTokenCount } from "./diagnostics";

export type WordChatCallType = "chat" | "proposal" | "translation" | "brief";
export type WordChatStage =
  | "started"
  | "proposal_completed"
  | "review_completed"
  | "committed";

const RESERVATION_MODEL_PREFIX = "__reserved__:";
const INPUT_TOKEN_OVERHEAD = 1_024;

export type WordChatSpendReservation = {
  id: string;
  model: string;
  reservedUsd: number;
  maxAttempts: number;
};

export class WordChatSpendLimitError extends Error {
  readonly code = "WORD_CHAT_MONTHLY_SPEND_LIMIT";

  constructor(
    readonly usedUsd: number,
    readonly limitUsd: number,
    readonly resetAt: Date,
  ) {
    super(
      `You've reached this month's $${limitUsd.toFixed(2)} Word Chat limit.`,
    );
    this.name = "WordChatSpendLimitError";
  }
}

function utcMonthWindow(date: Date) {
  return {
    start: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)),
    resetAt: new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1),
    ),
  };
}

export async function getMonthlyWordChatSpend(
  userId: string,
  date = new Date(),
): Promise<{ usedUsd: number; limitUsd: number; resetAt: Date }> {
  const { start, resetAt } = utcMonthWindow(date);
  const rows = await db.execute(sql`
    SELECT coalesce(sum(${wordChatUsage.estimatedCostUsd}), 0)::text AS used_usd
    FROM ${wordChatUsage}
    WHERE ${wordChatUsage.userId} = ${userId}
      AND ${wordChatUsage.createdAt} >= ${start.toISOString()}::timestamp
      AND ${wordChatUsage.createdAt} < ${resetAt.toISOString()}::timestamp
  `);
  const parsed = Number(rows[0]?.used_usd ?? 0);
  return {
    usedUsd: Number.isFinite(parsed) && parsed > 0 ? parsed : 0,
    limitUsd: WORD_CHAT_MONTHLY_SPEND_LIMIT_USD,
    resetAt,
  };
}

/**
 * Stop a new paid call once the account has consumed its monthly allowance.
 *
 * Provider usage is only known after a response, so the call that crosses the
 * threshold is recorded normally and subsequent calls are blocked. Word Chat's
 * UI serializes calls per session; this guard is the durable account-level
 * backstop shared by chat, proposals, translations, and brief regeneration.
 */
export async function assertWordChatSpendAvailable(
  userId: string,
  date = new Date(),
): Promise<void> {
  const spend = await getMonthlyWordChatSpend(userId, date);
  if (spend.usedUsd >= spend.limitUsd) {
    throw new WordChatSpendLimitError(
      spend.usedUsd,
      spend.limitUsd,
      spend.resetAt,
    );
  }
}

function reservationCostUsd(input: {
  model: string;
  request: unknown;
  maxOutputTokens: number;
  maxAttempts: number;
}) {
  const requestBytes = new TextEncoder().encode(JSON.stringify(input.request)).length;
  const inputTokenCeiling = requestBytes + INPUT_TOKEN_OVERHEAD;
  return estimateMaximumCostUsd(
    input.model,
    inputTokenCeiling * Math.max(1, input.maxAttempts),
    Math.max(0, input.maxOutputTokens) * Math.max(1, input.maxAttempts),
  );
}

/**
 * Atomically reserve the worst-case price of a paid model request.
 *
 * The advisory transaction lock serializes the read-and-insert pair per account
 * and UTC month. The reservation is stored in the usage table itself, so a
 * process crash or a response whose usage cannot be observed fails closed
 * instead of making the budget reusable. A successful response replaces the
 * reservation with its recorded aggregate usage.
 */
export async function reserveWordChatSpend(input: {
  userId: string;
  sessionId: string;
  callType: WordChatCallType;
  stage: WordChatStage;
  model: string;
  request: unknown;
  maxOutputTokens: number;
  maxAttempts: number;
  itemCount?: number;
  date?: Date;
}): Promise<WordChatSpendReservation> {
  const date = input.date ?? new Date();
  const { start, resetAt } = utcMonthWindow(date);
  const reservedUsd = reservationCostUsd(input);
  const lockKey = `word-chat-spend:${input.userId}:${start.toISOString()}`;

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);
    const rows = await tx.execute(sql`
      SELECT coalesce(sum(${wordChatUsage.estimatedCostUsd}), 0)::text AS used_usd
      FROM ${wordChatUsage}
      WHERE ${wordChatUsage.userId} = ${input.userId}
        AND ${wordChatUsage.createdAt} >= ${start.toISOString()}::timestamp
        AND ${wordChatUsage.createdAt} < ${resetAt.toISOString()}::timestamp
    `);
    const parsed = Number(rows[0]?.used_usd ?? 0);
    const usedUsd = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    if (
      usedUsd >= WORD_CHAT_MONTHLY_SPEND_LIMIT_USD ||
      usedUsd + reservedUsd > WORD_CHAT_MONTHLY_SPEND_LIMIT_USD
    ) {
      throw new WordChatSpendLimitError(
        usedUsd,
        WORD_CHAT_MONTHLY_SPEND_LIMIT_USD,
        resetAt,
      );
    }

    const [reservation] = await tx
      .insert(wordChatUsage)
      .values({
        userId: input.userId,
        sessionId: input.sessionId,
        callType: input.callType,
        stage: input.stage,
        model: `${RESERVATION_MODEL_PREFIX}${input.model}`,
        estimatedCostUsd: reservedUsd.toFixed(6),
        itemCount: input.itemCount ?? null,
      })
      .returning({ id: wordChatUsage.id });
    if (!reservation) {
      throw new Error("Could not reserve Word Chat spend.");
    }
    return {
      id: reservation.id,
      model: input.model,
      reservedUsd,
      maxAttempts: Math.max(1, input.maxAttempts),
    };
  });
}

export function aggregateWordChatUsage(metas: OpenRouterChatMeta[]): OpenRouterChatMeta {
  const observed = metas.filter(
    (meta) => meta.usage && typeof meta.usage === "object",
  );
  if (observed.length === 0) return {};
  return {
    usage: {
      prompt_tokens: observed.reduce(
        (total, meta) => total + readTokenCount(meta.usage, "prompt_tokens"),
        0,
      ),
      completion_tokens: observed.reduce(
        (total, meta) => total + readTokenCount(meta.usage, "completion_tokens"),
        0,
      ),
    },
  };
}

export async function runReservedWordChatCall<T>(
  input: Parameters<typeof reserveWordChatSpend>[0],
  run: (hooks: {
    onResponse: (meta: OpenRouterChatMeta) => void;
    onAttemptStart: () => void;
  }) => Promise<T>,
): Promise<{
  result: T;
  reservation: WordChatSpendReservation;
  meta: OpenRouterChatMeta;
  responseCount: number;
  usageObserved: boolean;
  minimumCostUsd: number;
}> {
  const reservation = await reserveWordChatSpend(input);
  const responses: OpenRouterChatMeta[] = [];
  const onResponse = (meta: OpenRouterChatMeta) => responses.push(meta);
  let attemptCount = 0;
  const onAttemptStart = () => {
    attemptCount += 1;
  };
  const minimumCostUsd = () => {
    const observedAttempts = responses.filter((meta) => meta.usage).length;
    const unknownAttempts = Math.max(0, attemptCount - observedAttempts);
    return (
      (reservation.reservedUsd * unknownAttempts) /
      reservation.maxAttempts
    );
  };
  try {
    const result = await run({ onResponse, onAttemptStart });
    const meta = aggregateWordChatUsage(responses);
    return {
      result,
      reservation,
      meta,
      responseCount: responses.length,
      usageObserved: Boolean(meta.usage),
      minimumCostUsd: minimumCostUsd(),
    };
  } catch (error) {
    const meta = aggregateWordChatUsage(responses);
    const minimum = minimumCostUsd();
    if (meta.usage || minimum > 0) {
      await recordWordChatUsage({
        userId: input.userId,
        sessionId: input.sessionId,
        callType: input.callType,
        stage: input.stage,
        model: input.model,
        meta,
        itemCount: input.itemCount,
        reservation,
        minimumCostUsd: minimum,
      });
    }
    throw error;
  }
}

/**
 * Record one model call's spend.
 *
 * Deliberately best-effort: a failed insert must never turn a working chat into
 * an error the learner sees. A missing usage row costs a data point; a thrown
 * one costs the session.
 *
 * Stores token counts and a price estimate only — never prompt or completion
 * text. `stage` is the funnel position at the time of the call, which is what
 * makes "cost of sessions people abandon" answerable.
 */
export async function recordWordChatUsage(input: {
  userId: string;
  sessionId: string;
  callType: WordChatCallType;
  stage: WordChatStage;
  model: string;
  meta?: OpenRouterChatMeta;
  itemCount?: number;
  reservation?: WordChatSpendReservation;
  minimumCostUsd?: number;
}): Promise<void> {
  try {
    const inputTokens = readTokenCount(input.meta?.usage, "prompt_tokens");
    const outputTokens = readTokenCount(input.meta?.usage, "completion_tokens");
    if (
      input.reservation &&
      !input.meta?.usage &&
      !(input.minimumCostUsd && input.minimumCostUsd > 0)
    ) {
      return;
    }
    const actualCostUsd = estimateCostUsd(
      input.model,
      inputTokens,
      outputTokens,
    );
    const values = {
      sessionId: input.sessionId,
      callType: input.callType,
      stage: input.stage,
      model: input.model,
      inputTokens,
      outputTokens,
      estimatedCostUsd: Math.max(
        actualCostUsd,
        input.minimumCostUsd ?? 0,
      ).toFixed(6),
      itemCount: input.itemCount ?? null,
    };
    if (input.reservation) {
      await db
        .update(wordChatUsage)
        .set(values)
        .where(
          and(
            eq(wordChatUsage.id, input.reservation.id),
            eq(wordChatUsage.userId, input.userId),
          ),
        );
      return;
    }
    await db.insert(wordChatUsage).values({
      userId: input.userId,
      ...values,
    });
  } catch (err) {
    console.warn("[word-chat] failed to record usage", {
      callType: input.callType,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
