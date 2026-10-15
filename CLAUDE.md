# Fund Tracker — Engineering Instructions

Monorepo: **React + Vite web UI** (`web/`), **Firebase Cloud Functions** backend (`functions/`),
shared **zod** schemas/types (`packages/shared/`). Data in **Firestore**; AI via **Gemini on
Vertex AI**; hosted on **Firebase Hosting**. Language: **TypeScript only**.

## Web prototype layout (FundTrace AI)

- **For any web UI task, load the `fundtrace-ui` skill first** (`.claude/skills/fundtrace-ui/SKILL.md`): code map, grep anchors and recipes so you don't read large files.

- Spec: `docs/fundtrace-ai-ui-spec.md` is the source of truth for UI behaviour and wording.
- `web/src/domain/` zod schemas + labels · `web/src/lib/` pure logic (checks, monitoring, graph, CSV, formatting) ·
  `web/src/state/` store, actions (every mutation writes an audit entry), session, toasts · `web/src/components/` UI ·
  `web/src/pages/` routes (lazy-loaded) · `web/src/demo/` synthetic seed data and sample documents.
- Never present simulated output as real OCR/AI; keep "Simulated demo output" / "Not connected" labels until an integration exists.
- Use status wording from `domain/labels.ts` (Routine review / Needs attention / Urgent review); never "fraud confirmed".
- Tailwind tokens live in `web/src/styles.css`; pair every status colour with an icon and text.
- Don't combine `hidden` with a component whose base class sets `display` (e.g. buttons) — wrap it in an element instead.

## Definition of done (run before every commit)

`npm run check && npm run build` must pass: prettier, eslint (`--max-warnings 0`), `tsc`, tests.
CI enforces the same. Never bypass with `--no-verify`, `@ts-ignore`, or `eslint-disable`
(use `@ts-expect-error`/disable with a one-line justification only when truly unavoidable).

## TypeScript standards

- `strict` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` — see `tsconfig.base.json`. Do not weaken.
- No `any`, no `!` non-null assertions, no `enum` (use union types / `as const`), no default exports (except where a tool requires it).
- Explicit return types on all functions. `import type` for type-only imports.
- Parse, don't cast: all external data (HTTP/callable input, Firestore reads, Gemini output, env, `localStorage`) is `unknown` until validated by a **zod** schema from `packages/shared`. No `as` casts on untrusted data.
- `catch (e)` is `unknown`: narrow before use. Preserve causes (`new Error(msg, { cause })`). Never swallow errors silently.
- Single source of truth for types: define schema in `packages/shared`, infer the type with `z.infer`. Never duplicate types across web and functions.
- Prefer small pure functions, immutability, early returns. Max ~40 lines/function; no file over ~300 lines.
- No `console.log` (lint-enforced). Use `firebase-functions/logger` in functions with structured fields; never log PII, tokens, or full prompts/responses.
- Async: every promise is awaited or explicitly handled (`no-floating-promises`). Bound every external call with a timeout.

## Architecture rules

- `web` never touches Gemini/Vertex directly. All AI calls go through a callable function. Vertex uses Application Default Credentials — **no API keys in code or in the web bundle**.
- Functions layout: `callable/` (thin: auth + validate + delegate) → `services/` (logic, external APIs) → `config/` (env). Handlers hold no business logic.
- Every callable: (1) check `request.auth`, (2) validate input with zod, (3) authorize ownership of the resource, (4) act, (5) return a zod-typed result. Enable App Check (`enforceAppCheck: true`).
- Env/config is read only via `functions/src/config/env.ts` (validated once). Secrets use Firebase/Secret Manager (`defineSecret`), never committed. `.env*` is gitignored.
- Firestore: security rules are **default-deny**; every new collection needs an explicit rule **and** an emulator rules test. Add composite indexes to `firestore.indexes.json` with the query that needs them.
- Prefer converters/typed accessors for Firestore so reads are zod-validated at the boundary.
- Dependencies: add sparingly, pin via lockfile (`npm ci` in CI), justify heavy ones in the PR.

## Money & data rules

- Money is **integer minor units + ISO-4217 currency** (`Money` in shared). Never floating-point amounts. Use `addMoney` etc.; never add raw numbers across currencies.
- Timestamps: store UTC ISO-8601 strings/Firestore `Timestamp`; format to local time only in the UI.
- Deletes are soft-delete (`deletedAt`) for financial records. Ledger entries are append-only; corrections are new compensating entries.

## UI / design standards

- Accessibility is required (WCAG 2.2 AA): semantic HTML, labelled inputs, keyboard operable, visible focus, colour contrast ≥ 4.5:1, never colour-only meaning, respect `prefers-reduced-motion`, support dark mode.
- Mobile-first responsive layout; test at 360px width. No horizontal scroll.
- Every async view has **loading, empty, error, and success** states. Errors are user-readable with a retry; never show raw error text or stack traces.
- Forms: validate with the shared zod schema (same rules as server), disable submit while pending (prevents double-submit), show inline field errors.
- Display money with `Intl.NumberFormat` from minor units; right-align numerals, use tabular figures.
- Use design tokens (CSS variables) for colour/spacing/typography — no hard-coded one-off values. Keep one consistent component for each pattern (button, input, dialog).
- Components: function components + hooks, one component per file, props typed, no business logic in JSX.

## Testing

- Unit tests (vitest) next to source as `*.test.ts`. Every bug fix gets a regression test. Every boundary condition in `docs/BOUNDARY_CONDITIONS.md` that you touch needs a test (empty, max, overflow, malformed, unauthorized).
- Firestore rules and callables are tested against the Firebase emulator (`npm run emulators`).
- Mock Gemini in tests; never call real Vertex AI from tests.

## Security

- Treat Gemini output and all user text as untrusted: validate structurally, escape on render (React escapes by default — never use `dangerouslySetInnerHTML`).
- Prompt-injection: user content goes in clearly delimited data sections; model output must never be able to trigger writes without schema validation and an ownership check.
- Least privilege: functions' service account gets only the roles it needs (e.g. `roles/aiplatform.user`, Firestore access).

## BOUNDARY CONDITIONS — MUST ALERT THE USER

**Read `docs/BOUNDARY_CONDITIONS.md` before implementing any feature.** While implementing, if
the work touches any item there (money, auth, Firestore limits, Gemini limits, concurrency,
deploy/cost), you MUST explicitly call it out to the user in your reply — name the condition ID
(e.g. "B-01"), state how it is handled, and ask when a decision is needed. If you discover a new
boundary condition, add it to that file in the same change and tell the user.
Do not silently pick a behaviour for ambiguous edge cases — ask.

## Git workflow

- Branch per change; small focused commits in imperative mood. Don't commit to `main` directly once CI is set up; open a PR.
- Never commit secrets, service-account JSON, or `.env` files.
