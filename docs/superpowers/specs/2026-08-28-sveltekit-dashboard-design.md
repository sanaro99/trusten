# Trusten Dashboard on SvelteKit — Design

**Date:** 2026-08-28
**Status:** Proposed — awaiting review
**Project:** 1 of 3 (Foundation + Dashboard)

---

## 1. Context

Trusten's dashboard is rendered by `apps/server/src/trusten/dashboard/ui.ts`: 1,317 lines
of HTML in template strings, ~135 hand-written CSS rules, and four inline `<script>`
blocks that build DOM by string concatenation. It is the largest file in the repo and
3.3x the project's own 400-line warning threshold. Every UI change goes through it.

`theme.ts` exists solely to stop `ui.ts` and `report.ts` — two independent renderers of
the same data — from drifting apart. That is a symptom, not a solution.

This project replaces the dashboard with a SvelteKit application and establishes the
shared component foundation that the report renderer (project 2) and the browser
extension (project 3) will later consume.

### Decomposition

This is one of three projects. They are specified and implemented separately:

1. **Foundation + Dashboard** (this document) — SvelteKit app, `packages/ui`, shared API
   contract, the six dashboard surfaces redesigned.
2. **Report renderer** — `report.ts` rebuilt on shared components with a `css: 'injected'`
   compile target, preserving the `file:///` → PDF path and the portable `.html` artifact.
3. **Extension popup** — the 578-line vanilla popup rebuilt as a Svelte MV3 popup.

Projects 2 and 3 both depend on `packages/ui` from this project. They are independent of
each other.

## 2. Goals

- Replace template-string rendering with a real component model.
- Redesign the dashboard's information architecture and visual language — this is a
  redesign, not a port.
- Establish `packages/ui` as the shared component and token layer for all three renderers.
- Introduce a typed, runtime-validated API contract between server and client.
- Leave no renderer-drift problem behind: `theme.ts` dissolves into design tokens.

## 3. Non-goals

- Rebuilding `report.ts` or the extension (projects 2 and 3).
- Authentication, multi-user, or hosted multi-tenancy.
- Changing detection logic, analyzers, scoring, or the scan engine.
- Fixing the scoring issues identified separately (confidence weighting, severity-cap
  saturation). The UI is designed to *surface* confidence, which creates the pressure to
  fix it, but the scoring change is its own piece of work.
- A Dockerfile. Deployment is real work and belongs in its own project.

## 4. Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | SvelteKit | Compiles away, no shipped runtime; `svelte/server` `render()` with `css: 'injected'` gives project 2 a self-contained HTML string, which React would need a separate CSS-inlining step to match. |
| Adapter | `@sveltejs/adapter-node`, run under Bun | Official adapter. Avoids the community `svelte-adapter-bun`; Bun runs the Node-targeted output. |
| Topology | Two processes (A) | SvelteKit serves UI; Hono keeps API, WebSocket, and the Puppeteer engine on 9200. Every piece officially supported; the WebSocket stays where it already works. |
| Components | shadcn-svelte + Tailwind | Copy-in components we own and can edit, on Bits UI primitives. Accessible by default, themeable via CSS variables, no runtime dependency to version-lock. |
| Scope of redesign | Full redesign | Approved explicitly. Purple identity is a starting point, not a constraint. |

### Rejected

- **SvelteKit absorbs the API** (`+server.ts` routes, Hono dissolved). `adapter-node` has
  no native WebSocket server, so the live-scan view — working code — would be re-homed for
  no gain.
- **Hono mounts SvelteKit's `handler.js`** (single process). Genuinely nicer to deploy, but
  bridging a Node `(req, res)` middleware into Hono's Fetch-API model is unverified, and
  its advantage is a saving on a Dockerfile that does not yet exist. Recorded as a possible
  later optimization, not a commitment.

## 5. UX design

### 5.1 Thesis

