# Deploying

Deploys run from GitHub Actions (`.github/workflows/deploy.yml`) with **no stored keys**: GitHub
proves its identity to Google through Workload Identity Federation.

| Event                     | What happens                                        | Runs as           |
| ------------------------- | --------------------------------------------------- | ----------------- |
| Pull request (same repo)  | Builds the web app, publishes a 7-day preview URL   | `github-preview`  |
| Push / merge to `main`    | Checks, builds, deploys Hosting + Functions + rules | `github-deployer` |
| Docs-only change (`*.md`) | Nothing is deployed                                 | -                 |

`github-preview` can only manage Hosting. `github-deployer` can only be used by runs on
`refs/heads/main`, so a pull-request branch can never deploy Functions or change Firestore rules.

## One-time setup (already done for `fund-tracer`)

```bash
scripts/setup-gcp.sh fund-tracer Sanchit-Datir/fund-tracer
```

It is safe to re-run. It creates the two service accounts, the identity pool locked to this repo,
and prints the values the workflow already uses as defaults. Nothing needs to be added to GitHub
secrets. Add the public web config as repo **variables** once the web app talks to Firebase
(`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_APP_ID`).

## Changing what CI can do

Add the role to the right list in `scripts/setup-gcp.sh` and re-run it. Give previews as little as
possible; anything that changes production belongs to `github-deployer`.

## Functions that use a secret

A function reads a Secret Manager secret as its **runtime account** (the App Engine default account,
`<project>@appspot.gserviceaccount.com`, with the current firebase-tools). That account needs
`roles/secretmanager.secretAccessor` on the secret. `github-deployer` only has `secretmanager.viewer`
on purpose, so it cannot grant this itself. Grant it once, by hand, when you add a secret:

```bash
gcloud secrets add-iam-policy-binding GEMINI_API_KEY --project fund-tracer \
  --member serviceAccount:fund-tracer@appspot.gserviceaccount.com \
  --role roles/secretmanager.secretAccessor
```

A deploy that fails with "must have permission iam.serviceAccounts.ActAs" means the runtime account
changed; add it to `RUNTIME_SAS` in `scripts/setup-gcp.sh` and re-run the script.

## When a deploy fails

- **Permission denied on one API:** read the error, add that single role to `github-deployer`.
- **Bad release:** revert the merge commit on `main`; the same pipeline redeploys the old code.
  Hosting also keeps every version (Firebase console → Hosting → Release history → Rollback).
- **Cost:** deploys only run on merges to `main` and non-docs PRs. A Functions deploy uses Cloud
  Build (inside the free allowance) and leaves a container image; the cleanup policy removes old ones.

## Cloud ingestion (public-records pipeline)

The daily pipeline runs entirely in Google Cloud: Cloud Scheduler (03:05 IST) → Cloud Workflows
`ingest-daily` → Cloud Run jobs `ingest-acquire` (one task per source) and `ingest-build`.
Design: [`docs/plans/GCP_INGESTION_AGENT_PLAN.md`](plans/GCP_INGESTION_AGENT_PLAN.md); code:
`ingest/src/cloud/`.

### One-time setup (Owner, from Cloud Shell in a clone of the repo)

```bash
SEED=1 scripts/setup-ingest-gcp.sh fund-tracer            # buckets, datasets, accounts, scheduler, alerts
# optional budget: BILLING_ACCOUNT=XXXXXX-XXXXXX-XXXXXX BUDGET_USD=25 scripts/setup-ingest-gcp.sh fund-tracer
```

`SEED=1` copies the five MCA master parts and `data/registry/sources.json` into the state bucket.
Then set the repo variable **`INGEST_ENABLED=true`**: the next merge to `main` builds the image
(tag = commit), pushes it to Artifact Registry `ingest` and runs `scripts/deploy-ingest.sh`.

### Dry run, then publish

