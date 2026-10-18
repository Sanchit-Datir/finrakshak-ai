# FinRakshak AI --- UI & UX Implementation Specification

**Version:** 1.0\
**Purpose:** Implementation-ready UI instructions for an AI coding
agent\
**Product:** FinRakshak AI --- Loan Lifecycle Intelligence for rural and
commercial lenders

## 1. Instructions to the coding agent

Build a polished, modern, responsive web application named **FinRakshak AI
AI** for banking employees who review loan applications and monitor
post-disbursement activity.

Treat this document as the source of truth for the UI. Implement the
complete navigation and all listed screens with realistic interactions.
Prioritize a working, coherent prototype over decorative complexity.

### Important implementation rules

1.  Inspect the existing repository and reuse its framework,
    conventions, and components where practical. If empty, use Next.js +
    TypeScript + Tailwind CSS and an accessible component library such
    as shadcn/ui. Use Lucide icons.
2.  Build reusable components for the app shell, cards, tables, badges,
    upload areas, document viewers, risk indicators, charts, dialogs,
    and loading/error/empty states.
3.  Make navigation, dropdowns, filters, tabs, buttons, upload flows,
    table actions, and modals functional. Do not leave controls as inert
    decoration.
4.  Use synthetic demonstration data only. Never present invented names,
    amounts, risk results, or transaction flows as real bank
    information. Add a "Demo data" indicator where appropriate.
5.  Do not claim an AI model has verified a document, found fraud, or
    checked a public record unless the corresponding operation actually
    ran. Clearly label simulated features.
6.  A risk alert is an **investigative lead**, not a finding of fraud.
    Use "Needs review," "Potential concern," and "Evidence incomplete."
    Do not use "Fraud confirmed" without a verified case outcome.
7.  All extracted document values must be editable and reviewable by a
    human before being treated as confirmed.
8.  Support Marathi and English documents. Preserve original Marathi
    text, show transliteration/translation separately, and let users
    compare the source image with extracted fields.
9.  Make the interface accessible: keyboard navigation, visible focus,
    clear labels, sufficient contrast, non-colour status indicators, and
    responsive layouts.

## 2. Product goals and users

### Primary users

- Rural bank branch managers and loan officers.
- Credit appraisal and operations staff.
- Risk, compliance, and investigation teams.
- Commercial-bank monitoring analysts.

### Core product promise

**Identify inconsistencies before lending, then investigate potential
misuse of funds after lending by connecting borrower evidence, related
entities, and transaction activity.**

### Two workspaces

1.  **Pre-disbursement:** capture and review documents, extract fields,
    compare information, and identify items needing verification.
2.  **Post-disbursement:** review transaction activity, identify
    potentially unusual fund movements, investigate related entities,
    and track alerts.

Both share borrower profiles, document evidence, entity relationships,
case notes, and audit history.

### Design principles

- Modern and fresh, not a traditional dull banking portal.
- Professional, calm, clear, trustworthy, and action-oriented.
- Optimized for employees who may not be highly technical.
- A user should understand the next step without training.
- Group dense information progressively.
- Never use colour alone to communicate risk or status.

## 3. Visual design system

### Brand

- Product name: **FinRakshak AI**
- Descriptor: **Loan Lifecycle Intelligence**
- Suggested tagline: **Safer Loans. Stronger Communities.**
- Tone: dependable, clear, modern, supportive, evidence-led.

### Colour palette

Use a light interface by default: - Primary navy `#12324A` --- top
navigation, primary actions and headings. - Deep navy `#0B253B` ---
emphasis and dark surfaces. - Primary blue `#2563EB` --- links, active
navigation and focus. - Teal `#0D9488` --- positive/verified states and
secondary accents. - Background `#F4F7FB`. - Surface `#FFFFFF`. - Border
`#DCE5EF`. - Main text `#172B3A`. - Secondary text `#627487`. - Low
risk/verified: teal or green with text/icon. - Medium risk/review:
amber/orange with text/icon. - High risk/urgent review: red with
text/icon. - Neutral/unknown: slate/grey.

Use restrained risk accents, not full red page backgrounds. Meet WCAG AA
contrast where practical.

### Typography and layout

- Use Inter, Geist, or the existing project font.
- Page title: 24--30 px desktop, 22--26 px mobile.
- Section title: 16--20 px.
- Body: 14--16 px; supporting text 12--13 px.
- Use tabular numerals for amounts, dates, counts and scores.
- Desktop app shell: persistent left sidebar, top header, main
  content.
