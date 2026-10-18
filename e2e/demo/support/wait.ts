import type { Locator } from '@playwright/test';

/** Which of the named elements becomes visible first; 'timeout' when none does in time. */
export async function firstVisible<K extends string>(
  candidates: readonly (readonly [K, Locator])[],
  timeout: number,
): Promise<K | 'timeout'> {
  // Each wait maps its own timeout to a value, so the waits that lose the race cannot reject later.
  return Promise.race(
    candidates.map(([key, locator]) =>
      locator
        .first()
        .waitFor({ state: 'visible', timeout })
        .then(
          () => key,
          () => 'timeout' as const,
        ),
    ),
  );
}

/** The text of the app's error notice inside `scope`, for the log; '' when there is none. */
export async function noticeText(scope: Locator): Promise<string> {
  const notice = scope.locator('.bg-danger-soft').first();
  if ((await notice.count()) === 0) return '';
  return (await notice.innerText()).replace(/\s+/g, ' ').trim();
}
