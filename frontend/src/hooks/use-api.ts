import useSWR, { type SWRConfiguration, type KeyedMutator } from 'swr';
import { apiFetch } from '@/lib/api/client';

export interface UseApiResult<T> {
  data: T | undefined;
  error: Error | undefined;
  isLoading: boolean;
  mutate: KeyedMutator<T>;
}

/**
 * SWR wrapper for typed API calls.
 *
 * @param key   SWR cache key (usually the endpoint path). Pass `null` to skip fetching.
 * @param fetcher Optional custom fetcher. Defaults to `apiFetch<T>(key)`.
 * @param config  Optional SWR config overrides.
 *
 * @example
 * const { data: agents, isLoading } = useApi<Agent[]>('/api/v1/agents');
 *
 * @example
 * const { data, mutate } = useApi<Task[]>('/api/v1/tasks', () =>
 *   getTasks()
 * );
 */
export function useApi<T>(
  key: string | null,
  fetcher?: () => Promise<T>,
  config?: SWRConfiguration<T>
): UseApiResult<T> {
  const defaultFetcher = (k: string) => apiFetch<T>(k);

  const { data, error, isLoading, mutate } = useSWR<T>(
    key,
    fetcher ? () => fetcher() : defaultFetcher,
    config
  );

  return {
    data,
    error: error as Error | undefined,
    isLoading,
    mutate,
  };
}
