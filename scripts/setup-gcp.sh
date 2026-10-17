#!/usr/bin/env bash
# One-time, keyless GitHub → Firebase/Google Cloud deploy setup. Safe to re-run.
#
# Creates a Workload Identity pool + GitHub OIDC provider that only $REPO can use, and two
# deploy service accounts with different powers:
#   github-preview  any branch/PR in the repo  → Hosting preview channels only
#   github-deployer only refs/heads/main       → Hosting, Functions, Firestore rules/indexes
#   github-emergency-stop  only emergency-stop.yml on main → make Cloud Run services private, switch an API off
# A pull-request branch can therefore never deploy Functions or change rules.
#
# Usage: scripts/setup-gcp.sh <firebase-project-id> [github-owner/repo]
# Needs: gcloud CLI, signed in (`gcloud auth login`) as a project Owner.
set -euo pipefail

PROJECT_ID="${1:?usage: scripts/setup-gcp.sh <firebase-project-id> [owner/repo]}"
REPO="${2:-Sanchit-Datir/fund-tracer}"
POOL="github"
PROVIDER="github-oidc"
PREVIEW_SA="github-preview@${PROJECT_ID}.iam.gserviceaccount.com"
DEPLOY_SA="github-deployer@${PROJECT_ID}.iam.gserviceaccount.com"
STOP_SA="github-emergency-stop@${PROJECT_ID}.iam.gserviceaccount.com"

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
# Gen2 functions run as one of these default accounts, depending on the firebase-tools version
# (older: compute; 15.x: App Engine). The deployer must be able to act as whichever is used.
RUNTIME_SAS=(
  "${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
  "${PROJECT_ID}@appspot.gserviceaccount.com"
)
POOL_PATH="projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL"
# job_workflow_ref names the exact workflow file (and branch) a run came from, so one workflow file can be
# trusted with a special account without trusting every other workflow in the repo.
ATTRIBUTE_MAPPING="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref,attribute.job_workflow_ref=assertion.job_workflow_ref"

ensure_sa() { # <email> <display name>
  gcloud iam service-accounts describe "$1" --project "$PROJECT_ID" >/dev/null 2>&1 ||
    gcloud iam service-accounts create "${1%%@*}" --project "$PROJECT_ID" --display-name "$2"
}
grant() { # <service-account> <role...>
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

echo "› Enabling APIs"
gcloud services enable iamcredentials.googleapis.com sts.googleapis.com \
  firebasehosting.googleapis.com --project "$PROJECT_ID"

echo "› Service accounts"
ensure_sa "$PREVIEW_SA" "GitHub Actions: Hosting previews"
ensure_sa "$DEPLOY_SA" "GitHub Actions: deploy from main"
ensure_sa "$STOP_SA" "GitHub Actions: emergency stop"

echo "› Roles (least privilege)"
grant "$PREVIEW_SA" roles/firebasehosting.admin roles/firebase.viewer \
  roles/serviceusage.serviceUsageConsumer
grant "$DEPLOY_SA" roles/firebasehosting.admin roles/firebase.viewer \
  roles/firebaserules.admin roles/datastore.indexAdmin roles/cloudfunctions.developer \
  roles/run.viewer roles/secretmanager.viewer roles/artifactregistry.reader \
  roles/serviceusage.serviceUsageConsumer
# Deploying a function means "acting as" its runtime account: grant that on those accounts only.
for runtime_sa in "${RUNTIME_SAS[@]}"; do
  gcloud iam service-accounts add-iam-policy-binding "$runtime_sa" --project "$PROJECT_ID" \
    --member "serviceAccount:$DEPLOY_SA" --role roles/iam.serviceAccountUser >/dev/null
done

# Emergency stop (scripts/emergency-stop.sh): may only change who can call Cloud Run services and switch an
# API off. It cannot deploy, delete, read data or secrets, change billing, or turn anything ON.
STOP_ROLE="emergencyStop"
STOP_PERMISSIONS="run.services.list,run.services.get,run.services.getIamPolicy,run.services.setIamPolicy,serviceusage.services.list,serviceusage.services.get,serviceusage.services.disable,serviceusage.services.use"
if gcloud iam roles describe "$STOP_ROLE" --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam roles update "$STOP_ROLE" --project "$PROJECT_ID" --permissions "$STOP_PERMISSIONS" --quiet >/dev/null
else
  gcloud iam roles create "$STOP_ROLE" --project "$PROJECT_ID" --stage GA \
    --title "Emergency stop" \
    --description "Lets the emergency-stop workflow make Cloud Run services private and switch an API off. Nothing else." \
    --permissions "$STOP_PERMISSIONS" >/dev/null
fi
grant "$STOP_SA" "projects/$PROJECT_ID/roles/$STOP_ROLE"

echo "› Workload Identity pool + GitHub OIDC provider (only $REPO may use it)"
gcloud iam workload-identity-pools describe "$POOL" --location global --project "$PROJECT_ID" >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools create "$POOL" --location global --project "$PROJECT_ID" \
    --display-name "GitHub Actions"
gcloud iam workload-identity-pools providers describe "$PROVIDER" --location global \
  --workload-identity-pool "$POOL" --project "$PROJECT_ID" >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" --location global \
    --workload-identity-pool "$POOL" --project "$PROJECT_ID" \
    --issuer-uri "https://token.actions.githubusercontent.com" \
    --attribute-mapping "$ATTRIBUTE_MAPPING" \
    --attribute-condition "assertion.repository == '$REPO'"
# Providers created by an older version of this script lack the workflow claim: add it (safe to repeat).
gcloud iam workload-identity-pools providers update-oidc "$PROVIDER" --location global \
  --workload-identity-pool "$POOL" --project "$PROJECT_ID" \
  --attribute-mapping "$ATTRIBUTE_MAPPING" >/dev/null

# Previews: any run from this repo. Deploys: only runs on main (the provider already pins the repo).
gcloud iam service-accounts add-iam-policy-binding "$PREVIEW_SA" --project "$PROJECT_ID" \
  --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/$POOL_PATH/attribute.repository/$REPO" >/dev/null
gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA" --project "$PROJECT_ID" \
  --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/$POOL_PATH/attribute.ref/refs/heads/main" >/dev/null

# The stop account can be used ONLY by .github/workflows/emergency-stop.yml running on main.
gcloud iam service-accounts add-iam-policy-binding "$STOP_SA" --project "$PROJECT_ID" \
  --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/$POOL_PATH/attribute.job_workflow_ref/$REPO/.github/workflows/emergency-stop.yml@refs/heads/main" >/dev/null

cat <<OUT

Done. The workflow has these values as defaults; override them with GitHub repo variables
(Settings → Secrets and variables → Actions → Variables) only if you change them:
  FIREBASE_PROJECT_ID = $PROJECT_ID
  WIF_PROVIDER        = $POOL_PATH/providers/$PROVIDER
  PREVIEW_SA          = $PREVIEW_SA
  DEPLOY_SA           = $DEPLOY_SA
  STOP_SA             = $STOP_SA
Web app config (public, not secret) from Firebase console → Project settings → Your apps:
  VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_APP_ID
OUT