New deployments run as a **dry run** (`FUNDTRACE_PUBLISH_ENABLED=false`): bundles go to
`gs://fund-tracer-ingest-publish/dry-run/`, BigQuery to `fundtrace_public_dryrun`. After a clean
week (see the plan's MVP 1 exit criteria), set **`INGEST_PUBLISH_ENABLED=true`** and redeploy.

| Resource  | Name                                                                                     |
| --------- | ---------------------------------------------------------------------------------------- |
| Buckets   | `fund-tracer-ingest-raw` (create-only evidence), `-state` (versioned), `-publish`        |
| BigQuery  | `fundtrace_public` (+ `_dryrun`): 11 snapshot tables, `delta_events`, `ingest_runs`      |
| Firestore | `ingestRuns/{runId}` (per-run record), `ingestLocks/{name}` (leases, TTL on `expiresAt`) |
| Accounts  | `ingest-runner` (jobs), `ingest-orchestrator` (Scheduler + Workflows)                    |

### Operating it

- **Run now:** `gcloud workflows run ingest-daily --location asia-south1 --data '{}'`; force a
  rebuild and republish: `--data '{"force_build": "true"}'`.
- **One source only (debugging):** `gcloud run jobs execute ingest-acquire --region asia-south1
--tasks 1 --update-env-vars FUNDTRACE_SOURCES=nfra`.
- **What happened:** Firestore `ingestRuns/<runId>` (per-source status, counts, errors; build
  status, gates, version), or the Workflows execution. Logs are structured JSON (filter
  `jsonPayload.run="<runId>"`).
- **Rollback:** copy an earlier `versions/<version>` entry into `current.json` (the previous 14
  versions are kept), or let the next good build replace it. Bundles are immutable once written.
- **Alerts** (Monitoring → Alerting; no notification channel yet, by decision): run failed, a
  source failed, a publish gate failed. The run fails when the agent's code-computed status is
  `failed` (a source failed and its retry did not fix it, a gate failed, or the agent crashed).

### The agent and its proposals

After every build the `ingest-agent` job reviews the run (`ingestReviews/<runId>`). Findings and
their severity come from code; the model (Vertex AI, `gemini-3.1-flash-lite`) only writes the
summary and may propose actions from a fixed list. Healthy days never call the model.

| Action                          | Applied                                                    | Who decides                                                             |
| ------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| `rerun_source`                  | Re-runs the source within the same run                     | Automatic only for transient errors (once per run); otherwise the owner |
| `full_relist` / `accept_shrink` | Next run of that source, once                              | Owner                                                                   |
| `pause_source`                  | Every run skips the source until the proposal is resolved  | Owner                                                                   |
| `rollback_publish`              | Next build repoints `current.json` to the previous version | Owner                                                                   |
| `adapter_fix_needed`            | Nothing automatic: a developer changes the adapter         | Owner / developer                                                       |

Approve or reject: call `decideProposal` (needs the custom claim `admin: true`; set it once with the
Admin SDK), or, until the app has sign-in, edit `agentProposals/<id>.status` to `approved` /
`rejected` / `resolved` in the Firestore console. Kill switch: repo variable
`INGEST_AGENT_ENABLED=false` and redeploy (reviews become templated text, no model calls).

### The app reads the published data

`/data/**` on Hosting is rewritten to the `publicData` function, which serves the current version
from the publish bucket (same origin, so the CSP stays strict). It needs a signed-in Firebase user
(registered addresses are in the bundle, B-38); until the app has real sign-in, the web loader
falls back to the local `/graph-lab/` copy.

- **Permissions:** the runner can add and read raw evidence but never delete or overwrite it;
  only `github-deployer` (main branch) can change the jobs and the workflow.

### AI evidence extraction (shadow mode) and the SEBI full index

- **Extraction** (`ingest-extract`, between acquire and build) reads new documents with the model and
  stores grounded claims (organisations, CINs, amounts in paise, dates, case type) as create-only
  objects under `interim/ai/claims/`; the build loads them into BigQuery
  `evidence_claims_ai_shadow`. They are **not** used by the app or the graph until the quality
  gate passes (`node ingest/dist/cli.js eval-ai --golden …`, see `ingest/eval/README.md`) and the
  owner approves merging them. It is **off** until you set `INGEST_AI_EXTRACT_ENABLED=true`
  (cost: about US$5/month at 50 documents/day, `COST_GUIDELINES.md`). Its account
  `ingest-extractor` can read documents and only add new objects.
- **SEBI**: the cloud lists the full order index (~24.5k orders, `FUNDTRACE_SEBI_SAMPLE=false`);
  the first run lists everything (about half an hour), later runs page newest-first and stop at
  known orders, with a full relist monthly. Documents are fetched 300 per run (paced backfill).
- **Layout changes**: when a source page stops parsing, the page is saved to
  `interim/diagnostics/<run>/<source>.html`; the agent reads its structure and adds a diagnosis to
  the `adapter_fix_needed` proposal.
