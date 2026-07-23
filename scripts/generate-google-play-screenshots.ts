/**
 * Generates Google Play store screenshots for every required slot from the raw
 * app captures in public/app-preview/mobil.
 *
 * Each raw screenshot (750x1334, ~9:16) is composed onto a branded canvas with
 * a Czech caption and a framed device shot, then rendered at the exact
 * dimensions Google Play asks for:
 *
 *   phone      1080x1920  (>=1080 both sides -> eligible for promotion)
 *   tablet7    1080x1920  (9:16, each side 320-3840)
 *   tablet10   1440x2560  (9:16, each side 1080-7680)
 *   chromebook 1920x1080  (16:9 landscape, each side 1080-7680)
 *
 * Composing (rather than cover-cropping the phone shot to fill) keeps the app
 * content crisp at tablet sizes and reads as intentional marketing art.
 *
 * Run: pnpm tsx scripts/generate-google-play-screenshots.ts
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const root = process.cwd();
const sourceDir = join(root, "public", "app-preview", "mobil");
const outputRoot = join(root, "public", "google-play", "screenshots");

const font = "'Inter','Helvetica Neue',Arial,sans-serif";

const colors = {
  ink: "#28201c",
  paper: "#f1eadc",
  card: "#fffaf0",
  line: "#d8cab8",
  blue: "#58b9e7",
};

// Source screenshots paired with their marketing caption (max 2 lines).
type Shot = { file: string; lines: string[] };

const shots: Shot[] = [
  { file: "IMG_0748.PNG", lines: ["Smart spaced repetition", "tuned to the forgetting curve"] },
  { file: "IMG_0749.PNG", lines: ["You decide", "when a word comes back"] },
  { file: "IMG_0750.PNG", lines: ["Snap your surroundings", "and learn what you see"] },
  { file: "IMG_0751.PNG", lines: ["Ready-made lists", "or your own words"] },
  { file: "IMG_0752.PNG", lines: ["Automatic translation", "and audio for every word"] },
];

const SHOT_ASPECT = 750 / 1334; // width / height of the raw captures

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&apos;";
    }
  });
}

/** Rounds the corners of a raster buffer of known size. */
async function roundCorners(buffer: Buffer, w: number, h: number, radius: number) {
  const mask = Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="${w}" height="${h}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`,
  );
  return sharp(buffer)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

function brandPill(cx: number, cy: number, scale: number) {
  const w = 168 * scale;
  const h = 46 * scale;
  return `
    <g transform="translate(${cx - w / 2} ${cy - h / 2})">
      <rect width="${w}" height="${h}" rx="${h / 2}" fill="${colors.ink}"/>
      <text x="${w / 2}" y="${h / 2 + 6 * scale}" text-anchor="middle" font-family="${font}"
            font-size="${19 * scale}" font-weight="800" letter-spacing="1" fill="${colors.card}">GET WORD</text>
    </g>`;
}

const dotPattern = `
  <pattern id="dots" width="26" height="26" patternUnits="userSpaceOnUse">
    <circle cx="3" cy="3" r="2" fill="${colors.ink}"/>
  </pattern>`;

const shadow = `
  <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
    <feDropShadow dx="0" dy="22" stdDeviation="26" flood-color="#4d3c31" flood-opacity="0.22"/>
  </filter>`;

async function compose(
  bg: Buffer,
  border: Buffer,
  shot: Shot,
  frameX: number,
  frameY: number,
  frameW: number,
  frameH: number,
  radius: number,
  outFile: string,
) {
  const shotW = Math.round(frameW);
  const shotH = Math.round(frameH);
  const resized = await sharp(join(sourceDir, shot.file))
    .resize(shotW, shotH, { fit: "fill" })
    .toBuffer();
  const rounded = await roundCorners(resized, shotW, shotH, Math.round(radius));

  await sharp(bg)
    .composite([
      { input: rounded, left: Math.round(frameX), top: Math.round(frameY) },
      { input: border, left: 0, top: 0 },
    ])
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(outFile);
}