- Sidebar about 230--250 px expanded; support collapse.
- Top header about 64 px.
- Cards with 12--16 px radius, subtle borders, restrained shadows.
- Use consistent 8 px spacing increments.
- Tables remain readable; allow horizontal scroll on small screens.
- Avoid excessive glassmorphism, unnecessary gradients, and
  distracting animation.
- A gentle rural/field-inspired visual may appear on login.
  Operational screens prioritize clarity.

### Icon system

Use Lucide icons consistently: - Dashboard: `LayoutDashboard` - New
application: `FilePlus2` - Document capture/library: `ScanLine`,
`Files` - Pre-disbursement review: `ClipboardCheck` - Post-disbursement:
`Activity` - Borrowers: `Users` - Entity network: `Network` -
Investigations/cases: `SearchCheck` or `BriefcaseBusiness` - Reports:
`ChartNoAxesCombined` or `FileBarChart` - Alerts: `Bell` - Settings:
`Settings` - Help: `CircleHelp` - Upload: `Upload` - Camera/scan:
`Camera` - Search: `Search` - Verified: `BadgeCheck` or `CheckCircle2` -
Warning: `TriangleAlert` - High priority: `ShieldAlert` - Pending:
`Clock3` - Export: `Download` - Filter: `ListFilter` - Calendar:
`CalendarDays` - Add note: `MessageSquarePlus` - Evidence:
`FileSearch` - Transaction: `ArrowLeftRight` - Relationship:
`GitBranch` - Profile: `UserRound` - Logout: `LogOut`

Use icon + text for primary navigation and important status labels.

## 4. Routes and global navigation

Implement these routes or equivalent pages: - `/login` - `/dashboard` -
`/applications/new` - `/applications/[applicationId]` - `/documents` -
`/borrowers` - `/borrowers/[borrowerId]` - `/monitoring` -
`/investigations` - `/investigations/[caseId]` - `/reports` -
`/alerts` - `/settings`

### Left sidebar

Show FinRakshak AI logo/wordmark, then: 1. **Dashboard** ---
`LayoutDashboard` 2. **New Loan Application** --- `FilePlus2` 3.
**Document Library** --- `Files` 4. **Borrowers** --- `Users` 5.
**Post-disbursement Monitoring** --- `Activity` 6. **Investigations**
--- `SearchCheck` 7. **Reports & Alerts** --- expandable group with
Reports and Alerts 8. **Settings** --- `Settings`

At the bottom show Help & Support and the signed-in user's name, role,
branch/bank, and profile menu. Active navigation uses a pale-blue
background, blue icon/text, and slim active indicator. On mobile,
convert the sidebar into a drawer.

### Top header

- Global search placeholder: **"Search borrower, loan ID, company,
  document..."**
- Group results into Borrowers, Loan Applications, Companies/Entities,
  Documents, and Cases.
- Notification bell with unread count.
- Optional help icon.
- Profile avatar/initials, user name, role/branch, and menu.
- Primary action: **+ New Application**.

### Global interactions

- Preserve filters when navigating back where practical.
- Confirm destructive actions.
- Toast successful saves, uploads, exports and recoverable errors.
- Use skeleton loading states.
- Tables need search/filter/sort or an explanation when not
  applicable.
- Every screen needs useful empty, loading, and error states.

## 5. Login page

### Goal

A welcoming, trustworthy entry point for bank employees.

### Desktop layout

- Two-panel composition.
- Left panel about 55--60% width with a subtle rural/agriculture
  landscape photograph and dark translucent overlay for contrast.
- Right panel about 40--45% width with light background and centered
  login card.
- On mobile, use a compact branded layout; do not force a split
  screen.

### Left panel

- FinRakshak AI logo and "Loan Lifecycle Intelligence."
- Headline: **"Safer Loans. Stronger Communities."**
- Supporting text: **"AI-assisted risk intelligence for pre- and
  post-disbursement lending."**
- Three value propositions with icons: Detect inconsistencies; Review
  documents faster; Investigate fund movement.
- Avoid claims that the product prevents all fraud or guarantees
  accuracy.

### Login card

- Heading: **"Welcome back"**
- Subheading: **"Sign in to your FinRakshak AI workspace."**
- Employee ID or work email field.
- Password field with show/hide control.
- Remember me checkbox.
- Forgot password link.
- Primary **Sign in** button.
- Optional "Continue with Google" only if authentication is
  implemented and permitted.
- Footer: "Secure access for authorized banking staff."
- Optional language selector: English / मराठी.

### Behaviour

- Required-field validation and inline errors.
- Password visibility toggle.
- Loading state during sign-in.
- Generic invalid-credentials error; do not reveal whether an account
  exists.
