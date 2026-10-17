import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { dataKey } from '../config.js';
import { blobs } from '../storage/index.js';
import { parseDate } from '../util/dates.js';
import { normalizeCompanyName } from '../resolve/names.js';

/**
 * MCA "RoC-wise Company Master Data" from data.gov.in. Automated download is
 * disallowed by robots.txt, so a person downloads the CSV(s) (or uses the OGD API
 * with their key) into data/raw/mca_ogd/. Header names vary between releases.
 */
export interface McaCompany {
  readonly cin: string;
  readonly name: string;
  readonly status: string | null;
  readonly company_class: string | null;
  readonly incorporation_date: string | null;
  readonly state: string | null;
  readonly activity: string | null;
  readonly address: string | null;
}

const COLUMNS: Readonly<Record<keyof McaCompany, readonly string[]>> = {
  cin: ['corporate_identification_number', 'cin', 'company_cin'],
  name: ['company_name', 'name'],
  status: ['company_status', 'status'],
  company_class: ['company_class', 'class'],
  incorporation_date: [
    'date_of_registration',
    'date_of_incorporation',
    'company_registration_date',
    'company_registration_date_date',
    'registration_date',
  ],
  state: ['registered_state', 'company_state_code', 'state'],
  activity: [
    'principal_business_activity_as_per_cin',
    'principal_business_activity',
    'company_industrial_classification',
    'industrial_class',
  ],
  address: ['registered_office_address', 'registered_office_addr', 'address'],
};

/** RFC-4180-style split of one CSV record. */
export function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted && ch === '"' && line[i + 1] === '"') {
      cur += '"';
      i++;
    } else if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) {
      out.push(cur);
      cur = '';
    } else cur += ch ?? '';
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

function columnIndex(header: readonly string[]): Map<keyof McaCompany, number> {
  // Compare letters/digits only: "CompanyName", "COMPANY_NAME" and "company name" all match.
  const key = (h: string): string => h.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const norm = header.map(key);
  const idx = new Map<keyof McaCompany, number>();
  for (const [field, names] of Object.entries(COLUMNS) as [keyof McaCompany, readonly string[]][]) {
    const i = names.map((n) => norm.indexOf(key(n))).find((x) => x >= 0);
    if (i !== undefined) idx.set(field, i);
  }
  return idx;
}

function toCompany(
  cells: readonly string[],
  idx: ReadonlyMap<keyof McaCompany, number>,
): McaCompany | null {
  const get = (f: keyof McaCompany): string | null => {
    const i = idx.get(f);
    const v = i === undefined ? '' : (cells[i] ?? '');
    return v.length > 0 && v.toUpperCase() !== 'NA' ? v : null;
  };
  const cin = get('cin');
  const name = get('name');
  if (!cin || !name) return null;
  const date = get('incorporation_date');
  return {
    cin: cin.toUpperCase(),
    name,
    status: get('status'),
    company_class: get('company_class'),
    incorporation_date: date ? parseDate(date) : null,
    state: get('state'),
    activity: get('activity'),
    address: get('address'),
  };
}

export interface McaIndex {
  readonly files: string[];
  readonly rows: number;
  readonly byCin: Map<string, McaCompany>;
  readonly byName: Map<string, McaCompany[]>;
}

/** CSV parts under `raw/mca_ogd/` (on disk, or uploaded by the owner to the state bucket). */
async function csvFiles(): Promise<string[]> {
  return (await blobs().list(dataKey('raw', 'mca_ogd')))
    .map((info) => info.key)
    .filter((key) => key.toLowerCase().endsWith('.csv'));
}

async function csvLines(key: string): Promise<AsyncIterable<string>> {
  const blob = await blobs().read(key);
  if (!blob) throw new Error(`MCA file disappeared: ${key}`);
  return createInterface({
    input: Readable.from([blob.data.toString('utf8')]),
    crlfDelay: Infinity,
  });
}

/** Streams every CSV, keeping only companies whose CIN or normalised name is wanted. */
export async function loadMcaMaster(
  wantNames: ReadonlySet<string>,
  wantCins: ReadonlySet<string>,
): Promise<McaIndex> {
  const files = await csvFiles();
  const byCin = new Map<string, McaCompany>();
  const byName = new Map<string, McaCompany[]>();
  let rows = 0;
  for (const file of files) {
    let idx: Map<keyof McaCompany, number> | null = null;
    let pending = '';
    for await (const line of await csvLines(file)) {
      pending = pending ? `${pending}\n${line}` : line;
      if ((pending.match(/"/g)?.length ?? 0) % 2 === 1) continue; // quoted newline: keep reading
      const cells = splitCsv(pending.replace(/^\uFEFF/, ''));
      pending = '';
      if (!idx) {
        idx = columnIndex(cells);
        continue;
      }
      const company = toCompany(cells, idx);
      if (!company) continue;
      rows++;
      const key = normalizeCompanyName(company.name);
      if (wantCins.has(company.cin)) byCin.set(company.cin, company);
      // The same company can appear twice (e.g. split parts next to the unsplit file): keep one per CIN.
      const sameName = byName.get(key) ?? [];
      if (wantNames.has(key) && !sameName.some((c) => c.cin === company.cin))
        byName.set(key, [...sameName, company]);
    }
  }
  return { files, rows, byCin, byName };
}