**Trusten does not produce a dashboard. It produces an accusation, and an accusation needs
evidence.** Every finding asserts four things: what the site did, where it did it, how bad
it is, and which law it implicates. The current UI scatters these across pattern cards,
separate screenshot tabs, and a regulation list at the bottom of the page. The redesign's
organizing principle is that **a finding and its proof are one object and are never
separated.**

Three consequences follow, and they drive everything below.

### 5.2 Information architecture: six pages become three surfaces

Today: `home`, `audit`, `scan`, `site/:domain`, `history`, `leaderboard` — six sibling
pages in a flat nav.

`history` and `leaderboard` are the same data under different sorts. Keeping them apart
forces users to learn which page answers their question. They merge.

| Surface | Absorbs | Purpose |
|---|---|---|
| **Scan** (`/scan/:id`) | `scan` | The case file. The product's hero object. |
| **Site** (`/site/:domain`) | `site`, per-domain slice of `history` | One domain over time: trend, regressions, scan list. |
| **Explore** (`/explore`) | `history`, `leaderboard` | One filterable, sortable table over all scans and domains. |

`home` (`/`) becomes a scan-entry surface with recent activity — not a nav hub.
`audit` (`/audit`) remains, but is redesigned as the live-scan surface (§5.4).

Net: six pages to five routes, with one fewer concept to learn.

### 5.3 The scan report: a two-pane evidence viewer

This is the centrepiece and the largest single improvement.

**Today:** a stats header, then patterns grouped by category as cards, then workflow steps
with screenshots behind a tab switcher, then a regulation list. The screenshot has coloured
boxes *burned into the image* at capture time by `buildAnnotationScript()`.

**Problem:** the burned-in boxes are the tell. Because annotation happens at capture time,
boxes cannot be toggled, cannot be filtered, and cannot be linked to the finding you are
reading. The image and the finding list are two static artifacts that happen to describe
the same thing.

**Design:** `ElementEvidence` already carries `boundingBox: {x, y, width, height}`, and the
UI has never used it. The report becomes two panes:

```
┌────────────────────────┬──────────────────────────────────┐
│ FINDINGS               │ EVIDENCE                         │
│ ─────────────────────  │                                  │
│ [filter: severity ▾]   │   ┌────────────────────────┐     │
│ [filter: category ▾]   │   │                        │     │
│                        │   │   clean screenshot     │     │
│ ▸ Fake urgency    CRIT │   │   + SVG box overlay    │     │
│ ▸ Drip pricing    HIGH │   │   for selected finding │     │
│ ▪ Preselected opt HIGH │   │                        │     │
│ ▪ Cookie wall      MED │   └────────────────────────┘     │
│                        │                                  │
│                        │   "Only 2 left!" — no stock       │
│                        │   data backs this claim.          │
│                        │   confidence 0.87                 │
│                        │                                  │
│                        │   ⚖ EU UCPD Annex I ¶7            │
│                        │   ⚖ FTC Act §5                    │
└────────────────────────┴──────────────────────────────────┘
```

Selecting a finding drives the evidence pane: the clean screenshot renders with an SVG
overlay positioned from `boundingBox`, scrolled and zoomed to the element, with the
description, confidence, and regulatory citations beneath it. Deselecting shows all boxes
at low opacity.

This uses data the scanner already produces. It is not new capture work.

**Consequence for project 2:** the PDF report is a static artifact and cannot be
interactive, so `buildAnnotationScript()`'s burn-in path stays for the PDF. The dashboard
stops using it. Both read the same `boundingBox` data, so they cannot disagree.

**Confidence becomes visible.** Every finding shows its confidence. Findings below 0.7 are
visually de-emphasised and labelled "low confidence". This is deliberate: the scoring
engine currently ignores `confidence` entirely, weighting a 0.55 guess identically to a 0.9
certainty. Surfacing it in the UI makes that discrepancy visible to anyone reading a report
and is the forcing function for fixing the scoring.

