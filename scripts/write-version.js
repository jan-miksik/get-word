#!/usr/bin/env node
// Computes the app version from git history and writes it to version.json.
// Run by the pre-commit hook so deploys (which use shallow clones without full
// history) can read the version from the committed file instead of git.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const base = require('../package.json').version;
const [major, minor] = base.split('.');

let patch = '0';
try {
  const count = parseInt(
    execSync('git rev-list --count HEAD', { stdio: ['pipe', 'pipe', 'ignore'] })
      .toString()
      .trim(),
    10
  );
  // The pre-commit hook runs before the in-progress commit exists, so add one
  // to reflect the count the repository will have once this commit lands.
  patch = String(count + 1);
} catch {
  patch = '0';
}

const version = `${major}.${minor}.${patch}`;
const file = path.join(__dirname, '..', 'version.json');
fs.writeFileSync(file, `${JSON.stringify({ version }, null, 2)}\n`);
console.log(`version.json -> ${version}`);
