# Boundary Conditions

Claude (and humans) must flag any of these to the project owner when touched. Format:
**ID — condition → required handling.**

## Money & numbers

- **B-01 Floating-point money** → integer minor units only (`Money`). Reject non-integers/unsafe ints.
- **B-02 Currency mismatch** → never add/compare across currencies without explicit FX conversion; throw.
- **B-03 Overflow** → `Number.isSafeInteger` check after every arithmetic op; consider BigInt if totals may exceed 2^53.
- **B-04 Negative / zero amounts** → decide per field (contribution > 0; refund/adjustment may be negative). Ask the owner if unspecified.
- **B-05 Rounding** → define rounding rule (half-even vs half-up) explicitly when splitting or applying percentages; never silently truncate.

## Auth & authorization

- **B-06 Unauthenticated calls** → every callable rejects with `unauthenticated` first.
- **B-07 Cross-user access (IDOR)** → verify `ownerUid === request.auth.uid` server-side; don't trust IDs from the client.
- **B-08 App Check / abuse** → enforce App Check; rate-limit expensive callables (esp. Gemini).
- **B-09 Token expiry mid-session** → UI must handle `unauthenticated` by re-auth, not a blank error.

## Gemini / Vertex AI

- **B-10 Prompt size** → cap input (`GEMINI_LIMITS.maxPromptChars`); truncate or reject with a clear message.
- **B-11 Output size** → set `maxOutputTokens`; handle truncated output (finish reason `MAX_TOKENS`).
- **B-12 Empty / blocked / safety-filtered response** → treat as a handled failure, never as success.
- **B-13 Malformed / non-conforming output** → parse with zod; on failure retry once or return a graceful error; never trust free text.
- **B-14 Timeout, 429, 5xx** → bounded timeout, limited retries with exponential backoff + jitter; surface a retryable error.
- **B-15 Cost runaway** → per-user quotas and budget alerts on the GCP project before enabling in prod.
- **B-16 Prompt injection / PII** → delimit user data; don't send secrets or unnecessary PII to the model; don't log prompts.
- **B-17 Model/region availability** → model name and region come from config; verify availability before deploy; models get deprecated.

## Firestore

- **B-18 Document size** → 1 MiB per doc; don't store unbounded arrays — use subcollections.
- **B-19 Write rate** → ~1 write/sec sustained per document; use sharded counters/aggregation for hot totals.
- **B-20 Batch/transaction limits** → ≤ 500 ops per batch/transaction; chunk larger work.
- **B-21 Concurrency / lost updates** → use transactions or `FieldValue.increment` for balances; never read-modify-write outside a transaction.
- **B-22 Query limits** → always paginate (`limit` + cursor); `in` ≤ 30 values; composite indexes must exist; no unbounded reads.
- **B-23 Eventual client state** → handle offline/pending writes and permission-denied errors in the UI.
- **B-24 Idempotency** → retried functions / double-clicks must not double-record a transaction; use client-supplied idempotency keys / deterministic doc IDs.

## Input & data

- **B-25 Empty / whitespace / max-length strings** → trim, enforce min/max in the shared schema.
- **B-26 Unicode & injection** → normalise where comparing names; escape on render.
- **B-27 Dates & timezones** → store UTC; beware DST and month-end when computing periods; ask the owner which timezone defines "a day/month".
- **B-28 Duplicate creation** → decide uniqueness rules (e.g. fund name per owner) and enforce server-side.
- **B-29 Deletion** → soft-delete financial records; define cascade behaviour before implementing.

## Platform & deploy

- **B-30 Cloud Functions limits** → default timeout 60s (max 540s for HTTP/callable gen2 up to 3600s on some configs), cold starts, memory; long jobs go to Cloud Tasks/Pub/Sub.
- **B-31 Secrets & env** → no secrets in the web bundle (all `VITE_*` is public). Use Secret Manager for server secrets.
- **B-32 Firebase plan** → Functions + Vertex require the Blaze (pay-as-you-go) plan; confirm before deploy.
- **B-33 Security-rule regressions** → every rules change needs emulator tests; default-deny must remain.
- **B-34 Deployment region** → keep Functions, Firestore, and Vertex in compatible regions (latency, data residency).

## Public-data ingestion (`ingest/`)

- **B-35 Source access & terms** → honour robots.txt, never bypass CAPTCHA/login/403 blocks, keep ≥1.5 s per host and back off on 429/5xx; record terms on every raw artifact. ED and SFIO copyright policies require permission before reproduction — keep their documents internal (private bucket/repo) until permission is obtained. NSE/BSE need a licence.
- **B-36 Evidence status** → every event/claim/edge carries `fact | finding | allegation | inference`. ED attachments, SEBI interim orders and show-cause notices are allegations; insolvency is not fraud; NFRA findings concern auditors. Never upgrade a status in UI or Gemini output.
- **B-37 Entity resolution** → merge only on exact CIN or exact normalised name; fuzzy similarity only writes `entity_match_candidates` for human review. Common names (e.g. "The Urban Co-operative Bank Ltd.") keep the town to avoid false merges.
- **B-38 Personal data** → store people only in public professional roles (insolvency professional, audit engagement partner). Individual noticees/accused named in orders are not extracted. MCA registered-office addresses of small companies/LLPs are often residences: use them only to link companies, never publish them.
- **B-39 Large rupee amounts** → amounts are INR paise integers; values above `Number.MAX_SAFE_INTEGER` (~₹90 lakh crore) or with sub-paisa precision are rejected, not rounded.

