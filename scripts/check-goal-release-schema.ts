/**
 * Verifies that the study-goal and reminder migrations (0066–0072, plus 0078)
 * are really in a database, by looking for the objects they create rather than
 * trusting the migration ledger.
 *
 * This exists because the ledger has lied before: `drizzle.__drizzle_migrations`
 * and `meta/_journal.json` both claimed 0058 was applied on a database that did
 * not have its columns (a restore carried the rows across), and both
 * `db:migrate` and `db:migrate:run` then skipped it silently. A green migration
 * run is therefore not evidence. The objects are.
 *
 * Checks are deliberately version-sensitive where a later migration only
 * rewrites what an earlier one created: the words-goal ceiling (0068) and the
 * two reminder-claim refinements (0069, 0071) are invisible in a table listing
 * and are asserted from the constraint and function bodies instead.
 *
 *   pnpm run check:goal-release                 # uses DATABASE_URL / .env.local
 *   DATABASE_URL=postgresql://… pnpm run check:goal-release
 *
 * Exits non-zero when anything is missing, so it can gate a deploy.
 */

import * as dotenv from "dotenv";
import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  dotenv.config({ path: ".env.local" });
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set. Add it to .env.local or the environment.");
  process.exit(1);
}

const sql = postgres(connectionString, { max: 1 });

type Check = {
  migration: string;
  label: string;
  run: () => Promise<boolean>;
};

function table(migration: string, name: string): Check {
  return {
    migration,
    label: `table ${name}`,
    run: async () => {
      const rows = await sql<{ present: boolean }[]>`
        SELECT to_regclass(${`public.${name}`}) IS NOT NULL AS present
      `;
      return rows[0]?.present ?? false;
    },
  };
}

function column(migration: string, tableName: string, columnName: string): Check {
  return {
    migration,
    label: `column ${tableName}.${columnName}`,
    run: async () => {
      const rows = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ${tableName}
          AND column_name = ${columnName}
      `;
      return rows[0].count > 0;
    },
  };
}

/** A named constraint, optionally required to mention `contains` in its body. */
function constraint(
  migration: string,
  name: string,
  contains?: string,
): Check {
  return {
    migration,
    label: contains ? `constraint ${name} (mentions ${contains})` : `constraint ${name}`,
    run: async () => {
      const rows = await sql<{ definition: string }[]>`
        SELECT pg_get_constraintdef(c.oid) AS definition
        FROM pg_constraint c
        JOIN pg_class relation ON relation.oid = c.conrelid
        JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public' AND c.conname = ${name}
      `;
      if (rows.length === 0) return false;
      return contains ? rows.some((row) => row.definition.includes(contains)) : true;
    },
  };
}

/** A function, optionally required to mention `contains` in its body. */
function routine(
  migration: string,
  name: string,
  identityArguments: string,
  contains?: string,
): Check {
  return {
    migration,
    label: contains
      ? `function ${name}(${identityArguments}) (mentions ${contains})`
      : `function ${name}(${identityArguments})`,
    run: async () => {
      const rows = await sql<{ body: string }[]>`
        SELECT prosrc AS body FROM pg_proc p
        WHERE p.oid = to_regprocedure(${`public.${name}(${identityArguments})`})
      `;
      if (rows.length === 0) return false;
      return contains ? rows.some((row) => row.body.includes(contains)) : true;
    },
  };
}

function enumType(migration: string, name: string): Check {
  return {
    migration,
    label: `enum ${name}`,
    run: async () => {
      const rows = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typname = ${name} AND t.typtype = 'e'
      `;
      return rows[0].count > 0;
    },
  };
}

const checks: Check[] = [
  table("0066", "web_push_subscriptions"),
  table("0066", "web_push_reminder_deliveries"),
  routine("0066", "complete_web_push_reminder_delivery", "uuid, boolean"),

  enumType("0067", "review_event_kind"),
  column("0067", "user_progress", "introduced_at"),
  column("0067", "review_events", "event_kind"),
  column("0067", "review_events", "previous_due_at"),
  column("0067", "review_events", "counts_toward_daily_review"),
  column("0067", "user_study_goal_versions", "goal_mode"),
  column("0067", "user_study_goal_versions", "goal_new_words_per_day"),
  column("0067", "user_day_stats", "goal_status"),
  column("0067", "user_day_stats", "resolved_new_target"),
  column("0067", "user_day_stats", "resolved_review_target"),
  column("0067", "user_day_stats", "resolved_minutes_budget"),
  column("0067", "user_day_stats", "introduced_words"),
  column("0067", "user_day_stats", "reviewed_words"),

  // 0068 only widens 0067's constraint, so the ceiling is the only evidence.
  constraint("0068", "user_study_goal_versions_mode_check", "1000"),

  column("0069", "users", "goal_reminder_intro_answered"),
  column("0069", "user_study_goal_versions", "goal_weekdays"),
  constraint("0069", "user_study_goal_versions_weekdays_check"),
  constraint("0069", "user_study_goal_versions_minutes_check"),
  // 0069 replaces the 0066 function; the weekday gate is what tells them apart.
  routine("0069", "claim_due_web_push_reminders", "integer", "goal_reminder_intro_answered"),

  column("0070", "word_list_items", "address_form"),

  // 0071 replaces it again, adding the weekly-quota clause.
  routine("0071", "claim_due_web_push_reminders", "integer", "goal_days_per_week"),

  table("0072", "content_quality_events"),

  // 0078 drops and recreates the same function with the learner's language in
  // the result set. Without it every reminder is sent in English.
  column("0078", "web_push_subscriptions", "language"),
  routine("0078", "claim_due_web_push_reminders", "integer", "reminder_language"),
];

/** What the ledger claims, so a disagreement with reality is named explicitly. */
async function ledgerTail(): Promise<string> {
  const exists = await sql<{ present: boolean }[]>`
    SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS present
  `;
  if (!exists[0]?.present) return "no drizzle ledger table";
  const rows = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations
  `;
  return `${rows[0].count} rows in drizzle.__drizzle_migrations`;
}

function describeTarget(): string {
  try {
    const url = new URL(connectionString!);
    return `${url.host}${url.pathname}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

async function main() {
  try {
    console.log(`[db]     ${describeTarget()}`);
    console.log(`[ledger] ${await ledgerTail()}`);
    console.log();

    const missing: Check[] = [];
    for (const check of checks) {
      const ok = await check.run();
      if (!ok) missing.push(check);
      console.log(`  ${ok ? "ok  " : "MISS"}  ${check.migration}  ${check.label}`);
    }

    console.log();
    if (missing.length === 0) {
      console.log(`[result] all ${checks.length} objects from 0066–0072 and 0078 are present`);
      return;
    }
    const migrations = [...new Set(missing.map((check) => check.migration))].sort();
    console.log(`[result] ${missing.length} missing; incomplete migrations: ${migrations.join(", ")}`);
    console.log("[result] the ledger cannot fix this — run the SQL files directly:");
    for (const migration of migrations) {
      console.log(`           psql "$DATABASE_URL" -f drizzle/migrations/${migration}_*.sql`);
    }
    process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

void main();
