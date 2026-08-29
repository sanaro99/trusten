# Trusten Dashboard on SvelteKit — Design

**Date:** 2026-08-28
**Status:** Proposed — awaiting review (revised after audience feedback)
**Project:** 1 of 3 (Foundation + Dashboard)

---

## 1. Context

Trusten's dashboard is rendered by `apps/server/src/trusten/dashboard/ui.ts`: 1,317 lines
of HTML in template strings, ~135 hand-written CSS rules, and four inline `<script>`
blocks that build DOM by string concatenation. It is the largest file in the repo and
3.3x the project's own 400-line warning threshold. Every UI change goes through it.

`theme.ts` exists solely to stop `ui.ts` and `report.ts` — two independent renderers of
the same data — from drifting apart. That is a symptom, not a solution.

This project replaces the dashboard with a SvelteKit application, establishes the shared
component foundation that the report renderer (project 2) and the browser extension
(project 3) will consume, and — the change that drives everything else — **re-voices the
product for the people it is actually for.**

### Decomposition

This is one of three projects, specified and implemented separately:

1. **Foundation + Dashboard** (this document) — SvelteKit app, `packages/ui`, the
   plain-language content layer, shared API contract, the dashboard surfaces redesigned.
2. **Report renderer** — `report.ts` rebuilt on shared components with a `css: 'injected'`
   compile target, preserving the `file:///` → PDF path and the portable `.html` artifact.
   **Produces two reports** (decided 2026-08-28, see §7.2.1): a consumer report in the
   voice of §2, and a professional report for regulators, lawyers, and compliance staff.
3. **Extension popup** — the 578-line vanilla popup rebuilt as a Svelte MV3 popup.

Projects 2 and 3 depend on `packages/ui` and on the plain-language layer from this
project. They are independent of each other.

## 2. Audience — the constraint everything else answers to

**Trusten's users are not technical.** They are frequently older, frequently not
confident with software, and often have no formal education in how any of this works.
Critically: **they cannot identify dark patterns themselves — that is precisely why they
need Trusten.** A user who could read "manufactured scarcity exploits loss aversion" and
act on it would not need the product.

Everything below follows from that. Where this document and the audience disagree, the
audience wins.

### 2.1 What the product currently says to that user

The scan report today renders text generated inside the analyzers and
`regulatory/mapping.ts`:

> "Urgency language detected: *'Only 2 left'*. Manufactured time pressure is a dark
> pattern that exploits **loss aversion** to rush purchasing decisions."

> "Artificial scarcity exploits **FOMO** (fear of missing out)…"
> "…**reference price manipulation**…"
> "**Privacy zuckering** detected…"
> "UCPD **blacklists** falsely stating that a product will only be available for a very
> limited time…"

And the category names it shows: **Roach Motel**, **Basket Sneaking**, **Confirmshaming**,
**Privacy Zuckering**, **Drip Pricing**, **Bait and Switch**. These come from the
Brignull / Mathur dark-pattern research taxonomy. They are correct, and they are useless
to the intended reader.

**This is not a frontend problem.** The finding text is generated in the analyzers, the
legal text lives in `regulatory/mapping.ts`, and the labels live in `theme.ts`. A new UI
rendering the same strings would be exactly as opaque. Fixing it is in scope for this
project (§5).

### 2.2 Voice principles

These are binding on every surface, and on projects 2 and 3.

1. **Never show a number the user has to interpret.** No `0.55` confidence. No `73/100`.
   No `−15`. Numbers that describe *the site's behaviour* are fine and concrete ("added
   £4.99 at the last step", "asked you 3 times"). Numbers that describe *our own
   internal certainty or arithmetic* are never shown.
2. **Say what happened, then why it is unfair.** Concrete first, principle second.
3. **Show the actual thing.** The site's own words, quoted, and a picture of it, always
   beat a description of it.
4. **Blame the site, never the user.** "This shop made the 'no' button hard to find" —
   not "you may have been tricked". Nobody should finish a report feeling foolish.
