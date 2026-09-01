/**
 * Operator CLI that returns an account to the state every existing learner is
 * in on the day the goal release ships: onboarding finished, a list selected,
 * progress intact — and no study goal, no reminder answer, no day snapshots.
 *
 * Why this exists: `resolveLearningOnboardingStep` sends anyone without a
 * stored goal version to the `goal` step and then to `reminder`. Nobody on
 * production has either, so that two-step interstitial is what the whole user
 * base meets on first open. It is the highest-blast-radius behaviour in the
 * release and it can only be rehearsed by putting a real account back into the
 * "before" state and walking through it again.
 *
 * Deliberately NOT wired into `production-db.sh`. This is a staging tool: it
 * deletes a learner's goal history and day snapshots, which is destructive on
 * an account that has legitimately used the feature. The database host is
 * printed on every run so the target is never in doubt.
 *
 * Usage (staging database, from .env.local or an explicit DATABASE_URL):
 *   pnpm tsx scripts/reset-goal-onboarding.ts show --user <uuid|email>
 *   pnpm tsx scripts/reset-goal-onboarding.ts reset --user <uuid|email>
 *   pnpm tsx scripts/reset-goal-onboarding.ts reset --user <uuid|email> --apply
 *
 * Without `--apply` the reset only reports what it would remove.
 */

import * as dotenv from "dotenv";
import postgres from "postgres";

// Mirrors scripts/user-limits.ts: an inherited DATABASE_URL means someone else
// already picked the database, so `.env.local` must stay out of the way.
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: ".env.local" });
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set. Add it to .env.local or the environment.");
  process.exit(1);
}

const sql = postgres(connectionString, { max: 1 });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function argsMap(argv: string[]) {
  const out = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out.set(key, true);
    } else {
      out.set(key, next);
      i += 1;
    }
  }
  return out;
}

