/**
 * Operator CLI for school pilot access.
 *
 * Usage examples:
 *   pnpm tsx scripts/school-access.ts create-school --name "Pilot School"
 *   pnpm tsx scripts/school-access.ts create-code --school <uuid> --role student
 *   pnpm tsx scripts/school-access.ts create-code --school <uuid> --role student --code TEST-SCHOOL-2026  (local databases only)
 *   pnpm tsx scripts/school-access.ts school-status --school <uuid>
 *   pnpm tsx scripts/school-access.ts set-expiry --school <uuid> --expires 2027-06-30 --codes
 *   pnpm tsx scripts/school-access.ts set-expiry --school <uuid> --clear
 *   pnpm tsx scripts/school-access.ts rotate-code --code <code>
 *   pnpm tsx scripts/school-access.ts revoke-membership --user <uuid>
 *   pnpm tsx scripts/school-access.ts change-membership-role --user <uuid> --role teacher
 *   pnpm tsx scripts/school-access.ts resolve-translation-request --user <uuid> --request <id> --action release
 */

import * as dotenv from "dotenv";
import postgres from "postgres";
import {
  assertUsableSchoolCode,
  generateSchoolCode,
  hashSchoolCode,
} from "../features/schools/server/code";

/**
 * An inherited DATABASE_URL means someone else picked the database — in
 * practice `production-db.sh`. That makes it the closest thing this script has
 * to "am I pointed at production", used below to keep hand-written codes out,
 * and it means `.env.local` should stay out of the way here.
 */
const inheritedDatabaseUrl = Boolean(process.env.DATABASE_URL);
if (!inheritedDatabaseUrl) {
  dotenv.config({ path: ".env.local" });
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set. Add it to .env.local or the environment.");
  process.exit(1);
}

const sql = postgres(connectionString, { max: 1 });

type QueryFn = <T extends readonly Record<string, unknown>[] = Record<string, unknown>[]>(
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<T>;

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

function optionalInt(args: Map<string, string | true>, key: string, fallback: number) {
  const value = args.get(key);
  if (typeof value !== "string") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Invalid --${key}`);
  return Math.floor(parsed);
}

function optionalDateSql(args: Map<string, string | true>, key: string) {
  const value = args.get(key);
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid --${key}`);
  return date.toISOString();
}

async function createCode(input: {
  schoolId: string;
  role: "student" | "teacher";
  expiresAt: string | null;
  code?: string;
}) {
  // A hand-written code is a testing convenience, and it is the one input the
  // stored hash cannot protect: `TEST-SCHOOL-2026` survives a database leak
  // only until someone guesses it. Generated codes carry ~100 bits, so the
  // restriction costs nothing where it matters.
  if (input.code !== undefined && inheritedDatabaseUrl) {
    throw new Error(
      "--code is for local databases only; omit it so a random code is generated.",
    );
  }
  const code = input.code ?? generateSchoolCode();
  if (!assertUsableSchoolCode(code)) throw new Error("Invalid --code");
  await sql`
    INSERT INTO school_access_codes (school_id, code_hash, role, expires_at, created_at, updated_at)
    VALUES (${input.schoolId}, ${hashSchoolCode(code)}, ${input.role}, ${input.expiresAt ?? null}::timestamp, now(), now())
  `;
  console.log(`[school] ${input.role} link: /school/redeem#${code}`);
  return code;
}

async function createSchool(args: Map<string, string | true>) {
  const name = required(args, "name");
  const students = optionalInt(args, "students", 30);
  const teachers = optionalInt(args, "teachers", 5);
  const expiresAt = optionalDateSql(args, "expires");
  const rows = await sql<{ id: string }[]>`
    INSERT INTO schools (name, student_seat_limit, teacher_limit, pilot_expires_at, created_at, updated_at)
    VALUES (${name}, ${students}, ${teachers}, ${expiresAt}::timestamp, now(), now())
    RETURNING id
  `;
  const schoolId = rows[0].id;
  console.log(`[school] created ${schoolId} (${name})`);
  await createCode({ schoolId, role: "student", expiresAt });
  await createCode({ schoolId, role: "teacher", expiresAt });
}

async function schoolStatus(args: Map<string, string | true>) {
  const schoolId = required(args, "school");
  const rows = await sql`
    SELECT s.*,
           count(m.*) FILTER (WHERE m.role = 'student' AND m.revoked_at IS NULL)::int AS active_students,
           count(m.*) FILTER (WHERE m.role = 'teacher' AND m.revoked_at IS NULL)::int AS active_teachers
    FROM schools s
    LEFT JOIN school_memberships m ON m.school_id = s.id
    WHERE s.id = ${schoolId}
    GROUP BY s.id
  `;
  console.log(JSON.stringify(rows[0] ?? null, null, 2));
}

