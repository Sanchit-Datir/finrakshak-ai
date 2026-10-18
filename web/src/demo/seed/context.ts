/** The dataset's moment and the staff names every seed section uses. */

import { DAY, DEMO_USERS, HOUR } from './constants.js';

export interface SeedContext {
  /** An ISO time `days` before the dataset's moment, at about `hour` o'clock IST. */
  readonly ago: (days: number, hour?: number) => string;
  /** `iso` plus `hours`. */
  readonly plus: (iso: string, hours: number) => string;
  readonly officer: string;
  readonly manager: string;
  readonly analyst: string;
  readonly investigator: string;
}

export function seedContext(now: Date): SeedContext {
  const t0 = now.getTime();
  const ago = (days: number, hour = 11): string => {
    const d = new Date(t0 - days * DAY);
    d.setUTCHours(hour - 5, 30, 0, 0); // ≈ local IST hour
    return d.toISOString();
  };
  const plus = (iso: string, hours: number): string =>
    new Date(new Date(iso).getTime() + hours * HOUR).toISOString();

  const officer = DEMO_USERS.branch_officer.name;
  const manager = DEMO_USERS.branch_manager.name;
  const analyst = DEMO_USERS.risk_analyst.name;
  const investigator = DEMO_USERS.investigator.name;
  return { ago, plus, officer, manager, analyst, investigator };
}