5. **Plain words.** Target roughly a 6th–8th grade reading level. Short sentences. Active
   voice. No jargon, including our own: no "dark pattern", "analyzer", "heuristic",
   "confidence", "severity", "deduction" in primary copy.
6. **Answer the question they came with.** "Is this site trying to trick me, and how?"
   Everything else is secondary.

### 2.3 Accessibility is a functional requirement, not a checklist

For an older audience this is core product, not compliance:

- Base body text **18px** (the current dashboard uses 14–16px), generous line height,
  comfortable measure.
- **WCAG AA minimum throughout; AAA for body text.**
- Touch/click targets **at least 44x44px**.
- **Nothing hover-only.** Every action reachable by click, tap, and keyboard.
- Severity and grade never carried by colour alone — always colour *plus* a word or icon.
- Respect `prefers-reduced-motion`; no animation carries meaning.
- The page must remain usable at 200% browser zoom.

## 3. Goals

- Replace template-string rendering with a real component model.
- Re-voice the product for a non-technical audience, including a plain-language content
  layer that projects 2 and 3 inherit.
- Redesign the information architecture and visual language.
- Establish `packages/ui` as the shared component, token, and content layer.
- Introduce a typed, runtime-validated API contract between server and client.
- Leave no renderer-drift problem behind: `theme.ts` dissolves into tokens and content.

## 4. Non-goals

- Rebuilding `report.ts` or the extension (projects 2 and 3).
- Authentication, multi-user, or hosted multi-tenancy.
- Changing detection logic, analyzers, scoring, or the scan engine. The plain-language
  layer sits *over* analyzer output; it does not rewrite the analyzers.
- Fixing the scoring issues identified separately (confidence weighting, severity-cap
  saturation).
- A Dockerfile.

## 5. The plain-language layer

The single most valuable thing this project produces, and the reason it cannot be a
frontend-only change.

### 5.1 Why a category-keyed layer works

Per-finding descriptions are generated strings with interpolated evidence — they cannot be
mechanically rewritten. But every finding carries a `category`, and `DarkPatternCategory`
is a **closed enum of 25 values**. So a hand-written plain-language explanation per
category is finite, reviewable, and high quality in a way generated text never is.

The interpolated part — the site's actual words, e.g. `"Only 2 left!"` — is the most
concrete and understandable element we have, and it gets promoted to the foreground.

### 5.2 Structure

Lives in `packages/ui/src/content/patterns.ts`, one entry per category:

```ts
{
  name:        "A fake deadline",              // replaces "Fake Urgency"
  what:        "This shop used a countdown or a 'hurry' message to rush you.",
  why:         "The deadline often isn't real. It's there to stop you comparing
                prices or thinking it over.",
  watchFor:    "Timers that restart when you reload the page.",
  lawPlain:    "In the EU and the US, inventing a fake deadline to hurry a
                shopper is against the law.",
}
```

Four fields, each with a job: **name** (what to call it), **what** (what the site did),
**why** (why that is unfair to you), **watchFor** (how to spot it yourself next time —
this is the part that leaves the user better off than when they arrived), and **lawPlain**
(the legal position in one sentence, no citation).

Illustrative renamings — the full set of 25 is written during implementation and reviewed
as content, not code:

| Enum | Today shows | Becomes |
|---|---|---|
| `fake_urgency` | Fake Urgency | A fake deadline |
| `fake_scarcity` | Fake Scarcity | Pretending it's nearly sold out |
| `confirmshaming` | Confirmshaming | Guilt-tripping you for saying no |
| `roach_motel` | Roach Motel | Easy to join, hard to leave |
| `hard_to_cancel` | Hard to Cancel | Making it hard to cancel |
| `drip_pricing` | Drip Pricing | Extra costs added at the last step |
| `basket_sneaking` | Basket Sneaking | Something added to your basket you didn't pick |
| `privacy_zuckering` | Privacy Zuckering | Sharing your details without telling you clearly |
| `preselected_options` | Preselected Options | Boxes already ticked for you |
| `forced_continuity` | Forced Continuity | A free trial that quietly starts charging |
| `cookie_wall` | Cookie Wall | You can't use the site unless you accept tracking |
| `disguised_ads` | Disguised Ads | Adverts made to look like normal content |
| `fake_hierarchy` | Fake Hierarchy | The 'yes' button made obvious, the 'no' button hidden |
| `fake_social_proof` | Fake Social Proof | Made-up numbers of other shoppers |

