# Development

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.3.6 (required — the server uses `bun:sqlite`).
- Chromium for Puppeteer: `bunx puppeteer browsers install chrome` (one-time). `ffmpeg-static`
  (for session video) is fetched on install via `trustedDependencies`.

## Setup

```bash
bun install
bunx puppeteer browsers install chrome
bun run start        # http://localhost:9200/trusten   (alias: bun run dev for --watch)
```

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

Reports/screenshots/videos land in `~/Desktop/trusten-reports/`; the DB is `~/.trusten/trusten.db`.

## Notes

- **Bun + headless browser:** Playwright cannot launch under Bun (pipe-transport/fd limitation),
  so the driver uses Puppeteer. See [architecture.md](architecture.md).
- A small set of pre-existing Biome style findings remain in the analyzer code; `bun run lint:fix`
  clears most.
