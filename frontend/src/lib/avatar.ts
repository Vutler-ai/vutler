/**
 * Shared avatar resolution — used by agents list and agent detail layout.
 */

export const KNOWN_AVATAR_SLUGS = new Set([
  'accounting-assistant', 'appointment-scheduler', 'av-engineer', 'bi-agent',
  'competitor-monitor', 'compliance-monitor', 'contract-manager', 'customer-success',
  'document-processor', 'ecommerce-manager', 'feedback-analyzer', 'hr-assistant',
  'inventory-optimizer', 'invoice-manager', 'knowledge-base', 'lead-gen',
  'marketing-campaign', 'personal-assistant', 'pricing-optimizer', 'procurement',
  'project-coordinator', 'proposal-generator', 'research-analyst', 'social-media-manager',
  'translator', 'workflow-automation',
]);

const IMAGE_EXTENSION_RE = /\.(png|svg|jpg|jpeg|webp)$/i;
const SIMPLE_AVATAR_TOKEN_RE = /^[a-z0-9_-]+$/i;
const STARBOX_AGENT_AVATAR_MAP: Record<string, string> = {
  andrea: 'contract-manager',
  'assistant-rh-starbox': 'hr-assistant',
  jarvis: 'project-coordinator',
  luna: 'project-coordinator',
  marcus: 'bi-agent',
  max: 'marketing-campaign',
  michael: 'av-engineer',
  mike: 'av-engineer',
  nora: 'social-media-manager',
  oscar: 'proposal-generator',
  philip: 'feedback-analyzer',
  'release-devops': 'workflow-automation',
  rex: 'workflow-automation',
  sentinel: 'research-analyst',
  victor: 'lead-gen',
};

function stripImageExtension(value: string): string {
  return value.replace(IMAGE_EXTENSION_RE, '');
}

function toSpriteAvatarUrl(slug: string): string {
  return `/sprites/agent-${slug}.png`;
}

function normalizeLookupToken(value: string): string {
  return value
    .toLowerCase()
    .replace(IMAGE_EXTENSION_RE, '')
    .replace(/^agent-/, '')
    .replace(/^avatar-/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getTemplateAvatarUrlForNamedAgent(avatar: string | undefined, name: string): string | null {
  const candidates = [
    name,
    avatar?.split('/').pop() || '',
    avatar || '',
  ]
    .map(normalizeLookupToken)
    .filter(Boolean);

  for (const candidate of candidates) {
    for (const [key, slug] of Object.entries(STARBOX_AGENT_AVATAR_MAP)) {
      if (candidate === key || candidate.startsWith(`${key}-`) || candidate.includes(`-${key}-`)) {
        return `/static/avatars/${slug}.png`;
      }
    }
  }

  return null;
}

function resolveLegacyAvatarPath(avatar: string): string {
  if (avatar.startsWith('/avatars/')) {
    const slug = stripImageExtension(avatar.split('/').pop() || '').toLowerCase();
    return slug ? toSpriteAvatarUrl(slug) : avatar;
  }

  if (avatar.startsWith('/static/avatars/')) {
    const slug = stripImageExtension(avatar.split('/').pop() || '').toLowerCase();
    if (!slug) return avatar;
    if (KNOWN_AVATAR_SLUGS.has(slug)) return `/static/avatars/${slug}.png`;
    return toSpriteAvatarUrl(slug);
  }

  return avatar;
}

export function isEmojiAvatar(avatar: string | undefined): boolean {
  if (!avatar) return false;
  if (avatar.includes('/')) return false;
  return /\p{Extended_Pictographic}/u.test(avatar);
}

/**
 * Resolve an agent's avatar field to a displayable image URL, or null if
 * the value is an emoji / missing.
 */
export function getAvatarImageUrl(avatar: string | undefined, name: string): string | null {
  if (!avatar) return null;
  if (isEmojiAvatar(avatar)) return null;

  const normalizedAvatar = resolveLegacyAvatarPath(avatar);
  const namedAgentTemplateAvatar = getTemplateAvatarUrlForNamedAgent(normalizedAvatar, name);

  if (normalizedAvatar.startsWith('/sprites/') && namedAgentTemplateAvatar) {
    return namedAgentTemplateAvatar;
  }

  if (normalizedAvatar.startsWith('/static/') || normalizedAvatar.startsWith('/sprites/')) {
    return normalizedAvatar;
  }
  if (avatar.startsWith('http')) return avatar;
  if (KNOWN_AVATAR_SLUGS.has(avatar)) return `/static/avatars/${avatar}.png`;
  if (SIMPLE_AVATAR_TOKEN_RE.test(avatar)) {
    const slug = avatar.toLowerCase();
    if (KNOWN_AVATAR_SLUGS.has(slug)) return `/static/avatars/${slug}.png`;
    return toSpriteAvatarUrl(slug);
  }
  if (IMAGE_EXTENSION_RE.test(normalizedAvatar)) return normalizedAvatar;
  return null;
}
