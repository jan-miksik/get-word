/**
 * Design-token ratchet.
 *
 * The app's colours are supposed to live once, in the paper-palette block of
 * `styles/tokens.css`, and reach components as Tailwind utilities (`bg-paper`,
 * `text-ink`, `border-sea`) registered in `app/tailwind.css`. They did not use
 * to: the same seven values were written down in four places and ~730 raw hex
 * literals were spread over 74 components, so changing one colour meant a
 * find-and-replace across the repo.
 *
 * This script keeps that from coming back. It does three things:
 *
 *   1. Hard-fails on a raw hex that IS a token value. There is no reason to
 *      write `#2A2218` when `text-ink` exists and means the same thing.
 *   2. Ratchets everything else against `config/design-token-baseline.json`.
 *      The remaining literals are a long tail of one-off colours; they are
 *      allowed to stay, but not to grow, and the baseline doubles as the
 *      migration checklist.
 *   3. Reports near-duplicate colours (`--report`), which is how you find that
 *      the app currently draws four different greens.
 *
 * When a file legitimately loses literals, run with `--update` to lower its
 * baseline. Raising a baseline by hand is design debt — do it deliberately.
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const baselinePath = path.join(root, 'config/design-token-baseline.json');
const exemptPath = path.join(root, 'config/design-token-exempt.json');
const SCAN_ROOTS = ['features', 'components', 'app', 'styles', 'lib'];
/** The design-system playground exists to hold candidate values as literals. */
const SKIP_PREFIXES = ['app/dev/design-system/'];
const HEX = /#[0-9A-Fa-f]{6}\b/g;
/* A Tailwind arbitrary value cannot contain a literal space: the space ends the
   class, the rest becomes a second bogus class, and the utility is silently
   never generated — the element just inherits whatever colour was above it.
   Nothing about it fails to compile, so only a check like this catches it. */
const SPACED_ARBITRARY = /(?<![\w-])[a-z-]+-\[[^\]"'`]*\s[^\]"'`]*\]/g;

/** The palette block of tokens.css is the definition of "this has a token". */
async function readTokens() {
  const source = await readFile(path.join(root, 'styles/tokens.css'), 'utf8');
  const start = source.indexOf('THE PAPER PALETTE');
  const end = source.indexOf('color-scheme:', start);
  if (start < 0 || end < 0) {
    throw new Error('Could not find the paper-palette block in styles/tokens.css');
  }
  const byHex = new Map();
  for (const [, name, hex] of source
    .slice(start, end)
    .matchAll(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6});/g)) {
    if (!byHex.has(hex.toLowerCase())) byHex.set(hex.toLowerCase(), name);
  }
  return byHex;
}

async function sourceFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  const nested = await Promise.all(entries.map(async (entry) => {
    if (entry.name === 'node_modules') return [];
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return /\.(?:ts|tsx|css)$/.test(entry.name) ? [target] : [];
  }));
  return nested.flat();
}

const tokensByHex = await readTokens();
const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
/* Files where a CSS variable genuinely cannot reach — canvas contexts and
   standalone SVG documents. Each entry carries its reason. */
const exempt = JSON.parse(await readFile(exemptPath, 'utf8'));

const counts = {};
const tokenViolations = [];
const spacedArbitrary = [];
const seenColors = new Map();

for (const root_ of SCAN_ROOTS) {
  for (const absolute of await sourceFiles(path.join(root, root_))) {
    const file = path.relative(root, absolute).split(path.sep).join('/');
    if (SKIP_PREFIXES.some((prefix) => file.startsWith(prefix))) continue;
    if (file === 'styles/tokens.css' || file in exempt) continue;
    const source = await readFile(absolute, 'utf8');
    if (/\.tsx?$/.test(file)) {
      for (const [match] of source.matchAll(SPACED_ARBITRARY)) {
        spacedArbitrary.push(`${file}: ${match}`);
      }
    }
    for (const [hex] of source.matchAll(HEX)) {
      const key = hex.toLowerCase();
      seenColors.set(key, (seenColors.get(key) ?? 0) + 1);
      const token = tokensByHex.get(key);
      if (token) {
        tokenViolations.push(`${file}: ${hex} is --${token} (use the token or its utility)`);
      } else {
        counts[file] = (counts[file] ?? 0) + 1;
      }
    }
  }
}

if (process.argv.includes('--update')) {
  await writeFile(
    baselinePath,
    `${JSON.stringify(Object.fromEntries(Object.entries(counts).sort()), null, 2)}\n`,
  );
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`Baseline written: ${Object.keys(counts).length} files, ${total} untokenised literals.`);
  process.exit(0);
}

if (process.argv.includes('--report')) {
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const all = [...new Set([...seenColors.keys(), ...tokensByHex.keys()])].sort();
  const clusters = [];
  const claimed = new Set();
  for (const a of all) {
    if (claimed.has(a)) continue;
    const near = all.filter((b) => {
      if (b === a) return false;
      const [ar, ag, ab] = rgb(a);
      const [br, bg, bb] = rgb(b);
      return Math.hypot(ar - br, ag - bg, ab - bb) < 26;
    });
    if (near.length === 0) continue;
    for (const b of [a, ...near]) claimed.add(b);
    clusters.push([a, ...near]);
  }
  console.log('Near-duplicate colours — candidates for collapsing when the palette is chosen:\n');
  for (const cluster of clusters) {
    console.log(cluster
      .map((hex) => {
        const token = tokensByHex.get(hex);
        const uses = seenColors.get(hex) ?? 0;
        return `${hex}${token ? ` (--${token})` : ''}${uses ? ` ×${uses}` : ''}`;
      })
      .join('  ~  '));
  }
  console.log(`\n${clusters.length} clusters.`);
  process.exit(0);
}

const regressions = Object.entries(counts)
  .filter(([file, count]) => count > (baseline[file] ?? 0))
  .map(([file, count]) => `${file}: ${count} literals, baseline ${baseline[file] ?? 0}`);
const stale = Object.entries(baseline)
  .filter(([file, count]) => (counts[file] ?? 0) < count)
  .map(([file, count]) => `${file}: now ${counts[file] ?? 0}, baseline ${count}`);

if (tokenViolations.length > 0 || regressions.length > 0 || spacedArbitrary.length > 0) {
  if (spacedArbitrary.length > 0) {
    console.error('Tailwind arbitrary values cannot contain a space — these utilities are never generated. Use an underscore, or remove the space:');
    for (const entry of spacedArbitrary.sort()) console.error(`- ${entry}`);
  }
  if (tokenViolations.length > 0) {
    console.error('These literals already have a token in styles/tokens.css:');
    for (const violation of tokenViolations.sort()) console.error(`- ${violation}`);
  }
  if (regressions.length > 0) {
    console.error('New untokenised colour literals. Add a token in styles/tokens.css (and app/tailwind.css) instead:');
    for (const regression of regressions.sort()) console.error(`- ${regression}`);
  }
  process.exitCode = 1;
} else {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`Design tokens OK (${tokensByHex.size} tokens; ${total} untokenised literals ratcheted).`);
  if (stale.length > 0) {
    console.log('Files below their baseline — run `pnpm run check:design-tokens --update` to lock the win in:');
    for (const entry of stale.sort()) console.log(`- ${entry}`);
  }
}
