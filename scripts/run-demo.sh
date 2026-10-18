#!/usr/bin/env bash
# Plays the FinRakshak demo scenarios in a visible browser against the hosted app
# (https://finrakshak-ai.web.app by default), so you can screen-record them.
#
# Usage: scripts/run-demo.sh          open the launcher page (one Start button per scenario)
#        scripts/run-demo.sh 1|2|3    play one scenario
#        scripts/run-demo.sh all      play scenarios 1, 2 and 3 one after another
#
# First run: installs the dependencies and Playwright's Chromium, and asks for the demo account's
# password. It is saved only in e2e/demo/.env (git-ignored); press Enter to use quick sign-in instead.
# All settings: e2e/demo/README.md.
set -euo pipefail
cd "$(dirname "$0")/.."

target="${1:-launcher}"
case "$target" in
  launcher | 1 | 2 | 3 | all) ;;
  *)
    echo "Usage: $0 [1|2|3|all]" >&2
    exit 2
    ;;
esac

# The launcher uses Node's built-in TypeScript support (Node 22.6 or later).
if ! command -v node > /dev/null; then
  echo "Install Node.js 22 or later first: https://nodejs.org" >&2
  exit 1
fi
if ! node -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 22 || (a === 22 && b >= 6) ? 0 : 1)'; then
  echo "Node $(node -v) is too old: install Node 22.6 or later." >&2
  exit 1
fi

[ -d node_modules/@playwright/test ] || npm ci
# Downloads Chromium the first time; quick when it is already installed.
npm exec -w e2e -- playwright install chromium

env_file=e2e/demo/.env
if [ ! -f "$env_file" ]; then
  read -r -s -p "Password for the demo account (press Enter to use quick sign-in): " password
  echo
  if [ -n "$password" ]; then
    quote="'"
    case "$password" in *"'"*) quote='"' ;; esac
    { grep -v '^DEMO_PASSWORD=' e2e/demo/.env.example; echo "DEMO_PASSWORD=${quote}${password}${quote}"; } > "$env_file"
  else
    { grep -v '^DEMO_SIGN_IN=' e2e/demo/.env.example; echo 'DEMO_SIGN_IN=quick'; } > "$env_file"
  fi
  chmod 600 "$env_file"
  echo "Saved your settings in $env_file (edit it to change the URL, pace or sign-in)."
fi

case "$target" in
  launcher) exec npm run demo ;;
  all) for n in 1 2 3; do npm run "demo:$n"; done ;;
  *) exec npm run "demo:$target" ;;
esac
