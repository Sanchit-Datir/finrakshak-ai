/**
 * Leads, never verdicts (CLAUDE.md, B-36): words the agent may never use about an entity. A
 * summary or reason containing one is rejected and replaced by the templated text.
 */
const BANNED = /\b(fraud\w*|guilty|scam\w*|criminal\w*|verdict|convict\w*|launder\w*|crook\w*)\b/i;

export function violatesWording(text: string): boolean {
  return BANNED.test(text);
}