/**
 * Print the wall clock that is actually stored in the column, whether the value
 * came back from postgres or came in on argv.
 *
 * `pilot_expires_at` is `timestamp` without a time zone, so the driver reads it
 * as a local-time Date while argv arrives as a UTC ISO string. Rendering either
 * one through `toISOString()` shifts it by the operator's offset — setting
 * `2027-06-30` and reading back `2027-06-29T22:00Z` looks like the command
 * missed, and the obvious reaction is to write again with a "corrected" date.
 */
function formatExpiry(value: Date | string | null): string {
  if (value === null) return "no expiry";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return String(value);
    const pad = (part: number) => String(part).padStart(2, "0");
    return (
      `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}` +
      ` ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
    );
  }
  return value.replace("T", " ").replace(/\.\d+Z?$/, "").replace(/Z$/, "");
}

/**
 * Move a school's pilot window, forwards or backwards.
 *
 * `pilot_expires_at` is evaluated per request and nothing caches it, so both
 * directions take effect immediately. Expiry never revokes memberships either,
 * which is what makes a reopened pilot pick up exactly where it left off — no
 * one has to redeem a code again.
 *
 * Access codes carry their own `expires_at` and are deliberately left alone
 * unless `--codes` is passed: reopening a pilot for the class that is already
 * in it is a different decision from letting new members join, and the two
 * should not be conflated by a single flag-less command.
 */
async function setExpiry(args: Map<string, string | true>) {
  const schoolId = required(args, "school");
  const clear = args.get("clear") === true;
  const expiresAt = clear ? null : optionalDateSql(args, "expires");
  if (!clear && !expiresAt) {
    throw new Error("Pass --expires <date>, or --clear to remove the expiry");
  }
  const alsoCodes = args.get("codes") === true;
  const label = formatExpiry(expiresAt);

  await sql.begin(async (rawTx) => {
    const tx = rawTx as unknown as QueryFn;
    const schools = await tx<{ id: string; name: string; pilot_expires_at: Date | null }[]>`
      SELECT id, name, pilot_expires_at
      FROM schools
      WHERE id = ${schoolId}
      FOR UPDATE
    `;
    const school = schools[0];
    if (!school) throw new Error("School not found");

    await tx`
      UPDATE schools
      SET pilot_expires_at = ${expiresAt}::timestamp, updated_at = now()
      WHERE id = ${school.id}
    `;
    console.log(
      `[school] ${school.name}: pilot ${formatExpiry(school.pilot_expires_at)} -> ${label}`,
    );

    if (alsoCodes) {
      const codes = await tx<{ id: string }[]>`
        UPDATE school_access_codes
        SET expires_at = ${expiresAt}::timestamp, updated_at = now()
        WHERE school_id = ${school.id}
          AND revoked_at IS NULL
        RETURNING id
      `;
      console.log(`[school] moved ${codes.length} active code(s) to ${label}`);
      return;
    }

    // Warn rather than act: a school whose window now outlasts its codes still
    // serves its current members but silently turns away new ones, and that is
    // hard to tell apart from a wrong code when a student reports it.
    const stale = await tx<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM school_access_codes
      WHERE school_id = ${school.id}
        AND revoked_at IS NULL
        AND expires_at IS NOT NULL
        AND (${expiresAt}::timestamp IS NULL OR expires_at < ${expiresAt}::timestamp)
    `;
    if (stale[0].count > 0) {
      console.log(
        `[school] ${stale[0].count} active code(s) still expire earlier; re-run with --codes to move them too.`,
      );
    }
  });
}

async function createCodeCommand(args: Map<string, string | true>) {
  const role = required(args, "role");
  if (role !== "student" && role !== "teacher") throw new Error("--role must be student or teacher");
  const requestedCode = args.get("code");
  await createCode({
    schoolId: required(args, "school"),
    role,
    expiresAt: optionalDateSql(args, "expires"),
    code: typeof requestedCode === "string" ? requestedCode : undefined,
  });
}

async function revokeCode(args: Map<string, string | true>) {
  const code = assertUsableSchoolCode(required(args, "code"));
  if (!code) throw new Error("Invalid --code");
  const rows = await sql`
    UPDATE school_access_codes
    SET revoked_at = coalesce(revoked_at, now()), updated_at = now()
    WHERE code_hash = ${hashSchoolCode(code)}
    RETURNING id, school_id, role
  `;
  console.log(JSON.stringify(rows[0] ?? null, null, 2));
}

