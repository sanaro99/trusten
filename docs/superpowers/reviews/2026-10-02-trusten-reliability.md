# Trusten reliability phase — 2026-10-02

Implemented all five options approved after the exploratory review.

- Detection now requires cancellation friction tied to recurring service, or concrete prompt interruption/repetition. Newsletters, optional phone cancellation, ordinary banners and static notification controls have negative regressions.
- Shared coverage assessment distinguishes complete, partial, blocked and missing evidence, and page versus journey scope. Unknown legacy visual metadata remains limited. Dashboard, public history and HTML/PDF reports use the assessment; limited reports withhold a conclusive grade.
- Progress messages describe activity; saved results supply completed step counts. Internal audit scans retain provenance and evidence but one aggregate appears publicly. Migration `007_public_audit_history.sql` backfills existing audit children and preserves standalone checks.
- Full reports retain uncertain findings, public result links, refresh recovery after completion, recordings and HTML fallback. Failed deep journeys retain a limited public aggregate and the failed status/quota refund.
- Forms validate and snapshot the address before visitor verification, freeze it during submission, explain verification/scanning stages, and offer matching saved evidence after an admission limit. Library search accepts URLs, groups leading www aliases, filters coverage and withholds comparisons between incompatible checks. Discovered full audits are not compared without a known shared plan.

Verification:

- Root suite: 303 passed, 58 opt-in skipped, zero failures. The final report grade-display regression was also rerun independently: four passed.
- PostgreSQL history, migrations and cached results: 17 passed, 65 assertions against an isolated PostgreSQL 18 cluster.
- Frontend browser flows: 17 passed, including failed-audit evidence recovery, uncertain findings, completed-result refresh, URL validation, frozen target and quota recovery.
- Real Chromium printed valid PDFs with page screenshots. Trusted report rendering disabled scripts and prevented external requests.
- Full Chromium/PostgreSQL audit suite: six passed, zero failed, 408 assertions, including teardown. The fixture uses unique domains between tests to respect the real scan guard, with a 30-second browser teardown allowance.
- Workspace TypeScript checks passed; Svelte check reported zero errors and warnings; production web build passed. Changed-file Biome and Git whitespace checks passed.
- Independent review found two important issues (stranded failed-audit evidence and incompatible full-audit trends), both addressed with regressions.

Operational limits:

- The initial DeepSeek recheck returned HTTP 402 “Insufficient Balance”. After the requested provider replacement, the ignored local server environment selects Gemini 2.5 Flash with a 30-second timeout. The live Trusten client read “Trusten” from a screenshot; the full VisualAnalyzer returned valid scan JSON and `visualCheckAvailable: true` in 17.7 seconds. Gemini 3.8 timed out at 45 seconds and was not selected locally.
- Cloudflare Workers AI and Groq integrations reuse Applination's endpoint/authentication conventions with current vision models. Their wire contracts are tested, but live calls were not verified because credentials were unavailable. Required-image fallback preserves screenshots and never counts a text retry as visual coverage. Deployment configuration remains unchanged.
- The broad pre-existing Windows/Bun browser redirect-policy test can crash Bun. PDF and audit browser regressions were run separately. Default test skips remain opt-in integration suites, not assertions of complete browser coverage.
- Changes are local and have not been deployed. Database migration 007 runs through the existing migration runner on deployment. Completed-result refresh recovery is implemented; an in-progress job is not resumed across reloads.

Provider follow-up verification:

- Provider client suite: 15 passed, including credential/endpoint isolation, partial configuration inheritance, payment/image rejection fallback, exhausted visual providers and circuit isolation. New regressions were observed failing before implementation.
- Workspace TypeScript checks and changed-file Biome checks passed. The fresh full root suite after the provider extension reported 316 passed, 58 opt-in skipped, zero failures.
- Independent review identified partial explicit configuration dropping environment credentials; the constructor now merges missing values from the provider environment and preserves explicit overrides.
