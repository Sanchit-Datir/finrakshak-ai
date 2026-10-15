import type { LandUnit } from '../domain/schemas.js';
import { normalizeDigits } from './text.js';

/** Square metres per unit. Guntha uses the Maharashtra convention (1 guntha = 1 are ≈ 101.17 m²). */
const SQM: Record<LandUnit, number> = {
  hectare: 10_000,
  are: 100,
  acre: 4046.8564,
  guntha: 101.17,
};

export const LAND_UNIT_LABEL: Record<LandUnit, string> = {
  hectare: 'Hectare (हेक्टर)',
  are: 'Are (आर)',
  acre: 'Acre (एकर)',
  guntha: 'Guntha (गुंठा)',
};

/**
 * Parses a land area like "1.62", "१.६२" or "1 हे 62 आर" (hectare-are notation
 * used on 7/12 extracts) into hectares. Returns null when it cannot be parsed
 * unambiguously — callers must then ask for manual confirmation.
 */
export function parseAreaToHectares(raw: string, unit: LandUnit): number | null {
  const s = normalizeDigits(raw).trim();
  const heAre = /^(\d+)\s*(?:हे|ha)\.?\s*(\d{1,2})\s*(?:आर|are|r)\.?$/i.exec(s);
  if (heAre) {
    return Number(heAre[1]) + Number(heAre[2]) / 100;
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return (Number(s) * SQM[unit]) / SQM.hectare;
}
