# UI showcase plan: sidebar and new features

_Drafted 18 Oct 2026 on branch `remaining-ui-changes-2`. Status: **approved 18 Oct 2026**. The owner
accepted every recommendation in §6. Do not commit until the owner says so. Build order: §0._

## 0. Revised after the judging criteria (owner, 18 Oct 2026)

| Criterion (weight)               | What judges look for                                   | Where FinRakshak scores it                                                                                                                                                                                                                                     |
| -------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Technical merit & Gen AI (40%)   | Gen AI that solves the problem; sound build; can scale | Grounded, **citation-verified** copilot (every claim must cite a record that was sent; numbers checked; verdict words removed); AI drafts in each workflow; AI hub showing the 5 agents, their guardrails and the provider switch (mock / Gemini API / Vertex) |
| Problem alignment & impact (25%) | Solves the stated problem; clear value for users       | The journey rail (pre-sanction → ₹ disbursed → post-disbursement → investigate); My queue; money trail; credit memo in minutes                                                                                                                                 |
| Innovation & creativity (25%)    | Fresh approach; Gen AI beyond a chat box               | AI that drafts but never decides (B-58); AI narrates the money trail; the pattern miner proposes new typologies for a human to approve; contagion radar                                                                                                        |
| UX & solution design (10%)       | Intuitive, accessible, AI fits the flow                | Mission rail, ⌘K, ⌘J for the copilot, Story mode, WCAG 2.2 AA, dark mode, 360 px                                                                                                                                                                               |

**What changed:** Gen AI carries 65% of the score (40% + 25%), but today the UI shows it in only two
places: the application's AI analysis card (cloud sign-in only) and the risk-score explanation. The
pipeline already has 4 more AI agents (ingestion agent, AI evidence extraction in shadow mode, pattern
miner, risk explainer) that the UI never shows. So Gen AI moves from Phase 4 to Phase 2 and becomes a
layer across the whole journey.

**Status (18 Oct 2026):** Phase 1 **built** (mission rail, branch scope with B-65, live counts, pinned
records, My queue, mobile tab bar, stage labels in page headers). Phase 2A **built**: FinRakshak
Copilot, with the `assistRecord` callable, the grounding check (B-66) and the demo simulator, documented
in `docs/COPILOT.md`. Next: 2C AI hub, then 2B and Phase 3. Nothing is committed.

**Build order:**

1. **Phase 1, shell:** mission rail (§2) plus My queue v1 and a copilot entry point (⌘J).
2. **Phase 2, Gen AI layer:**
   - **2A FinRakshak Copilot.** A side panel on applications, borrowers, loans, alerts and cases. It
     builds a "context pack" from the record (IDs masked, B-64) with tasks: explain the flag, what
     to verify next, draft an information request, draft a memo section, narrate the money trail.
     - New callable `assistRecord`. Steps: auth, zod validation, rate and daily limits (B-08, B-15),
       a delimited prompt (B-16), Gemini JSON mode (B-10 to B-14), then a grounding check. The
       grounding check drops claims without a valid citation, numbers that are not in the pack, and
       verdict words.
     - The panel shows a verification badge such as "4 of 4 statements cite a record".
     - In the demo session no model is called. The panel builds a deterministic answer from the same
       pack, labelled **"Simulated demo output, no AI model called"** (spec §1).
   - **2B AI in each workflow.** Triage suggestion on an alert (a human decides, with a required
     reason), AI credit-memo draft, AI money-trail narrative.
   - **2C AI hub page.** The 6 AI components, their models and providers, what data each one gets,
     their guardrails, the human approvals waiting, today's usage against the limit, and an
     architecture diagram that shows how it scales.
3. **Phase 3:** money trail Sankey (2.1), Story mode (2.4), My queue v2 with due times and AI triage
   (2.2), "Since you were away" (2.5), "Why this score" waterfall (2.3).
4. **Phase 4:** Borrower 360 (3.1), decision room plus AI memo (3.2/3.3), Cases board (4.1),
   contagion radar (4.2), insights (4.3), productivity pack (4.5), RBI early-warning tags (4.6).

Goal: make the two jobs of FinRakshak AI obvious within 10 seconds: **check before you lend** (pre-sanction
risk analysis) and **watch after you lend** (post-disbursement monitoring). Also show the product's
strengths (12 automated checks, real public records, money-flow rules, explainable scores), which the
current UI hides behind plain lists.

