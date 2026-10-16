import { useEffect } from 'react';
import { runAutoWatch } from './public-watch-auto.js';
import { useToast } from './toast.js';

/**
 * After sign-in, checks every disbursed loan against public records (at most once a day) and
 * announces new alerts. Failures are logged; the watch page shows when each loan was last checked.
 */
export function useAutoWatch(actor: string | null): void {
  const toast = useToast();
  useEffect(() => {
    if (actor === null) return;
    let live = true;
    runAutoWatch(actor).then(
      (s) => {
        if (!live || s.newAlerts === 0) return;
        toast.push({
          tone: 'info',
          title: `${s.newAlerts} new public-record alert(s) on disbursed loans`,
          detail: 'See Alerts, or Public-records watch for the timeline.',
        });
      },
      (e: unknown) => {
        console.warn(
          'Automatic public-records check failed:',
          e instanceof Error ? e.message : 'unknown error',
        );
      },
    );
    return () => {
      live = false;
    };
  }, [actor, toast]);
}
