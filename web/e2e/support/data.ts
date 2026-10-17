import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/**
 * Test data lives in JSON so new scenarios can be added without touching code.
 * Every file is parsed with a zod schema: a typo in the JSON fails fast with a
 * readable message instead of producing a confusing UI failure.
 */

const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');

const RoleSchema = z.enum([
  'branch_officer',
  'branch_manager',
  'risk_analyst',
  'investigator',
  'administrator',
]);
export type Role = z.infer<typeof RoleSchema>;

/** One form input, located by its visible label (the same text a user reads). */
const FieldInputSchema = z.union([
  z.object({ label: z.string().min(1), fill: z.string() }).strict(),
  z.object({ label: z.string().min(1), select: z.string().min(1) }).strict(),
  z.object({ label: z.string().min(1), check: z.boolean() }).strict(),
]);
export type FieldInput = z.infer<typeof FieldInputSchema>;

const LoginDataSchema = z
  .object({
    formCases: z.array(
      z
        .object({
          name: z.string().min(1),
          userId: z.string(),
          password: z.string(),
          expectErrors: z.array(z.string()),
          expectNotConnectedNotice: z.boolean(),
        })
        .strict(),
    ),
    demoRoles: z.array(z.object({ role: RoleSchema, expectName: z.string().min(1) }).strict()),
  })
  .strict();
export type LoginData = z.infer<typeof LoginDataSchema>;

const ApplicationCaseSchema = z
  .object({
    name: z.string().min(1),
    role: RoleSchema,
    /** Inputs for step 3 "Review application", applied in order. */
    review: z.array(FieldInputSchema),
    expect: z.discriminatedUnion('outcome', [
      z.object({ outcome: z.literal('submitted') }).strict(),
      z
        .object({ outcome: z.literal('blocked'), errors: z.array(z.string().min(1)).min(1) })
        .strict(),
    ]),
  })
  .strict();
export type ApplicationCase = z.infer<typeof ApplicationCaseSchema>;

function load<T>(envVar: string, fallback: string, schema: z.ZodType<T>): T {
  const file = process.env[envVar] ?? path.join(DATA_DIR, fallback);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`Could not read test data file ${file}`, { cause: e });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid test data in ${file}:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

export function loadLoginData(): LoginData {
  return load('E2E_LOGIN_DATA', 'login.json', LoginDataSchema);
}

export function loadApplicationCases(): ApplicationCase[] {
  return load('E2E_APPLICATIONS_DATA', 'applications.json', z.array(ApplicationCaseSchema));
}