### 5.3 The analyzer's own text does not disappear

The generated description keeps its value for a technical reader and is the closest thing
to a source of truth about *why this specific finding fired*. It is demoted, not deleted:
it appears under a **"How we worked this out"** disclosure on each finding, alongside the
matched selector and the analyzer name.

Same for the law: `RegulatoryViolation` keeps `regulation`, `article`, and its formal
`description`, shown under **"Is this allowed?"**. The plain sentence is what the user
reads; the citation is there for anyone who needs it — and for the PDF, which is the
artifact most likely to reach a regulator or a lawyer.

**Drift risk and its mitigation:** a hand-written layer keyed by enum can go stale if a
category is added. A `bun test` over `DarkPatternCategory` asserting every enum member has
a content entry makes that a build failure rather than a blank space in the UI.

### 5.4 Confidence, without a number

The scanner's `confidence` (0–1) never reaches the screen as a figure. It becomes
placement and wording:

| Confidence | Treatment |
|---|---|
| ≥ 0.8 | Stated plainly: **"We found…"**. Listed in the main findings. |
| 0.7 – 0.8 | Hedged: **"This looks like…"**. Listed in the main findings. |
| < 0.7 | Not in the main list. Collected under **"A few other things worth a look"**, collapsed by default. |

Nothing is hidden — a curious or professional user can open the third group — but the
default reading experience is not diluted by our own uncertainty.

### 5.5 Severity, without a scale

`critical / high / medium / low` is an internal scale. Displayed, it becomes three levels
framed by consequence, each with colour **and** a word **and** an icon:

- **Serious** — could cost you money or give away your personal information.
- **Worth knowing** — unfair, but unlikely to cost you directly.
- **Minor** — annoying rather than harmful.

`critical` and `high` both map to **Serious**; `medium` → **Worth knowing**; `low` →
**Minor**. Four internal levels collapse to three shown, because a four-point abstract
scale is one distinction more than this audience needs.

### 5.6 The grade

The A–F letter is kept — school grades are one of the few scales this audience reads
fluently — but it stops being the headline. The headline is a plain sentence:

> ### This shop uses several unfair tricks
> **Grade D.** We found 4 things you should know about.

The `73/100` trust score is not shown on primary surfaces. The **"−15 fake urgency,
−8 drip pricing"** deduction breakdown proposed in the first draft of this spec is
**withdrawn** — it is analyst arithmetic and fails principle 1 in §2.2.

## 6. UX design

### 6.1 Information architecture

Today: `home`, `audit`, `scan`, `site/:domain`, `history`, `leaderboard` — six sibling
pages. `history` and `leaderboard` are the same data under different sorts; keeping them
apart forces the user to work out which page answers their question. They merge.

| Route | Absorbs | Purpose |
|---|---|---|
| `/` | `home` | Check a site. One field, one button. |
| `/scan/:id` | `scan` | The result. The product's hero surface. |
| `/site/:domain` | `site` + domain slice of `history` | One site over time. |
| `/explore` | `history`, `leaderboard` | Sites we've checked. |
| `/audit` | `audit` | Deep check, live. |

Six pages to five routes, one fewer concept.

### 6.2 The result page: a single-column narrative

**This replaces the two-pane evidence viewer proposed in the first draft.** A
findings-list-drives-an-evidence-pane layout is a developer-tools pattern: it assumes the
reader knows the two panes are linked. For this audience that assumption is unsafe, and a
missed link means a reader who sees a list and never discovers the evidence.

The result page is **one column, read top to bottom**:

```
┌──────────────────────────────────────────┐
│  This shop uses several unfair tricks    │
│  Grade D · we checked example.com today  │
│                                          │
│  [ What we found ]  [ Check another site]│
├──────────────────────────────────────────┤
│  1. A fake deadline              SERIOUS │
│                                          │
│     The shop said:                       │
│     ┌────────────────────────────────┐   │
│     │  "Only 2 left — order in 5:00" │   │  <- screenshot cropped
│     │   [highlighted in the picture] │   │     to THIS element
│     └────────────────────────────────┘   │
│                                          │
│     What this means                      │
│     This shop used a countdown to rush   │
│     you. The deadline often isn't real.  │
│                                          │
│     How to spot it yourself              │
│     Timers that restart when you reload. │
│                                          │
│     ▸ Is this allowed?                   │
│     ▸ How we worked this out             │
├──────────────────────────────────────────┤
│  2. Boxes already ticked for you  SERIOUS│
│     …                                    │
└──────────────────────────────────────────┘
```

Each finding is a self-contained card in a numbered sequence. No panes to coordinate, no
mode switching, no tabs. Everything primary is visible; only the two secondary layers
("Is this allowed?", "How we worked this out") are behind disclosures, and both are
labelled as questions rather than as jargon.

**The `boundingBox` insight survives and improves.** `ElementEvidence.boundingBox` is
already produced by the scanner and has never been used by the UI — today's boxes are
*burned into* the screenshot at capture time by `buildAnnotationScript()`, which is why
they cannot be toggled or linked to anything. Here, each card renders the screenshot
**cropped and zoomed to its own element** with a single highlight drawn as an SVG overlay.
One finding, one picture, one box. That is clearer for this audience than a wide screenshot
carrying eight boxes, and it costs no new capture work.

**Ordering** is by severity then by confidence, so the most serious, most certain finding
is the first thing read.

**When nothing is found**, the page says so warmly and without hedging — a clean result is
a real result, and this audience needs the reassurance stated plainly.

### 6.3 Checking a site: one field, one button

The current audit surface asks the user to pick workflows from checkboxes (`checkout`,
`signup`, `cookie consent`, `cancellation`), choose between fixed and discover mode, and
opt into watching live. That is a configuration screen for someone who knows what those
words mean.

The home surface becomes: **a URL field and a "Check this site" button.** Sensible
defaults are chosen for the user. Deep-check options move behind a plain-worded
**"More options"** disclosure on `/audit`, and the options are re-labelled in the same
voice ("Also try signing up", "Also try cancelling").

### 6.4 The live check: a timeline that becomes the result

Today: a status line updated by a 3-second poll, a `<img>` swapping base64 JPEG frames,
then a `setTimeout` redirect that discards what you watched and sends you elsewhere.

Instead, `/audit` shows a **plain-worded step timeline** that builds as the check runs —
"Looking at the home page", "Adding an item to the basket", "Trying to cancel" — with the
live picture beside it. When the check finishes, **the timeline does not redirect. It
becomes the result page's journey section, in place**, with findings appearing beneath it.
What you watched is what you now read.

Beyond removing a jarring redirect, this matters for trust with a non-technical audience:
seeing the work happen is what makes the verdict credible.

The 3-second poll disappears; the WebSocket already carries `progress`, `frame`, `done`,
and `error`, and the page previously had no state model to receive them into. Svelte's
`$state` is that model. Polling remains a reconnect fallback only.

### 6.5 Visual language

The purple identity is retained but re-expressed as tokens rather than 135 literal hex
values.

- **Tokens** are CSS custom properties in `packages/ui/tokens.css`, consumed by the
  Tailwind preset. Grade, severity, surface, text, and border scales all become tokens.
  `theme.ts` dissolves into this file.
- **Type scale** starts at 18px body, with a restrained scale — this is a reading surface.
- **Dark mode** designed in from the start via token redefinition, not retrofitted.
- **Density**: the result page is a reading surface with generous spacing; `/explore` is a
  scanning surface with compact rows.

## 7. Technical architecture

### 7.1 Workspace layout

