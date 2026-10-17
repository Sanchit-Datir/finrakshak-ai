import { useCallback, useEffect, useState } from 'react';
import { explainCloudError } from '../lib/cloud/errors.js';
import {
  fetchRiskScores,
  loadSampleRiskScores,
  type RiskScores,
} from '../lib/cloud/risk-scores.js';
import { useCloudAuth } from './cloud-auth.js';

export type RiskScoresState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly data: RiskScores };

/** One load per source and session; Retry clears it. */
const cache = new Map<string, Promise<RiskScores>>();

/**
 * Synthetic risk scores: from the getRiskScores function for a signed-in person with a profile, else
 * the bundled sample (a demo session never reaches the cloud).
 */
export function useRiskScores(): RiskScoresState & { retry: () => void } {
  const auth = useCloudAuth();
  const cloud = auth.status === 'ready' ? auth.cloud : null;
  const key = cloud === null ? 'sample' : `cloud:${auth.status === 'ready' ? auth.uid : ''}`;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; value: RiskScoresState }>({
    key: '',
    value: { status: 'loading' },
  });

  useEffect(() => {
    let live = true;
    let load = cache.get(key);
    if (load === undefined) {
      load = cloud === null ? loadSampleRiskScores() : fetchRiskScores(cloud);
      cache.set(key, load);
    }
    load.then(
      (data) => {
        if (live) setState({ key, value: { status: 'ready', data } });
      },
      (e: unknown) => {
        cache.delete(key);
        if (live) setState({ key, value: { status: 'error', message: explainCloudError(e) } });
      },
    );
    return () => {
      live = false;
    };
  }, [key, cloud, attempt]);

  const retry = useCallback(() => {
    cache.delete(key);
    setState({ key, value: { status: 'loading' } });
    setAttempt((n) => n + 1);
  }, [key]);
  // A result for an older source is never shown for the current one.
  const value: RiskScoresState = state.key === key ? state.value : { status: 'loading' };
  return { ...value, retry };
}
