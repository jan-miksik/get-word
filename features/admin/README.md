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

The Word Chat section reports current UTC calendar-month input/output tokens and
estimated USD spend from `word_chat_usage`, including device-only accounts that
made a paid call. The per-account monthly ceiling comes from
`WORD_CHAT_MONTHLY_SPEND_LIMIT_USD` (default: 2 USD).

Keep authorization in the API shell and database aggregation out of client UI.
