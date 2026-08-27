import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const config = JSON.parse(await readFile(
  path.join(root, 'config/ai-context-budgets.json'),
  'utf8',
));

const ignoredRoots = new Set([
  '.agents',
  '.claude',
  '.codex',
  '.git',
  '.next',
  '.next-dev',
  '.worktrees',
  'build',
  'coverage',
  'node_modules',
  'out',
  'wordbook',
]);

function matchesPattern(file, pattern) {
  if (pattern.startsWith('**/') && pattern.endsWith('/**')) {
    return file.includes(`/${pattern.slice(3, -3)}/`);
  }
  if (pattern.endsWith('/**')) return file.startsWith(pattern.slice(0, -3));
  return file === pattern;
}

async function sourceFiles(directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    if (entry.isDirectory() && ignoredRoots.has(entry.name)) return [];
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [target] : [];
  }));
  return nested.flat();
}

const violations = [];
const trackedHotspots = [];
for (const absoluteFile of await sourceFiles()) {
  const file = path.relative(root, absoluteFile).split(path.sep).join('/');
  if (config.exclude.some((pattern) => matchesPattern(file, pattern))) continue;
  const source = await readFile(absoluteFile, 'utf8');
  const lines = source === '' ? 0 : source.split(/\r?\n/).length;
  const maxLines = config.budgets[file] ?? config.defaultMaxLines;
  if (lines > maxLines) violations.push({ file, lines, maxLines });
  if (config.budgets[file]) trackedHotspots.push({ file, lines, maxLines });
}

for (const file of Object.keys(config.budgets)) {
  if (!trackedHotspots.some((entry) => entry.file === file)) {
    violations.push({ file, lines: 0, maxLines: config.budgets[file], missing: true });
  }
}

if (violations.length > 0) {
  console.error('AI context budget exceeded. Extract a focused module or deliberately ratchet the budget:');
  for (const violation of violations.sort((left, right) => left.file.localeCompare(right.file))) {
    console.error(
      violation.missing
        ? `- ${violation.file}: tracked file is missing`
        : `- ${violation.file}: ${violation.lines} lines (budget ${violation.maxLines})`,
    );
  }
  process.exitCode = 1;
} else {
  const totalLines = trackedHotspots.reduce((sum, entry) => sum + entry.lines, 0);
  console.log(
    `AI context budgets OK (${trackedHotspots.length} hotspots, ${totalLines} tracked lines).`,
  );
}
