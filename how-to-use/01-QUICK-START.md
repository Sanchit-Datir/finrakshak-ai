# 1. Quick start

[← Back to the index](README.md)

## Run it locally (about 3 minutes)

You need **Node.js 22** and npm 10. No Google Cloud account, API key or billing is needed: the demo
workspace runs in the browser, and every AI path falls back to a labelled mock or a _Not connected_ state.

```bash
git clone https://github.com/Sanchit-Datir/finrakshak-ai.git
cd finrakshak-ai
npm ci                                                     # exact versions from the lockfile

# Public-records bundle for the app (public-records check, watch, relationship graph). About 30 s.
npm run build -w @finrakshak-ai/shared && npm run build -w ingest
node ingest/dist/graphCli.js --web                         # writes web/public/graph-lab/ (git-ignored)

npm run dev -w web                                         # http://localhost:5173
```

Open <http://localhost:5173>, pick a role under **Quick sign-in** and click **Continue with quick sign-in**.

![Login page](screenshots/01-login.jpg)

> The **Employee ID / password** form is shown on purpose but is not connected in the prototype. It
> validates the fields and then explains that secure sign-in is not connected. Use **Quick sign-in**.

## Demo roles

Roles change the navigation, the queue, and what you can edit. The data is the same demo bank
(_Sahyadri Demo Gramin Bank_, branches Mumbai / Delhi / Pune / Kolkata).

| Role               | Demo user      | Typical work                                                             | Best for showing                        |
| ------------------ | -------------- | ------------------------------------------------------------------------ | --------------------------------------- |
| **Branch officer** | Rahul Kulkarni | Captures applications, uploads and verifies documents, runs checks       | The pre-sanction flow                   |
| **Branch manager** | Anjali Patil   | Reviews applications marked ready for decision, triages alerts           | Decisions and the queue                 |
| **Risk analyst**   | Neha Joshi     | Monitors the loan book, tunes thresholds, reads the public-records watch | Monitoring, risk scores, settings       |
| **Investigator**   | (demo user)    | Works investigation cases: checklist, evidence, notes, graph             | Cases and the relationship graph        |
| **Administrator**  | Deepak Rao     | Everything above, plus settings, the data reset and AI proposals         | A full tour (used for most screenshots) |

## Where things are in the app

The left sidebar ("mission rail") follows the life of a loan, with live counts:

| Sidebar group           | Pages                                                                                     | Route                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Workspace               | Command center, My queue                                                                  | `/dashboard`, `/queue`                                                                |
| **① Pre-sanction**      | Applications, Borrowers, Documents                                                        | `/applications`, `/applications/new`, `/applications/:id`, `/borrowers`, `/documents` |
| **₹ Disbursed**         | Progress bar of disbursed loans by priority                                               | —                                                                                     |
| **② Post-disbursement** | Loan book, Public records, Risk scores (SYNTH)                                            | `/monitoring`, `/monitoring/public-records`, `/monitoring/risk-scores`                |
| **③ Investigate**       | Cases, Relationship graph (BETA)                                                          | `/investigations`, `/investigations/:caseId`, `/graph-lab`                            |
| Alerts                  | Every lead from checks, monitoring and the watch                                          | `/alerts`                                                                             |
| Insights                | Reports                                                                                   | `/reports`                                                                            |
| Top bar                 | Search (Ctrl/⌘ K), **Ask AI** (Ctrl/⌘ J), New application, dark mode, help, notifications | —                                                                                     |
| Footer of the sidebar   | Public-records freshness and AI status (_demo session, no model called_)                  | —                                                                                     |

## Keyboard shortcuts

| Keys         | What it does                                               |
| ------------ | ---------------------------------------------------------- |
| Ctrl/⌘ **K** | Command palette: search borrowers, loans, alerts and cases |
| Ctrl/⌘ **J** | Open the **FinRakshak Copilot** about the record on screen |
| **?**        | Help and the guided walkthrough                            |

## Other useful commands

| Command                               | What it does                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| `npm run check && npm run build`      | The full quality gate: prettier, ESLint (0 warnings), `tsc`, 1,579 unit tests, build |
| `npm run test:emulators`              | Firestore rules and Firestore code against the Firebase emulator (needs Java 21)     |
| `npm run e2e`                         | Playwright browser scenarios with real public records and TEST loans                 |
| `npm run synth && npm run score`      | Generates synthetic loans and replays 24 months of risk scoring                      |
| `npm run miner -- propose`            | Runs the pattern miner agent on the mock model and prints its proposals              |
| `node ingest/dist/cli.js acquire all` | Daily delta fetch of the public sources (polite, robots.txt-aware)                   |
| `npm run emulators`                   | Auth, Functions and Firestore emulators (AI uses the mock provider)                  |

## Using the live AI (optional)

The deployed copy uses Firebase Auth. A signed-in user with a usable profile and AI access calls
Gemini on Vertex AI through the callables (see [04-AI-AGENTS.md](04-AI-AGENTS.md)). To deploy your
own copy, follow [`docs/DEPLOY.md`](../docs/DEPLOY.md): set the project in `.firebaserc`, fill in
`web/.env.local`, grant the functions' runtime account `roles/aiplatform.user`
(`scripts/setup-gcp.sh`), then `npm run build && npx firebase deploy`.

## Recreating the screenshots

The screenshots were taken with Playwright (already a dev dependency) against `npm run dev -w web`:

1. Start the dev server and sign in with **Quick sign-in** (Administrator for most pages, Risk analyst
   for the risk step and dark mode, Branch officer for mobile).
2. Visit each route in the table above at 1440 × 900, plus a 360 × 780 mobile viewport and
   `colorScheme: 'dark'` for dark mode.
3. On `/applications/A-1013/edit`, click **Risk analysis** and then **Re-run checks**. On
   `/monitoring?loan=L-2026-0110`, press Ctrl+J and click **Why was this flagged?**.

[Next: User flows →](02-USER-FLOWS.md)
