# 3. Screenshot gallery: every UI tab

[← Back to the index](README.md)

Captured on 18 Oct 2026 from the local demo (`npm run dev -w web`, quick sign-in, Chromium via
Playwright). Desktop screenshots are 1440 px wide and show the full page; mobile screenshots are
360 px. Names and amounts are fictional except the labelled **TEST** loans, which use real public records.

| #   | Screen                                | Route                                | Role used      |
| --- | ------------------------------------- | ------------------------------------ | -------------- |
| 01  | Login                                 | `/login`                             | —              |
| 02  | Command center                        | `/dashboard`                         | Administrator  |
| 03  | My queue                              | `/queue`                             | Administrator  |
| 04  | Applications                          | `/applications`                      | Administrator  |
| 05  | New application: form                 | `/applications/new`                  | Administrator  |
| 05b | Application wizard: edit              | `/applications/A-1013/edit`          | Risk analyst   |
| 05c | New application: upload documents     | `/applications/new` → Upload instead | Risk analyst   |
| 06  | Application: overview                 | `/applications/A-1013`               | Administrator  |
| 06b | Application: documents & verification | `/applications/A-1013?tab=documents` | Risk analyst   |
| 06c | Application: findings & entities      | `/applications/A-1013?tab=findings`  | Risk analyst   |
| 07  | Risk analysis: checks, score, AI card | `/applications/A-1013/edit` → step 4 | Risk analyst   |
| 08  | Documents                             | `/documents`                         | Administrator  |
| 09  | Borrowers                             | `/borrowers`                         | Administrator  |
| 10  | Borrower profile                      | `/borrowers/b-sunita`                | Administrator  |
| 11  | Loan book                             | `/monitoring`                        | Administrator  |
| 12  | Loan: alerts and transaction flow     | `/monitoring?loan=L-2026-0110`       | Administrator  |
| 13  | Public-records watch                  | `/monitoring/public-records`         | Administrator  |
| 14  | Risk scores (SYNTH)                   | `/monitoring/risk-scores`            | Administrator  |
| 15  | Alerts                                | `/alerts`                            | Administrator  |
| 16  | Alerts: Urgent review filter          | `/alerts?priority=urgent`            | Administrator  |
| 17  | Cases                                 | `/investigations`                    | Administrator  |
| 18  | Case detail                           | `/investigations/CASE-2026-007`      | Administrator  |
| 19  | Relationship graph                    | `/graph-lab`                         | Administrator  |
| 20  | Reports                               | `/reports`                           | Administrator  |
| 21  | Settings                              | `/settings`                          | Administrator  |
| 22  | Help                                  | `/help`                              | Administrator  |
| 23  | FinRakshak Copilot                    | Ctrl/⌘ J on `L-2026-0110`            | Administrator  |
| 24  | Command palette                       | Ctrl/⌘ K                             | Administrator  |
| 25  | Dark mode                             | `/dashboard`                         | Risk analyst   |
| 26  | Mobile 360 px: command center         | `/dashboard`                         | Branch officer |
| 27  | Mobile 360 px: application            | `/applications/A-1013`               | Branch officer |

---

### 01 · Login

Quick sign-in with a demo role. The employee-ID form validates its fields but is not connected in the prototype, and says so.

![01](screenshots/01-login.jpg)

### 02 · Command center

KPIs, the risk mix, recent alerts and public records on disbursed loans. The sidebar follows the
loan's life: pre-sanction → ₹ disbursed → post-disbursement → investigate, with live counts.

![02](screenshots/02-command-center.jpg)

### 03 · My queue

What needs the signed-in person now, by role.

![03](screenshots/03-my-queue.jpg)

### 04 · Applications

Every application with status, review priority, branch and product.

![04](screenshots/04-applications.jpg)

### 05 · New application: form path

The form opens straight away. Inline zod validation uses the same schema as the server.

