/**
 * Reports the whole study-reminder chain, link by link, so a reminder that did
 * not arrive can be blamed on the link that actually broke.
 *
 * The pipeline has four independently deployable parts, and a failure in any of
 * them looks identical from the app: the schema (Drizzle), the Edge Function
 * (`supabase functions deploy`), the cron job (`supabase/cron-study-reminders.sql`,
 * run by hand), and the per-device push subscription the browser creates. The
 * app can only ever see the last one, and even that it sees as "reminders are
 * on" — which stays true after the subscription behind it is gone.
 *
 *   pnpm run check:reminders                    # uses DATABASE_URL / .env.local
 *   DATABASE_URL=postgresql://… pnpm run check:reminders
 *
 * Read-only. It never claims a delivery, so running it cannot consume anyone's
 * reminder for the day.
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

const ok = (label: string) => console.log(`  ok    ${label}`);
const bad = (label: string) => console.log(`  MISS  ${label}`);
const note = (label: string) => console.log(`        ${label}`);

let problems = 0;
const fail = (label: string) => { problems += 1; bad(label); };

function heading(title: string) {
  console.log(`\n${title}`);
}

async function checkSchema() {
  heading("[schema]");
  const rows = await sql<{ body: string }[]>`
    SELECT prosrc AS body FROM pg_proc WHERE proname = 'claim_due_web_push_reminders'
  `;
  if (rows.length === 0) {
    fail("function claim_due_web_push_reminders is missing — migration 0066 is not applied");
    return;
  }
  ok("function claim_due_web_push_reminders exists");
  if (rows[0].body.includes("reminder_language")) {
    ok("0078 applied — reminders carry the learner's interface language");
  } else {
    fail("0078 not applied — every reminder is sent in English");
    note("pnpm run db:migrate, then redeploy the Edge Function");
  }
}

async function checkCron() {
  heading("[cron]");
  const jobs = await sql<{ jobname: string; schedule: string; active: boolean }[]>`
    SELECT jobname, schedule, active FROM cron.job
    WHERE jobname = 'send-study-reminders-every-10-minutes'
  `.catch(() => []);
  if (jobs.length === 0) {
    fail("no send-study-reminders cron job — run supabase/cron-study-reminders.sql");
    return;
  }
  const job = jobs[0];
  if (job.active) ok(`cron job active (${job.schedule})`);
  else fail(`cron job exists but is disabled (${job.schedule})`);
}

/**
 * What the Edge Function itself answered. `net._http_response` is the only
 * evidence in the database that the deployed function ran at all — a cron run
 * counts as "succeeded" the moment the request is queued, whatever the function
 * then did with it.
 */
async function checkEdgeResponses() {
  heading("[edge function] last responses");
  const responses = await sql<{ status_code: number; body: string; created: Date }[]>`
    SELECT status_code, left(content, 300) AS body, created
    FROM net._http_response ORDER BY created DESC LIMIT 6
  `.catch(() => []);
  if (responses.length === 0) {
    fail("no HTTP responses recorded — the cron job has never reached the function");
    return;
  }
  let sentAny = false;
  for (const response of responses) {
    const when = response.created.toISOString().replace("T", " ").slice(0, 16);
    const line = `${when}  ${response.status_code}  ${response.body}`;
    if (response.status_code === 200) {
      ok(line);
      if (/"sent":\s*[1-9]/.test(response.body ?? "")) sentAny = true;
    } else {
      fail(line);
    }
  }
  if (!sentAny) {
    note('no "sent" above zero in this window — see [devices] and [who is due] below');
  }
}

async function checkSubscriptions() {
  heading("[devices]");
  const rows = await sql<{
    email: string | null; language: string | null; source: string; agent: string | null;
  }[]>`
    SELECT u.email,
      COALESCE(
        NULLIF(s.language, ''), NULLIF(u.settings_language, ''), NULLIF(u.language_from, '')
      ) AS language,
      CASE
        WHEN NULLIF(s.language, '') IS NOT NULL THEN 'device'
        WHEN NULLIF(u.settings_language, '') IS NOT NULL THEN 'account setting'
        WHEN NULLIF(u.language_from, '') IS NOT NULL THEN 'studies from'
        ELSE 'none — falls back to English'
      END AS source,
      left(coalesce(s.user_agent, ''), 46) AS agent
    FROM web_push_subscriptions s
    LEFT JOIN users u ON u.id = s.user_id
    ORDER BY s.updated_at DESC
  `;
  if (rows.length === 0) {
    fail("no push subscriptions at all — no device can be reached");
    note("A subscription disappears on its own: the Edge Function deletes one the");
    note("push service reports as gone (404/410), which is what happens after the");
    note("service worker holding it is unregistered.");
    return;
  }
  ok(`${rows.length} subscribed device(s)`);
  for (const row of rows) {
    note(
      `${row.email ?? "(no email)"}  lang=${row.language ?? "en"} (${row.source})  ${row.agent}`
    );
  }
}

async function checkDeliveries() {
  heading("[deliveries] last 7 days");
  const rows = await sql<{
    email: string | null; day_key: Date; scheduled_for: Date; sent_at: Date | null;
  }[]>`
    SELECT u.email, d.day_key, d.scheduled_for, d.sent_at
    FROM web_push_reminder_deliveries d
    LEFT JOIN users u ON u.id = d.user_id
    WHERE d.day_key >= (now() - interval '7 days')::date
    ORDER BY d.claimed_at DESC LIMIT 20
  `;
  if (rows.length === 0) {
    note("none — nothing has been claimed this week");
    return;
  }
  for (const row of rows) {
    const day = row.day_key.toISOString().slice(0, 10);
    const state = row.sent_at ? "sent" : "claimed, not sent";
    note(`${day}  ${row.email ?? "(no email)"}  ${state}`);
  }
  note("A row here means that day is spent: the unique (user, day) key stops a second send.");
}

