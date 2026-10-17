# Logs and diagnostics

When someone cannot sign in or an AI request fails, start here.

## Save the logs to files

```bash
gcloud auth login
```

```bash
scripts/collect-logs.sh 60
```

The number is how many minutes back to look (default 60). It writes a folder `logs/<UTC time>/` (ignored by
git) with:

| File                      | What it tells you                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| `errors.txt`              | Warnings and errors only. **Start here.**                                                 |
| `sign-in-checks.txt`      | For each request: was the App Check token present (`app`) and the sign-in valid (`auth`)? |
| `functions.txt`           | Every function log line, readable. `functions.json` is the same, raw.                     |
| `cloud-run-services.txt`  | Which functions are public, who they run as, how many copies they may scale to.           |
| `runtime-permissions.txt` | What the functions' accounts may do. Permission-denied errors start here.                 |
| `deploys.txt`             | Recent GitHub runs and the latest website release (did the deploy actually finish?).      |

You need to be signed in to Google with access to the project (the owner and Sanchit both are). Cloud Logging
keeps logs for 30 days. The same logs are live at
[Logs Explorer](https://console.cloud.google.com/logs/query?project=fund-tracer).

## What is logged, and what never is

One structured line per event, always with the person's **user ID** so one person's requests can be followed:

- `getProfile`: `outcome` is `ok` or `not_set_up`; failures log the error type and code.
- `askGemini`: `outcome: ok` with only the **sizes** of the question and reply, whether it was the mock, and
  the allowance left; refusals log why (not enabled, daily limit, rate limit); lookup failures log the cause.

Never logged: passwords, questions, answers, names, email addresses. A test checks this. Share the files only with
people who already have project access, because user IDs are in them.

## The reference on the login screen

If the profile cannot be loaded the login page shows a line such as
`functions/internal / profile_lookup_failed @ 2026-10-17T12:00:00.000Z`. It has no personal data. Ask the person to
read it out: the time lets you find the matching entry in `errors.txt`.

## Reading the common failures

| You see                                                               | It means                                                                                | Fix                                                                                                                                                       |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sign-in-checks.txt`: `app=MISSING auth=VALID`                        | The page sent no App Check token. Usually the browser blocked it or the key is missing. | Check the browser console for a Content-Security-Policy error; check `VITE_RECAPTCHA_SITE_KEY` is in the live build and the page is on an allowed domain. |
| `getProfile` `outcome: not_set_up`                                    | Signed in fine, but there is no valid `users/<user ID>` document.                       | Add or correct the profile (`docs/DEPLOY.md`, step D).                                                                                                    |
| `getProfile: profile lookup failed` with `PERMISSION_DENIED` (code 7) | The functions' account cannot read Firestore.                                           | `runtime-permissions.txt` shows `Firestore access: NO`; re-run `scripts/setup-gcp.sh`.                                                                    |
| `askGemini: refused, AI not enabled for this account`                 | The profile has `aiEnabled` off or missing.                                             | Set `aiEnabled: true` on that person's profile.                                                                                                           |
| `askGemini: access or usage lookup failed`                            | The AI access check or daily counter could not reach Firestore.                         | Same as the permission row above.                                                                                                                         |
| `rate limited`                                                        | Someone sent too many requests in a minute (5 asks, 20 profile loads).                  | Usually a loop; wait a minute.                                                                                                                            |
| `deploys.txt` shows a red run, or the website release is old          | The latest merge did not deploy, so the live site is still the previous version.        | Open the failed run in GitHub Actions.                                                                                                                    |
