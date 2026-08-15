# Google Play TWA

Operational notes for publishing Get Word to Google Play as a Trusted Web
Activity (TWA).

## Current PWA Status

- Production origin: `https://getword.app`
- Manifest: `https://getword.app/manifest.webmanifest`
- Start URL: `https://getword.app/?source=pwa`
- Scope: `https://getword.app/`
- Display mode: `standalone`
- Theme/background color: `#0b1220`
- Required icons exist in `public/icons/`: `icon-192.png`, `icon-512.png`,
  `maskable-192.png`, and `maskable-512.png`
- Service worker exists at `public/sw.js`
- Missing before TWA verification: `https://getword.app/.well-known/assetlinks.json`

## Android Identity

The package name registered in Play Console:

```text
app.getword
```

The package name is permanent after the first upload, so it is also a constant
in the app — `PLAY_PACKAGE_ID` in `lib/store-listing.ts`, which builds the
rate-the-app link in Settings.

## PWABuilder Values

Use PWABuilder's Android package flow with:

```text
PWA URL: https://getword.app
App name: Get Word
Launcher name: Get Word
Package ID: app.getword
Version name: 1.0.0
Version code: 1
Start URL: https://getword.app/?source=pwa
Host / scope origin: https://getword.app
Theme color: #0b1220
Background color: #0b1220
Maskable icon: https://getword.app/icons/maskable-512.png
Regular icon: https://getword.app/icons/icon-512.png
```

Keep Play App Signing enabled. Save the generated upload key/password somewhere
durable and private; it is needed for future wrapper updates.

## Digital Asset Links

Create the final production file at:

```text
public/.well-known/assetlinks.json
```

Use `docs/google-play-assetlinks.template.json` as the starting point. Replace
`REPLACE_WITH_PLAY_APP_SIGNING_SHA_256_CERTIFICATE` with the SHA-256 certificate
fingerprint from:

```text
Play Console -> Setup -> App integrity -> App signing key certificate -> SHA-256 certificate fingerprint
```

For local sideload testing, Bubblewrap/PWABuilder may also show an upload-key
fingerprint. It is fine to include both fingerprints in `sha256_cert_fingerprints`
while testing, but the Play-installed production app must include the Play app
signing certificate fingerprint.

After deploying, verify:

```text
https://getword.app/.well-known/assetlinks.json
```

It must return HTTP 200 with JSON.

## Build Paths

Preferred low-friction path:

1. Open PWABuilder and enter `https://getword.app`.
2. Generate the Android package.
3. Use the values above.
4. Download the generated Android project or `.aab`.
5. Upload the first artifact to an internal or closed testing track.
6. Copy the Play app signing SHA-256 certificate into `assetlinks.json`.
7. Deploy `assetlinks.json` to production.
8. Re-test from a Play-installed build. The app should open fullscreen without a
   browser URL bar.

Local Bubblewrap path, once Java and Android SDK are installed:

```text
npm i -g @bubblewrap/cli
bubblewrap init --manifest=https://getword.app/manifest.webmanifest
bubblewrap build
```

This machine did not have Java, Android SDK, Gradle, or Bubblewrap available
when these notes were written, so a local `.aab` build needs that toolchain first.

## Play Console Access Notes

For app review, provide the stable reviewer account in English. Reviewers cannot
create accounts, use one-time codes, use their own Google account, or contact
you for extra access details. If premium features are added later, keep the
reviewer account entitled to them without requiring a purchase.