- Forgot-password flow or clearly marked demo-only placeholder.
- If auth is not implemented, offer explicitly labelled **Demo
  sign-in**, not fake secure login.
- Never put credentials in the UI or repository.

## 6. Landing page / dashboard

### Goal

Answer: What needs attention today? Which applications await review?
Which loans have monitoring alerts? What should I do next?

### Header

- Greeting: **"Good morning, \[First name\]"**
- Supporting text: **"Here's your portfolio overview."**
- Date selector: Today / Last 7 days / This month / Custom range.
- Primary **+ New Application** button.
- Optional branch selector for users allowed to view multiple
  branches.

### KPI cards

Four cards, populated from the current dataset and marked Demo data in
prototype: 1. **Applications awaiting review** --- blue `FileClock`. 2.
**Items needing attention** --- red/orange `ShieldAlert`. 3. **Active
loans monitored** --- teal `Activity`. 4. **Open investigations** ---
violet/blue `SearchCheck`.

Each card has a count, concise label, optional comparison only when
calculated from actual demo data, and click-through to filtered records.
Do not invent trends.

### Main dashboard layout

- First row: KPI cards.
- Second row: Portfolio Activity chart (left, \~60%) and Risk Overview
  chart (right, \~40%).
- Third row: Recent Applications table (left) and Recent Alerts list
  (right).

### Recent Applications columns

Application ID; Applicant/business; Loan type; Branch; Submitted date;
Review status; Risk indicator; View action.

Statuses: Draft, Documents needed, Processing, Needs review, Ready for
decision, Approved (only when a user action/demo state sets it),
Declined (only when a user action/demo state sets it).

### Recent Alerts

Show severity icon/text, short finding, borrower/loan reference,
date/time, evidence link, and status: New / In review / Resolved.

### Quick action tiles

- Start a new application
- Scan/upload documents
- Find a borrower
- Review monitoring alerts

Clicking KPIs filters the relevant page. Charts need legends, accessible
labels and tooltips. Empty state explains how to add an application or
load demo data. Only show **Load demo dataset** in demo/development
mode.

## 7. New loan application and document capture

This is a core workflow: rural bank employees may receive paper
documents, handwritten Marathi forms, photocopies, or photos rather than
PDFs.

### Main flow

**New loan** opens the application form directly (no choice screen).
Uploading documents is the alternative offered on that screen
(**Upload documents instead**); on the upload path the form is not
required.

- Form path: 1. **Application form** (applicant name, requested amount
  and declared purpose required) 2. **Risk analysis**
- Upload path: 1. **Upload documents** 2. **Extract & verify** 3.
  **Application form (optional)** 4. **Risk analysis**. Continuing from
  Extract & verify fills empty application fields from confirmed or
  corrected document fields only; nothing else is required, and the
  checks report missing information. The form stays reachable to edit.

Allow users to go back without losing uploaded files or entered values.

### Upload path step 1 --- Upload documents

Offer: 1. **Scan with camera** --- use device camera where supported. 2.
**Upload files** --- PDF, JPG, JPEG, PNG; TIFF only if supported
end-to-end. 3. **Upload from mobile** --- QR-assisted upload only if
implemented end-to-end; otherwise omit it.

Controls: - Large drop zone: **"Drop documents here or browse
files."** - Supporting text: **"PDF, JPG or PNG. Marathi and English
documents supported."** - Buttons: Scan document, Upload files, Add
another document. - Show file names, thumbnails, page counts, size,
upload progress, remove/replace actions. - Support multiple documents
and multi-page PDFs. - Allow rotate, crop, zoom, reorder and remove
pages where supported. - Warn about blurry, dark, cropped,
low-resolution or unreadable images when detectable. - Never silently
discard a page.

### Document types

Use a searchable dropdown grouped by category. Do not require exact
classification before upload.

**Identity and KYC** - Aadhaar card (mask sensitive number) - PAN card -
Voter ID - Passport - Other identity document

**Address** - Address proof - Ration card - Utility bill - Other address
document

**Agricultural and collateral** - 7/12 extract (सातबारा उतारा) - 8A
extract (८अ उतारा) - Mutation entry / फेरफार नोंद - Land ownership
document - Property document / title deed - Encumbrance or lien-related
document, if provided - Warehouse receipt / गोदाम पावती -
Crop/agricultural supporting document

**Financial** - Bank statement - Income proof - Salary slip - Income tax
return - Financial statements - Cash-flow statement - Existing
loan/liability statement

**Business and company** - Company/firm registration - Partnership
deed - GST registration - Udyam/MSME certificate - Board
resolution/authorization - Ownership/director details

