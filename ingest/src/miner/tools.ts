import { CaseIdSchema, PatternIdSchema, type TimelineEvent } from '@finrakshak-ai/shared';
import { z } from 'zod';
import type { LoopTool } from '../ai/toolLoop.js';
import type { Candidate, MineResult } from './candidates.js';
import type { SeedCase } from './seedTimelines.js';
import type { PatternWording } from './wording.js';

/**
 * The miner's closed tool list (PATTERN_MINER_PLAN.md, "Cost and safety"): two read-only lookups and three
 * actions. Nothing here fetches a URL, writes data or approves anything (B-49, B-61). A proposal names a
 * candidate by id and adds words only; the definition and every number stay the code's.
 */

export interface MinerContext {
  readonly result: MineResult;
  readonly seeds: ReadonlyMap<string, SeedCase>;
  /** Titles of the seed entries by event id: text from government sites, never instructions. */
  readonly titles: ReadonlyMap<string, string>;
}

export type MinerOutcome =
  | { readonly kind: 'data'; readonly response: Record<string, unknown> }
  | {
      readonly kind: 'proposal';
      readonly pattern_id: string;
      readonly wording: PatternWording;
      readonly response: Record<string, unknown>;
    }
  | {
      readonly kind: 'rejection';
      readonly pattern_id: string;
      readonly reason: string;
      readonly response: Record<string, unknown>;
    }
  | {
      readonly kind: 'summary';
      readonly summary: string;
      readonly response: Record<string, unknown>;
    };

export type MinerTool = LoopTool<MinerContext, MinerOutcome>;

const TITLE_CHARS = 160;
const MAX_EVENTS = 40;
const MAX_EXAMPLES = 3;

/** Runs a synchronous handler so a validation error rejects the promise instead of throwing. */
const settle = (fn: () => MinerOutcome): Promise<MinerOutcome> =>
  new Promise((resolve) => {
    resolve(fn());
  });

/** What the model may see of a candidate: the code's definition and numbers. */
export const candidateView = (c: Candidate): Record<string, unknown> => ({
  pattern_id: c.pattern_id,
  steps: c.definition.steps,
  max_gap_months: c.definition.max_gap_months,
  min_lead_months: c.definition.min_lead_months,
  support_count: c.stats.support_case_ids.length,
  supporting_cases: c.stats.support_case_ids,
  population: c.stats.population,
  gap_months: c.stats.gap_months,
  leave_one_out: c.stats.leave_one_out,
  lead_time: c.stats.lead_time,
  evidence_statuses: c.evidence_statuses,
});

const eventView = (e: TimelineEvent): Record<string, unknown> => ({
  date: e.date,
  case_type: e.case_type,
  kind: e.kind,
  source_id: e.source_id,
  evidence_status: e.evidence_status,
});

const titlesOf = (ctx: MinerContext, events: readonly TimelineEvent[]): string[] =>
  events.map((e) => (ctx.titles.get(e.event_id) ?? '').slice(0, TITLE_CHARS));

function candidateOf(ctx: MinerContext, id: string): Candidate {
  const c = ctx.result.candidates.find((x) => x.pattern_id === id);
  if (c === undefined) throw new Error(`no candidate ${id}; use a pattern_id from the digest`);
  return c;
}

const ById = z.object({ pattern_id: PatternIdSchema }).strict();
const idParam = { pattern_id: { type: 'string', pattern: '^pat_[0-9a-f]{16}$' } };

const getCandidate: MinerTool = {
  spec: {
    name: 'get_candidate',
    description:
      'One candidate: its steps, gaps and statistics, and the matched records of up to three supporting cases.',
    parameters: { type: 'object', properties: idParam, required: ['pattern_id'] },
  },
  run: (args, ctx) =>
    settle(() => {
      const c = candidateOf(ctx, ById.parse(args).pattern_id);
      const examples = c.examples.slice(0, MAX_EXAMPLES).map((s) => ({
        case_id: s.case_id,
        events: s.matched.map(eventView),
        // Titles are copied from government websites: data, never instructions.
        untrusted_data: { titles: titlesOf(ctx, s.matched) },
      }));
      return { kind: 'data', response: { ...candidateView(c), examples } };
    }),
};

