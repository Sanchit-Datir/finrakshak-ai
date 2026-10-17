import { z } from 'zod';

/**
 * Versioned scoring settings (docs/plans/RISK_SCORING_PLAN.md). Every number the score, the bands and
 * the alert decision use lives here, and every score records the `settings_version` it was made with,
 * so a past score can be reproduced. The values only change through a person (AGENTS_PLAN.md,
 * Autonomy). Points are whole numbers; percentages are 0–100 integers.
 */

const points = (max: number): z.ZodNumber => z.number().int().min(0).max(max);
const percent = z.number().int().min(0).max(100);
const weight = z.number().min(0).max(1);

const StatusPercentSchema = z.object({
  fact: percent,
  finding: percent,
  allegation: percent,
  inference: percent,
  unknown: percent,
});

export const ScoringSettingsSchema = z
  .object({
    settings_version: z.string().regex(/^v\d+$/),
    layer_max: z.object({
      direct: points(100),
      pattern: points(100),
      graph: points(100),
      behaviour: points(100),
    }),
    bands: z.object({ needs_attention_from: points(100), urgent_from: points(100) }),
    alert: z.object({
      rise_points: points(100),
      clean_runs_to_step_down: z.number().int().min(1).max(12),
    }),
    /** B-56: the public data counts as stale when it is older than this many days. */
    stale_after_days: z.number().int().min(0).max(365),
    direct: z.object({
      after_disbursement: points(100),
      before_disbursement: points(100),
      nfra_finding: points(100),
      several_proceedings: points(100),
      several_proceedings_min: z.number().int().min(2),
      many_sources: points(100),
      many_sources_min: z.number().int().min(2),
      /** A director's or owner's record counts this share of the borrower's points. */
      related_party_percent: percent,
      /** Weight per evidence status on the rows that do not trigger the override (B-36). */
      status_percent: StatusPercentSchema,
    }),
    graph: z.object({
      one_hop: points(100),
      two_hops: points(100),
      /** An inferred or user-provided link counts this share of a verified one. */
      unverified_link_percent: percent,
      /** An entity with at least this many links is a hub and never counts (B-40). */
      hub_min_links: z.number().int().min(2),
    }),
    pattern: z.object({
      /** Points per pattern = round(scale × strength × support weight). */
      scale: points(100),
      full_support_weight: weight,
      partial_support_weight: weight,
      verified_cases_for_full_support: z.number().int().min(1),
    }),
    behaviour: z.object({
      grace_days: z.number().int().min(0).max(60),
      /** A payment below this share of the usual EMI is partial. */
      partial_below_percent: percent,
      /** Only the EMIs due in this many most recent months are looked at. */
      lookback_emis: z.number().int().min(3).max(24),
      one_unmet: points(100),
      two_unmet_in_row: points(100),
      three_or_more_unmet: points(100),
      growing_delay_emis: z.number().int().min(2).max(12),
      growing_delay: points(100),
      /** Receipts in the last 3 months against the 3 before: a fall of at least these percents. */
      receipts_fall_small_percent: percent,
      receipts_fall_large_percent: percent,
      receipts_fall_small: points(100),
      receipts_fall_large: points(100),
    }),
    monitoring: z.object({
      rapidOnwardHours: z.number().int().positive(),
      rapidOnwardPercent: percent,
      repeatedCounterpartyMinLoans: z.number().int().min(2),
      repeatedCounterpartyWindowDays: z.number().int().positive(),
      repeatedCounterpartyMinAmountMinor: z.number().int().safe().positive(),
      circularWindowDays: z.number().int().positive(),
      circularMinReturnPercent: percent,
      cashReferenceMinor: z.number().int().safe().positive(),
      cashNearPercent: percent,
      cashMinCount: z.number().int().min(2),
      cashWindowDays: z.number().int().positive(),
    }),
  })
  .superRefine((s, ctx) => {
    const fail = (message: string): void => {
      ctx.addIssue({ code: 'custom', message });
    };
    const { direct, pattern, graph, behaviour } = s.layer_max;
    if (direct + pattern + graph + behaviour !== 100) fail('the layer maxima must add up to 100');
    if (s.bands.needs_attention_from >= s.bands.urgent_from)
      fail('needs_attention_from must be below urgent_from');
    if (s.pattern.partial_support_weight > s.pattern.full_support_weight)
      fail('partial support cannot weigh more than full support');
  });
