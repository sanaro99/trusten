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

LLM is **optional**: without a key, deterministic detection and the fixed-workflow fallback
still run. The LLM improves hybrid detection, deep-scan navigation, and agentic discovery.

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
