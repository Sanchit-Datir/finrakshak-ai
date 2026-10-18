# FinRakshak AI graph lab — relationship discovery report (SYNTHETIC)

Generated 2026-10-16T14:21:46.144Z.

- SYNTHETIC TEST DATA — not real companies or findings.
- Exploratory graph of public records. A connection is not evidence of wrongdoing.
- established = stated in a source record; candidate = inferred (text mention, similar name) and needs review.
- weak edges (hub routes, text mentions, insolvency professionals, identity candidates) are shown but never chain networks.
- No director data is available, so shared-director links cannot be established.
- score = distinct sources + organisations named in adverse records + 3 × seed cases
- S1 Benign shared address: Three unrelated companies at one co-working address form a low-score network with no adverse records.
- S2 Service address hub: Twelve companies at one address: the address is a hub and links nobody.
- S3 Large-bank creditor hub: A bank filing against eight debtors does not chain those debtors into a network.
- S4 Specific creditor: A small lender filing against two debtors links them (established, strong).
- S5 Ambiguous names: "Shree Ganesh Steels Pvt Ltd" vs "Shree Ganesh Steel Ltd" stay separate and appear only as an identity candidate.
- S6 Same name, different towns: Two "Urban Co-operative Bank" entries in different towns are neither merged nor proposed as identical.
- S7 Documented co-party: Two companies named in the same order are linked through that order, with evidence.
- S8 Text mention only: A company only mentioned in a press release is a weak candidate link, not a network member.
- S9 Batch notice: An RBI notice cancelling eight registrations is a hub and links none of them.
- S10 Group companies: Two registered companies with similar names at one address are linked through the address but never proposed as the same entity (different CINs).

## Datasets used

SYNTHETIC scenarios generated in code (`ingest/src/graph/scenarios.ts`): 41 companies, 3 banks, 1 LLPs, 0 audit firms, 0 other organisations, 1 professionals, 3 registered addresses and 11 case events, all fictional ("SYNTH …", example.invalid links). Nothing here comes from `data/processed` or describes a real organisation.

## Relationship types implemented

| Edge | Basis | Count | Meaning |
| --- | --- | --- | --- |
| `named_in` | established | 19 | Organisation named in an order / notice / press release (title or listing field) |
| `mentioned_in` | candidate | 1 | Organisation appears only in document text — may be incidental |
| `insolvency_applicant_against` | established | 10 | Applicant (financial/operational creditor, the company itself or a regulator) filed insolvency against a debtor (IBBI); regulator applicants never chain networks |
| `insolvency_professional_for` | established | 8 | Insolvency professional appointed for a debtor (IBBI) — routine, weak |
| `auditor_of` | established | 0 | Audit firm named with the audited company (NFRA) |
| `audit_partner_for` | established | 0 | Audit engagement partner for the company (NFRA) |
| `registered_at` | established | 17 | Registered office address (MCA master, Maharashtra only) |
| `possible_same_entity` | candidate | 1 | Similar names (and/or same address) — needs manual review, never merged |

Established edges: 54. Candidate edges: 2. Strong (used to find networks): 18. Weak (shown only): 38. Identity candidates for review: 1.

## What the graph reveals

- 4 networks contain two or more organisations linked by strong, established records (2 orgs: 2, 3-5 orgs: 2, 6-20 orgs: 0, 21+ orgs: 0).
- 1 events name two or more parties directly; 2 registered addresses are shared by two or more organisations; 2 applicant→debtor links come from non-hub, non-regulator applicants.
- Hubs suppressed from network chaining (largest first): SYNTHETIC Service Address, 9 Test Road, Pune (address, degree 12); SYNTH National Bank Ltd (bank, degree 8); SYNTH INSOLVENCY PROFESSIONAL (person, degree 8); SYNTH RBI cancels registration of 8 NBFCs (event, degree 8).
- Seed cases connected to each other:
  - No network connects two different seed cases through established, non-hub records.

## Top networks (leads for human review, not findings)

| # | Score | Orgs | Sources | Seed cases | Organisations (first 5) |
| --- | --- | --- | --- | --- | --- |
| 1 | 4 | 2 | mca_ogd, sebi | — | SYNTH Delta Exports Ltd; SYNTH Epsilon Holdings Ltd |
| 2 | 1 | 3 | mca_ogd | — | SYNTH Alpha Traders Pvt Ltd; SYNTH Gamma Design LLP; SYNTH Beta Foods Pvt Ltd |
| 3 | 1 | 3 | mca_ogd | — | SYNTH Small Finance Ltd; SYNTH Lambda Infra Pvt Ltd; SYNTH Kappa Infra Pvt Ltd |
| 4 | 1 | 2 | mca_ogd | — | SYNTH Omega Steel Industries Ltd; SYNTH Omega Steel Trading Ltd |

## What the evidence cannot establish

- **Shared directors**: no director/signatory data is in the dataset (needs MCA21 filings), so director links are absent.
- **Fund flows**: no record documents transfers between companies; applicant links only say who filed insolvency against whom, not how much was lent or where it went.
- **Wrongdoing**: being named in a proceeding, sharing an address, creditor or professional is not evidence of fraud. Interim orders, ED attachments and show-cause notices are allegations.
- **Identity**: names are regex-extracted; similar names are listed as candidates and never merged. Two different CINs are always two legal entities, so similar-named group companies are linked through their shared address, not proposed as duplicates. Addresses cover Maharashtra companies only.
- **Completeness**: SEBI is a 10-order sample; only enforcement-type RBI releases and seed-case IBBI PDFs were fetched. Absence of a link is not absence of a relationship.

## How to run

```bash
npm run build -w @finrakshak-ai/shared && npm run build -w ingest
node ingest/dist/graphCli.js --web   # writes data/graph/* and web/public/graph-lab/
npm run dev -w web                   # open http://localhost:5173/graph-lab (demo sign-in first)
```

## Improve before cloud deployment

1. Director/signatory data (MCA21) and national MCA master coverage, so shared-director and cross-state address links exist.
2. Human-reviewed identity resolution: work through `identity_candidates.jsonl`; persist decisions as reviewed edges.
3. Gemini-assisted extraction of parties and roles from order text, with excerpts, to replace regex name candidates.
4. Calibrate hub thresholds and network scoring on reviewed historical cases (time-aware backtest), and measure false positives.
5. Move graph build to a scheduled Cloud Run job writing BigQuery node/edge tables; serve subgraphs on demand instead of one bundle.
