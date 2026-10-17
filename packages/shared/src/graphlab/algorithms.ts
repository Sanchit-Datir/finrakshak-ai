import type { GraphEdge } from './schema.js';

/** Pure graph helpers shared by the graph builder (Node) and the Graph lab page (browser). */

export interface Adjacency {
  readonly out: ReadonlyMap<string, readonly GraphEdge[]>;
}

export interface AdjacencyOptions {
  /** Include weak edges (text mentions, hub routes, insolvency professionals, identity candidates). */
  readonly includeWeak: boolean;
}

export function buildAdjacency(edges: readonly GraphEdge[], opts: AdjacencyOptions): Adjacency {
  const out = new Map<string, GraphEdge[]>();
  for (const e of edges) {
    if (!opts.includeWeak && e.strength === 'weak') continue;
    for (const end of [e.from, e.to]) {
      const list = out.get(end);
      if (list === undefined) out.set(end, [e]);
      else list.push(e);
    }
  }
  return { out };
}

export function otherEnd(edge: GraphEdge, id: string): string {
  return edge.from === id ? edge.to : edge.from;
}

export interface PathStep {
  readonly from: string;
  readonly to: string;
  readonly edge: GraphEdge;
}

/** Breadth-first shortest path; returns the edges walked (each carries its evidence) or null. */
export function shortestPath(
  adj: Adjacency,
  start: string,
  goal: string,
  maxHops = 6,
): PathStep[] | null {
  if (start === goal) return [];
  const prev = new Map<string, PathStep>();
  let frontier = [start];
  const seen = new Set([start]);
  for (let hop = 0; hop < maxHops && frontier.length > 0; hop++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const edge of adj.out.get(id) ?? []) {
        const to = otherEnd(edge, id);
        if (seen.has(to)) continue;
        seen.add(to);
        prev.set(to, { from: id, to, edge });
        if (to === goal) return unwind(prev, start, goal);
        next.push(to);
      }
    }
    frontier = next;
  }
  return null;
}

function unwind(prev: ReadonlyMap<string, PathStep>, start: string, goal: string): PathStep[] {
  const steps: PathStep[] = [];
  let cur = goal;
  while (cur !== start) {
    const step = prev.get(cur);
    if (step === undefined) break;
    steps.unshift(step);
    cur = step.from;
  }
  return steps;
}

/** Connected components over the given adjacency (each node appears in exactly one). */
export function components(nodeIds: Iterable<string>, adj: Adjacency): string[][] {
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const id of nodeIds) {
    if (seen.has(id) || !adj.out.has(id)) continue;
    const group: string[] = [];
    const stack = [id];
    seen.add(id);
    while (stack.length > 0) {
      const cur = stack.pop();
      if (cur === undefined) break;
      group.push(cur);
      for (const edge of adj.out.get(cur) ?? []) {
        const to = otherEnd(edge, cur);
        if (!seen.has(to)) {
          seen.add(to);
          stack.push(to);
        }
      }
    }
    out.push(group);
  }
  return out;
}

/**
 * Nodes within `hops` of the roots (at most `cap`, roots first). Nodes for which `stop`
 * returns true are included but not expanded — use it to keep hubs from flooding the view.
 */
export function neighbourhood(
  adj: Adjacency,
  roots: readonly string[],
  hops: number,
  cap: number,
  stop: (id: string) => boolean = () => false,
): Map<string, number> {
  const depth = new Map<string, number>(roots.map((r) => [r, 0]));
  let frontier = [...roots];
  for (let d = 1; d <= hops && frontier.length > 0; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      if (d > 1 && stop(id)) continue;
      for (const edge of adj.out.get(id) ?? []) {
        const to = otherEnd(edge, id);
        if (depth.has(to)) continue;
        if (depth.size >= cap) return depth;
        depth.set(to, d);
        next.push(to);
      }
    }
    frontier = next;
  }
  return depth;
}
