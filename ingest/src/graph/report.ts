import type { GraphLabBundle, GraphNode } from '@fund-tracker/shared';
import type { Insights } from './insights.js';

const RELATIONSHIPS: readonly (readonly [string, string, string])[] = [
  [
    'named_in',
    'established',
    'Organisation named in an order / notice / press release (title or listing field)',
  ],
  ['mentioned_in', 'candidate', 'Organisation appears only in document text — may be incidental'],
  [
    'insolvency_applicant_against',
    'established',
    'Applicant (financial/operational creditor, the company itself or a regulator) filed insolvency against a debtor (IBBI); regulator applicants never chain networks',
  ],
  [
    'insolvency_professional_for',
    'established',
    'Insolvency professional appointed for a debtor (IBBI) — routine, weak',
  ],
  ['auditor_of', 'established', 'Audit firm named with the audited company (NFRA)'],
  ['audit_partner_for', 'established', 'Audit engagement partner for the company (NFRA)'],
  ['registered_at', 'established', 'Registered office address (MCA master, Maharashtra only)'],
  [
    'possible_same_entity',
    'candidate',
    'Similar names (and/or same address) — needs manual review, never merged',
  ],
];

function table(rows: readonly (readonly string[])[], head: readonly string[]): string {
  const line = (r: readonly string[]): string => `| ${r.join(' | ')} |`;
  return [line(head), line(head.map(() => '---')), ...rows.map(line)].join('\n');
}

function relationshipSection(b: GraphLabBundle): string {
  const c = b.meta.counts;
  const rows = RELATIONSHIPS.map(([t, basis, meaning]) => [
    `\`${t}\``,
    basis,
    String(c[`edge:${t}`] ?? 0),
    meaning,
  ]);
  return `## Relationship types implemented\n\n${table(rows, ['Edge', 'Basis', 'Count', 'Meaning'])}\n\nEstablished edges: ${c['basis:established'] ?? 0}. Candidate edges: ${c['basis:candidate'] ?? 0}. Strong (used to find networks): ${c['strength:strong'] ?? 0}. Weak (shown only): ${c['strength:weak'] ?? 0}. Identity candidates for review: ${b.identity.length}.`;
}

function networkSection(b: GraphLabBundle, byId: ReadonlyMap<string, GraphNode>): string {
  const rows = b.networks.slice(0, 15).map((n, i) => {
    const orgs = n.node_ids
      .map((id) => byId.get(id))
      .filter(
        (x): x is GraphNode =>
          x !== undefined && x.kind !== 'event' && x.kind !== 'address' && x.kind !== 'person',
      );
    const names = orgs
      .slice(0, 5)
      .map((o) => o.label.slice(0, 45))
      .join('; ');
    return [
      String(i + 1),
      String(n.score),
      String(n.organisation_count),
      n.sources.join(', '),
      n.seed_cases.join(', ') || '—',
      `${names}${orgs.length > 5 ? '; …' : ''}`,
    ];
  });
  return `## Top networks (leads for human review, not findings)\n\n${table(rows, ['#', 'Score', 'Orgs', 'Sources', 'Seed cases', 'Organisations (first 5)'])}`;
}

function revealSection(b: GraphLabBundle, ins: Insights): string {
  const sizes = Object.entries(ins.networkSizes)
    .map(([k, v]) => `${k} orgs: ${v}`)
    .join(', ');
  const seeds = ins.seedLinks.length
    ? ins.seedLinks
        .map((s) => `  - ${s.cases.join(' ↔ ')}: ${s.path.join(' · ') || '(same network)'}`)
        .join('\n')
    : '  - No network connects two different seed cases through established, non-hub records.';
  const hubs = ins.topHubs.map((h) => `${h.label} (${h.kind}, degree ${h.degree})`).join('; ');
  return `## What the graph reveals\n\n- ${b.networks.length} networks contain two or more organisations linked by strong, established records (${sizes}).\n- ${ins.sameCaseEvents} events name two or more parties directly; ${ins.sharedAddressGroups} registered addresses are shared by two or more organisations; ${ins.specificCreditorLinks} applicant→debtor links come from non-hub, non-regulator applicants.\n- Hubs suppressed from network chaining (largest first): ${hubs}.\n- Seed cases connected to each other:\n${seeds}`;
}

