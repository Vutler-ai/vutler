/**
 * Shared avatar resolution — used by agents list and agent detail layout.
 */

export const PNG_AVATAR_SLUGS = [
  'accounting-assistant', 'appointment-scheduler', 'av-engineer', 'bi-agent',
  'competitor-monitor', 'compliance-monitor', 'contract-manager', 'customer-success',
  'document-processor', 'ecommerce-manager', 'feedback-analyzer', 'hr-assistant',
  'inventory-optimizer', 'invoice-manager', 'knowledge-base', 'lead-gen',
  'marketing-campaign', 'personal-assistant', 'pricing-optimizer', 'procurement',
  'project-coordinator', 'proposal-generator', 'research-analyst', 'social-media-manager',
  'translator', 'workflow-automation',
];

export const KNOWN_AVATAR_SLUGS = new Set(PNG_AVATAR_SLUGS);

const IMAGE_EXTENSION_RE = /\.(png|svg|jpg|jpeg|webp)$/i;
const SIMPLE_AVATAR_TOKEN_RE = /^[a-z0-9_-]+$/i;
const STATIC_AVATAR_PREFIX = '/static/avatars/';

export interface AvatarPersonaOption {
  slug: string;
  label: string;
  category: string;
  prompt: string;
  recommendedAgentTypes: string[];
}

export const AVATAR_PERSONAS: AvatarPersonaOption[] = [
  {
    slug: 'operations-oracle',
    label: 'Operations Oracle',
    category: 'Operations',
    prompt: 'Editorial vector portrait, calm operations lead, teal and midnight palette, structured blazer, subtle clipboard motif, clean geometric face, soft gradients, premium SaaS avatar.',
    recommendedAgentTypes: ['operations', 'support'],
  },
  {
    slug: 'sales-pathfinder',
    label: 'Sales Pathfinder',
    category: 'Sales',
    prompt: 'Editorial vector portrait, confident revenue operator, amber and graphite palette, sharp jacket, optimistic expression, subtle growth motif, clean geometry, premium SaaS avatar.',
    recommendedAgentTypes: ['sales', 'marketing'],
  },
  {
    slug: 'growth-catalyst',
    label: 'Growth Catalyst',
    category: 'Marketing',
    prompt: 'Editorial vector portrait, creative growth strategist, coral and indigo palette, dynamic silhouette, vivid gradients, subtle spark motif, polished brand avatar.',
    recommendedAgentTypes: ['marketing', 'content'],
  },
  {
    slug: 'finance-warden',
    label: 'Finance Warden',
    category: 'Finance',
    prompt: 'Editorial vector portrait, disciplined finance controller, emerald and slate palette, precise styling, analytical expression, subtle ledger motif, premium enterprise avatar.',
    recommendedAgentTypes: ['finance', 'analytics'],
  },
  {
    slug: 'legal-sentinel',
    label: 'Legal Sentinel',
    category: 'Legal',
    prompt: 'Editorial vector portrait, composed legal advisor, plum and steel palette, modern formalwear, subtle shield motif, clean lines, premium compliance avatar.',
    recommendedAgentTypes: ['legal', 'security'],
  },
  {
    slug: 'research-scout',
    label: 'Research Scout',
    category: 'Research',
    prompt: 'Editorial vector portrait, curious research specialist, cobalt and sand palette, thoughtful gaze, subtle document motif, refined gradients, premium analyst avatar.',
    recommendedAgentTypes: ['analytics', 'technical', 'data'],
  },
  {
    slug: 'support-anchor',
    label: 'Support Anchor',
    category: 'Support',
    prompt: 'Editorial vector portrait, empathetic customer support lead, azure and ink palette, headset accent, friendly expression, crisp shapes, premium service avatar.',
    recommendedAgentTypes: ['support', 'operations'],
  },
  {
    slug: 'product-captain',
    label: 'Product Captain',
    category: 'Product',
    prompt: 'Editorial vector portrait, product manager, navy and mint palette, focused posture, subtle roadmap motif, soft gradients, modern strategic avatar.',
    recommendedAgentTypes: ['operations', 'design', 'analytics'],
  },
  {
    slug: 'ux-crafter',
    label: 'UX Crafter',
    category: 'Design',
    prompt: 'Editorial vector portrait, senior UX designer, lavender and charcoal palette, stylish silhouette, subtle cursor motif, expressive but minimal, premium design avatar.',
    recommendedAgentTypes: ['design', 'content'],
  },
  {
    slug: 'devops-guardian',
    label: 'DevOps Guardian',
    category: 'DevOps',
    prompt: 'Editorial vector portrait, platform engineer, graphite and neon blue palette, technical jacket, subtle server motif, confident expression, modern infrastructure avatar.',
    recommendedAgentTypes: ['devops', 'technical', 'qa'],
  },
  {
    slug: 'data-weaver',
    label: 'Data Weaver',
    category: 'Data',
    prompt: 'Editorial vector portrait, data engineer, deep teal and lilac palette, precise features, subtle node motif, polished analytical avatar.',
    recommendedAgentTypes: ['data', 'analytics', 'technical'],
  },
  {
    slug: 'automation-pilot',
    label: 'Automation Pilot',
    category: 'Automation',
    prompt: 'Editorial vector portrait, automation specialist, electric blue and graphite palette, sleek silhouette, subtle orbit motif, clean system-thinking avatar.',
    recommendedAgentTypes: ['integration', 'operations', 'devops'],
  },
  {
    slug: 'community-spark',
    label: 'Community Spark',
    category: 'Community',
    prompt: 'Editorial vector portrait, community manager, rose and indigo palette, warm expression, subtle chat motif, lively but polished SaaS avatar.',
    recommendedAgentTypes: ['marketing', 'support', 'content'],
  },
  {
    slug: 'content-forge',
    label: 'Content Forge',
    category: 'Content',
    prompt: 'Editorial vector portrait, editorial content strategist, copper and midnight palette, clean profile, subtle pen motif, premium publishing avatar.',
    recommendedAgentTypes: ['content', 'marketing'],
  },
  {
    slug: 'talent-scout',
    label: 'Talent Scout',
    category: 'HR',
    prompt: 'Editorial vector portrait, recruiter, sky and forest palette, approachable expression, subtle people motif, polished HR avatar.',
    recommendedAgentTypes: ['operations', 'support'],
  },
  {
    slug: 'procurement-pilot',
    label: 'Procurement Pilot',
    category: 'Procurement',
    prompt: 'Editorial vector portrait, procurement manager, bronze and navy palette, composed stance, subtle logistics motif, enterprise operations avatar.',
    recommendedAgentTypes: ['operations', 'finance'],
  },
  {
    slug: 'privacy-watch',
    label: 'Privacy Watch',
    category: 'Privacy',
    prompt: 'Editorial vector portrait, privacy analyst, indigo and silver palette, discreet shield motif, calm expression, premium governance avatar.',
    recommendedAgentTypes: ['legal', 'security'],
  },
  {
    slug: 'knowledge-keeper',
    label: 'Knowledge Keeper',
    category: 'Knowledge',
    prompt: 'Editorial vector portrait, knowledge manager, saffron and midnight palette, subtle library motif, calm features, premium documentation avatar.',
    recommendedAgentTypes: ['content', 'operations', 'analytics'],
  },
  {
    slug: 'calendar-conductor',
    label: 'Calendar Conductor',
    category: 'Scheduling',
    prompt: 'Editorial vector portrait, scheduling coordinator, cyan and plum palette, energetic but tidy silhouette, subtle time motif, premium assistant avatar.',
    recommendedAgentTypes: ['operations', 'support', 'sales'],
  },
  {
    slug: 'brand-alchemist',
    label: 'Brand Alchemist',
    category: 'Brand',
    prompt: 'Editorial vector portrait, brand strategist, magenta and charcoal palette, elegant posture, subtle prism motif, premium creative avatar.',
    recommendedAgentTypes: ['marketing', 'design', 'content'],
  },
];

