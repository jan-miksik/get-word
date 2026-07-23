import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const root = process.cwd();
const outputDir = join(root, "public", "google-play");

const colors = {
  ink: "#28201c",
  muted: "#8d8178",
  warm: "#f1eadc",
  paper: "#fffaf0",
  line: "#d8cab8",
  coral: "#e9c6af",
  blue: "#58b9e7",
  green: "#48a36d",
  red: "#c77c7c",
  mustard: "#d9b24f",
};

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

function wordCard(
  x: number,
  y: number,
  original: string,
  translation: string,
  accent: string,
) {
  return `
    <g transform="translate(${x} ${y})">
      <rect width="280" height="68" rx="16" fill="${colors.paper}" stroke="${colors.line}" stroke-width="2"/>
      <circle cx="34" cy="34" r="17" fill="${accent}" opacity="0.18"/>
      <path d="M30 25 L45 34 L30 43 Z" fill="${accent}"/>
      <text x="68" y="30" font-size="20" font-weight="760" fill="${colors.ink}">${escapeXml(original)}</text>
      <text x="68" y="52" font-size="15" font-weight="560" fill="${colors.muted}">${escapeXml(translation)}</text>
    </g>`;
}

const featureGraphicSvg = `
<svg width="1024" height="500" viewBox="0 0 1024 500" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <pattern id="arches" width="42" height="26" patternUnits="userSpaceOnUse">
      <path d="M0 26V0h42v26C42 13 33.6 4.3 21 4.3S0 13 0 26Z" fill="#2a2723"/>
    </pattern>
    <filter id="softShadow" x="-20%" y="-30%" width="140%" height="170%">
      <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#4d3c31" flood-opacity="0.18"/>
    </filter>
  </defs>

  <rect width="1024" height="500" fill="${colors.warm}"/>
  <rect x="0" y="0" width="1024" height="500" fill="url(#arches)" opacity="0.045"/>

  <g opacity="0.16" fill="${colors.ink}" font-family="Georgia, serif" font-weight="700">
    <text x="88" y="108" font-size="42">a</text>
    <text x="198" y="415" font-size="46">e</text>
    <text x="858" y="116" font-size="44">s</text>
    <text x="904" y="402" font-size="56">o</text>
  </g>

  <g filter="url(#softShadow)">
    <rect x="364" y="74" width="414" height="268" rx="28" fill="${colors.paper}" stroke="${colors.line}" stroke-width="2"/>
    <text x="571" y="132" text-anchor="middle" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="34" font-weight="790" fill="${colors.ink}">
      Learn words that stick
    </text>
    <rect x="426" y="168" width="290" height="54" rx="18" fill="#f2d3ba" stroke="#d6a884" stroke-width="2"/>
    <rect x="426" y="168" width="142" height="54" rx="18" fill="#b9d99c" opacity="0.72"/>
    <g fill="${colors.ink}" opacity="0.20">
      <circle cx="452" cy="194" r="2"/>
      <circle cx="482" cy="194" r="2"/>
      <circle cx="512" cy="194" r="2"/>
      <circle cx="542" cy="194" r="2"/>
      <circle cx="572" cy="194" r="2"/>
      <circle cx="602" cy="194" r="2"/>
      <circle cx="632" cy="194" r="2"/>
      <circle cx="662" cy="194" r="2"/>
      <circle cx="692" cy="194" r="2"/>
    </g>
    <circle cx="571" cy="272" r="28" fill="${colors.paper}" stroke="${colors.ink}" stroke-width="3"/>
    <path d="M561 264v16l12-8z" fill="${colors.ink}"/>
  </g>

  <g font-family="Inter, ui-sans-serif, system-ui, sans-serif" filter="url(#softShadow)">
    ${wordCard(116, 128, "hello", "hola", colors.blue)}
    ${wordCard(140, 218, "Good day", "Buenos días", colors.green)}
    ${wordCard(116, 308, "I understand", "Entiendo", colors.mustard)}
  </g>

  <g font-family="Inter, ui-sans-serif, system-ui, sans-serif" filter="url(#softShadow)">
    <rect x="704" y="170" width="214" height="178" rx="22" fill="${colors.paper}" stroke="${colors.line}" stroke-width="2"/>
    <text x="728" y="214" font-size="18" font-weight="760" fill="${colors.ink}">Review</text>
    <text x="728" y="240" font-size="14" font-weight="610" fill="${colors.muted}">1 to practice</text>
    <rect x="728" y="272" width="74" height="44" rx="14" fill="#fff5e8" stroke="${colors.red}" stroke-width="2"/>
    <text x="765" y="300" text-anchor="middle" font-size="14" font-weight="760" fill="${colors.ink}">5 min</text>
    <rect x="818" y="272" width="76" height="44" rx="14" fill="#f6fff1" stroke="${colors.green}" stroke-width="2"/>
    <text x="856" y="300" text-anchor="middle" font-size="14" font-weight="760" fill="${colors.ink}">3 days</text>
  </g>

  <g transform="translate(500 378)">
    <rect x="-108" y="0" width="216" height="44" rx="22" fill="#2a2723"/>
    <text x="0" y="29" text-anchor="middle" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="18" font-weight="800" fill="#fffaf0">
      GET WORD
    </text>
  </g>
</svg>`;

async function main() {
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, "feature-graphic.svg"), featureGraphicSvg, "utf8");

  await sharp(join(root, "public", "icons", "icon-512.png"))
    .resize(512, 512, { fit: "fill" })
    .ensureAlpha(1)
    .png({ compressionLevel: 9, palette: false })
    .toColorspace("srgb")
    .toFile(join(outputDir, "app-icon.png"));

  await sharp(Buffer.from(featureGraphicSvg))
    .resize(1024, 500, { fit: "fill" })
    .removeAlpha()
    .png({ compressionLevel: 9, palette: false })
    .toColorspace("srgb")
    .toFile(join(outputDir, "feature-graphic.png"));

  const appIconMeta = await sharp(join(outputDir, "app-icon.png")).metadata();
  const featureMeta = await sharp(join(outputDir, "feature-graphic.png")).metadata();

  console.log({
    appIcon: {
      width: appIconMeta.width,
      height: appIconMeta.height,
      channels: appIconMeta.channels,
      hasAlpha: appIconMeta.hasAlpha,
    },
    featureGraphic: {
      width: featureMeta.width,
      height: featureMeta.height,
      channels: featureMeta.channels,
      hasAlpha: featureMeta.hasAlpha,
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
