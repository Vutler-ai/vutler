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

/**
 * Resolve an agent's avatar field to a displayable image URL, or null if
 * the value is an emoji / missing.
 */
export function getAvatarImageUrl(avatar: string | undefined, _name: string): string | null {
  if (!avatar) return null;
  if (avatar.startsWith('/static/') || avatar.startsWith('/sprites/')) return avatar;
  if (KNOWN_AVATAR_SLUGS.has(avatar)) return `/static/avatars/${avatar}.png`;
  if (/^[a-z0-9-]+$/.test(avatar)) return `/static/avatars/${avatar}.png`;
  if (avatar.startsWith('http')) return avatar;
  if (/\.(png|svg|jpg|jpeg|webp)$/i.test(avatar)) return avatar;
  return null;
}