const CANNOT = `## What the evidence cannot establish

- **Shared directors**: no director/signatory data is in the dataset (needs MCA21 filings), so director links are absent.
- **Fund flows**: no record documents transfers between companies; applicant links only say who filed insolvency against whom, not how much was lent or where it went.
- **Wrongdoing**: being named in a proceeding, sharing an address, creditor or professional is not evidence of fraud. Interim orders, ED attachments and show-cause notices are allegations.
- **Identity**: names are regex-extracted; similar names are listed as candidates and never merged. Two different CINs are always two legal entities, so similar-named group companies are linked through their shared address, not proposed as duplicates. Addresses cover Maharashtra companies only.
- **Completeness**: SEBI is a 10-order sample; only enforcement-type RBI releases and seed-case IBBI PDFs were fetched. Absence of a link is not absence of a relationship.`;

const IMPROVE = `## Improve before cloud deployment

1. Director/signatory data (MCA21) and national MCA master coverage, so shared-director and cross-state address links exist.
2. Human-reviewed identity resolution: work through \`identity_candidates.jsonl\`; persist decisions as reviewed edges.
3. Gemini-assisted extraction of parties and roles from order text, with excerpts, to replace regex name candidates.
4. Calibrate hub thresholds and network scoring on reviewed historical cases (time-aware backtest), and measure false positives.
5. Move graph build to a scheduled Cloud Run job writing BigQuery node/edge tables; serve subgraphs on demand instead of one bundle.`;

function datasetsSection(b: GraphLabBundle): string {
  const c = b.meta.counts;
  const tally = `${c['node:company'] ?? 0} companies, ${c['node:bank'] ?? 0} banks, ${c['node:llp'] ?? 0} LLPs, ${c['node:audit_firm'] ?? 0} audit firms, ${c['node:other_org'] ?? 0} other organisations, ${c['node:person'] ?? 0} professionals, ${c['node:address'] ?? 0} registered addresses and ${c['node:event'] ?? 0} case events`;
  if (b.meta.synthetic)
    return `## Datasets used

SYNTHETIC scenarios generated in code (\`ingest/src/graph/scenarios.ts\`): ${tally}, all fictional ("SYNTH …", example.invalid links). Nothing here comes from \`data/processed\` or describes a real organisation.`;
  return `## Datasets used

Read-only from \`data/processed\` (built ${b.meta.dataset_built_at ?? 'unknown'}): ${tally} — MCA company master (Maharashtra), NFRA, IBBI, ED, RBI enforcement releases, SFIO and a 10-order SEBI sample. Original files in \`data/raw\` and tables in \`data/processed\` are unchanged.`;
}

export function renderReport(b: GraphLabBundle, ins: Insights): string {
  const byId = new Map(b.nodes.map((n) => [n.id, n]));
  const used = datasetsSection(b);
  return (
    [
      `# FundTrace graph lab — relationship discovery report${b.meta.synthetic ? ' (SYNTHETIC)' : ''}`,
      `Generated ${b.meta.generated_at}.\n\n${b.meta.notes.map((n) => `- ${n}`).join('\n')}`,
      used,
      relationshipSection(b),
      revealSection(b, ins),
      networkSection(b, byId),
      CANNOT,
      `## How to run\n\n\`\`\`bash\nnpm run build -w @fund-tracker/shared && npm run build -w ingest\nnode ingest/dist/graphCli.js --web   # writes data/graph/* and web/public/graph-lab/\nnpm run dev -w web                   # open http://localhost:5173/graph-lab (demo sign-in first)\n\`\`\``,
      IMPROVE,
    ].join('\n\n') + '\n'
  );
}