/**
 * Mirrors every gate in `claim_due_web_push_reminders` and reports them one by
 * one instead of as a single yes/no. Kept deliberately parallel to the function
 * body — when a migration changes those conditions, change them here too.
 */
async function checkWhoIsDue() {
  heading("[who is due] every account with reminders switched on");
  const rows = await sql<Record<string, unknown>[]>`
    SELECT
      u.email,
      to_char(now() AT TIME ZONE zone.timezone_name, 'HH24:MI') AS local_now,
      to_char(scheduled.scheduled_for AT TIME ZONE zone.timezone_name, 'HH24:MI') AS reminder_at,
      zone.timezone_name AS timezone,
      u.goal_reminder_intro_answered AS intro_answered,
      EXISTS (SELECT 1 FROM web_push_subscriptions s WHERE s.user_id = u.id) AS has_device,
      COALESCE(goal.enabled, false) AS goal_enabled,
      (goal.goal_weekdays IS NULL
        OR EXTRACT(ISODOW FROM local_day.day_key)::integer = ANY(goal.goal_weekdays)) AS weekday_ok,
      (now() >= scheduled.scheduled_for
        AND now() < scheduled.scheduled_for + interval '15 minutes') AS in_window,
      NOT EXISTS (
        SELECT 1 FROM user_day_stats stats
        WHERE stats.user_id = u.id AND stats.day_key = local_day.day_key AND stats.met
      ) AS day_not_met,
      -- The one gate that is invisible from a single day: a learner who has
      -- already met their weekly quota is not reminded again, however far from
      -- the line today is.
      (
        (SELECT count(*) FROM user_day_stats week_stats
          WHERE week_stats.user_id = u.id AND week_stats.met
            AND week_stats.day_key >= (date_trunc('week', local_day.day_key::timestamp))::date
            AND week_stats.day_key <= local_day.day_key)
        < COALESCE(goal.goal_days_per_week, 7)
      ) AS week_not_finished,
      today.introduced_words, today.resolved_new_target,
      today.reviewed_words, today.resolved_review_target,
      NOT EXISTS (
        SELECT 1 FROM web_push_reminder_deliveries d
        WHERE d.user_id = u.id AND d.day_key = local_day.day_key
      ) AS not_yet_claimed_today
    FROM users u
    JOIN LATERAL (
      SELECT COALESCE(
        (SELECT name FROM pg_timezone_names WHERE name = NULLIF(u.timezone, '') LIMIT 1),
        'UTC'
      ) AS timezone_name
    ) zone ON true
    JOIN LATERAL (
      SELECT (now() AT TIME ZONE zone.timezone_name)::date AS day_key
    ) local_day ON true
    JOIN LATERAL (
      SELECT (
        local_day.day_key::timestamp
        + make_interval(mins => COALESCE(u.goal_reminder_local_minutes, 1140))
      ) AT TIME ZONE zone.timezone_name AS scheduled_for
    ) scheduled ON true
    LEFT JOIN LATERAL (
      SELECT enabled, goal_weekdays, goal_days_per_week FROM user_study_goal_versions
      WHERE user_id = u.id AND effective_from_day <= local_day.day_key
      ORDER BY effective_from_day DESC LIMIT 1
    ) goal ON true
    LEFT JOIN LATERAL (
      SELECT introduced_words, resolved_new_target, reviewed_words, resolved_review_target
      FROM user_day_stats
      WHERE user_id = u.id AND day_key = local_day.day_key
    ) today ON true
    WHERE u.goal_reminder_enabled AND u.goal_reminder_local_minutes IS NOT NULL
    ORDER BY u.goal_reminder_local_minutes
  `;
  if (rows.length === 0) {
    note("nobody has a reminder time set");
    return;
  }
  const gates = [
    "intro_answered", "has_device", "goal_enabled", "weekday_ok",
    "day_not_met", "week_not_finished", "not_yet_claimed_today",
  ] as const;
  for (const row of rows) {
    const blocked = gates.filter((gate) => row[gate] === false);
    const window = row.in_window ? "IN WINDOW NOW" : "outside its 15-min window";
    console.log(
      `\n  ${row.email}  reminder ${row.reminder_at}, local now ${row.local_now} (${row.timezone})`
    );
    note(window);
    if (blocked.length === 0) note("all gates pass");
    else note(`blocked by: ${blocked.join(", ")}`);
    if (row.day_not_met === false) {
      // The day is earned by counted answers, never by opening the app: this
      // says how far past the line the learner already is.
      note(
        `today already met: new ${row.introduced_words}/${row.resolved_new_target}`
        + `, repeats ${row.reviewed_words}/${row.resolved_review_target}`
      );
    }
  }
}

async function main() {
  try {
    const [{ url }] = await sql<{ url: string }[]>`
      SELECT current_setting('server_version') AS url
    `;
    console.log(`[db]     ${connectionString!.replace(/:\/\/[^@]*@/, "://…@")}  (postgres ${url})`);

    await checkSchema();
    await checkCron();
    await checkEdgeResponses();
    await checkSubscriptions();
    await checkDeliveries();
    await checkWhoIsDue();

    console.log();
    if (problems === 0) {
      console.log("[result] every link in the reminder chain is in place");
      return;
    }
    console.log(`[result] ${problems} broken link(s) above — start with the first MISS`);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

void main();
