# Browser extension

`apps/trusten-ext/` is a Chrome **Manifest V3** extension (vanilla JS, no build step) that runs
a Quick Scan on the page you're viewing.

## Install (unpacked)

1. Start the server (`bun run start`).
2. Chrome → `chrome://extensions` → enable **Developer mode** → **Load unpacked** →
   select `apps/trusten-ext/`.

## What it does

- Click the toolbar icon to open the popup, then **Analyze this page**.
- It captures the live DOM/text via `chrome.scripting` and posts to
  `POST http://localhost:9200/trusten/api/analyze-page` (falling back to `/quick-scan`).
- Renders the **A–F grade**, score, and detected patterns with severity and the regulation each
  violates.
- **Highlight on Page** injects an overlay that boxes the offending elements and shows a side
  panel; **Full Report** deep-links to the dashboard scan page.

## Permissions

`activeTab`, `scripting`, and `host_permissions` for `http://localhost:9200/*`. No global host
access, no network/cookie interception from the extension itself.

## Configuration

The server origin is hard-coded to `http://localhost:9200` in `popup.js` and `manifest.json`'s
`host_permissions`. To point at a deployed server, change both.