## Relationship graph (graph lab, `ingest/src/graph`, `/graph-lab`)

- **B-40 Hubs and non-specific connectors** → big banks, regulators filing insolvency (e.g. RBI), batch notices naming many parties, busy insolvency professionals and shared service addresses connect thousands of unrelated companies. Their links are shown as weak and never chain networks; limits are `THRESHOLDS` in `ingest/src/graph/edges.ts` and need calibration on reviewed cases. A connection is never evidence of wrongdoing.
- **B-41 Graph size in the browser** → the graph lab loads one whole bundle (~36 MB JSON / ~5 MB gzip, 43k nodes for Maharashtra MCA + seed cases). National MCA coverage would multiply it; serve subgraphs from a backend before scaling, and keep the in-browser layout capped (`LAYOUT_CAP`).
- **B-42 Party role in proceedings** → `named_in` records that an organisation appears in an order or press release, not whether it is the accused, the victim or the complainant (e.g. a lender defrauded in a vehicle-loan case, or a company whose ex-director was arrested for cheating it). Any lending-risk flag built on enforcement records must show the source text for review and must not treat "named in" as "accused" until the role is extracted.
- **B-43 Public-record snapshot age and conflicting sources** → the application's public-records check reads a local snapshot (`data/graph`), not live MCA21/IBBI. Every result shows the dataset build date and is saved with it; when MCA status and IBBI records disagree (e.g. "Active" in MCA but in liquidation per IBBI) both are shown. Re-verify on the live registry by CIN before a lending decision.
- **B-44 Untrusted links, uploads and redirects** → render data-supplied URLs only through `safeExternalUrl` (http/https only), follow return paths only through `safeInternalPath`, cap upload and decompressed sizes, and keep the CSP strict (`web/security-headers.ts` = `firebase.json`). See SECURITY.md.
- **B-45 Vulnerable dependencies (SCA)** → CI fails on any known vulnerability in production dependencies (`npm run audit:prod`); Dependabot proposes weekly updates. Development-only advisories without an upstream fix are listed and accepted in SECURITY.md until fixed.
- **B-46 Incremental listing misses** → an incremental listing stops at the first page of already-known items, so an edit or late insertion deeper in a source is not seen until the next full relist (IBBI, NFRA, SFIO weekly; RBI monthly; `FULL_RELIST_EVERY_DAYS`). Sources that do not publish newest-first would lose items between relists: check the order before adding an adapter to the incremental set.
- **B-47 Source layout change and partial failure** → a first page that parses to zero rows (or returns 404) for a collection we already hold, a listing that returns nothing, or a complete relist that loses more than half of the listed items (from 20 items up) fails that source and leaves its listing and state untouched (never an empty or truncated overwrite); `--allow-shrink` accepts a real drop. Sources run independently; the run summary records `failed` with the step and the exit code is 1. Records that vanish from a source are flagged `removed` in the delta report and kept (soft delete); capped samples (`maxItems`) never report removals.
- **B-48 Concurrent ingest runs** → `acquire` reads, merges and writes listings, so two runs on the same data folder would lose updates. A lock file (`data/interim/acquire.lock`) allows one run at a time; a lock older than 12 hours is treated as a crashed run and replaced. The local lock does not cover two machines sharing a bucket: the cloud job needs its own lock (planned with the Cloud Run job).
- **B-50 Publish pointer and rollback** → the app only ever sees a bundle that passed every publish gate (required tables non-empty, no table dropping more than 20 % against the published build, bundle ≤ 48 MB compressed, newer than the published one, no seed case lost). Bundles are written once into `versions/<builtAt>/`; publishing is a compare-and-swap of one `current.json` pointer, so a concurrent publish fails instead of overwriting; 14 versions are kept for rollback. New deployments run as a dry run (separate `dry-run` channel and `_dryrun` dataset) until the owner enables publishing.
- **B-51 Cloud leases and concurrent writers** → in the cloud, Firestore leases (`ingestLocks/{acquire-<source>|build}`, expiring after the task timeout + margin, removed by a TTL policy) replace the local lock file; a run that finds a live lease records the source as failed (`lease:`) and changes nothing. Listing writes additionally use a Cloud Storage generation precondition, and raw evidence is create-only, so even a lease bug cannot lose an update or overwrite evidence.
- **B-53 Paced backfill** → the per-run document cap (`FUNDTRACE_MAX_DOCS_PER_SOURCE`, 300 per source in the cloud) counts only items that still need work (not yet resolved, missing a stored document, or changed in this run), so a backlog moves forward a little every day instead of re-selecting the same items.
