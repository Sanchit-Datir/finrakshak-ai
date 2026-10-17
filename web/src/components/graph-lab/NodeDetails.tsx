import { otherEnd, type GraphEdge, type GraphNode } from '@fund-tracker/shared';
import { safeExternalUrl } from '../../lib/safe-url.js';
import { CircleQuestionMark, ExternalLink, FileCheck, Network } from 'lucide-react';
import { EDGE_LABEL, edgesOf, KIND_LABEL, type LabIndex } from '../../lib/graph-lab.js';
import { Badge } from '../ui/Badge.js';
import { Button } from '../ui/Button.js';

const MAX_LISTED = 40;

/** Why a node is a hub, per role (see ingest/src/graph/edges.ts findHubs). */
const HUB_ROLE_LABEL: Readonly<Record<string, string>> = {
  event: 'batch notice naming many parties',
  creditor: 'insolvency applicant against many companies',
  person: 'professional on many cases',
  auditor: 'auditor of many companies',
  address: 'address shared by many companies (often a service address)',
};

const hubText = (roles: readonly string[]): string =>
  `Hub as ${roles.map((r) => HUB_ROLE_LABEL[r] ?? r).join('; ')}. Those links are shown but not used to connect other nodes into networks.`;

export function BasisBadge({ edge }: { edge: GraphEdge }): React.JSX.Element {
  return edge.basis === 'established' ? (
    <Badge tone={edge.strength === 'weak' ? 'neutral' : 'ok'} icon={FileCheck}>
      {edge.strength === 'weak' ? 'Established · weak' : 'Established'}
    </Badge>
  ) : (
    <Badge tone="warn" icon={CircleQuestionMark}>
      Candidate — needs review
    </Badge>
  );
}

export function EvidenceLine({ ix, edge }: { ix: LabIndex; edge: GraphEdge }): React.JSX.Element {
  const doc = edge.document_id === null ? undefined : ix.docs.get(edge.document_id);
  const href = safeExternalUrl(doc?.url);
  return (
    <p className="text-muted mt-1 text-xs">
      {edge.source_id.toUpperCase()} · {edge.evidence_status} · {edge.date ?? 'date not stated'}
      {doc !== undefined && href !== null && (
        <>
          {' · '}
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-primary-strong inline-flex items-center gap-1 underline"
          >
            {doc.title.length > 70 ? `${doc.title.slice(0, 69)}…` : doc.title}
            <ExternalLink className="size-3" aria-hidden />
            <span className="sr-only">(opens source in a new tab)</span>
          </a>
        </>
      )}
    </p>
  );
}

function Summary({ node }: { node: GraphNode }): React.JSX.Element {
  return (
    <>
      <p className="font-semibold break-words">{node.label}</p>
      <p className="text-muted text-xs">
        {KIND_LABEL[node.kind]}
        {node.detail !== null && ` · ${node.detail}`}
        {node.date !== null && ` · ${node.date}`}
      </p>
      <div className="mt-2 flex flex-wrap gap-1">
        {node.sources.map((s) => (
          <Badge key={s} tone="info">
            {s.toUpperCase()}
          </Badge>
        ))}
        {node.adverse_events > 0 && (
          <Badge tone="warn" title="Named in orders, notices or actions that are not routine">
            {node.adverse_events} adverse record(s)
          </Badge>
        )}
        {node.seed_cases.map((c) => (
          <Badge key={c} tone="violet">
            Seed case: {c}
          </Badge>
        ))}
        {node.hub && (
          <Badge tone="neutral" icon={Network}>
            Hub
          </Badge>
        )}
      </div>
      {node.hub && <p className="text-muted mt-1 text-xs">{hubText(node.hub_roles)}</p>}
    </>
  );
}

export function NodeDetails({
  ix,
  node,
  includeWeak,
  onFocus,
}: {
  ix: LabIndex;
  node: GraphNode;
  includeWeak: boolean;
  onFocus: (id: string) => void;
}): React.JSX.Element {
  const edges = edgesOf(ix, node.id, includeWeak);
  const hidden = includeWeak ? 0 : edgesOf(ix, node.id, true).length - edges.length;
  return (
    <div className="text-sm">
      <Summary node={node} />
      <h3 className="mt-3 text-xs font-semibold tracking-wide uppercase">
        Relationships ({edges.length}
        {edges.length > MAX_LISTED && `, first ${MAX_LISTED} shown`})
      </h3>
      {edges.length === 0 && (
        <p className="text-muted mt-1 text-xs">
          No {includeWeak ? '' : 'strong '}relationships in the data.
        </p>
      )}
      {hidden > 0 && (
        <p className="text-muted mt-1 text-xs">
          {hidden} weak or candidate link(s) hidden — tick “Include weak and candidate links” to see
          them.
        </p>
      )}
      <ul className="mt-2 max-h-[340px] space-y-2 overflow-y-auto">
        {edges.slice(0, MAX_LISTED).map((e) => {
          const other = ix.nodes.get(otherEnd(e, node.id));
          const from = e.from === node.id ? node.label : (other?.label ?? e.from);
          const to = e.to === node.id ? node.label : (other?.label ?? e.to);
          return (
            <li key={e.id} className="border-line rounded-lg border p-2">
              <p className="text-[13px] break-words">
                <strong>{from}</strong> — {EDGE_LABEL[e.type]} — <strong>{to}</strong>
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <BasisBadge edge={e} />
                {other !== undefined && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      onFocus(other.id);
                    }}
                  >
                    Focus on {KIND_LABEL[other.kind].toLowerCase()}
                  </Button>
                )}
              </div>
              <EvidenceLine ix={ix} edge={e} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
