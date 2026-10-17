---
name: fundtrace-ui
description: Token-efficient guide for changing the FundTrace AI web UI (web/src — React, Vite, Tailwind, zod). Use for ANY task that adds, fixes, restyles or debugs pages, components, routes, demo data, checks, monitoring rules, alerts, statuses or labels in the web app. Gives a code map, grep anchors for large files, change recipes and gotchas so you can edit without exploring or reading whole files.
---

# FundTrace UI — work fast, read little

The web UI is ~20k lines. Most tasks touch 1–3 files. Follow this order and stop as soon as you know enough.

## 1. Locate before you read (do this first)

```bash
node .claude/skills/fundtrace-ui/scripts/ui-map.mjs --routes   # route → page component (~40 lines)
node .claude/skills/fundtrace-ui/scripts/ui-map.mjs <word>     # files + exports matching a word, e.g. alert, badge, monitoring
```

Then `Grep -n` for the symbol and `Read` with `offset`/`limit` around the hit. Do **not** read a whole file over ~300 lines.

## 2. Token rules

- Never read these whole: `demo/seed.ts` (2.1k lines — synthetic data), `demo/samples.ts` (sample docs), `pages/ApplicationDetailPage.tsx`, `pages/CaseDetailPage.tsx`, `pages/MonitoringPage.tsx`, `state/actions.ts`, `lib/checks.ts`. Use the anchors in §4.
- Don't re-read a file after a successful Edit. Don't open `node_modules`, `dist/`, lockfiles, or `docs/fundtrace-ai-ui-spec.md` unless the task is about spec wording — then grep it for the heading.
- Prefer one targeted check over the full suite while iterating:
  - types: `npx tsc -p web/tsconfig.json --noEmit 2>&1 | grep error | head`
  - lint one file: `npx eslint web/src/path/File.tsx`
  - full gate only once at the end: `npm run check && npm run build` (required by CLAUDE.md).
- Prettier reformats long JSX onto many lines; after `npx prettier --write`, exact-match edits from memory will miss — grep again for the current text.
- Reuse existing components (§5) instead of reading other pages for examples.

## 3. Code map (web/src)

| Area                                                 | Where                                                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Routes + lazy pages                                  | `App.tsx` → `pages/*Page.tsx` (named exports)                                         |
| Shell: sidebar/topbar/search/bell/user menu          | `components/app-shell/` (nav items in `nav.ts`)                                       |
| Design tokens, dark mode, utilities `card` `tabular` | `styles.css`                                                                          |
| Data model (zod) & all types                         | `domain/schemas.ts` (`Db` is the root)                                                |
| User-visible labels/wording, disclaimers             | `domain/labels.ts`                                                                    |
| Store (localStorage, zod-validated)                  | `state/store.ts` — `useDb()`, `mutate(draft => …)`                                    |
| All mutations (write audit entries)                  | `state/actions.ts`                                                                    |
| Demo session / roles                                 | `state/session.ts` (`canConfigureRules`)                                              |
| Hooks: `useFormat`, `useActor`, `useDocumentTitle`   | `state/hooks.ts`; URL filters `state/url.ts` `useUrlState`                            |
| Toasts                                               | `state/toast.tsx` `useToast().push({tone,title,detail})`                              |
| Pre-disbursement checks                              | `lib/checks.ts` (`CHECKS` array, `runChecks`, `reviewPriority`)                       |
| Monitoring rules                                     | `lib/monitoring.ts` (`RULES`, `runMonitoring`)                                        |
| Unified alerts list                                  | `lib/alerts.ts` `allAlerts(db)`                                                       |
| Money/date/mask formatting                           | `lib/format.ts`; Marathi digits/names `lib/text.ts`; land units `lib/land.ts`         |
| Doc types + manual-entry field templates             | `lib/doc-catalog.ts`                                                                  |
| File intake (local only)                             | `lib/processing.ts`, `lib/pdf.ts`, `lib/image-quality.ts`                             |
| CSV import/export                                    | `lib/csv-import.ts`, `lib/export.ts`                                                  |
| Entity graph data                                    | `lib/graph.ts`; UI `components/graph/EntityGraph.tsx`                                 |
| Synthetic data                                       | `demo/seed.ts` (`createDemoDb`), `demo/samples.ts` (SVG sample docs + fields/regions) |

## 4. Anchors in large files (grep these names)

- `state/actions.ts`: `createDraftApplication`, `saveApplication`, `setApplicationStatus`, `submitApplication`, `attachSample`, `addUploadedDocument`, `reviewField`, `addManualField`, `updateAlert`, `createCase`, `setCaseStatus`, `addCaseEvidence`, `importTransactions`.
- `lib/checks.ts`: each rule is `const <name>: Check =`; registry is `const CHECKS`; display names `CHECK_NAMES` (keep both in the same order).
- `pages/ApplicationDetailPage.tsx`: tab bodies are `function Overview|ApplicantTab|VerificationTab|Timeline|AuditTab`; dialogs `RequestInfoDialog`, exported `NoteForm`.
- `pages/CaseDetailPage.tsx`: `Checklist`, `StatusDialog`, `AssignDialog`, `EvidenceDialog`.
- `pages/MonitoringPage.tsx`: `loanTxns`, `ImportDialog`; flow graph lives in `components/monitoring/TransactionFlow.tsx`, alert drawer in `AlertDrawer.tsx`.
- `demo/seed.ts`: sections are commented `// ---------- Entities | Borrowers | Documents | Applications | Relationships | Loans & transactions | Alert states | Cases ----------`.

