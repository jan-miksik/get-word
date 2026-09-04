/**
 * Sets up, and then proves, the production half of study reminders.
 *
 * The feature needs four things that live outside the repository and cannot be
 * deployed with the app: a VAPID key pair, Edge Function secrets, two Vault
 * entries, and a pg_cron job. Each is a separate console or CLI step, none of
 * them tells you when it is missing, and a wrong one shows up only as reminders
 * that quietly never arrive. This script does the parts a script can do and
 * reports the rest by name.
 *
 *   pnpm run push:vapid                  # generate a key pair, print it, stop
 *   pnpm run push:setup                  # read-only preflight of every link
 *   pnpm run push:setup -- --smoke       # also call the deployed function once
 *   pnpm run push:setup -- --apply --yes # create the Vault secrets + cron job
 *
 * Against production, go through the wrapper so the URL is never in argv or
 * shell history:
 *
 *   pnpm run db:prod -- push-setup [--apply --yes] [--smoke]
 *
 * What it deliberately does NOT do: `supabase secrets set` and
 * `supabase functions deploy`. Those carry the private VAPID key, and routing a
 * secret through another program's argv to save one line of typing is a bad
 * trade. It prints the exact commands instead, and then checks the result.
 *
 * The read-only default is safe to run any time. `--apply` writes to whichever
 * database DATABASE_URL points at.
 *
 * Diagnosing reminders that are set up but not arriving is a different job:
 * `pnpm run check:reminders`.
 */

import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";

import * as dotenv from "dotenv";
import postgres from "postgres";

const CRON_JOB_NAME = "send-study-reminders-every-10-minutes";
const CRON_SQL_PATH = "supabase/cron-study-reminders.sql";
const FUNCTION_NAME = "send-study-reminders";

const argv = process.argv.slice(2);
const has = (flag: string) => argv.includes(flag);
const valueOf = (flag: string): string | null => {
  const inline = argv.find((entry) => entry.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1) || null;
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] ?? null : null;
};

const ok = (label: string) => console.log(`  ok    ${label}`);
const note = (label: string) => console.log(`        ${label}`);
let problems = 0;
const miss = (label: string) => {
  problems += 1;
  console.log(`  MISS  ${label}`);
};

function heading(title: string) {
  console.log(`\n${title}`);
}

/* ------------------------------------------------------------------ VAPID */

/**
 * A VAPID key pair is an ordinary P-256 key pair in Web Push clothing: the
 * public half is the uncompressed point `0x04 || x || y`, the private half is
 * the scalar `d`, both base64url. Node's JWK export already gives x/y/d in
 * base64url, so this needs no dependency — which matters, because the one
 * package that usually generates these (`web-push`) is not a dependency of this
 * app and would be installed for a single command.
 */
function generateVapidKeys(): { publicKey: string; privateKey: string } {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = privateKey.export({ format: "jwk" }) as { x: string; y: string; d: string };
  const point = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(jwk.x, "base64url"),
    Buffer.from(jwk.y, "base64url"),
  ]);
  return { publicKey: point.toString("base64url"), privateKey: jwk.d };
}

function printVapid(): void {
  const keys = generateVapidKeys();
  console.log("A new VAPID key pair. Generate this ONCE and keep it:");
  console.log("rotating it makes every stored subscription undeliverable.\n");
  console.log(`  public   ${keys.publicKey}`);
  console.log(`  private  ${keys.privateKey}`);
  console.log(`
Where each half goes:

  public   Vercel  →  NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY  (Production)
           This is inlined at build time, so it takes effect on the NEXT deploy,
           not when you save it.
  public   Supabase Edge secret WEB_PUSH_VAPID_PUBLIC_KEY (must be the same key)
  private  Supabase Edge secret WEB_PUSH_VAPID_PRIVATE_KEY, and nowhere else.
           Never in a NEXT_PUBLIC_ variable, never in the repository.

  supabase secrets set \\
    STUDY_REMINDER_CRON_SECRET="$(openssl rand -base64 32)" \\
    WEB_PUSH_VAPID_SUBJECT='mailto:you@example.com' \\
    WEB_PUSH_VAPID_PUBLIC_KEY='${keys.publicKey}' \\
    WEB_PUSH_VAPID_PRIVATE_KEY='<the private half above>'
  supabase functions deploy ${FUNCTION_NAME} --no-verify-jwt
`);
}

