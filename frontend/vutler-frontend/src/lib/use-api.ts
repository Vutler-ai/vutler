"use client";

import { useState, useEffect, useCallback } from "react";

interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useApi<T>(fetcher: () => Promise<T>): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetcher()
      .then((result) => { setData(result); setLoading(false); })
      .catch((err) => { setError(err.message || "Failed to load data"); setLoading(false); });
  }, [fetcher]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, refetch: load };
}
