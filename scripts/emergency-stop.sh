#!/usr/bin/env bash
# Emergency SOFT stop. Takes the cloud features offline and switches Vertex AI off, to cap spending fast.
# Nothing is deleted, and everything can be switched back on with scripts/emergency-restore.sh.
#
#   1. Every Cloud Run service (our functions and anything an agent was deployed as) loses its public
#      "anyone may call" entry, so no outside request can reach it.
#   2. The Vertex AI API is disabled, so models and agents stop being callable.
# The static website and the demo mode keep working: they cost nothing.
#
# Usage: scripts/emergency-stop.sh <project-id> [--dry-run]
#   --dry-run  show what would change, change nothing (use it to rehearse the button)
# Needs: gcloud signed in as someone allowed to do this (the GitHub workflow uses a limited account).
set -uo pipefail

PROJECT="${1:?usage: scripts/emergency-stop.sh <project-id> [--dry-run]}"
DRY=0
[ "${2:-}" = "--dry-run" ] && DRY=1
failures=0

say() { printf '%s\n' "$*"; }
# Runs a command (or only prints it in a rehearsal). One failure never stops the other steps.
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
say "Project: $PROJECT"

say ""
say "› 1/2 Making every Cloud Run service private"
services="$(gcloud run services list --project "$PROJECT" \
  --format="value(metadata.name,metadata.labels['cloud.googleapis.com/location'])" 2>&1)" || {
  say "  FAILED to list services: $services"
  failures=$((failures + 1))
  services=""
}
public_count=0
while read -r name location; do
  [ -z "${name:-}" ] && continue
  if gcloud run services get-iam-policy "$name" --region "$location" --project "$PROJECT" \
    --format="value(bindings.members)" 2>/dev/null | grep -q "allUsers"; then
    public_count=$((public_count + 1))
    say "  $name ($location) is public: removing"
    run gcloud run services remove-iam-policy-binding "$name" --region "$location" \
      --project "$PROJECT" --member=allUsers --role=roles/run.invoker --quiet
  else
    say "  $name ($location) already private"
  fi
done <<<"$services"

say ""
say "› 2/2 Switching Vertex AI off"
if gcloud services list --enabled --project "$PROJECT" --format="value(config.name)" 2>/dev/null |
  grep -qx "aiplatform.googleapis.com"; then
  say "  Vertex AI API is on: disabling"
  if [ "$DRY" = 1 ]; then
    say "  [rehearsal] would run: gcloud services disable aiplatform.googleapis.com --project $PROJECT"
  else
    # Plain disable first; --force only if another enabled service depends on it.
    gcloud services disable aiplatform.googleapis.com --project "$PROJECT" --quiet 2>/dev/null ||
      gcloud services disable aiplatform.googleapis.com --project "$PROJECT" --force --quiet || {
        say "  FAILED to disable aiplatform.googleapis.com"
        failures=$((failures + 1))
      }
  fi
else
  say "  Vertex AI API already off"
fi

say ""
say "› Result"
if [ "$DRY" = 1 ]; then
  say "  Rehearsal finished. $public_count public service(s) would be made private. Nothing was changed."
elif [ "$failures" -eq 0 ]; then
  say "  STOPPED. Cloud features are offline and Vertex AI is off. Nothing was deleted."
  say "  To switch back on, the project owner runs: scripts/emergency-restore.sh $PROJECT"
else
  say "  PARTIAL: $failures step(s) failed (see FAILED lines above). Finish by hand, or unlink billing as a last resort:"
  say "    gcloud billing projects unlink $PROJECT"
  exit 1
fi
