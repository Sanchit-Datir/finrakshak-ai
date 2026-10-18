import { test, type Locator, type Page } from '@playwright/test';
import { PACE_FACTOR, type DemoConfig } from './config.js';
import { installOverlay, type CaptionText, type Rect, type TitleCardText } from './overlay.js';

/**
 * Drives the app the way a presenter would: every action is announced in a caption, the cursor
 * glides to the target, the target is ringed for a moment, then clicked or typed into. Pauses
 * scale with DEMO_PACE so one script serves both a narrated video and a quick dry run.
 */
export interface Director {
  readonly page: Page;
  readonly config: DemoConfig;
  /** One numbered step: caption, a log line for the launcher, and a Playwright step. */
  scene: (title: string, text: string, body: () => Promise<void>) => Promise<void>;
  /** New caption text within the current step. */
  say: (text: string) => Promise<void>;
  titleCard: (card: TitleCardText, seconds: number) => Promise<void>;
  /** Full page load; the caption is put back afterwards. */
  goto: (path: string) => Promise<void>;
  click: (target: Locator) => Promise<void>;
  type: (target: Locator, text: string) => Promise<void>;
  /** For inputs that do not take keystrokes well (dates). */
  set: (target: Locator, value: string) => Promise<void>;
  select: (target: Locator, label: string) => Promise<void>;
  check: (target: Locator) => Promise<void>;
  /** Scrolls to the target and rings it, without clicking. */
  point: (target: Locator, ms?: number) => Promise<void>;
  pause: (ms: number) => Promise<void>;
  dismissToasts: () => Promise<void>;
  /** Closing card, then holds the last screen for DEMO_HOLD_SECONDS. */
  finish: (card: TitleCardText) => Promise<void>;
}

export interface ScenarioMeta {
  /** Shown in captions and log lines, e.g. "Scenario 2". */
  readonly label: string;
  readonly scenes: number;
}

/** Space kept clear at the top (fixed top bar) and bottom (caption) when scrolling to a target. */
const TOP_CLEARANCE = 80;
const BOTTOM_CLEARANCE = 150;

function log(line: string): void {
  process.stdout.write(`${line}\n`);
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

export async function createDirector(
  page: Page,
  config: DemoConfig,
  meta: ScenarioMeta,
): Promise<Director> {
  const factor = PACE_FACTOR[config.DEMO_PACE];
  const token = config.DEMO_APPCHECK_DEBUG_TOKEN;
  // Firebase App Check reads this global before it asks reCAPTCHA (debug tokens are registered
  // in the Firebase console). Only set when given.
  if (token !== '')
    await page.addInitScript(
      (t) => Object.assign(globalThis, { FIREBASE_APPCHECK_DEBUG_TOKEN: t }),
      token,
    );
  await page.addInitScript(installOverlay);

  const size =
    page.viewportSize() ??
    (await page.evaluate(() => ({ width: innerWidth, height: innerHeight })));
  let mouse = { x: size.width / 2, y: size.height / 2 };
  let sceneNo = 0;
  let caption: CaptionText | null = null;

  const pause = (ms: number): Promise<void> => page.waitForTimeout(Math.round(ms * factor));

  const showCaption = async (c: CaptionText | null): Promise<void> => {
    if (!config.DEMO_CAPTIONS) return;
    await page.evaluate((x) => window.__demoOverlay?.caption(x), c);
  };
  const showRing = (r: Rect | null): Promise<void> =>
    page.evaluate((x) => window.__demoOverlay?.ring(x), r);

  const glide = async (to: { x: number; y: number }): Promise<void> => {
    const steps = Math.max(8, Math.round(26 * factor));
    const from = mouse;
    for (let i = 1; i <= steps; i++) {
      const t = easeInOut(i / steps);
      await page.mouse.move(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
      await page.waitForTimeout(14);
    }
    mouse = to;
  };

  /** Waits until the target stops moving (smooth scrolling, opening drawers). */
  const settle = async (target: Locator): Promise<Rect> => {
    let last = '';
    for (let i = 0; i < 30; i++) {
      const box = await target.boundingBox();
      const key = JSON.stringify(box);
      if (box !== null && key === last) return box;
      last = key;
      await page.waitForTimeout(90);
    }
    const box = await target.boundingBox();
    if (box === null) throw new Error('The element to point at is no longer on screen');
    return box;
  };

  const reveal = async (target: Locator): Promise<Rect> => {
    await target.waitFor({ state: 'visible' });
    await target.evaluate(
      (el, clear) => {
        const r = el.getBoundingClientRect();
        if (r.top >= clear.top && r.bottom <= innerHeight - clear.bottom) return;
        const tall = r.height > innerHeight - clear.top - clear.bottom;
        if (el instanceof HTMLElement) el.style.scrollMarginTop = `${clear.top}px`;
        el.scrollIntoView({ behavior: 'smooth', block: tall ? 'start' : 'center' });
      },
      { top: TOP_CLEARANCE, bottom: BOTTOM_CLEARANCE },
    );
    return settle(target);
  };

  const aim = async (target: Locator): Promise<Rect> => {
    const box = await reveal(target);
    await glide({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
    await showRing(box);
    await pause(500);
    return box;
  };

  const act = async (target: Locator, action: () => Promise<void>): Promise<void> => {
    await aim(target);
    await action();
    await showRing(null);
    await pause(350);
  };

  const director: Director = {
    page,
    config,
    pause,
    scene: async (title, text, body) => {
      sceneNo += 1;
      caption = { kicker: `${meta.label} · Step ${sceneNo} of ${meta.scenes}`, title, text };
      log(`▶ ${meta.label} · step ${sceneNo}/${meta.scenes}: ${title}`);
      await showCaption(caption);
      await test.step(title, body);
    },
    say: async (text) => {
      if (caption === null) return;
      caption = { ...caption, text };
      log(`  · ${text}`);
      await showCaption(caption);
      await pause(400);
    },
    titleCard: async (card, seconds) => {
      log(`■ ${card.kicker}: ${card.title}`);
      if (!config.DEMO_CAPTIONS) return;
      await page.evaluate((x) => window.__demoOverlay?.card(x), card);
      await pause(seconds * 1000);
      await page.evaluate(() => window.__demoOverlay?.card(null));
    },
    goto: async (path) => {
      await page.goto(path);
      await showCaption(caption);
    },
    click: (target) => act(target, () => target.click()),
    type: (target, text) =>
      act(target, async () => {
        await target.click();
        await target.fill('');
        await target.pressSequentially(text, { delay: Math.round(38 * factor) });
      }),
    set: (target, value) => act(target, () => target.fill(value)),
    select: (target, label) =>
      act(target, async () => {
        await target.selectOption({ label });
      }),
    check: (target) => act(target, () => target.check()),
    point: async (target, ms = 1800) => {
      await aim(target);
      await pause(ms);
      await showRing(null);
    },
    dismissToasts: async () => {
      const close = page.getByRole('button', { name: 'Dismiss notification' });
      while ((await close.count()) > 0) await close.first().click();
    },
    finish: async (card) => {
      await showCaption(null);
      log(`■ ${card.kicker}: ${card.title}`);
      if (config.DEMO_CAPTIONS) await page.evaluate((x) => window.__demoOverlay?.card(x), card);
      log(`  Holding the last screen for ${config.DEMO_HOLD_SECONDS}s.`);
      await page.waitForTimeout(config.DEMO_HOLD_SECONDS * 1000);
    },
  };
  return director;
}
