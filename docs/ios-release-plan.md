# iOS release plan

Everything left before Get Word is on the App Store, split by who does it.
Written 2026-07-31.

## Where we are

Done:

- Native Apple sign-in, exchanged for a Get Word bearer session in the Keychain.
- The shared web learning UI runs inside the Capacitor bundle — one UI, two
  builds. Verified against a dev server.
- CORS for `capacitor://localhost` deployed and verified on getword.app.
- `Info.plist`: camera and photo-library usage strings, encryption exemption,
  arm64, iPhone portrait / iPad all four orientations.
- Account deletion is live on production (every migration through 0056).
- Apple Developer portal set up; App ID `app.getword` with Sign in with Apple.
- Age rating answered in App Store Connect.
- `https://getword.app/support` exists and is linked from the landing footer.
- Store listing copy drafted in [`app-store-listing.md`](app-store-listing.md).

Xcode target is already correct: bundle ID `app.getword`, automatic signing with
team `HLWJ75QQ8B`, `TARGETED_DEVICE_FAMILY = "1,2"` (iPhone + iPad), deployment
target iOS 15.

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

### A10. Create the Sign in with Apple key and deploy it

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

Until all of this is live, account deletion works but revokes nothing, which is
the case Apple can reject.

---

## Part B — my side

### B1. Sign in with Apple token revocation — done, needs a key from you

Implemented: the native client forwards Apple's one-time authorization code, the
server trades it for a refresh token, stores it encrypted, and posts it to
Apple's revoke endpoint when the account is deleted. Supabase could not do this
for us — the id_token sign-in never produces a refresh token on their side.

**Your part (A10 above):** the exchange needs a Sign in with Apple key
from the developer portal. Until it is deployed, every Apple call is a logged
no-op, so nothing breaks — but nothing is revoked either.

### B2. Privacy manifest

`PrivacyInfo.xcprivacy` declaring the data types we collect and the
required-reason APIs we call, registered in `project.pbxproj` (a classic Xcode
project, so a new resource needs a file reference, a build file, and a Resources
build-phase entry). Plus a check that the Capacitor pods ship their own
manifests and signatures.

### B3. Native routing and deep links

The bundle needs its own routes for `/lists`, Photo Lab, and the `/join/{token}`
share links. Deep links additionally need an
`apple-app-site-association` file served from getword.app and the associated
domains entitlement — **the entitlement needs the capability enabled on the App
ID, which is yours to click.** I will tell you when I get there.

### B4. Native layout

Safe areas, the status bar matching the active theme, the iOS viewport-height
quirk, and a maximum content width so the study card does not stretch across an
iPad in landscape.

### B5. Icons and launch screen

The asset catalog currently has one 1024px icon and Capacitor's default splash.
I will generate the full set, reusing the artwork from the Play Store scripts.

### B6. Turn off the web-only paths in the native build

Service worker registration, the PWA install prompt, and the update banner make
no sense inside a native app and would look broken.

### B7. Localize the permission strings

The camera and photo-library prompts are currently English only; Czech needs an
`InfoPlist.strings`.

### B8. Full pass in the simulator

Sign-in, study, lists, word chat, Photo Lab permission prompts, account
deletion, sign-out — against production.

### B9. Screenshots

Captured from the simulator at the required sizes, for you to approve.

### B10. Version and build numbers, then archive and upload

Marketing version `1.0.0`, build `1`, incrementing on every upload.

---

## Order

```
A1 (name)  ─────────────────────────────► blocks nothing technical, but blocks the listing
A2 (agreements) ────────────────────────► blocks distribution

B1 (SIWA revocation)
B2 (privacy manifest)      ──┐
B3 (routing, needs A: capability for deep links)
B4 (layout)                  ├──► B8 (full pass) ──► B10 (upload) ──► A7 (TestFlight)
B5 (icons)                   │                                              │
B6 (disable PWA paths)       │                                              ▼
B7 (localized strings)     ──┘                       B9 (screenshots) ──► A3, A4, A6 ──► A8 (submit) ──► A9 (release)
```

The realistic critical path is B1–B8, then a build, then a few days of TestFlight
on real devices before submitting.

## Known risks

1. **The name may be taken.** A1 exists to find out early.
2. **Sign in with Apple revocation** (B1) is the most likely rejection reason.
3. **Photo Lab widens the review surface** — camera permission, an AI provider,
   and user-generated content. It is in scope by your decision; if review pushes
   back, the fallback is to ship it in 1.1 rather than argue.
4. **User-generated content.** Public lists are shared between users, so review
   will look for reporting and blocking. Both exist; the reviewer notes point at
   them.
