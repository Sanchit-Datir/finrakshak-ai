import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

/**
 * A string state stored in the URL query, so filters survive Back navigation
 * and can be linked (spec §4: preserve filters).
 */
export function useUrlState(key: string, fallback: string): [string, (v: string) => void] {
  const [params, setParams] = useSearchParams();
  const value = params.get(key) ?? fallback;
  const set = useCallback(
    (v: string) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (v === fallback || v === '') next.delete(key);
          else next.set(key, v);
          return next;
        },
        { replace: true },
      );
    },
    [key, fallback, setParams],
  );
  return [value, set];
}
