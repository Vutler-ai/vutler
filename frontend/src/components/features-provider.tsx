'use client';

import { ReactNode } from 'react';
import { FeaturesContext, useFeaturesState } from '@/hooks/useFeatures';

interface FeaturesProviderProps {
  children: ReactNode;
}

export function FeaturesProvider({ children }: FeaturesProviderProps) {
  const value = useFeaturesState();

  return (
    <FeaturesContext.Provider value={value}>
      {children}
    </FeaturesContext.Provider>
  );
}