**Loan-specific** - Loan application form - Loan purpose declaration -
Quotation / pro forma invoice - Purchase invoice - Guarantor documents -
Other supporting documents

These are configurable examples, not a statement that every loan
requires every document. Let the bank configure a checklist by loan
product.

### Marathi and multilingual requirements

- Detect language where possible; allow manual selection: Marathi /
  English / Hindi / Other.
- Support Devanagari, English, mixed-language documents and scanned
  PDFs.
- Preserve original image and extracted text.
- Show English translation separately; never overwrite original
  Marathi.
- Show extracted Marathi text and optional transliteration separately.
- Provide **Compare with original**, highlighting the source region
  for a selected field.
- Allow OCR corrections before verification.
- Mark uncertain fields **Needs confirmation**, not guessed.
- Treat handwriting as lower-confidence than clear print where
  appropriate.
- If handwriting cannot be read reliably, request manual entry.
- Label content **"Machine-extracted text --- please verify."**
- Do not claim 100% OCR/translation accuracy.

### Step 2 --- Extraction and verification

Three-panel workspace: - Left: uploaded document list and thumbnails. -
Centre: viewer with zoom, rotate, page navigation and selected-region
highlight. - Right: extracted fields and verification status.

Tabs: Extracted fields; Original text (Marathi/English); English
translation (when available); Raw extraction details (optional
admin/developer mode).

Example fields, only when present: - Applicant name in original script -
Normalized/transliterated name - Father/spouse name - Date of birth or
age - Address / village / taluka / district - Survey number / गट क्रमांक -
Land area and units - Document number - Issuing authority - Document
date - Masked bank account reference - Loan amount / declared purpose -
Company name / registration number - Warehouse receipt number / quantity
/ date

For each field show value, source document/page, quality/confidence
status, verification state (Unreviewed / Confirmed by user / Corrected /
Unclear), edit control, and View source button.

OCR confidence is not document authenticity. Reading text does not prove
a document is genuine.

### Step 3 --- Application review

Populate an editable form from extracted values. Group into: - Applicant
information - Loan details - Address and contact - Income/financial
details - Collateral details - Guarantor/co-borrower details - Documents
and verification - Declaration and loan purpose

Support individual, proprietorship, partnership, private limited
company, farmer/agricultural borrower, and other configurable borrower
types. Use conditional fields based on borrower type and loan product.

Actions: Save draft; Previous step; Continue to risk analysis; Mark
information unverified; Add a note; Replace/attach a document.

Do not auto-submit, approve or reject an application solely based on AI
output.

### Step 4 --- Risk analysis

Run configured deterministic checks and AI-assisted document analysis.
Show findings, supporting evidence, missing information, conflicting
values, suggested verification steps, review priority, and limitations.

Prefer labels such as Routine review / Needs attention / Urgent review
over an unexplained numeric score. If a score is added later, explain
its methodology.

**Attention score (added 18 Oct 2026).** Once the checks have run, the
top of the AI-assisted document analysis card shows an attention score
from 0 to 100, its band and the three findings that add most. It is
computed by code in the browser from the unresolved findings (resolved
and "not an issue" findings do not count); no AI model sets or changes
it, so the same data always gives the same score. Methodology:

- Each kind of finding has a weight, the points it adds when it is
  urgent: applicant in public records 70; relationships to open
  investigations 50; customer in public records, survey number or
  warehouse receipt reuse 45; declared income vs bank credits 30; name,
  date of birth, public-records check out
  of date or not run 25; unclear fields, missing
  documents 8; required fields, loan purpose, failed documents,
  unreviewed fields or sections 5; any check not listed 30.
- A milder finding of the same check adds less: Needs attention 60%,
  Routine 30% of the weight (rounded).
- Points add up, capped at 100. Bands: 0--29 Routine review, 30--59
  Needs attention, 60--100 Urgent review.
- The card states that it is calculated by code, lists the drivers with
  their points, and says it is a guide to how much attention the case
  needs, not a probability or a decision.
- The band can differ from Review priority: lower for an urgent but
  low-weight finding (missing documents), higher when several findings
  add up.
- The AI summary may explain the score but never give another one; a
  summary or note that states a different score is withheld.
- The weights are a starting point, not tuned on outcomes. Code:
  `web/src/lib/attention-score.ts`; details:
  `docs/APPLICATION_AI_ANALYSIS.md`.
- Verified AI-investigator findings (below) add points as their own
  kinds, scaled the same way: possible public-record match 45, link to a
  related entity of concern 40, numbers that look implausible together
  25, sections that do not agree 15. Only findings from a real model,
  still current and not dismissed count; their drivers read "AI finding
  (evidence verified)".

