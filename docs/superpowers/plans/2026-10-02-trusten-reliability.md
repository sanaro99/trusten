# Trusten reliability and report usability implementation plan

> **For agentic workers:** Use test-driven development; implement the independent analyzer, backend, dashboard, and shared-coverage tasks with the current assigned ownership.

**Goal:** Implement the five review options approved by the user: accurate detection, truthful coverage, meaningful history/progress, complete reports, and clear submission recovery.

**Architecture:** Use one shared scan-coverage assessment across public results and exports. Keep user-visible audit runs separate from their internal scans. Preserve existing URL safety, bot verification, admission limits, and evidence routes.

**Tech Stack:** TypeScript/Bun/Hono/PostgreSQL, SvelteKit, shared Zod contracts, Puppeteer.

**Spec:** User-approved options and evidence in the Trusten exploratory review (2026-10-02).

## Global constraints

- Preserve pre-existing user edits and current deployment configuration.
- Use graph tools before focused file inspection.
- No unsupported definitive claims from missing evidence, static newsletter or banner detection.
- No security bypass, secret changes, public deployment, or destructive data changes.
- Keep legacy API fields compatible; add optional coverage metadata when necessary.

## Tasks

1. **Analyzer evidence:** Write negative newsletter/banner and positive cancellation/prompt fixtures, observe failures, tighten obstruction/nagging classification, run analyzer tests.
2. **Shared coverage:** Test unavailable vision, blocked/missing evidence, failed navigation, legacy compatibility, and homepage-only coverage. Implement `assessScanCoverage` and use it in report summaries, history mapping, and HTML reports. Test public labels and grade visibility.
3. **Audit history and exports:** Test public runs excluding internal audit stages, consistent stats/domain history, and durable artifacts. Associate internal scans with their parent audit without hiding standalone checks. Investigate and fix real Chromium PDF generation; offer HTML fallback.
4. **Dashboard:** Test URL validation before verification, immutable submitted URL, verification/scanning stages, uncertain finding visibility, durable result navigation, recorded-video/report links, and blocked/limited scan recovery. Show real completed evidence counts rather than progress message totals.
5. **Library:** Test www alias grouping and comparisons only between compatible check types/coverage. Make incomplete status searchable/filterable and keep truthful homepage-only scope.
6. **Integration:** Run the root suite, typechecks, web check/build, targeted database/browser regressions, and live local UI verification. Graph change detection/review and inspect the final diff. Record provider/PDF diagnostics and any deployment-only limitations.

## Review focus

- Legacy scans missing visual metadata must not silently become conclusive public verdicts.
- Quick and full runs must not produce misleading trends merely because their scope differs.
- Failed audits must retain available evidence without claiming success.
- Visitor-check failures must not leave a frozen form or mutate the submitted URL.
- Saved HTML/video/PDF links must work through the web origin and remain safe downloads.

Baseline: `bun run test`: 251 passed, 50 opt-in skipped, 0 failed. Existing opt-in Chromium/PostgreSQL tests need an isolated fixture environment. No implementation changes were made before the baseline.