const CaseArgs = z.object({ case_id: CaseIdSchema }).strict();

const getCaseTimeline: MinerTool = {
  spec: {
    name: 'get_case_timeline',
    description: 'The dated public records of one seed case (oldest first, at most 40).',
    parameters: {
      type: 'object',
      properties: { case_id: { type: 'string', pattern: '^[a-z0-9_]+$' } },
      required: ['case_id'],
    },
  },
  run: (args, ctx) =>
    settle(() => {
      const { case_id } = CaseArgs.parse(args);
      const seed = ctx.seeds.get(case_id);
      if (seed === undefined) throw new Error(`no seed case ${case_id}`);
      const events = seed.timeline.events.slice(0, MAX_EVENTS);
      return {
        kind: 'data',
        response: {
          case_id,
          events: events.map(eventView),
          truncated: seed.timeline.events.length > MAX_EVENTS,
          untrusted_data: { titles: titlesOf(ctx, events) },
        },
      };
    }),
};

const ProposeArgs = z
  .object({
    pattern_id: PatternIdSchema,
    name: z.string().trim().min(3).max(80),
    description: z.string().trim().min(20).max(400),
    benign_explanations: z.array(z.string().trim().min(1).max(200)).min(1).max(5),
  })
  .strict();

const proposePattern: MinerTool = {
  spec: {
    name: 'propose_pattern',
    description:
      'Ask the owner to approve one candidate as a pattern, with its name, description and benign explanations. The steps and numbers are the code’s and cannot be changed.',
    parameters: {
      type: 'object',
      properties: {
        ...idParam,
        name: { type: 'string', minLength: 3, maxLength: 80 },
        description: { type: 'string', minLength: 20, maxLength: 400 },
        benign_explanations: {
          type: 'array',
          minItems: 1,
          maxItems: 5,
          items: { type: 'string', minLength: 1, maxLength: 200 },
        },
      },
      required: ['pattern_id', 'name', 'description', 'benign_explanations'],
    },
  },
  run: (args) =>
    settle(() => {
      const { pattern_id, ...wording } = ProposeArgs.parse(args);
      return { kind: 'proposal', pattern_id, wording, response: { accepted: true } };
    }),
};

const RejectArgs = z
  .object({ pattern_id: PatternIdSchema, reason: z.string().trim().min(10).max(300) })
  .strict();

const rejectCandidate: MinerTool = {
  spec: {
    name: 'reject_candidate',
    description: 'Leave a candidate out of the proposals, with the reason.',
    parameters: {
      type: 'object',
      properties: { ...idParam, reason: { type: 'string', minLength: 10, maxLength: 300 } },
      required: ['pattern_id', 'reason'],
    },
  },
  run: (args) =>
    settle(() => {
      const { pattern_id, reason } = RejectArgs.parse(args);
      return { kind: 'rejection', pattern_id, reason, response: { accepted: true } };
    }),
};

const SummaryArgs = z.object({ summary: z.string().trim().min(20).max(800) }).strict();

const submitSummary: MinerTool = {
  spec: {
    name: 'submit_summary',
    description: 'Finish with a plain-English summary for the owner (at most 120 words).',
    parameters: {
      type: 'object',
      properties: { summary: { type: 'string', minLength: 20, maxLength: 800 } },
      required: ['summary'],
    },
  },
  run: (args) =>
    settle(() => ({
      kind: 'summary',
      summary: SummaryArgs.parse(args).summary,
      response: { accepted: true },
    })),
};

/** The complete tool list (B-49 style): three actions, two lookups, nothing else. */
export const MINER_TOOLS: readonly MinerTool[] = [
  getCandidate,
  getCaseTimeline,
  proposePattern,
  rejectCandidate,
  submitSummary,
];