## 1. Why the sidebar feels unfinished

| #   | Problem                                                                                                                                             | Seen where                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 1   | A flat list of 12 links that all look the same, so nothing shows what matters now or tells the before/after story.                                  | Sidebar                            |
| 2   | Section names are small grey text. "Before / After the loan" read like folders, not a journey, and nothing marks disbursement as the turning point. | Sidebar                            |
| 3   | Only Alerts shows a number. The other queues give no signal: Applications (6 waiting), Cases (3 open), new public-record hits.                      | Sidebar                            |
| 4   | Same white surface as the page, so the sidebar has no frame. Polished fintech apps give it its own surface.                                         | Shell                              |
| 5   | The tagline wraps onto 2 lines, there is a big empty gap under Reports, and the footer takes 3 rows (Settings, Help, user).                         | Sidebar                            |
| 6   | **The numbers disagree:** the bell shows 15 (new and unread) while the sidebar shows 19 (open). Judges notice this.                                 | `Notifications.tsx`, `Sidebar.tsx` |
| 7   | Nothing personal: no pinned borrowers, loans or cases, and no recent items (recent items exist only inside ⌘K).                                     | Sidebar                            |
| 8   | Nothing shows that the app is live: the daily public-records watch and the AI mode run silently.                                                    | Shell                              |
| 9   | Alerts mixes all 4 sources (pre-sanction findings, monitoring, public records, risk scores), but it sits under "After the loan".                    | `lib/alerts.ts`                    |

## 2. Phase 1: the new sidebar ("mission rail")

```
┌──────────────────────────────────┐
│ ◆ FinRakshak AI              ⟨⟨  │
│ ┌──────────────────────────────┐ │
│ │ MU  Mumbai branch          ▾ │ │  branch + role switcher (global scope)
│ │     Branch manager           │ │
│ └──────────────────────────────┘ │
│ 🔍 Search…               Ctrl K  │
│                                  │
│ WORKSPACE                        │
│ ⌂  Command center                │
│ ☰  My queue                  7   │  new: everything waiting on me
│ 🔔 Alerts                   19   │  red pill when any is Urgent
│                                  │
│ ① PRE-SANCTION     6 to review   │  stage colour: blue
│ │  Applications              6   │
│ │  Borrowers 360                 │
│ │  Documents                 2   │
│ │                                │
│ ◉── ₹ Disbursed · 8 loans ────   │  checkpoint between the stages
│ │                                │
│ ② POST-DISBURSEMENT  3 flagged   │  stage colour: teal
│ │  Loan book                 3   │
│ │  Public records watch    NEW   │
│ │  Risk scores           SYNTH   │
│                                  │
│ ③ INVESTIGATE                    │  stage colour: violet
│    Cases                     3   │
│    Relationship graph     BETA   │
│                                  │
│ INSIGHTS · Reports               │
│                                  │
│ ★ PINNED                     ▾   │
│    Ganesh Agro Traders · A-1003  │
│    L-2023-0601                   │
│                                  │
│ ┌ Portfolio pulse ─────────────┐ │
│ │ █████████▒▒▒░   8 loans      │ │
│ │ 5 routine · 2 attention · 1 urgent │
│ └──────────────────────────────┘ │
│ ● Public records checked 09:12   │
│ ● AI: demo mode (mock)           │
│ (AP) Anjali Patil        ⚙   ?   │
└──────────────────────────────────┘
```

