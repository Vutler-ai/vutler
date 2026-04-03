export const SOCIAL_PLATFORM_PROVIDERS = [
  "linkedin",
  "twitter",
  "instagram",
  "facebook",
  "tiktok",
  "youtube",
  "threads",
  "bluesky",
  "pinterest",
] as const;

export const GOOGLE_WORKSPACE_CHILDREN = [
  "google-calendar",
  "google-drive",
] as const;

export const INTEGRATION_KEY_ALIASES: Record<string, string> = {
  "social-media": "social_media",
  socialmedia: "social_media",
  x: "twitter",
  "google-calendar": "google",
  google_calendar: "google",
  "google-drive": "google",
  google_drive: "google",
};

export const SOCIAL_PLATFORM_META: Record<string, { icon: string; name: string }> = {
  linkedin: { icon: "💼", name: "LinkedIn" },
  twitter: { icon: "🐦", name: "X (Twitter)" },
  instagram: { icon: "📸", name: "Instagram" },
  facebook: { icon: "📘", name: "Facebook" },
  tiktok: { icon: "🎵", name: "TikTok" },
  youtube: { icon: "📺", name: "YouTube" },
  threads: { icon: "🧵", name: "Threads" },
  bluesky: { icon: "🦋", name: "Bluesky" },
  pinterest: { icon: "📌", name: "Pinterest" },
};

export type OAuthConnectorAccessModel = "cloud-required" | "local-first";

export interface OAuthConnectorConsentMeta {
  provider: "google" | "github" | "microsoft365";
  icon: string;
  name: string;
  accessModel: OAuthConnectorAccessModel;
  accessModelLabel: string;
  accessModelDescription: string;
  capabilities: string[];
  scopes: string[];
}

export const OAUTH_CONNECTOR_CONSENT_META: Record<string, OAuthConnectorConsentMeta> = {
  google: {
    provider: "google",
    icon: "🔵",
    name: "Google Workspace",
    accessModel: "local-first",
    accessModelLabel: "Local-first",
    accessModelDescription: "If the client runs Nexus Local on their machine, part of the document, mail, and calendar access can stay local instead of relying entirely on cloud APIs.",
    capabilities: [
      "Read Gmail inbox messages and search mail",
      "Read and create Google Calendar events",
      "Read Google Drive files already shared with the workspace",
      "Read Google contacts for workspace-assisted actions",
    ],
    scopes: [
      "openid",
      "email",
      "profile",
      "calendar.readonly",
      "calendar.events",
      "drive.file",
      "gmail.readonly",
      "gmail.send",
      "gmail.modify",
      "contacts.readonly",
    ],
  },
  github: {
    provider: "github",
    icon: "🐙",
    name: "GitHub",
    accessModel: "cloud-required",
    accessModelLabel: "Cloud-required",
    accessModelDescription: "GitHub operations are provider-native and cannot be replaced by Nexus Local on an end-user workstation.",
    capabilities: [
      "Read repositories and pull request context",
      "Inspect issues and developer workflows",
      "Use workspace-level GitHub identity for future automations",
    ],
    scopes: [
      "repo",
      "read:user",
    ],
  },
  microsoft365: {
    provider: "microsoft365",
    icon: "🟦",
    name: "Microsoft 365",
    accessModel: "local-first",
    accessModelLabel: "Local-first",
    accessModelDescription: "If the client runs Nexus Local on their machine, some Outlook, calendar, and contacts access can be handled from the desktop side rather than only through Microsoft Graph.",
    capabilities: [
      "Read Outlook mail messages",
      "Read calendar events",
      "Read personal and directory contacts",
      "Refresh workspace tokens for Microsoft-backed data access",
    ],
    scopes: [
      "openid",
      "email",
      "profile",
      "offline_access",
      "User.Read",
      "Mail.Read",
      "Calendars.Read",
      "Contacts.Read",
    ],
  },
};

export const CONNECTOR_META: Record<string, { icon: string; name: string; description: string }> = {
  chatgpt: {
    icon: "🤖",
    name: "ChatGPT",
    description: "Use your ChatGPT subscription to power agents with GPT-5.4, o3, and Codex.",
  },
  google: {
    icon: "🔵",
    name: "Google Workspace",
    description: "One connector for Gmail, Calendar, Drive, and Google contacts.",
  },
  github: {
    icon: "🐙",
    name: "GitHub",
    description: "Repos, issues, pull requests, and developer workflows.",
  },
  slack: {
    icon: "💬",
    name: "Slack",
    description: "Channels, notifications, and messaging automations.",
  },
  telegram: {
    icon: "✈️",
    name: "Telegram",
    description: "Telegram Bot API messaging and commands.",
  },
  discord: {
    icon: "🎮",
    name: "Discord",
    description: "Channels, communities, and bot messaging.",
  },
  notion: {
    icon: "📝",
    name: "Notion",
    description: "Pages, databases, and team knowledge.",
  },
  linear: {
    icon: "🟣",
    name: "Linear",
    description: "Issue tracking, cycles, and roadmap workflows.",
  },
  jira: {
    icon: "🔷",
    name: "Jira",
    description: "Projects, tickets, and sprint operations.",
  },
  n8n: {
    icon: "⚡",
    name: "n8n",
    description: "Workflow automation and custom orchestrations.",
  },
  microsoft365: {
    icon: "🟦",
    name: "Microsoft 365",
    description: "Outlook, calendar, contacts, OneDrive, and SharePoint.",
  },
  social_media: {
    icon: "📱",
    name: "Social Media",
    description: "One connector to manage LinkedIn, X, Instagram, TikTok, and other publishing accounts.",
  },
};

export const WORKSPACE_CONNECTOR_ORDER = [
  "chatgpt",
  "google",
  "github",
  "microsoft365",
  "social_media",
  "slack",
  "telegram",
  "discord",
  "notion",
  "linear",
  "jira",
  "n8n",
] as const;

export function normalizeIntegrationKey(value: string | null | undefined): string {
  const normalized = String(value || "").trim().toLowerCase();
  return INTEGRATION_KEY_ALIASES[normalized] || normalized;
}

export function isSocialPlatformProvider(value: string | null | undefined): boolean {
  return SOCIAL_PLATFORM_PROVIDERS.includes(normalizeIntegrationKey(value) as (typeof SOCIAL_PLATFORM_PROVIDERS)[number]);
}

export function getSocialPlatformMeta(value: string | null | undefined) {
  const normalized = normalizeIntegrationKey(value);
  return SOCIAL_PLATFORM_META[normalized] || { icon: "📱", name: normalized || "Social account" };
}

export function getOauthConnectorConsentMeta(value: string | null | undefined): OAuthConnectorConsentMeta | null {
  const normalized = normalizeIntegrationKey(value);
  return OAUTH_CONNECTOR_CONSENT_META[normalized] || null;
}
