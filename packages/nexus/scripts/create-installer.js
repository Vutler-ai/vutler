#!/usr/bin/env node
'use strict';

/**
 * Installer creator — wraps pkg binaries into .dmg (macOS) and .exe (Windows).
 *
 * macOS: Produces a drag-and-drop .app inside a .dmg with a launch wrapper
 * Windows: Emits a PowerShell bootstrapper alongside the packaged binary
 *
 * Prerequisites:
 *   - Run scripts/build.js first to create dist/vutler-nexus-macos and dist/vutler-nexus-windows.exe
 *   - macOS: hdiutil (built-in)
 *
 * Usage: node scripts/create-installer.js [--platform mac|win]
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const platform = process.argv.find(a => a.startsWith('--platform='))?.split('=')[1] || process.platform;

// ── macOS .dmg ───────────────────────────────────────────────────────────────

function createDmg() {
  const binary = path.join(DIST, 'vutler-nexus-macos');
  if (!fs.existsSync(binary)) {
    console.error('[Installer] vutler-nexus-macos binary not found. Run scripts/build.js first.');
    process.exit(1);
  }

  const stagingDir = path.join(DIST, 'dmg-staging');
  fs.mkdirSync(stagingDir, { recursive: true });

  const appDir = path.join(stagingDir, 'Vutler Nexus.app');
  const contentsDir = path.join(appDir, 'Contents');
  const macosDir = path.join(contentsDir, 'MacOS');
  const resourcesDir = path.join(contentsDir, 'Resources');
  fs.mkdirSync(macosDir, { recursive: true });
  fs.mkdirSync(resourcesDir, { recursive: true });

  fs.copyFileSync(binary, path.join(resourcesDir, 'vutler-nexus'));
  fs.chmodSync(path.join(resourcesDir, 'vutler-nexus'), 0o755);

const launcher = `#!/bin/bash
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
BIN="$APP_DIR/Contents/Resources/vutler-nexus"
HOME_DIR="\${HOME:-$APP_DIR}"
export HOME="$HOME_DIR"
export PORT="\${PORT:-3100}"
"\$BIN" start --port "\${PORT}" --type local >/tmp/vutler-nexus.log 2>&1 &
sleep 3
open "http://localhost:\${PORT}/" || true
wait
`;
  fs.writeFileSync(path.join(macosDir, 'Vutler Nexus'), launcher);
  fs.chmodSync(path.join(macosDir, 'Vutler Nexus'), 0o755);

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>ai.vutler.nexus</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Applications/Vutler Nexus.app/Contents/MacOS/Vutler Nexus</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
</dict>
</plist>`;
  fs.writeFileSync(path.join(resourcesDir, 'ai.vutler.nexus.plist'), plist);

  const readme = `Vutler Nexus

Drag "Vutler Nexus.app" to /Applications, or double-click it from this disk image.
The app launches the local Nexus runtime command. It does not inject a Vutler deploy token automatically.
Initialize the node with a deploy token first, then start Nexus to connect it to Vutler Cloud.
`;
  fs.writeFileSync(path.join(stagingDir, 'README.txt'), readme);

  try {
    fs.symlinkSync('/Applications', path.join(stagingDir, 'Applications'));
  } catch (_) {
    // Ignore if the symlink already exists or cannot be created in this environment.
  }

  // Create .dmg
  const dmgPath = path.join(DIST, 'vutler-nexus-macos.dmg');
  try {
    execSync(`hdiutil create -volname "Vutler Nexus" -srcfolder "${stagingDir}" -ov -format UDZO "${dmgPath}"`, { stdio: 'inherit' });
    console.log(`[Installer] ✅ ${dmgPath}`);
  } catch (err) {
    console.error('[Installer] hdiutil failed:', err.message);
    console.log('[Installer] Falling back to tar.gz...');
    execSync(`tar -czf "${DIST}/vutler-nexus-macos.tar.gz" -C "${stagingDir}" .`, { stdio: 'inherit' });
    console.log(`[Installer] ✅ ${DIST}/vutler-nexus-macos.tar.gz`);
  }

  // Cleanup staging
  fs.rmSync(stagingDir, { recursive: true, force: true });
}

// ── Windows .exe ─────────────────────────────────────────────────────────────

function createWindowsInstaller() {
  const binary = path.join(DIST, 'vutler-nexus-windows.exe');
  if (!fs.existsSync(binary)) {
    console.error('[Installer] vutler-nexus-windows.exe binary not found. Run scripts/build.js first.');
    process.exit(1);
  }

  // Create PowerShell install script
  const psInstall = `
$ErrorActionPreference = 'Stop'
$source = Split-Path -Parent $MyInvocation.MyCommand.Path
$dest = "$env:LOCALAPPDATA\\VutlerNexus"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item (Join-Path $source "vutler-nexus-windows.exe") "$dest\\VutlerNexus.exe" -Force

# Register as startup task
$action = New-ScheduledTaskAction -Execute "$dest\\VutlerNexus.exe"
$trigger = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName "VutlerNexus" -Action $action -Trigger $trigger -Force | Out-Null

# Start now
Start-Process "$dest\\VutlerNexus.exe"
Start-Sleep -Seconds 3
Start-Process "http://localhost:3100/"
Write-Host "Vutler Nexus installed successfully."
`;
  fs.writeFileSync(path.join(DIST, 'install.ps1'), psInstall);
  console.log(`[Installer] ✅ ${DIST}/install.ps1 (run with PowerShell as admin)`);
  console.log('[Installer] The runtime binary is ready at dist/vutler-nexus-windows.exe');
}

// ── Main ─────────────────────────────────────────────────────────────────────

if (platform === 'darwin' || platform === 'mac') {
  createDmg();
} else if (platform === 'win32' || platform === 'win') {
  createWindowsInstaller();
} else {
  console.log('[Installer] Creating both platforms...');
  if (fs.existsSync(path.join(DIST, 'vutler-nexus-macos'))) createDmg();
  if (fs.existsSync(path.join(DIST, 'vutler-nexus-windows.exe'))) createWindowsInstaller();
}
