import type { WorkspaceFeatureSnapshot } from './session';

export function serializeFeatureSnapshot(snapshot: WorkspaceFeatureSnapshot): string {
  return encodeURIComponent(JSON.stringify(snapshot));
}

export function deserializeFeatureSnapshot(value: string | undefined | null): WorkspaceFeatureSnapshot | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(decodeURIComponent(value));
    if (!parsed || typeof parsed !== 'object') return null;
    const features = Array.isArray(parsed.features)
      ? parsed.features.filter((feature: unknown): feature is string => typeof feature === 'string')
      : [];

    return {
      plan: typeof parsed.plan === 'string' ? parsed.plan : 'free',
      features,
      snipara: Array.isArray(parsed.snipara)
        ? parsed.snipara.filter((capability: unknown): capability is string => typeof capability === 'string')
        : [],
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : undefined,
    };
  } catch {
    return null;
  }
}

export function snapshotHasFeature(snapshot: WorkspaceFeatureSnapshot | null, feature: string): boolean {
  if (!snapshot) return false;
  return snapshot.features.includes('*') || snapshot.features.includes(feature);
}
