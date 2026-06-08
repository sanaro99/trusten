# Architecture

Trusten is a standalone **TypeScript / Bun / Hono / SQLite** service that drives **headless
Chromium via Puppeteer**. It began as a fork of BrowserOS (an agentic browser) on the assumption
that scanning needed an in-browser AI agent; it doesn't, and the BrowserOS apparatus has been
removed.

```
apps/
  server/                      @trusten/server
    src/trusten/
      browser/
        driver.ts              BrowserDriver interface (the single seam to the browser)
        puppeteer-driver.ts    headless Chromium: nav, screenshots, PDF, video, live screencast,
                               network + cookie capture, a11y snapshot for the AI navigator
      analyzers/               the 11 dark-pattern analyzers (+ base-analyzer)
      scoring/engine.ts        deterministic A–F scoring
      regulatory/mapping.ts    pattern → regulation mapping (14 frameworks)
      llm/client.ts            provider-agnostic LLM client (NVIDIA NIM / Gemini / Ollama)
      agent/
        navigator.ts           LLM + a11y-tree navigation of arbitrary sites
        discovery.ts           agentic workflow discovery (TestSprite-style) + fixed fallback
      workflows/definitions.ts fixed workflow library (checkout, signup, …)
      live/hub.ts              in-memory pub/sub for live (WebSocket) streaming
      utils/                   pre-scan (cookie/modal dismissal), guardrails, url helpers
      dashboard/
        routes.ts              Hono routes + async audit runner
        ui.ts                  server-rendered HTML/CSS/JS
      db.ts                    SQLite persistence (scans, audit jobs, page cache)
      report.ts                annotated screenshot overlays + HTML report
      types.ts                 core types
      main.ts                  standalone entrypoint (HTTP + WebSocket on :9200)
    src/lib/                   SQLite store + logger only
  trusten-ext/                 Chrome MV3 extension (Quick Scan popup)
packages/
  shared/                      shared constants/types (@trusten/shared)
```

## The one seam: `BrowserDriver`

Everything the scan engine needs from a browser is captured by the `BrowserDriver` interface
(`browser/driver.ts`): `newPage`, `goto`, `evaluate`, `screenshot`, `printToPDF`, `snapshot`
(numbered interactive-element tree for the AI navigator), `click`/`fill`/`pressKey`,
`contentAsMarkdown`, `waitFor`, plus optional `videoPath`, `getNetworkRequests`, and
`getCookies`. `PuppeteerDriver` implements it. Keeping this seam narrow means the analyzers,
scoring, and navigator are independent of the browser backend.

> **Why Puppeteer, not Playwright?** Playwright's `--remote-debugging-pipe` transport relies on
> inherited file descriptors that Bun's `child_process` does not provide, so it cannot launch
> under Bun (the runtime this project requires for `bun:sqlite`). Puppeteer uses a WebSocket
> transport that works under Bun.

## Data flow

**Quick Scan** — the extension posts the live DOM (or the server navigates headlessly) →
`captureContext` (DOM, visible text, screenshot, network, cookies) → 11 analyzers run in
parallel → cached deep-scan findings for the URL are merged in → scoring → persist → respond.

**Deep Scan** — an async audit job opens one Puppeteer context per scan, runs pre-flight
(cookie/modal dismissal), then walks each workflow step (AI navigator → capture → step
analyzers → annotated screenshot), records a session video, generates an HTML + PDF report,
caches each page's findings, and persists. Progress and (optionally) live browser frames stream
to the dashboard over WebSocket via `live/hub.ts`.

## Storage

SQLite at `~/.trusten/trusten.db` (`trusten_scans`, `trusten_audit_jobs`, `trusten_page_cache`).
Reports, per-step screenshots, and session videos are written under `~/Desktop/trusten-reports/`.
