# Schools Feature

Owns the school pilot: access codes, memberships, entitlements, metered AI
allowances, and the per-school usage dashboard.

- `server/code.ts` — access-code generation, hashing, validation.
- `server/redeem.ts` — code redemption, seat/teacher limits, membership creation.
- `server/entitlements.ts` — the active membership → plan limits lookup.
- `server/config.ts` — `SCHOOL_PLAN_LIMITS` keyed by **plan then role**.
- `server/feature-usage.ts` — reserve/refund of `school_feature_usage`.
- `server/translation-requests.ts` — idempotent AI translation requests.
- `client/useSchoolStats.ts`, `components/SchoolStatsPage.tsx` — the dashboard.
- `components/AdminSchoolsPage.tsx` — editor-only school picker.
- Aggregation lives in `lib/db/queries/school-usage-stats.ts`; authorization
  stays in the route shells (`app/api/schools/me/stats`,
  `app/api/admin/schools/*`).

## Access codes

Codes are stored only as an unkeyed SHA-256 digest (`server/code.ts`). No secret
keys the hash: a generated code carries ~100 bits, so a key would only add
precomputation resistance that nothing here needs, while making the digest
environment-bound — a code issued from a shell holding the wrong secret used to
be written happily and then rejected at redeem as invalid. Hand-written `--code`
values are the one guessable input, so `scripts/school-access.ts` refuses them
against a production database.

A redeem link may name a list: `/school/redeem#CODE?list=<list-uuid>`. Redeeming
it also subscribes the new member to that list and sets their study direction
from it, so a class link opens on the right material instead of an empty app.
One code can therefore serve several classes — the code grants the seat, the
link decides the material. Without the parameter the redeem is exactly the plain
join it always was.

The list id is in the fragment, next to the code, so neither reaches a server
log or a `Referer` header; it is not a real query string and `useSearchParams`
never sees it.

Because the id comes from the URL, it is chosen by whoever follows the link, and
subscribing through it bypasses the public/owner visibility check. `redeem.ts`
therefore accepts a list only if it is public or **owned by a teacher of the
school being joined** — otherwise a school code would be a key to any private
list whose id leaked. Anything that does not line up (unknown id, deleted list,
the redeemer's own list, a list from elsewhere) is a silent no-op: the seat is
what the code grants and must not depend on the rest.

## Metering

`school_feature_usage` is the single source of truth for per-member monthly
allowances (`ai_translation`, `photo_lab`). Its conditional UPDATE both reserves
and enforces the limit atomically, so no rate-limit bucket may hold the same
number — `oauth_rate_limits` only carries the global daily cap.

Refunds follow the translation semantics: any **observed** provider failure —
an HTTP error, a truncated body, an unparseable payload — produced nothing the
user can use, so the reservation goes back (`released`). Only an ambiguous
**transport** failure, where we cannot tell whether the provider ran, keeps the
allowance spent (`unknown`).

The quota row is unique on `(user_id, feature, period_start)` — the quota is per
user per month and a school transfer must not reset it. `school_id` records
which school the row is billed to, so **a member who transfers mid-month has
that whole month attributed to their latest school**.

## Dashboard semantics

Three kinds of metric with three different filters:

1. **Current state** (seats, member rows, who is at their limit) — active
   memberships only.
2. **Historical events** (reviews, joins, lists created) — the event must fall
   inside a membership interval. Activity before joining does not count towards
   the school, and revoking a membership does not erase the school's past.
   Activity metrics additionally clamp `user_devices.last_seen_at >= claimed_at`.
3. **Usage billed to the school** — filtered by `school_id` on the usage rows,
   never through current membership: a member who has since left still cost the
   school their quota.

"School lists" means lists a **teacher** created while a teacher of this school.
Private lists are counted but never named — a teacher must not see the titles of
anyone's personal content.

Member rows are **pseudonymized**, not anonymous: no name, e-mail or user id,
day-granularity dates, and a positional `ordinal` that is renumbered when a
member leaves. In a small class an attentive teacher may still recognize
someone, which is why identity is never added on top.

Access: teachers see their own school at `/school/overview` (students get 403);
editors see any school at `/admin/schools/[schoolId]`.
