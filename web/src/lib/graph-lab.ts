import {
  buildAdjacency,
  GraphLabBundleSchema,
  GraphLabIndexSchema,
  neighbourhood,
  otherEnd,
  shortestPath,
  type Adjacency,
  type GraphDocument,
  type GraphEdge,
  type GraphEdgeType,
  type GraphLabBundle,
  type GraphLabIndexEntry,
  type GraphNode,
  type GraphNodeKind,
  type PathStep,
} from '@fund-tracker/shared';

/** Graph lab: local, exploratory view of the public-source graph bundle (data/graph). */

export const GRAPH_LAB_BASE = '/graph-lab/';

export const EDGE_LABEL: Record<GraphEdgeType, string> = {
  named_in: 'named in',
  mentioned_in: 'mentioned in (text only)',
  insolvency_applicant_against: 'filed insolvency against',
  insolvency_professional_for: 'insolvency professional for',
  auditor_of: 'auditor of',
  audit_partner_for: 'audit partner for',
  registered_at: 'registered office at',
  possible_same_entity: 'possibly the same as',
};

export const KIND_LABEL: Record<GraphNodeKind, string> = {
  company: 'Company',
  bank: 'Bank',
  llp: 'LLP',
  audit_firm: 'Audit firm',
  other_org: 'Organisation',
  person: 'Professional',
  address: 'Registered address',
  event: 'Case / regulatory event',
};

const ORG_KINDS = new Set<GraphNodeKind>(['company', 'bank', 'llp', 'audit_firm', 'other_org']);
export const isOrganisation = (n: GraphNode): boolean => ORG_KINDS.has(n.kind);

export class GraphLabLoadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'GraphLabLoadError';
  }
}

/** Accepts gzip or plain JSON bytes (servers may or may not decompress .gz for us). */
async function bytesToText(buf: ArrayBuffer): Promise<string> {
  const head = new Uint8Array(buf.slice(0, 2));
  if (head[0] !== 0x1f || head[1] !== 0x8b) return new TextDecoder().decode(buf);
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

function parseBundle(text: string): GraphLabBundle {
  try {
    return GraphLabBundleSchema.parse(JSON.parse(text));
  } catch (cause) {
    throw new GraphLabLoadError('The file is not a valid graph-lab bundle.', { cause });
  }
}

async function fetchOk(url: string): Promise<Response> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new GraphLabLoadError(`Could not load ${url} (HTTP ${res.status}).`);
  return res;
}

export async function fetchIndex(): Promise<GraphLabIndexEntry[]> {
  const res = await fetchOk(`${GRAPH_LAB_BASE}index.json`);
  return GraphLabIndexSchema.parse(await res.json());
}

export async function loadBundleFromUrl(file: string): Promise<GraphLabBundle> {
  const res = await fetchOk(`${GRAPH_LAB_BASE}${file}`);
  return parseBundle(await bytesToText(await res.arrayBuffer()));
}

export async function loadBundleFromFile(file: File): Promise<GraphLabBundle> {
  return parseBundle(await bytesToText(await file.arrayBuffer()));
}

export interface LabIndex {
  readonly bundle: GraphLabBundle;
  readonly nodes: ReadonlyMap<string, GraphNode>;
  readonly docs: ReadonlyMap<string, GraphDocument>;
  readonly strong: Adjacency;
  readonly all: Adjacency;
}

export function indexBundle(bundle: GraphLabBundle): LabIndex {
  return {
    bundle,
    nodes: new Map(bundle.nodes.map((n) => [n.id, n])),
    docs: new Map(bundle.documents.map((d) => [d.id, d])),
    strong: buildAdjacency(bundle.edges, { includeWeak: false }),
    all: buildAdjacency(bundle.edges, { includeWeak: true }),
  };
}

/** Organisations first, then people/addresses, then events; prefix matches rank higher. */
export function searchNodes(ix: LabIndex, query: string, limit = 10): GraphNode[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const rank = (n: GraphNode): number =>
    (isOrganisation(n) ? 0 : n.kind === 'event' ? 4 : 2) + (n.label.toLowerCase().startsWith(q) ? 0 : 1);
  const hits: GraphNode[] = [];
  for (const n of ix.bundle.nodes) {
    if (n.label.toLowerCase().includes(q) || (n.detail ?? '').toLowerCase().includes(q)) hits.push(n);
  }
  return hits.sort((a, b) => rank(a) - rank(b) || b.degree - a.degree).slice(0, limit);
}