/* ------------------------------------------------------------- connection */

/**
 * The Supabase project this database belongs to, read out of the connection
 * string rather than asked for separately.
 *
 * Worth the parsing: the Vault entry `project_url` is what the cron job posts
 * to, so a project ref taken from the wrong place — a stale `.env.local`, a
 * copied command — points production's cron at another project's function, and
 * the only symptom is reminders that never arrive.
 *
 * Two shapes: a direct connection is `db.<ref>.supabase.co`, and a pooled one
 * hides the ref in the username as `postgres.<ref>`.
 */
function deriveProjectRef(connectionString: string): string | null {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    return null;
  }
  const direct = /^db\.([a-z0-9]+)\.supabase\.(co|com)$/i.exec(url.hostname);
  if (direct) return direct[1];
  const pooled = /^postgres\.([a-z0-9]+)$/i.exec(decodeURIComponent(url.username));
  if (pooled) return pooled[1];
  return null;
}

function describeTarget(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    return `${url.host}${url.pathname}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

/* ----------------------------------------------------------------- checks */

type Sql = ReturnType<typeof postgres>;

async function checkExtensions(sql: Sql, apply: boolean): Promise<void> {
  heading("[extensions]");
  for (const extension of ["pg_cron", "pg_net"] as const) {
    const rows = await sql<{ present: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = ${extension}) AS present
    `;
    if (rows[0].present) {
      ok(extension);
      continue;
    }
    if (!apply) {
      miss(`${extension} is not enabled`);
      note("Supabase dashboard → Database → Extensions, or rerun with --apply");
      continue;
    }
    try {
      await sql.unsafe(`CREATE EXTENSION IF NOT EXISTS ${extension}`);
      ok(`${extension} (enabled just now)`);
    } catch (error) {
      miss(`${extension} could not be enabled: ${message(error)}`);
      note("Enable it in the dashboard: Database → Extensions");
    }
  }
}

async function checkSchema(sql: Sql): Promise<void> {
  heading("[schema]");
  const rows = await sql<{ body: string }[]>`
    SELECT prosrc AS body FROM pg_proc WHERE proname = 'claim_due_web_push_reminders'
  `;
  if (rows.length === 0) {
    miss("claim_due_web_push_reminders is missing — the reminder migrations are not applied");
    note("pnpm run check:goal-release names exactly which objects are absent");
    return;
  }
  ok("claim_due_web_push_reminders exists");
  if (rows[0].body.includes("reminder_language")) {
    ok("0078 applied — the claim carries the learner's interface language");
  } else {
    miss("0078 not applied — every reminder would be sent in English");
    note("pnpm run db:prod:migrate, then redeploy the Edge Function");
  }
}

/**
 * Vault holds what the cron job needs to reach the function: where to post, and
 * the shared secret the function checks. Both are read back and compared with
 * the project this database belongs to, because a wrong-but-present value is
 * the failure mode that looks like nothing at all.
 */
async function checkVault(
  sql: Sql,
  projectUrl: string | null,
  cronSecret: string | null,
  apply: boolean,
): Promise<void> {
  heading("[vault]");
  let secrets: { name: string; decrypted_secret: string }[];
  try {
    secrets = await sql<{ name: string; decrypted_secret: string }[]>`
      SELECT name, decrypted_secret FROM vault.decrypted_secrets
      WHERE name IN ('project_url', 'study_reminder_cron_secret')
    `;
  } catch (error) {
    miss(`could not read Vault: ${message(error)}`);
    note("Check them by hand: Project Settings → Vault");
    return;
  }
  const stored = new Map(secrets.map((row) => [row.name, row.decrypted_secret]));

  await ensureSecret(sql, stored, "project_url", projectUrl, apply, (value) => {
    if (!projectUrl) return null;
    return value === projectUrl
      ? null
      : `points at ${value}, but this database belongs to ${projectUrl}`;
  });

  await ensureSecret(sql, stored, "study_reminder_cron_secret", cronSecret, apply, (value) => {
    if (!cronSecret) return null;
    return value === cronSecret
      ? null
      : "differs from STUDY_REMINDER_CRON_SECRET in this environment";
  });
}

