/**
 * Operator CLI for per-account feature limits.
 *
 * The override in `users.photo_lab_limit_override` replaces the photo-lab
 * allowance on whichever path the account takes — editor daily bucket, free
 * weekly bucket, or a school plan's monthly quota. NULL means "use the normal
 * limit"; 0 turns photo analysis off for that account.
 *
 * Note the override changes the *limit*, not the usage already recorded in the
 * current window: raising it takes effect immediately, lowering it below what
 * someone already spent leaves them at zero remaining until the window resets.
 *
 * Usage examples:
 *   pnpm tsx scripts/user-limits.ts show --user <uuid|email>
 *   pnpm tsx scripts/user-limits.ts set-photo-limit --user <uuid|email> --limit 50
 *   pnpm tsx scripts/user-limits.ts clear-photo-limit --user <uuid|email>
 *   pnpm tsx scripts/user-limits.ts list-photo-limits
 */

import * as dotenv from "dotenv";
import postgres from "postgres";

// Mirrors scripts/school-access.ts: an inherited DATABASE_URL means someone
// else already picked the database (in practice `production-db.sh`), so
// `.env.local` must stay out of the way.
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

type UserRow = {
  id: string;
  email: string | null;
  user_role: string;
  photo_lab_limit_override: number | null;
};

/** Accepts a user id or an e-mail; refuses an ambiguous e-mail match. */
async function resolveUser(args: Map<string, string | true>): Promise<UserRow> {
  const identifier = required(args, "user");
  const rows = UUID_RE.test(identifier)
    ? await sql<UserRow[]>`
        SELECT id, email, user_role, photo_lab_limit_override
        FROM users WHERE id = ${identifier}
      `
    : await sql<UserRow[]>`
        SELECT id, email, user_role, photo_lab_limit_override
        FROM users WHERE lower(email) = lower(${identifier})
      `;
  if (rows.length === 0) throw new Error(`No user matches ${identifier}`);
  if (rows.length > 1) throw new Error(`${identifier} matches ${rows.length} users; pass the id`);
  return rows[0];
}

function describeOverride(value: number | null) {
  return value === null ? "none (default limit)" : String(value);
}

async function show(args: Map<string, string | true>) {
  const user = await resolveUser(args);
  const membership = await sql<{ school_name: string; role: string; plan: string }[]>`
    SELECT s.name AS school_name, m.role, s.plan
    FROM school_memberships m
    JOIN schools s ON s.id = m.school_id
    WHERE m.user_id = ${user.id} AND m.revoked_at IS NULL AND s.status = 'active'
    ORDER BY m.claimed_at DESC
    LIMIT 1
  `;

  console.log(`[user] ${user.id}`);
  console.log(`  email:               ${user.email ?? "—"}`);
  console.log(`  role:                ${user.user_role}`);
  console.log(`  photo-lab override:  ${describeOverride(user.photo_lab_limit_override)}`);
  console.log(
    membership[0]
      ? `  school:              ${membership[0].school_name} (${membership[0].role}, ${membership[0].plan})`
      : "  school:              —",
  );
}

async function setPhotoLimit(args: Map<string, string | true>) {
  const user = await resolveUser(args);
  const raw = required(args, "limit");
  const limit = Number(raw);
  if (!Number.isFinite(limit) || limit < 0 || !Number.isInteger(limit)) {
    throw new Error("--limit must be a non-negative whole number (0 disables photo analysis)");
  }
  await sql`
    UPDATE users SET photo_lab_limit_override = ${limit}, updated_at = now()
    WHERE id = ${user.id}
  `;
  console.log(
    `[user] ${user.id} photo-lab limit ${describeOverride(user.photo_lab_limit_override)} → ${limit}`,
  );
}

async function clearPhotoLimit(args: Map<string, string | true>) {
  const user = await resolveUser(args);
  await sql`
    UPDATE users SET photo_lab_limit_override = NULL, updated_at = now()
    WHERE id = ${user.id}
  `;
  console.log(
    `[user] ${user.id} photo-lab limit ${describeOverride(user.photo_lab_limit_override)} → default`,
  );
}

async function listPhotoLimits() {
  const rows = await sql<
    { id: string; email: string | null; user_role: string; photo_lab_limit_override: number }[]
  >`
    SELECT id, email, user_role, photo_lab_limit_override
    FROM users
    WHERE photo_lab_limit_override IS NOT NULL
    ORDER BY updated_at DESC
  `;
  if (rows.length === 0) {
    console.log("[user] no photo-lab overrides set");
    return;
  }
  for (const row of rows) {
    console.log(
      `${row.id}  ${String(row.photo_lab_limit_override).padStart(5)}  ${row.user_role.padEnd(6)}  ${row.email ?? "—"}`,
    );
  }
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = argsMap(rest);

  try {
    switch (command) {
      case "show":
        await show(args);
        break;
      case "set-photo-limit":
        await setPhotoLimit(args);
        break;
      case "clear-photo-limit":
        await clearPhotoLimit(args);
        break;
      case "list-photo-limits":
        await listPhotoLimits();
        break;
      default:
        throw new Error("Unknown command");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

void main();
