# FinRakshak AI graph lab — relationship discovery report

Generated 2026-10-16T14:21:46.075Z.

- Exploratory graph of public records. A connection is not evidence of wrongdoing.
- established = stated in a source record; candidate = inferred (text mention, similar name) and needs review.
- weak edges (hub routes, text mentions, insolvency professionals, identity candidates) are shown but never chain networks.
- No director data is available, so shared-director links cannot be established.
- score = distinct sources + organisations named in adverse records + 3 × seed cases

## Datasets used

Read-only from `data/processed` (built 2026-10-16T13:13:33.289Z): 15846 companies, 1846 banks, 253 LLPs, 93 audit firms, 248 other organisations, 2682 professionals, 2813 registered addresses and 19624 case events — MCA company master (Maharashtra), NFRA, IBBI, ED, RBI enforcement releases, SFIO and a 10-order SEBI sample. Original files in `data/raw` and tables in `data/processed` are unchanged.

## Relationship types implemented

| Edge | Basis | Count | Meaning |
| --- | --- | --- | --- |
| `named_in` | established | 18051 | Organisation named in an order / notice / press release (title or listing field) |
| `mentioned_in` | candidate | 1933 | Organisation appears only in document text — may be incidental |
| `insolvency_applicant_against` | established | 8317 | Applicant (financial/operational creditor, the company itself or a regulator) filed insolvency against a debtor (IBBI); regulator applicants never chain networks |
| `insolvency_professional_for` | established | 14844 | Insolvency professional appointed for a debtor (IBBI) — routine, weak |
| `auditor_of` | established | 17 | Audit firm named with the audited company (NFRA) |
| `audit_partner_for` | established | 27 | Audit engagement partner for the company (NFRA) |
| `registered_at` | established | 2955 | Registered office address (MCA master, Maharashtra only) |
| `possible_same_entity` | candidate | 972 | Similar names (and/or same address) — needs manual review, never merged |

Established edges: 44211. Candidate edges: 2905. Strong (used to find networks): 25926. Weak (shown only): 21190. Identity candidates for review: 972.

## What the graph reveals

- 3349 networks contain two or more organisations linked by strong, established records (2 orgs: 2598, 3-5 orgs: 688, 6-20 orgs: 62, 21+ orgs: 1).
- 190 events name two or more parties directly; 101 registered addresses are shared by two or more organisations; 4921 applicant→debtor links come from non-hub, non-regulator applicants.
- Hubs suppressed from network chaining (largest first): State Bank of India (bank, degree 470); Punjab National Bank (bank, degree 229); Bank of India (bank, degree 182); Bank of Baroda (bank, degree 112); Union Bank of India (bank, degree 104); Canara Bank (bank, degree 101); IDBI Bank Ltd. (bank, degree 96); ICICI Bank Ltd. (bank, degree 88); Edelweiss Asset Reconstruction Company Limited (company, degree 86); Central Bank of India (bank, degree 81); Oriental Bank of Commerce (bank, degree 81); THIRUPAL GORIGE (person, degree 77).
- Seed cases connected to each other:
  - coffee_day ↔ ilfs: BSR & Associates LLP —auditor of→ Coffee Day Enterprises Limited · BSR & Associates LLP —registered at→ [shared registered address, maharashtra] · BSR & Co. LLP —registered at→ [shared registered address, maharashtra] · BSR & Co. LLP —named in→ BSR & Co. LLP – Inspection Report No. 132.2-2023-02 · BSR & Co. —named in→ BSR & Co. LLP – Inspection Report No. 132.2-2023-02 · BSR & Co. —named in→ M/s Walker Chandiok & Co LLP – Inspection Report No.132.2-2023-06 · Walker Chandiok & Co LLP —named in→ M/s Walker Chandiok & Co LLP – Inspection Report No.132.2-2023-06 · Walker Chandiok & Co LLP —named in→ Walker Chandiok & Co LLP – Inspection Report No. 132.2-2024-06 · SRBC & Co. —named in→ Walker Chandiok & Co LLP – Inspection Report No. 132.2-2024-06 · SRBC & Co. —named in→ M/s SRBC & Co. LLP – Inspection Report No.132.2-2024-02 · SRBC & Co LLP —named in→ M/s SRBC & Co. LLP – Inspection Report No.132.2-2024-02 · SRBC & Co LLP —auditor of→ Infrastructure Leasing & Financial Services Limited

