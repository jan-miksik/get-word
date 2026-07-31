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
pnpm --dir mobile exec cap add ios
pnpm mobile:sync:ios
pnpm mobile:open:ios
```

The default API origin is `https://getword.app`. Override it for local or
staging work with:

```bash
VITE_GET_WORD_API_ORIGIN=https://dev.getword.app pnpm mobile:dev
```

## Architecture boundary

- `mobile/dist` is a local application bundle copied into the native target.
- The Next.js app remains the hosted web product and server/API deployment.
- Mobile API calls will use an explicit API origin and mobile session token;
  they must not rely on same-origin browser cookies.
- Reusable domain modules may move into a framework-neutral package as the
  study UI is connected. Server-only modules and Next route components stay in
  the web app.

## Not yet store-ready

The current shell proves the local bundle and native bridge. Before TestFlight,
it still needs mobile authentication, study/sync UI, Sign in with Apple, deep
links, camera/photo permission declarations, privacy manifest review, app
icons, splash assets, and App Store metadata.
