# Remaining UI changes — part 1

Branch: `remaining-ui-changes-1` (cut from `main`). Web UI only — no infra, Firebase, Functions or
package changes.

## 1. Product renamed to "FinRakshak AI" in the UI

The product flags borrower risk before and after disbursement rather than tracing funds, so the
user-facing name changes from "FundTrace AI" to **FinRakshak AI**.

| File                                              | Change                                     |
| ------------------------------------------------- | ------------------------------------------ |
| `web/index.html`                                  | Page `<title>` and meta description        |
| `web/src/components/app-shell/Logo.tsx`           | Sidebar wordmark reads "FinRakshak **AI**" |
| `web/src/components/app-shell/Topbar.tsx`         | Mobile logo `aria-label`                   |
| `web/src/state/hooks.ts`                          | Tab titles end in "· FinRakshak AI"        |
| `web/src/domain/schemas.ts`, `web/src/styles.css` | Code comments only                         |

**Not renamed (deliberately):** the Firebase project ID `fund-tracer` and its Cloud Functions URL
(`web/security-headers.ts`, tests), `@fund-tracker/*` package names, `infra/`, CI workflows and
`docs/`. A project ID cannot be changed; the agreed later plan is to keep the project, add a
`finrakshak.web.app` Hosting site and authorise that domain in Auth and reCAPTCHA.

## 2. New sign-in page design

`web/src/pages/LoginPage.tsx` now matches the approved mockup.

- **Left panel** (desktop, `lg` and up) moved to `web/src/components/login/LoginHero.tsx`:
  shield logo, "FinRakshak AI / Loan Lifecycle Intelligence", headline
  "See Beyond the Balance Sheet.", subheading "Public-record intelligence for smarter, safer lending
  decisions.", and three value rows — _Uncover hidden connections_, _Identify potential risk_,
  _Monitor throughout the loan lifecycle_.
- **Illustration** in `web/src/components/login/NetworkIllustration.tsx`: a borrower linked to Related
  Companies, Directors & Stakeholders, Court Cases, Regulatory Findings and Media & Adverse News, with
  warning markers and a "Risk Overview" card. Purely decorative: no real data, `aria-hidden`, and only
  shown on screens 1280 px and wider (`xl`).
- **Sign-in card:** person icon inside the "Employee ID or work email" field; the
  "Secure access for authorized banking staff." line now sits below the card.
- **Mobile:** dark header with the new logo and headline above the form.
- The old landscape artwork and value props were removed.

## 3. English-only sign-in

The language selector (English / मराठी) and all Marathi sign-in strings were removed from the
sign-in page. Validation messages and behaviour are unchanged.

## 4. "Preferred language" setting removed

Settings → Profile no longer shows "Preferred language". It was saved but never read anywhere, and its
hint ("Marathi interface text is available on the sign-in page") became false after change 3.
The stored `preferences.language` field stays in the schema so existing saved workspaces still load.
Marathi **document** support (7/12 extracts, Devanagari text, Marathi digits) is unaffected.

## Verification

- `tsc` (web) and `eslint --max-warnings 0` on changed files pass; prettier applied.
- Web unit tests: 22 files, 210 tests pass.
- Sign-in page checked by screenshot at 1750×900 (desktop) and 390×844 (mobile).
- Full `npm run check` / `npm run build` and e2e tests were not run.
