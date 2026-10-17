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

Until these are done the live site shows **Cloud & AI → "Not connected"** (demo mode, no AI calls). Do
them in this order; menu names are the current Firebase console ones (Security → Authentication, Security
→ App Check). Console: <https://console.firebase.google.com/project/fund-tracer>.

**A. Firebase console**

1. **Register the web app** (this is where the config values come from). Project settings (gear) →
   General → Your apps → Add app → Web (`</>`) → nickname `Fund Tracer Web` → leave "Also set up Hosting"
   off → Register app. Note `apiKey`, `authDomain` (`fund-tracer.firebaseapp.com`) and `appId` (starts
   `1:`). Later: Project settings → Your apps → SDK setup and configuration. CLI alternative:
   `firebase apps:create WEB "Fund Tracer Web" --project fund-tracer` then
   `firebase apps:sdkconfig WEB --project fund-tracer`. These values are public, not secrets.
2. **Start sign-in:** Security → Authentication → **Get started** → Sign-in method → **Email/Password** →
   enable (leave "Email link" off) → Save. Then the **Users** tab → Add user (email + password) for each
   person. Anyone with the public config can usually register themselves too, which is safe because billed
   AI is limited to the allow-list in step D.
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

**D. First use and the allow-list**

1. Open <https://fund-tracer.web.app>, use the demo sign-in, then Settings → **Cloud & AI** and sign in with
   a user from step A2. The page shows your **Account ID**; copy it.
2. Firebase console → **Firestore Database** → Data → Start collection `allowedUsers` (first time only).
   Add a document whose **Document ID is the Account ID**; optional field `email` (string) is only a
   label. To switch someone off set `enabled` (boolean) to `false`, or delete the document. Do **not** key
   it by email: nothing checks that a person owns the email they register with, but nobody can choose their
   own Account ID.
3. Ask a question. Allowed accounts get a live reply; everyone else gets "not enabled". The reply is billed
   to the Gemini key and counted against the daily limit (30 per Indian day by default). The key is a
   free-tier key, so use made-up data only.

`askgemini` is already publicly invokable at the network level (the Firebase CLI set this when the
function was first deployed; `health` is private). That is normal for a callable, because the function
itself rejects requests without sign-in and an App Check token. What actually protects it: sign-in, App
Check, the allow-list and the daily limit. Check any time with
`gcloud run services get-iam-policy askgemini --region asia-south1 --project fund-tracer`, and look for
unexpected traffic under Cloud Run → askgemini → Logs.

Locally, `npm run serve -w functions` plus `VITE_USE_EMULATORS=true npm run dev -w web` use the Auth and
Functions emulators and the free mock, so nothing is billed. The security headers in
`web/security-headers.ts` and `firebase.json` allow only the Google hosts these features need.

## When a deploy fails

- **Permission denied on one API:** read the error, add that single role to `github-deployer`.
- **Bad release:** revert the merge commit on `main`; the same pipeline redeploys the old code.
  Hosting also keeps every version (Firebase console → Hosting → Release history → Rollback).
- **Cost:** deploys only run on merges to `main` and non-docs PRs. A Functions deploy uses Cloud
  Build (inside the free allowance) and leaves a container image; the cleanup policy removes old ones.
