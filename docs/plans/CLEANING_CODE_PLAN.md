# Cleaning-code plan (branch `cleaning-code`, from `main`, 18 Oct 2026)

Goal: make the repository read as a complete, technically sound submission for the judging criteria
(Technical merit and Gen AI 40%, user experience and solution design 10%), without changing what the
app does. Every step keeps `npm run check && npm run build` green.

## Baseline (measured before any change)

- `npm ci`, `npm run check`, `npm run build` pass on `main` (6820749).
- ESLint skips every `lib/` folder (`**/lib/**`), which was meant for the functions build output but
  also skips `web/src/lib/` (the app's core logic): 20 hidden lint errors there.
- 22 web files are over the ~300-line limit in CLAUDE.md (largest: `demo/seed.ts` 2,266 lines,
  `state/actions.ts` 948, `pages/ApplicationDetailPage.tsx` 907, `pages/CaseDetailPage.tsx` 833).
- The README still says Gemini is "not connected", although the Copilot, the application analysis
  and the AI investigator are built on Vertex AI.
- No `LICENSE`, `CONTRIBUTING.md`, PR template, docs index or Gen AI overview.

## Steps

| #   | Step                                                                                                                                                                                                                                                                                                             | Status |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | **Lint gap:** ESLint ignores only build output (`functions/lib/**`, `dist/`), so `web/src/lib/` is linted; fix the hidden errors.                                                                                                                                                                                | todo   |
| 2   | **Split oversized files** (behaviour unchanged, public imports kept through barrel files): `state/actions.ts` → `state/actions/`, `lib/checks.ts` → `lib/checks/`, `domain/schemas.ts` → `domain/schemas/`, `demo/seed.ts` → `demo/seed/`, page tab bodies and dialogs → `components/<area>/`, large components. | todo   |
| 3   | **Benchmarks:** a reproducible `npm run bench` (Vitest bench) for the deterministic engines (checks, monitoring, grounding check, attention score) and results in `docs/BENCHMARKS.md`, with the test counts, build sizes and the risk-scoring replay numbers already measured in `docs/RISK_SCORING.md`.        | todo   |
| 4   | **Screenshots** of the prototype (desktop and 360 px) with Playwright, in `docs/images/`, used as the wireframes/mock-ups.                                                                                                                                                                                       | todo   |
| 5   | **Docs:** `docs/GEN_AI.md` (every Gen AI feature, what the model does, what code verifies, limits, tests), `docs/ARCHITECTURE.md` updated (diagrams, scalability), `docs/README.md` index.                                                                                                                       | todo   |
| 6   | **README** rewritten in sections: title and tagline, description, opportunity (how it differs, how it solves the problem, USP), features, process flow and use-case diagrams, mock-ups, architecture, tech stack, prerequisites and installation, usage, cost, benchmarks, future work, contributing, license.   | todo   |
| 7   | **Repo hygiene:** `LICENSE`, `CONTRIBUTING.md`, `.github/pull_request_template.md`.                                                                                                                                                                                                                              | todo   |
| 8   | **Verify:** `npm run check && npm run build`, `npm run e2e`, `npm run test:e2e`; update `docs/SESSION_NOTES.md`.                                                                                                                                                                                                 | todo   |

## Out of scope

- No change to app behaviour, wording, data in `data/raw`, `data/processed` or `data/registry`, Firestore
  rules, callables' contracts or cloud resources.
- No new runtime dependency.
