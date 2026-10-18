# Demo-video scripts

Playwright scripts that play the three showcase scenarios in a visible browser, step by step, so
you can screen-record a demo of the prototype. Each scenario is its own script and starts from the
sign-in page in a fresh browser. A small local launcher page starts them with one click.

**Where things run:** the app is the hosted site, **https://finrakshak-ai.web.app** (`DEMO_BASE_URL`);
nothing of the app is built or served on your computer. Playwright only opens a browser window on
your computer, goes to that URL and clicks through it, so your screen recorder can capture it.

## Quick start

Mac or Linux:

```bash
scripts/run-demo.sh        # launcher page with a Start button per scenario
scripts/run-demo.sh 1      # or 2: play one scenario
scripts/run-demo.sh all    # play 1 and 2 one after another
```

Windows (PowerShell):

```powershell
.\scripts\run-demo.ps1        # launcher
.\scripts\run-demo.ps1 2      # one scenario; "all" plays the three
```

The first run installs the dependencies and Playwright's Chromium, then asks for the demo account's
password (saved only in the git-ignored `e2e/demo/.env`; press Enter to use quick sign-in instead).
Needs Node.js 22.6 or later and Git.

While a scenario plays, the page shows:

- a **title card** at the start and a **summary card** at the end;
- a **caption** for every step ("Scenario 2 · Step 4 of 7 · …");
- a visible **cursor** that glides to each target (screen recorders do not see Playwright's mouse)
  and an amber **highlight ring** on what is clicked or pointed at.

The overlay never takes clicks and is not part of the app: it exists only in the browser that the
script drives.

| #   | Script                                                               | Story                                                                                                                                                                                                                                                                                                                   |
| --- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `scenarios/scenario-1-new-loan-trade-credit-chain.demo.ts`           | Introduction and how FinRakshak uses AI, then pre-sanction: Maheep Marketing's application (filled at once), the public-records chain Deep Star → Navmi → Maruti Strips → Yatin Steels (liquidation), 36% of receivables at risk, the attention score, the AI investigator (card), the one-click AI review and Copilot. |
| 2   | `scenarios/scenario-2-advantage-overseas-after-disbursement.demo.ts` | Post-disbursement: TEST loan L-2023-0601, six records found automatically after sign-in (CIRP, liquidation, ED search and attachments), the alert with evidence, Copilot on the alert, and the four background agents.                                                                                                  |

Inputs and expectations come from the e2e scenarios (`e2e/scenarios/<id>/scenario.ts`), so the
demo and the tests stay in step. Counts are checked softly: if a newer public-records dataset
changes a number, the video still plays to the end and the run reports the difference.

## Run without the script

```bash
npm ci
npm exec -w e2e -- playwright install chromium   # the browser the scripts drive
cp e2e/demo/.env.example e2e/demo/.env           # then put the password in DEMO_PASSWORD
npm run demo                                     # launcher, http://localhost:4400
npm run demo:1                                   # or demo:2, demo:all
DEMO_PACE=slow DEMO_SIGN_IN=quick npm run demo:2 # any setting can be given like this
```

In the launcher, pick the settings on the right, start your screen recorder, then click **Start
scenario N**. The browser opens maximised and plays the scenario; the launcher shows each step live
and has a **Stop** button. Leave the mouse and keyboard alone while it plays.

`e2e/demo/.env` is git-ignored. Never commit the password.

## Settings

Set them in the launcher, in `e2e/demo/.env`, or on the command line (that order wins over `.env`).

| Variable                    | Default                         | Meaning                                                                                              |
| --------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `DEMO_BASE_URL`             | `https://finrakshak-ai.web.app` | The app to drive. Change it here when the URL changes.                                               |
| `DEMO_SIGN_IN`              | `account`                       | `account`: email and password. `quick`: the prototype's quick sign-in (synthetic data, no AI model). |
| `DEMO_EMAIL`                | `manager@gmail.com`             | Account email.                                                                                       |
| `DEMO_PASSWORD`             | (none)                          | Account password. Only in `.env` or the launcher.                                                    |
| `DEMO_APPCHECK_DEBUG_TOKEN` | (none)                          | See "Sign-in is refused" below.                                                                      |
| `DEMO_PACE`                 | `brisk`                         | `brisk` fits both scenarios in 3–4 minutes; `slow` / `normal` leave more room; `fast` is a dry run.  |
| `DEMO_CAPTIONS`             | `on`                            | Captions and title cards. The cursor and ring always show.                                           |
| `DEMO_AI`                   | `on`                            | The Gemini and FinRakshak Copilot steps.                                                             |
| `DEMO_VIEWPORT`             | `auto`                          | `auto` fills the maximised window; or a fixed page size such as `1920x1080`.                         |
| `DEMO_BROWSER`              | `chromium`                      | `chrome` or `msedge` use the browser installed on this computer.                                     |
| `DEMO_RECORD`               | `off`                           | `on` also saves a Playwright video (1920×1080 unless `DEMO_VIEWPORT` is set).                        |
| `DEMO_HOLD_SECONDS`         | `15`                            | How long the summary card stays before the browser closes.                                           |
| `DEMO_HEADLESS`             | `off`                           | `on` runs without a window (checks only; not for recording).                                         |
| `DEMO_LAUNCHER_PORT`        | `4400`                          | The launcher's port.                                                                                 |

**Voice-over and screen capture (optional).** `DEMO_NARRATION_FILE` (JSON: spoken line → seconds) makes
each caption wait until its line has been spoken; `DEMO_TIMELINE_FILE` records when each line appeared,
so recorded audio can be placed on the video afterwards. `DEMO_WINDOW_SIZE=1920x1080` puts the window at
0,0 for screen capture without a window manager. `DEMO_OPEN_SOURCES=off` points at a source link instead
of opening the (sometimes slow) government PDF.

Videos saved with `DEMO_RECORD=on` go to `e2e/demo/recordings/<time>/<test>/video.webm`
(git-ignored). A screen recorder (OBS, the Xbox Game Bar, QuickTime, Loom) gives sharper video;
the built-in recording is handy as a backup.

## Recording tips

- Use **Slow** pace if you will talk over the video, **Normal** for a silent video with captions.
- Close other notifications; the browser window opens maximised on the main screen.
- Each run starts from a fresh browser profile, so the demo data is always the same starting point.
- With account sign-in the AI steps call Gemini (one or two requests per run); each run counts
  against the daily AI limit (B-15, B-64, B-66). Use **AI steps off** for rehearsals.

## Sign-in is refused

The deployed app protects sign-in with Firebase **App Check** (reCAPTCHA Enterprise), which can
refuse a browser driven by automation. The script stops with the app's message and these options:

1. Try **Google Chrome** (`DEMO_BROWSER=chrome`): the scripts already hide the automation flags.
2. Use an **App Check debug token**: Firebase console → App Check → Apps → your web app → ⋮ →
   Manage debug tokens → Add debug token. Copy the token into `DEMO_APPCHECK_DEBUG_TOKEN` (or the
   launcher's Advanced section). It lets that browser pass App Check, so treat it like a password
   and delete it after recording (B-68).
3. Record with **quick sign-in** (`DEMO_SIGN_IN=quick`). Everything works on the same demo data;
   the AI steps then show the app's labelled simulated output instead of calling Gemini.

## How it is built

- `playwright.config.ts`: visible browser, one scenario at a time, no retries, no web server.
- `support/config.ts`: the `DEMO_*` settings (zod-validated).
- `support/overlay.ts`: the in-page caption, cursor, ring and cards. It is a `popover` element so it
  stays above the app's modal `<dialog>` drawers.
- `support/director.ts`: scenes, captions, gliding cursor, click/type/select with a highlight, pacing.
- `support/sign-in.ts`, `support/post-disbursement.ts`, `support/wait.ts`: shared steps.
- `launcher/`: `server.ts` (Node built-ins only; 127.0.0.1, Host and Origin checked), `runs.ts`
  (starts `playwright test`, streams its output), `index.html` (the page).

To add a scenario, copy one of the scripts, add it to `launcher/scenarios.ts`, and add a
`demo:N` script to `e2e/package.json` and the root `package.json`.
