# Contributing to FinRakshak AI

Thank you for helping. This page is the short version; [`CLAUDE.md`](CLAUDE.md) holds the full
engineering standards and applies to people and AI agents alike.

## Set up

```bash
nvm use        # Node 22
npm ci
npm run check  # prettier, eslint (0 warnings), tsc, unit tests
npm run build
```

Optional: `npm run test:emulators` (Java 21) for Firestore rules, `npm run e2e` and
`npm run test:e2e` for browser tests.

## Workflow

1. Branch from `main`. Keep commits small and focused, in the imperative mood ("Add …", "Fix …").
2. Run `npm run check && npm run build` before every commit. Never bypass it (`--no-verify`,
   `@ts-ignore`, `eslint-disable`).
3. Open a pull request with the template. Merge `main` into your branch before merging (the
   `Up to date with main` check enforces it).

## Rules that reviewers check

- **Types:** strict TypeScript; no `any`, `!`, `enum` or default exports; explicit return types;
  external data is `unknown` until a zod schema from `packages/shared` parses it.
- **Structure:** one component per file; pure logic in `web/src/lib/` with a `*.test.ts` next to it;
  mutations only through `web/src/state/actions/` (each writes an audit entry); callables stay thin
  (auth → validate → authorise → service → typed result).
- **Money and time:** integer paise plus a currency code; UTC ISO-8601 timestamps; IST days.
- **AI:** the browser never calls Gemini; every AI path has a mock provider (the default in tests,
  CI and the emulator), delimited user data, code verification of the model's output and a daily
  limit. Never call a billed model from a test.
- **Wording:** findings are leads (Routine review / Needs attention / Urgent review), never verdicts.
- **Accessibility:** WCAG 2.2 AA, keyboard operable, works at 360 px with no horizontal scroll, dark
  mode, status colours always paired with an icon and text.
- **Tests:** a regression test for every bug fix; an emulator test for every new Firestore rule; a
  test for every boundary condition you touch.
- **Boundary conditions:** read [`docs/BOUNDARY_CONDITIONS.md`](docs/BOUNDARY_CONDITIONS.md) and
  name each one your change touches (e.g. B-01) in the PR.
- **Data:** never change `data/raw`, `data/processed` or `data/registry` by hand.

## Security

Report vulnerabilities privately to the repository owner (see [`SECURITY.md`](SECURITY.md)). Never
commit secrets, service-account JSON or `.env` files.
