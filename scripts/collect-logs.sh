#!/usr/bin/env bash
# Saves recent logs and a health snapshot into files you can read yourself or send to a colleague.
#
# Usage: scripts/collect-logs.sh [minutes] [project-id]      (defaults: 60, fund-tracer)
# Needs: gcloud signed in with log and project read access (the owner and Sanchit both have it).
# Writes: logs/<UTC time>/  (ignored by git). See docs/LOGS.md for how to read the files.
#
# Nothing here contains passwords, questions or answers, names or email addresses: the functions never log
# them. Files do contain user IDs (they let you follow one person's requests), so share them only with people
# who already have access to the project.
set -uo pipefail

MINUTES="${1:-60}"
PROJECT="${2:-fund-tracer}"
REPO="Sanchit-Datir/fund-tracer"
OUT="logs/$(date -u +%Y%m%dT%H%M%SZ)"
FUNCTIONS=(getprofile askgemini health)
failed=()
mkdir -p "$OUT"

section() { printf '› %s\n' "$1"; }
note_failure() {
  failed+=("$1")
  printf 'FAILED: %s\n' "$1" >>"$2"
}

# ---- 1. function logs (raw JSON, then readable text, warnings and errors, sign-in checks)
section "function logs, last $MINUTES minutes"
SERVICE_FILTER=""
for f in "${FUNCTIONS[@]}"; do
  SERVICE_FILTER="${SERVICE_FILTER:+$SERVICE_FILTER OR }resource.labels.service_name=\"$f\""
done
if gcloud logging read "resource.type=\"cloud_run_revision\" AND ($SERVICE_FILTER)" \
  --project "$PROJECT" --freshness "${MINUTES}m" --limit 3000 --order asc --format json \
  >"$OUT/functions.json" 2>"$OUT/functions.stderr"; then
  rm -f "$OUT/functions.stderr"
  python3 -I - "$OUT" <<'PY'
import json, sys
out = sys.argv[1]
entries = json.load(open(out + "/functions.json"))
def line(e):
    payload = e.get("jsonPayload") or {}
    text = e.get("textPayload") or payload.get("message") or ""
    extra = {k: v for k, v in payload.items() if k not in ("message", "logging.googleapis.com/labels")}
    http = e.get("httpRequest")
    if http and not text:
        text = "HTTP %s %s" % (http.get("status"), http.get("requestMethod"))
    text = " ".join(str(text).split())[:400]
    fields = (" " + json.dumps(extra, separators=(",", ":"))[:300]) if extra else ""
    return "%s %-10s %-8s %s%s" % (
        e.get("timestamp", "")[:23] + "Z",
        e.get("resource", {}).get("labels", {}).get("service_name", "?"),
        e.get("severity", "DEFAULT"),
        text, fields)
lines = [line(e) for e in entries]
open(out + "/functions.txt", "w").write("\n".join(lines) + ("\n" if lines else ""))
bad = [l for l, e in zip(lines, entries) if e.get("severity") in ("WARNING", "ERROR", "CRITICAL", "ALERT", "EMERGENCY")]
open(out + "/errors.txt", "w").write("\n".join(bad) + ("\n" if bad else "(no warnings or errors in this window)\n"))
checks = []
counts = {}
for e in entries:
    v = (e.get("jsonPayload") or {}).get("verifications")
    if v:
        key = "app=%s auth=%s" % (v.get("app"), v.get("auth"))
        counts[key] = counts.get(key, 0) + 1
        checks.append("%s %-10s %s" % (e.get("timestamp", "")[:23] + "Z", e["resource"]["labels"]["service_name"], key))
head = ["Sign-in checks the functions made (app = App Check token, auth = Firebase sign-in).",
        "app=MISSING means the page sent no App Check token; app=VALID auth=VALID means both passed.", ""]
head += ["  %4d x  %s" % (n, k) for k, n in sorted(counts.items(), key=lambda kv: -kv[1])] or ["  (no checks in this window)"]
open(out + "/sign-in-checks.txt", "w").write("\n".join(head + [""] + checks) + "\n")
print("  %d log entries, %d warnings/errors" % (len(entries), len(bad)))
PY
else
  note_failure "reading function logs ($(head -c 200 "$OUT/functions.stderr" 2>/dev/null | tr '\n' ' '))" "$OUT/functions.txt"
fi