| Item | What                                                                                                                                                                                                                                | Effort |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1.1  | Dark navy sidebar surface (same gradient as the login hero and dashboard banner) in both themes, with stage accents: blue for pre-sanction, teal for post-disbursement, violet for investigate. Contrast ≥ 4.5:1.                   | M      |
| 1.2  | **Journey rail:** numbered stage headers joined by a vertical line, with a **"₹ Disbursed · N loans"** checkpoint between pre-sanction and post-disbursement. Each header shows a one-line status ("6 to review", "3 flagged").     | M      |
| 1.3  | **Live counts on every queue**, toned by priority (red when any item is Urgent, amber for Needs attention, grey otherwise). One shared counts module so the bell, sidebar, dashboard and ⌘K always agree (fixes problem 6).         | S      |
| 1.4  | **Workspace section** (Command center, My queue, Alerts), because Alerts covers both stages.                                                                                                                                        | S      |
| 1.5  | **Branch and role switcher** at the top (workspace-switcher style). Sets one branch scope used by every list, not only Dashboard and Reports. When filtered, a chip shows "2 urgent in other branches" so nothing urgent is hidden. | M      |
| 1.6  | **Pinned items:** a star on borrower, application, loan and case pages; up to 5 in the sidebar (zod-validated localStorage). Shows "Recent" when nothing is pinned.                                                                 | S      |
| 1.7  | **Portfolio pulse:** a stacked bar of loans by review priority; click it to open the Loan book. Collapsible.                                                                                                                        | S      |
| 1.8  | **Live status footer:** when public records were last checked (a stale warning, B-43/B-56) and the AI mode ("demo mode (mock)" / "connected"). User, Settings and Help on one row.                                                  | S      |
| 1.9  | **Collapsed rail (72 px):** icons with stage ticks and count dots; hovering shows a flyout with the label, count and shortcut ("G A").                                                                                              | S      |
| 1.10 | **Mobile bottom tab bar** below 768 px: Home, My queue, Applications, Alerts, More (opens the drawer).                                                                                                                              | S      |
| 1.11 | **Motion:** the active indicator slides between items and counts tick up. All of it is off under `prefers-reduced-motion`.                                                                                                          | S      |
| 1.12 | Stage chip in page headers and breadcrumbs ("① Pre-sanction › Applications") so every page shows where it sits in the journey.                                                                                                      | S      |

## 3. New pages and tabs (phases 2 to 4)

Ranked by how much they help the showcase for the effort. All of them reuse data the app already has.

### Phase 2: features that impress judges

| #   | Feature                        | What it does                                                                                                                                                                                                                                                                                                                                           | Built on                                          | Effort |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | ------ |
| 2.1 | **Money trail (Sankey)**       | On a loan: disbursement → first-hop groups (stated-purpose supplier, related party, cash, other banks, unknown) → second hop, plus a headline figure such as "62% reached the stated purpose". This is the original fund-tracing idea, shown as the strongest visual. It also fixes the known 360 px sideways scroll from the flow SVG.                | `TransactionFlow.tsx`, monitoring rules, entities | M–L    |
| 2.2 | **My queue**                   | One inbox: applications waiting for me, alerts assigned to me, cases I own and info requests due, each with a due time ("due in 4 h", "overdue 1 d", IST days, B-27). Keyboard triage: J/K to move, A to assign to me, E to escalate to a case, D to dismiss as benign with a required reason.                                                         | `MyWork.tsx`, `allAlerts`, `actions.ts`           | M      |
| 2.3 | **"Why this score" waterfall** | Bars showing how each layer (public records, repayment behaviour, typology patterns) adds up to the score, plus "what changed since last month". The same idea applies to application findings. Bands use only the lead wording (B-58).                                                                                                                | risk-score detail and reason text                 | S–M    |
| 2.4 | **Story mode (guided demo)**   | "▶ Take the 2-minute tour": spotlight steps through the 3 scenarios we already built: the Maheep trade-credit chain (caught before sanction), Advantage Overseas (CIRP and ED after disbursement) and Jai Corp (sudden ED attachment). Each step says which parts are real public records and which are made-up loan values (B-54). Demo session only. | `e2e/scenarios/*`, seed TEST loans                | M      |
| 2.5 | **"Since you were away"**      | On the Command center: new public-record hits, alerts escalated, applications submitted and scores that moved up since your last visit.                                                                                                                                                                                                                | audit log, alerts, `lastSeen` in localStorage     | S      |

### Phase 3: connect before and after (what makes the product different)