export const SVG_AVATAR_SLUGS = new Set(AVATAR_PERSONAS.map((persona) => persona.slug));
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
const AGENT_TYPE_PERSONA_MAP: Record<string, string> = {
  sales: 'sales-pathfinder',
  marketing: 'growth-catalyst',
  operations: 'operations-oracle',
  technical: 'research-scout',
  support: 'support-anchor',
  analytics: 'data-weaver',
  finance: 'finance-warden',
  content: 'content-forge',
  security: 'privacy-watch',
  devops: 'devops-guardian',
  legal: 'legal-sentinel',
  data: 'data-weaver',
  qa: 'automation-pilot',
  networking: 'devops-guardian',
  iot: 'automation-pilot',
  design: 'ux-crafter',
  'real-estate': 'calendar-conductor',
  healthcare: 'calendar-conductor',
  integration: 'automation-pilot',
};

function stripImageExtension(value: string): string {
  return value.replace(IMAGE_EXTENSION_RE, '');
}

function toSpriteAvatarUrl(slug: string): string {
  return `/sprites/agent-${slug}.png`;
}

function normalizeSlug(value: string): string {
  return stripImageExtension(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getStaticAvatarUrl(avatar: string | undefined): string | null {
  if (!avatar) return null;
  if (avatar.startsWith('/static/') || avatar.startsWith('/sprites/') || avatar.startsWith('http')) {
    return avatar;
  }

  const slug = normalizeSlug(avatar);
  if (!slug) return null;
  if (SVG_AVATAR_SLUGS.has(slug)) return `${STATIC_AVATAR_PREFIX}${slug}.svg`;
  if (KNOWN_AVATAR_SLUGS.has(slug)) return `${STATIC_AVATAR_PREFIX}${slug}.png`;
  return null;
}

export function getPersonaAvatarForAgentTypes(agentTypes: string[]): string {
  for (const agentType of agentTypes) {
    const slug = AGENT_TYPE_PERSONA_MAP[agentType];
    if (slug) return `${STATIC_AVATAR_PREFIX}${slug}.svg`;
  }
  return `${STATIC_AVATAR_PREFIX}${AVATAR_PERSONAS[0].slug}.svg`;
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
        return getStaticAvatarUrl(slug);
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
    const staticAvatar = getStaticAvatarUrl(avatar);
    if (staticAvatar) return staticAvatar;
    const slug = stripImageExtension(avatar.split('/').pop() || '').toLowerCase();
    return slug ? toSpriteAvatarUrl(slug) : avatar;
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
  const staticAvatar = getStaticAvatarUrl(avatar);
  if (staticAvatar) return staticAvatar;
  if (SIMPLE_AVATAR_TOKEN_RE.test(avatar)) {
    const slug = avatar.toLowerCase();
    if (SVG_AVATAR_SLUGS.has(slug) || KNOWN_AVATAR_SLUGS.has(slug)) {
      return getStaticAvatarUrl(slug);
    }
    return toSpriteAvatarUrl(slug);
  }
  if (IMAGE_EXTENSION_RE.test(normalizedAvatar)) return normalizedAvatar;
  return null;
}