async function rotateCode(args: Map<string, string | true>) {
  const code = assertUsableSchoolCode(required(args, "code"));
  if (!code) throw new Error("Invalid --code");
  const rows = await sql<{ school_id: string; role: "student" | "teacher"; expires_at: string | null }[]>`
    UPDATE school_access_codes
    SET revoked_at = coalesce(revoked_at, now()), updated_at = now()
    WHERE code_hash = ${hashSchoolCode(code)}
    RETURNING school_id, role, expires_at
  `;
  const old = rows[0];
  if (!old) throw new Error("Code not found");
  await createCode({ schoolId: old.school_id, role: old.role, expiresAt: old.expires_at });
}

async function revokeMembership(args: Map<string, string | true>) {
  const userId = required(args, "user");
  const rows = await sql`
    UPDATE school_memberships
    SET revoked_at = coalesce(revoked_at, now()), updated_at = now()
    WHERE user_id = ${userId}
      AND revoked_at IS NULL
    RETURNING id, school_id, user_id, role
  `;
  console.log(JSON.stringify(rows[0] ?? null, null, 2));
}

async function changeMembershipRole(args: Map<string, string | true>) {
  const userId = required(args, "user");
  const role = required(args, "role");
  if (role !== "student" && role !== "teacher") throw new Error("--role must be student or teacher");
  await sql.begin(async (rawTx) => {
    const tx = rawTx as unknown as QueryFn;
    const memberships = await tx<{ id: string; school_id: string; role: string }[]>`
      SELECT id, school_id, role
      FROM school_memberships
      WHERE user_id = ${userId}
        AND revoked_at IS NULL
      LIMIT 1
    `;
    const membership = memberships[0];
    if (!membership) throw new Error("Active membership not found");
    const schools = await tx<{ id: string; student_seat_limit: number; teacher_limit: number }[]>`
      SELECT id, student_seat_limit, teacher_limit
      FROM schools
      WHERE id = ${membership.school_id}
      FOR UPDATE
    `;
    const school = schools[0];
    if (!school) throw new Error("School not found");
    const counts = await tx<{ students: number; teachers: number }[]>`
      SELECT
        count(*) FILTER (WHERE role = 'student')::int AS students,
        count(*) FILTER (WHERE role = 'teacher')::int AS teachers
      FROM school_memberships
      WHERE school_id = ${school.id}
        AND revoked_at IS NULL
        AND user_id <> ${userId}
    `;
    const count = counts[0];
    if (role === "student" && count.students >= school.student_seat_limit) {
      throw new Error("Student limit is full");
    }
    if (role === "teacher" && count.teachers >= school.teacher_limit) {
      throw new Error("Teacher limit is full");
    }
    await tx`
      UPDATE school_memberships
      SET role = ${role}, updated_at = now()
      WHERE id = ${membership.id}
    `;
  });
  console.log(`[school] changed ${userId} to ${role}`);
}

async function resolveTranslationRequest(args: Map<string, string | true>) {
  const userId = required(args, "user");
  const requestId = required(args, "request");
  const action = required(args, "action");
  if (action !== "release" && action !== "keep") {
    throw new Error("--action must be release or keep");
  }
  await sql.begin(async (rawTx) => {
    const tx = rawTx as unknown as QueryFn;
    const rows = await tx<{ id: string; status: string; item_count: number; period_start: string }[]>`
      SELECT id, status, item_count, period_start
      FROM school_translation_requests
      WHERE user_id = ${userId}
        AND request_id = ${requestId}
      FOR UPDATE
    `;
    const row = rows[0];
    if (!row) throw new Error("Translation request not found");
    if (action === "release") {
      if (row.status === "released") {
        console.log("[school] already released");
        return;
      }
      await tx`
        UPDATE school_translation_requests
        SET status = 'released', updated_at = now()
        WHERE id = ${row.id}
      `;
      await tx`
        UPDATE school_feature_usage
        SET used = greatest(0, used - ${row.item_count}), updated_at = now()
        WHERE user_id = ${userId}
          AND feature = 'ai_translation'
          AND period_start = ${row.period_start}::timestamp
      `;
      return;
    }
    await tx`
      UPDATE school_translation_requests
      SET status = 'failed_charged', updated_at = now()
      WHERE id = ${row.id}
    `;
  });
  console.log(`[school] resolved ${requestId} with ${action}`);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = argsMap(rest);

  try {
    switch (command) {
      case "create-school":
        await createSchool(args);
        break;
      case "school-status":
        await schoolStatus(args);
        break;
      case "set-expiry":
        await setExpiry(args);
        break;
      case "create-code":
        await createCodeCommand(args);
        break;
      case "revoke-code":
        await revokeCode(args);
        break;
      case "rotate-code":
        await rotateCode(args);
        break;
      case "revoke-membership":
        await revokeMembership(args);
        break;
      case "change-membership-role":
        await changeMembershipRole(args);
        break;
      case "resolve-translation-request":
        await resolveTranslationRequest(args);
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