**No tabs.** The current `switchTab()` hides content and loses state on navigation. The
report is one scrollable document with a sticky section rail (Findings · Journey ·
Regulations · Recording). Everything is present, linkable, and Ctrl-F-able.

### 5.4 Live scan: a timeline that becomes the report

**Today:** submit the form, a status line updates every 3 seconds via a polling loop, a
`<img>` swaps base64 JPEG frames from the WebSocket, and on completion the page redirects
to the domain page after a 1.8-second `setTimeout`. The thing you watched is discarded and
replaced by a different page.

**Design:** the audit surface is a **step timeline** that builds as the scan runs. Each
workflow step appears as a row the moment it starts, showing its action and status; the
live screencast is pinned beside it. As steps complete, their captured screenshot replaces
the placeholder and any findings attach to the row.

When the scan finishes, **the timeline does not redirect. It becomes the report's Journey
section**, in place, with the findings pane populating alongside it. What you watched is
what you now read. No redirect, no `setTimeout`, no discontinuity.

This is the "seamless" requirement taken literally: the live view and the report are the
same component in two states, not two pages joined by a timer.

**Transport:** the 3-second poll disappears. The WebSocket already carries `progress`,
`frame`, `done`, and `error` events — the poll exists only because the page had no state
model to receive them into. Svelte's `$state` is that model. Polling remains as a
reconnect fallback only.

### 5.5 Grade with a reason attached

