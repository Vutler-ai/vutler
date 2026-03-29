#!/usr/bin/env node
'use strict';

/**
 * Installer creator — wraps pkg binaries into .dmg (macOS) and .exe (Windows).
 *
 * macOS: Uses hdiutil to create a .dmg from the binary + LaunchAgent plist
 * Windows: Creates a self-extracting setup script with Task Scheduler registration
 *
 * Prerequisites:
 *   - Run scripts/build.js first to create dist/nexus-macos and dist/nexus-win.exe
 *   - macOS: hdiutil (built-in)
 *   - Windows: makensis (NSIS) — optional, falls back to zip
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
  const binary = path.join(DIST, 'nexus-macos');
  if (!fs.existsSync(binary)) {
    console.error('[Installer] nexus-macos binary not found. Run scripts/build.js first.');
    process.exit(1);
  }

  const stagingDir = path.join(DIST, 'dmg-staging');
  fs.mkdirSync(stagingDir, { recursive: true });

  // Copy binary
  fs.copyFileSync(binary, path.join(stagingDir, 'Vutler Nexus'));
  fs.chmodSync(path.join(stagingDir, 'Vutler Nexus'), 0o755);

  // Create LaunchAgent plist for auto-start
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>ai.vutler.nexus</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Applications/Vutler Nexus</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
</dict>
</plist>`;
  fs.writeFileSync(path.join(stagingDir, 'ai.vutler.nexus.plist'), plist);

  // Create install script
  const installScript = `#!/bin/bash
cp "Vutler Nexus" /Applications/
cp ai.vutler.nexus.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/ai.vutler.nexus.plist
echo "Vutler Nexus installed. Open http://localhost:3100 to complete setup."
open http://localhost:3100/onboarding
`;
  fs.writeFileSync(path.join(stagingDir, 'install.sh'), installScript);
  fs.chmodSync(path.join(stagingDir, 'install.sh'), 0o755);

  // Create .dmg
  const dmgPath = path.join(DIST, 'VutlerNexus-Installer.dmg');
  try {
    execSync(`hdiutil create -volname "Vutler Nexus" -srcfolder "${stagingDir}" -ov -format UDZO "${dmgPath}"`, { stdio: 'inherit' });
    console.log(`[Installer] ✅ ${dmgPath}`);
  } catch (err) {
    console.error('[Installer] hdiutil failed:', err.message);
    console.log('[Installer] Falling back to tar.gz...');
    execSync(`tar -czf "${DIST}/VutlerNexus-Installer.tar.gz" -C "${stagingDir}" .`, { stdio: 'inherit' });
    console.log(`[Installer] ✅ ${DIST}/VutlerNexus-Installer.tar.gz`);
  }

  // Cleanup staging
  fs.rmSync(stagingDir, { recursive: true, force: true });
}

// ── Windows .exe ─────────────────────────────────────────────────────────────

function createWindowsInstaller() {
  const binary = path.join(DIST, 'nexus-win.exe');
  if (!fs.existsSync(binary)) {
    console.error('[Installer] nexus-win.exe binary not found. Run scripts/build.js first.');
    process.exit(1);
  }

  // Create PowerShell install script
  const psInstall = `
$dest = "$env:LOCALAPPDATA\\VutlerNexus"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item "nexus-win.exe" "$dest\\VutlerNexus.exe" -Force

# Register as startup task
$action = New-ScheduledTaskAction -Execute "$dest\\VutlerNexus.exe"
$trigger = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName "VutlerNexus" -Action $action -Trigger $trigger -Force | Out-Null

# Start now
Start-Process "$dest\\VutlerNexus.exe"
Start-Sleep -Seconds 3
Start-Process "http://localhost:3100/onboarding"
Write-Host "Vutler Nexus installed successfully."
`;
  fs.writeFileSync(path.join(DIST, 'install.ps1'), psInstall);
  console.log(`[Installer] ✅ ${DIST}/install.ps1 (run with PowerShell as admin)`);
  console.log('[Installer] For NSIS .exe wrapper, install makensis and run manually.');
}

// ── Main ─────────────────────────────────────────────────────────────────────

if (platform === 'darwin' || platform === 'mac') {
  createDmg();
} else if (platform === 'win32' || platform === 'win') {
  createWindowsInstaller();
} else {
  console.log('[Installer] Creating both platforms...');
  if (fs.existsSync(path.join(DIST, 'nexus-macos'))) createDmg();
  if (fs.existsSync(path.join(DIST, 'nexus-win.exe'))) createWindowsInstaller();
}