```
apps/
  server/          Hono API + WebSocket + Puppeteer engine   (:9200)
                   dashboard/ui.ts DELETED
                   dashboard/routes.ts keeps ONLY /api/* + report asset routes
  web/             SvelteKit dashboard                        (:5173 dev / :3000 prod)
  trusten-ext/     unchanged this project (project 3)
packages/
  shared/          existing; gains api/ contract schemas
  ui/              NEW — components, design tokens, plain-language content
```

### 7.2 `packages/ui` — the boundary that makes projects 2 and 3 cheap

Built here, consumed by all three. If these live in `apps/web/src/lib/components`,
projects 2 and 3 each pay for a painful extraction.

```
packages/ui/
  tokens.css              CSS custom properties
  tailwind-preset.js      Tailwind preset exposing tokens as utilities
  src/
    content/
      patterns.ts         25 plain-language entries (§5.2)   <- the crown jewels
      severity.ts         internal severity -> shown level + wording
      grade.ts            grade -> plain headline sentence
    primitives/           shadcn-svelte components (Button, Dialog, Table, Badge…)
    domain/               GradeBadge, SeverityTag, FindingCard, EvidenceShot,
                          RegulationDisclosure, JourneyTimeline, ScoreSparkline
```

**Constraint that keeps this reusable:** `domain/` components take plain props and emit
events. No `fetch`, no stores, no SvelteKit imports (`$app/*`), no browser-only APIs at
module scope. This is what lets project 2 render them through `svelte/server` `render()`
into a static file, and project 3 render them in an MV3 popup where SvelteKit does not
exist. Enforced by an import-boundary lint rule, not by good intentions.

`EvidenceShot` is the exception worth noting: it measures for the crop-and-highlight, so it
accepts a `static` mode that renders a pre-cropped image without interactivity — the mode
project 2 uses for the PDF.

### 7.2.1 Two audiences, two registers — without bimodal components

**Decision (2026-08-28):** Trusten produces two reports. The consumer report, in the voice
of §2, is the main one. The professional report serves regulators, lawyers, and compliance
staff, who read citations fluently and for whom demoting the legal detail actively destroys
the document's value.

Project 2 builds both, but the structure that makes that possible has to exist here, or
`packages/ui` will need reworking to accommodate it.

**The wrong way** is a `register: 'plain' | 'professional'` prop threaded through every
component. That makes each one bimodal, spreads conditionals through the whole library, and
doubles the state space of everything — precisely the debt this project exists to avoid.

**The structure instead:** divergence lives in *composition and copy*, never in the shared
pieces.

```
shared, single-register:
  tokens.css        primitives/        content/patterns.ts     EvidenceShot
                    SeverityTag        (carries BOTH plain and    GradeBadge
                    Disclosure          technical fields)

composed separately:
  consumer/FindingCard        professional/FindingEntry
    plain name, big picture,    formal category name, full citation with article,
    "what this means",          analyzer name, selector, confidence as a figure,
    law in one sentence,        network evidence, all four severity levels
    detail behind disclosures   nothing hidden behind disclosures
```

Two compositions over one set of primitives. No component has to know which audience it is
serving; the composition already decided.

**This is why §5.3 preserves the analyzer's generated text and the formal citations rather
than deleting them.** For the consumer they are demoted behind "How we worked this out" and
"Is this allowed?". For the professional they are the primary content. The same data serves
both because nothing was thrown away.

**Note for project 2, recorded here so it is not discovered late:** the professional report
is a document that may be submitted as evidence, which raises requirements the consumer
report does not have — scan timestamp, engine version, which findings were deterministic
versus LLM-assisted, and **which LLM provider produced them**. Trusten's provider fallback
chain (DeepSeek → Nvidia NIM → Gemini → OpenRouter → Ollama) means the same page can yield
different findings on different runs. A consumer never needs to know that. A regulator
does, and a report that cannot say which engine produced a finding is weak evidence.
Capturing provider and model per scan may require a small server change, which is why it is
flagged now rather than in project 2.

**Out of scope here:** the dashboard itself stays consumer-voiced. The professional
artifact is the report, not a mode toggle in the UI. Revisit only if professionals turn out
to want a live surface.

