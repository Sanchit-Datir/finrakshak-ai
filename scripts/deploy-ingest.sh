#!/usr/bin/env bash
# Deploys an already-pushed ingest image to the Cloud Run jobs and (re)deploys the workflow.
# Called by .github/workflows/deploy.yml on main; can also be run from Cloud Shell.
# Usage: scripts/deploy-ingest.sh <project-id> <image-uri> [region]
# Env: PUBLISH_ENABLED=true|false (default false = dry run), MAX_DOCS_PER_SOURCE (default 300/run),
#      AI_PROVIDER (vertex), AI_MODEL, AI_LOCATION, AGENT_ENABLED (true; false = kill switch),
#      AI_EXTRACT_ENABLED (false), AI_EXTRACT_MAX_DOCS (50/run), SEBI_SAMPLE (false = full index),
#      SCORE_ENABLED (false), SCORE_SETTINGS (v2)
set -euo pipefail

PROJECT_ID="${1:?usage: scripts/deploy-ingest.sh <project-id> <image-uri> [region]}"
IMAGE="${2:?usage: scripts/deploy-ingest.sh <project-id> <image-uri> [region]}"
REGION="${3:-asia-south1}"
RUNNER_SA="ingest-runner@${PROJECT_ID}.iam.gserviceaccount.com"
ORCH_SA="ingest-orchestrator@${PROJECT_ID}.iam.gserviceaccount.com"
AGENT_SA="ingest-agent@${PROJECT_ID}.iam.gserviceaccount.com"
EXTRACTOR_SA="ingest-extractor@${PROJECT_ID}.iam.gserviceaccount.com"
SCORER_SA="ingest-scorer@${PROJECT_ID}.iam.gserviceaccount.com"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Shared by every job; parsed and validated by ingest/src/config.ts and ingest/src/cloud/env.ts.
ENV_VARS="FUNDTRACE_STORAGE=gcs,FUNDTRACE_PROJECT_ID=$PROJECT_ID,FUNDTRACE_COORDINATION=firestore"
ENV_VARS+=",FUNDTRACE_RAW_BUCKET=$PROJECT_ID-ingest-raw,FUNDTRACE_STATE_BUCKET=$PROJECT_ID-ingest-state"
ENV_VARS+=",FUNDTRACE_PUBLISH_BUCKET=$PROJECT_ID-ingest-publish"
ENV_VARS+=",FUNDTRACE_BIGQUERY_DATASET=fundtrace_public,FUNDTRACE_BIGQUERY_LOCATION=$REGION"
ENV_VARS+=",FUNDTRACE_PUBLISH_ENABLED=${PUBLISH_ENABLED:-false}"
ENV_VARS+=",FUNDTRACE_MAX_DOCS_PER_SOURCE=${MAX_DOCS_PER_SOURCE:-300}"
# The cloud lists SEBI's full order index (incremental after the first run).
ENV_VARS+=",FUNDTRACE_SEBI_SAMPLE=${SEBI_SAMPLE:-false}"

# The agent's model: Vertex AI with its own service account (no key), cheapest model by default.
AGENT_ENV="$ENV_VARS,FUNDTRACE_AI_PROVIDER=${AI_PROVIDER:-vertex},FUNDTRACE_AI_MODEL=${AI_MODEL:-gemini-3.1-flash-lite}"
AGENT_ENV+=",FUNDTRACE_AI_LOCATION=${AI_LOCATION:-global},FUNDTRACE_AGENT_ENABLED=${AGENT_ENABLED:-true}"
# AI extraction is off until the owner switches it on (cost, B-15; shadow mode, B-52).
EXTRACT_ENV="$AGENT_ENV,FUNDTRACE_AI_EXTRACT_ENABLED=${AI_EXTRACT_ENABLED:-false}"
EXTRACT_ENV+=",FUNDTRACE_AI_EXTRACT_MAX_DOCS=${AI_EXTRACT_MAX_DOCS:-50}"
# Synthetic risk scoring: plain code, no model (B-15); off until the owner's dry run (W2g).
SCORE_ENV="$ENV_VARS,FUNDTRACE_SCORE_ENABLED=${SCORE_ENABLED:-false},FUNDTRACE_SYNTH_DATASET=fundtrace_synth"
SCORE_ENV+=",FUNDTRACE_SCORE_SETTINGS=${SCORE_SETTINGS:-v2}"

deploy_job() { # <name> <task> <tasks> <timeout> <retries> <cpu> <memory> <service-account> <env>
  gcloud run jobs deploy "$1" --project "$PROJECT_ID" --region "$REGION" --image "$IMAGE" \
    --service-account "$8" --args "$2" --tasks "$3" --parallelism "$3" \
    --task-timeout "$4" --max-retries "$5" --cpu "$6" --memory "$7" \
    --set-env-vars "$9" --quiet
}

# One task per source (round-robin, so the task count can change without code changes).
deploy_job ingest-acquire acquire 6 6h 1 1 1Gi "$RUNNER_SA" "$ENV_VARS"
deploy_job ingest-build build 1 1h 0 2 4Gi "$RUNNER_SA" "$ENV_VARS"
deploy_job ingest-extract extract-ai 1 2h 0 1 1Gi "$EXTRACTOR_SA" "$EXTRACT_ENV"
# The scorer's account comes from scripts/setup-ingest-gcp.sh; until the owner re-runs it, skip the job
# (the workflow then records the score step as failed and carries on).
if gcloud iam service-accounts describe "$SCORER_SA" --project "$PROJECT_ID" >/dev/null 2>&1; then
  deploy_job ingest-score score 1 30m 0 1 1Gi "$SCORER_SA" "$SCORE_ENV"
else
  echo "Skipping ingest-score: $SCORER_SA does not exist yet (re-run scripts/setup-ingest-gcp.sh)"
fi
deploy_job ingest-agent agent 1 15m 0 1 512Mi "$AGENT_SA" "$AGENT_ENV"

gcloud workflows deploy ingest-daily --project "$PROJECT_ID" --location "$REGION" \
  --source "$HERE/infra/workflows/ingest-daily.yaml" --service-account "$ORCH_SA" --quiet
echo "Deployed $IMAGE (publish enabled: ${PUBLISH_ENABLED:-false})"
