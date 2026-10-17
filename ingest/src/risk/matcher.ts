import type { PatternMatcher } from '@fund-tracker/shared';

/**
 * The matcher the local run injects until the miner side builds `matchPattern` (step 7). It matches
 * nothing, so public-record patterns score 0; transaction typologies still match through the fired
 * monitoring rules, which the scorer maps itself (PATTERN_CONTRACT.md, section 6).
 */
export const noMatcher: PatternMatcher = () => null;
