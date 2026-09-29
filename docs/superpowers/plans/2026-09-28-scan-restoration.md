# Scan restoration implementation plan

> **For agentic workers:** Use superpowers:executing-plans for the engine and runtime checks. Independent extension, web transport, and discovery work uses superpowers:dispatching-parallel-agents.

**Goal:** Restore dependable quick checks, multi-page deep checks, and an installable Chrome extension, preserving the current Trusten design.

**Architecture:** Repair the existing June Puppeteer engine and current SvelteKit integration rather than replacing either. Treat page-state changes as navigation, retain evidence before dismissing overlays, and persist every returned result. Discover supported public journeys from real links when no model is available.

**Tech stack:** Bun, TypeScript, Puppeteer, Hono, PostgreSQL, SvelteKit, Chrome Manifest V3.

**Spec:** The user's September 28 request: fix the checking-service error; recover quick/deep scanning and the extension; keep the current UI/UX; verify navigation and useful results without BrowserOS.

## Constraints

- Preserve existing local changes and the current web design.
- Keep target authorization and public-demo admission intact.
- Verify against controlled pages containing known manipulative choices and against public websites; do not submit purchases or create accounts.
- Use a disposable local PostgreSQL database, not the inherited connection to another app.
- Report unavailable model/visual checks and incomplete journeys honestly.

## Review focus

- A same-URL cart or consent panel must count as reached only when the visible state changes.
- Unreached branches must not produce screenshots or findings attributed to unseen pages.
- Cookie and modal evidence must be collected before dismissal.
- Every returned scan ID must load a persisted result; storage failures must fail the scan.
- Direct production web requests and the installed extension must reach their configured service and report URLs.

## Task 1: Scan engine and browser navigation

Files: `apps/server/src/trusten/index.ts`, `browser/page-state.ts`, `browser/puppeteer-driver.ts`, `utils/pre-scan.ts`, `workflows/definitions.ts`, engine/browser regression tests.

- [x] Add browser fixtures for consent, search, product, same-page cart, and checkout; demonstrate the current failures.
- [x] Compare visible page state before/after actions, preserve consent evidence, distinguish independent and dependent steps, and fail unusable pages.
- [x] Keep screenshot/PDF/video artifacts and persisted results consistent; propagate storage failures.
- [x] Verify quick and fixed deep scans using real Chromium and known findings.

## Task 2: Site discovery

Files: `apps/server/src/trusten/agent/discovery.ts`, its tests, and navigator integration.

- [x] Demonstrate that discovered AI goals currently never navigate.
- [x] Preserve explicit navigation intent and derive relevant safe workflows from actual links without a model.
- [x] Test bounded plans, unsafe destinations, unavailable models, and actual destination selection.

## Task 3: Service transport

Files: `apps/web/src/hooks.server.ts`, `apps/web/src/lib/api.ts`, associated tests.

- [x] Demonstrate direct adapter-node API requests failing despite configured internal service.
- [x] Forward supported API/report HTTP paths and preserve useful error codes and statuses.
- [x] Verify browser submit, result loading, audit polling, and evidence retrieval.

## Task 4: Chrome extension

Files: `apps/trusten-ext/*`, extension packaging/install route, `docs/extension.md`, extension tests.

- [x] Test supported Chrome icons, configurable service/report origins, live-page capture, CSP-safe highlights, and API errors.
- [x] Supply a downloadable/installable extension with current styling and functional report links.
- [x] Verify packaged files and extension behavior in Chromium.

## Task 5: Runtime verification

- [x] Run regression suites, type checks, and formatting checks.
- [x] Run the current web UI with a disposable database and real scan service.
- [x] Check known fixture findings, distinct reached URLs/states, saved result pages, screenshot/PDF/video downloads, and public-site behavior.
- [x] Record exact evidence and any external-site or model limitations.
