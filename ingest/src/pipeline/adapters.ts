import type { SourceId } from '@finrakshak-ai/shared';
import { edAdapter } from '../sources/ed.js';
import { ibbiAdapter } from '../sources/ibbi.js';
import { nfraAdapter } from '../sources/nfra.js';
import { rbiAdapter } from '../sources/rbi.js';
import { sebiAdapter } from '../sources/sebi.js';
import { sfioAdapter } from '../sources/sfio.js';
import type { SourceAdapter } from '../sources/types.js';

/** Every automated source. Adding a source = one adapter here (see sources/types.ts). */
export const ADAPTERS: ReadonlyMap<SourceId, SourceAdapter> = new Map(
  [nfraAdapter, sfioAdapter, edAdapter, sebiAdapter, ibbiAdapter, rbiAdapter].map((a) => [a.id, a]),
);

export const AUTOMATED_SOURCES: readonly SourceId[] = [...ADAPTERS.keys()];

export function adapterFor(id: SourceId): SourceAdapter {
  const adapter = ADAPTERS.get(id);
  if (!adapter) throw new Error(`No automated adapter for ${id} (see data/registry/sources.json)`);
  return adapter;
}
