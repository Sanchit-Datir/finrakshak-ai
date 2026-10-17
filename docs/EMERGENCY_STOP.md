# Emergency stop

A budget alert only emails you. When spending is running away, this is how you stop it.

## The one-click button (soft stop)

1. GitHub → the repo → **Actions** tab → **Emergency stop** in the left list.
2. **Run workflow** → leave the pre-filled `STOP` → **Run workflow** (the green button).
3. Open the run and wait about a minute. The log ends with `STOPPED`.

It does two things, and **deletes nothing**:

- Every **Cloud Run service** (our functions, and any agent service) loses its public "anyone may call"
  entry, so no outside request reaches it. The login and AI features stop working.
- The **Vertex AI API is switched off**, so models and agents stop being callable.

The website itself (static, free) and the demo mode keep working.

Anyone with write access to the repo can press it. That is deliberate: stopping only reduces spend. It runs as
`github-emergency-stop`, an account that can do nothing else, and Google lets only this workflow file on `main`
use it, so changing it needs a reviewed merge.

**Rehearsal.** Tick **Rehearsal** before **Run workflow** to see exactly what it would do without changing
anything. Do this now and then (and after changing the project) so you know the button works before you need it.

## Switching back on (the owner, on purpose)

Restoring re-opens spending, so it is not a button. As the project owner, signed in with `gcloud auth login`:

```bash
scripts/emergency-restore.sh fund-tracer
```

It re-enables Vertex AI and makes `askgemini` and `getprofile` reachable again (they still require sign-in and
App Check). Any other service, such as an agent service, stays private until you reopen it yourself. Add
`--dry-run` to preview. Then check the site and watch the budget alerts.

## Last resort: the hard stop

If the soft stop is not enough, unlink billing. Paid services stop, and the project falls back to free quotas:

```bash
gcloud billing projects unlink fund-tracer
```

To undo it:

```bash
gcloud billing projects link fund-tracer --billing-account=018788-7F1F29-2EEFE0
```

Google warns that some resources can be shut down, and possibly deleted, if billing stays off for a long time.
Relink promptly, and redeploy anything that did not come back. This is a command for the owner, not a button.

## What this cannot do

- **Budgets arrive hours late**, so any stop happens after the money is spent. The only real cap on Vertex AI
  spending is a **quota limit** on the project (Console → IAM & Admin → Quotas).
- It does not touch Firestore, Cloud Storage, Cloud Build, Artifact Registry, BigQuery or Secret Manager.
  Their idle cost is tiny; check the billing report if one of them is the cause.
- It stops **callers**, not compute that is already running. A Cloud Run service with a minimum number of
  instances, or an agent that runs on a schedule, can keep billing while private. I could not verify whether
  an already-deployed Agent Engine agent keeps billing once the API is off.
- The Gemini key is a free-tier key from AI Studio and is outside this project's billing.

## Keeping it honest

When a new paid service is added, add it to `scripts/emergency-stop.sh` and, if it needs a permission, to the
`emergencyStop` role in `scripts/setup-gcp.sh`, then rehearse.
