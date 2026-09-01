# Admin Feature

Owns editor-only operational statistics.

- `app/admin/stats/page.tsx` is the route composition shell.
- `features/admin/components/AdminStatsPage.tsx` renders the dashboard.
- `features/admin/client/useAdminStats.ts` owns loading, authorization/error
  states, refresh, and activity-window selection.
- `features/admin/types.ts` is the client/server statistics contract.
- `app/api/admin/stats/route.ts` authorizes editors and returns the query result.
- `app/admin/moderation/page.tsx` and `app/api/admin/moderation/reports/*`
  provide the editor-only public-content review queue.
  Moderators keep internal notes separate from the public decision reason and
  optional explanation shown to reporters and affected list owners.
- `lib/db/queries/usage-stats.ts` contains the database aggregation.

The Languages section is keyed on the *studied* language: a review event joined
through its item to that item's list, which is where the direction lives. The
"set up" column beside it is `users.language_from/language_to`, i.e. the
direction chosen in the app whether or not anything was ever studied in it — a
language with subscribers and no studying shows up as the gap between the two.
`cz` is folded into `cs` the way `word_lists` already folds it.

An "active day" in the per-user table is a day the account was in the app at
all, counted in the account's own local day: days with a review (`local_day_key`)
unioned with days with a measured `activity_segments` row. It is deliberately not
`review_events.server_created_at`'s UTC date, which is the day the outbox
flushed and scored a day spent adding words as zero. `activity_segments` arrives
with a hand-applied migration, so that union runs as its own guarded query and
degrades to the review-only count.

The Study goals section reads `user_study_goal_versions` for the version in
force today (the newest row with `effective_from_day <= today` — never a version
scheduled for tomorrow) and `user_day_stats` for how the trailing 30 local days
went. Adherence is met days over the *prorated* promise: the goal is n days a
week, so each tracked day is worth `goal_days_per_week / 7` of a promised day.
That keeps a four-days-a-week learner who studied four days at 100 % rather than
57 %, and it follows a goal that changed mid-window because the day rollup
snapshots `goal_days_per_week` per day. Only days with a real snapshot and
`goal_status = 'active'` count: `user_day_stats` also holds measurement-only rows
written before any goal existed. Over 100 % is possible and means the learner
studied more days than they promised.

The "who to write to" table renders from a column list, and the reader chooses
which columns show. The choice lives in `localStorage` under
`get-word-admin-stats-hidden-columns` — per browser, never synced — and stores
what is *hidden*, so a column added later shows up by default instead of being
silently missing for everyone who ever touched the picker.

The Word Chat section reports current UTC calendar-month input/output tokens and
estimated USD spend from `word_chat_usage`, including device-only accounts that
made a paid call. The per-account monthly ceiling comes from
`WORD_CHAT_MONTHLY_SPEND_LIMIT_USD` (default: 2 USD).

Keep authorization in the API shell and database aggregation out of client UI.
