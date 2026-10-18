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

## Connecting the web app (sign-in, App Check, `askGemini`)

Until these are done the live site is plain demo mode: the login page offers only "Try demo" and the
Cloud & AI tab says "Not connected". Once they are done, people sign in with a real account (email +
password), "Try demo" stays as a second option (and has no cloud or AI features), and each person's name, role
and branch come from a profile you set up in step D. Do them in this order; menu names are the current
Firebase console ones (Security → Authentication, Security → App Check). Console:
<https://console.firebase.google.com/project/fund-tracer>.

**A. Firebase console**

1. **Register the web app** (this is where the config values come from). Project settings (gear) →
   General → Your apps → Add app → Web (`</>`) → nickname `Fund Tracer Web` → leave "Also set up Hosting"
   off → Register app. Note `apiKey`, `authDomain` (`fund-tracer.firebaseapp.com`) and `appId` (starts
   `1:`). Later: Project settings → Your apps → SDK setup and configuration. CLI alternative:
   `firebase apps:create WEB "Fund Tracer Web" --project fund-tracer` then
   `firebase apps:sdkconfig WEB --project fund-tracer`. These values are public, not secrets.
2. **Start sign-in:** Security → Authentication → **Get started** → Sign-in method → **Email/Password** →
   enable (leave "Email link" off) → Save. Then the **Users** tab → Add user (email + password) for each
   person. Anyone with the public config can usually register themselves too, which is safe because nothing is
   usable without a profile (step D).
