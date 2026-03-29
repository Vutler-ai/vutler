# Nexus Local Integrations — Installation Guide

## Prerequisites

### System Requirements

- **macOS**: 12.0+ (Intel or Apple Silicon)
- **Windows**: 10 (build 1909+) or 11
- **Linux**: Ubuntu 20.04+ (experimental)

### Software Requirements

- **Node.js**: 18.0.0 or later (LTS recommended)
- **npm**: 9.0.0 or later OR **pnpm**: 8.0.0 or later
- **Python**: 3.8+ (for native module compilation)
- **Build tools**:
  - macOS: Xcode Command Line Tools (`xcode-select --install`)
  - Windows: Visual Studio Build Tools or MinGW

### Native Dependencies

These must be available on your system before Nexus installation:

1. **better-sqlite3** (Node.js SQLite binding)
   - Requires Python + C++ compiler
   - Auto-compiled during `npm install`

2. **chokidar** (File system watcher)
   - Works out of the box on macOS/Windows/Linux

3. **pkg** (Binary packaging)
   - Installed as dev dependency
   - Used during build step only

## Package Installation & Setup

### Step 1: Clone the Vutler Repository

```bash
git clone https://github.com/your-org/vutler.git
cd vutler
```

### Step 2: Install Nexus Package

Navigate to the packages/nexus directory and install dependencies:

```bash
cd packages/nexus
npm install
# OR
pnpm install
```

### Step 3: Verify Installation

Test that all dependencies are correctly installed:

```bash
npm run test
# or check specific modules
node -e "require('better-sqlite3'); require('chokidar'); require('ws'); console.log('✓ All deps OK')"
```

### Step 4: Configure Environment Variables

Create a `.env` file in the Nexus directory:

```bash
# .env
VUTLER_KEY=your-api-key-from-vutler-cloud
VUTLER_SERVER=https://app.vutler.ai
NODE_NAME=MyMachine-$(hostname)
NODE_ENV=production
```

Alternatively, set environment variables before running:

```bash
export VUTLER_KEY="your-api-key"
export VUTLER_SERVER="https://app.vutler.ai"
node index.js
```

## Building Binaries (macOS & Windows)

Nexus can be packaged as a standalone executable using `pkg`. This creates a single-file binary that doesn't require Node.js to be installed on the target system.

### macOS Binary

```bash
# From packages/nexus directory
npm run build:mac

# Output: dist/nexus-mac.dmg (installer package)
# Or binary: dist/nexus-mac (raw executable)
```

The build script:
1. Uses `pkg` to compile JavaScript + Node.js runtime into single binary
2. Targets macOS (arm64 + x86_64 universal binary)
3. Gzips to reduce size (~30MB → ~12MB)
4. Outputs `.dmg` installer with auto-launch agent

### Windows Binary

```bash
# From packages/nexus directory
npm run build:windows

# Output: dist/nexus-windows.exe (installer)
# Or binary: dist/nexus.exe (raw executable)
```

The build script:
1. Compiles Node.js + runtime into `.exe`
2. Targets Windows 10+ (both 32 & 64-bit)
3. Includes PowerShell launch wrapper
4. Auto-registers with Task Scheduler for auto-start

### Build Configuration

Edit `scripts/build.js` to customize build targets:

```javascript
// scripts/build.js
const targets = [
  'node18-macos-arm64',   // Apple Silicon
  'node18-macos-x64',     // Intel Mac
  'node18-win-x64',       // Windows 64-bit
];

const options = {
  output: 'dist/nexus',
  targets,
  compress: 'gzip',      // Compression method
  targets: [...],
};
```

## First-Run Setup via QR Onboarding

### Desktop Installer (Recommended)

1. **Download & Run Installer**
   - macOS: Double-click `nexus-mac.dmg` → Drag Nexus.app to Applications → Launch
   - Windows: Double-click `nexus-windows.exe` → Follow installer → Auto-launches

2. **Dashboard Opens Automatically**
   - URL: `http://localhost:3100`
   - If port 3100 is busy, retries on 3101, 3102, etc.

