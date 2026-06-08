# Scanning

## Quick Scan

Single-page detection, returned in seconds. Two ways in:

- **`POST /trusten/api/analyze-page`** `{ url, html, text? }` — analyze caller-supplied DOM
  (used by the browser extension; no navigation). Best signal because it sees the live,
  authenticated page exactly as the user does.
- **`POST /trusten/api/quick-scan`** `{ url }` — the server navigates to the URL headlessly,
  captures context, and scans.

Both run all 11 analyzers in parallel, then **merge in any cached Deep Scan findings** for the
page (see below).

## Deep Scan

Multi-step workflow traversal on a headless browser, run as an async audit job:

```
POST /trusten/api/audit  { url, mode?: "fixed" | "discover", workflows?: string[], watch?: boolean }
GET  /trusten/api/audit/:jobId      # poll status (status, currentStep, completedWorkflows, plan, scanIds)
```

For each workflow the engine:

1. Opens an isolated browser context and runs **pre-flight** (dismiss cookie banners + modals).
2. Walks each step: the **AI navigator** (`agent/navigator.ts`) reads the page's accessibility
   tree and an LLM decides what to click/fill/scroll toward the step's natural-language `aiGoal`;
   deterministic `clickText`/`fillSearch`/`navigate` act as fallback.
3. Captures context, runs the step's analyzers, takes an **annotated screenshot**.
4. Records a **session video** and, on completion, generates an **HTML + PDF report**.

Targets: `~/Desktop/trusten-reports/<scanId>.{html,pdf}`, `screenshots/<scanId>/step-*.jpg`,
and `screenshots/<scanId>/session.mp4`.

### Fixed workflows

`mode: "fixed"` (default) runs the selected workflows from the library
(`workflows/definitions.ts`): `checkout`, `signup`, `cookie_consent`, `pricing`, `cancellation`
(plus a `comprehensive` end-to-end journey). Each step has an `aiGoal`, the analyzers to run, and
a timeout.

### Agentic workflow discovery (hybrid)

`mode: "discover"` explores the site first (TestSprite-style): it gathers a site map
(nav/footer links, primary buttons, forms, page copy) and asks the LLM to plan the
dark-pattern-prone journeys that actually exist on *this* site, then runs them. The discovered
plan is persisted on the job and shown in the dashboard.

If the LLM is unavailable or returns nothing usable, discovery **falls back to the fixed
library**, so a Deep Scan always has something to run. (See `agent/discovery.ts`.)

### Watch it live

Set `watch: true` to stream the browser into the dashboard in real time. The driver runs a CDP
screencast and publishes frames (and step-by-step progress) over WebSocket
(`GET /trusten/api/jobs/:jobId/live`); the audit page paints them into a live view. The session
mp4 is assembled from the same frames.

## Quick-scan cache (deep → quick)

While a Deep Scan runs, each page's findings are cached by normalized URL in
`trusten_page_cache`. A later Quick Scan / analyze-page of a page covered by a recent audit
**merges those cached findings in** (deduped, tagged `deep-cache` with a "from full audit" badge),
so the richer audit results surface instantly while the user browses. Default freshness: 7 days.

> SPA stages that reuse a single URL collapse to one cache key — a known v1 limitation.

## Guardrails

Quick Scan and Deep Scan respect `robots.txt` (honoring `Disallow` for `*`/`TrustenBot`) and a
per-domain rate limit (default 1 scan/domain/minute). Set `TRUSTEN_IGNORE_ROBOTS=1` to bypass
robots for local testing. See [Development](development.md) for tuning.