### 7.3 API contract: zod schemas in `packages/shared`

The server currently does `await c.req.json<{url: string, html: string}>()` — a
compile-time cast with no runtime validation — and returns ad-hoc object literals per
route. A separate frontend needs a real contract.

`packages/shared` already declares **zod as a dependency nothing imports.** This project
puts it to work: `packages/shared/src/api/{scan,audit,domain,history}.ts`, each a zod
schema plus its inferred type. The server validates requests at the boundary; the SvelteKit
app imports the inferred types for its API client. One definition, both sides, no drift, no
new dependency, and a dead dependency becomes load-bearing.

This also closes the validation hole found during review: today a malformed body degrades
to a misleading 400 or an opaque 500 rather than a typed validation error.

### 7.4 Rendering strategy

| Route | Strategy | Why |
|---|---|---|
| `/` | SSR | Fast first paint. |
| `/scan/:id` | SSR + hydrate | Results must be linkable and shareable; disclosures then hydrate. |
| `/site/:domain` | SSR | Server data, little interactivity. |
| `/explore` | SSR shell + client filter/sort | Server renders first page; filtering client-side. |
| `/audit` | CSR | Inherently live and stateful. |

SSR is the default; CSR is the exception with a stated reason. SSR also means the result
page works before JavaScript loads — which matters on the older, slower devices this
audience is more likely to be using.

### 7.5 Data flow

```
browser ──HTTP──► SvelteKit (:3000)  ──load()──► Hono API (:9200) ──► SQLite
                       │                                             │
                       └── serves HTML/JS/CSS                        └── Puppeteer engine

browser ──WebSocket──────────────────────────────► Hono (:9200) /trusten/api/jobs/:id/live
```

SvelteKit `load()` calls the Hono API server-side, so the browser never needs CORS for
data. The WebSocket connects to Hono directly; its origin comes from
`PUBLIC_TRUSTEN_API_ORIGIN`, which also removes the hardcoded `localhost:9200` assumption
project 3 must fix in the extension.

**Dev:** Vite `server.proxy` forwards `/trusten/api` → `:9200`, so dev and prod use
identical relative URLs and HMR works normally.

### 7.6 What happens to `apps/server`

- `dashboard/ui.ts` — **deleted** (1,317 lines).
- `dashboard/theme.ts` — **deleted**; contents move to `packages/ui`.
- `dashboard/routes.ts` — HTML page routes removed; keeps `/api/*` and the report asset
  routes. Drops from 519 lines to roughly 300.
- `report.ts` — **untouched this project**, but temporarily imports display tokens from
  `packages/ui` instead of `theme.ts` to avoid a half-migrated state. Project 2 rebuilds it
  on the plain-language layer.
- Engine, analyzers, scoring, db, browser driver — **untouched.**

## 8. Error handling

Error copy follows §2.2 as strictly as the rest of the product.

- **API unreachable from `load()`** — "We couldn't reach the checking service. Try again in
  a moment." with a retry button. Never a stack trace or an error code.
- **Scan not found** — a real 404 through `error(404)`, replacing today's soft "not found"
  card served with a 200.
- **WebSocket drop mid-check** — exponential-backoff reconnect, falling back to polling
  `/api/audit/:jobId`. The user sees "Still checking…", not a transport error; the scan
  continues server-side regardless.
- **Check fails** — the failed step is marked in the timeline in place, in plain words
  ("We couldn't open the basket page"), with detail behind a disclosure. Never a toast that
  vanishes before it can be read — a fixed constraint for this audience.
- **Validation failure** — zod errors return `400` with a field-level body, rendered inline
  next to the field in plain wording.

## 9. Testing

This project introduces the repo's first tests and establishes the pattern.

- **`bun test`** for `packages/shared` API schemas — round-trip parse/reject per schema.
- **`bun test`** for content completeness — every `DarkPatternCategory` member has a
  `packages/ui/content/patterns.ts` entry. Guards §5.3's drift risk.