## Top networks (leads for human review, not findings)

| # | Score | Orgs | Sources | Seed cases | Organisations (first 5) |
| --- | --- | --- | --- | --- | --- |
| 1 | 29 | 25 | ed, ibbi, mca_ogd, nfra | reliance_adag_finance | Reliance Commercial Finance Ltd.; Reliance Capital Limited; GVR Infra Projects Ltd.; WIN TRENDZ EXIM PRIVATE LIMITED; Price Waterhouse & Co; … |
| 2 | 20 | 17 | ed, ibbi, mca_ogd, nfra | coffee_day, ilfs | Coffee Day Enterprises Limited; BSR & Associates; BSR & Associates LLP; BSR & Co. LLP; BSR & Co.; … |
| 3 | 14 | 15 | ibbi, mca_ogd | — | GLANCE INVESTMENT( INDIA) PVT LTD; Lexcorp Advisory Services Private Limited; Proline Infra-Trading Pvt. Ltd.; Spice Infra-Trading Pvt. Ltd.; Evershine Advisory Services Pvt. Ltd.; … |
| 4 | 13 | 10 | ed, ibbi, nfra | — | Jaiprakash Associates Limited; FAIRSTREET SPORTS PRIVATE LIMITED; Jaypee Infratech Ltd; Mahagun Real Estate Pvt Ltd.; Gulshan Homz Pvt Ltd; … |
| 5 | 12 | 10 | ed, ibbi | — | JVL Agro Industries Limited; Premium Pressure Vessels Pvt. Ltd.; JVL Cement Limited; JVL Mega Food Park Pvt. Ltd.; JVL Infra Heights Limited; … |
| 6 | 12 | 10 | ed, ibbi, mca_ogd | — | RSAL Steel Pvt. Ltd.; Jhelum Industries Pvt. Ltd.; KUTCH ENGINEERING PRIVATE LIMITED; Indian Steel Corporation Limited; KANDLA STEEL PRIVATE LIMITED; … |
| 7 | 11 | 10 | ed, ibbi | — | Three C Promoters & Developers Pvt Ltd; Hacienda Projects Private Limited; Elco Global Ventures LLP; Moonlight Propbuild Pvt Ltd; Acreage Properties Pvt Ltd; … |
| 8 | 11 | 7 | ed, ibbi, mca_ogd, rbi | — | Karrm Infrastructure Private Limited; VSJ Investments Private Limited; Man Realty Limited; MANPREET ESTATES LLP; GALORE DEVELOPERS PRIVATE LIMITED; … |
| 9 | 11 | 6 | ed, ibbi | amtek | Amtek Auto Limited; ACIL Limited; Castex Technologies Limited; Metalyst Forging Limited; ARG Limited; … |
| 10 | 10 | 6 | ibbi, mca_ogd | reliance_adag_finance | Thwink Big Content Private Limited; CELEBRITA MEDIAHOUSE PRIVATE LIMITED; Authum Investment And Infrastructure Limited ; Pifiniti Movies Private Limited; EDRISHTI MOVIES PRIVATE LIMITED; … |
| 11 | 9 | 9 | ibbi, mca_ogd | — | Jawaria Enterprises Private Limited; Anish Trading and Merchantile Private Limited; Vashistha Mercantile and Trading Private Limi; Raunak Mercantile and Trading Private Limited; Katyayan Mercantile and Trading Private Limit; … |
| 12 | 9 | 8 | ed, ibbi | — | Agri Gold Exims Limited; Sanctuary Homes Pvt. Ltd.; Shakti Timber Estates Private Limited; Mathaangi Infra Ventures Private Limited; Avvas Infotech Private Limited; … |
| 13 | 9 | 7 | ibbi, nfra | — | SRS Real Infrastructure Limited; SRS Limited; Lucra Jewels Pvt. Ltd.; Trustworthy Gems & Jewellery Pvt. Ltd.; Logical Jewellers Pvt. Ltd.; … |
| 14 | 9 | 7 | ed, ibbi, mca_ogd | — | DSK Southern Projects Pvt. Ltd.; STCI Finance Limited; Bohra Industries Ltd.; Parinee Developers Private Limited; MAN INFRAPROJECTS LIMITED; … |
| 15 | 9 | 7 | ed, mca_ogd | — | Unitech Limited; Ranchero Services Limited; Unitech Golf Resorts Limited; Unitech Build Tech Limited; Auram Asset Management Private Limited; … |

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