3. **Onboarding Flow**
   - Click "Get Started" or scan QR code with your phone
   - QR code contains pairing token (valid for 5 minutes)

### Manual Setup (From Source)

If you're running Nexus directly from Node.js:

```bash
cd packages/nexus
node index.js

# Dashboard available at http://localhost:3100
```

### QR Code Pairing Steps

**Step 1: Generate Pairing Code**
- Dashboard shows QR code on load
- Code is 6 characters: e.g., `A3K9M2`
- Pairing endpoint: `GET /api/pairing/generate`
- Expires in 5 minutes

**Step 2: Scan with Mobile or Dashboard**
- If scanning with phone: Any device can capture QR
- If using dashboard on same machine: Click "Enter Code Manually"
- Code confirms device identity to Vutler Cloud

**Step 3: Select Permissions**
- **Documents**: ~/Documents folder (default enabled)
- **Desktop**: ~/Desktop folder
- **Downloads**: ~/Downloads folder
- **Custom Folders**: Add any additional paths
- Each toggle writes to `~/.vutler/permissions.json`

**Step 4: Verify Connection**
- Dashboard pings Nexus health endpoint
- Confirms WebSocket connected to Vutler Cloud
- Shows "Connection Verified ✓"

**Step 5: Complete Onboarding**
- Click "Confirm & Start Using Nexus"
- Auth token saved to `~/.vutler/nexus.json`
- Redirect to main dashboard

### Troubleshooting Onboarding

**QR Code not displaying?**
- Check localhost:3100 is accessible
- Verify port 3100 not blocked by firewall
- Check browser console for errors

**Pairing code expired?**
- Click "Generate New Code"
- Codes auto-refresh every 5 minutes

**"Connection Verified" fails?**
- Confirm `VUTLER_KEY` environment variable is set
- Verify internet connection to `api.vutler.ai`
- Check Nexus logs: `tail -f ~/.vutler/logs/nexus.log`

## Permissions File Structure

Nexus stores permissions and configuration in `~/.vutler/`:

```
~/.vutler/
├── nexus.json                 # Auth token + device config
├── permissions.json           # Folder ACLs + action whitelist
├── logs/
│   └── nexus.log             # Structured JSON logs
└── tasks.db                   # SQLite offline task queue (enterprise)
```

### nexus.json (Auth Token)

Created after successful QR pairing:

```json
{
  "nodeId": "nexus-mac-001",
  "authToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "workspaceId": "workspace-abc123",
  "pairedAt": "2026-03-29T15:30:00Z",
  "deviceName": "MacBook-Pro-Alex"
}
```

Permissions enforced even if token exists—revoke via dashboard.

### permissions.json (Folder ACLs)

Set during onboarding, can be modified manually:

```json
{
  "filesystem": {
    "allowed_paths": [
      "~/Documents",
      "~/Desktop",
      "~/Downloads"
    ],
    "read_only_paths": [
      "~/Projects/read-only"
    ],
    "denied_paths": [
      "~/.ssh",
      "~/.aws"
    ]
  },
  "shell": {
    "allowed_commands": [
      "ls",
      "cat",
      "grep",
      "find",
      "locate"
    ],
    "denied_patterns": [
      "rm",
      "delete",
      "sudo",
      "passwd"
    ]
  },
  "actions": {
    "allowed": [
      "search",
      "read_document",
      "read_clipboard",
      "list_emails",
      "read_calendar"
    ],
    "requires_confirmation": [
      "write_file",
      "shell_exec"
    ],
    "denied": [
      "delete_file",
      "install_software"
    ]
  },
  "updatedAt": "2026-03-29T15:30:00Z"
}
```

### logs/nexus.json (Structured Logs)

Real-time streaming JSON log for debugging:

