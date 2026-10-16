import { createReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { dataPath } from '../config.js';
import { isNotFound } from '../store/jsonl.js';
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
  const norm = header.map((h) =>
    h
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, ''),
  );
  const idx = new Map<keyof McaCompany, number>();
  for (const [field, names] of Object.entries(COLUMNS) as [keyof McaCompany, readonly string[]][]) {
    const i = names.map((n) => norm.indexOf(n)).find((x) => x >= 0);
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

async function csvFiles(): Promise<string[]> {
  try {
    const dir = dataPath('raw', 'mca_ogd');
    return (await readdir(dir))
      .filter((f) => f.toLowerCase().endsWith('.csv'))
      .map((f) => path.join(dir, f));
  } catch (e) {
    if (isNotFound(e)) return [];
    throw e;
  }
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
    for await (const line of createInterface({
      input: createReadStream(file, 'utf8'),
      crlfDelay: Infinity,
    })) {
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
      if (wantNames.has(key)) byName.set(key, [...(byName.get(key) ?? []), company]);
    }
  }
  return { files, rows, byCin, byName };
}
