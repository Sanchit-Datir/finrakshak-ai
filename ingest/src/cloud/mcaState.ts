import { z } from 'zod';
import { dataKey } from '../config.js';
import { blobs } from '../storage/index.js';
import { readJson, writeJson } from '../store/jsonl.js';

const McaFingerprintSchema = z.object({
  files: z.array(z.object({ key: z.string(), generation: z.string(), size: z.number().int() })),
});
type McaFingerprint = z.infer<typeof McaFingerprintSchema>;

const fingerprintKey = dataKey('interim', 'state', 'mca_ogd.json');

async function current(): Promise<McaFingerprint> {
  const files = (await blobs().list(dataKey('raw', 'mca_ogd')))
    .filter((b) => b.key.toLowerCase().endsWith('.csv'))
    .map((b) => ({ key: b.key, generation: b.generation, size: b.size }));
  return { files };
}

/**
 * The MCA master is uploaded by hand (robots.txt forbids crawling). A new or replaced CSV part
 * changes its generation, which triggers a rebuild on the next run; no event plumbing is needed.
 */
export async function mcaChanged(): Promise<{ changed: boolean; commit: () => Promise<void> }> {
  const now = await current();
  const before = await readJson(fingerprintKey, McaFingerprintSchema);
  const changed = JSON.stringify(before?.files ?? []) !== JSON.stringify(now.files);
  return {
    changed,
    commit: async () => {
      await writeJson(fingerprintKey, now);
    },
  };
}
