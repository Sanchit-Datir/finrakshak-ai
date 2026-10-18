# 7. Judges' 5-minute demo script and FAQ

[← Back to the index](README.md)

## Before you start (2 minutes, once)

```bash
npm ci
npm run build -w @finrakshak-ai/shared && npm run build -w ingest && node ingest/dist/graphCli.js --web
npm run dev -w web      # http://localhost:5173
```

## The script

| Time | Do this                                                                                       | What to notice                                                                                                      | Screenshot                                                                                            |
| ---- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 0:00 | Quick sign-in as **Administrator**                                                            | The sidebar follows the loan's life: pre-sanction → ₹ disbursed → post-disbursement → investigate, with live counts | [02](screenshots/02-command-center.jpg)                                                               |
| 0:30 | Open **Applications → A-1013 · Shree Traders**, then **Edit → Risk analysis → Re-run checks** | 12 deterministic checks; the **attention score 48/100** with its drivers; the public-records check                  | [07](screenshots/07-risk-analysis-checks.jpg)                                                         |
| 1:30 | **Loan book** → loan **L-2026-0110**                                                          | Circular flow, rapid onward transfer and linked counterparty alerts; the money-trail flow graph                     | [12](screenshots/12-loan-detail-flow.jpg)                                                             |
| 2:45 | **Public records**                                                                            | Real IBBI and ED records for the TEST loans, dated **after** disbursement → Urgent review                           | [13](screenshots/13-public-records-watch.jpg)                                                         |
| 3:15 | **Alerts** → click the **Urgent review** tile                                                 | One triage list for every source; escalate → case                                                                   | [16](screenshots/16-alerts-urgent-filter.jpg)                                                         |
| 3:45 | **Cases → CASE-2026-007**                                                                     | Checklist, evidence, notes, entity graph and audit trail                                                            | [18](screenshots/18-case-detail.jpg)                                                                  |
| 4:15 | **Relationship graph**                                                                        | 43,405 nodes and 47,116 links from real public records; path finder; identity review                                | [19](screenshots/19-relationship-graph.jpg)                                                           |
| 4:45 | Toggle **dark mode**; narrow the window to 360 px                                             | Accessible, responsive, no horizontal scroll                                                                        | [23](screenshots/23-dark-mode-command-center.jpg), [24](screenshots/24-mobile-360-command-center.jpg) |

Then open [04-AI-AGENTS.md](04-AI-AGENTS.md) to see how the investigator and the three pipeline
agents work behind these screens.

## Evaluation checklist (where to find the evidence)

| Criterion                       | Evidence in this repository                                                                                                                                                                                    |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Use of Gen AI**               | 6 Gemini features, 4 of them agents ([04](04-AI-AGENTS.md)); a verifier and a grounding check on every output; tool loops with hard caps; proposals that need approval                                         |
| **Technical merit**             | Strict TypeScript monorepo; shared zod contracts; 1,579 unit tests + emulator + Playwright; delta ingestion with publish gates and rollback ([05](05-GCP-SERVICES.md), [06](06-ARCHITECTURE-AND-CODE-TOUR.md)) |
| **Google Cloud usage**          | 16 GCP / Firebase services, keyless (ADC + Workload Identity Federation), least-privilege accounts, scale to zero ([05](05-GCP-SERVICES.md))                                                                   |
| **Real-world impact**           | Covers pre-sanction, disbursement and post-disbursement; looks past the borrower to its customers; real Indian public records                                                                                  |
| **UX and accessibility**        | WCAG 2.2 AA target, status always shown with icon + text, dark mode, 360 px mobile, keyboard shortcuts, guided help ([03](03-SCREENSHOTS.md))                                                                  |
| **Responsible AI and security** | Leads, not verdicts; verdict words blocked; PII masked; counts-only logs; App Check; default-deny rules; emergency stop                                                                                        |
| **Cost and scalability**        | ≈ US$5–10 / month for the prototype; per-user daily AI limits; budgets; serverless                                                                                                                             |

## FAQ

**How do I see the AI features run?**
Sign in to a deployed copy with an account that has AI access. **Ask AI** (Ctrl/⌘ J), _Analyse with
Gemini_ and _Investigate with AI_ then call **Gemini on Vertex AI** through Cloud Functions; see
[Using the live AI](01-QUICK-START.md#using-the-live-ai) and [04-AI-AGENTS.md](04-AI-AGENTS.md).

**Which data is real?**
The public-records dataset and the relationship graph are real: 18,286 entities and 57,382
relationships from IBBI, NFRA, ED, RBI, SFIO, SEBI and MCA, collected politely and with every original
file kept. The demo bank, its people and its loans are fictional, except the **TEST** loans, whose real
borrowers are matched against real records (the loan values are made up). The risk-scoring data is
**synthetic** and labelled **SYNTH**.

**Can the AI change data or make a decision?**
No. Agents only **propose**: code verifies every claim, and a person approves any state change
(`decideProposal`, `decidePattern`, approving a draft question). The attention score and the risk score
are always computed by code.

**How do you stop the model inventing numbers?**
Every number in an AI statement must appear in the facts or evidence it cites; otherwise the statement
is removed and the removal is counted and shown (`unknown_number`). Quotes must match the field, and
cited records must be in the shortlist that code built.

**What does it cost to run?**
About US$5–10 a month at prototype volume. An AI investigator run costs at most about US$0.04, and a
Copilot answer about US$0.002. Per-user daily limits and budget alerts cap it.

**Where should a code reviewer start?**
[06-ARCHITECTURE-AND-CODE-TOUR.md](06-ARCHITECTURE-AND-CODE-TOUR.md), then
`functions/src/services/investigation/verify.ts`, `packages/shared/src/assistGrounding.ts`,
`ingest/src/ai/toolLoop.ts` and `web/src/lib/checks/`.

[← Back to the index](README.md)
