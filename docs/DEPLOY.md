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

Until these are done the live site is plain demo mode: the login page offers only "Try demo" and the
Cloud & AI tab says "Not connected". Once they are done, people sign in with a real account (email +
password), "Try demo" stays as a second option (and has no cloud or AI features), and each person's name, role
and branch come from a profile you set up in step D. Do them in this order; menu names are the current
Firebase console ones (Security → Authentication, Security → App Check). Console:
<https://console.firebase.google.com/project/fund-tracer>.

**A. Firebase console**

1. **Register the web app** (this is where the config values come from). Project settings (gear) →
   General → Your apps → Add app → Web (`</>`) → nickname `Fund Tracer Web` → leave "Also set up Hosting"
   off → Register app. Note `apiKey`, `authDomain` (`fund-tracer.firebaseapp.com`) and `appId` (starts
   `1:`). Later: Project settings → Your apps → SDK setup and configuration. CLI alternative:
   `firebase apps:create WEB "Fund Tracer Web" --project fund-tracer` then
   `firebase apps:sdkconfig WEB --project fund-tracer`. These values are public, not secrets.
2. **Start sign-in:** Security → Authentication → **Get started** → Sign-in method → **Email/Password** →
   enable (leave "Email link" off) → Save. Then the **Users** tab → Add user (email + password) for each
   person. Anyone with the public config can usually register themselves too, which is safe because nothing is
   usable without a profile (step D).
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

**D. Set up each person (their profile)**

A login alone gets nobody in. Without a profile the login page says "Your account is not set up yet" and
shows the person's **Account ID**, so you can set them up from that.

1. **Create the login:** Authentication → **Users** → Add user (email + password). Copy the **User UID**
   column (or take the Account ID the login page shows after a first sign-in attempt).
2. **Create the profile:** Firebase console → **Firestore Database** → Data → Start collection `users` (first
   time only) → add a document whose **Document ID is that User UID**, with these fields:

   | Field        | Type    | Value                                                                               |
   | ------------ | ------- | ----------------------------------------------------------------------------------- |
   | `name`       | string  | Full name shown in the app                                                          |
   | `employeeId` | string  | e.g. `EMP-10233` (may be empty)                                                     |
   | `branchId`   | string  | one of `br-shirur`, `br-junnar`, `br-baramati` (the branches the app knows now)     |
   | `role`       | string  | `branch_officer`, `branch_manager`, `risk_analyst`, `investigator`, `administrator` |
   | `aiEnabled`  | boolean | `true` to allow Gemini; `false` or leave out for no AI                              |
   | `enabled`    | boolean | optional; `false` switches the person off without deleting the profile              |

   Spelling matters: a wrong role, an empty name or a text value in a true/false field makes the profile
   invalid, and the person stays locked out (the check fails closed).

3. The person signs in on the login page with their email and password and lands in the app under their own
   name, role and branch. The app's data is still the built-in demo data until real data is added.
4. With `aiEnabled: true`, Settings → **Cloud & AI** → Ask. Each billed call is counted against the daily limit
   (30 per Indian day by default) and billed to the Gemini key, a free-tier key, so use made-up data only.

"Try demo" stays on the login page unless you set the GitHub variable `VITE_ENABLE_DEMO` to `false` and
redeploy. A demo session never reaches the cloud features.

`askgemini` is already publicly invokable at the network level (the Firebase CLI set this when the
function was first deployed; `health` is private). That is normal for a callable, because the function
itself rejects requests without sign-in and an App Check token. What actually protects it: sign-in, App
Check, the profile check and the daily limit. Check any time with
`gcloud run services get-iam-policy askgemini --region asia-south1 --project fund-tracer`, and look for
unexpected traffic under Cloud Run → askgemini → Logs.

Locally, `npm run serve -w functions` plus `VITE_USE_EMULATORS=true npm run dev -w web` use the Auth and
Functions emulators, the free mock and a built-in dev profile (no Firestore needed), so nothing is billed. The security headers in
`web/security-headers.ts` and `firebase.json` allow only the Google hosts these features need.

## Adding a brand-new function

A new callable must be made reachable by browsers when it is first created. `github-deployer` can do this
itself through the narrow custom role `ciFunctionInvoker` (only get/set access policy on functions and
Cloud Run services; created by `scripts/setup-gcp.sh`). If a first deploy still fails with "Unable to set
the invoker", run once, deliberately, as the project owner:

```bash
gcloud run services add-iam-policy-binding <function-name-in-lowercase> --region asia-south1 \
  --project fund-tracer --member allUsers --role roles/run.invoker
```

and re-run the Deploy. This only makes the function _reachable_: every callable must itself reject callers
without sign-in and App Check (see the existing ones). Never do this for a function that skips those checks.

## When a deploy fails

- **Permission denied on one API:** read the error, add that single role to `github-deployer`.
- **Bad release:** revert the merge commit on `main`; the same pipeline redeploys the old code.
  Hosting also keeps every version (Firebase console → Hosting → Release history → Rollback).
- **Cost:** deploys only run on merges to `main` and non-docs PRs. A Functions deploy uses Cloud
  Build (inside the free allowance) and leaves a container image; the cleanup policy removes old ones.
