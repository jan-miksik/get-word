/**
 * Captures real signed-out landing-page screenshots for the Google Play tablet
 * slots, framing each section as an exact 9:16 window with the fixed header on
 * top. Renders through the local dev server (must be running at localhost:3000)
 * using the installed system Chrome via playwright-core (no Chromium download).
 * The browser viewport uses tablet-sized CSS pixels plus device scale factor;
 * using the final PNG dimensions as CSS pixels makes the landing render like a
 * squeezed desktop page instead of a tablet.
 *
 * Output: public/google-play/screenshots/{tablet7,tablet10}/01..02.png
 *   tablet7  1080x1920 (9:16, each side 320-3840), rendered at 768x1365 CSS px
 *   tablet10 1440x2560 (9:16, each side 1080-7680), rendered at 800x1422 CSS px
 *
 * Run (with `pnpm run dev` up): pnpm tsx scripts/generate-google-play-landing.ts
 */
import { chromium } from "playwright-core";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const URL = "http://localhost:3000";
const root = join(process.cwd(), "public", "google-play", "screenshots");
const landingPair = { from: "en", to: "cs" };

// Each frame is a 9:16 window scrolled so a section heading sits just below the
// fixed header. `heading` null = top of page (hero). Order = store order.
const frames: { name: string; heading: string | null }[] = [
  { name: "01", heading: null },
  { name: "02", heading: "Try it yourself" },
];

const slots = [
  {
    dir: "tablet7",
    width: 1080,
    height: 1920,
    viewportWidth: 768,
    viewportHeight: 1365,
    deviceScaleFactor: 1.40625,
  },
  {
    dir: "tablet10",
    width: 1440,
    height: 2560,
    viewportWidth: 800,
    viewportHeight: 1422,
    deviceScaleFactor: 1.8,
  },
];

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });

  for (const slot of slots) {
    const outDir = join(root, slot.dir);
    await rm(outDir, { recursive: true, force: true });
    await mkdir(outDir, { recursive: true });

    const headerOffset = Math.round(slot.viewportHeight * 0.07);
    const context = await browser.newContext({
      viewport: { width: slot.viewportWidth, height: slot.viewportHeight },
      deviceScaleFactor: slot.deviceScaleFactor,
      hasTouch: true,
      isMobile: false,
    });
    await context.addInitScript((pair) => {
      localStorage.setItem("get-word-landing-pair", JSON.stringify(pair));
    }, landingPair);
    const page = await context.newPage();
    await page.goto(URL, { waitUntil: "networkidle" });
    await page.addStyleTag({
      content: `
        html, body, .lp-root { background: #dcd1b9 !important; }
        img.speckled-background { display: none !important; }
      `,
    });
    await page.waitForTimeout(800);

    for (const frame of frames) {
      if (frame.heading === null) {
        await page.evaluate(() => window.scrollTo(0, 0));
      } else {
        const target = await page.evaluate(
          ({ text, offset }) => {
            const el = Array.from(document.querySelectorAll("h1,h2,h3")).find((n) =>
              (n.textContent || "").toLowerCase().includes(text.toLowerCase()),
            );
            if (!el) return null;
            const rect = el.getBoundingClientRect();
            return window.scrollY + rect.top - offset;
          },
          { text: frame.heading, offset: headerOffset },
        );
        if (target === null) {
          console.warn(`${slot.dir}: heading not found: ${frame.heading}`);
          continue;
        }
        await page.evaluate((y) => window.scrollTo(0, y), Math.max(0, target));
      }
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(outDir, `${frame.name}.png`), scale: "device" });
    }

    await context.close();
    console.log(
      `${slot.dir}: ${frames.length} frames @ ${slot.width}x${slot.height} from ${slot.viewportWidth}x${slot.viewportHeight} CSS px`,
    );
  }

  await browser.close();
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
