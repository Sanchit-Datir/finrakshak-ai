import { z } from 'zod';

export interface BqField {
  readonly name: string;
  readonly type: 'STRING' | 'INT64' | 'FLOAT64' | 'BOOL' | 'DATE' | 'TIMESTAMP' | 'JSON' | 'RECORD';
  readonly mode: 'NULLABLE' | 'REQUIRED' | 'REPEATED';
  readonly fields?: BqField[];
}

type Leaf = Omit<BqField, 'name' | 'mode'>;

export interface BqSchemaOptions {
  /**
   * Keep dates and timestamps as STRING columns, so rows read back are byte-identical to the files they
   * were loaded from (the synthetic input tables, which are parsed again with zod on the way out).
   */
  readonly temporalAsString?: boolean;
}

function unwrap(t: z.ZodTypeAny): { inner: z.ZodTypeAny; nullable: boolean } {
  if (t instanceof z.ZodNullable || t instanceof z.ZodOptional) {
    return { inner: unwrap(t.unwrap() as z.ZodTypeAny).inner, nullable: true };
  }
  // A refinement checks values, not the column type.
  if (t instanceof z.ZodEffects) return unwrap(t.innerType() as z.ZodTypeAny);
  return { inner: t, nullable: false };
}

function literalType(name: string, value: unknown): Leaf {
  if (typeof value === 'boolean') return { type: 'BOOL' };
  if (typeof value === 'string') return { type: 'STRING' };
  if (typeof value === 'number') return { type: Number.isInteger(value) ? 'INT64' : 'FLOAT64' };
  throw new Error(`No BigQuery mapping for literal field ${name}`);
}

function leafType(name: string, t: z.ZodTypeAny, opts: BqSchemaOptions): Leaf {
  if (t instanceof z.ZodString) {
    if (opts.temporalAsString === true) return { type: 'STRING' };
    const kinds = t._def.checks.map((c) => c.kind);
    if (kinds.includes('date')) return { type: 'DATE' };
    if (kinds.includes('datetime')) return { type: 'TIMESTAMP' };
    return { type: 'STRING' };
  }
  if (t instanceof z.ZodEnum) return { type: 'STRING' };
  if (t instanceof z.ZodLiteral) return literalType(name, t.value);
  if (t instanceof z.ZodBoolean) return { type: 'BOOL' };
  if (t instanceof z.ZodNumber) return { type: t.isInt ? 'INT64' : 'FLOAT64' };
  if (t instanceof z.ZodRecord) return { type: 'JSON' };
  if (t instanceof z.ZodObject)
    return { type: 'RECORD', fields: bigQuerySchema(t as z.AnyZodObject, opts) };
  throw new Error(`No BigQuery mapping for field ${name}`);
}

/** Derives a BigQuery table schema from the shared zod schema (single source of truth). */
export function bigQuerySchema(schema: z.AnyZodObject, opts: BqSchemaOptions = {}): BqField[] {
  return Object.entries(schema.shape as Record<string, z.ZodTypeAny>).map(([name, field]) => {
    const { inner, nullable } = unwrap(field);
    if (inner instanceof z.ZodArray) {
      return {
        name,
        mode: 'REPEATED',
        ...leafType(name, unwrap(inner.element as z.ZodTypeAny).inner, opts),
      };
    }
    return { name, mode: nullable ? 'NULLABLE' : 'REQUIRED', ...leafType(name, inner, opts) };
  });
}
