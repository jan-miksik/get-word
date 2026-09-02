#!/usr/bin/env bash
set -euo pipefail

# One command for a staging build of the iOS app: badge the icon, build the
# web bundle against the staging backend, copy it into the native project and
# open Xcode. Everything here is public configuration — the API origin and the
# Supabase publishable key are both shipped inside the bundle anyway.
#
#   pnpm run mobile:staging            # badge + build + cap sync + open Xcode
#   pnpm run mobile:staging --no-open  # same, without opening Xcode
#   pnpm run mobile:staging restore    # put the store icon back after testing
#
# Override any of the three values from the environment when a different
# staging deployment is being tested:
#   GET_WORD_STAGING_ORIGIN=https://... pnpm run mobile:staging

STAGING_ORIGIN="${GET_WORD_STAGING_ORIGIN:-https://get-word-dev.vercel.app}"
STAGING_SUPABASE_URL="${GET_WORD_STAGING_SUPABASE_URL:-https://ozqushgwpszqzwqfdqyh.supabase.co}"
STAGING_SUPABASE_KEY="${GET_WORD_STAGING_SUPABASE_KEY:-sb_publishable_eB_GLYdvSJn92LqNBXBuLw_GZVSJXXu}"

ICON_MARKER="mobile/ios/App/.staging-icon"

open_xcode=1
command=""
for arg in "$@"; do
  case "$arg" in
    restore) command="restore" ;;
    --no-open) open_xcode=0 ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Usage: pnpm run mobile:staging [--no-open] | pnpm run mobile:staging restore" >&2
      exit 1
      ;;
  esac
done

if [ "$command" = "restore" ]; then
  pnpm run mobile:staging-icon restore
  echo
  echo "The next production build will carry the store icon again."
  exit 0
fi

# A failed build must not leave a DEV icon behind: the next thing that happens
# after a failure is usually a rebuild for the store.
cleanup_on_failure() {
  if [ -f "$ICON_MARKER" ]; then
    echo
    echo "[staging] build failed — restoring the store icon"
    pnpm run mobile:staging-icon restore || true
  fi
}
trap cleanup_on_failure ERR

echo "[staging] api origin:   $STAGING_ORIGIN"
echo "[staging] supabase:     $STAGING_SUPABASE_URL"
echo

if [ -f "$ICON_MARKER" ]; then
  echo "[staging] icon already badged, keeping it"
else
  pnpm run mobile:staging-icon apply
fi
echo

VITE_GET_WORD_API_ORIGIN="$STAGING_ORIGIN" \
VITE_SUPABASE_URL="$STAGING_SUPABASE_URL" \
VITE_SUPABASE_PUBLISHABLE_KEY="$STAGING_SUPABASE_KEY" \
  pnpm run mobile:sync:ios

trap - ERR

echo
echo "[staging] bundle built against $STAGING_ORIGIN and copied into the native project."
echo "[staging] In Xcode: pick your iPhone and press Run. No build number, no TestFlight."
echo "[staging] When you are done:  pnpm run mobile:staging restore"

if [ "$open_xcode" -eq 1 ]; then
  pnpm run mobile:open:ios
fi