function required(args: Map<string, string | true>, key: string) {
  const value = args.get(key);
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing --${key}`);
  }
  return value.trim();
}

/** The host, so a mistaken production URL is visible before anything is written. */
function describeTarget(): string {
  try {
    const url = new URL(connectionString!);
    return `${url.host}${url.pathname}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

type UserRow = {
  id: string;
  email: string | null;
  onboarding_completed_at: Date | null;
  language_from: string | null;
  language_to: string | null;
  timezone: string | null;
  goal_revision: number;
  goal_intro_answered: boolean;
  goal_reminder_enabled: boolean;
  goal_reminder_local_minutes: number | null;
  goal_reminder_intro_answered: boolean;
  study_pacing_seeded_at: Date | null;
  learning_fine_tune: unknown | null;
};

const USER_COLUMNS = sql`
  id, email, onboarding_completed_at, language_from, language_to, timezone,
  goal_revision, goal_intro_answered, goal_reminder_enabled,
  goal_reminder_local_minutes, goal_reminder_intro_answered,
  study_pacing_seeded_at, learning_fine_tune
`;

/** Accepts a user id or an e-mail; refuses an ambiguous e-mail match. */
async function resolveUser(args: Map<string, string | true>): Promise<UserRow> {
  const identifier = required(args, "user");
  const rows = UUID_RE.test(identifier)
    ? await sql<UserRow[]>`SELECT ${USER_COLUMNS} FROM users WHERE id = ${identifier}`
    : await sql<UserRow[]>`SELECT ${USER_COLUMNS} FROM users WHERE lower(email) = lower(${identifier})`;
  if (rows.length === 0) throw new Error(`No user matches ${identifier}`);
  if (rows.length > 1) throw new Error(`${identifier} matches ${rows.length} users; pass the id`);
  return rows[0];
}

/**
 * Web-push tables arrive in migration 0066, so a database restored from a
 * production dump that predates it does not have them yet. Missing is the same
 * as empty here.
 */
async function tableExists(name: string): Promise<boolean> {
  const rows = await sql<{ exists: boolean }[]>`
    SELECT to_regclass(${`public.${name}`}) IS NOT NULL AS exists
  `;
  return rows[0]?.exists ?? false;
}

type Counts = {
  goalVersions: number;
  dayStats: number;
  pushSubscriptions: number | null;
  pushDeliveries: number | null;
};

async function countOwnedRows(userId: string): Promise<Counts> {
  const [goalVersions, dayStats] = await Promise.all([
    sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM user_study_goal_versions WHERE user_id = ${userId}
    `,
    sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM user_day_stats WHERE user_id = ${userId}
    `,
  ]);
  const hasSubscriptions = await tableExists("web_push_subscriptions");
  const hasDeliveries = await tableExists("web_push_reminder_deliveries");
  return {
    goalVersions: goalVersions[0].count,
    dayStats: dayStats[0].count,
    pushSubscriptions: hasSubscriptions
      ? (
          await sql<{ count: number }[]>`
            SELECT count(*)::int AS count FROM web_push_subscriptions WHERE user_id = ${userId}
          `
        )[0].count
      : null,
    pushDeliveries: hasDeliveries
      ? (
          await sql<{ count: number }[]>`
            SELECT count(*)::int AS count FROM web_push_reminder_deliveries WHERE user_id = ${userId}
          `
        )[0].count
      : null,
  };
}

function describeCount(value: number | null): string {
  return value === null ? "— (table absent)" : String(value);
}

/**
 * What the onboarding gate will decide on the next open, mirroring
 * `resolveLearningOnboardingStep`. Only the part this script can influence:
 * the language and level steps depend on the learner's lists, not on goals.
 */
function predictStep(user: UserRow, counts: Counts): string {
  if (!user.onboarding_completed_at || !user.language_from || !user.language_to) {
    return "language (account is not past the first step at all)";
  }
  if (counts.goalVersions === 0) return "goal → reminder → app";
  if (!user.goal_reminder_intro_answered) return "reminder → app";
  return "app (no interstitial)";
}

async function show(args: Map<string, string | true>) {
  const user = await resolveUser(args);
  const counts = await countOwnedRows(user.id);

  console.log(`[db]   ${describeTarget()}`);
  console.log(`[user] ${user.id}`);
  console.log(`  email:                  ${user.email ?? "—"}`);
  console.log(`  onboarding completed:   ${user.onboarding_completed_at?.toISOString() ?? "—"}`);
  console.log(`  language pair:          ${user.language_from ?? "—"} → ${user.language_to ?? "—"}`);
  console.log(`  timezone:               ${user.timezone ?? "—"}`);
  console.log(`  goal revision:          ${user.goal_revision}`);
  console.log(`  goal intro answered:    ${user.goal_intro_answered}`);
  console.log(`  reminder enabled:       ${user.goal_reminder_enabled}`);
  console.log(`  reminder local minutes: ${user.goal_reminder_local_minutes ?? "—"}`);
  console.log(`  reminder intro answered: ${user.goal_reminder_intro_answered}`);
  console.log(`  pacing seeded at:       ${user.study_pacing_seeded_at?.toISOString() ?? "—"}`);
  console.log(`  learning fine tune:     ${user.learning_fine_tune === null ? "—" : "set"}`);
  console.log(`  goal versions:          ${counts.goalVersions}`);
  console.log(`  day stats:              ${counts.dayStats}`);
  console.log(`  web push subscriptions: ${describeCount(counts.pushSubscriptions)}`);
  console.log(`  web push deliveries:    ${describeCount(counts.pushDeliveries)}`);
  console.log(`  next open lands on:     ${predictStep(user, counts)}`);
}

async function reset(args: Map<string, string | true>) {
  const user = await resolveUser(args);
  const counts = await countOwnedRows(user.id);
  const apply = args.get("apply") === true;

  console.log(`[db]   ${describeTarget()}`);
  console.log(`[user] ${user.id} ${user.email ?? "(no e-mail)"}`);
  console.log(`  delete user_study_goal_versions:   ${counts.goalVersions}`);
  console.log(`  delete user_day_stats:             ${counts.dayStats}`);
  console.log(`  delete web_push_subscriptions:     ${describeCount(counts.pushSubscriptions)}`);
  console.log(`  delete web_push_reminder_deliveries: ${describeCount(counts.pushDeliveries)}`);
  console.log("  reset users: goal_revision→0, goal_intro_answered→false,");
  console.log("               goal_reminder_enabled→true, goal_reminder_local_minutes→NULL,");
  console.log("               goal_reminder_intro_answered→false, study_pacing_seeded_at→NULL,");
  console.log("               learning_fine_tune→NULL, timezone→NULL");
  console.log("  keep: progress, review events, lists, subscriptions, activity segments");

  if (!apply) {
    console.log("\n[dry run] nothing written. Re-run with --apply.");
    return;
  }

  // One transaction: a half-reset account is a worse test subject than either
  // end state, because the gate would read a goal that no longer has snapshots.
  await sql.begin(async (transaction) => {
    // postgres.js declares `TransactionSql` as `Omit<Sql, …>`, and Omit drops a
    // call signature — so the handle type-checks as non-callable even though it
    // is the same tagged-template function. Narrow it back.
    const tx = transaction as unknown as typeof sql;
    await tx`DELETE FROM user_study_goal_versions WHERE user_id = ${user.id}`;
    await tx`DELETE FROM user_day_stats WHERE user_id = ${user.id}`;
    if (counts.pushDeliveries !== null) {
      // Before the subscriptions: the delivery row survives its subscription
      // being removed (ON DELETE SET NULL), so it would otherwise be orphaned
      // and keep deduping today's reminder away.
      await tx`DELETE FROM web_push_reminder_deliveries WHERE user_id = ${user.id}`;
    }
    if (counts.pushSubscriptions !== null) {
      await tx`DELETE FROM web_push_subscriptions WHERE user_id = ${user.id}`;
    }
    await tx`
      UPDATE users SET
        goal_revision = 0,
        goal_intro_answered = false,
        goal_reminder_enabled = true,
        goal_reminder_local_minutes = NULL,
        goal_reminder_intro_answered = false,
        study_pacing_seeded_at = NULL,
        learning_fine_tune = NULL,
        timezone = NULL,
        updated_at = now()
      WHERE id = ${user.id}
    `;
  });

  const after = await resolveUser(args);
  const afterCounts = await countOwnedRows(after.id);
  console.log(`\n[done] next open lands on: ${predictStep(after, afterCounts)}`);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = argsMap(rest);

  try {
    switch (command) {
      case "show":
        await show(args);
        break;
      case "reset":
        await reset(args);
        break;
      default:
        throw new Error(
          "Unknown command. Use: show --user <uuid|email> | reset --user <uuid|email> [--apply]",
        );
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

void main();
