import { useCallback, useEffect, useRef, useState } from "react";

export interface IncrementalLoadOptions {
  /** Background poll interval; polls always use silent refresh. */
  pollMs?: number;
  /** When false, skip automatic initial fetch. */
  enabled?: boolean;
}

/**
 * Fetch pattern: full loading UI only on first load; later refreshes update
 * state in place without unmounting children.
 */
export function useIncrementalLoad<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
  options?: IncrementalLoadOptions
) {
  const [data, setData] = useState<T | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasDataRef = useRef(false);

  const reload = useCallback(
    async (silent = false) => {
      const isFirstLoad = !hasDataRef.current;
      if (!silent && isFirstLoad) {
        setInitialLoading(true);
      } else if (silent && hasDataRef.current) {
        setRefreshing(true);
      }

      try {
        const result = await fetcher();
        setData(result);
        setError(null);
        hasDataRef.current = true;
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Load failed";
        if (!hasDataRef.current) {
          setError(message);
        }
        throw err;
      } finally {
        setInitialLoading(false);
        setRefreshing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller supplies deps
    deps
  );

  const enabled = options?.enabled ?? true;

  useEffect(() => {
    if (!enabled) return;
    void reload(false);
  }, [reload, enabled]);

  useEffect(() => {
    if (!enabled || !options?.pollMs) return;
    const id = setInterval(() => {
      void reload(true);
    }, options.pollMs);
    return () => clearInterval(id);
  }, [reload, enabled, options?.pollMs]);

  return {
    data,
    setData,
    initialLoading,
    refreshing,
    error,
    reload,
    hasData: hasDataRef.current,
  };
}
