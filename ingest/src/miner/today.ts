import { istDate } from '@finrakshak-ai/shared';

/** Today's date in India (B-27), for stamping a review. Kept in one place so tests can avoid the clock. */
export const istToday = (now: Date = new Date()): string => istDate(now);
