'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { getAuthToken } from '@/lib/api';
import { serializeFeatureSnapshot } from '@/lib/auth/feature-snapshot';
import { WORKSPACE_FEATURES_COOKIE } from '@/lib/auth/session';

// ========== Types ==========

interface FeaturesResponse {
  plan: string;
  features: string[];
  snipara: string[];
}

interface FeaturesContextType {
  plan: string;
  features: string[];
  snipara: string[];
  loading: boolean;
  hasFeature: (feature: string) => boolean;
  hasOffice: boolean;
  hasAgents: boolean;
}

// ========== Defaults ==========

const DEFAULT_FEATURES: FeaturesContextType = {
  plan: 'free',
  features: [],
  snipara: [],
  loading: true,
  hasFeature: () => false,
  hasOffice: false,
  hasAgents: false,
};

// ========== Context ==========

export const FeaturesContext = createContext<FeaturesContextType>(DEFAULT_FEATURES);

// ========== Hook ==========

export function useFeatures(): FeaturesContextType {
  const context = useContext(FeaturesContext);
  if (!context) {
    throw new Error('useFeatures must be used within a FeaturesProvider');
  }
  return context;
}

// ========== Internal fetch ==========

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

function writeFeatureSnapshot(plan: string, features: string[], snipara: string[]): void {
  if (typeof document === 'undefined') return;

  const snapshot = serializeFeatureSnapshot({
    plan,
    features,
    snipara,
    updatedAt: new Date().toISOString(),
  });

  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${WORKSPACE_FEATURES_COOKIE}=${snapshot}; Path=/; Max-Age=${60 * 60 * 8}; SameSite=Lax${secure}`;
}

async function fetchWorkspaceFeatures(): Promise<FeaturesResponse> {
  const token = getAuthToken();

  const response = await fetch(`${API_BASE_URL}/api/v1/workspace/features`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch features: ${response.status}`);
  }

  return response.json();
}

// ========== Provider state hook ==========

export function useFeaturesState(): FeaturesContextType {
  const [plan, setPlan] = useState<string>('free');
  const [features, setFeatures] = useState<string[]>([]);
  const [snipara, setSnipara] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetchWorkspaceFeatures()
      .then((data) => {
        if (cancelled) return;
        setPlan(data.plan);
        setFeatures(data.features);
        setSnipara(data.snipara);
        writeFeatureSnapshot(data.plan, data.features, data.snipara);
      })
      .catch(() => {
        if (cancelled) return;
        // SECURITY: default to most restrictive plan on API failure (audit 2026-03-29)
        setPlan('free');
        setFeatures([]);
        setSnipara([]);
        writeFeatureSnapshot('free', [], []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const hasFeature = (feature: string): boolean => {
    return features.includes('*') || features.includes(feature);
  };

  const hasOffice = ['chat', 'drive', 'email', 'tasks', 'calendar'].some(hasFeature);
  const hasAgents = ['agents', 'nexus', 'sandbox', 'builder', 'swarm'].some(hasFeature);

  return { plan, features, snipara, loading, hasFeature, hasOffice, hasAgents };
}
