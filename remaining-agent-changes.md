# Remaining agent changes (pattern miner + risk explainer)

Branch: `pattern-miner-risk-explainer-agent` (from `main` at `ac5dae4`). Purpose of both agents is taken
only from the repo docs: `docs/plans/AGENTS_PLAN.md`, `docs/plans/PATTERN_MINER_PLAN.md`,
`docs/plans/RISK_EXPLAINER_PLAN.md`, `docs/plans/PATTERN_CONTRACT.md`. This file is updated at every
checkpoint commit; delete it once everything below is done.

_Last checkpoint: 1 (shared loop, run records, miner agent core)._

## Done so far

- [x] Shared schemas: `agentRuns` envelope (`packages/shared/src/ingest/agentRuns.ts`), `decidePattern`
      input and library constants (`risk/patterns/decision.ts`), risk explanation doc
      (`risk/scoring/explanation.ts`); `GetRiskScoresResult.explanations` (optional, default `[]`).
- [x] Step 14a: edge-case tests for the ingestion agent's loop (`agent/supervisor.test.ts`). **Bug found and
      fixed:** after the input budget was used up, `submit_review` was refused too, so the agent could never
      finish (the error told it to call `submit_review`).
- [x] Step 14b: shared `runToolLoop` (`ingest/src/ai/toolLoop.ts` + tests); the ingestion agent uses it and
      its old tests pass unchanged; it writes an `agentRuns` envelope (`ai/agentRuns.ts`).
- [x] Shared output check "every number must be one the code computed" (`ai/outputChecks.ts`).
- [x] AI config: `FUNDTRACE_MINER_ENABLED` (false), `FUNDTRACE_MINER_MAX_TOOL_CALLS` (12),
      `FUNDTRACE_EXPLAIN_ENABLED` (false), `FUNDTRACE_EXPLAIN_MAX_ALERTS` (30).
- [x] Miner agent code (no tests yet): `miner/prompts/mine.ts`, `tools.ts` (5 tools), `wording.ts`,
      `agent.ts`, `proposals.ts`, `store.ts` (Firestore / file / memory), `load.ts`;
      `cloud/mineTask.ts` registered as task `mine` (role `miner`).

## Remaining

### Pattern miner (steps 12, 14c)

- [ ] Tests: `miner/wording.test.ts`, `tools.test.ts`, `agent.test.ts` (hostile outputs: invented
      candidate id, edited definition via extra args, changed number, banned word, over-long name,
      duplicate, excess proposal, injection in a title), `proposals.test.ts`, `store.test.ts`,
      `cloud/mineTask.test.ts` (kill switch, no published build, no candidates, same input skips the
      model, mock stores nothing, real-model failure stores templated proposals with `model: null`).
- [ ] `mineTask.ts`: split `mine()` (just over the ~40-line limit).
- [ ] `minerCli propose` command (prints what would be proposed; never writes; refuses a billed
      provider without `--allow-billed`).
- [ ] `decidePattern` callable (`functions/src/callable/decidePattern.ts` + test): admin claim,
      zod input, transaction; approve copies the proposal's pattern into `riskPatternLibrary/current`
      (status approved, `approved_by`, `approved_at`), bumps `library_version`, recomputes
      `content_hash` (local canonical JSON + sha256; functions cannot import shared at runtime — add a
      test that it matches shared `contentHashOf`), writes immutable `riskPatternLibrary/v<n>`; reject;
      retire; expired, already decided, unknown, malformed. Export in `functions/src/index.ts`.
- [ ] Firestore rules: `patternProposals`, `riskPatternLibrary`, `agentRuns` (admin read only, no client
      writes) and `synthRiskExplanations` (no client access); emulator tests in
      `functions/src/rules/firestoreRules.emulator.test.ts`.

### Risk explainer (step 17, E2)

- [ ] `ingest/src/explain/`: `digest.ts` (structured reasons only, no titles), `placeholders.ts`
      (`{BORROWER}`, `{PARTY_n}`; restore after), `checks.ts` (≤ 400 chars, ≤ 2 sentences, numbers and
      dates from the input only, known placeholders only, top reason mentioned, allegation never worded as
      a finding, `violatesWording`), `prompts/explain.ts` (`explain.v1`), store for
      `synthRiskExplanations/{alertId}` (create only, never touches the alert: B-57), each with tests.
- [ ] `cloud/explainTask.ts` (task `explain`, role `explainer`): alerts of this run, at most 30, skip
      alerts that already have an explanation, mock or kill switch stores nothing; `agentRuns` envelope.
- [ ] `functions/src/services/riskScores.ts`: attach explanations (`explanations` array in the result).
- [ ] Web: parse `explanations` in `web/src/lib/cloud/risk-scores.ts`; show the sentence labelled
      `AI_EXPLANATION_LABEL` with the reasons list under it (load the `fundtrace-ui` skill first).

### Infra and docs

- [ ] `scripts/setup-ingest-gcp.sh`: service accounts `ingest-miner`, `ingest-explainer`; TTL on
      `agentRuns.expiresAt`. `scripts/deploy-ingest.sh`: jobs `ingest-miner` (on demand) and
      `ingest-explain`. `infra/workflows/ingest-daily.yaml`: `explain` step after `score` (job is a no-op
      while `FUNDTRACE_EXPLAIN_ENABLED=false`).
- [ ] `docs/BOUNDARY_CONDITIONS.md`: add B-59, B-60, B-61, B-62.
- [ ] Status updates: `docs/plans/README.md` (steps 12, 14, 17), `AGENTS_PLAN.md`,
      `PATTERN_MINER_PLAN.md` (fix "three read-only lookups" → two), `RISK_EXPLAINER_PLAN.md`,
      `docs/DEPLOY.md`, `docs/SESSION_NOTES.md`.
- [ ] `npm run check && npm run build` (and `npm run test:emulators` if the emulator runs here).

## Decisions to confirm with the owner

- Explanations live in their own collection `synthRiskExplanations/{alertId}`, not as a field on the alert,
  because an alert is created once and never rewritten (B-57). One explanation per alert; a prompt bump
  applies to new alerts only.
- Mock provider and kill switch store no proposals or explanations (only the `agentRuns` record). When a real
  model fails, the miner stores code-worded proposals with `model: null` (AGENTS_PLAN fallback rule).
- Candidates the model rejects are not proposed; the count is in the run record's note.
- The miner reads `data/processed` (as `npm run miner` does) and refuses to run until a build has been
  published (B-50); processed tables can be newer than the published build when a gate failed.
- Step 15 (approval view in the admin page, scoring reading approved patterns from Firestore,
  `proposals_waiting` finding) is not part of this branch.
- Checkpoint 4 (a capped real Vertex dry run) and E3 stay the owner's steps; everything runs on the mock.
