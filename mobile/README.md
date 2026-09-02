# Get Word mobile

This directory is the locally bundled iOS client for Get Word. Its dependencies
are installed by the repository root package so the existing pnpm 8/hoisted
installation remains a single-project layout. It deliberately
does not load `https://getword.app` as a remote WebView: Capacitor's remote
`server.url` option is intended for development, and a repackaged website is a
poor App Store submission.

## Commands

From the repository root:

```bash
pnpm install
pnpm mobile:build
pnpm mobile:sync:ios
pnpm mobile:open:ios
pnpm mobile:staging
```

`cap add ios` was only needed to create the checked-in native project. Do not
run it as part of a normal build or release.

The default API origin is `https://getword.app`. Override it for local or
staging work with:

```bash
VITE_GET_WORD_API_ORIGIN=https://dev.getword.app pnpm mobile:dev
```

The development server reuses the public Supabase values from the
repository-level `.env.local`. Production builds default to the public
configuration used by `getword.app`, so a local development project cannot
accidentally mint tokens that the production API rejects. Either mode can be
overridden with `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY`.

For a physical-device staging build, `pnpm mobile:staging` badges the checked-in
icon with `DEV`, builds and synchronizes the bundle against the staging backend,
and opens Xcode. Use `pnpm mobile:staging --no-open` when Xcode is already open.
The staging build uses the production bundle identifier, so it replaces the
store build on the device rather than installing beside it. Restore the store
icon as soon as testing is finished:

```bash
pnpm mobile:staging restore
```

Never archive or commit while `mobile/ios/App/.staging-icon` exists. A failed
staging build restores the icon automatically.

## Architecture boundary

- `mobile/dist` is a local application bundle copied into the native target.
- The Next.js app remains the hosted web product and server/API deployment.
- Mobile API calls will use an explicit API origin and mobile session token;
  they must not rely on same-origin browser cookies.
- Native Apple sign-in and passwordless email codes exchange their short-lived
  Supabase sessions for a Get Word bearer session. The documented App Review
  address uses its reusable password inside the same email form. The bearer
  token and device id are stored in the iOS Keychain and are not synchronized
  through iCloud.
- Reusable domain modules may move into a framework-neutral package as the
  study UI is connected. Server-only modules and Next route components stay in
  the web app.

## TestFlight release runbook

This is the authoritative repeat-release procedure. It was exercised for the
1.0 TestFlight uploads through build 16. The first-release planning history and
App Store metadata remain in [`../docs/ios-release-plan.md`](../docs/ios-release-plan.md)
and [`../docs/app-store-listing.md`](../docs/app-store-listing.md).

Run commands from the repository root. The archive and upload steps need macOS,
Xcode signed into the Apple developer team `HLWJ75QQ8B`, a valid signing
identity in the Keychain, and permission to contact Apple's signing and App
Store Connect services. Never put Apple passwords, API keys, or `.p8` contents
in the repository or command line.

### 1. Fix the release scope

Inspect the branch and working tree before changing a build number:

```bash
git status --short --branch
git diff --check
```

Release only the intended, reviewed source. Commit it before archiving so the
uploaded binary has an identifiable source commit. If the native build depends
on new API behavior or database migrations, deploy and verify those production
changes before distributing the build; the release bundle uses
`https://getword.app` by default.

### 2. Choose and record a new build number

Check the latest uploaded build in App Store Connect first. The new build
number must be greater than every build Apple has already accepted; do not rely
only on the local project because App Store Connect rejects duplicates.

Set the chosen integer in both `CURRENT_PROJECT_VERSION` entries in
`mobile/ios/App/App.xcodeproj/project.pbxproj`. Leave `MARKETING_VERSION`
unchanged unless this is a new App Store version. Verify the result:

```bash
rg -n 'CURRENT_PROJECT_VERSION|MARKETING_VERSION' \
  mobile/ios/App/App.xcodeproj/project.pbxproj
```

