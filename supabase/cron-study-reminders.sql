-- Run once in the hosted Supabase SQL editor after deploying the
-- `send-study-reminders` Edge Function and creating the Vault secrets named
-- below. The `cron.schedule` call is deliberately not in a Drizzle migration:
-- its project URL and secret are deployment-specific, not application schema.
--
-- Required Vault secrets:
--   project_url                 https://<project-ref>.supabase.co
--   study_reminder_cron_secret  random value also stored as an Edge secret
--
-- Required Edge secrets:
--   STUDY_REMINDER_CRON_SECRET
--   WEB_PUSH_VAPID_SUBJECT      mailto:ops@example.com
--   WEB_PUSH_VAPID_PUBLIC_KEY
--   WEB_PUSH_VAPID_PRIVATE_KEY
-- Supabase automatically provides SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
-- to deployed Edge Functions.

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'send-study-reminders-every-10-minutes';

SELECT cron.schedule(
  'send-study-reminders-every-10-minutes',
  '*/10 * * * *',
  $$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
        || '/functions/v1/send-study-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-study-reminder-cron',
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'study_reminder_cron_secret')
      ),
      body := '{}'::jsonb
    );
  $$
);
