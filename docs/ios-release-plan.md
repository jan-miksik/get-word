# iOS release plan

Everything left before Get Word is on the App Store, split by who does it.
Written 2026-07-31.

> This is the historical first-release plan. For every current TestFlight build,
> use the authoritative repeat-release runbook in
> [`../mobile/README.md`](../mobile/README.md#testflight-release-runbook).

## Where we are

Done:

- Native Apple sign-in, exchanged for a Get Word bearer session in the Keychain.
- Native passwordless email sign-in, using the same one-time-code flow as the
  web app. Google OAuth remains web-only for version 1.0.
- Reusable App Review email/password sign-in, using credentials supplied only
  through App Store Connect and the regular email form (no password is embedded
  in the app and there is no separate reviewer-only link).
- The shared web learning UI runs inside the Capacitor bundle — one UI, two
  builds. Verified against a dev server.
- CORS for `capacitor://localhost` deployed and verified on getword.app.
- `Info.plist`: camera and photo-library usage strings, encryption exemption,
  iPhone portrait only / iPad all four orientations.
- `PrivacyInfo.xcprivacy` is included in the app target, declares the six
  collected data types used by the app, and declares no tracking. Capacitor's
  two frameworks ship their own manifests; the remaining native plugins were
  checked for required-reason API use.
- Account deletion is live on production (every migration through 0056).
- Sign in with Apple token revocation is configured in production and migration
  0057 (`users.apple_refresh_token`) is applied.
- Apple Developer portal set up; App ID `app.getword` with Sign in with Apple.
- Age rating answered in App Store Connect.
- `https://getword.app/support` exists and is linked from the landing footer.
- Store listing copy drafted in [`app-store-listing.md`](app-store-listing.md).
- Native routes now cover learning, lists, shared-list joins, reports, privacy,
  and the teacher overview. `/join/{token}` Universal Links are validated before
  they enter the app, and the required AASA file and entitlement are present.
- PWA install prompts are disabled in the Capacitor build, and the status-bar
  icon style follows light and dark native routes.

Xcode target is already correct: bundle ID `app.getword`, automatic signing with
team `HLWJ75QQ8B`, `TARGETED_DEVICE_FAMILY = "1,2"` (iPhone + iPad), deployment
target iOS 15.

---

## Public 1.0 gate — 2026-08-03

Build 5 was a TestFlight build. Two things had to change in code before the same
app can go in front of the public store, plus a set of console-only fields.

Done in code (build 6):

- **The "Beta" badge is gone** from the top bar. Guideline 2.2 keeps beta,
  demo, and trial versions in TestFlight rather than the App Store, and the
  badge said "beta" on every screen and in the iPad screenshots.
- **Lists can no longer be published by their author.** Guideline 1.2 wants
  user-generated content filtered *before* it is published, not only reported
  afterwards. `canPublishPublicList()` in [`lib/auth.ts`](../lib/auth.ts) is the
  single knob: publishing is editor-only, and every write path that could set
  `is_public` honours it — list create, list update, the word-chat commit, and
  the `promote-common` route (which now also refuses anything that was not
  generated). Reporting and blocking are unchanged; the `/join/{token}` link
  still shares a private list with named people, which is a capability rather
  than published content.
- **The public release candidate will be build 11**, marketing version stays 1.0.
- **Screenshots**: [`scripts/prepare-app-store-screenshots.ts`](../scripts/prepare-app-store-screenshots.ts)
  strips the alpha channel every iOS capture carries and verifies the slot's
  pixel dimensions. Captures live in `app-store-assets/<slot>/`, uploadables in
  `app-store-assets/upload/<slot>/`. The current iPad captures no longer show
  the Beta badge; the iPhone set still needs to be captured for build 11.

Still to do by hand: the gate stops new publications, but anything a learner
published before it went in is still public. Audit production once and unpublish
or review what comes back:

```sql
select l.id, l.name, l.owner_id, u.email, l.created_at
from word_lists l
join users u on u.id = l.owner_id
where l.is_public
  and u.user_role <> 'editor'
order by l.created_at desc;
```

Loosening the publish gate later means either an editor-approval queue or
pre-publication filtering plus follow-up moderation; the constant is that
nothing user-written reaches the public list library unreviewed.

---

## Part A — your side

### A1. Reserve the name and create the app record — do this first

In App Store Connect, create the app: platform iOS, bundle ID `app.getword`,
name **Get Word**, primary language English (U.S.), plus an SKU of your choice.

Why first: the name is reserved the moment the record is created, and **"Get
Word" may already be taken** by another developer. If it is, the listing copy
needs a different name and everything downstream shifts. Better to find out now
than the evening before submitting.

### A2. Agreements, Tax, and Banking

Business → Agreements. The **Free Apps agreement** has to be active or the app
cannot be distributed even for free. Bank details and tax forms are only needed
if you ever charge, so skip them for now.

Also confirm the Apple Developer Program membership is paid and not near expiry
— an expired membership pulls published apps from sale.

### A3. Review the listing copy

Go through [`app-store-listing.md`](app-store-listing.md) and edit anything that
does not sound like you. It is a draft, not a proposal to accept as-is. Then
paste it into App Store Connect for both English and Czech.

Watch the two length-limited fields: subtitle 30 characters, keywords 100. The
drafts fit, but any edit can push them over.

### A4. Confirm the App Privacy answers

App Store Connect → Apps → Get Word → **App Privacy** in the left sidebar →
**Get Started**. Select "Yes, we collect data from this app", then configure
each data type in the draft and publish the answers. Add
`https://getword.app/privacy` through **Privacy Policy → Edit** on the same
page.

The same document has a draft table of data types. Read it against
`https://getword.app/privacy` and correct anything that is wrong before you
submit the questionnaire — a wrong answer here is a compliance problem, not a
formatting one.

### A5. Sign in with Apple: confirm the capability and the Supabase provider

Both are already set, but they are worth re-checking after any certificate work,
because a mismatch produces the "Unacceptable audience in id_token" error you
already hit once: the App ID has Sign in with Apple enabled, and the production
Supabase Apple provider lists `app.getword` in Client IDs.

### A6. Approve screenshots

I will produce them from the simulator; you pick which ones ship and whether
they get captions. Apple currently takes one iPhone size and one iPad size and
scales the rest — confirm the required dimensions in App Store Connect when you
upload, since Apple changes this.

### A7. TestFlight on your own devices

Once I upload the first build, install it from TestFlight on a real iPhone and a
real iPad and use it for a couple of days. The simulator does not reproduce
touch handling, the on-screen keyboard, real network conditions, or the camera —
and the camera is exactly what Photo Lab needs.

Specifically worth trying on device: sign in, study a full session with audio,
create a list, Photo Lab with the real camera, delete the account, sign in again.

### A8. Submit, then answer the reviewer

Submissions are usually answered within a day or two. If it comes back rejected,
the reply is a conversation, not a verdict — most rejections are one clarifying
answer away from resolved. Send me whatever they write and I will fix the code
side.

### A9. Decide how it goes live

Manual release means you press the button once it is approved. Automatic means
it appears the moment review passes. Manual is the safer default for a first
release.

### A10. Create the Sign in with Apple key and deploy it — done

Apple Developer portal → Certificates, Identifiers & Profiles → Keys → **+**.
Name it something like "Get Word sign-in", tick **Sign in with Apple**,
configure it for the primary App ID `app.getword`, and download the `.p8`.

**Apple lets you download that file exactly once.** Store it somewhere you will
still have it in two years.

Then set three production environment variables:

| Variable | Value |
| --- | --- |
| `APPLE_TEAM_ID` | `HLWJ75QQ8B` |
| `APPLE_SIGN_IN_KEY_ID` | the Key ID shown next to the key |
| `APPLE_SIGN_IN_PRIVATE_KEY` | the entire contents of the `.p8`, `-----BEGIN PRIVATE KEY-----` included |

The private key may keep its real line breaks or use `\n` escapes; both are
accepted. `APPLE_CLIENT_ID` defaults to `app.getword` and only needs setting if
the bundle id ever changes.

Also apply **migration 0057** (`users.apple_refresh_token`) to production.

Confirmed by the owner on 2026-07-31: the production variables are deployed and
migration 0057 is applied. Keep the downloaded `.p8` backed up securely; Apple
does not allow it to be downloaded again.

---

## Part B — my side

### B1. Sign in with Apple token revocation — done and deployed

Implemented: the native client forwards Apple's one-time authorization code, the
server trades it for a refresh token, stores it encrypted, and posts it to
Apple's revoke endpoint when the account is deleted. Supabase could not do this
for us — the id_token sign-in never produces a refresh token on their side.

The required production key and database migration are now deployed. Re-test
one complete account deletion in the production iOS build before submission.

### B2. Privacy manifest — done

`PrivacyInfo.xcprivacy` declares the data types the app collects and no tracking,
and is registered in the Xcode Resources build phase. The checked application
and plugin code does not call a required-reason API. Capacitor and Cordova ship
their own valid manifests. Generate and review Xcode's aggregated privacy report
from the release archive before upload.

Its purpose flags match the App Privacy answers completed in App Store Connect:
email, user content, identifiers, and product interaction are used only for the
declared analytics, personalization, and/or app-functionality purposes.

### B3. Native routing and deep links — code done

Implemented native routes for `/lists`, integrated Photo Lab, `/join/{token}`,
`/reports`, `/privacy`, and `/school/overview`. Navigation now uses the real
WebView history. Universal Links accept only HTTPS Get Word share links, the
associated-domains entitlement is present, and
`public/.well-known/apple-app-site-association` contains the App ID.

Two activation steps remain outside the code: enable **Associated Domains** for
the `app.getword` identifier in Apple Developer/Xcode, then deploy the web
changes and verify that `https://getword.app/.well-known/apple-app-site-association`
returns the JSON directly with HTTP 200 and no redirect. Finally test one share
link from Notes or Messages on a physical device.

### B4. Native layout — mostly done, device pass remains

The shared shell already uses measured visual-viewport height, safe-area insets,
and an 800px maximum study width. The native status bar now switches icon style
for the dark privacy route. Verify every route in portrait on iPhone and both
orientations on iPad during B8; adjust only from observed device/simulator bugs.

### B5. Icons and launch screen — technically done, visual approval remains

The asset catalog contains the branded 1024×1024 icon; current Xcode generates
the iPhone and iPad variants from that single source. The launch storyboard is a
plain Get Word sand background, not the old Capacitor image. Confirm the icon
artwork itself before the release archive; optional dark/tinted variants can
follow later and do not block version 1.0.

### B6. Turn off the web-only paths in the native build — done

The native entry does not register the service worker, and the build-time native
flag suppresses the PWA onboarding, install menu item, settings section, and
banner while leaving the web build unchanged.

### B7. Localize the permission strings — done

English and Czech `InfoPlist.strings` are included in the target for both camera
and photo-library permission prompts.

### B8. Full pass in the simulator

Sign-in, study, lists, word chat, Photo Lab permission prompts, account
deletion, sign-out — against production.

### B9. Screenshots

Captured from the simulator at the required sizes, for you to approve.

### B10. Version and build numbers, then archive and upload

Use the repeat-release runbook in
[`../mobile/README.md`](../mobile/README.md#testflight-release-runbook). Build 11
was the original public-release target; later TestFlight uploads reached build
16. Always confirm the latest accepted number in App Store Connect and choose a
new, greater number before archiving.

---

## Order

```
A1 (name)  ─────────────────────────────► blocks nothing technical, but blocks the listing
A2 (agreements) ────────────────────────► blocks distribution

B1 (SIWA revocation) — done
B2 (privacy manifest) — done
B3 (routing code done; needs A: capability + deploy) ──┐
B4 (layout)                                        ├──► B8 (full pass) ──► B10 (upload) ──► A7 (TestFlight)
B5 (icons)                   │                                              │
B6 (disable PWA paths)       │                                              ▼
B7 (localized strings)     ──┘                       B9 (screenshots) ──► A3, A4, A6 ──► A8 (submit) ──► A9 (release)
```

The realistic critical path is activating B3, then B4–B8, then a build, then a few days of TestFlight
on real devices before submitting.

## Known risks

1. **The name may be taken.** A1 exists to find out early.
2. **Sign in with Apple revocation** is implemented and configured, but its
   production deletion path still needs an end-to-end test from the iOS build.
3. **Photo Lab widens the review surface** — camera permission, an AI provider,
   and user-generated content. It is in scope by your decision; if review pushes
   back, the fallback is to ship it in 1.1 rather than argue.
4. **User-generated content.** Public lists are shared between users, so review
   will look for reporting and blocking. Both exist; the reviewer notes point at
   them.
