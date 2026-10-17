#!/usr/bin/env bash
# Deploys an already-pushed ingest image to the Cloud Run jobs and (re)deploys the workflow.
# Called by .github/workflows/deploy.yml on main; can also be run from Cloud Shell.
# Usage: scripts/deploy-ingest.sh <project-id> <image-uri> [region]
# Env: PUBLISH_ENABLED=true|false (default false = dry run), MAX_DOCS_PER_SOURCE (default 300/run)
set -euo pipefail

PROJECT_ID="${1:?usage: scripts/deploy-ingest.sh <project-id> <image-uri> [region]}"
IMAGE="${2:?usage: scripts/deploy-ingest.sh <project-id> <image-uri> [region]}"
REGION="${3:-asia-south1}"
RUNNER_SA="ingest-runner@${PROJECT_ID}.iam.gserviceaccount.com"
ORCH_SA="ingest-orchestrator@${PROJECT_ID}.iam.gserviceaccount.com"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Shared by every job; parsed and validated by ingest/src/config.ts and ingest/src/cloud/env.ts.
ENV_VARS="FUNDTRACE_STORAGE=gcs,FUNDTRACE_PROJECT_ID=$PROJECT_ID,FUNDTRACE_COORDINATION=firestore"
ENV_VARS+=",FUNDTRACE_RAW_BUCKET=$PROJECT_ID-ingest-raw,FUNDTRACE_STATE_BUCKET=$PROJECT_ID-ingest-state"
ENV_VARS+=",FUNDTRACE_PUBLISH_BUCKET=$PROJECT_ID-ingest-publish"
ENV_VARS+=",FUNDTRACE_BIGQUERY_DATASET=fundtrace_public,FUNDTRACE_BIGQUERY_LOCATION=$REGION"
ENV_VARS+=",FUNDTRACE_PUBLISH_ENABLED=${PUBLISH_ENABLED:-false}"
ENV_VARS+=",FUNDTRACE_MAX_DOCS_PER_SOURCE=${MAX_DOCS_PER_SOURCE:-300}"

deploy_job() { # <name> <task> <tasks> <timeout> <retries> <cpu> <memory>
  gcloud run jobs deploy "$1" --project "$PROJECT_ID" --region "$REGION" --image "$IMAGE" \
    --service-account "$RUNNER_SA" --args "$2" --tasks "$3" --parallelism "$3" \
    --task-timeout "$4" --max-retries "$5" --cpu "$6" --memory "$7" \
    --set-env-vars "$ENV_VARS" --quiet
}

# One task per source (round-robin, so the task count can change without code changes).
deploy_job ingest-acquire acquire 6 6h 1 1 1Gi
deploy_job ingest-build build 1 1h 0 2 4Gi

gcloud workflows deploy ingest-daily --project "$PROJECT_ID" --location "$REGION" \
  --source "$HERE/infra/workflows/ingest-daily.yaml" --service-account "$ORCH_SA" --quiet
echo "Deployed $IMAGE (publish enabled: ${PUBLISH_ENABLED:-false})"
