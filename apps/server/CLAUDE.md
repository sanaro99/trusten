# CLAUDE.md — @trusten/server

Guidance for working in the Trusten server (the headless dark-pattern scanner).

## Project overview

`@trusten/server` is a standalone TypeScript/Bun service: it drives headless Chromium via
Puppeteer (`src/trusten/browser/puppeteer-driver.ts`), runs 11 dark-pattern analyzers, scores
A–F, maps findings to 14 regulatory frameworks, persists to SQLite, and serves a Hono dashboard
+ scan APIs on `:9200`. Entry point: `src/trusten/main.ts`. Everything product-specific lives
under `src/trusten/`; `src/lib/` holds only the SQLite store and logger.

## Coding guidelines

- **Use extensionless imports.** Bun resolves `.ts` automatically — never write `.js` extensions.
  ```typescript
  import { foo } from './utils'        // ✅
  import type { Bar } from '../types'  // ✅
  ```
- **Kebab-case** for file and folder names (`puppeteer-driver.ts`, `pre-scan.ts`); classes stay
  PascalCase inside.
- Write **minimal comments** — only for non-obvious logic, complex algorithms, or critical warnings.
- Logger messages have **no `[prefix]` tags**; source `file:line:function` is added automatically
  in development.
- Shared constants/types come from `@trusten/shared` (e.g. `@trusten/shared/constants/limits`),
  not magic numbers scattered in code.

## Bun

Default to Bun: `bun <file>`, `bun test`, `bun install`, `bun run <script>`. Bun auto-loads `.env`.

## Common commands (from repo root or this package)

```bash
bun run start        # serve http://localhost:9200/trusten
bun run dev          # same, with --watch
bun run typecheck    # tsc --noEmit
bun run lint         # biome (root)
```

The headless browser needs Chromium: `bunx puppeteer browsers install chrome` (one-time).
Optional LLM keys enable hybrid detection + agentic discovery. Auto-detect order:
`NVIDIA_NIM_API_KEY` → `TRUSTEN_GEMINI_API_KEY`/`GEMINI_API_KEY` → `DEEPSEEK_API_KEY` →
`OPENROUTER_API_KEY` → local Ollama. Pin a provider with `TRUSTEN_LLM_PROVIDER=<name>`.
Without any key, deterministic detection and the fixed-workflow fallback still run.
