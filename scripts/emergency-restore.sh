#!/usr/bin/env bash
# Switches things back on after scripts/emergency-stop.sh. Run by the project OWNER, on purpose:
# restoring re-opens spending, so it is deliberately not a button anyone can press.
#
#   1. Re-enables the Vertex AI API.
#   2. Makes our two callable functions (askgemini, getprofile) reachable again. Every callable still
#      rejects callers without sign-in and App Check. Any other Cloud Run service (for example an
#      agent service) stays private: reopen those yourself, only if you want them public.
#
# Usage: scripts/emergency-restore.sh <project-id> [--dry-run]
set -uo pipefail

PROJECT="${1:?usage: scripts/emergency-restore.sh <project-id> [--dry-run]}"
REGION="asia-south1"
DRY=0
[ "${2:-}" = "--dry-run" ] && DRY=1
failures=0

say() { printf '%s\n' "$*"; }
run() {
  if [ "$DRY" = 1 ]; then
    say "  [rehearsal] would run: $*"
  else
    "$@" || {
      say "  FAILED: $*"
      failures=$((failures + 1))
    }
  fi
}

[ "$DRY" = 1 ] && say "REHEARSAL: nothing will be changed."
say "› Re-enabling Vertex AI"
run gcloud services enable aiplatform.googleapis.com --project "$PROJECT"

say "› Making the callable functions reachable again"
for service in askgemini getprofile; do
  run gcloud run services add-iam-policy-binding "$service" --region "$REGION" \
    --project "$PROJECT" --member=allUsers --role=roles/run.invoker --quiet
done

say ""
if [ "$DRY" = 1 ]; then
  say "Rehearsal finished. Nothing was changed."
elif [ "$failures" -eq 0 ]; then
  say "RESTORED. Check the site, and keep an eye on the budget alerts."
else
  say "PARTIAL: $failures step(s) failed (see FAILED lines above)."
  exit 1
fi
