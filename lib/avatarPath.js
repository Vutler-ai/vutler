const KNOWN_AVATAR_SLUGS = new Set([
  'accounting-assistant',
  'appointment-scheduler',
  'av-engineer',
  'bi-agent',
  'competitor-monitor',
  'compliance-monitor',
  'contract-manager',
  'customer-success',
  'document-processor',
  'ecommerce-manager',
  'feedback-analyzer',
  'hr-assistant',
  'inventory-optimizer',
  'invoice-manager',
  'knowledge-base',
  'lead-gen',
  'marketing-campaign',
  'personal-assistant',
  'pricing-optimizer',
  'procurement',
  'project-coordinator',
  'proposal-generator',
  'research-analyst',
  'social-media-manager',
  'translator',
  'workflow-automation',
]);

const IMAGE_EXTENSION_RE = /\.(png|svg|jpg|jpeg|webp)$/i;
const SIMPLE_TOKEN_RE = /^[a-z0-9_-]+$/i;

function stripImageExtension(value) {
  return String(value || '').replace(IMAGE_EXTENSION_RE, '');
}

function slugifyAvatarName(value) {
  return stripImageExtension(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildSpriteAvatar(username) {
  const slug = slugifyAvatarName(username);
  return slug ? `/sprites/agent-${slug}.png` : null;
}

function normalizeStoredAvatar(avatar, options = {}) {
  const value = typeof avatar === 'string' ? avatar.trim() : '';
  const fallbackAvatar = buildSpriteAvatar(options.username);

  if (!value) return fallbackAvatar;
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  if (value.startsWith('/sprites/')) return value;

  if (value.startsWith('/avatars/')) {
    const slug = slugifyAvatarName(value.split('/').pop());
    return slug ? buildSpriteAvatar(slug) : fallbackAvatar;
  }

  if (value.startsWith('/static/avatars/')) {
    const slug = slugifyAvatarName(value.split('/').pop());
    if (!slug) return fallbackAvatar;
    if (KNOWN_AVATAR_SLUGS.has(slug)) return `/static/avatars/${slug}.png`;
    return buildSpriteAvatar(slug);
  }

  if (SIMPLE_TOKEN_RE.test(value)) {
    const slug = slugifyAvatarName(value);
    if (KNOWN_AVATAR_SLUGS.has(slug)) return `/static/avatars/${slug}.png`;
    return buildSpriteAvatar(slug);
  }

  if (IMAGE_EXTENSION_RE.test(value)) {
    const slug = slugifyAvatarName(value.split('/').pop());
    return slug ? buildSpriteAvatar(slug) : fallbackAvatar;
  }

  return value;
}

module.exports = {
  buildSpriteAvatar,
  normalizeStoredAvatar,
};
