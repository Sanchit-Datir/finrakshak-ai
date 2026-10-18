#!/usr/bin/env bash
# One-time setup of the cloud ingestion pipeline. Safe to re-run (every step checks first).
# Plan: docs/plans/GCP_INGESTION_AGENT_PLAN.md. Run from Cloud Shell in a clone of this repo.
#
# Creates: Cloud Storage buckets (raw / state / publish), BigQuery datasets, the Artifact Registry
# repo, runtime service accounts with least-privilege roles, the Firestore TTL on leases, the
# Cloud Scheduler trigger, log-based metrics, alert policies (no notification channel, by
# decision) and, optionally, a budget. Cloud Run jobs and the workflow are created by the
# deploy pipeline (scripts/deploy-ingest.sh) because they need the built image.
#
# Usage: scripts/setup-ingest-gcp.sh <project-id> [region]
# Optional env:
#   SEED=1                 copy the MCA master parts and data/registry/sources.json into the state bucket
#   BILLING_ACCOUNT=XXXXXX-XXXXXX-XXXXXX BUDGET_USD=25   create a monthly budget alert (B-15)
# Needs: gcloud + bq, signed in as a project Owner.
set -euo pipefail

PROJECT_ID="${1:?usage: scripts/setup-ingest-gcp.sh <project-id> [region]}"
REGION="${2:-asia-south1}"
RAW_BUCKET="${PROJECT_ID}-ingest-raw"
STATE_BUCKET="${PROJECT_ID}-ingest-state"
PUBLISH_BUCKET="${PROJECT_ID}-ingest-publish"
DATASET="fundtrace_public"
AR_REPO="ingest"
RUNNER_SA="ingest-runner@${PROJECT_ID}.iam.gserviceaccount.com"
ORCH_SA="ingest-orchestrator@${PROJECT_ID}.iam.gserviceaccount.com"
AGENT_SA="ingest-agent@${PROJECT_ID}.iam.gserviceaccount.com"
EXTRACTOR_SA="ingest-extractor@${PROJECT_ID}.iam.gserviceaccount.com"
SCORER_SA="ingest-scorer@${PROJECT_ID}.iam.gserviceaccount.com"
MINER_SA="ingest-miner@${PROJECT_ID}.iam.gserviceaccount.com"
EXPLAINER_SA="ingest-explainer@${PROJECT_ID}.iam.gserviceaccount.com"
# Synthetic test data only (B-54): never the public dataset.
SYNTH_DATASET="fundtrace_synth"
# Gen2 functions run as one of these default accounts, depending on the firebase-tools version
# (the same list as scripts/setup-gcp.sh); publicData reads the published bundles.
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
FUNCTIONS_SAS=(
  "${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
  "${PROJECT_ID}@appspot.gserviceaccount.com"
)
DEPLOY_SA="github-deployer@${PROJECT_ID}.iam.gserviceaccount.com"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ensure_sa() { # <email> <display name>
  gcloud iam service-accounts describe "$1" --project "$PROJECT_ID" >/dev/null 2>&1 ||
    gcloud iam service-accounts create "${1%%@*}" --project "$PROJECT_ID" --display-name "$2"
}
grant_project() { # <service-account> <role...>
  local sa="$1"
  shift
  for role in "$@"; do
    # A brand-new service account can take a few seconds to become visible to IAM.
    for attempt in 1 2 3 4 5 6; do
      gcloud projects add-iam-policy-binding "$PROJECT_ID" --member "serviceAccount:$sa" \
        --role "$role" --condition None >/dev/null 2>&1 && continue 2
      echo "  waiting for $sa to propagate (attempt $attempt)"
      sleep 5
    done
    echo "Could not grant $role to $sa" >&2
    return 1
  done
}
grant_bucket() { # <bucket> <service-account> <role...>
  local bucket="$1" sa="$2"
  shift 2
  for role in "$@"; do
    gcloud storage buckets add-iam-policy-binding "gs://$bucket" --project "$PROJECT_ID" \
      --member "serviceAccount:$sa" --role "$role" >/dev/null
  done
}
ensure_bucket() { # <bucket>
  gcloud storage buckets describe "gs://$1" --project "$PROJECT_ID" >/dev/null 2>&1 ||
    gcloud storage buckets create "gs://$1" --project "$PROJECT_ID" --location "$REGION" \
      --uniform-bucket-level-access --public-access-prevention
}
ensure_dataset() { # <dataset> [description]
  bq --project_id "$PROJECT_ID" show --dataset "$PROJECT_ID:$1" >/dev/null 2>&1 ||
    bq --project_id "$PROJECT_ID" --location "$REGION" mk --dataset \
      --description "${2:-FinRakshak AI public-records dataset (loaded by ingest-build)}" "$PROJECT_ID:$1"
}
grant_dataset() { # <dataset> <service-account> <READER|WRITER>
  # `bq add-iam-policy-binding --dataset` needs allowlisting, so edit the dataset ACL instead.
  local tmp
  tmp="$(mktemp)"
  bq --project_id "$PROJECT_ID" show --format=prettyjson "$PROJECT_ID:$1" >"$tmp"
  python3 - "$tmp" "$2" "$3" <<'PY'
import json, sys
path, email, role = sys.argv[1:4]
doc = json.load(open(path))
access = doc.setdefault("access", [])
if not any(a.get("userByEmail") == email and a.get("role") == role for a in access):
    access.append({"role": role, "userByEmail": email})
json.dump({"access": access}, open(path, "w"))
PY
  bq --project_id "$PROJECT_ID" update --source "$tmp" "$PROJECT_ID:$1" >/dev/null
  rm -f "$tmp"
}
ensure_metric() { # <name> <description> <filter>
  gcloud logging metrics describe "$1" --project "$PROJECT_ID" >/dev/null 2>&1 ||
    gcloud logging metrics create "$1" --project "$PROJECT_ID" --description "$2" --log-filter "$3"
}
ensure_policy() { # <file>
  local name
  name="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["displayName"])' "$1")"
  if [ -z "$(gcloud monitoring policies list --project "$PROJECT_ID" \
    --filter "displayName=\"$name\"" --format 'value(name)')" ]; then
    gcloud monitoring policies create --project "$PROJECT_ID" --policy-from-file "$1" >/dev/null
  fi
}

