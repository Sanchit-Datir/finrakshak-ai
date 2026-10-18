import type {
  Citation,
  InvestigationFinding,
  InvestigationQuestion,
  RejectionReason,
} from '@finrakshak-ai/shared';
import { z } from 'zod';
import type { LoopTool } from './loop.js';
import { MalformedArgs } from './loop.js';
import { LIMITS, SECTIONS } from './input.js';
import { getCandidates, getRatio, getRecord, getRelated, getSection } from './reads.js';
import { verifyFinding, verifyQuestion, verifySummary, type BundleIndex } from './verify.js';

/**
 * The investigator's closed tool list over the bundle (docs/AI_INVESTIGATOR.md): five reads and three
 * submissions. Arguments are untrusted model output, parsed with zod; nothing here writes anywhere
 * but the in-memory collector, and only claims that pass verify.ts are kept.
 */

export interface Collector {
  readonly ix: BundleIndex;
  readonly findings: InvestigationFinding[];
  readonly questions: InvestigationQuestion[];
  readonly rejections: Map<RejectionReason, number>;
  made: number;
  /** Null until submit_summary is called. */
  summary: string | null;
  summaryWithheld: boolean;
  notEnoughEvidence: boolean;
}

export function newCollector(ix: BundleIndex): Collector {
  return {
    ix,
    findings: [],
    questions: [],
    rejections: new Map(),
    made: 0,
    summary: null,
    summaryWithheld: false,
    notEnoughEvidence: false,
  };
}

const KINDS = [
  'public_record_match',
  'related_entity_link',
  'implausible_numbers',
  'section_mismatch',
] as const;
const PRIORITIES = ['routine', 'needs_attention', 'urgent'] as const;
const CITATION_TYPES = ['field', 'ratio', 'record', 'entity'] as const;

const CitationArg = z.object({
  type: z.enum(CITATION_TYPES),
  ref: z.string().min(1).max(80),
  quote: z.string().max(400).optional(),
});
const FindingArgs = z.object({
  kind: z.enum(KINDS),
  priority: z.enum(PRIORITIES),
  statement: z.string().trim().min(1).max(2_000),
  partyId: z.string().max(80).optional(),
  citations: z.array(CitationArg).max(LIMITS.maxCitations),
});
const QuestionArgs = z.object({
  question: z.string().trim().min(1).max(2_000),
  gap: z.string().min(1).max(80),
  citations: z.array(CitationArg).max(LIMITS.maxCitations).optional(),
});
const SummaryArgs = z.object({
  summary: z.string().trim().max(4_000),
  notEnoughEvidence: z.boolean().optional(),
});

function parse<T>(schema: z.ZodType<T>, args: unknown): T {
  const r = schema.safeParse(args);
  if (!r.success) throw new MalformedArgs(r.error.issues[0]?.message ?? 'invalid arguments');
  return r.data;
}

function toCitation(c: z.infer<typeof CitationArg>): Citation {
  switch (c.type) {
    case 'field':
      return { type: 'field', path: c.ref, quote: c.quote?.trim() ?? null };
    case 'ratio':
      return { type: 'ratio', name: c.ref };
    case 'record':
      return { type: 'record', id: c.ref };
    case 'entity':
      return { type: 'entity', id: c.ref };
  }
}

const str = (description: string): Record<string, unknown> => ({ type: 'string', description });
const obj = (
  properties: Record<string, unknown>,
  required: readonly string[],
): Record<string, unknown> => ({ type: 'object', properties, required });
const CITATIONS = {
  type: 'array',
  maxItems: LIMITS.maxCitations,
  items: obj(
    {
      type: { type: 'string', enum: CITATION_TYPES },
      ref: str('Field path, ratio name, candidate/record id or entity id exactly as given'),
      quote: str('Fields only: the exact value text you rely on'),
    },
    ['type', 'ref'],
  ),
};

function reject(c: Collector, reason: RejectionReason): Record<string, unknown> {
  c.rejections.set(reason, (c.rejections.get(reason) ?? 0) + 1);
  return { rejected: reason };
}

/** A claim with arguments that do not parse is counted as rejected, then reported as malformed. */
function claimed<T>(c: Collector, schema: z.ZodType<T>, args: unknown): T {
  c.made++;
  try {
    return parse(schema, args);
  } catch (e) {
    reject(c, 'invalid');
    throw e;
  }
}