async function ensureSecret(
  sql: Sql,
  stored: Map<string, string>,
  name: string,
  desired: string | null,
  apply: boolean,
  disagreement: (value: string) => string | null,
): Promise<void> {
  const current = stored.get(name);
  if (current !== undefined) {
    const problem = disagreement(current);
    if (!problem) {
      ok(`${name} is set`);
      return;
    }
    if (!apply || !desired) {
      miss(`${name} ${problem}`);
      return;
    }
    try {
      await sql`
        SELECT vault.update_secret(id, ${desired})
        FROM vault.secrets WHERE name = ${name}
      `;
      ok(`${name} (corrected just now)`);
    } catch (error) {
      miss(`${name} could not be updated: ${message(error)}`);
    }
    return;
  }
  if (!apply || !desired) {
    miss(`${name} is missing`);
    note(
      name === "study_reminder_cron_secret"
        ? "It must equal the Edge secret STUDY_REMINDER_CRON_SECRET, or the function answers 401."
        : "It is where the cron job posts, i.e. https://<project-ref>.supabase.co",
    );
    return;
  }
  try {
    await sql`SELECT vault.create_secret(${desired}, ${name})`;
    ok(`${name} (created just now)`);
  } catch (error) {
    miss(`${name} could not be created: ${message(error)}`);
  }
}

async function checkCron(sql: Sql, apply: boolean): Promise<void> {
  heading("[cron]");
  const jobs = await sql<{ schedule: string; active: boolean }[]>`
    SELECT schedule, active FROM cron.job WHERE jobname = ${CRON_JOB_NAME}
  `.catch(() => []);

  if (jobs.length > 0 && jobs[0].active) {
    ok(`job scheduled and active (${jobs[0].schedule})`);
  } else if (!apply) {
    miss(jobs.length === 0 ? "no cron job" : `job exists but is disabled (${jobs[0].schedule})`);
    note(`Run ${CRON_SQL_PATH} in the SQL editor, or rerun with --apply`);
    return;
  } else {
    // The file unschedules before scheduling, so applying it twice is safe and
    // is also how a disabled or misconfigured job gets replaced.
    try {
      await sql.unsafe(readFileSync(CRON_SQL_PATH, "utf8")).simple();
      ok(`job scheduled from ${CRON_SQL_PATH}`);
    } catch (error) {
      miss(`could not schedule the job: ${message(error)}`);
      return;
    }
  }

  const runs = await sql<{ status: string; return_message: string | null; start_time: Date }[]>`
    SELECT status, return_message, start_time FROM cron.job_run_details
    WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = ${CRON_JOB_NAME})
    ORDER BY start_time DESC LIMIT 3
  `.catch(() => []);
  if (runs.length === 0) {
    note("no runs recorded yet — the first one is at most ten minutes away");
    return;
  }
  for (const run of runs) {
    const when = run.start_time.toISOString().replace("T", " ").slice(0, 16);
    const detail = run.return_message ? `  ${run.return_message}` : "";
    if (run.status === "succeeded") note(`${when}  ${run.status}${detail}`);
    else miss(`${when}  ${run.status}${detail}`);
  }
  note("'succeeded' means the request was queued, not that a reminder was sent.");
}