**AI investigator (added 18 Oct 2026).** A card under the AI-assisted
analysis card. **Investigate with AI** sends the typed-in application
(identifiers masked), ratios computed by code, a public-records
shortlist made by code and related entities; Gemini proposes findings
and draft questions with cited evidence, and code verifies every
citation, quoted value and number. The card shows the verified findings
with their evidence, public-record matches as "Possible match — needs
verification" (or "CIN or address agrees"), editable draft questions an
officer approves (recorded as a note, nothing sent), and "AI made N
claims: V verified, R rejected". It has loading, error (with Try
again), empty and out-of-date states; the demo session shows "Not
connected"; the mock is labelled. Details: `docs/AI_INVESTIGATOR.md`.

## 8. Application detail and risk review

### Header

Application ID and applicant/business name; loan product and requested
amount; branch and submitted date; status badge. Actions: Save changes,
Add note, Request information, Export review summary.

Approve/decline actions should be role-gated and only present if a real
decision workflow exists. AI findings must not be treated as a lending
decision.

### Tabs

Overview; Applicant & Loan; Documents; Verification; Risk Findings;
Related Entities; Timeline & Notes; Audit History.

### Overview

Applicant/loan summary; document completion checklist; outstanding
verification tasks; findings requiring attention; recent actions and
notes.

### Risk findings table

Columns: Finding; Category; Severity/review priority; Evidence;
Confidence/certainty description; Status; Recommended next step.

Example categories: Document inconsistency; Missing required document;
Duplicate identifier; Borrower/entity relationship requiring review;
Financial-information mismatch; Collateral information conflict;
Loan-purpose evidence gap.

Each finding opens a detail drawer with what was observed, why it
matters, exact source document/page/field/record, known vs unknown
information, possible benign explanations, recommended verification
steps, comments and resolution status.

### Cross-verification

Compare names/aliases, addresses, dates and identifiers, declared income
vs supporting documents, collateral/receipt IDs across available
applications, and company/director information where a reliable source
exists. Fuzzy name similarity is not proof of identity.

## 9. Borrower directory and profile

### Directory

Search by borrower name, borrower ID, loan ID or permitted identifier.
Filters: borrower type, branch, loan status, review status, date range.

Columns: Borrower; Type; Active loans; Branch; Last activity; Open
findings; Action. Mask sensitive identifiers by default.

### Profile

Header: name and borrower ID, borrower type, branch/relationship manager
where available, status and last updated date.

Tabs: Overview; Applications & Loans; Documents; Related Entities;
Transaction Activity (only when data exists); Findings & Cases; Activity
History.

For each relationship show related entity, relationship type, source,
observed date, evidence excerpt/reference, and confidence/verification
state. Separate known information from inferred links.

## 10. Document Library

Provide a central library of uploaded documents, subject to permissions.

Features: search by applicant/application ID/document type/upload date;
filters for language, processing status, document type and verification
status; thumbnail/list toggle.

Metadata: filename, linked application, document type, language,
uploaded by, upload date, processing status.

Actions: preview, download (if permitted), replace, reprocess, link to
application. Show failure reason and retry action for failed extraction.
Do not show content to unauthorized users. Clearly mark documents not
yet reviewed.

## 11. Post-disbursement transaction monitoring

### Purpose

Help analysts investigate unusual movements in available loan-related
transactions. This requires authorized transaction records; public
records alone cannot establish a complete money trail.

### Header and filters

Title: **Post-disbursement Monitoring**\
Supporting text: **"Review transaction patterns and investigate
movements that may need attention."**

Filters: loan/borrower, branch, date range, transaction type, alert
status. Actions: Import transaction file, Run analysis, Export results
(only if implemented).

### Summary cards

Loans under monitoring; Transactions analysed; New alerts; Open
investigations. Counts must reflect the current dataset and filters.

### Loan selector and summary

Searchable loan selector; loan ID; borrower; disbursement date; amount;
stated purpose; monitoring period; data-source label; last updated
timestamp. Show **"No transaction data available"** when appropriate.

Order on the page: loan summary, then **Alerts for this loan** directly
before **Transaction flow** (alerts can be highlighted in the flow), then
the transaction table.

### Transaction flow visualisation

Interactive graph/timeline: - Root node: borrower or disbursing
account. - Subsequent nodes: counterparties/entities present in
available records. - Edges: transfer direction, amount and date. - Click
node for entity/transaction details. - Hover/focus for accessible
details. - Filters: date, amount, counterparty, transaction type and
graph depth. - Include a table alternative for accessibility and export.

### Monitoring patterns