function submitFinding(c: Collector, args: unknown): Record<string, unknown> {
  const a = claimed(c, FindingArgs, args);
  if (c.findings.length >= LIMITS.outputFindings) return reject(c, 'over_limit');
  if (a.citations.length === 0) return reject(c, 'missing_evidence');
  const claim = {
    kind: a.kind,
    priority: a.priority,
    statement: a.statement,
    partyId: a.partyId ?? null,
    citations: a.citations.map(toCitation),
  };
  const v = verifyFinding(c.ix, claim, `ai:${String(c.findings.length + 1)}`);
  if (!v.ok) return reject(c, v.reason);
  c.findings.push(v.value);
  return { accepted: v.value.id, priority: v.value.priority, match: v.value.match };
}

function submitQuestion(c: Collector, args: unknown): Record<string, unknown> {
  const a = claimed(c, QuestionArgs, args);
  if (c.questions.length >= LIMITS.maxQuestions) return reject(c, 'over_limit');
  const claim = {
    question: a.question,
    gap: a.gap,
    citations: (a.citations ?? []).map(toCitation),
  };
  const v = verifyQuestion(c.ix, claim, `q:${String(c.questions.length + 1)}`);
  if (!v.ok) return reject(c, v.reason);
  c.questions.push(v.value);
  return { accepted: v.value.id };
}

function submitSummary(c: Collector, args: unknown): Record<string, unknown> {
  const a = parse(SummaryArgs, args);
  const problem = a.summary === '' ? null : verifySummary(c.ix, a.summary);
  c.summary = problem === null ? a.summary : '';
  c.summaryWithheld = problem !== null;
  c.notEnoughEvidence = a.notEnoughEvidence === true;
  return problem === null ? { accepted: 'summary' } : { rejected: problem };
}

const PARTY = { partyId: str('Party id as listed: applicant, business or customer:<n>') };

/** The closed tool list, bound to one run's collector. */
export function investigatorTools(c: Collector): LoopTool[] {
  const read = (
    name: string,
    description: string,
    parameters: Record<string, unknown>,
    run: (ix: BundleIndex, args: unknown) => Record<string, unknown>,
  ): LoopTool => ({
    spec: { name, description, parameters },
    read: true,
    run: (a) => run(c.ix, a),
  });
  const submit = (
    name: string,
    description: string,
    parameters: Record<string, unknown>,
    run: (c: Collector, args: unknown) => Record<string, unknown>,
  ): LoopTool => ({ spec: { name, description, parameters }, read: false, run: (a) => run(c, a) });
  return [
    read(
      'get_section',
      'Typed-in fields of one section (identifiers masked). An empty value means not given.',
      obj({ section: { type: 'string', enum: SECTIONS } }, ['section']),
      getSection,
    ),
    read(
      'get_ratio',
      'One ratio computed by code, with how it was computed.',
      obj({ name: str('Ratio name') }, ['name']),
      getRatio,
    ),
    read(
      'get_public_record_candidates',
      'Public-records companies code shortlisted for a party by name similarity, with whether the CIN and address agree.',
      obj(PARTY, ['partyId']),
      getCandidates,
    ),
    read(
      'get_record',
      'A shortlisted candidate with its records, or one record.',
      obj({ id: str('Candidate or record id') }, ['id']),
      getRecord,
    ),
    read(
      'get_related_entities',
      'Directors, shared addresses and similar links of a party, with any known concern.',
      obj(PARTY, ['partyId']),
      getRelated,
    ),
    submit(
      'submit_finding',
      'Propose one finding. Every fact must be cited; quote field values exactly; write only numbers that appear in the cited evidence.',
      obj(
        {
          kind: { type: 'string', enum: KINDS },
          priority: { type: 'string', enum: PRIORITIES },
          statement: str('One or two plain sentences; a lead to check, never a verdict'),
          ...PARTY,
          citations: CITATIONS,
        },
        ['kind', 'priority', 'statement', 'citations'],
      ),
      submitFinding,
    ),
    submit(
      'submit_question',
      'Draft one request-for-information question for a gap; an officer approves or edits it.',
      obj(
        {
          question: str('The question to the applicant'),
          gap: str('Field path or section name it is about'),
          citations: CITATIONS,
        },
        ['question', 'gap'],
      ),
      submitQuestion,
    ),
    submit(
      'submit_summary',
      'Finish: up to 4 plain sentences. Set notEnoughEvidence when the data does not support any finding.',
      obj({ summary: str('Short summary'), notEnoughEvidence: { type: 'boolean' } }, ['summary']),
      submitSummary,
    ),
  ];
}