| #   | Feature                                  | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                        | Effort |
| --- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 3.1 | **Borrower 360 with a lifecycle ribbon** | A ribbon across the top: Applied → Checked → Sanctioned → Disbursed → Monitored → Flagged → Case, each with its date and priority at that stage. Tabs go from 7 to 4: Overview · Loans & money trail · Records & relationships · Activity.                                                                                                                                                                                                          | M      |
| 3.2 | **Decision room (maker–checker)**        | "Mark ready for decision" opens a panel: recommend sanction, sanction with conditions or decline, with reason codes. A branch manager approves, and the person who made the recommendation cannot approve it. **Sanction conditions become post-disbursement tasks** (for example "end-use proof within 30 days"), shown on the Loan book with due dates. In the demo session this is UI-only and labelled as such (B-06/B-07 apply in cloud mode). | L      |
| 3.3 | **Credit memo and case file**            | One click builds a print-ready appraisal note (borrower, loan, check results, public-records findings, a labelled AI summary, reviewer decisions, sign-off block) that prints to PDF. The same layout produces a case file for Cases.                                                                                                                                                                                                               | M      |

### Phase 4: depth for investigation and reporting

| #   | Feature                               | What it does                                                                                                                                                                                                                                                                                                                                     | Effort                |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| 4.1 | **Cases board**                       | A Kanban view (Open → Investigating → Escalated → Closed) with due chips and owners. Moving a card asks for confirmation and writes an audit entry; repeated drops are idempotent (B-24). Case tabs go from 7 to 4: Overview · Evidence & findings · Network & money trail · Notes & audit.                                                      | M                     |
| 4.2 | **Contagion radar**                   | "Which of our loans sit within 2 links of a company with a fresh insolvency or ED record?" Uses the graph-lab relationships plus the loan book. Large hubs are excluded (B-40), only exact matches are merged (B-37), and being named in an order does not mean being accused (B-42). It loads a slice of the data, not the 36 MB bundle (B-41). | L                     |
| 4.3 | **Portfolio insights**                | Branch × product heatmap of open-alert rate, alert ageing buckets, outcome analytics (leads closed as benign vs escalated) and turnaround time.                                                                                                                                                                                                  | M                     |
| 4.4 | **Ask FinRakshak (AI side panel)**    | A right-hand drawer on any record with suggested questions ("Summarise for credit committee", "Why is this flagged?", "Draft the information request"). Answers link to the evidence and are always labelled "AI draft, verify". Mock first. A live model needs B-15 (budget) and B-64 (masking) resolved.                                       | M (UI) / L (callable) |
| 4.5 | **Productivity pack**                 | Compact Monitoring filters, saved views, bulk actions on Alerts and Applications, J/K list navigation, sticky table headers, density toggle.                                                                                                                                                                                                     | M                     |
| 4.6 | **RBI early-warning tags** (optional) | Tag each alert with the matching early-warning indicator from RBI's fraud risk directions, worded as "indicator matched (lead)". The indicator list must be verified against the source first.                                                                                                                                                   | M                     |

## 4. Boundary conditions this work touches

B-01/B-39 (money in the Sankey: paise integers and `addMoney` only), B-24 (repeated board drops and
decision clicks), B-27 (due times and "since you were away" use IST days), B-36/B-37/B-40/B-41/B-42
(contagion radar), B-43/B-56 (stale public data shown as stale, never as low risk), B-44 (safe links
in AI citations), B-54 (keep the SYNTH and TEST labels, including in Story mode), B-58 (lead wording),
B-06/B-07 (maker–checker once it runs in the cloud), B-10 to B-16, B-62 and B-64 (AI side panel).

**New condition to add when 1.5 is built:** a branch filter must never silently hide an Urgent item;
the scope chip must show how many urgent items exist in other branches.

## 5. Spec impact

`docs/finrakshak-ai-ui-spec.md` needs updating for the new labels, the tabs reduced to 4 on the borrower
and case pages, My queue, and the decision room. These updates ship in the same change as each item.

## 6. Owner decisions (all answered 18 Oct 2026: "go with all your decisions")

1. Sidebar surface: dark navy (recommended) or light.
2. Labels: "Pre-sanction / Post-disbursement" (banker terms, recommended) or keep "Before / After the
   loan"; "Monitoring" → "Loan book"; "Dashboard" → "Command center"; "Graph Lab" → "Relationship graph".
3. The branch switcher filters every page (recommended) or only the Dashboard and Reports.
4. RBI early-warning tags (4.6): yes or no.
5. AI side panel (4.4): UI on the mock only, or also a new callable.
6. Build order. Recommended: Phase 1 → 2.1 → 2.4 → 2.2 → 3.1, then the rest.
