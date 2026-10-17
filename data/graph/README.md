# Graph lab — relationship discovery over the public-source dataset (local prototype)

`data/graph/` is a **derived, read-only view** of `data/processed/`. It is rebuilt in about 10
seconds by `node ingest/dist/graphCli.js` and never writes to `data/raw`, `data/processed` or
`data/registry`. Everything here is an exploratory lead for human review: **a connection is not
evidence of wrongdoing**. `REPORT.md` is the generated findings report; this README explains the
files and the rules. Only this README is hand-written. Every other file is regenerated.

## Files

| File | What it is |
| --- | --- |
| `REPORT.md` | Generated report: datasets used, relationship types, what the graph shows and cannot establish, top networks, how to run, next steps |
| `summary.json` | Bundle metadata (counts, thresholds, notes) and computed insights (hubs, seed-case paths, size buckets) |
| `graph-lab.json.gz` | Full graph bundle (nodes, edges, cited documents, networks, identity candidates), loaded by the `/graph-lab` page |
| `networks.jsonl` | One connected group of organisations per line, with score and plain-language summary |
| `identity_candidates.jsonl` | Possible same-entity pairs for **manual review** (never merged) |
| `test-data/seed-<case>.json` | Real-data subsets for the 23 seed cases found in the graph: each case's organisations and everything within 2 hops (max 400 nodes, hubs not expanded) |
| `test-data/top-networks.json` | Real-data subset: the 10 highest-scoring networks (276 nodes) |
| `test-scenarios/synthetic-scenarios.json` | **SYNTHETIC** bundle (fictional "SYNTH …" organisations) with the expected outcome of each scenario |
| `test-scenarios/REPORT.md` | The same report, run over the synthetic scenarios |
| `index.json` | Bundles offered by the viewer's dataset picker |

All bundle files use one format, `GraphLabBundle`, defined by the zod schema in
`packages/shared/src/graphlab/schema.ts`. To use them as test data for the application, parse
them with `GraphLabBundleSchema` and check `meta.synthetic` before showing anything.

## Model

**Nodes**: organisations (company, bank, LLP, audit firm, other), insolvency professionals and audit
partners (public professional roles only, B-38), MCA registered addresses (Maharashtra only), and
case events (orders, notices, press releases). Every node keeps its `sources`, and events keep
their `document_id`.

**Edges** come straight from `data/processed/relationships.jsonl`, so each one keeps its
`relationship_id`, `source_id`, `document_id`, date and evidence status (B-36):

| Edge | From → to | Basis |
| --- | --- | --- |
| `named_in` | organisation → event | established |
| `mentioned_in` | organisation → event (found only in document text) | candidate |
| `insolvency_applicant_against` | applicant → debtor (IBBI) | established |
| `insolvency_professional_for` | professional → debtor (IBBI) | established, always weak |
| `auditor_of`, `audit_partner_for` | audit firm or partner → company (NFRA) | established |
| `registered_at` | organisation → address (MCA) | established |
| `possible_same_entity` | organisation ↔ organisation (identity candidate) | candidate, always weak |

`CO_MENTIONED_WITH` rows are not turned into edges, because they duplicate the shared event.

**Strong and weak edges.** Only strong edges are used to form networks. Weak edges are still shown
in the viewer, but they never connect one organisation to another. An edge is weak if any of these
apply:

- Its type is always weak: text mentions, insolvency professionals, identity candidates.
- It passes through a **hub** (B-40). A hub is a node that connects too many others to say anything
  specific about any pair. Hubs are counted per role, using the `THRESHOLDS` in
  `ingest/src/graph/edges.ts`:
  - an event naming more than 6 parties
  - an applicant against more than 5 debtors
  - a professional on more than 5 cases
  - an auditor of more than 5 companies
  - an address with more than 10 organisations

  Example: State Bank of India is a hub as an applicant, so its 470 filings don't link those
  debtors to each other. Its own proceedings still count.
