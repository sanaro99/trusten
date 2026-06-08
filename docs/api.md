# API

Base URL: `http://localhost:9200`. The dashboard and APIs are served under `/trusten`.

## Scanning

| Method | Endpoint | Body / params | Purpose |
|---|---|---|---|
| POST | `/trusten/api/quick-scan` | `{ url }` | Navigate headlessly + scan one page. Honors robots/rate-limit. |
| POST | `/trusten/api/analyze-page` | `{ url, html, text? }` | Scan caller-supplied DOM (extension path); no navigation. |
| POST | `/trusten/api/audit` | `{ url, mode?, workflows?, watch? }` | Start an async multi-workflow Deep Scan. `mode`: `fixed` (default) or `discover`. |
| GET | `/trusten/api/audit/:jobId` | — | Poll audit status: `status`, `currentStep`, `completedWorkflows`, `plan`, `scanIds`. |

## Results & evidence

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/trusten/api/scan/:id` | Scan result JSON (patterns, score, workflow steps, evidence paths). |
| GET | `/trusten/api/history?limit=` | Recent scans. |
| GET | `/trusten/api/stats` | Global stats. |
| GET | `/trusten/api/domain/:domain` | Per-domain summary + recent scans. |
| GET | `/trusten/scan/:id` | Scan report (HTML page). |
| GET | `/trusten/report/:id/pdf` | PDF report. |
| GET | `/trusten/report/:id/video` | Session video (mp4). |
| GET | `/trusten/report/:id/screenshot/:step` | Annotated step screenshot (jpeg). |

## Live stream (WebSocket)

`GET /trusten/api/jobs/:jobId/live` — upgrades to a WebSocket that emits JSON events while a
Deep Scan runs:

- `{ "type": "frame", "data": "<base64 jpeg>" }` — a live browser frame (when `watch` is on).
- `{ "type": "progress", "step", "total", "url", "action", "patternCount", "grade" }`
- `{ "type": "done" | "error", "message" }`

## Dashboard pages

`/trusten` (home), `/trusten/audit`, `/trusten/history`, `/trusten/leaderboard`,
`/trusten/site/:domain`, `/trusten/scan/:id`.

### Example

```bash
# Quick scan
curl -s -X POST http://localhost:9200/trusten/api/quick-scan \
  -H 'content-type: application/json' -d '{"url":"https://example.com"}'

# Agentic deep-scan audit, watched live
curl -s -X POST http://localhost:9200/trusten/api/audit \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com","mode":"discover","watch":true}'
```