echo "› Enabling APIs"
gcloud services enable run.googleapis.com workflows.googleapis.com workflowexecutions.googleapis.com \
  cloudscheduler.googleapis.com bigquery.googleapis.com storage.googleapis.com \
  firestore.googleapis.com artifactregistry.googleapis.com logging.googleapis.com \
  monitoring.googleapis.com iam.googleapis.com aiplatform.googleapis.com --project "$PROJECT_ID"

echo "› Service accounts"
ensure_sa "$RUNNER_SA" "Ingest jobs: acquire and build"
ensure_sa "$ORCH_SA" "Ingest orchestration: Scheduler and Workflows"
ensure_sa "$AGENT_SA" "Ingest agent: read-only reviewer (B-49)"
ensure_sa "$EXTRACTOR_SA" "Ingest AI extraction: create-only shadow claims (B-52)"
ensure_sa "$SCORER_SA" "Ingest scoring: synthetic risk scores, no model (B-15, B-54)"
ensure_sa "$MINER_SA" "Pattern miner: proposals only, never the library (B-61)"
ensure_sa "$EXPLAINER_SA" "Risk explainer: explanations beside alerts only (B-62)"

echo "› Cloud Storage (private, uniform access, $REGION)"
for b in "$RAW_BUCKET" "$STATE_BUCKET" "$PUBLISH_BUCKET"; do ensure_bucket "$b"; done
# State: every listing version is kept 90 days after it is replaced (rollback, B-50).
gcloud storage buckets update "gs://$STATE_BUCKET" --project "$PROJECT_ID" --versioning \
  --lifecycle-file "$HERE/infra/storage/state-lifecycle.json" >/dev/null
# Raw evidence is create-only for the runner: it may add and read objects but never delete or
# overwrite them (no objectAdmin/objectUser). Kept forever, as decided.
grant_bucket "$RAW_BUCKET" "$RUNNER_SA" roles/storage.objectCreator roles/storage.objectViewer
grant_bucket "$STATE_BUCKET" "$RUNNER_SA" roles/storage.objectUser
grant_bucket "$PUBLISH_BUCKET" "$RUNNER_SA" roles/storage.objectUser
# The agent reads everything and writes no pipeline data (B-49).
for b in "$RAW_BUCKET" "$STATE_BUCKET" "$PUBLISH_BUCKET"; do grant_bucket "$b" "$AGENT_SA" roles/storage.objectViewer; done
# The extractor reads documents and text and may only ADD objects (create-only shadow claims):
# objectCreator cannot overwrite or delete, so it can never change existing pipeline state.
grant_bucket "$RAW_BUCKET" "$EXTRACTOR_SA" roles/storage.objectViewer
grant_bucket "$STATE_BUCKET" "$EXTRACTOR_SA" roles/storage.objectViewer roles/storage.objectCreator
# The scorer reads the published build's date (B-50) and the seed review, and may only ADD load files
# for BigQuery under interim/risk-load/ (question Q1): create-only, limited to that prefix.
grant_bucket "$PUBLISH_BUCKET" "$SCORER_SA" roles/storage.objectViewer
grant_bucket "$STATE_BUCKET" "$SCORER_SA" roles/storage.objectViewer
gcloud storage buckets add-iam-policy-binding "gs://$STATE_BUCKET" --project "$PROJECT_ID" \
  --member "serviceAccount:$SCORER_SA" --role roles/storage.objectCreator \
  --condition "title=risk-load-only,expression=resource.name.startsWith('projects/_/buckets/$STATE_BUCKET/objects/interim/risk-load/')" >/dev/null
