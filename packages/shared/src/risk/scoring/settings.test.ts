import { describe, expect, it } from 'vitest';
import { DEFAULT_SCORING_SETTINGS as S, ScoringSettingsSchema } from './settings.js';

describe('scoring settings v1', () => {
  it('hold the owner’s decisions', () => {
    expect(S.settings_version).toBe('v1');
    expect(S.layer_max).toEqual({ direct: 40, pattern: 30, graph: 20, behaviour: 10 });
    expect(S.bands).toEqual({ needs_attention_from: 30, urgent_from: 60 });
    expect(S.alert).toEqual({ rise_points: 15, clean_runs_to_step_down: 2 });
    expect(S.stale_after_days).toBe(7);
    expect(S.pattern).toMatchObject({
      scale: 30,
      full_support_weight: 1,
      partial_support_weight: 0.6,
    });
    expect(S.pattern.verified_cases_for_full_support).toBe(3);
  });

  it('reject layer maxima that do not add up to 100', () => {
    const bad = { ...S, layer_max: { ...S.layer_max, graph: 21 } };
    expect(ScoringSettingsSchema.safeParse(bad).success).toBe(false);
  });

  it('reject bands in the wrong order', () => {
    const bad = { ...S, bands: { needs_attention_from: 60, urgent_from: 60 } };
    expect(ScoringSettingsSchema.safeParse(bad).success).toBe(false);
  });

  it('reject partial support that weighs more than full support', () => {
    const bad = {
      ...S,
      pattern: { ...S.pattern, partial_support_weight: 1, full_support_weight: 0.6 },
    };
    expect(ScoringSettingsSchema.safeParse(bad).success).toBe(false);
  });

  it('reject an unversioned or fractional setting', () => {
    expect(ScoringSettingsSchema.safeParse({ ...S, settings_version: 'latest' }).success).toBe(
      false,
    );
    expect(ScoringSettingsSchema.safeParse({ ...S, stale_after_days: 7.5 }).success).toBe(false);
  });
});
