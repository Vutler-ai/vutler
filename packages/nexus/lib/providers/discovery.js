'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function safeExists(fsImpl, targetPath) {
  if (!targetPath) return false;
  try {
    return fsImpl.existsSync(targetPath);
  } catch (_) {
    return false;
  }
}

function safeReadDir(fsImpl, targetPath) {
  try {
    return fsImpl.readdirSync(targetPath, { withFileTypes: true });
  } catch (_) {
    return [];
  }
}

function normalizeEntryName(entry) {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry.name === 'string') return entry.name;
  return '';
}

function firstExistingPath(fsImpl, candidates = []) {
  for (const candidate of candidates) {
    if (safeExists(fsImpl, candidate)) return candidate;
  }
  return null;
}

function buildAppCatalog(platform, homeDirectory, env) {
  if (platform === 'darwin') {
    return [
      { key: 'mail', label: 'Apple Mail', candidates: ['/Applications/Mail.app'] },
      { key: 'calendar', label: 'Apple Calendar', candidates: ['/Applications/Calendar.app'] },
      { key: 'contacts', label: 'Apple Contacts', candidates: ['/Applications/Contacts.app'] },
      { key: 'outlook', label: 'Microsoft Outlook', candidates: ['/Applications/Microsoft Outlook.app'] },
      { key: 'teams', label: 'Microsoft Teams', candidates: ['/Applications/Microsoft Teams.app'] },
      { key: 'slack', label: 'Slack', candidates: ['/Applications/Slack.app'] },
      { key: 'notion', label: 'Notion', candidates: ['/Applications/Notion.app'] },
      { key: 'discord', label: 'Discord', candidates: ['/Applications/Discord.app'] },
      { key: 'telegram', label: 'Telegram', candidates: ['/Applications/Telegram.app'] },
      { key: 'chrome', label: 'Google Chrome', candidates: ['/Applications/Google Chrome.app'] },
    ];
  }

  if (platform === 'win32') {
    const programFiles = env.ProgramFiles || 'C:\\Program Files';
    const programFilesX86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const localAppData = env.LOCALAPPDATA || path.join(homeDirectory, 'AppData', 'Local');

    return [
      {
        key: 'outlook',
        label: 'Microsoft Outlook',
        candidates: [
          path.join(programFiles, 'Microsoft Office', 'root', 'Office16', 'OUTLOOK.EXE'),
          path.join(programFilesX86, 'Microsoft Office', 'root', 'Office16', 'OUTLOOK.EXE'),
        ],
      },
      {
        key: 'teams',
        label: 'Microsoft Teams',
        candidates: [
          path.join(localAppData, 'Microsoft', 'Teams', 'current', 'Teams.exe'),
          path.join(localAppData, 'Microsoft', 'Teams', 'Update.exe'),
        ],
      },
      {
        key: 'slack',
        label: 'Slack',
        candidates: [path.join(localAppData, 'slack', 'slack.exe')],
      },
      {
        key: 'notion',
        label: 'Notion',
        candidates: [path.join(localAppData, 'Programs', 'Notion', 'Notion.exe')],
      },
      {
        key: 'discord',
        label: 'Discord',
        candidates: [path.join(localAppData, 'Discord', 'Update.exe')],
      },
      {
        key: 'telegram',
        label: 'Telegram',
        candidates: [path.join(programFiles, 'Telegram Desktop', 'Telegram.exe')],
      },
      {
        key: 'chrome',
        label: 'Google Chrome',
        candidates: [path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe')],
      },
    ];
  }

  return [
    { key: 'slack', label: 'Slack', candidates: ['/usr/bin/slack', '/snap/bin/slack'] },
    { key: 'chrome', label: 'Google Chrome', candidates: ['/usr/bin/google-chrome', '/usr/bin/chromium-browser'] },
  ];
}

function detectInstalledApps({
  platform = process.platform,
  homeDirectory = os.homedir(),
  env = process.env,
  fsImpl = fs,
} = {}) {
  return buildAppCatalog(platform, homeDirectory, env)
    .map((app) => {
      const location = firstExistingPath(fsImpl, app.candidates);
      return location ? { key: app.key, label: app.label, location } : null;
    })
    .filter(Boolean);
}

function detectMacCloudStorageFolders(fsImpl, homeDirectory) {
  const cloudRoot = path.join(homeDirectory, 'Library', 'CloudStorage');
  const folders = [];
  const entries = safeReadDir(fsImpl, cloudRoot).map(normalizeEntryName);

  entries.forEach((entryName) => {
    if (!entryName) return;
    if (entryName.startsWith('GoogleDrive')) {
      folders.push({
        key: 'google_drive',
        label: 'Google Drive Sync',
        path: path.join(cloudRoot, entryName),
      });
    } else if (entryName.startsWith('OneDrive')) {
      folders.push({
        key: 'onedrive',
        label: 'OneDrive Sync',
        path: path.join(cloudRoot, entryName),
      });
    } else if (entryName.startsWith('Dropbox')) {
      folders.push({
        key: 'dropbox',
        label: 'Dropbox Sync',
        path: path.join(cloudRoot, entryName),
      });
    }
  });

  const icloud = path.join(homeDirectory, 'Library', 'Mobile Documents', 'com~apple~CloudDocs');
  if (safeExists(fsImpl, icloud)) {
    folders.push({
      key: 'icloud_drive',
      label: 'iCloud Drive',
      path: icloud,
    });
  }

  return folders;
}

function detectSyncedFolders({
  platform = process.platform,
  homeDirectory = os.homedir(),
  fsImpl = fs,
} = {}) {
  const folders = [];

  if (platform === 'darwin') {
    folders.push(...detectMacCloudStorageFolders(fsImpl, homeDirectory));
  }

  const commonFolders = [
    { key: 'dropbox', label: 'Dropbox Sync', path: path.join(homeDirectory, 'Dropbox') },
    { key: 'onedrive', label: 'OneDrive Sync', path: path.join(homeDirectory, 'OneDrive') },
    { key: 'google_drive', label: 'Google Drive Sync', path: path.join(homeDirectory, 'Google Drive') },
    { key: 'google_drive', label: 'Google Drive Sync', path: path.join(homeDirectory, 'My Drive') },
  ];

  commonFolders.forEach((folder) => {
    if (safeExists(fsImpl, folder.path)) {
      folders.push(folder);
    }
  });

  const unique = new Map();
  folders.forEach((folder) => {
    const id = `${folder.key}:${folder.path}`;
    if (!unique.has(id)) unique.set(id, folder);
  });

  return Array.from(unique.values());
}

function buildProviderAvailability({
  platform = process.platform,
  providers = {},
} = {}) {
  const desktopPimSupported = platform === 'darwin' || platform === 'win32';
  const searchSupported = platform === 'darwin' || platform === 'win32' || platform === 'linux';

  return {
    filesystem: {
      available: Boolean(providers.fs),
      source: 'local_runtime',
      reason: providers.fs ? 'Filesystem provider loaded in Nexus runtime' : 'Filesystem provider is not loaded',
    },
    search: {
      available: searchSupported,
      source: 'desktop_local',
      reason: searchSupported ? 'Local search bridge is supported on this platform' : 'Local search bridge is not supported on this platform',
    },
    documents: {
      available: true,
      source: 'local_runtime',
      reason: 'Built-in document readers are bundled with Nexus',
    },
    mail: {
      available: desktopPimSupported,
      source: 'desktop_local',
      reason: desktopPimSupported ? 'Desktop mail bridge can run on this platform' : 'Desktop mail bridge is not supported on this platform',
    },
    calendar: {
      available: desktopPimSupported,
      source: 'desktop_local',
      reason: desktopPimSupported ? 'Desktop calendar bridge can run on this platform' : 'Desktop calendar bridge is not supported on this platform',
    },
    contacts: {
      available: desktopPimSupported,
      source: 'desktop_local',
      reason: desktopPimSupported ? 'Desktop contacts bridge can run on this platform' : 'Desktop contacts bridge is not supported on this platform',
    },
    clipboard: {
      available: Boolean(providers.clipboard),
      source: 'local_runtime',
      reason: providers.clipboard ? 'Clipboard provider loaded in Nexus runtime' : 'Clipboard provider is not loaded',
    },
    shell: {
      available: Boolean(providers.shell),
      source: 'local_runtime',
      reason: providers.shell ? 'Shell provider loaded in Nexus runtime' : 'Shell provider is not loaded',
    },
    terminal: {
      available: Boolean(providers.terminal),
      source: 'local_runtime',
      reason: providers.terminal ? 'Terminal session provider loaded in Nexus runtime' : 'Terminal session provider is not loaded',
    },
  };
}

function buildLocalDiscoverySnapshot({
  platform = process.platform,
  homeDirectory = os.homedir(),
  hostname = os.hostname(),
  env = process.env,
  providers = {},
  fsImpl = fs,
} = {}) {
  const detectedApps = detectInstalledApps({ platform, homeDirectory, env, fsImpl });
  const syncedFolders = detectSyncedFolders({ platform, homeDirectory, fsImpl });
  const providersSnapshot = buildProviderAvailability({ platform, providers });
  const readyProviders = Object.values(providersSnapshot).filter((provider) => provider.available).length;

  return {
    collectedAt: new Date().toISOString(),
    platform,
    hostname,
    homeDirectory,
    detectedApps,
    syncedFolders,
    providers: providersSnapshot,
    summary: {
      detectedApps: detectedApps.length,
      syncedFolders: syncedFolders.length,
      readyProviders,
      totalProviders: Object.keys(providersSnapshot).length,
    },
  };
}

module.exports = {
  buildLocalDiscoverySnapshot,
  detectInstalledApps,
  detectSyncedFolders,
  buildProviderAvailability,
};
