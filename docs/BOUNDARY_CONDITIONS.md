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
- **B-35 Client-side Gemini (Firebase AI Logic)** → anyone with the site's public Firebase config can call the model until App Check is enforced in Firebase console → AI Logic; set `VITE_RECAPTCHA_SITE_KEY`, enforce App Check, and watch the Gemini Developer API free-tier quota. Uploaded document images are sent to Google's Gemini API — use synthetic/demo documents only, never real borrower data, while on the free tier.
- **B-34 Deployment region** → keep Functions, Firestore, and Vertex in compatible regions (latency, data residency).
