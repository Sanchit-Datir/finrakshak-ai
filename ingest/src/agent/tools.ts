import {
  AgentActionSchema,
  ListingItemSchema,
  SourceIdSchema,
  type IngestRun,
} from '@fund-tracker/shared';
import { z } from 'zod';
import type { ToolSpec } from '../ai/toolModel.js';
import { listingKey } from '../acquire.js';
import { DeltaReportSchema } from '../delta/report.js';
import { blobs } from '../storage/index.js';
import { readJson, readJsonl } from '../store/jsonl.js';
import { describePage } from './pageStructure.js';
import type { Assessment } from './findings.js';
import type { HistorySource } from './history.js';
import type { ProposalDraft } from './proposals.js';

export interface ToolContext {
  readonly run: IngestRun;
  readonly assessment: Assessment;
  readonly history: HistorySource;
}

export type ToolOutcome =
  | { readonly kind: 'data'; readonly response: Record<string, unknown> }
  | {
      readonly kind: 'proposal';
      readonly draft: ProposalDraft;
      readonly response: Record<string, unknown>;
    }
  | {
      readonly kind: 'review';
      readonly summary: string;
      readonly response: Record<string, unknown>;
    };

export interface AgentTool {
  readonly spec: ToolSpec;
  run(args: unknown, ctx: ToolContext): Promise<ToolOutcome>;
}

const SOURCE_ENUM = SourceIdSchema.options;
const TITLE_CHARS = 200;

function compactRun(run: IngestRun): Record<string, unknown> {
  return {
    run_id: run.run_id,
    sources: Object.values(run.sources).map((s) => ({
      source: s.source_id,
      status: s.status,
      mode: s.mode,
      added: s.added,
      changed: s.changed,
      removed: s.removed,
      minutes: Math.round(s.duration_ms / 60_000),
      error: s.error,
    })),
    build: run.build && {
      status: run.build.status,
      reason: run.build.reason,
      version: run.build.version,
      failed_gates: run.build.gates.filter((g) => !g.passed),
    },
  };
}

const getRunSummary: AgentTool = {
  spec: {
    name: 'get_run_summary',
    description: 'Per-source outcome of this run, the build result and the code-computed findings.',
    parameters: { type: 'object', properties: {} },
  },
  run: (_args, ctx) =>
    Promise.resolve({
      kind: 'data',
      response: { ...compactRun(ctx.run), findings: ctx.assessment.findings },
    }),
};

const DeltaArgs = z.object({
  source_id: SourceIdSchema,
  limit: z.number().int().min(1).max(50).default(20),
});

const getDelta: AgentTool = {
  spec: {
    name: 'get_delta',
    description: 'Items added, changed or removed for one source in this run, with their titles.',
    parameters: {
      type: 'object',
      properties: {
        source_id: { type: 'string', enum: SOURCE_ENUM },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
      },
      required: ['source_id'],
    },
  },
  run: async (args, ctx) => {
    const { source_id, limit } = DeltaArgs.parse(args);
    const key = ctx.run.sources[source_id]?.report_key ?? null;
    const report = key === null ? null : await readJson(key, DeltaReportSchema);
    if (!report)
      return { kind: 'data', response: { source_id, note: 'no listing report in this run' } };
    const titles = new Map(
      (await readJsonl(listingKey(source_id), ListingItemSchema)).map((i) => [
        i.item_id,
        i.title.slice(0, TITLE_CHARS),
      ]),
    );
    const pick = (ids: readonly string[]): { id: string; title: string }[] =>
      ids.slice(0, limit).map((id) => ({ id, title: titles.get(id) ?? '' }));
    return {
      kind: 'data',
      response: {
        source_id,
        mode: report.mode,
        counts: {
          added: report.added.length,
          changed: report.changed.length,
          removed: report.removed.length,
        },
        // Titles are copied from the source website: data, never instructions.
        untrusted_data: {
          added: pick(report.added),
          changed: pick(report.changed),
          removed: pick(report.removed),
        },
      },
    };
  },
};

