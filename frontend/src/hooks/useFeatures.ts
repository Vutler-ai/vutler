'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getAuthToken } from '@/lib/api';

// ========== Types ==========

interface FeaturesResponse {
  plan: 'office' | 'agents' | 'full';
  features: string[];
  snipara: string[];
}

interface FeaturesContextType {
  plan: 'office' | 'agents' | 'full';
  features: string[];
  snipara: string[];
  loading: boolean;
  hasFeature: (feature: string) => boolean;
  hasOffice: boolean;
  hasAgents: boolean;
}

// ========== Defaults ==========

const DEFAULT_FEATURES: FeaturesContextType = {
  plan: 'full',
  features: [],
  snipara: [],
  loading: true,
  hasFeature: () => true,
  hasOffice: true,
  hasAgents: true,
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
  const [plan, setPlan] = useState<'office' | 'agents' | 'full'>('full');
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
      })
      .catch(() => {
        if (cancelled) return;
        // Graceful degradation: default to full plan on API failure
        setPlan('full');
        setFeatures([]);
        setSnipara([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const hasFeature = (feature: string): boolean => {
    if (plan === 'full') return true;
    return features.includes(feature);
  };

  const hasOffice = plan === 'office' || plan === 'full';
  const hasAgents = plan === 'agents' || plan === 'full';

  return { plan, features, snipara, loading, hasFeature, hasOffice, hasAgents };
}