Prototype rules may include: - Rapid onward transfers after
disbursement. - Payments to counterparties already linked in available
records. - Repeated payments to a counterparty across loans. - Potential
circular movement where observed transactions support it. - Large cash
withdrawals or unusual splitting, where data supports the rules. -
Activity inconsistent with declared purpose only when reliable purpose
and transaction information exist.

For every alert show the exact rule, fields used, time window,
transactions involved, threshold and explanation. Timing/amount alone
does not prove illegality.

### Transaction table

Date/time; Transaction ID; From entity/account (masked); To
entity/account (masked); Amount; Transaction type; Related loan;
Monitoring indicator; Action.

### Alert detail drawer

Alert title and review priority; triggered rule; timeline of relevant
transactions; related entities; total amount in observed sequence with
calculation basis; source records; benign explanations to consider;
suggested steps; analyst notes; status (New / In review / Escalated /
Resolved / False positive); resolution reason and audit trail.

## 12. Entity network / relationship graph

Reusable graph available from borrower profiles, applications and
investigations.

### Entity types

Individual borrower; company/firm; director/owner/partner; guarantor;
counterparty; bank account (masked); loan; document; court
case/regulatory proceeding; address/intermediary where supported by
evidence.

### Relationship types

Director of; Owner/partner of; Borrower for; Guarantor for; Transferred
funds to; Shared document/identifier; Appears in the same public
proceeding; Shares address/contact (only when lawfully available and
appropriate).

### Graph behaviour

- Distinguish verified relationships from inferred/possible matches.
- Show evidence source and observed date for every edge.
- Expand one relationship level at a time.
- Search, zoom, pan, reset and fit-to-screen.
- Provide a table/list alternative.
- Do not imply suspicion solely because entities share a director,
  address or counterparty.
- Never invent links to make the graph appear interesting.

## 13. Investigations / case management

### List

Search by case ID, borrower, company, loan ID or finding. Filters:
status, priority, branch, owner, date opened and source.

Columns: Case ID; Title; Linked borrower/entity; Priority; Owner; Opened
date; Last update; Status.

### Detail

Header: case ID/title, review priority, status, assigned analyst,
created/updated timestamps. Actions: Assign, Add note, Export case
summary, Change status.

Tabs: Case overview; Evidence; Entity network; Financial timeline;
Findings; Notes & actions; Audit history.

### Evidence panel

Each item shows source name/link/reference, source type (uploaded
document, transaction record, public filing, judgment/order, internal
record), date collected, exact excerpt or field,
page/paragraph/transaction reference, evidence status (Verified source /
User-provided / Unverified / Contradicted), and Open original source.

### Workflow

New; Triage; In review; Information requested; Escalated; Resolved;
Closed.

Record user, time and reason for each status change. Support notes and
next-action checklists. Do not label a person/entity guilty.

## 14. Reports & Alerts

### Reports page

Tabs: Monthly Overview; Pre-disbursement Review; Post-disbursement
Monitoring; Open Investigations; Document Processing; Branch Summary
(only if authorized for multiple branches).

### Monthly overview

Reporting period selector; total applications processed; applications
needing review; extraction completion/failure rate; open/closed alerts;
transaction volume analysed (if available); findings by category and
review priority; trend chart; unresolved items and suggested actions.

Values must be calculated from the selected dataset and period. Never
hardcode performance improvements or claim losses prevented without
evidence.

### Report controls

Generate PDF/CSV only if implemented. Show progress and
completion/failure. Include generated timestamp, date range, scope, and
Demo data marker where applicable. Exports must respect permissions and
mask sensitive identifiers by default.

### Alerts page

Tabs: All / New / In review / Escalated / Resolved. Filters: priority,
category, branch, date, source and assigned user. Search by
alert/case/loan ID.

Each row shows title, reason, linked record, time, status and next
action. Clicking opens details with evidence and suggested checks.

## 15. Settings and user profile

### Profile

Name, employee ID, work email, role, branch, preferred language,
avatar/initials, save/cancel.

### Preferences

Language: English / मराठी; theme Light / Dark / System (Light default);
date format/timezone; notification preferences; optional table
density/dashboard preferences.

### Risk and monitoring configuration

Restrict to authorized admin/risk roles: - Review-priority thresholds -
Monitoring rules and thresholds - Supported document checklist by loan
product - Alert routing/assignment - Data source configuration/status

Show rule version, effective date and last updated by. Ordinary users
must not silently change global risk rules.

### User management (optional)

Only if role-based access is implemented. Roles may include Branch
Officer, Branch Manager, Risk Analyst, Investigator and Administrator.
Enforce permissions in backend as well as UI; hiding a button is not
security.