3. **App Check key (reCAPTCHA Enterprise).** Keys now live in the Google Cloud project, and the app uses
   the Enterprise provider. In Google Cloud Console → Security → reCAPTCHA (or via
   <https://www.google.com/recaptcha/admin/create>, which lands there), create a **website** key: type
   **score based**, domains `fund-tracer.web.app` and `fund-tracer.firebaseapp.com`, no checkbox challenge.
   Copy the **key ID** (it starts `6L…`; this is the "site key"). **There is no secret key** for these keys.
   CLI: `gcloud recaptcha keys list --project fund-tracer`. Enterprise is billed per assessment beyond a
   free monthly allowance; the site asks once per visitor per token lifetime (default one day), so usage
   is tiny, but check <https://cloud.google.com/recaptcha/pricing> before relying on it.
4. Security → **App Check** → **Apps** tab → your web app → **reCAPTCHA Enterprise** → paste the key ID →
   Save. Nothing secret is entered anywhere for this provider.

**B. GitHub** (repo → Settings → Secrets and variables → Actions → **Variables** tab → New repository
variable; they must be Variables, not Secrets, because the browser needs them):

| Name                        | Value                              |
| --------------------------- | ---------------------------------- |
| `VITE_FIREBASE_API_KEY`     | `apiKey` from step 1               |
| `VITE_FIREBASE_AUTH_DOMAIN` | `fund-tracer.firebaseapp.com`      |
| `VITE_FIREBASE_APP_ID`      | `appId` from step 1                |
| `VITE_RECAPTCHA_SITE_KEY`   | the reCAPTCHA **key ID** (step A3) |

The project ID is added by the workflow itself.

**C. Rebuild the site.** Variables are baked in at build time, so the live site changes only after a new
deploy: Actions → **Deploy** → Run workflow → branch `main` (or re-run the latest run on `main`).

**D. Set up each person (their profile)**

A login alone gets nobody in. Without a profile the login page says "Your account is not set up yet" and
shows the person's **Account ID**, so you can set them up from that.

1. **Create the login:** Authentication → **Users** → Add user (email + password). Copy the **User UID**
   column (or take the Account ID the login page shows after a first sign-in attempt).
2. **Create the profile:** Firebase console → **Firestore Database** → Data → Start collection `users` (first
   time only) → add a document whose **Document ID is that User UID**, with these fields:

   | Field        | Type    | Value                                                                               |
   | ------------ | ------- | ----------------------------------------------------------------------------------- |
   | `name`       | string  | Full name shown in the app                                                          |
   | `employeeId` | string  | e.g. `EMP-10233` (may be empty)                                                     |
   | `branchId`   | string  | one of `br-shirur`, `br-junnar`, `br-baramati` (the branches the app knows now)     |
   | `role`       | string  | `branch_officer`, `branch_manager`, `risk_analyst`, `investigator`, `administrator` |
   | `aiEnabled`  | boolean | `true` to allow Gemini; `false` or leave out for no AI                              |
   | `enabled`    | boolean | optional; `false` switches the person off without deleting the profile              |

   Spelling matters: a wrong role, an empty name or a text value in a true/false field makes the profile
   invalid, and the person stays locked out (the check fails closed).

3. The person signs in on the login page with their email and password and lands in the app under their own
   name, role and branch. The app's data is still the built-in demo data until real data is added.
4. With `aiEnabled: true`, Settings → **Cloud & AI** → Ask. Each billed call is counted against the daily limit
   (30 per Indian day by default) and billed to the Gemini key, a free-tier key, so use made-up data only.

"Try demo" stays on the login page unless you set the GitHub variable `VITE_ENABLE_DEMO` to `false` and
redeploy. A demo session never reaches the cloud features.

`askgemini` is already publicly invokable at the network level (the Firebase CLI set this when the
function was first deployed; `health` is private). That is normal for a callable, because the function
itself rejects requests without sign-in and an App Check token. What actually protects it: sign-in, App
Check, the profile check and the daily limit. Check any time with
`gcloud run services get-iam-policy askgemini --region asia-south1 --project fund-tracer`, and look for
unexpected traffic under Cloud Run → askgemini → Logs.

Locally, `npm run serve -w functions` plus `VITE_USE_EMULATORS=true npm run dev -w web` use the Auth and
Functions emulators, the free mock and a built-in dev profile (no Firestore needed), so nothing is billed. The security headers in
`web/security-headers.ts` and `firebase.json` allow only the Google hosts these features need.

## Adding a brand-new function

A new callable must be made reachable by browsers when it is first created. `github-deployer` can do this
itself through the narrow custom role `ciFunctionInvoker` (only get/set access policy on functions and
Cloud Run services; created by `scripts/setup-gcp.sh`). If a first deploy still fails with "Unable to set
the invoker", run once, deliberately, as the project owner:

```bash
gcloud run services add-iam-policy-binding <function-name-in-lowercase> --region asia-south1 \
  --project fund-tracer --member allUsers --role roles/run.invoker
```

and re-run the Deploy. This only makes the function _reachable_: every callable must itself reject callers
without sign-in and App Check (see the existing ones). Never do this for a function that skips those checks.

## When something does not work

Save the logs to files and read them: see `docs/LOGS.md`.

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
# budget alerts: DONE (created in the console, 18 Oct 2026: INR 450/month all services, INR 200/month AI services)
```

`SEED=1` copies the five MCA master parts and `data/registry/sources.json` into the state bucket.
Then set the repo variable **`INGEST_ENABLED=true`**: the next merge to `main` builds the image
(tag = commit), pushes it to Artifact Registry `ingest` and runs `scripts/deploy-ingest.sh`.

The same merge deploys two new functions, `publicData` (Hosting serves `/data/**` through it) and
`decideProposal` (callable). Both must be invokable at the network level, like `askgemini`; they
check sign-in and App Check themselves. `github-deployer` has no right to change IAM policies, so if
the first deploy reports that it could not set the invoker, run once as the Owner:

```bash
for fn in publicdata decideproposal; do
  gcloud run services add-iam-policy-binding "$fn" --region asia-south1 --project fund-tracer \
    --member allUsers --role roles/run.invoker
done
```

### Dry run, then publish

New deployments run as a **dry run** (`FUNDTRACE_PUBLISH_ENABLED=false`): bundles go to
`gs://fund-tracer-ingest-publish/dry-run/`, BigQuery to `fundtrace_public_dryrun`. After a clean
week (see the plan's MVP 1 exit criteria), set **`INGEST_PUBLISH_ENABLED=true`** and redeploy.

| Resource  | Name                                                                                                 |
| --------- | ---------------------------------------------------------------------------------------------------- |
| Buckets   | `fund-tracer-ingest-raw` (create-only evidence), `-state` (versioned), `-publish`                    |
| BigQuery  | `fundtrace_public` (+ `_dryrun`): 11 snapshot tables, `delta_events`, `ingest_runs`                  |
| Firestore | `ingestRuns/{runId}` (per-run record), `ingestLocks/{name}` (leases, TTL on `expiresAt`),            |
|           | `ingestReviews/{runId}`, `agentProposals/{id}` (admin read only; tested in `npm run test:emulators`) |
| Accounts  | `ingest-runner` (jobs), `ingest-orchestrator` (Scheduler + Workflows), `ingest-agent`                |
|           | (read-only reviewer), `ingest-extractor` (create-only shadow claims)                                 |

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

Approve or reject: call `decideProposal` signed in as a user with the custom claim `admin: true`
(set it once with the Admin SDK), or, until the app has an admin page, edit
`agentProposals/<id>.status` to `approved` / `rejected` / `resolved` in the Firestore console. Kill switch: repo variable
`INGEST_AGENT_ENABLED=false` and redeploy (reviews become templated text, no model calls).

### The app reads the published data

`/data/**` on Hosting is rewritten to the `publicData` function, which serves the current version
from the publish bucket (same origin, so the CSP stays strict). It needs a signed-in Firebase user
and a valid App Check token (registered addresses are in the bundle, B-38): once a person is signed
in with a usable profile, the web loader sends their ID token and App Check token; signed out, in
the demo, or before the first publish it falls back to the local `/graph-lab/` copy.

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

### Synthetic risk scores (`ingest-score`, off by default)

The daily scoring job (`docs/plans/REMAINING_WORK.md`, W2) scores **synthetic test loans only** (B-54)
with plain code; it never calls a model (B-15). It runs after `build` and before the agent review, is
retried once by the workflow, and is a no-op until `INGEST_SCORE_ENABLED=true`.

1. **Setup** (once, Owner): re-run `scripts/setup-ingest-gcp.sh <project>`. It creates the
   `ingest-scorer` account, the `fundtrace_synth` dataset (only the scorer may write it), and a
   create-only grant on `gs://<project>-ingest-state/interim/risk-load/` for BigQuery load files (Q1).
   The next deploy then creates the `ingest-score` job (it is skipped while the account is missing).
2. **Load the synthetic data** (from Cloud Shell, after `npm ci && npm run synth`):
   ```bash
   FUNDTRACE_STORAGE=gcs FUNDTRACE_PROJECT_ID=<project> FUNDTRACE_RAW_BUCKET=<project>-ingest-raw \
   FUNDTRACE_STATE_BUCKET=<project>-ingest-state FUNDTRACE_PUBLISH_BUCKET=<project>-ingest-publish \
     node ingest/dist/risk/synthLoadCli.js --dataset fundtrace_synth
   ```
   The loader refuses any dataset whose name does not end in `_synth`; `truth.jsonl` is never loaded.
3. **Dry run (W2g)**: run the job once by hand with scoring switched on for that execution only:
   ```bash
   gcloud run jobs execute ingest-score --region asia-south1 --project <project> --wait \
     --update-env-vars FUNDTRACE_SCORE_ENABLED=true
   ```
   Check `risk_scores` has one row per loan for today's IST date
   (`SELECT as_of, COUNT(*) FROM fundtrace_synth.risk_scores GROUP BY as_of`), `synthRiskLatest` has one
   document per loan, and a second execution adds no rows (same job ids, B-24, B-57).
4. **Switch on**: set the repository variable `INGEST_SCORE_ENABLED=true`; the next deploy turns the
   daily step on. The app's **Risk scores (synthetic)** page then reads the job's output through the
   `getRiskScores` function; without a cloud sign-in it shows the bundled sample.

Until a public build is published, every score is marked `stale_inputs` (B-50, B-56); the scorer reads the
`dry-run` channel's build date while `INGEST_PUBLISH_ENABLED=false` (Q2).

### Pattern miner and risk explainer (off by default)

Both follow `docs/plans/AGENTS_PLAN.md`: code computes the facts, the model only words them, a person decides.
Each execution writes one `agentRuns/<agent>_<runId>` record (counts, versions and tokens, never a prompt or a
response; removed after about 400 days by a TTL policy). The budget alerts exist (B-15, checked 18 Oct 2026); they warn but do not stop spend, so keep the
per-run caps.

1. **Setup** (once, Owner): re-run `scripts/setup-ingest-gcp.sh <project>`. It creates `ingest-miner` (reads
   the state and publish buckets, Firestore, Vertex AI) and `ingest-explainer` (Firestore and Vertex AI only)
   and the TTL on `agentRuns`. The next deploy creates the jobs `ingest-miner` and `ingest-explain`.
2. **Pattern miner** (`ingest-miner`, on demand only, never in the daily workflow): try it locally first with
   `npm run miner -- propose` (mock model; prints what would be proposed and writes nothing). In the cloud:
   ```bash
   gcloud run jobs execute ingest-miner --region asia-south1 --project <project> --wait \
     --update-env-vars FUNDTRACE_MINER_ENABLED=true
   ```
   It refuses to run before a build is published (B-50), proposes at most 5 patterns to `patternProposals`,
   and does nothing new on the same input. Decide with the `decidePattern` callable (custom claim
   `admin: true`): `{ decision: 'approve' | 'reject', proposalId }` or `{ decision: 'retire', patternId }`.
   Approving writes `riskPatternLibrary/current` and `riskPatternLibrary/v<n>` (B-61). Proposals expire after
   30 days. The scorer still uses the hand-written patterns until step 15 (it does not read the library yet).
3. **Risk explainer** (`ingest-explain`, after `score` in the daily workflow, a no-op while
   `INGEST_EXPLAIN_ENABLED=false`): dry run (E3) on one day's synthetic alerts:
   ```bash
   gcloud run jobs execute ingest-explain --region asia-south1 --project <project> --wait \
     --update-env-vars FUNDTRACE_EXPLAIN_ENABLED=true,FUNDTRACE_RUN_ID=<a run id with alerts>
   ```
   Read the sentences in `synthRiskExplanations` against their alerts' reasons. Stop rule: if more than about 1
   in 10 reads stronger than the reasons, keep the templates. To switch on, set `INGEST_EXPLAIN_ENABLED=true`.
   The app shows each sentence labelled "AI-written summary of the recorded reasons", with the reasons under it.
4. **Kill switches**: the repository variables `INGEST_MINER_ENABLED` and `INGEST_EXPLAIN_ENABLED` (both `false`
   by default); the mock provider and a switched-off job never store a proposal or an explanation.