# ---- 2. services: which are public, who they run as, how far they can scale
section "Cloud Run services"
{
  gcloud run services list --project "$PROJECT" \
    --format="value(metadata.name,metadata.labels['cloud.googleapis.com/location'],spec.template.spec.serviceAccountName,spec.template.metadata.annotations['autoscaling.knative.dev/maxScale'])" 2>&1 |
    while read -r name location account maxscale; do
      [ -z "${name:-}" ] && continue
      if gcloud run services get-iam-policy "$name" --region "$location" --project "$PROJECT" \
        --format="value(bindings.members)" 2>/dev/null | grep -q allUsers; then access="PUBLIC (anyone may call)"; else access="private"; fi
      printf '%-12s region=%-12s access=%-24s max-instances=%-4s runs-as=%s\n' "$name" "$location" "$access" "${maxscale:-default}" "$account"
    done
} >"$OUT/cloud-run-services.txt" 2>&1 || note_failure "listing Cloud Run services" "$OUT/cloud-run-services.txt"

# ---- 3. what the functions' accounts are allowed to do (the cause of "permission denied" errors)
section "permissions of the accounts the functions run as"
python3 -I - "$PROJECT" >"$OUT/runtime-permissions.txt" 2>&1 <<'PY' || note_failure "reading permissions" "$OUT/runtime-permissions.txt"
import json, subprocess, sys
project = sys.argv[1]
number = subprocess.run(["gcloud", "projects", "describe", project, "--format=value(projectNumber)"], capture_output=True, text=True).stdout.strip()
policy = json.loads(subprocess.run(["gcloud", "projects", "get-iam-policy", project, "--format=json"], capture_output=True, text=True).stdout)
accounts = ["%s-compute@developer.gserviceaccount.com" % number, "%s@appspot.gserviceaccount.com" % project]
print("Project roles of the accounts Cloud Run functions run as.")
print("The functions need Firestore access (roles/datastore.user) to load profiles and count daily AI use.\n")
for a in accounts:
    roles = sorted(b["role"] for b in policy.get("bindings", []) if "serviceAccount:" + a in b.get("members", []))
    print(a)
    for r in roles or ["(no project roles)"]:
        print("   ", r)
    print("    Firestore access:", "YES" if "roles/datastore.user" in roles or "roles/editor" in roles or "roles/owner" in roles else "NO  <-- profile lookups would fail with PERMISSION_DENIED")
    print()
PY

# ---- 4. recent deploys and the live site release
section "recent deploys"
python3 -I - "$REPO" "$PROJECT" >"$OUT/deploys.txt" 2>&1 <<'PY' || note_failure "reading deploys" "$OUT/deploys.txt"
import json, subprocess, sys, urllib.request
repo, project = sys.argv[1], sys.argv[2]
print("Latest GitHub workflow runs (all branches):")
try:
    with urllib.request.urlopen("https://api.github.com/repos/%s/actions/runs?per_page=12" % repo, timeout=20) as r:
        for run in json.load(r)["workflow_runs"]:
            print("  %s  %-16s %-12s %-24s %s/%s" % (run["created_at"], run["name"][:16], run["event"], (run["head_branch"] or "")[:24], run["status"], run["conclusion"]))
except Exception as e:
    print("  could not read GitHub:", e)
print("\nLatest website release (Firebase Hosting):")
token = subprocess.run(["gcloud", "auth", "print-access-token"], capture_output=True, text=True).stdout.strip()
req = urllib.request.Request("https://firebasehosting.googleapis.com/v1beta1/sites/%s/releases?pageSize=3" % project,
                             headers={"Authorization": "Bearer " + token, "x-goog-user-project": project})
try:
    with urllib.request.urlopen(req, timeout=20) as r:
        for rel in json.load(r).get("releases", []):
            print("  %s  by %s" % (rel["releaseTime"], (rel.get("releaseUser") or {}).get("email", "?")))
except Exception as e:
    print("  could not read Hosting:", e)
PY

# ---- 5. a note on what is in the folder
cat >"$OUT/README.txt" <<README
Collected: $(date -u +%Y-%m-%dT%H:%M:%SZ)   Project: $PROJECT   Window: last $MINUTES minutes

  errors.txt              warnings and errors only: start here
  sign-in-checks.txt      App Check / sign-in verdicts per request (app=MISSING means no App Check token)
  functions.txt           every function log line, readable
  functions.json          the same, raw (for searching with other tools)
  cloud-run-services.txt  which functions are public, who they run as, how far they can scale
  runtime-permissions.txt what the functions' accounts may do (permission-denied errors start here)
  deploys.txt             recent GitHub runs and the latest website release

No passwords, questions, answers, names or emails are in these logs. They do contain user IDs.
Share only with people who already have access to the project. Cloud Logging keeps logs for 30 days.
README

printf '\nSaved to %s\n' "$OUT"
ls -1 "$OUT" | sed 's/^/  /'
if [ "${#failed[@]}" -gt 0 ]; then
  printf '\nSome parts could not be collected:\n'
  printf '  - %s\n' "${failed[@]}"
  exit 1
fi
