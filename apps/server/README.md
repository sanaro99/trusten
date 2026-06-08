# @trusten/server

The Trusten dark-pattern detection server: a headless-browser scan engine, scoring +
regulatory mapping, persistence, and a server-rendered dashboard. TypeScript / Bun / Hono /
SQLite, with Puppeteer (headless Chromium) for scanning and video capture.

```bash
bun run start      # serve http://localhost:9200/trusten
bun run dev        # same, with --watch
bun run typecheck
```

Entry point: `src/trusten/main.ts`. Everything Trusten-specific lives under `src/trusten/`;
`src/lib/` holds only the SQLite store and logger. See the repository root `README.md` for
the full architecture, API, and detection coverage.
