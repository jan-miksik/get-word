# Study reminders in production — setup runbook

How to turn browser push reminders on for `getword.app`. Written as an ordered
procedure: everything in **Part A** can be done before anyone is affected,
**Part B** is the release itself, and **Part C** is the work that is only
possible once the new build is live.

Status when this was written: the feature is in the codebase and works on dev.
Nothing about production has been configured yet — no VAPID key pair exists, the
Edge Function is not deployed, and the cron job does not exist.

## The short version

Two scripts cover everything that can be automated. The prose below is what they
cannot do and why each step exists.

```bash
pnpm run push:vapid                              # generate the key pair, once
pnpm run db:prod -- push-setup                   # read-only: what is still missing
pnpm run db:prod -- push-setup --apply --yes     # Vault secrets + cron job
pnpm run db:prod -- push-setup --smoke           # call the deployed function once
```

The preflight names every missing link with the command that fixes it, and
derives the Supabase project from the connection string, so the Vault entry can
never end up pointing at a different project than the database it was written
to. `--smoke` claims real deliveries — anyone inside their fifteen-minute window
is reminded by that call.

The four steps it deliberately leaves to you: the Vercel environment variable
(it cannot see your Vercel account), `supabase secrets set` and
`supabase functions deploy` (both carry the private VAPID key, which should not
travel through another program's arguments), and creating a subscription from a
real browser.

Once reminders are live, diagnosing one that did not arrive is a different
script: `pnpm run check:reminders`.

## The moving parts

| Piece | Where it lives |
| --- | --- |
| Subscribe / unsubscribe in the browser | [`features/learning/goals/web-push.ts`](../features/learning/goals/web-push.ts) |
| Service worker `push` + `notificationclick` handlers | [`public/sw.js`](../public/sw.js) |
| Storing a subscription | [`app/api/goals/push-subscription/route.ts`](../app/api/goals/push-subscription/route.ts) |
| Who is due right now | `claim_due_web_push_reminders()` — [`drizzle/migrations/0078_study_reminder_language.sql`](../drizzle/migrations/0078_study_reminder_language.sql), which last redefined it (weekly quota: 0071) |
| The sender | [`supabase/functions/send-study-reminders/index.ts`](../supabase/functions/send-study-reminders/index.ts) |
| Notification copy, per language | [`supabase/functions/send-study-reminders/messages.ts`](../supabase/functions/send-study-reminders/messages.ts) |
| The ten-minute trigger | [`supabase/cron-study-reminders.sql`](../supabase/cron-study-reminders.sql) |

The delivery rule, so the tests below make sense. Every ten minutes the Edge
Function asks Postgres for accounts that, **in their own timezone**, satisfy all
of:

- `users.goal_reminder_enabled` and `users.goal_reminder_intro_answered`
- a `user_study_goal_versions` row with `enabled`, effective today
- today is in `goal_weekdays` (or the list is null)
- now is between the reminder time and **15 minutes after it**
- today's `user_day_stats` row is not `met`
- fewer than `goal_days_per_week` days have already been met this ISO week
- the account has at least one row in `web_push_subscriptions`
- no `web_push_reminder_deliveries` row exists for `(user_id, today)`

`users.timezone` falling back to `UTC` when empty is worth remembering — an
account with no timezone gets reminded on UTC time.

## Ordering constraint (the one thing that cannot be reordered)

`NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY` is a `NEXT_PUBLIC_` variable, so Next.js
**inlines it at build time**. Setting it in Vercel does nothing until the next
deploy. So the key pair has to exist *before* the release build, not after.

Rotating the key later is not free either: every subscription in
`web_push_subscriptions` was minted against the old key and becomes
undeliverable. The client now detects this (`subscriptionMatchesKey` in
`web-push.ts`) and silently re-subscribes, but the stale server rows sit there
failing until each device comes back. Generate the pair once and keep it.

---

## Part A — before the release (nothing user-visible)

Every step here is safe to do days ahead. Without a deployed public key no
browser can subscribe, so the tables stay empty and the sender has nothing to
claim.

### A1. Generate the VAPID key pair

```bash
pnpm run push:vapid
```

(A plain P-256 key pair; the script prints where each half goes. `npx web-push
generate-vapid-keys` produces the same thing if you would rather not trust ours.)

Keep both halves in the password manager. The **public** key goes to Vercel and
Supabase; the **private** key goes to Supabase Edge secrets only and must never
appear in a `NEXT_PUBLIC_` variable, in the repo, or in the client bundle.

### A2. Get the production schema to 0066–0072 and 0078

The push tables and the claim function arrive with migrations 0066–0072; 0078
adds the learner's interface language to the claim. Check
what production actually has — not what the ledger claims, which has been wrong
before:

```bash
DATABASE_URL='<prod direct connection string>' pnpm run check:goal-release
```

If anything reports `MISS`, back up first, then migrate:

```bash
pnpm run db:prod:backup
pnpm run db:prod:migrate
```

Two cautions:

- `db:prod:migrate` applies **everything** pending, not just 0066–0072. If
  production is far behind, read the intervening migrations first — several of
  them (0067 study goals, 0069 weekdays, 0073 typing/audio, 0074–0076 surveys)
  belong to features that ship at the same time as this one.
- If `db:migrate` reports "nothing to do" while `check:goal-release` still says
  `MISS`, the ledger is lying. Run the file directly:
  `psql "$DATABASE_URL" -f drizzle/migrations/0071_study_reminder_weekly_quota.sql`

Re-run `check:goal-release` until it prints `all … objects from 0066–0072 and
0078 are present`.

### A3. Enable `pg_cron` and `pg_net` on the production project

`pnpm run db:prod -- push-setup --apply --yes` creates both if the role is
allowed to; otherwise Supabase dashboard → **Database → Extensions**. `pg_cron`
schedules the job, `pg_net` makes the HTTP call to the function. Enabling them
does nothing on its own.

### A4. Deploy the Edge Function with its secrets

```bash
supabase link --project-ref <prod-project-ref>
supabase secrets set \
  STUDY_REMINDER_CRON_SECRET="$(openssl rand -base64 32)" \
  WEB_PUSH_VAPID_SUBJECT='mailto:jan.miksik.g@gmail.com' \
  WEB_PUSH_VAPID_PUBLIC_KEY='<public key from A1>' \
  WEB_PUSH_VAPID_PRIVATE_KEY='<private key from A1>'
supabase functions deploy send-study-reminders --no-verify-jwt
```

`--no-verify-jwt` is deliberate — the function authenticates itself with the
`x-study-reminder-cron` header instead, and `supabase/config.toml` already
records `verify_jwt = false`. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are
injected by Supabase; do not set them.

Deploying is harmless at this point. Nothing calls the function yet, and if
something did it would claim zero rows.

Smoke-test that it is reachable and that the secret gate works:

```bash
curl -i -X POST "https://<prod-ref>.supabase.co/functions/v1/send-study-reminders" \
  -H 'Content-Type: application/json' -d '{}'
```

Expect `401 {"error":"Unauthorized"}`. With the correct header it should return
`{"claimed":0,"sent":0,"failed":0,"expired":0}`.

### A5. Create the Vault secrets

`pnpm run db:prod -- push-setup --apply --yes` writes both, asking for the cron
secret with hidden input, and checks that `project_url` matches the project the
database belongs to. By hand it is Dashboard → **Project Settings → Vault**, two
entries named exactly:

- `project_url` → `https://<prod-project-ref>.supabase.co`
- `study_reminder_cron_secret` → the same value as `STUDY_REMINDER_CRON_SECRET`

The cron SQL reads both by name; a typo shows up only as a silent 401 every ten
minutes.

### A6. Put the public key in Vercel

Vercel → project → **Settings → Environment Variables**, Production scope:

```
NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY=<public key from A1>
```

Do **not** redeploy yet if the app code is not ready — but note that until a new
build runs, the app keeps reporting `goal.reminderUnconfigured` ("this build has
no VAPID key"), which is the correct message.

Nothing else needs to change in Vercel. `NEXT_PUBLIC_DEV_SERVICE_WORKER` is a
local-development variable and must stay unset in production.

---

## Part B — the release

1. Commit and ship the working-tree push work: the `push-only` service-worker
   mode in `public/sw.js` + [`lib/pwa-service-worker.ts`](../lib/pwa-service-worker.ts),
   the finer failure states in `web-push.ts` (`push-blocked` /
   `no-service-worker` / `save-failed`) and their strings in
   `lib/i18n/locales/*`.
2. `pnpm run check` locally, then deploy to production.
3. After the deploy, confirm the key really made it into the bundle — an env var
   set in the dashboard proves nothing until a build inlines it. Open
   `https://getword.app` → Settings → study reminders and turn them on. A build
   without the key refuses with a named message ("Push zprávy nejsou v této
   verzi aplikace nakonfigurované"), so this one toggle is the whole check.

---

## Part C — only after the deploy

### C1. Create the first real subscription

On a production browser (desktop Chrome is the easiest), signed in:
Settings → study goal → enable reminders, allow the permission prompt. Then
check the row landed:

```sql
SELECT id, user_id, left(endpoint, 60) AS endpoint, user_agent, created_at
FROM web_push_subscriptions ORDER BY created_at DESC LIMIT 5;
```

No row means the browser subscribed but the save failed — the UI now says so
("Připomínky se nepodařilo uložit") instead of blaming the browser.

### C2. Force one delivery by hand, before the cron exists

Set the reminder time in Settings to two or three minutes in the future, make
sure today is a goal weekday and the day is not met yet, wait until the reminder
time has passed, then call the function manually:

```bash
curl -s -X POST "https://<prod-ref>.supabase.co/functions/v1/send-study-reminders" \
  -H 'Content-Type: application/json' \
  -H "x-study-reminder-cron: $STUDY_REMINDER_CRON_SECRET" -d '{}'
```

Expect `{"claimed":1,"sent":1,...}` and a notification on the device. Note the
service worker deliberately **suppresses the notification when a Get Word window
is visible**, so put the browser in the background or minimise it first.

If it claims 0, walk the delivery rule above with this query — it names the
account state the function is reading:

```sql
SELECT u.id, u.timezone, u.goal_reminder_enabled, u.goal_reminder_intro_answered,
       u.goal_reminder_local_minutes,
       (now() AT TIME ZONE COALESCE(NULLIF(u.timezone,''),'UTC'))::time AS local_now,
       g.enabled, g.goal_weekdays, g.goal_days_per_week,
       d.met AS today_met,
       (SELECT count(*) FROM web_push_subscriptions s WHERE s.user_id = u.id) AS subs,
       (SELECT count(*) FROM web_push_reminder_deliveries r
         WHERE r.user_id = u.id
           AND r.day_key = (now() AT TIME ZONE COALESCE(NULLIF(u.timezone,''),'UTC'))::date
       ) AS already_sent_today
FROM users u
LEFT JOIN LATERAL (
  SELECT * FROM user_study_goal_versions v WHERE v.user_id = u.id
  ORDER BY v.effective_from_day DESC LIMIT 1
) g ON true
LEFT JOIN user_day_stats d
  ON d.user_id = u.id
 AND d.day_key = (now() AT TIME ZONE COALESCE(NULLIF(u.timezone,''),'UTC'))::date
WHERE u.email = '<your prod email>';
```

To retest on the same day, delete the dedupe row — the unique key is
`(user_id, day_key)`:

```sql
DELETE FROM web_push_reminder_deliveries
WHERE user_id = '<uuid>' AND day_key = current_date;
```

### C3. Schedule the cron

Only once a manual call has actually delivered. `push-setup --apply --yes` runs
[`supabase/cron-study-reminders.sql`](../supabase/cron-study-reminders.sql) for
you and then prints the last few runs; the file is idempotent (it unschedules
before scheduling), so applying it twice is how a broken job gets replaced. By
hand, run it in the SQL editor. Verify:

```sql
SELECT jobid, jobname, schedule, active FROM cron.job
WHERE jobname = 'send-study-reminders-every-10-minutes';

SELECT status, return_message, start_time
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job
               WHERE jobname = 'send-study-reminders-every-10-minutes')
ORDER BY start_time DESC LIMIT 10;
```

A `succeeded` row every ten minutes with no `return_message` error is the
healthy state. The function's own log (Dashboard → Edge Functions → Logs) shows
the claim/sent counts.

### C4. Watch for a day

- Edge Function logs: `[study-reminders] push delivery failed` should be rare;
  `expired` counts are normal and self-healing (the row is deleted).
- Endpoint churn:

  ```sql
  SELECT count(*) FILTER (WHERE failure_count > 0) AS failing, count(*) AS total
  FROM web_push_subscriptions;
  ```

- Delivery volume per day:

  ```sql
  SELECT day_key, count(*) FILTER (WHERE sent_at IS NOT NULL) AS sent, count(*) AS claimed
  FROM web_push_reminder_deliveries GROUP BY day_key ORDER BY day_key DESC LIMIT 7;
  ```

---

## Kill switch

Fastest way to stop all reminders without a deploy:

```sql
SELECT cron.unschedule('send-study-reminders-every-10-minutes');
```

Rotating `STUDY_REMINDER_CRON_SECRET` in Edge secrets without updating the Vault
copy has the same effect, less obviously. Removing the Vercel env var stops new
subscriptions at the next build but does not stop sending to existing ones.

## Known limits, decide before or after as you like

- **Notification copy lives twice.** A push payload is built on the server, so
  the service worker cannot localise it — the copy is chosen in the Edge
  Function from `users.settings_language` (migration 0078 carries it out of the
  claim) and falls back to English for a language it has no copy of. That makes
  `supabase/functions/send-study-reminders/messages.ts` a second copy of the
  `goal.reminderPush*` keys in `lib/i18n/locales/*`;
  `features/learning/goals/__tests__/reminder-push-copy.test.ts` fails if they
  drift. **Changing the wording therefore needs both a deploy and
  `supabase functions deploy send-study-reminders`** — the app deploy alone
  changes nothing about what is sent.
- **On iOS, browser push reaches exactly the people we stopped inviting.**
  Safari allows Web Push only from a home-screen PWA (iOS 16.4+), and the iOS
  PWA route was dropped in August 2026 in favour of the App Store build. So
  nobody new can end up on this path, while the learners who installed the PWA
  earlier are the one iOS group these server-sent reminders do reach. Everyone
  else on iOS — Safari tab, App Store build — is served by the local scheduler
  (`packages/product/shared/notifications/scheduler.ts`) through
  `NotificationPort`; migration 0071 exists precisely so both paths stop nudging
  on the same day.
- **Someone holding both the old PWA and the App Store build is reminded
  twice** — once by server push, once by the local schedule. There is no way to
  detect the pair from either side, so moving those learners over has to include
  deleting the home-screen icon. See
  [`ios-pwa-to-app-store.md`](ios-pwa-to-app-store.md).
- **Android TWA** delivers site notifications through Chrome; the Play listing's
  notification permission is what the user sees. Verify on a real installed TWA,
  not only in mobile Chrome.
- **Brave** ships with the Google push service off. The app already detects this
  and says what to switch on (`goal.reminderLocalOnly*`).
- **One reminder per account per day, 15-minute window.** A device that is
  offline for those 15 minutes gets nothing that day; the push TTL is one hour,
  so a device that comes back inside the hour still receives it.
