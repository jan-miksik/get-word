# Moving iOS learners off the home-screen web app

Everyone who installed Get Word on iOS before the App Store build landed
(2026-08-28) is running a home-screen web app we no longer promote and can no
longer see. This is what we do about it, and why the obvious stronger options
were rejected.

## What the situation actually is

An installed iOS web app is not a stale bookmark. It is a real install with two
concrete problems:

- **Two reminders a day, for anyone who has both.** The home-screen web app
  receives server-sent Web Push (Safari allows it only from a home-screen app,
  iOS 16.4+); the App Store build schedules its own notifications locally
  through `@capacitor/local-notifications`. Neither side can see the other, so
  nothing de-duplicates them. Migration 0071 makes the two agree about when a
  week is finished, which is as far as that can go.
- **It updates on Safari's terms.** A learner can sit on an old build
  indefinitely, and we cannot tell that they are.

What it is *not* is a notification dead end. That was the assumption when the
production runbook was first written, and it is wrong: on iOS these installs are
the only ones browser push reaches at all. The reason to move them is that the
App Store build is the supported one, not that they are missing reminders today.

## Why they hear nothing right now

`resolveAppInstallPlan` in [`lib/app-install.ts`](../lib/app-install.ts) treats
`isInstalled` as "nothing left to offer", which is correct on every platform
except this one. So the top menu, Settings, the intro card and the onboarding
step have all been silent for exactly the people who need telling.

## What we do

Two surfaces, both driven by `resolveIosPwaMigration` in the same file, so they
cannot drift apart from each other or from the install offer:

1. **A one-time card in the deck** —
   [`IosAppStoreMigrationCard`](../features/learning/components/IosAppStoreMigrationCard.tsx),
   built by `useIosAppStoreMigrationCard`. Three numbered steps: install from the
   App Store, sign in with the same account, **delete the old icon**. The third
   step is the one that matters — without it the learner ends up in the
   double-reminder state above. A note says that anything held only on the
   device (Photo Lab photos, frontier toggles, the chosen view mode) stays
   behind; words and progress are on the account and are already there.
2. **A permanent row in Settings → App** — the branch in
   [`PWAInstallSection`](../components/PWAInstallSection.tsx) that used to show
   "Installed ✓". Someone who waved the card away can still find the way across.

The card's answer is remembered in `localStorage`
(`get-word-ios-app-store-migration-answered`), per device rather than per
account, because a home-screen install is a property of the device.

## What we deliberately did not do

- **A banner that stays until they switch.** We cannot detect the switch from
  this side, so "until they switch" means "forever" — including for everyone who
  already did as asked. That turns a helpful nudge into a permanent scold.
- **Blocking or degrading the web app.** It works. Breaking it to force a move
  punishes early adopters for having installed the thing we asked them to
  install.

## The known gap, if we want to close it later

Nothing tells the home-screen app that this account has since opened the App
Store build, so a learner who clears site data sees the card once more, and the
Settings row never turns into a tick. Closing that means a server-side marker —
a `users.native_app_seen_at`-style column written by the native runtime through
`/api/sync`, which the web app then reads to suppress both surfaces. That is a
migration plus a field in the sync protocol, and it was deliberately deferred:
the `localStorage` answer covers the common case, and the cost of being wrong is
one card shown a second time.

The same marker would also let us measure the migration, which we currently
cannot do at all — the only signal available today is `web_push_subscriptions`
rows with an iOS user agent slowly expiring (410) as icons are deleted.

## Related

- [`push-notifications-production.md`](push-notifications-production.md) — the
  double-reminder interaction, in the reminders context.
- [`ios-release-plan.md`](ios-release-plan.md) — the App Store build itself.
