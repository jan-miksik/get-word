# Study reminder scheduler

This function sends a Web Push reminder at most once per account and local day.
It is invoked every ten minutes by [`../../cron-study-reminders.sql`](../../cron-study-reminders.sql).

Deploy it after applying the Drizzle migrations:

```sh
supabase secrets set \
  STUDY_REMINDER_CRON_SECRET='a-long-random-secret' \
  WEB_PUSH_VAPID_SUBJECT='mailto:ops@example.com' \
  WEB_PUSH_VAPID_PUBLIC_KEY='...' \
  WEB_PUSH_VAPID_PRIVATE_KEY='...'
supabase functions deploy send-study-reminders --no-verify-jwt
```

Then create `project_url` and `study_reminder_cron_secret` in Supabase Vault
and run `supabase/cron-study-reminders.sql` in the SQL editor. The public VAPID
key is the only key exposed to the browser, as
`NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY`.