# The miner reads the processed tables, the seed review and the published pointer (B-50); it writes
# no bucket. The explainer reads only Firestore, so it has no bucket role at all.
grant_bucket "$STATE_BUCKET" "$MINER_SA" roles/storage.objectViewer
grant_bucket "$PUBLISH_BUCKET" "$MINER_SA" roles/storage.objectViewer
# The app's publicData function only reads the published bundles.
for sa in "${FUNCTIONS_SAS[@]}"; do grant_bucket "$PUBLISH_BUCKET" "$sa" roles/storage.objectViewer; done

echo "› BigQuery datasets ($DATASET and the dry-run copy, $SYNTH_DATASET)"
for d in "$DATASET" "${DATASET}_dryrun"; do
  ensure_dataset "$d"
  grant_dataset "$d" "$RUNNER_SA" WRITER
  grant_dataset "$d" "$AGENT_SA" READER
done
# Synthetic loans, transactions and their risk scores: only the scorer writes here (B-54).
ensure_dataset "$SYNTH_DATASET" "FinRakshak AI SYNTHETIC test data and its risk scores (never real, B-54)"
grant_dataset "$SYNTH_DATASET" "$SCORER_SA" WRITER

echo "› Project roles"
grant_project "$RUNNER_SA" roles/bigquery.jobUser roles/datastore.user roles/logging.logWriter \
  roles/monitoring.metricWriter
# The orchestrator only starts the workflow and runs the jobs (with per-run env overrides); it
# touches no data. Falls back to Cloud Run Developer only if the narrower role is unavailable.
grant_project "$ORCH_SA" roles/workflows.invoker roles/logging.logWriter roles/datastore.viewer
# Agent: Firestore for reviews and proposals (its code has no tool that writes anything else),
# BigQuery jobs for read-only baseline queries, Vertex AI for the model.
grant_project "$AGENT_SA" roles/datastore.user roles/bigquery.jobUser roles/aiplatform.user \
  roles/logging.logWriter
grant_project "$EXTRACTOR_SA" roles/datastore.user roles/aiplatform.user roles/logging.logWriter
# Scorer: BigQuery jobs and Firestore for the synthRisk* collections (question Q6: the role is
# project-wide, so its code is limited to those collections and a test lists them). No model role.
grant_project "$SCORER_SA" roles/bigquery.jobUser roles/datastore.user roles/logging.logWriter
# Miner and explainer: Firestore for their own collections and agentRuns, Vertex AI for the model.
# As for the agent, datastore.user is project-wide: their code writes only patternProposals or
# synthRiskExplanations (tests list the collections); the cloud does not enforce it (AGENTS_PLAN.md).
grant_project "$MINER_SA" roles/datastore.user roles/aiplatform.user roles/logging.logWriter
grant_project "$EXPLAINER_SA" roles/datastore.user roles/aiplatform.user roles/logging.logWriter
grant_project "$ORCH_SA" roles/run.jobsExecutorWithOverrides ||
  { echo "  falling back to roles/run.developer for $ORCH_SA" && grant_project "$ORCH_SA" roles/run.developer; }

echo "› Artifact Registry repo '$AR_REPO' (keeps the last 10 images)"
gcloud artifacts repositories describe "$AR_REPO" --location "$REGION" --project "$PROJECT_ID" >/dev/null 2>&1 ||
  gcloud artifacts repositories create "$AR_REPO" --repository-format docker --location "$REGION" \
    --project "$PROJECT_ID" --description "Cloud ingestion job images"
gcloud artifacts repositories set-cleanup-policies "$AR_REPO" --location "$REGION" \
  --project "$PROJECT_ID" --policy "$HERE/infra/artifact-registry/cleanup-policy.json" --no-dry-run >/dev/null

echo "› Deploy account (main branch only) may ship the jobs and the workflow"
gcloud artifacts repositories add-iam-policy-binding "$AR_REPO" --location "$REGION" \
  --project "$PROJECT_ID" --member "serviceAccount:$DEPLOY_SA" --role roles/artifactregistry.writer >/dev/null