## 16. Risk and status language

### Review priority

- **Routine review** --- no configured alert found in available data;
  not a guarantee of safety.
- **Needs attention** --- one or more inconsistencies or patterns need
  verification.
- **Urgent review** --- a configured high-priority pattern or
  significant evidence gap needs timely human attention.

If using Low / Medium / High, explain the meaning. Never call a
heuristic/model output a calibrated probability unless it has been
calibrated and validated.

### Attention score

A 0--100 number on the application's Risk step, computed by code from
weighted findings (methodology in section 7, Step 4). Its bands use the
three labels above (0--29, 30--59, 60--100). Always show it with its
band (icon and text), its drivers and the line "not a probability or a
decision". Drivers from the AI investigator are labelled "AI finding
(evidence verified)"; the AI never sets the number. It is not the synthetic loan risk score on the Risk scores
page, which is a separate four-layer score (`docs/RISK_SCORING.md`).

### Evidence status

Extracted; User confirmed; Verified externally; Inconsistent; Unclear;
Not checked.

### Alert status

New; In review; Escalated; Resolved; False positive.

### Required disclaimers

- OCR extraction does not establish document authenticity.
- A relationship does not establish wrongdoing.
- An alert is not a fraud determination.
- Results depend on completeness and quality of available data.
- Public-source data may be incomplete, delayed or ambiguous.

## 17. Marathi-first document handling details

Because rural branches may receive paper records in Marathi, document
capture is core functionality.

- Accept camera photos, scans and PDFs.
- Make capture usable on low-to-mid-range mobile devices.
- Show upload and processing progress per document/page.
- Detect language where possible and allow manual correction.
- Display original Devanagari text faithfully where extraction
  supports it.
- Provide optional English translation alongside, never instead of,
  original.
- Retain source image/page references for each extracted field.
- Allow corrections to names, village/taluka/district, dates, survey
  numbers and units.
- Handle Marathi numerals and Arabic numerals without silently
  changing values.
- Highlight uncertain characters and conflicting values.
- Provide manual-entry fallback for handwriting or poor scans.
- Keep user corrections distinct from machine-extracted text in audit
  history.

Document processing states: Queued; Uploading; Processing; Needs review;
Completed; Failed / Retry available.

## 18. Privacy, security and auditability

Do not imply production-grade security features that are not
implemented.

- Mask Aadhaar and bank account numbers by default.
- Do not log sensitive document text or credentials to browser
  console.
- Show uploader and upload time where metadata exists.
- Confirm before deleting/replacing evidence.
- Preserve audit history of edits and confirmations.
- Restrict document, borrower, transaction and case views by role
  where auth exists.
- Use HTTPS in deployed environments.
- Never put service-account keys/API keys in frontend code.
- Call Gemini from a server-side backend.
- Do not use real customer/bank records without explicit
  authorization.
- Avoid sending unnecessary personal data to AI; mask identifiers
  where feasible.
- Define retention/deletion before using real data.

## 19. Loading, error, empty and success states

### Loading

Skeleton cards/table rows; processing indicator with current step; avoid
indefinite spinners; provide retry/cancel where safe.

### Empty examples

- "No applications yet. Start a new application or load the demo
  dataset."
- "No alerts match these filters. Try a wider date range."
- "No transaction records are available for this loan."
- "No related entities were found in available records. This does not
  prove no relationship exists."

### Error

Explain failure in plain language. Keep uploaded files and entered
fields when possible. Provide Retry and Back where appropriate. Never
show raw stack traces to users.

### Success

Toast and visible status update. Link to created
application/report/case. Confirm what completed.

## 20. Responsive design

### Desktop

Full sidebar, top search, multi-column dashboard and split-pane document
review. Keep viewer and extracted fields visible together on wide
screens.

### Tablet

Collapsible sidebar; two-column cards; document viewer and extracted
data may stack or use tabs.

### Mobile

Drawer or compact bottom navigation; single-column cards/forms; large
camera/upload targets; sticky bottom Next/Save where useful; viewer and
extracted data in tabs; avoid cramped tables; ensure Marathi text wraps
without clipping.

## 21. Suggested component structure

Adapt to the existing repository rather than creating unnecessary
abstractions.

