import { z } from 'zod';
import { SECTIONS } from './input.js';
import { MalformedArgs } from './loop.js';
import type { BundleIndex } from './verify.js';

/** The five read tools: each returns a slice of the bundle, never anything outside it. */

const SectionArgs = z.object({ section: z.enum(SECTIONS) });
const NameArgs = z.object({ name: z.string().min(1).max(80) });
const PartyArgs = z.object({ partyId: z.string().min(1).max(80) });
const IdArgs = z.object({ id: z.string().min(1).max(80) });

function parse<T>(schema: z.ZodType<T>, args: unknown): T {
  const r = schema.safeParse(args);
  if (!r.success) throw new MalformedArgs(r.error.issues[0]?.message ?? 'invalid arguments');
  return r.data;
}

export function getSection(ix: BundleIndex, args: unknown): Record<string, unknown> {
  const { section } = parse(SectionArgs, args);
  return { section, fields: ix.input.sections[section] };
}

export function getRatio(ix: BundleIndex, args: unknown): Record<string, unknown> {
  const { name } = parse(NameArgs, args);
  const ratio = ix.ratios.get(name);
  if (ratio === undefined) return { error: `no ratio "${name}"`, available: [...ix.ratios.keys()] };
  return { ratio };
}

export function getCandidates(ix: BundleIndex, args: unknown): Record<string, unknown> {
  const { partyId } = parse(PartyArgs, args);
  const party = ix.parties.get(partyId);
  if (party === undefined) return { error: `no party "${partyId}"` };
  return {
    partyId,
    name: party.name,
    cin: party.cin,
    candidates: party.candidates.map(({ records, ...c }) => ({
      ...c,
      recordCount: records.length,
    })),
    note: 'Candidates are shortlisted by code on name similarity; none is a confirmed match.',
  };
}

export function getRecord(ix: BundleIndex, args: unknown): Record<string, unknown> {
  const { id } = parse(IdArgs, args);
  const ref = ix.records.get(id);
  if (ref === undefined) return { error: `no record "${id}" in the shortlists` };
  if (ref.candidate.candidateId === id) return { partyId: ref.partyId, candidate: ref.candidate };
  const record = ref.candidate.records.find((r) => r.recordId === id);
  return {
    partyId: ref.partyId,
    candidateId: ref.candidate.candidateId,
    candidateName: ref.candidate.name,
    record,
  };
}

export function getRelated(ix: BundleIndex, args: unknown): Record<string, unknown> {
  const { partyId } = parse(PartyArgs, args);
  const party = ix.parties.get(partyId);
  if (party === undefined) return { error: `no party "${partyId}"` };
  return { partyId, related: party.related };
}
