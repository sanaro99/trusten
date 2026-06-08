# Trusten Documentation

Trusten detects manipulative website design ("dark patterns"), grades any site on an A–F trust
scale, and maps every finding to the regulations it likely violates — with screenshot, video,
and PDF evidence.

## Contents

- [Architecture](architecture.md) — how the system fits together and the one seam to the browser.
- [Scanning](scanning.md) — Quick Scan, Deep Scan, workflows, agentic discovery, watch-live, caching.
- [Detection](detection.md) — the 11 analyzers, 24 categories, scoring, and regulatory mapping.
- [API](api.md) — HTTP + WebSocket endpoints.
- [Browser extension](extension.md) — the Quick Scan popup.
- [Development](development.md) — setup, configuration, scripts, conventions.

## Quick start

```bash
bun install
bunx puppeteer browsers install chrome   # one-time
bun run start                            # http://localhost:9200/trusten
```

See [Development](development.md) for configuration (LLM providers, ports, guardrails).
