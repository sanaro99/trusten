# Scan failure and retry verification

Verified September 28, 2026 against the working tree based on `7c02c27`, after
the scan-restoration PR was merged.

## Reproductions and fixes

- A cached, disconnected Chromium instance caused `Connection closed.` on new
  checks. Browser launches now share one pending launch; disconnected browsers
  and stale page handles are discarded before the next check.
- Bare addresses such as `temu.com` were rejected as invalid URLs. Quick and
  deep requests now share HTTPS normalization while preserving target-policy
  checks for credentials, protocols, private addresses, and ports.
- Failed checks consumed the successful-scan allowance and domain cooldown.
  Failure now cancels its own reservations before returning a quick failure or
  publishing an audit failure. Refund ownership survives execution-lease expiry;
  completed scans cannot subsequently be refunded. An independent IP throttle
  permits ten admitted attempts per minute even when failures are refunded.
- Security challenges, HTTP errors, and pages still loading now produce distinct
  errors. Initial capture waits for usable rendered content for up to ten seconds.
  An extension capture of a verification screen is also rejected before saving.
  The existing home design shows an extension link when the site blocks a check.

## Fresh verification

| Check | Result |
| --- | --- |
| `bun run test` with disposable PostgreSQL | 250 passed, zero failures; 33 opt-in browser tests/hooks skipped |
| PostgreSQL integration, included above | 8 passed, including fresh migrations, checksums, expired refunds, and legacy inserts |
| Real Chromium lifecycle regressions | 11 passed |
| Real Chromium deep-scan regressions | 11 passed |
| Chromium + PostgreSQL API regressions | 5 passed |
| Unpacked Chrome extension regressions | 3 passed |
| Production web audit Playwright regressions | 8 passed |
| UI component regressions | 16 passed |
| Workspace type checks, Svelte check, production build | Passed; zero Svelte errors/warnings |
| Scoped Biome and `git diff --check` | Passed; two nonblocking complexity warnings |

Browser tests explicitly enabled `TRUSTEN_BROWSER_TESTS=1` and used installed
Google Chrome. Database tests used a fresh disposable PostgreSQL 18 database on
port 55433, never an inherited application database. Models were disabled so
navigation and text/DOM findings could be verified independently. Results still
identify unavailable visual analysis as incomplete coverage.

The controlled shop exercised search, product selection, an in-page cart update,
cart, checkout, and consent preferences. Reports contained the known added-fee
and preselected-option findings with screenshots. Blocked journeys and failed
persistence did not produce successful completed results. The audit retry test
deliberately delayed cancellation and confirmed no reserved quota remained when
the terminal failure became visible.

One lifecycle run hit a native Bun 1.4.0 Windows segmentation fault. Its complete
isolated rerun passed all eleven tests. Subsequent engine/API suites ran
sequentially and passed.

## Live website checks

The rebuilt adapter-node site on port 5184 forwarded to the updated API on 9210.
An actual browser submitted `https://temu.com`, then `temu.com`, using the same
visitor session. Both returned HTTP 422 `SITE_BLOCKED`, with the website-block
explanation and extension link. Neither returned a demo-limit or service error.
A following bare `example.com` check returned HTTP 200, navigated to its saved
result, and downloaded a 241,292-byte PDF beginning with `%PDF`.

Temu redirected fresh headless browsers to `/bgn_verification.html`, a slider
security verification rather than the storefront. These checks do not establish
that Trusten can traverse Temu's storefront through that challenge. A user must
open Temu in Chrome, complete its verification, and then use the extension on
the loaded page. Trusten does not grade the challenge screen as a clean website.

## Migration behavior

Migrations 004–006 add reservation ownership, attempt throttling, and separate
refund retention. The new lease column has a default supporting an older
application's two-column inserts during rollout or rollback; the new application
explicitly supplies its refund lifetime. Historical quota events created before
reservation ownership was recorded expire under their existing quota windows.
They cannot be matched safely to an individual failed check for a retroactive
refund.