A grade shown alone is a number. Everywhere a grade appears at size — scan header, site
header — it is paired with the top three deductions that produced it ("−15 fake urgency,
−8 drip pricing, −8 preselected options"). The score ring stays; it gains a caption.

On the Site surface, the grade becomes a sparkline over time, so a regression is visible
without opening two scans.

### 5.6 Visual language

The purple identity is retained as a starting point but is re-expressed as a token system
rather than 135 literal hex values.

- **Tokens** are CSS custom properties in `packages/ui/tokens.css`, consumed by the
  Tailwind config. Grade colours (A–F), severity colours, and surface/text/border scales
  all become tokens. `theme.ts` dissolves into this file; `CATEGORY_LABELS` moves to
  `packages/ui` as data.
- **Type scale and spacing** come from Tailwind's scale rather than ad-hoc `px` values.
- **Dark mode** is designed in from the start via token redefinition, not retrofitted.
  The current dashboard is light-only.
- **Density**: the report is a reading surface and gets generous line length and spacing;
  the Explore table is a scanning surface and gets compact rows.

Severity colour is never the sole carrier of meaning — every severity indicator pairs
colour with a label or icon, so the report survives greyscale printing and colour-blind
readers.

## 6. Technical architecture

### 6.1 Workspace layout

```
apps/
  server/          Hono API + WebSocket + Puppeteer engine   (:9200)
                   dashboard/ui.ts DELETED
                   dashboard/routes.ts keeps ONLY /api/* + report asset routes
  web/             SvelteKit dashboard                        (:5173 dev / :3000 prod)
  trusten-ext/     unchanged this project (project 3)
packages/
  shared/          existing; gains api/ contract schemas
  ui/              NEW — Svelte components + design tokens
```

### 6.2 `packages/ui` — the boundary that makes projects 2 and 3 cheap

Built in this project, consumed by all three. This is the single most important structural
decision here: if these components are built inside `apps/web/src/lib/components`, projects
2 and 3 each pay for a painful extraction.

```
packages/ui/
  tokens.css              CSS custom properties (grade, severity, surface, type)
  tailwind-preset.js      Tailwind preset exposing the tokens as utilities
  src/
    primitives/           shadcn-svelte components (Button, Dialog, Table, Badge…)
    domain/               Trusten-specific, render-only:
                            GradeRing, GradePill, SeverityBadge, ConfidenceMeter,
                            FindingCard, RegulationCite, EvidenceViewer, ScoreSparkline
    data/                 CATEGORY_LABELS, grade/severity ordering helpers
```

**Constraint that keeps this reusable:** `domain/` components take plain props and emit
events. No `fetch`, no stores, no SvelteKit imports (`$app/*`), no browser-only APIs at
module scope. This is what lets project 2 render them through `svelte/server` `render()`
into a static file, and project 3 render them inside an MV3 popup where SvelteKit does not
exist. Enforced by an import-boundary lint rule, not by good intentions.

`EvidenceViewer` is the exception worth noting: it needs measurement for the box overlay,
so it accepts a `static` mode that renders all boxes without interactivity — the mode
project 2 uses.

### 6.3 API contract: zod schemas in `packages/shared`

Currently the server does `await c.req.json<{url: string, html: string}>()` — a
compile-time cast with no runtime validation — and returns ad-hoc object literals per
route. A separate frontend needs a real contract.

`packages/shared` already declares **zod as a dependency that nothing imports.** This
project puts it to work:

```
packages/shared/src/api/
  scan.ts        QuickScanRequest/Response, ScanDetail
  audit.ts       AuditRequest/Response, AuditStatus, AuditPlanItem
  domain.ts      DomainSummary, GlobalStats
  history.ts     HistoryQuery, HistoryResponse
```

Each is a zod schema plus its inferred type. The server validates requests against them at
the boundary; the SvelteKit app imports the inferred types for its API client. One
definition, both sides, no drift, no new dependency, and the dead zod dep becomes load-bearing.

This also closes the validation hole found during review: today a malformed body degrades
to a misleading 400 or an opaque 500 rather than a typed validation error.

### 6.4 Rendering strategy

| Route | Strategy | Why |
|---|---|---|
| `/` | SSR | Fast first paint; recent-activity list is server data. |
| `/scan/:id` | SSR + hydrate | Reports must be linkable and shareable; the evidence pane then hydrates for interactivity. |
| `/site/:domain` | SSR | Server data, little interactivity beyond the sparkline. |
| `/explore` | SSR shell + client filter/sort | Server renders the first page; filtering is client-side over a fetched set. |
| `/audit` | CSR | Inherently live and stateful; nothing to server-render. |

SSR is the default; CSR is the exception with a stated reason.

### 6.5 Data flow

```
browser ──HTTP──► SvelteKit (:3000)  ──load()──► Hono API (:9200) ──► SQLite
                       │                                             │
                       └── serves HTML/JS/CSS                        └── Puppeteer engine

browser ──WebSocket──────────────────────────────► Hono (:9200) /trusten/api/jobs/:id/live
```

SvelteKit `load()` functions call the Hono API server-side, so the browser never needs CORS
for data. The WebSocket connects to Hono directly from the browser — its origin comes from
a `PUBLIC_TRUSTEN_API_ORIGIN` environment variable, which also removes the hardcoded
`localhost:9200` assumption that project 3 has to fix in the extension.

**Dev:** Vite `server.proxy` forwards `/trusten/api` → `:9200`, so dev and prod use
identical relative URLs and HMR works normally.

### 6.6 What happens to `apps/server`

- `dashboard/ui.ts` — **deleted** (1,317 lines).
- `dashboard/theme.ts` — **deleted**; contents move to `packages/ui`.
- `dashboard/routes.ts` — HTML page routes removed; keeps `/api/*` and the report asset
  routes (`/report/:id/screenshot/:step`, `/video`, `/pdf`). Drops from 519 lines to
  roughly 300.
- `report.ts` — **untouched this project.** It keeps importing display tokens; to avoid a
  half-migrated state, it temporarily imports them from `packages/ui/data` instead of
  `theme.ts`. Project 2 rebuilds it properly.
- Engine, analyzers, scoring, db, browser driver — **untouched.**

## 7. Error handling

- **API unreachable from `load()`** — SvelteKit error boundary renders a page-level "cannot
  reach scan service" state with a retry, not a stack trace.
- **Scan not found** — a real 404 through `error(404)`, replacing today's soft "not found"
  card rendered with a 200.
- **WebSocket drop mid-scan** — exponential-backoff reconnect; if reconnect fails, fall
  back to polling `/api/audit/:jobId` and show a degraded-but-working banner. The scan
  continues server-side regardless; this is a display concern only.
- **Audit job failure** — the failed step is marked in the timeline in place, with the
  error text attached to that step rather than a toast that disappears.
- **Validation failure** — zod errors return `400` with a field-level body; forms render
  them inline.

## 8. Testing

This project introduces the repo's first tests, so it also establishes the pattern.

- **`bun test`** for `packages/shared` API schemas — round-trip parse/reject cases per
  schema. Pure functions, no browser.
- **Vitest + `@testing-library/svelte`** for `packages/ui` domain components. The valuable
  cases are the ones with real logic: `EvidenceViewer` box positioning from `boundingBox`,
  `GradeRing` arc maths, severity ordering, `ConfidenceMeter` thresholds.
- **Playwright** for two end-to-end journeys against a seeded SQLite fixture: quick scan →
  report, and audit → live timeline → report continuity.

  **Caveat, stated precisely:** the README records that Playwright cannot launch under Bun
  — its pipe transport needs inherited file descriptors Bun does not provide, which is why
  the scanner uses Puppeteer. That constraint applies to the *test runner process too*. So
  the Playwright suite runs under **Node** (`npx playwright test`), driving the app over
  HTTP as an external client. It never imports application code, so the runtime split costs
  nothing. This must be verified in step 8 before the suite is built out; if it fails, the
  fallback is Puppeteer-driven end-to-end tests under `bun test`, which is a worse authoring
  experience but a proven one in this repo.
- **No tests** for pure-presentational components. Testing markup shape is churn.

CI gains a `test` job alongside the existing `code-quality` workflow.

## 9. Sequencing

1. `packages/ui` skeleton — tokens, Tailwind preset, shadcn-svelte init, import-boundary lint rule.
2. `packages/shared/api` zod schemas; Hono validates against them. **Server and old UI still working.**
3. `apps/web` SvelteKit skeleton, adapter-node, Vite proxy, API client, one route (`/explore`) end to end.
4. Domain components in `packages/ui` with their tests.
5. Routes `/`, `/site/:domain`, `/scan/:id` — the evidence viewer is the biggest piece.
6. `/audit` — timeline, WebSocket state model, continuity into the report.
7. Delete `ui.ts` and `theme.ts`; trim `routes.ts`; point `report.ts` at `packages/ui/data`.
8. Playwright journeys; CI test job.

Steps 1–6 are additive — the existing dashboard keeps working throughout. Step 7 is the
only cutover, and it happens once the replacement is complete rather than incrementally.

## 10. Risks

| Risk | Mitigation |
|---|---|
| `adapter-node` output misbehaves under Bun | Verified as step 3, before any UI work. Fallback: run the SvelteKit process under Node while the API stays on Bun — they are separate processes, so this is tolerable. |
| Two processes complicate the (absent) deploy story | Accepted. Recorded for the deployment project; the single-process option (Hono mounting `handler.js`) stays available. |
| `packages/ui` components accidentally depend on SvelteKit | Import-boundary lint rule in step 1, before components exist. |
| Redesign scope expands indefinitely | Five routes, enumerated in §5.2. New surfaces are out of scope for this project. |
| shadcn-svelte's ecosystem gaps | Components are copied in and owned, so a gap is a component we write, not a blocker. |
| Playwright cannot run under Bun (§8) | Suite runs under Node as an external HTTP client, verified in step 8. Fallback: Puppeteer-driven E2E under `bun test`. |

## 11. Open questions

None blocking. Two to settle during implementation:

- Whether `/explore` needs server-side pagination or can fetch a bounded set and filter
  client-side. Depends on realistic scan volume; start client-side, revisit past ~2,000 rows.
- Whether the sparkline on `/site/:domain` uses a charting library or hand-rolled SVG. A
  single sparkline does not justify a dependency; revisit if more charts appear.
