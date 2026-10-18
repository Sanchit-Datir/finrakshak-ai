/**
 * Leads, never verdicts (CLAUDE.md, B-36): words the agent may never use about an entity. A
 * summary or reason containing one is rejected and replaced by the templated text. The list lives in
 * packages/shared so the pattern schemas use the same one.
 */
export { violatesWording } from '@finrakshak-ai/shared';
