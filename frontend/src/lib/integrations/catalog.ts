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