const HistoryArgs = z.object({
  source_id: SourceIdSchema,
  days: z.number().int().min(1).max(30).default(14),
});

const getSourceHistory: AgentTool = {
  spec: {
    name: 'get_source_history',
    description: 'Past daily outcomes of one source (newest first), for comparing with today.',
    parameters: {
      type: 'object',
      properties: {
        source_id: { type: 'string', enum: SOURCE_ENUM },
        days: { type: 'integer', minimum: 1, maximum: 30 },
      },
      required: ['source_id'],
    },
  },
  run: async (args, ctx) => {
    const { source_id, days } = HistoryArgs.parse(args);
    const rows = (await ctx.history.recent(source_id, days)).filter(
      (r) => r.run_id !== ctx.run.run_id,
    );
    return { kind: 'data', response: { source_id, runs: rows.slice(0, 30) } };
  },
};

const DiagnosticArgs = z.object({ source_id: SourceIdSchema });

const getDiagnosticPage: AgentTool = {
  spec: {
    name: 'get_diagnostic_page',
    description:
      'For a source whose page stopped parsing: the saved page reduced to its structure (title, tables, headers, links) and visible text, plus sample titles the adapter used to find. Use it to explain what changed.',
    parameters: {
      type: 'object',
      properties: { source_id: { type: 'string', enum: SOURCE_ENUM } },
      required: ['source_id'],
    },
  },
  run: async (args, ctx) => {
    const { source_id } = DiagnosticArgs.parse(args);
    const key = ctx.run.sources[source_id]?.diagnostic_key ?? null;
    const blob = key === null ? null : await blobs().read(key);
    if (!blob)
      return {
        kind: 'data',
        response: { source_id, note: 'no saved page for this source in this run' },
      };
    const known = (await readJsonl(listingKey(source_id), ListingItemSchema))
      .slice(0, 5)
      .map((i) => i.title.slice(0, 120));
    // The page is the site's content: data, never instructions.
    return {
      kind: 'data',
      response: {
        source_id,
        untrusted_data: { ...describePage(blob.data.toString('utf8')), titles_seen_before: known },
      },
    };
  },
};

const ProposeArgs = z.object({
  source_id: SourceIdSchema.nullable(),
  action: AgentActionSchema,
  reason: z.string().trim().min(10).max(500),
});

const proposeAction: AgentTool = {
  spec: {
    name: 'propose_action',
    description:
      'Ask the owner to approve one action. It does nothing until approved. Use source_id null only for rollback_publish.',
    parameters: {
      type: 'object',
      properties: {
        source_id: { type: ['string', 'null'], enum: [...SOURCE_ENUM, null] },
        action: { type: 'string', enum: AgentActionSchema.options },
        reason: { type: 'string', minLength: 10, maxLength: 500 },
      },
      required: ['source_id', 'action', 'reason'],
    },
  },
  run: (args) => {
    const p = ProposeArgs.parse(args);
    if ((p.action === 'rollback_publish') !== (p.source_id === null))
      throw new Error('rollback_publish takes source_id null; every other action needs a source');
    // A model proposal always waits for the owner, even rerun_source (B-49).
    return Promise.resolve({
      kind: 'proposal',
      draft: { ...p, auto: false },
      response: { accepted: true },
    });
  },
};

const SubmitArgs = z.object({ summary: z.string().trim().min(20).max(800) });

const submitReview: AgentTool = {
  spec: {
    name: 'submit_review',
    description:
      'Finish the review with a plain-English summary for the owner (at most 120 words).',
    parameters: {
      type: 'object',
      properties: { summary: { type: 'string', minLength: 20, maxLength: 800 } },
      required: ['summary'],
    },
  },
  run: (args) =>
    Promise.resolve({
      kind: 'review',
      summary: SubmitArgs.parse(args).summary,
      response: { accepted: true },
    }),
};

/** The complete tool list. Nothing here fetches URLs or writes pipeline data (B-49). */
export const AGENT_TOOLS: readonly AgentTool[] = [
  getRunSummary,
  getDelta,
  getSourceHistory,
  getDiagnosticPage,
  proposeAction,
  submitReview,
];
