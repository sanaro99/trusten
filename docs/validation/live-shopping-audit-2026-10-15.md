# Live shopping audit — October 15, 2026

Validated the working checkout using fresh private Chromium browser contexts, the extension's actual page-capture function, the running Trusten API, local PostgreSQL, and the rendered dashboard. No purchase or login was performed.

## Final real-site observations

| Page | Result | Coverage |
| --- | --- | --- |
| Amazon storefront | One immediate time-pressure warning | Limited: visual provider unavailable |
| eBay error page | HTTP 422; no grade or saved successful scan | Requested storefront unavailable |
| Fashion Nova homepage | One countdown warning | Limited: visual provider unavailable |
| Fashion Nova Dresses collection | No observed concerns; grade withheld in UI | Limited: capture truncated and visual provider unavailable |
| Fashion Nova product | One countdown warning | Limited: visual provider unavailable |

Timers are flagged on first capture, even when hours remain. The warning describes pressure and advises comparison; it does not claim an unobserved reset, fake deadline, or invented prevalence statistic.

## Repairs

- Reject blank pages, access gates, and branded error pages before scoring.
- Clean scripts, SVG, and hidden navigation before capture limits; retain live form state separately from site-default checkbox state.
- Send available tab screenshots and persist a screenshot-backed evidence step for extension checks. Refuse screenshots if the active tab or URL changes.
- Expose incomplete visual/truncated coverage and withhold conclusive grades in the extension and report.
- Consolidate overlapping text/vision/cached evidence without merging separately identified choices or named offers.
- Reject unsupported model categories and category changes; require category-specific evidence for timers, hidden fees, and hierarchy claims.
- Remove ordinary crossed-out price and accordion false positives; retain material renewal/fee warnings.
- Prevent high/critical findings from receiving an all-clear grade; show three primary concerns with more available on demand. The full-page screenshot is expandable so it does not push the advice down the page.

## Verification

- Full default unit suite: 352 passed, 58 opt-in skips, zero failures.
- Real unpacked Chrome extension tests: 3 passed.
- TypeScript and Svelte checks: passed; Svelte reported zero warnings.
- Chromium/PostgreSQL API and deep-workflow integration: all 17 tests passed, including checkout navigation, consent preferences, incomplete journeys, combined evidence, and PDF persistence.
- Independent code review findings corrected and covered by focused regressions.

## Release limits

The configured Gemini provider returned quota exhaustion (429); DeepSeek returned insufficient balance (402), Nvidia's configured model returned retired-model (410), and local Ollama was unreachable. A funded, supported vision provider must be restored and the visual/consent checks repeated before claiming complete live coverage. The UI correctly reports limited coverage during this outage. No billing or secret configuration was changed.

The optional Windows Bun browser lifecycle suite crashed during the broader run; an isolated retry stalled and was stopped. This remains a release validation gap, separate from the passing extension and report-persistence checks. Native toolbar clicking could not be completed because desktop-control approval timed out; the unpacked extension was exercised directly in Chrome and screenshot permission/race behavior was covered by fixtures.

Live captures, response JSON, rendered screenshots, and logs are retained locally under the ignored directory .trusten-local/live-audit. Final homepage report: http://127.0.0.1:5174/scan/scan-1792098938392-b1ocn (requires local services).