![05](screenshots/05-new-application-form.jpg)

### 05b · Application wizard (existing application)

Upload documents → Extract & verify → Application form (optional) → Risk analysis.

![05b](screenshots/05b-application-wizard-edit.jpg)

### 05c · New application: upload path

Local PDF and image quality checks (pages, blur, darkness, resolution) before extraction.

![05c](screenshots/05c-new-application-upload.jpg)

### 06 · Application overview

Summary strip, document checklist, findings requiring attention, recent actions, and every section of the application.

![06](screenshots/06-application-detail.jpg)

### 06b · Documents & verification tab

![06b](screenshots/06b-application-documents-tab.jpg)

### 06c · Findings & entities tab

![06c](screenshots/06c-application-findings-tab.jpg)

### 07 · Risk analysis

Twelve configured checks, the **attention score (48 / 100, Needs attention)** with its drivers, the
public-records check, the review priority and the findings table. The **AI review** card is honest
in a demo session: _Not connected — no AI review ran_.

![07](screenshots/07-risk-analysis-checks.jpg)

### 08 · Documents

![08](screenshots/08-documents.jpg)

### 09 · Borrowers

![09](screenshots/09-borrowers.jpg)

### 10 · Borrower profile

![10](screenshots/10-borrower-profile.jpg)

### 11 · Loan book

Post-disbursement monitoring of transaction patterns, with public-records watch, CSV import and rule runs.

![11](screenshots/11-loan-book.jpg)

### 12 · One loan: alerts and transaction flow

Alerts for `L-2026-0110` (circular flow, rapid onward transfer, linked and repeated counterparties)
and the money-trail flow graph.

![12](screenshots/12-loan-detail-flow.jpg)

### 13 · Public-records watch

Every disbursed loan re-checked daily. The TEST loans `L-2023-0601` (Advantage Overseas) and
`L-2024-0401` (Jai Corp) show real IBBI and ED records dated after disbursement.

![13](screenshots/13-public-records-watch.jpg)

### 14 · Risk scores (SYNTH)

Monthly behaviour + pattern scores on the labelled synthetic loan book.

![14](screenshots/14-risk-scores.jpg)

### 15 · Alerts

![15](screenshots/15-alerts.jpg)

### 16 · Alerts filtered to Urgent review

Public-records watch alerts: the borrower taken to insolvency (CIRP), ordered into liquidation, and enforcement actions.

![16](screenshots/16-alerts-urgent-filter.jpg)

### 17 · Cases

![17](screenshots/17-investigations.jpg)

### 18 · Case detail

Status, assignee, checklist, evidence, notes, entity graph and audit trail.

![18](screenshots/18-case-detail.jpg)

### 19 · Relationship graph

Real public records: 43,405 nodes, 47,116 links, 3,349 networks and 972 identity candidates.
Explore, Networks, Path finder and Identity review.

![19](screenshots/19-relationship-graph.jpg)

### 20 · Reports

![20](screenshots/20-reports.jpg)

### 21 · Settings

![21](screenshots/21-settings.jpg)

### 22 · Help

![22](screenshots/22-help.jpg)

### 23 · FinRakshak Copilot

"Why was this flagged?" on loan `L-2026-0110`: four statements, each citing facts (`A1`–`A4`), and
_Grounding check: 4 of 4 statements kept_. It is labelled _Simulated demo output · no model called_
in a demo session.

![23](screenshots/23-copilot.jpg)

### 24 · Command palette (Ctrl/⌘ K)

![24](screenshots/24-command-palette.jpg)

### 25 · Dark mode

![25](screenshots/25-dark-mode-command-center.jpg)

### 26 · Mobile 360 px: command center

![26](screenshots/26-mobile-360-command-center.jpg)

### 27 · Mobile 360 px: application

![27](screenshots/27-mobile-360-application.jpg)

[Next: AI features and agents →](04-AI-AGENTS.md)