```text
src/
  app/
    login/
    dashboard/
    applications/
      new/
      [applicationId]/
    documents/
    borrowers/
      [borrowerId]/
    monitoring/
    investigations/
      [caseId]/
    reports/
    alerts/
    settings/
  components/
    app-shell/
      sidebar.tsx
      topbar.tsx
      user-menu.tsx
    dashboard/
      kpi-card.tsx
      portfolio-chart.tsx
      recent-applications.tsx
      recent-alerts.tsx
    documents/
      document-upload.tsx
      camera-capture.tsx
      document-list.tsx
      document-viewer.tsx
      extracted-fields.tsx
      language-panel.tsx
    applications/
      application-stepper.tsx
      application-form.tsx
      risk-findings.tsx
    monitoring/
      transaction-filters.tsx
      transaction-table.tsx
      transaction-flow.tsx
      alert-detail.tsx
    investigations/
      entity-graph.tsx
      evidence-panel.tsx
      case-timeline.tsx
    reports/
      report-filters.tsx
      report-chart.tsx
    shared/
      status-badge.tsx
      priority-badge.tsx
      empty-state.tsx
      error-state.tsx
      loading-skeleton.tsx
      confirm-dialog.tsx
      toast-provider.tsx
  lib/
    validation/
    formatting/
    demo-data/
    permissions/
    api/
  types/
```

Follow existing framework conventions, including Next.js App Router if
used.

## 22. Demo data and believable interactions

Seed the prototype with clearly fictional records: - 10--20 loan
applications. - Several document types, including synthetic Marathi
7/12-style sample text/image if available. - Clean records, missing
fields, conflicting dates, repeated identifiers and legitimate
overlaps. - A small transaction ledger with ordinary payments and a few
seeded patterns. - A few fictional companies and related entities. -
Several investigation cases in different statuses.

Let a reviewer: 1. Open a new application. 2. Upload or select demo
documents. 3. See extraction states and editable extracted fields. 4.
Correct a field and confirm it. 5. Run configured demo checks. 6. Review
findings and evidence. 7. Open monitoring for a demo loan. 8. View
transactions and relationship graph. 9. Open an alert and add an
investigation note. 10. View a monthly report and export if implemented.

Do not make every record high risk. Include legitimate overlaps and
clean examples.

If OCR/Gemini is not connected, label output **Simulated demo output**.
Never show fake processing as a real AI request.

## 23. Acceptance criteria

- [ ] Login page matches brand and works on desktop/mobile.
- [ ] Sidebar/top navigation work and show active routes.
- [ ] Dashboard KPIs, charts, applications and alerts use demo
      dataset.
- [ ] New application can be created and saved as draft.
- [ ] Multiple images/PDFs can be selected, previewed, removed and
      associated.
- [ ] Camera capture path works where browser/device supports it.
- [ ] Marathi/English document states are clear.
- [ ] Extracted fields can be edited and marked
      confirmed/corrected/unclear.
- [ ] Source document can be compared with extracted fields.
- [ ] Risk findings show evidence and next verification steps.
- [ ] Borrower directory/profile and document library are navigable.
- [ ] Monitoring has filters, transaction rows and accessible
      flow/timeline.
- [ ] Alerts can be opened, reviewed and updated.
- [ ] Investigations support notes, evidence, statuses and audit trail
      in demo.
- [ ] Reports use selected period and available data.
- [ ] Search, dropdowns, tabs, dialogs, filters and primary buttons
      work.
- [ ] Loading, empty, error and success states are implemented.
- [ ] Sensitive identifiers are masked.
- [ ] No unsupported claims of authenticity, fraud certainty or real
      public-record verification.
- [ ] No real credentials/secrets committed.
- [ ] README explains setup, demo mode, integrations and limitations.

## 24. Recommended build order

1.  Design system and app shell.
2.  Login/demo sign-in and dashboard.
3.  New application/document capture, previews, document categories and
    multi-page handling.
4.  Extraction/review workspace, editable fields, source comparison and
    verification states.
5.  Risk findings and case detail, evidence drawer, notes, statuses and
    audit history.
6.  Post-disbursement monitoring, transaction table, seeded alerts,
    timeline/flow and rule explanations.
7.  Borrowers, document library and entity graph.
8.  Reports, alerts and settings.
9.  Responsive/accessibility pass, error states, demo walkthrough and
    README.

Do not begin by building every backend integration. First complete the
UI workflow with clearly marked synthetic data, then connect OCR, Gemini
and storage behind stable interfaces.

## 25. Final instruction to the agent

Build a **cohesive, modern banking workspace**, not unrelated mockup
pages. The most important workflow is:

**Capture paper document → extract Marathi/English information → human
verifies extracted fields → application checks produce evidence-backed
findings → after disbursement, transaction monitoring adds new evidence
→ investigator reviews a unified case.**

Keep the experience fresh and approachable, but make evidence,
traceability, human review and data limitations visible throughout.
Finish a complete, navigable prototype before polishing secondary
features.