## 5. Building blocks (import, don't re-implement)

`components/ui/`: `Button`, `LinkButton`, `IconButton` · `Card`, `CardHeader` · `Badge` · `StatusBadges` (`PriorityBadge`, `AppStatusBadge`, `AlertStatusBadge`, `CaseStatusBadge`, `FieldStateBadge`, `ProcessingBadge`, `EvidenceStatusBadge`, `LinkStatusBadge`) · `Dialog` (`variant="drawer"`), `ConfirmDialog` · `Tabs` · `DataTable` (sortable, `empty`, `dense`) · `TextField`, `SelectField`, `TextArea`, `Checkbox`, `FilterSelect` · `SearchInput` · `PeriodPicker` · `Popover` · `PageHeader` (also sets document title) · `EmptyState`, `ErrorState`, `Skeleton`, `Notice`, `SimulatedBadge`. Charts: `components/charts/StackedBarChart`, `DonutChart`.

## 6. Recipes

- **New page**: create `pages/XPage.tsx` exporting `XPage(): React.JSX.Element` with `<PageHeader docTitle=… title=… />`; register in `App.tsx` via `named(() => import('./pages/XPage.js'), 'XPage')` + `<Route>`; add a nav item in `components/app-shell/nav.ts` if needed.
- **New field on an entity**: add to the zod schema in `domain/schemas.ts` → set it in `demo/seed.ts` factory (grep the factory, e.g. `const borrower =`) → mutate only via a function in `state/actions.ts`. Old saved data fails validation and auto-resets to demo data (a toast explains it) — acceptable for the prototype.
- **New status/label**: extend the enum in `schemas.ts`, add text in `domain/labels.ts`, add `[tone, Icon]` in `components/ui/StatusBadges.tsx`. TypeScript will flag every `Record<…>` you missed.
- **New application check**: write `const myCheck: Check = ({ app, docs, db }) => Finding[]` in `lib/checks.ts`, add it to `CHECKS` and a name to `CHECK_NAMES`. Fill `evidence` (with `docId`/`fieldId` so “Open source” works), `benign`, `steps`. If it should appear on the Alerts page, its category must be in `ALERTABLE` in `lib/alerts.ts`.
- **New monitoring rule**: add id to `MonitoringRuleId` + `RULES` in `lib/monitoring.ts`, a function returning `MonitoringAlert[]`, call it in `runMonitoring`; thresholds go in `MonitoringConfigSchema` + `defaultSettings()` (seed.ts) + `FIELDS` in `pages/SettingsPage.tsx`.
- **Filters that survive Back**: `const [v, setV] = useUrlState('key', 'all')`.
- **Feedback**: success/failure → `useToast().push`; destructive → `ConfirmDialog`; every async view needs loading/empty/error states.

## 7. Gotchas (each cost a fix before)

- `.gitignore` once ignored `web/src/lib`; if a new folder is missing on GitHub, run `git check-ignore -v <path>`.
- Don't put `hidden` on a component whose base class sets `display` (buttons, badges): wrap it in `<div className="hidden sm:block">`.
- Strict TS: `exactOptionalPropertyTypes` — pass optional props conditionally (`{...(x === undefined ? {} : { x })}`); `noUncheckedIndexedAccess` — handle `arr[i]` as possibly undefined; no `!`, no `any`, no `==`.
- React compiler lint: no `setState` inside `useEffect` for derived state (compare during render instead), no `ref.current` or `Math.random()`/`Date` during render, avoid `useMemo` deps on per-render objects.
- jsx-a11y strict: clickable things must be `<button>`/`<a>`; listbox options are `div role="option" tabIndex={-1}`; for drag-and-drop use native listeners in an effect.
- Money is integer paise: use `formatMoney`, `parseRupeesToMinor`; never floats.
- Honesty (spec §1): keep “Simulated demo output” / “Not connected” labels; wording from `domain/labels.ts`; never “fraud confirmed”; alerts are “investigative leads”.

## 8. Verify in the browser only when UI behaviour changed

```bash
npm run build -w web && (cd web && npx vite preview --port 4173 --strictPort &)
```

Drive it with the globally installed Playwright (`require(\`${npm root -g}/playwright\`)`): demo sign-in button is `/Continue with quick sign-in/`. Take one screenshot of the changed view at 1440×900 and one at 390×844; check `document.documentElement.scrollWidth` equals the viewport width.