- **Vitest + `@testing-library/svelte`** for `packages/ui` domain components, targeting the
  ones with real logic: `EvidenceShot` crop maths from `boundingBox`, severity collapsing
  (4 internal → 3 shown), confidence banding (§5.4), grade → headline mapping.
- **Playwright** for two end-to-end journeys against a seeded SQLite fixture: quick check →
  result, and audit → live timeline → result continuity.

  **Caveat, stated precisely:** the README records that Playwright cannot launch under Bun
  — its pipe transport needs inherited file descriptors Bun does not provide, which is why
  the scanner uses Puppeteer. That applies to the *test runner process too*. The Playwright
  suite therefore runs under **Node** (`npx playwright test`), driving the app over HTTP as
  an external client; it never imports application code, so the runtime split costs nothing.
  Verify in step 8 before building the suite out. Fallback: Puppeteer-driven end-to-end
  tests under `bun test` — worse to author, proven in this repo.

- **Accessibility**: `axe-core` assertions in the Playwright journeys, plus a manual 200%
  zoom and keyboard-only pass before the cutover. §2.3 is a requirement, so it is tested.
- **No tests** for pure-presentational components. Testing markup shape is churn.

CI gains a `test` job alongside the existing `code-quality` workflow.

## 10. Sequencing

1. `packages/ui` skeleton — tokens, Tailwind preset, shadcn-svelte init, import-boundary
   lint rule.
2. **Plain-language content layer** (§5) — 25 category entries, severity and grade mappings,
   completeness test. Reviewed as content, not code. *Deliberately early: it is the highest
   product value here and the thing most likely to need a review round.*
3. `packages/shared/api` zod schemas; Hono validates against them. **Old UI still working.**
4. `apps/web` SvelteKit skeleton, adapter-node, Vite proxy, API client, `/explore` end to end.
5. Domain components in `packages/ui` with their tests.
6. Routes `/`, `/site/:domain`, `/scan/:id` — the finding card and `EvidenceShot` are the
   biggest pieces.
7. `/audit` — timeline, WebSocket state model, continuity into the result.
8. Delete `ui.ts` and `theme.ts`; trim `routes.ts`; point `report.ts` at `packages/ui`.
9. Playwright journeys, axe assertions, CI test job.

Steps 1–7 are additive — the existing dashboard keeps working throughout. Step 8 is the
only cutover, once the replacement is complete.

## 11. Risks

| Risk | Mitigation |
|---|---|
| Plain-language rewriting loses accuracy | Analyzer text and legal citations are demoted, never deleted (§5.3). Content is reviewed as content before the UI is built (step 2). |
| Content layer goes stale when a category is added | `bun test` over the enum makes it a build failure (§5.3). |
| `adapter-node` output misbehaves under Bun | Verified in step 4, before UI work. Fallback: run SvelteKit under Node, API stays on Bun — separate processes, so tolerable. |
| Two processes complicate the (absent) deploy story | Accepted; recorded for the deployment project. Single-process option (Hono mounting `handler.js`) stays available. |
| `packages/ui` accidentally depends on SvelteKit | Import-boundary lint rule in step 1, before components exist. |
| Redesign scope expands indefinitely | Five routes, enumerated in §6.1. |
| Playwright cannot run under Bun | Runs under Node as an external HTTP client, verified in step 9. Fallback: Puppeteer E2E under `bun test`. |
| Simplification patronises the user | Plain ≠ dumbed down. Nothing is removed, only demoted behind labelled disclosures; §5.2's `watchFor` field actively teaches. |

## 12. Open questions

**Resolved 2026-08-28 — the professional audience is real.** Trusten will produce two
reports: a consumer report (the main one, in the voice of §2) and a professional report for
regulators, lawyers, and compliance staff. Project 2 builds both; §7.2.1 records the
structure in `packages/ui` that this project must establish so project 2 does not have to
rework it, and the evidentiary requirements the professional report raises.

Two smaller questions to settle during implementation:

- Whether `/explore` needs server-side pagination. Start client-side, revisit past ~2,000 rows.
- Whether the `/site/:domain` sparkline justifies a charting library. One chart does not;
  revisit if more appear.
