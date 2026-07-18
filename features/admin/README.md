# Admin Feature

Owns editor-only operational statistics.

- `app/admin/stats/page.tsx` is the route composition shell.
- `features/admin/components/AdminStatsPage.tsx` renders the dashboard.
- `features/admin/client/useAdminStats.ts` owns loading, authorization/error
  states, refresh, and activity-window selection.
- `features/admin/types.ts` is the client/server statistics contract.
- `app/api/admin/stats/route.ts` authorizes editors and returns the query result.
- `lib/db/queries/usage-stats.ts` contains the database aggregation.

Keep authorization in the API shell and database aggregation out of client UI.
