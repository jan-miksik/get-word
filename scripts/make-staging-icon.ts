/**
 * Badges the iOS app icon so a staging build is unmistakable on a device that
 * also carries the real app.
 *
 * The bundle identifier stays `app.getword`, because changing it would break
 * Sign in with Apple (a different App ID and audience). Two builds of the same
 * identifier cannot sit side by side — the staging build replaces the store
 * one — so the icon is the only thing that can say which is installed.
 *
 * The badge is written over the checked-in icon rather than into a second
 * asset set, because the device install runs from Xcode's Run button, which
 * uses the target's own `ASSETCATALOG_COMPILER_APPICON_NAME` and never sees a
 * command-line override.
 *
 *   pnpm run mobile:staging-icon apply     # badge the icon, then build
 *   pnpm run mobile:staging-icon restore   # put the store icon back
 *   pnpm run mobile:staging-icon guard     # fail if a DEV icon is still on
 *
 * `apply` leaves a marker file so `git status` keeps reminding you that the
 * working tree is carrying a staging icon. Never archive for App Store Connect
 * while the marker is there — `guard` is what makes that unforgettable: it runs
 * first in `pnpm run check`, which the release runbook requires before every
 * upload, and the pre-commit hook refuses a badged icon on its way into git.
 */

import { existsSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";

const run = promisify(execFile);

const ICON_SET = "mobile/ios/App/App/Assets.xcassets/AppIcon.appiconset";
const ICON_PATH = join(ICON_SET, "AppIcon-512@2x.png");
const MARKER_PATH = "mobile/ios/App/.staging-icon";

// The paper palette's ink and paper. Deliberately not a theme colour that a
// designer may re-point: this band has to stay readable forever.
const INK = "#28201c";
const PAPER = "#fffaf0";

const SIZE = 1024;
const BAND_HEIGHT = Math.round(SIZE * 0.26);

function bandSvg(label: string): Buffer {
  const top = SIZE - BAND_HEIGHT;
  const textY = top + BAND_HEIGHT * 0.72;
  return Buffer.from(`
    <svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="${top}" width="${SIZE}" height="${BAND_HEIGHT}" fill="${INK}" fill-opacity="0.92"/>
      <text x="${SIZE / 2}" y="${textY}"
            font-family="Helvetica, Arial, sans-serif" font-weight="700"
            font-size="${Math.round(BAND_HEIGHT * 0.62)}" letter-spacing="${Math.round(BAND_HEIGHT * 0.08)}"
            fill="${PAPER}" text-anchor="middle">${label}</text>
    </svg>
  `);
}

async function apply(label: string) {
  if (existsSync(MARKER_PATH)) {
    throw new Error(
      `The icon is already badged (${MARKER_PATH} exists). Run "restore" first.`,
    );
  }
  const badged = await sharp(ICON_PATH)
    .composite([{ input: bandSvg(label), top: 0, left: 0 }])
    .png()
    .toBuffer();
  await writeFile(ICON_PATH, badged);
  await writeFile(
    MARKER_PATH,
    `${label} icon applied ${new Date().toISOString()}\n` +
      `Restore with: pnpm run mobile:staging-icon restore\n`,
  );
  console.log(`[icon] badged "${label}" onto ${ICON_PATH}`);
  console.log(`[icon] marker written to ${MARKER_PATH}`);
  console.log(`[icon] run "pnpm mobile:sync:ios" (or rebuild in Xcode) to pick it up`);
}

async function restore() {
  // git is the source of truth for the store icon; there is no second copy to
  // drift out of date.
  await run("git", ["checkout", "--", ICON_SET]);
  await rm(MARKER_PATH, { force: true });
  console.log(`[icon] ${ICON_SET} restored from git`);
}

/** True when the icon in the working tree differs from the committed one. */
async function iconDiffersFromHead(): Promise<boolean> {
  try {
    // Against HEAD rather than the index, so staging the badged icon does not
    // hide it from the check.
    await run("git", ["diff", "--quiet", "HEAD", "--", ICON_SET]);
    return false;
  } catch {
    return true;
  }
}

/**
 * Refuses to continue while a staging icon is in place. Two independent
 * signals, because either one alone can be defeated by hand: the marker file
 * (deletable) and the icon's own difference from the committed one (restorable
 * without clearing the marker).
 */
async function guard() {
  const markerPresent = existsSync(MARKER_PATH);
  const iconChanged = await iconDiffersFromHead();
  if (!markerPresent && !iconChanged) {
    console.log("[icon] store icon in place");
    return;
  }
  console.error("[icon] a staging icon is still in the working tree:");
  if (markerPresent) console.error(`  - ${MARKER_PATH} exists`);
  if (iconChanged) console.error(`  - ${ICON_SET} differs from HEAD`);
  console.error("");
  console.error("Restore it before building anything for the App Store:");
  console.error("  pnpm run mobile:staging restore");
  process.exitCode = 1;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const labelArg = rest.indexOf("--label");
  const label = labelArg >= 0 ? rest[labelArg + 1] : "DEV";

  try {
    switch (command) {
      case "apply":
        await apply(label.toUpperCase());
        break;
      case "restore":
        await restore();
        break;
      case "guard":
        await guard();
        break;
      default:
        throw new Error('Unknown command. Use: apply [--label DEV] | restore | guard');
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

void main();
