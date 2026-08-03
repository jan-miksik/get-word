/**
 * Prepares raw simulator/device captures for upload to App Store Connect.
 *
 * Apple rejects screenshots that carry an alpha channel, even a fully opaque
 * one — which every iOS screen capture has. This flattens each capture onto an
 * opaque background, keeps the pixels otherwise untouched, and checks the
 * dimensions against the sizes Apple accepts for the slot before writing.
 *
 * Layout:
 *   app-store-assets/<slot>/*.png          raw captures (what you take)
 *   app-store-assets/upload/<slot>/*.png   flattened, verified (what you upload)
 *
 * Run: pnpm tsx scripts/prepare-app-store-screenshots.ts
 */
import { mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const root = process.cwd();
const sourceRoot = join(root, "app-store-assets");
const outputRoot = join(sourceRoot, "upload");

/**
 * Accepted pixel sizes per slot, portrait and landscape. Apple takes either
 * generation of each display class; anything else is rejected at upload.
 */
const SLOTS: Record<string, { label: string; sizes: [number, number][] }> = {
  "ipad-13": {
    label: 'iPad 13"',
    sizes: [
      [2064, 2752],
      [2048, 2732],
      [2752, 2064],
      [2732, 2048],
    ],
  },
  "iphone-6-9": {
    label: 'iPhone 6.9"',
    sizes: [
      [1320, 2868],
      [1290, 2796],
      [2868, 1320],
      [2796, 1290],
    ],
  },
  "iphone-6-5": {
    label: 'iPhone 6.5"',
    sizes: [
      [1242, 2688],
      [1284, 2778],
      [2688, 1242],
      [2778, 1284],
    ],
  },
};

async function listSlots(): Promise<string[]> {
  const entries = await readdir(sourceRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && entry.name !== "upload")
    .map((entry) => entry.name);
}

async function main() {
  const slots = await listSlots();
  if (slots.length === 0) {
    console.log(`No screenshot folders under ${sourceRoot}.`);
    return;
  }

  await rm(outputRoot, { recursive: true, force: true });
  let failures = 0;

  for (const slot of slots) {
    const spec = SLOTS[slot];
    if (!spec) {
      console.warn(`! ${slot}: unknown slot, skipped (add it to SLOTS to check its sizes)`);
      continue;
    }

    const files = (await readdir(join(sourceRoot, slot))).filter((name) =>
      /\.(png|jpe?g)$/i.test(name),
    );
    if (files.length === 0) continue;

    const outputDir = join(outputRoot, slot);
    await mkdir(outputDir, { recursive: true });
    console.log(`\n${spec.label} (${files.length} files)`);

    for (const file of files) {
      const input = join(sourceRoot, slot, file);
      const image = sharp(input);
      const { width = 0, height = 0, hasAlpha } = await image.metadata();

      const sizeOk = spec.sizes.some(([w, h]) => w === width && h === height);
      if (!sizeOk) {
        failures += 1;
        const accepted = spec.sizes.map(([w, h]) => `${w}x${h}`).join(", ");
        console.error(`  ✗ ${file}: ${width}x${height} — accepted: ${accepted}`);
        continue;
      }

      const outputName = file.replace(/\.(png|jpe?g)$/i, ".png");
      await image
        // Flatten drops the alpha channel; the captures are already opaque, so
        // the background colour never shows and the pixels are unchanged.
        .flatten({ background: "#ffffff" })
        .png({ compressionLevel: 9 })
        .toFile(join(outputDir, outputName));

      console.log(
        `  ✓ ${outputName}  ${width}x${height}${hasAlpha ? "  (alpha removed)" : ""}`,
      );
    }
  }

  console.log(`\nUpload these: ${outputRoot}`);
  if (failures > 0) {
    console.error(`${failures} file(s) had the wrong dimensions and were not written.`);
    process.exitCode = 1;
  }
}

void main();