export type ScoringSettings = z.infer<typeof ScoringSettingsSchema>;

/** Version 1, as decided by the owner on 17 Oct 2026 and the answers of the scorer brief. Kept readable. */
export const SCORING_SETTINGS_V1: ScoringSettings = ScoringSettingsSchema.parse({
  settings_version: 'v1',
  layer_max: { direct: 40, pattern: 30, graph: 20, behaviour: 10 },
  bands: { needs_attention_from: 30, urgent_from: 60 },
  alert: { rise_points: 15, clean_runs_to_step_down: 2 },
  stale_after_days: 7,
  direct: {
    after_disbursement: 40,
    before_disbursement: 25,
    nfra_finding: 15,
    several_proceedings: 10,
    several_proceedings_min: 2,
    many_sources: 15,
    many_sources_min: 3,
    related_party_percent: 50,
    status_percent: { fact: 100, finding: 100, allegation: 100, inference: 100, unknown: 100 },
  },
  graph: { one_hop: 20, two_hops: 10, unverified_link_percent: 50, hub_min_links: 25 },
  pattern: {
    scale: 30,
    full_support_weight: 1,
    partial_support_weight: 0.6,
    verified_cases_for_full_support: 3,
  },
  behaviour: {
    grace_days: 5,
    partial_below_percent: 90,
    lookback_emis: 6,
    one_unmet: 4,
    two_unmet_in_row: 8,
    three_or_more_unmet: 10,
    growing_delay_emis: 3,
    growing_delay: 10,
    receipts_fall_small_percent: 25,
    receipts_fall_large_percent: 50,
    receipts_fall_small: 1,
    receipts_fall_large: 2,
  },
  monitoring: {
    rapidOnwardHours: 72,
    rapidOnwardPercent: 70,
    repeatedCounterpartyMinLoans: 2,
    repeatedCounterpartyWindowDays: 60,
    repeatedCounterpartyMinAmountMinor: 10_000_000,
    circularWindowDays: 30,
    circularMinReturnPercent: 50,
    cashReferenceMinor: 10_000_000,
    cashNearPercent: 90,
    cashMinCount: 3,
    cashWindowDays: 7,
  },
});

/**
 * Version 2 (checkpoint 2, 17 Oct 2026): Needs attention starts at 18 instead of 30, so one monitoring-rule
 * typology (18 points at the 0.6 hypothesis support) is a lead. Everything else is v1. Measured on the full
 * synthetic set: 28.5 alerts per 1,000 loan-months against the 30 budget, 0 controls or look-alikes alerted,
 * 85 of 105 defaulters caught (docs/RISK_SCORING.md).
 */
export const SCORING_SETTINGS_V2: ScoringSettings = ScoringSettingsSchema.parse({
  ...SCORING_SETTINGS_V1,
  settings_version: 'v2',
  bands: { ...SCORING_SETTINGS_V1.bands, needs_attention_from: 18 },
});

/** Every published version, so a stored score's `settings_version` can always be read back (B-24). */
export const SCORING_SETTINGS_BY_VERSION: Readonly<Record<string, ScoringSettings>> = {
  v1: SCORING_SETTINGS_V1,
  v2: SCORING_SETTINGS_V2,
};

/** The settings a new run uses unless told otherwise. */
export const DEFAULT_SCORING_SETTINGS: ScoringSettings = SCORING_SETTINGS_V2;

export const settingsForVersion = (version: string): ScoringSettings | undefined =>
  SCORING_SETTINGS_BY_VERSION[version];
