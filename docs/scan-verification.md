# Scan restoration verification

Verified September 28, 2026 in the working tree based on `1fa7518`.

Quick scans, discovered deep journeys, and the Chrome extension use the existing
Puppeteer service. The current web layout and styling are preserved. BrowserOS
was not reintroduced.

## Verified behavior

- Direct adapter-node API and report forwarding reaches the configured scanner.
  Typed failures preserve actionable error messages. Optional live-video failures
  do not stop HTTP progress polling.
- Real links and public search forms drive discovery without a configured model.
  Commerce and consent journeys use observed destinations and controls.
- Chromium traverses search, product, same-page cart, cart page, and checkout in
  the controlled shop. Known consent, preselected marketing/insurance, and added
  fee concerns are detected with screenshots and regulatory mappings.
- A countdown cannot turn a missing button into successful navigation. Failed
  destinations and their dependent steps remain incomplete and receive no
  findings attributed to unseen pages.
- Quick PDF paths persist in PostgreSQL. Aggregate reports include every
  workflow's findings, embedded screenshot evidence, and failed planned steps.
  Every incomplete journey produces a limited verdict in both UI and report.
- Ad detection no longer mistakes `page-header`, normal banners, empty slots,
  ordinary mentions, or clearly disclosed ads for disguised advertising. Nested
  ad content uses its parent disclosure. Cached ad claims are revalidated so
  obsolete findings do not reappear.
- The unpacked Chrome extension captures the current page, calls its configured
  API, opens the current `/scan/:id` report, and closes highlights on CSP pages.
  The production download contains nine files with host-specific defaults.

## Automated checks

| Check | Result |
| --- | --- |
| `bun run test` | 205 passed, zero failures; 24 opt-in tests/hooks skipped |
| Workspace TypeScript checks | Passed |
| Web production build and Svelte check | Passed; zero Svelte errors/warnings |
| UI component checks | 16 passed |
| Chromium engine regressions | 9 passed |
| Chromium + PostgreSQL API regressions | 4 passed |
| PostgreSQL migration integration | 5 passed |
| Unpacked extension Chromium checks | 3 passed |
| Production web audit Playwright checks | 6 passed |
| Scoped Biome and `git diff --check` | Passed; existing deep-scan complexity warning remains |

Browser/database tests were explicitly enabled and run separately. They use
loopback fixtures and a disposable PostgreSQL database on port 55433; the
application's public-target restrictions remain intact.

One API case failed once during simultaneous startup of three Chromium test
processes. Its isolated rerun and the full sequential four-test suite passed;
an explicit error assertion now preserves diagnostic detail if it recurs.

## Public website checks through the current UI

The production frontend at `http://127.0.0.1:5184` forwarded to the local scanner
at port 9210 with no model configured.

| Website | Evidence |
| --- | --- |
| `example.com` | Quick result `scan-1790623834573-54gk4`; PDF HTTP 200, 241,892 bytes, one embedded screenshot |
| `books.toscrape.com` | Deep result `scan-1790623914941-ncvmo`; 11 steps, category and product navigation, zero false ad findings |
| Deep downloads | PDF HTTP 200, 951,389 bytes, ten embedded images; MP4 HTTP 200, 50,272 bytes; evidence image width 1280 |
| Extension download | HTTP 200, ZIP 55,257 bytes, nine entries, defaults for the actual web origin |

The bookstore's basket/checkout path cannot be completed, so its result correctly
shows a limited check. The controlled shop verifies successful cart and checkout
navigation. A development-proxy run also received 35 browser frames and 23
progress events; a source hot reload reset that test's page, so the full UI flow
was repeated successfully against the stable production build.

Local screenshots and detailed run output are under `.trusten-local/`, including
`verification-final.json`, `quick-result-final.png`, `deep-result-final.png`, and
`deep-evidence-final.png`.

## Remaining limits

- Discovery selects up to six relevant public workflows; coverage is bounded.
- AI visual/model checks were unavailable in this verification environment.
  Deterministic findings and traversal were verified; AI results were not.
- The combined video currently references the first workflow recording. The
  screenshot timeline and PDF include evidence across all workflows.
- Historical quick results without report paths were not backfilled.
- No production deployment was performed. Existing unrelated local changes
  were preserved and excluded from the pull request.
