# Development

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.4.0.
- PostgreSQL 17 (a local installation or the Compose database).
- Chromium for Puppeteer: `bunx puppeteer browsers install chrome` (one-time). `ffmpeg-static`
  (for session video) is fetched on install via `trustedDependencies`.

## Setup

```bash
bun install
bunx puppeteer browsers install chrome
export DATABASE_URL=postgresql://trusten:trusten@localhost:5432/trusten
bun run start        # http://localhost:9200/trusten   (alias: bun run dev for --watch)
```

The server applies versioned migrations under an advisory lock during startup.
Do not hand-edit the development schema.

## Scripts (repo root)

| Script | What |
|---|---|
| `bun run start` | run the server (`@trusten/server`) |
| `bun run dev` | run with `--watch` |
| `bun run typecheck` | `tsc --noEmit` across the workspace |
| `bun run lint` / `bun run lint:fix` | Biome check / autofix |

## Configuration (environment variables)

| Variable | Default | Purpose |
|---|---|---|
| `TRUSTEN_PORT` | `9200` | HTTP/WebSocket port |
| `TRUSTEN_API_ORIGIN` | `http://localhost:9200` | Scanner origin for the Vite development proxy |
| `TRUSTEN_INTERNAL_API_ORIGIN` | — | Private scanner origin for adapter-node API/report forwarding and server-rendered data |
| `TRUSTEN_REPORTS_DIR` | `~/Desktop/trusten-reports` | Directory for HTML/PDF reports, screenshots, and videos |
| `ORIGIN` | — | Public web origin for adapter-node, including the actual HTTP(S) scheme |
| `DATABASE_URL` | — | PostgreSQL connection string (required outside isolated tests) |
| `PUBLIC_TURNSTILE_SITE_KEY` | — | Public web key; absence disables the widget locally |
| `TRUSTEN_TURNSTILE_MODE` | `test` outside production | `enforce`, `test`, or `off` verification mode |
| `TRUSTEN_TURNSTILE_SECRET_KEY` | — | Private server-side verification key |
| `TRUSTEN_TURNSTILE_EXPECTED_HOSTNAME` | — | Hostname accepted from verification |
| `TRUSTEN_TURNSTILE_EXPECTED_ACTION` | `scan-submit` | Action accepted from verification |
| `TRUSTEN_LLM_PROVIDER` | auto | Force `nvidia-nim` \| `gemini` \| `ollama` |
| `NVIDIA_NIM_API_KEY` | — | NVIDIA NIM key (also `NVIDIA_NIM_BASE_URL`, `NVIDIA_NIM_MODEL`) |
| `TRUSTEN_GEMINI_API_KEY` / `GEMINI_API_KEY` | — | Gemini key (also `GEMINI_BASE_URL`, `GEMINI_MODEL`) |
| `OLLAMA_BASE_URL` / `OLLAMA_MODEL` | localhost | Local Ollama |
| `TRUSTEN_LLM_TIMEOUT_MS` | `8000` | Per-call LLM timeout |
| `TRUSTEN_IGNORE_ROBOTS` | — | `1` bypasses robots.txt (local testing) |
| `TRUSTEN_RATE_WINDOW_MS` | `60000` | Per-domain scan rate-limit window |
| `NODE_ENV` | — | `development` enables pretty logs |

LLM is **optional**: without a configured model, deterministic detection and discovery
from the website's actual public links and search forms still run. The LLM improves
hybrid detection and navigation through less predictable interfaces. Unavailable
visual checks are identified in results.

When running adapter-node directly, set `ORIGIN` to the public web URL (for example
`http://localhost:3000` locally) and `TRUSTEN_INTERNAL_API_ORIGIN` to the scanner's
private origin. Browser API requests and evidence/report downloads then work on the
web origin. Live video also needs the Vite WebSocket proxy or the deployed Caddy
reverse proxy; HTTP progress polling continues when live video is unavailable.

## Project layout & conventions

See [architecture.md](architecture.md) for the tree. Conventions (also in
`apps/server/CLAUDE.md`): kebab-case filenames, extensionless imports (Bun resolves `.ts`),
minimal comments, shared constants from `@trusten/shared`.

## Verifying a change end-to-end

```bash
bun run typecheck
bun run start &                                   # in another shell

curl -s -X POST localhost:9200/trusten/api/quick-scan \
  -H 'content-type: application/json' -d '{"url":"https://example.com"}'

curl -s -X POST localhost:9200/trusten/api/audit \
  -H 'content-type: application/json' -d '{"url":"https://example.com","workflows":["checkout"]}'
# then poll GET /trusten/api/audit/:jobId and open the dashboard
```

Reports/screenshots/videos land in `~/Desktop/trusten-reports/`; relational
state is stored in the PostgreSQL database selected by `DATABASE_URL`.
Set `TRUSTEN_REPORTS_DIR` to override that artifact directory.

Real Chromium regressions are opt-in:

```powershell
$env:TRUSTEN_BROWSER_TESTS = '1'
$env:PUPPETEER_EXECUTABLE_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
bun test apps/server/src/trusten/deep-scan.browser.test.ts

# Use a disposable PostgreSQL database; these tests create and delete their fixtures.
$env:TRUSTEN_TEST_DATABASE_URL = 'postgresql://trusten@localhost:55433/trusten_verification'
$env:TRUSTEN_IGNORE_ROBOTS = '1'
$env:TRUSTEN_RATE_WINDOW_MS = '1'
bun test apps/server/src/trusten/dashboard/audit.browser.test.ts
node --test apps/trusten-ext/browser.test.mjs
```

These navigation fixtures run without a model. Leave provider keys unset and keep
`TRUSTEN_LLM_PROVIDER` unset for deterministic regression runs.

For local development, omit `PUBLIC_TURNSTILE_SITE_KEY` and use the server's
explicit non-production disabled/test mode. To exercise the complete browser
flow, use Cloudflare's official test site and secret keys; never use production
keys in tests. The widget is explicitly rendered at submit time with Managed
`interaction-only` appearance, so it stays out of the normal page flow unless
Cloudflare requests interaction.

Treat migrations as deployment artifacts: apply them to a disposable database
in CI, test upgrade from the last released schema, and keep production changes
backward-compatible with the previous image so rollback remains possible.

## Notes

- **Bun + headless browser:** Playwright cannot launch under Bun (pipe-transport/fd limitation),
  so the driver uses Puppeteer. See [architecture.md](architecture.md).
- A small set of pre-existing Biome style findings remain in the analyzer code; `bun run lint:fix`
  clears most.
