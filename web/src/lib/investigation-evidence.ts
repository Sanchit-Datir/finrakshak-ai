import type {
  Citation,
  InvestigateApplicationInput,
  InvestigateApplicationResult,
  InvestigationFinding,
} from '@fund-tracker/shared';
import type { InvestigationEvidence } from '../domain/schemas.js';

/**
 * What each citation of a stored investigation pointed at, captured from the bundle when the result
 * arrives, so the card can show the evidence later even if the public-records index is not loaded.
 */

export function citationKey(c: Citation): string {
  switch (c.type) {
    case 'field':
      return `field:${c.path}`;
    case 'ratio':
      return `ratio:${c.name}`;
    case 'record':
      return `record:${c.id}`;
    case 'entity':
      return `entity:${c.id}`;
  }
}

function describe(input: InvestigateApplicationInput, c: Citation): InvestigationEvidence | null {
  const sections = Object.values(input.sections).flat();
  switch (c.type) {
    case 'field': {
      const f = sections.find((x) => x.path === c.path);
      return f === undefined ? null : { label: f.label, detail: f.value === '' ? '(not given)' : f.value };
    }
    case 'ratio': {
      const r = input.ratios.find((x) => x.name === c.name);
      return r === undefined ? null : { label: `${r.label} (computed by code)`, detail: `${r.value} — ${r.basis}` };
    }
    case 'record': {
      for (const cand of input.parties.flatMap((p) => p.candidates)) {
        const cin = `CIN ${cand.cin ?? 'not recorded'}`;
        if (cand.candidateId === c.id)
          return { label: `Public records: ${cand.name}`, detail: [cin, cand.status, `name similarity ${String(cand.nameScore)}/100`].filter(Boolean).join(' · ') };
        const rec = cand.records.find((r) => r.recordId === c.id);
        if (rec !== undefined)
          return { label: `Public record of ${cand.name}`, detail: `${rec.title} (${rec.kind}${rec.date === null ? '' : `, ${rec.date}`})` };
      }
      return null;
    }
    case 'entity': {
      const e = input.parties.flatMap((p) => p.related).find((x) => x.entityId === c.id);
      if (e === undefined) return null;
      const source = e.source === 'workspace' ? 'recorded in this workspace' : 'public records';
      return { label: e.name, detail: [e.relation, e.concern, source].filter(Boolean).join(' · ') };
    }
  }
}

export function evidenceIndex(
  input: InvestigateApplicationInput,
  result: InvestigateApplicationResult,
): Record<string, InvestigationEvidence> {
  const out: Record<string, InvestigationEvidence> = {};
  const cites = [...result.findings, ...result.questions].flatMap((x) => x.citations);
  const gaps = result.questions.map((q): Citation => ({ type: 'field', path: q.gap, quote: null }));
  for (const c of [...cites, ...gaps]) {
    const d = describe(input, c);
    if (d !== null) out[citationKey(c)] = d;
  }
  return out;
}

/** Finding states are keyed per run, so a dismissal never carries over to a new investigation. */
export function aiFindingStateId(investigatedAt: string, f: Pick<InvestigationFinding, 'id'>): string {
  return `ai:${investigatedAt}:${f.id}`;
}
