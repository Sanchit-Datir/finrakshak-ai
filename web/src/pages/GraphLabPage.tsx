import type { GraphLabBundle, GraphLabIndexEntry, GraphNode } from '@fund-tracker/shared';
import { FlaskConical, Network } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { BundleSource } from '../components/graph-lab/BundleSource.js';
import { ExplorePanel } from '../components/graph-lab/ExplorePanel.js';
import { IdentityPanel } from '../components/graph-lab/IdentityPanel.js';
import { NetworksPanel } from '../components/graph-lab/NetworksPanel.js';
import { PathFinder } from '../components/graph-lab/PathFinder.js';
import { Badge } from '../components/ui/Badge.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { EmptyState, ErrorState, Notice, Skeleton } from '../components/ui/States.js';
import { Tabs } from '../components/ui/Tabs.js';
import {
  fetchIndex,
  indexBundle,
  isOrganisation,
  loadBundleFromFile,
  loadBundleFromUrl,
} from '../lib/graph-lab.js';

type Tab = 'explore' | 'networks' | 'paths' | 'identity';
type Load =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error'; message: string; source: string | File }
  | { status: 'ready'; bundle: GraphLabBundle };

const message = (e: unknown): string => (e instanceof Error ? e.message : 'Unexpected error.');

/** Best-connected non-hub organisation of the top network: a readable default focus. */
function defaultFocus(b: GraphLabBundle): string | null {
  const byId = new Map(b.nodes.map((n) => [n.id, n]));
  const orgs = (b.networks[0]?.node_ids ?? [])
    .map((id) => byId.get(id))
    .filter((n): n is GraphNode => n !== undefined && isOrganisation(n));
  const best = [...orgs].sort((x, y) => Number(x.hub) - Number(y.hub) || y.degree - x.degree)[0];
  return best?.id ?? null;
}

export function GraphLabPage(): React.JSX.Element {
  const [entries, setEntries] = useState<GraphLabIndexEntry[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [tab, setTab] = useState<Tab>('explore');
  const [focus, setFocus] = useState<string | null>(null);

  const open = (source: string | File): void => {
    setCurrent(typeof source === 'string' ? source : null);
    setLoad({ status: 'loading' });
    const pending =
      typeof source === 'string' ? loadBundleFromUrl(source) : loadBundleFromFile(source);
    pending.then(
      (bundle) => {
        setLoad({ status: 'ready', bundle });
        setFocus(defaultFocus(bundle));
        setTab('explore');
      },
      (e: unknown) => {
        setLoad({ status: 'error', message: message(e), source });
      },
    );
  };

  // On mount: read the published index and open the first real-data bundle.
  useEffect(() => {
    const ctrl = new AbortController();
    // A call (not a property read) so TypeScript re-checks it after each await.
    const stopped = (): boolean => ctrl.signal.aborted;
    const boot = async (): Promise<void> => {
      const list = await fetchIndex().catch(() => null);
      if (stopped()) return;
      const first = list?.find((e) => !e.synthetic) ?? list?.[0];
      setEntries(list ?? []);
      if (first === undefined) {
        setLoad({ status: 'empty' });
        return;
      }
      setCurrent(first.file);
      try {
        const bundle = await loadBundleFromUrl(first.file);
        if (stopped()) return;
        setLoad({ status: 'ready', bundle });
        setFocus(defaultFocus(bundle));
      } catch (e) {
        if (!stopped()) setLoad({ status: 'error', message: message(e), source: first.file });
      }
    };
    void boot();
    return () => {
      ctrl.abort();
    };
  }, []);

  const ix = useMemo(() => (load.status === 'ready' ? indexBundle(load.bundle) : null), [load]);
  const explore = (id: string): void => {
    setFocus(id);
    setTab('explore');
  };

  return (
    <div className="space-y-4">
      <PageHeader
        docTitle="Graph lab"
        title="Graph lab"
        subtitle="Exploratory relationship discovery over collected public records (local prototype)."
        badge={
          <Badge tone="violet" icon={FlaskConical}>
            Prototype · local data
          </Badge>
        }
      />
      <BundleSource
        entries={entries}
        current={current}
        onChoose={open}
        onFile={open}
        disabled={load.status === 'loading'}
      />
      {load.status === 'loading' && (
        <div className="space-y-2" aria-busy="true" aria-live="polite">
          <p className="text-muted text-sm">Loading graph… large bundles can take a few seconds.</p>
          <Skeleton className="h-[460px] w-full" />
        </div>
      )}
      {load.status === 'error' && (
        <ErrorState
          title="Could not load the graph"
          onRetry={() => {
            open(load.source);
          }}
        >
          {load.message}
        </ErrorState>
      )}
      {load.status === 'empty' && (
        <EmptyState icon={Network} title="No graph published yet">
          Run <code>node ingest/dist/graphCli.js --web</code> to publish <code>data/graph</code> to
          this page, or open a bundle file (for example{' '}
          <code>data/graph/test-data/seed-dhfl.json</code>).
        </EmptyState>
      )}
      {load.status === 'ready' && ix !== null && (
        <>
          {load.bundle.meta.synthetic ? (
            <Notice tone="warn" title="SYNTHETIC TEST DATA — not real organisations or findings">
              <ul className="list-disc pl-5">
                {load.bundle.meta.notes
                  .filter((n) => /^S\d/.test(n))
                  .map((n) => (
                    <li key={n}>{n}</li>
                  ))}
              </ul>
            </Notice>
          ) : (
            <Notice title="Real public records — exploratory leads only">
              Unlike the rest of this prototype (whose footer says all records are synthetic), this
              page reads the collected public-source dataset in <code>data/graph</code>.{' '}
              {load.bundle.meta.label}: {load.bundle.nodes.length.toLocaleString()} nodes,{' '}
              {load.bundle.edges.length.toLocaleString()} links,{' '}
              {load.bundle.networks.length.toLocaleString()} networks · graph built{' '}
              {load.bundle.meta.generated_at.slice(0, 10)} from data built{' '}
              {load.bundle.meta.dataset_built_at?.slice(0, 10) ?? 'unknown'}. Check each link
              against its source document before relying on it.
            </Notice>
          )}
          <Tabs
            label="Graph lab views"
            value={tab}
            onChange={setTab}
            tabs={[
              { key: 'explore', label: 'Explore' },
              { key: 'networks', label: 'Networks', count: load.bundle.networks.length },
              { key: 'paths', label: 'Path finder' },
              { key: 'identity', label: 'Identity review', count: load.bundle.identity.length },
            ]}
          >
            {tab === 'explore' && <ExplorePanel ix={ix} focus={focus} onFocus={setFocus} />}
            {tab === 'networks' && <NetworksPanel ix={ix} onExplore={explore} />}
            {tab === 'paths' && <PathFinder ix={ix} onExplore={explore} />}
            {tab === 'identity' && <IdentityPanel ix={ix} onExplore={explore} />}
          </Tabs>
        </>
      )}
    </div>
  );
}
