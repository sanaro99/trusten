# Browser extension

`apps/trusten-ext/` is a Chrome **Manifest V3** extension that checks the page you are viewing.
The popup and highlight panel retain the current Trusten design. No BrowserOS or extension
build step is required.

## Install from your Trusten site

1. Open **Chrome extension** in Trusten's navigation, or visit `/extension`.
2. Download the ZIP and extract it to a folder you will keep.
3. Type `chrome://extensions` in Chrome's address bar and enable **Developer mode**.
4. Choose **Load unpacked** and select the extracted folder containing `manifest.json`.
5. Open a website, click the Trusten toolbar icon, and choose **Check this page**.

The ZIP comes from `/extension/download` and connects to the Trusten origin serving the
download. Its manifest grants service access to that origin. The production web build embeds
all extension files, so the download works without a source checkout on the deployed server.
This is an unpacked installation, not a Chrome Web Store listing.

## Install from the source checkout

1. Start the server (`bun run start`) and dashboard (`bun run dev:web`); see
   [local development](development.md) for environment setup.
2. In `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select
   `apps/trusten-ext/`.

The source defaults connect to `http://localhost:9200` for scanning and
`http://localhost:5173` for the dashboard. A source ZIP can also be created with:

```sh
bun apps/trusten-ext/package.ts https://trusten.example
# Separate service/dashboard origins and output filename:
bun apps/trusten-ext/package.ts https://api.example https://trusten.example trusten-extension.zip
```

## Connection settings

Click the gear in the popup, or open the extension's **Options** from Chrome. Enter the
Trusten service and dashboard origins, such as `https://trusten.example`, and save. Chrome
asks for permission to connect to a newly chosen service. Origins must use HTTP or HTTPS;
omit paths, query strings, credentials, and fragments. Reopen the popup after saving.

The service must expose `/trusten/api/analyze-page`; the dashboard uses `/scan/:id` report
URLs. Using the web origin for both addresses sends API calls through the existing Trusten
proxy. No authentication or bot-verification requirement is bypassed.

## What it does

- A check captures the current page URL, title, up to 500,000 characters of HTML, and up to
  50,000 characters of visible text using `chrome.scripting`. The content is sent to your
  chosen service's `POST /trusten/api/analyze-page` endpoint.
- Results show the **A–F grade**, concerns in plain language, and severity. **See evidence**
  opens the saved scan in the current dashboard.
- **Highlight these choices** outlines matching elements and opens an evidence panel on the
  page. The close button, Escape key, and popup toggle remove the highlights and restore
  the page's original styles. Trusten's own panel is removed before another capture.
- If the live-content endpoint returns **404**, or Chrome cannot capture a protected page,
  the extension tries the existing URL-based `/quick-scan` endpoint. That fallback cannot
  reproduce your signed-in state and remains subject to the service's admission rules.
- Chrome internal pages and non-HTTP(S) URLs are rejected locally. Server rejections are
  shown in the popup, so rate limits and incomplete checks are not presented as results.

## Permissions and page data

`activeTab` and `scripting` allow a check after you click the extension on a page. `storage`
keeps your connection settings on this device. Required host access is limited to the chosen
Trusten service; optional HTTP(S) access is requested only when you save another service.
Chrome-compatible PNG icons are rendered from the existing SVG artwork.

Checks are manual. The extension does not read browsing history or intercept cookies and
network traffic. Captured HTML and text may include signed-in or personal page content;
choose a Trusten service you trust and check pages you are comfortable sharing.

## Verification

```sh
bun test apps/trusten-ext/popup.test.ts apps/trusten-ext/package.test.ts
node --test apps/trusten-ext/browser.test.mjs
```

The browser checks use the server workspace's Puppeteer and its installed Chrome to load an
actual unpacked extension, capture a live fixture, render the API response, follow current
report links, decode icons, and close highlights on a page with a restrictive script policy.
