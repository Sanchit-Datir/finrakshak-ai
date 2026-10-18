import { z } from 'zod';
import {
  TransactionTypeSchema,
  type Db,
  type Entity,
  type Transaction,
} from '../domain/schemas.js';
import { parseRupeesToMinor } from './format.js';

/** Parses an authorised transaction extract (CSV). Every row is validated; invalid rows are reported, never silently dropped. */

export const CSV_COLUMNS = [
  'transaction_id',
  'loan_id',
  'datetime',
  'from_account',
  'to_account',
  'amount_inr',
  'type',
  'reference',
] as const;

export const CSV_TEMPLATE = [
  CSV_COLUMNS.join(','),
  'T-9001,L-2026-0109,2026-09-02T10:15:00+05:30,a-dnyaneshwar,Shirur Krushi Godown,45000,neft,Storage charges',
  'T-9002,L-2026-0109,2026-09-05T12:40:00+05:30,a-dnyaneshwar,x-cash,20000,cash_withdrawal,Counter withdrawal',
].join('\r\n');

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src.charAt(i);
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

const RowSchema = z.object({
  transaction_id: z.string().trim().min(1, 'transaction_id is required'),
  loan_id: z.string().trim(),
  datetime: z
    .string()
    .trim()
    .refine(
      (v) => !Number.isNaN(new Date(v).getTime()),
      'datetime must be ISO-8601, e.g. 2026-09-02T10:15:00+05:30',
    ),
  from_account: z.string().trim().min(1, 'from_account is required'),
  to_account: z.string().trim().min(1, 'to_account is required'),
  amount_inr: z.string().trim(),
  type: TransactionTypeSchema,
  reference: z.string().trim(),
});

export interface ImportResult {
  rows: Transaction[];
  newEntities: Entity[];
  errors: { line: number; message: string }[];
  duplicates: number;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

export function importCsv(text: string, db: Db): ImportResult {
  const table = parseCsv(text);
  const header = (table[0] ?? []).map((h) => h.trim().toLowerCase());
  const missing = CSV_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length > 0)
    return {
      rows: [],
      newEntities: [],
      errors: [
        {
          line: 1,
          message: `Missing column(s): ${missing.join(', ')}. Download the template for the expected format.`,
        },
      ],
      duplicates: 0,
    };
  const known = new Map(db.entities.map((e) => [e.id, e]));
  const byName = new Map(db.entities.map((e) => [e.name.toLowerCase(), e]));
  const loans = new Set(db.loans.map((l) => l.id));
  const seen = new Set(db.transactions.map((t) => t.id));
  const created = new Map<string, Entity>();
  const out: ImportResult = { rows: [], newEntities: [], errors: [], duplicates: 0 };
  const resolve = (ref: string): string => {
    const hit = known.get(ref) ?? byName.get(ref.toLowerCase());
    if (hit !== undefined) return hit.id;
    const id = `imp-${slug(ref)}`;
    if (!created.has(id))
      created.set(id, {
        id,
        kind: 'counterparty',
        name: ref,
        subtitle: 'Counterparty from imported file (unverified)',
        ownerId: null,
        borrowerId: null,
      });
    return id;
  };
  table.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const raw = Object.fromEntries(CSV_COLUMNS.map((c) => [c, cells[header.indexOf(c)] ?? '']));
    const parsed = RowSchema.safeParse(raw);
    if (!parsed.success) {
      out.errors.push({
        line,
        message: parsed.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; '),
      });
      return;
    }
    const r = parsed.data;
    const amount = parseRupeesToMinor(r.amount_inr);
    if (amount === null || amount <= 0) {
      out.errors.push({
        line,
        message: 'amount_inr must be a positive rupee amount with at most 2 decimals',
      });
      return;
    }
    if (r.loan_id !== '' && !loans.has(r.loan_id)) {
      out.errors.push({ line, message: `loan_id ${r.loan_id} is not a monitored loan` });
      return;
    }
    if (seen.has(r.transaction_id)) {
      out.duplicates += 1;
      return;
    }
    seen.add(r.transaction_id);
    out.rows.push({
      id: r.transaction_id,
      loanId: r.loan_id === '' ? null : r.loan_id,
      at: new Date(r.datetime).toISOString(),
      fromId: resolve(r.from_account),
      toId: resolve(r.to_account),
      amountMinor: amount,
      type: r.type,
      reference: r.reference,
      source: 'import',
    });
  });
  out.newEntities = [...created.values()];
  return out;
}
