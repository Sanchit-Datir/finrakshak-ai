# End-to-end UI tests (Playwright)

Browser tests that drive the web app the way a user does. Scenarios are **data-driven**: each
entry in a JSON file under `data/` becomes one test, so you add a scenario by editing JSON, not code.

## Run

```bash
npx playwright install chromium   # once per machine
npm run test:e2e                  # from the repo root (or `npm run test:e2e -w web`)
npm run test:e2e:ui -w web        # interactive UI mode: watch each step, time-travel the DOM
npm run test:e2e:report -w web    # open the HTML report of the last run
```

Playwright starts the Vite dev server on port 5174 (or reuses one already running). Every test runs
twice: `desktop` and `mobile-360` (360px wide, per CLAUDE.md). Pick one with `--project=desktop`;
watch the browser with `--headed`. Failures keep a screenshot, video and trace in `test-results/`.

## Data files

| File                     | Drives                                                          |
| ------------------------ | --------------------------------------------------------------- |
| `data/login.json`        | Sign-in form validation cases and demo sign-in per role         |
| `data/applications.json` | Full "New loan application" workflow: capture → review → submit |

Each file is validated by a zod schema in `support/data.ts`; a typo fails fast with a message
naming the bad field. To run against your own file without editing these, point an env var at it:

```bash
E2E_APPLICATIONS_DATA=/path/to/my-cases.json npm run test:e2e -w web
```

(`E2E_LOGIN_DATA` does the same for the login file.)

### Application case shape

```jsonc
{
  "name": "shown as the test title",
  "role": "branch_officer", // demo sign-in role
  "samples": ["Aadhaar card (masked)", { "title": "Aadhaar card (masked)", "occurrence": 2 }],
  "review": [
    // step 3 inputs, applied in order; `label` is the field's visible label
    { "label": "Loan product", "select": "MSME working capital" }, // <select>, by option text
    { "label": "Requested amount (₹)", "fill": "500000" }, // text / number / date / textarea
    { "label": "Applicant has signed the loan-purpose declaration", "check": true },
  ],
  "expect": { "outcome": "submitted" },
  // or: { "outcome": "blocked", "errors": ["Enter the applicant name."] }
}
```

`samples` are titles from the "Add demo sample" menu; use `occurrence` when a title appears more
than once. Any labelled field on the review step can be filled, no code change needed.

## Layout

- `*.e2e.ts` — specs (the suffix keeps them out of vitest).
- `support/data.ts` — JSON loading + schemas. `support/app.ts` — shared page actions.
- `tsconfig.json` — type-checked by `npm run typecheck`, linted by `npm run lint`.
