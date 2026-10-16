#!/usr/bin/env bash
# One-time, keyless GitHub → Firebase Hosting deploy setup (Spark plan friendly).
# Creates a deploy service account, a Workload Identity pool/provider restricted
# to this GitHub repo, and prints the repo variables for .github/workflows/deploy.yml.
#
# Usage: scripts/setup-gcp.sh <firebase-project-id> [github-owner/repo]
# Needs: gcloud CLI, signed in (`gcloud auth login`) as a project Owner.
set -euo pipefail

PROJECT_ID="${1:?usage: scripts/setup-gcp.sh <firebase-project-id> [owner/repo]}"
REPO="${2:-Sanchit-Datir/fund-tracer}"
SA_NAME="github-deployer"
POOL="github"
PROVIDER="github-oidc"
SA="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"

echo "› Enabling APIs (no billing needed)"
gcloud services enable iamcredentials.googleapis.com sts.googleapis.com \
  firebasehosting.googleapis.com --project "$PROJECT_ID"

echo "› Deploy service account"
gcloud iam service-accounts describe "$SA" --project "$PROJECT_ID" >/dev/null 2>&1 ||
  gcloud iam service-accounts create "$SA_NAME" --project "$PROJECT_ID" \
    --display-name "GitHub Actions deployer"

# Least privilege: Hosting deploys only. Add roles here when Firestore rules or
# Functions join the pipeline (those need more, and Functions needs Blaze).
for role in roles/firebasehosting.admin roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member "serviceAccount:$SA" \
    --role "$role" --condition None >/dev/null
done

echo "› Workload Identity pool + GitHub OIDC provider (only $REPO may use it)"
gcloud iam workload-identity-pools describe "$POOL" --location global --project "$PROJECT_ID" >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools create "$POOL" --location global --project "$PROJECT_ID" \
    --display-name "GitHub Actions"
gcloud iam workload-identity-pools providers describe "$PROVIDER" --location global \
  --workload-identity-pool "$POOL" --project "$PROJECT_ID" >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" --location global \
    --workload-identity-pool "$POOL" --project "$PROJECT_ID" \
    --issuer-uri "https://token.actions.githubusercontent.com" \
    --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository" \
    --attribute-condition "assertion.repository == '$REPO'"

gcloud iam service-accounts add-iam-policy-binding "$SA" --project "$PROJECT_ID" \
  --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/attribute.repository/$REPO" \
  >/dev/null

cat <<OUT

Done. Add these GitHub repo variables (Settings → Secrets and variables → Actions → Variables):
  FIREBASE_PROJECT_ID = $PROJECT_ID
  WIF_PROVIDER        = projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/providers/$PROVIDER
  DEPLOY_SA           = $SA
Plus the web app config from Firebase console → Project settings → Your apps:
  VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_APP_ID
Optional: VITE_RECAPTCHA_SITE_KEY (App Check), VITE_GEMINI_MODEL
OUT
