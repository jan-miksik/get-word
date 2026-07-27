import {
  getDailyBucketUsage,
  reserveDailyBuckets,
} from "@/lib/rate-limit/daily-bucket";
import type { Executor } from "@/lib/db/queries/executor";
import {
  EDITOR_MONTHLY_ITEM_LIMIT,
  EDITOR_SESSIONS_PER_DAY,
  GLOBAL_CHAT_TURNS_PER_DAY,
  MAX_MESSAGES_PER_SESSION,
  MONTHLY_ITEM_LIMIT,
  SESSIONS_PER_DAY,
} from "./config";

const PREFIX = "word_chat";

export type WordChatRole = "user" | "editor";

function monthlyItemLimitForRole(role: WordChatRole): number {
  return role === "editor" ? EDITOR_MONTHLY_ITEM_LIMIT : MONTHLY_ITEM_LIMIT;
}

function sessionsPerDayForRole(role: WordChatRole): number {
  return role === "editor" ? EDITOR_SESSIONS_PER_DAY : SESSIONS_PER_DAY;
}

const monthlyItemsKey = (userId: string) => `${PREFIX}:items:user:${userId}`;
const sessionTurnsKey = (sessionId: string) => `${PREFIX}:turns:session:${sessionId}`;
const dailySessionsKey = (userId: string) => `${PREFIX}:sessions:user:${userId}`;
const globalTurnsKey = () => `${PREFIX}:turns:global`;

/**
 * Reserve one chat turn.
 *
 * Three buckets, deliberately in this order: the per-session cap stops one
 * runaway conversation, the per-user daily cap stops repeated conversations, and
 * the global cap protects the donated key from everyone at once.
 * `reserveDailyBuckets` runs them in one transaction, so hitting a later bucket
 * rolls back the earlier increments rather than silently burning allowance.
 */
export async function reserveChatTurn(input: {
  userId: string;
  sessionId: string;
  role: WordChatRole;
}): Promise<void> {
  await reserveDailyBuckets([
    {
      key: sessionTurnsKey(input.sessionId),
      limit: MAX_MESSAGES_PER_SESSION,
      message: "This conversation has reached its message limit. Continue to the word suggestions.",
    },
    {
      key: dailySessionsKey(input.userId),
      // A session costs one slot per turn against a daily allowance sized in
      // sessions: a normal session is a handful of turns, so this doubles as
      // "how many conversations a day" without a separate session table.
      limit: sessionsPerDayForRole(input.role) * MAX_MESSAGES_PER_SESSION,
      message: "You've used today's word-chat allowance. Please try again tomorrow.",
    },
    {
      key: globalTurnsKey(),
      limit: GLOBAL_CHAT_TURNS_PER_DAY,
      message: "The word chat is busy right now. Please try again later.",
    },
  ]);
}

/**
 * Reserve committed items against the learner's monthly budget.
 *
 * Called INSIDE the commit transaction (pass its executor), for the number of
 * items actually saved — proposing and reviewing are free, only keeping costs.
 * Sharing the transaction is what stops a crash from leaving a charged quota
 * with no items. Re-running a commit with an already-used `creationKey` must
 * skip this entirely (see commit.ts), or a retry charges twice.
 */
export async function reserveMonthlyItems(input: {
  userId: string;
  role: WordChatRole;
  count: number;
  executor?: Executor;
}): Promise<void> {
  if (input.count <= 0) return;
  const limit = monthlyItemLimitForRole(input.role);
  await reserveDailyBuckets(
    [
      {
        key: monthlyItemsKey(input.userId),
        limit,
        count: input.count,
        period: "month",
        message: `You've reached this month's limit of ${limit} new words.`,
      },
    ],
    input.executor,
  );
}

export async function getMonthlyItemUsage(input: {
  userId: string;
  role: WordChatRole;
}): Promise<{ used: number; limit: number; resetAt: Date }> {
  const { used, resetAt } = await getDailyBucketUsage(
    monthlyItemsKey(input.userId),
    "month",
  );
  return { used, limit: monthlyItemLimitForRole(input.role), resetAt };
}
