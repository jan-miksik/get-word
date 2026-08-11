import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const featuresRoot = path.join(root, 'features');
const allowlist = new Set(JSON.parse(await readFile(
  path.join(root, 'config/feature-boundary-allowlist.json'),
  'utf8',
)));

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    if (entry.name === '__tests__') return [];
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [target] : [];
  }));
  return nested.flat();
}

const violations = [];
const observedDebt = new Set();
const importPattern = /["']@\/features\/([^/]+)\/([^"']+)["']/g;

for (const absoluteFile of await sourceFiles(featuresRoot)) {
  const sourceFile = path.relative(root, absoluteFile).split(path.sep).join('/');
  const sourceFeature = sourceFile.split('/')[1];
  const source = await readFile(absoluteFile, 'utf8');
  for (const match of source.matchAll(importPattern)) {
    const [, targetFeature, targetPath] = match;
    if (targetFeature === sourceFeature || targetFeature === 'shared') continue;
    if (/^public\.(?:client|server)$/.test(targetPath) || targetPath === 'contracts') continue;
    const edge = `${sourceFile} -> @/features/${targetFeature}/${targetPath}`;
    observedDebt.add(edge);
    if (!allowlist.has(edge)) violations.push(edge);
  }
}

const staleAllowlistEntries = [...allowlist].filter((edge) => !observedDebt.has(edge));

if (violations.length > 0 || staleAllowlistEntries.length > 0) {
  if (violations.length > 0) {
    console.error('New cross-feature internal imports are forbidden. Use public.client.ts, public.server.ts, or contracts.ts:');
    for (const violation of [...new Set(violations)].sort()) console.error(`- ${violation}`);
  }
  if (staleAllowlistEntries.length > 0) {
    console.error('Remove resolved entries from config/feature-boundary-allowlist.json:');
    for (const edge of staleAllowlistEntries.sort()) console.error(`- ${edge}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Feature boundaries OK (${allowlist.size} legacy edges ratcheted).`);
}