export function edgesOf(ix: LabIndex, id: string, includeWeak: boolean): readonly GraphEdge[] {
  return (includeWeak ? ix.all : ix.strong).out.get(id) ?? [];
}

export interface PlacedNode {
  readonly node: GraphNode;
  readonly x: number;
  readonly y: number;
  readonly depth: number;
}

export interface LabLayout {
  readonly nodes: readonly PlacedNode[];
  readonly edges: readonly GraphEdge[];
  readonly truncated: boolean;
  /** Too many nodes to label them all legibly: label only the focus and the selection. */
  readonly busy: boolean;
}

export const LAYOUT_CAP = 60;
/** Above this many nodes, names are shown on hover and in the side list instead of on the graph. */
export const LABEL_ALL_MAX = 16;
const FIRST_RING = 150;
const SUB_RING_GAP = 75;
const DEPTH_GAP = 130;
/** Rings are ellipses (rx = 1.5 r) to use the wide panel; PERIMETER ≈ their perimeter per unit r. */
const ELLIPSE_X = 1.5;
const PERIMETER = 2 * Math.PI * 1.25;

/**
 * Places one hop's nodes. Labelled views use one ring sized for the names; busy views use as
 * many concentric sub-rings as needed to keep the circles apart.
 */
function placeDepth(
  nodes: readonly GraphNode[],
  d: number,
  start: number,
  busy: boolean,
): { placed: PlacedNode[]; end: number } {
  const spacing = busy ? 66 : 105;
  const capacity = (r: number): number =>
    busy ? Math.max(6, Math.floor((PERIMETER * r) / spacing)) : nodes.length;
  const placed: PlacedNode[] = [];
  let radius = busy ? start : Math.max(start, (nodes.length * spacing) / PERIMETER);
  let rest = nodes;
  for (let ring = 0; rest.length > 0; ring++, radius += SUB_RING_GAP) {
    const take = rest.slice(0, capacity(radius));
    rest = rest.slice(take.length);
    take.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / take.length - Math.PI / 2 + d * 0.3 + ring * 0.2;
      const x = Math.cos(angle) * radius * ELLIPSE_X;
      placed.push({ node, depth: d, x, y: Math.sin(angle) * radius });
    });
  }
  return { placed, end: radius - SUB_RING_GAP };
}

const byKindThenLabel = (a: GraphNode, b: GraphNode): number =>
  a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label);

/** Radial ego layout: focus in the centre, each hop further out; hubs are not expanded. */
export function egoLayout(ix: LabIndex, focus: string, hops: number, includeWeak: boolean): LabLayout {
  const adj = includeWeak ? ix.all : ix.strong;
  const depth = neighbourhood(adj, [focus], hops, LAYOUT_CAP, (id) => ix.nodes.get(id)?.hub ?? false);
  const edges = new Map<string, GraphEdge>();
  for (const id of depth.keys()) {
    for (const e of adj.out.get(id) ?? []) if (depth.has(otherEnd(e, id))) edges.set(e.id, e);
  }
  const busy = depth.size > LABEL_ALL_MAX;
  const nodes: PlacedNode[] = [];
  let radius = FIRST_RING;
  for (let d = 0; d <= hops; d++) {
    const ring = [...depth]
      .filter(([, dd]) => dd === d)
      .map(([id]) => ix.nodes.get(id))
      .filter((n): n is GraphNode => n !== undefined)
      .sort(byKindThenLabel);
    if (d === 0) {
      nodes.push(...ring.map((node) => ({ node, depth: 0, x: 0, y: 0 })));
      continue;
    }
    if (ring.length === 0) break;
    const { placed, end } = placeDepth(ring, d, radius, busy);
    nodes.push(...placed);
    radius = end + DEPTH_GAP;
  }
  const truncated = depth.size >= LAYOUT_CAP;
  return { nodes, edges: [...edges.values()], truncated, busy };
}

export function pathBetween(ix: LabIndex, a: string, b: string, includeWeak: boolean): PathStep[] | null {
  return shortestPath(includeWeak ? ix.all : ix.strong, a, b, 8);
}