- It is an insolvency application filed by a regulator such as RBI. Regulators file these in their
  regulatory role, so the link would wrongly join unrelated seed cases (DHFL, Srei, Reliance).

**Networks**: connected components over strong edges that contain at least 2 organisations. They
are ranked by `score = distinct sources + organisations named in adverse records + 3 × seed cases`.
The score orders the list for review. It is not a risk rating.

**Identity candidates** (B-37) come from two places:

- the build's similar-name candidates
- organisations with similar names at the same address, excluding hub addresses

They are listed for review and never merged. **Two different CINs are always two legal entities**,
so those pairs are never proposed. Similar-named group companies at one address, such as Kotak
Mahindra Bank and Kotak Mahindra Prime, are linked through the shared address instead.

## Synthetic scenarios (clearly labelled test data)

`test-scenarios/synthetic-scenarios.json` contains fictional organisations only. Their names start
with "SYNTH", their links point to `example.invalid`, and fake CINs look like `SYNTH-CIN-0001`.
Each scenario checks one benign or ambiguous pattern. They are asserted in
`ingest/src/graph/scenarios.test.ts`.

| ID | Pattern | Expected result |
| --- | --- | --- |
| S1 | Benign shared address | 3 unrelated companies at a co-working address form a low-score network with no adverse records |
| S2 | Service-address hub | 12 companies at one address: the address is a hub and links nobody, and they are not identity candidates |
| S3 | Large-bank creditor hub | A bank filing against 8 debtors does not chain them |
| S4 | Specific creditor | A small lender filing against 2 debtors links them (established, strong) |
| S5 | Ambiguous names | "Shree Ganesh Steels Pvt Ltd" and "Shree Ganesh Steel Ltd" stay separate and appear only as an identity candidate |
| S6 | Same name, different towns | Two "Urban Co-operative Bank" entries are neither merged nor proposed |
| S7 | Documented co-party | Two companies named in the same order are linked through it, with the cited document |
| S8 | Text mention only | A company only mentioned in a press release gets a weak candidate link and stays out of the network |
| S9 | Batch notice | An RBI notice cancelling 8 registrations is a hub and links none of them |
| S10 | Group companies | Similar-named companies with different CINs at one address are linked by the address and not proposed as the same entity |

## Run it

```bash
npm ci
npm run build -w @fund-tracker/shared && npm run build -w ingest
node ingest/dist/graphCli.js          # rewrite data/graph/ only
node ingest/dist/graphCli.js --web    # ...and publish it to web/public/graph-lab/ (git-ignored)
npm run dev -w web                    # http://localhost:5173 → demo sign-in → Graph Lab (prototype)
npx vitest run --root ingest src/graph   # synthetic scenario tests
```

The `/graph-lab` page has four views:

- **Explore**: a node's neighbourhood, with evidence and the source link for each relationship.
- **Networks**: the ranked list, filterable by seed case.
- **Path finder**: the shortest documented route between two nodes.
- **Identity review**: the candidate pairs.

Weak and candidate links are hidden until you tick "Include weak and candidate links". Any
`GraphLabBundle` file can be opened with "Open bundle file…", including a test-data subset or a
bundle you generate yourself.

## Limits and boundary conditions

- **No shared directors.** The dataset has no director or signatory data (needs MCA21), and no
  fund-flow records. Applicant links say who filed insolvency against whom, not how much was lent.
- **Coverage.** Addresses cover Maharashtra MCA companies only. SEBI is a 10-order sample. A missing
  link is not evidence that no relationship exists.
- **B-35.** Edges link to source URLs. ED and SFIO content is limited to the titles already in
  `data/processed`.
- **B-38.** Registered addresses can be residences. `REPORT.md` and `summary.json` mask them as
  `[shared registered address, <state>]`, but the bundles and the local viewer still show them, as
  `data/processed/addresses.jsonl` already does.
- **B-40.** Hub thresholds are first guesses and need calibrating on reviewed cases.
- **B-41.** The viewer loads the whole bundle (~36 MB JSON, ~5 MB gzip). National coverage needs
  server-side subgraphs.
