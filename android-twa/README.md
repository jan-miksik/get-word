# Get Word for Android (Trusted Web Activity)

This directory contains the versioned Android wrapper for `https://getword.app`.
It targets Android API 36 and builds release `1.0.0.3` (`versionCode` 3).
Android Browser Helper 2.7.2 requires Android 6.0 (API 23), so this update no
longer supports Android 5.0 and 5.1 devices.

## Local prerequisites

- JDK 17
- Android SDK with platform and build tools for API 36
- The existing upload keystore in `../google-play-package/`

The keystore and `signing-key-info.txt` are intentionally ignored by Git. Never
copy their passwords into Gradle files, shell scripts, commits, or CI logs.

## Release build

From this directory, run:

```sh
./gradlew bundleRelease
```

The unsigned or locally configured release bundle is generated under
`app/build/outputs/bundle/release/`. Sign it with the existing upload key before
uploading it to Google Play. Increment both `versionCode` and `versionName` for
every later release.

## Important maintenance note

`twa-manifest.json` is retained as the Bubblewrap source configuration, but a
future `bubblewrap update` may regenerate Gradle and manifest files. After an
update, preserve these project choices:

- Android Browser Helper 2.7.2 or newer
- no native orientation lock and no call to `setRequestedOrientation`
- keep `orientation: portrait` in the web manifest so phones stay in the
  layout's supported orientation; Android 16 may ignore it on large screens
- `android:resizeableActivity="true"`
- no WebView fallback activity when `fallbackType` is `customtabs`
- optimized R8 plus resource shrinking for release builds

The helper implements edge-to-edge through AndroidX compatibility APIs. Their
compiled implementation intentionally contains guarded legacy system-bar calls
for old Android versions; the removed app-level `Utils` and WebView fallback
code must not be reintroduced.