There should be two identical `CURRENT_PROJECT_VERSION` values, one for each
Xcode configuration. Commit the build-number change. `version.json` is the web
app commit-count version maintained by the pre-commit hook; it is not the iOS
TestFlight build number and should not be edited for this purpose.

### 3. Verify and synchronize the mobile bundle

Run verification appropriate to the release scope, then the full repository
check and the native synchronization:

```bash
pnpm run check
pnpm mobile:sync:ios
git status --short
```

`mobile:sync:ios` type-checks and builds the production Vite bundle before
Capacitor copies it into the iOS project. Review any newly reported working-tree
change before continuing.

`pnpm run check` starts with `check:store-icon`, which fails when a staging
(DEV) app icon from `pnpm run mobile:staging` is still in the working tree.
A release must never carry it. If the check fails, run
`pnpm run mobile:staging restore` and start this step again.

### 4. Create and inspect the Release archive

Use a fresh path for every attempt. The example below uses build 17; replace it
with the number chosen in step 2.

```bash
GET_WORD_BUILD=17
GET_WORD_ARCHIVE="/private/tmp/get-word-testflight-${GET_WORD_BUILD}.xcarchive"
test ! -e "$GET_WORD_ARCHIVE"

xcodebuild \
  -project mobile/ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$GET_WORD_ARCHIVE" \
  -allowProvisioningUpdates \
  archive
```

Confirm the archive contains the expected bundle identifier, marketing version,
and build number:

```bash
/usr/libexec/PlistBuddy -c 'Print :ApplicationProperties:CFBundleIdentifier' \
  "$GET_WORD_ARCHIVE/Info.plist"
/usr/libexec/PlistBuddy -c 'Print :ApplicationProperties:CFBundleShortVersionString' \
  "$GET_WORD_ARCHIVE/Info.plist"
/usr/libexec/PlistBuddy -c 'Print :ApplicationProperties:CFBundleVersion' \
  "$GET_WORD_ARCHIVE/Info.plist"
```

Expected values are `app.getword`, the intended marketing version, and the new
build number. Keep automatic signing in the project. A development-signed
archive is acceptable at this stage: the export in the next step selects the
managed Store provisioning profile and re-signs it for distribution. Do not
add a permanent `CODE_SIGN_IDENTITY = "Apple Distribution"` override; that
previously conflicted with Xcode-managed signing.

### 5. Upload through the tested export path

`ios/UploadOptions.plist` uses `method=app-store-connect` and
`destination=upload`, so this command both exports/re-signs the archive and
uploads it. It is the external-state-changing step: run it only after the
archive metadata is verified.

```bash
GET_WORD_EXPORT="/private/tmp/get-word-testflight-${GET_WORD_BUILD}-export"
test ! -e "$GET_WORD_EXPORT"

xcodebuild \
  -exportArchive \
  -archivePath "$GET_WORD_ARCHIVE" \
  -exportOptionsPlist mobile/ios/UploadOptions.plist \
  -exportPath "$GET_WORD_EXPORT" \
  -allowProvisioningUpdates
```

Wait for the command's final upload success, then confirm the same version and
build in App Store Connect. Apple will initially show it as **Processing** and
will expose it in TestFlight after processing completes.

If the command ends ambiguously, inspect App Store Connect before retrying; a
retry of an already accepted build number will be rejected. For signing errors,
first check the Xcode account, team, certificate, and managed provisioning
profile. Preserve automatic project signing and diagnose the failing archive or
export instead of changing signing settings speculatively.

### 6. Finish the hand-off

- Confirm TestFlight processing completed and record the uploaded version/build.
- Install that exact build on physical iPhone and iPad devices.
- Smoke-test sign-in, study and audio, list creation, Photo Lab/camera, and
  account deletion against production.
- Re-check `git status --short` so generated artifacts or signing experiments
  are not left in the working tree.
