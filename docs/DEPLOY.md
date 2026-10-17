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

The web app stays in demo mode (no cloud calls, no AI) until it is built with the Firebase web
config. Steps that only a project owner can do:

1. **Enable sign-in:** Firebase console → Authentication → Sign-in method → Email/Password. Anyone who
   has the public web config can usually register an account themselves, so signing in proves nothing
   by itself. That is safe, because billed AI is limited to the **allow-list** in step 6: a stranger's
   account signs in but gets "not enabled" and costs nothing. If your console offers Authentication →
   Settings → User actions → "Enable create (sign-up)", turning it off is a good extra layer.
2. **App Check:** create a reCAPTCHA v3 site key at <https://www.google.com/recaptcha/admin>
   (domains: `fund-tracer.web.app`, `fund-tracer.firebaseapp.com`), then Firebase console → App Check →
   Apps → register the web app with reCAPTCHA v3 and paste the **secret** key there. Keep the secret
   key out of the repo.
3. **GitHub repo variables** (Settings → Secrets and variables → Actions → Variables; all public
   values): `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_APP_ID`,
   `VITE_RECAPTCHA_SITE_KEY` (from Firebase console → Project settings → Your apps).
4. **Let browsers reach the function:** a callable must be publicly invokable at the network level;
   sign-in, App Check and the daily limit are what actually protect it. Grant once, deliberately:

   ```bash
   gcloud run services add-iam-policy-binding askgemini --region asia-south1 \
     --project fund-tracer --member allUsers --role roles/run.invoker
   ```

5. Open **Settings → Cloud & AI** and sign in. The page shows your **Account ID**.
6. **Enable people for AI (the allow-list).** Firebase console → Firestore Database → Data → Start
   collection `allowedUsers` (first time only). Add a document whose **Document ID is the person's Account
   ID**: copy it from the Cloud & AI tab, or from Authentication → Users → "User UID". Optional field
   `email` (string) is just a label for you. To switch someone off set `enabled` (boolean) to `false`, or
   delete the document. Do **not** key it by email: nothing checks that a person owns the email they
   register with, but nobody can choose their own Account ID.
7. Ask a question. When the live model is on, allowed accounts get a reply and everyone else gets "not
   enabled" (the free mock used locally and in tests is not gated). Each billed call costs one Firestore
   read for this check, well inside the free quota.

Locally, `npm run serve -w functions` plus `VITE_USE_EMULATORS=true npm run dev -w web` use the Auth
and Functions emulators and the free mock, so nothing is billed. The security headers in
`web/security-headers.ts` and `firebase.json` allow only the Google hosts these features need.

## When a deploy fails

- **Permission denied on one API:** read the error, add that single role to `github-deployer`.
- **Bad release:** revert the merge commit on `main`; the same pipeline redeploys the old code.
  Hosting also keeps every version (Firebase console → Hosting → Release history → Rollback).
- **Cost:** deploys only run on merges to `main` and non-docs PRs. A Functions deploy uses Cloud
  Build (inside the free allowance) and leaves a container image; the cleanup policy removes old ones.
