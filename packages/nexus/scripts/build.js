#!/usr/bin/env node
'use strict';

/**
 * Build script — packages Nexus into native binaries via pkg.
 *
 * Usage: node scripts/build.js [--target mac|win|all]
 *
 * Output: dist/nexus-macos, dist/nexus-win.exe
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PKG_JSON = path.join(ROOT, 'package.json');

const args = process.argv.slice(2);
const targetArg = args.find(a => a.startsWith('--target='))?.split('=')[1] || 'all';

// Ensure dist dir
fs.mkdirSync(DIST, { recursive: true });

// pkg targets
const targets = {
  mac: 'node18-macos-x64',
  win: 'node18-win-x64',
};

const selectedTargets = targetArg === 'all'
  ? Object.entries(targets)
  : [[targetArg, targets[targetArg]]].filter(([, v]) => v);

if (selectedTargets.length === 0) {
  console.error(`Unknown target: ${targetArg}. Use: mac, win, all`);
  process.exit(1);
}

// Read package.json and add pkg config if missing
const pkg = JSON.parse(fs.readFileSync(PKG_JSON, 'utf8'));
if (!pkg.pkg) {
  pkg.pkg = {
    assets: ['lib/**/*', 'dashboard/**/*', 'bin/**/*'],
    outputPath: 'dist',
  };
  fs.writeFileSync(PKG_JSON, JSON.stringify(pkg, null, 2));
  console.log('[Build] Added pkg config to package.json');
}

// Install deps if needed
if (!fs.existsSync(path.join(ROOT, 'node_modules'))) {
  console.log('[Build] Installing dependencies...');
  execSync('npm install', { cwd: ROOT, stdio: 'inherit' });
}

// Build each target
for (const [name, target] of selectedTargets) {
  const outName = name === 'win' ? 'nexus-win.exe' : 'nexus-macos';
  const outPath = path.join(DIST, outName);
  console.log(`[Build] Packaging for ${name} (${target})...`);
  try {
    execSync(
      `npx pkg . --target ${target} --output ${outPath} --compress GZip`,
      { cwd: ROOT, stdio: 'inherit' }
    );
    const size = fs.statSync(outPath).size;
    console.log(`[Build] ✅ ${outName} — ${(size / 1024 / 1024).toFixed(1)}MB`);
  } catch (err) {
    console.error(`[Build] ❌ Failed for ${name}:`, err.message);
  }
}

console.log('[Build] Done. Output in dist/');