grant_project "$DEPLOY_SA" roles/run.developer roles/workflows.editor
for sa in "$RUNNER_SA" "$ORCH_SA" "$AGENT_SA" "$EXTRACTOR_SA" "$SCORER_SA" "$MINER_SA" "$EXPLAINER_SA"; do
  gcloud iam service-accounts add-iam-policy-binding "$sa" --project "$PROJECT_ID" \
    --member "serviceAccount:$DEPLOY_SA" --role roles/iam.serviceAccountUser >/dev/null
done

echo "› Firestore TTL: expired leases are deleted automatically"
gcloud firestore fields ttls update expiresAt --collection-group ingestLocks --enable-ttl \
  --project "$PROJECT_ID" --async >/dev/null || echo "  (TTL already set or pending)"
# Agent run envelopes carry expiresAt (about 400 days, AGENTS_PLAN.md).
gcloud firestore fields ttls update expiresAt --collection-group agentRuns --enable-ttl \
  --project "$PROJECT_ID" --async >/dev/null || echo "  (TTL already set or pending)"

echo "› Cloud Scheduler: daily at 03:05 IST"
SCHED_URI="https://workflowexecutions.googleapis.com/v1/projects/$PROJECT_ID/locations/$REGION/workflows/ingest-daily/executions"
if gcloud scheduler jobs describe ingest-daily --location "$REGION" --project "$PROJECT_ID" >/dev/null 2>&1; then
  verb=update
else
  verb=create
fi
gcloud scheduler jobs "$verb" http ingest-daily --location "$REGION" --project "$PROJECT_ID" \
  --schedule "5 3 * * *" --time-zone "Asia/Kolkata" --uri "$SCHED_URI" --http-method POST \
  --message-body '{"argument": "{}"}' --oauth-service-account-email "$ORCH_SA" \
  --max-retry-attempts 1 >/dev/null

echo "› Log-based metrics and alert policies (visible in the console; no notification channel)"
ensure_metric ingest_source_failed "A source failed in the daily ingestion run" \
  'resource.type="cloud_run_job" AND jsonPayload.message="source recorded" AND jsonPayload.status="failed"'
ensure_metric ingest_publish_gate_failed "A rebuilt dataset failed a publish gate" \
  'resource.type="cloud_run_job" AND jsonPayload.message="publish gates failed; previous version stays live"'
for f in "$HERE"/infra/monitoring/*.json; do ensure_policy "$f"; done

if [ -n "${BILLING_ACCOUNT:-}" ]; then
  echo "› Budget alert (${BUDGET_USD:-25} USD/month)"
  gcloud billing budgets list --billing-account "$BILLING_ACCOUNT" --format 'value(displayName)' |
    grep -qx "fund-tracer monthly" ||
    gcloud billing budgets create --billing-account "$BILLING_ACCOUNT" \
      --display-name "fund-tracer monthly" --budget-amount "${BUDGET_USD:-25}USD" \
      --filter-projects "projects/$PROJECT_ID" --threshold-rule percent=0.5 \
      --threshold-rule percent=0.9 --threshold-rule percent=1.0 >/dev/null
fi

if [ "${SEED:-0}" = "1" ]; then
  echo "› Seeding the MCA master and the source registry into gs://$STATE_BUCKET"
  gcloud storage cp "$HERE"/data/raw/mca_ogd/company_master.part*of5.csv \
    "gs://$STATE_BUCKET/raw/mca_ogd/" --project "$PROJECT_ID"
  gcloud storage cp "$HERE/data/registry/sources.json" "gs://$STATE_BUCKET/registry/sources.json" \
    --project "$PROJECT_ID"
fi

cat <<OUT

Done. Next:
  1. Set repo variable INGEST_ENABLED=true (Settings → Secrets and variables → Actions → Variables);
     the next merge to main builds the image and deploys the jobs and the workflow.
  2. Watch the first runs (dry run: bundles go to gs://$PUBLISH_BUCKET/dry-run, BigQuery to ${DATASET}_dryrun).
  3. After a clean week, set INGEST_PUBLISH_ENABLED=true and redeploy to publish for the app.
  4. Synthetic scoring (off): load the test data with
       npm run synth && FINRAKSHAK_AI_STORAGE=gcs ... node ingest/dist/risk/synthLoadCli.js
     then dry-run the ingest-score job by hand (docs/DEPLOY.md) before setting SCORE_ENABLED=true.
Manual run:  gcloud workflows run ingest-daily --location $REGION --project $PROJECT_ID --data '{}'
OUT