async function checkSubscriptions(sql: Sql): Promise<void> {
  heading("[devices]");
  const rows = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM web_push_subscriptions
  `;
  if (rows[0].count === 0) {
    miss("no push subscriptions — nothing can be delivered to yet");
    note("Turn reminders on in the deployed app, on a device, then rerun.");
    note("If the app says push is not configured, the build predates the VAPID key.");
    return;
  }
  ok(`${rows[0].count} subscribed device(s)`);
}

/**
 * Calls the deployed function the way cron does. Two answers matter: a request
 * without the header must be refused, and one with it must be accepted — the
 * second is the only proof that the Edge secret and the Vault copy agree.
 *
 * It claims real deliveries, so anyone who is inside their fifteen-minute window
 * right now gets their reminder from this call. That is the intended smoke test,
 * not a side effect, but it is why it is behind a flag.
 */
async function smokeTest(projectUrl: string | null, cronSecret: string | null): Promise<void> {
  heading("[edge function]");
  if (!projectUrl) {
    miss("no project URL, so the function cannot be called");
    return;
  }
  const url = `${projectUrl}/functions/v1/${FUNCTION_NAME}`;
  note(url);

  const unauthorized = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  }).catch((error: unknown) => error as Error);

  if (unauthorized instanceof Error) {
    miss(`unreachable: ${unauthorized.message}`);
    note(`supabase functions deploy ${FUNCTION_NAME} --no-verify-jwt`);
    return;
  }
  if (unauthorized.status === 401) ok("refuses a request without the cron header");
  else if (unauthorized.status === 404) {
    miss("404 — the function is not deployed");
    note(`supabase functions deploy ${FUNCTION_NAME} --no-verify-jwt`);
    return;
  } else miss(`expected 401 without the cron header, got ${unauthorized.status}`);

  if (!cronSecret) {
    note("STUDY_REMINDER_CRON_SECRET is not set here, so the accepted path was not tried");
    return;
  }
  const authorized = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-study-reminder-cron": cronSecret },
    body: "{}",
  }).catch((error: unknown) => error as Error);

  if (authorized instanceof Error) {
    miss(`unreachable with the cron header: ${authorized.message}`);
    return;
  }
  const body = await authorized.text();
  if (authorized.status === 200) {
    ok(`accepted: ${body}`);
    if (/"failed":\s*[1-9]/.test(body)) {
      note("A failed send with everything else in place usually means the Edge");
      note("Function's VAPID keys are not the pair the browser subscribed with.");
    }
  } else {
    miss(`${authorized.status}: ${body}`);
    if (authorized.status === 401) {
      note("The Edge secret STUDY_REMINDER_CRON_SECRET differs from the value used here.");
    }
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/* ------------------------------------------------------------------- main */

async function main() {
  if (has("--vapid")) {
    printVapid();
    return;
  }

  if (!process.env.DATABASE_URL) dotenv.config({ path: ".env.local" });
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set. Add it to .env.local or the environment.");
    process.exit(1);
  }

  const apply = has("--apply");
  if (apply && !has("--yes")) {
    console.error(
      `Refusing to write to ${describeTarget(connectionString)} without --yes.\n`
        + "Rerun with --apply --yes once the target above is the one you mean.",
    );
    process.exit(1);
  }

  const projectRef = deriveProjectRef(connectionString);
  const projectUrl = valueOf("--project-url")
    ?? (projectRef ? `https://${projectRef}.supabase.co` : null);
  const cronSecret = process.env.STUDY_REMINDER_CRON_SECRET?.trim() || null;

  console.log(`[db]      ${describeTarget(connectionString)}`);
  console.log(`[project] ${projectUrl ?? "unknown — pass --project-url"}`);
  console.log(`[mode]    ${apply ? "APPLY — this will write" : "read-only"}`);
  if (!projectUrl) {
    note("The project ref could not be read from the connection string.");
  }

  const sql = postgres(connectionString, { max: 1 });
  try {
    await checkExtensions(sql, apply);
    await checkSchema(sql);
    await checkVault(sql, projectUrl, cronSecret, apply);
    await checkCron(sql, apply);
    await checkSubscriptions(sql);
    if (has("--smoke")) await smokeTest(projectUrl, cronSecret);

    console.log();
    if (problems === 0) {
      console.log("[result] every link this script can see is in place");
      if (!has("--smoke")) {
        console.log("[result] add --smoke to prove the deployed function answers");
      }
      return;
    }
    console.log(`[result] ${problems} thing(s) above still need doing`);
    console.log("[result] the full procedure: docs/push-notifications-production.md");
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

void main();
