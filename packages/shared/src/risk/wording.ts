/**
 * Leads, never verdicts (CLAUDE.md, B-36): words that may never describe an entity in a pattern, a
 * summary or a reason. Shared so the ingestion agent, the pattern schemas and the scorer use one list.
 */
const BANNED = /\b(fraud\w*|guilty|scam\w*|criminal\w*|verdict|convict\w*|launder\w*|crook\w*)\b/i;

export function violatesWording(text: string): boolean {
  return BANNED.test(text);
}
