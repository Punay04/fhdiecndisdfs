import { useEffect, useRef, useState } from "react";

export interface ApiState<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
}

/**
 * Fetch whenever `key` changes, aborting the previous request. Previous data is kept while a
 * refetch is in flight so charts can dim instead of flashing a skeleton.
 */
export function useApi<T>(key: string, fetcher: (signal: AbortSignal) => Promise<T>): ApiState<T> {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const [state, setState] = useState<ApiState<T>>({ data: undefined, error: undefined, loading: true });

  useEffect(() => {
    const controller = new AbortController();
    setState((prev) => ({ ...prev, error: undefined, loading: true }));
    fetcherRef
      .current(controller.signal)
      .then((data) => setState({ data, error: undefined, loading: false }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState((prev) => ({
          ...prev,
          error: error instanceof Error ? error : new Error(String(error)),
          loading: false,
        }));
      });
    return () => controller.abort();
  }, [key]);

  return state;
}