```json
{"timestamp":"2026-03-29T15:30:00.123Z","level":"INFO","component":"[WSClient]","message":"Connected to wss://api.vutler.ai/ws/nexus","nodeId":"nexus-mac-001"}
{"timestamp":"2026-03-29T15:30:01.456Z","level":"INFO","component":"[TaskOrchestrator]","message":"Executing action=search taskId=f47ac10b-58cc-4372-a567-0e02b2c3d479"}
{"timestamp":"2026-03-29T15:30:02.789Z","level":"INFO","component":"[SearchProviderDarwin]","message":"Found 3 results","executionMs":1333}
```

Stream logs in real-time:

```bash
# macOS/Linux
tail -f ~/.vutler/logs/nexus.log | jq '.'  # with jq for pretty-print

# Windows PowerShell
Get-Content $env:USERPROFILE\.vutler\logs\nexus.log -Tail 50 -Wait
```

## Post-Installation Configuration

### Enable Auto-Start on Boot

**macOS**
Installer creates LaunchAgent plist at `~/Library/LaunchAgents/com.vutler.nexus.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.vutler.nexus</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Applications/Nexus.app/Contents/MacOS/nexus</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
</dict>
</plist>
```

To manually enable/disable:
```bash
# Enable
launchctl load ~/Library/LaunchAgents/com.vutler.nexus.plist

# Disable
launchctl unload ~/Library/LaunchAgents/com.vutler.nexus.plist

# Check status
launchctl list | grep vutler
```

**Windows**
Installer registers Task Scheduler task `VutlerNexus` to run at startup. View with:

```powershell
Get-ScheduledTask -TaskName VutlerNexus
```

Disable/enable in Task Scheduler GUI or:
```powershell
Disable-ScheduledTask -TaskName VutlerNexus
Enable-ScheduledTask -TaskName VutlerNexus
```

### Custom Configuration

Create `~/.vutler/config.json` for advanced options:

```json
{
  "port": 3100,
  "heartbeat_interval_ms": 30000,
  "reconnect_base_ms": 1000,
  "max_result_bytes": 1048576,
  "progress_interval_ms": 2000,
  "log_level": "info",
  "offline_mode": {
    "enabled": false,
    "max_queue_size": 1000
  }
}
```

Then restart Nexus to pick up changes.

## Verification Checklist

After installation, verify:

- [ ] `node index.js` or executable launches without errors
- [ ] Dashboard accessible at `http://localhost:3100`
- [ ] Onboarding QR code displays
- [ ] Pairing code generates (expires in 5 min)
- [ ] Permission toggles functional
- [ ] Health check passes (green indicator)
- [ ] `~/.vutler/nexus.json` created after pairing
- [ ] `~/.vutler/permissions.json` has allowed_paths
- [ ] `~/.vutler/logs/nexus.log` exists and being written
- [ ] WSClient connects to Vutler Cloud (check logs)
- [ ] Dashboard shows "Online" status

## Uninstallation

### macOS
```bash
# Remove app
rm -rf /Applications/Nexus.app

# Remove LaunchAgent
rm ~/Library/LaunchAgents/com.vutler.nexus.plist

# Remove config & logs (optional)
rm -rf ~/.vutler/
```

### Windows
1. Settings → Apps → Apps & Features → Find "Vutler Nexus"
2. Click Uninstall
3. Confirm Task Scheduler task removal

Or via PowerShell:
```powershell
# Remove scheduled task
Unregister-ScheduledTask -TaskName VutlerNexus -Confirm:$false

# Remove app (if installer path known)
Remove-Item "C:\Program Files\Vutler Nexus" -Recurse -Force

# Remove config (optional)
Remove-Item $env:USERPROFILE\.vutler -Recurse -Force
```

## Next Steps

After installation:

1. **Complete Onboarding**: Follow QR pairing flow
2. **Verify Permissions**: Check allowed folders in dashboard
3. **Test Task Execution**: Execute a simple search task from Vutler Cloud agent
4. **Review Logs**: Monitor `~/.vutler/logs/nexus.log` for any errors
5. **Enable Auto-Start**: Confirm Nexus launches on system reboot (macOS LaunchAgent / Windows Task Scheduler)