async function renderPortrait(shot: Shot, W: number, H: number, outFile: string) {
  const scale = W / 1080;
  const pad = 64 * scale;
  const captionTop = 120 * scale;
  const captionSize = 56 * scale;
  const lineGap = 70 * scale;

  const captionBottom = captionTop + (shot.lines.length - 1) * lineGap + captionSize;
  const frameTop = captionBottom + 70 * scale;
  const frameBottom = H - 150 * scale;
  let frameH = frameBottom - frameTop;
  let frameW = frameH * SHOT_ASPECT;
  const maxW = W - 2 * pad;
  if (frameW > maxW) {
    frameW = maxW;
    frameH = frameW / SHOT_ASPECT;
  }
  const frameX = (W - frameW) / 2;
  const frameY = frameTop;
  const radius = 46 * scale;

  const captionSvg = shot.lines
    .map(
      (line, i) =>
        `<text x="${W / 2}" y="${captionTop + i * lineGap + captionSize * 0.8}" text-anchor="middle"
               font-family="${font}" font-size="${captionSize}" font-weight="820" fill="${colors.ink}">${escapeXml(line)}</text>`,
    )
    .join("\n");

  const bg = Buffer.from(`
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>${dotPattern}${shadow}</defs>
      <rect width="${W}" height="${H}" fill="${colors.paper}"/>
      <rect width="${W}" height="${H}" fill="url(#dots)" opacity="0.05"/>
      ${captionSvg}
      <rect x="${frameX}" y="${frameY}" width="${frameW}" height="${frameH}" rx="${radius}" fill="${colors.card}" filter="url(#soft)"/>
      ${brandPill(W / 2, H - 78 * scale, scale)}
    </svg>`);

  const border = Buffer.from(`
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${frameX}" y="${frameY}" width="${frameW}" height="${frameH}" rx="${radius}"
            fill="none" stroke="${colors.line}" stroke-width="${3 * scale}"/>
    </svg>`);

  await compose(bg, border, shot, frameX, frameY, frameW, frameH, radius, outFile);
}

async function renderLandscape(shot: Shot, W: number, H: number, outFile: string) {
  const scale = H / 1080;
  const pad = 90 * scale;
  const frameH = H - 2 * pad;
  const frameW = frameH * SHOT_ASPECT;
  const frameX = W - pad - frameW;
  const frameY = pad;
  const radius = 46 * scale;

  const captionSize = 72 * scale;
  const lineGap = 92 * scale;
  const captionX = pad;
  const captionTop = H / 2 - ((shot.lines.length - 1) * lineGap) / 2 - captionSize;

  const captionSvg = shot.lines
    .map(
      (line, i) =>
        `<text x="${captionX}" y="${captionTop + i * lineGap + captionSize * 0.8}"
               font-family="${font}" font-size="${captionSize}" font-weight="820" fill="${colors.ink}">${escapeXml(line)}</text>`,
    )
    .join("\n");

  const bg = Buffer.from(`
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>${dotPattern}${shadow}</defs>
      <rect width="${W}" height="${H}" fill="${colors.paper}"/>
      <rect width="${W}" height="${H}" fill="url(#dots)" opacity="0.05"/>
      <rect x="${captionX}" y="${captionTop - 54 * scale}" width="${132 * scale}" height="${10 * scale}" rx="${5 * scale}" fill="${colors.blue}"/>
      ${captionSvg}
      <g transform="translate(${captionX + 84 * scale} ${captionTop + shot.lines.length * lineGap + 40 * scale})">${brandPill(0, 0, scale)}</g>
      <rect x="${frameX}" y="${frameY}" width="${frameW}" height="${frameH}" rx="${radius}" fill="${colors.card}" filter="url(#soft)"/>
    </svg>`);

  const border = Buffer.from(`
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${frameX}" y="${frameY}" width="${frameW}" height="${frameH}" rx="${radius}"
            fill="none" stroke="${colors.line}" stroke-width="${3 * scale}"/>
    </svg>`);

  await compose(bg, border, shot, frameX, frameY, frameW, frameH, radius, outFile);
}

const slots = [
  { name: "phone", w: 1080, h: 1920, kind: "portrait" as const },
  { name: "tablet7", w: 1080, h: 1920, kind: "portrait" as const },
  { name: "tablet10", w: 1440, h: 2560, kind: "portrait" as const },
  { name: "chromebook", w: 1920, h: 1080, kind: "landscape" as const },
];

async function main() {
  for (const slot of slots) {
    const dir = join(outputRoot, slot.name);
    await mkdir(dir, { recursive: true });
    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i];
      const num = String(i + 1).padStart(2, "0");
      const out = join(dir, `${num}.png`);
      if (slot.kind === "portrait") {
        await renderPortrait(shot, slot.w, slot.h, out);
      } else {
        await renderLandscape(shot, slot.w, slot.h, out);
      }
    }
    console.log(`${slot.name}: ${shots.length} screenshots (${slot.w}x${slot.h})`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
