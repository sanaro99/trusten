# Trusten SvelteKit Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Trusten's 1,317-line template-string dashboard with a SvelteKit application that speaks plainly to non-technical users, built on a shared component and content layer that the report renderer and browser extension will later reuse.

**Architecture:** Two processes — SvelteKit (`apps/web`, adapter-node run under Bun) serves the UI; the existing Hono server (`apps/server`, port 9200) keeps the JSON API, the WebSocket, and the Puppeteer engine. Shared code lives in two workspace packages: `packages/shared` (domain types + zod API contract) and `packages/ui` (design tokens, plain-language content, Svelte components). The dashboard is rebuilt as five routes in a single-column, plain-language voice.

**Tech Stack:** Bun ≥1.3.6, SvelteKit 2 + Svelte 5 (runes), `@sveltejs/adapter-node`, Tailwind CSS, shadcn-svelte, zod, Hono 4, `bun test`, Vitest + `@testing-library/svelte`, Playwright (under Node).

**Spec:** `docs/superpowers/specs/2026-08-28-sveltekit-dashboard-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

**Voice (spec §2.2) — binding on all user-facing copy:**
- Never show a number the user must interpret. No confidence figures (`0.55`), no `73/100`, no `−15` deductions. Numbers describing *the site's behaviour* are fine ("added £4.99 at the last step").
- Say what happened, then why it is unfair. Concrete first, principle second.
- Blame the site, never the user.
- Roughly 6th–8th grade reading level. Short sentences. Active voice.
- Banned from primary copy: "dark pattern", "analyzer", "heuristic", "confidence", "severity", "deduction", "pattern", "FOMO", "loss aversion", and every research-taxonomy name ("roach motel", "zuckering", "confirmshaming", "drip pricing", "basket sneaking", "bait and switch").

**Accessibility (spec §2.3) — functional requirement, tested:**
- Base body text `18px`. WCAG AA minimum throughout, AAA for body copy.
- Interactive targets at least `44x44px`.
- Nothing hover-only — every action reachable by click, tap, and keyboard.
- Severity and grade never carried by colour alone: colour **plus** word **plus** icon.
- Respect `prefers-reduced-motion`. Usable at 200% browser zoom.

**Code conventions (existing repo):**
- Biome 2.4.8: single quotes, semicolons `asNeeded`, 2-space indent. Run `bunx biome check --write` before committing.
- Conventional Commits enforced by lefthook `commit-msg`. Types: `feat|fix|docs|style|refactor|perf|test|chore|ci|build|revert`.
- Lefthook warns above 400 lines per `.ts`/`.tsx` file. Split rather than suppress.
- Branch: `feat/sveltekit-dashboard` (already created).

**Architectural constraints (spec §7.2):**
- `packages/ui/src/domain/` components take plain props and emit events. **No** `fetch`, **no** stores, **no** `$app/*` imports, **no** browser-only APIs at module scope. This is what lets projects 2 and 3 reuse them.
- Divergence between consumer and professional audiences lives in *composition and copy*, never in a `register` prop threaded through shared components (spec §7.2.1).

**Ports:** Hono API `9200`. SvelteKit dev `5173`, prod `3000`.

---

## File Structure

**New — `packages/shared`** (existing package, gains two directories)
- `src/domain/patterns.ts` — dark-pattern enums, zod schemas, inferred types. Source of truth.
- `src/domain/index.ts` — barrel.
- `src/api/scan.ts`, `audit.ts`, `domain.ts`, `history.ts` — request/response contracts.
- `src/api/index.ts` — barrel.

**New — `packages/ui`**
- `tokens.css` — CSS custom properties (grade, severity, surface, text, border).
- `tailwind-preset.js` — exposes tokens as Tailwind utilities.
- `src/content/severity.ts` — internal 4-level severity → 3 shown levels.
- `src/content/patterns.ts` — 25 plain-language entries. The crown jewels.
- `src/content/grade.ts` — grade → plain headline sentence.
- `src/content/confidence.ts` — confidence band → wording and placement.
- `src/domain/*.svelte` — `SeverityTag`, `GradeBadge`, `EvidenceShot`, `FindingCard`, `JourneyTimeline`, `Disclosure`.

**New — `apps/web`** (SvelteKit)
- `src/lib/api.ts` — typed client over the Hono API.
- `src/routes/+layout.svelte`, `+page.svelte` (home), `explore/`, `scan/[id]/`, `site/[domain]/`, `audit/`.

**Modified — `apps/server`**
- `src/trusten/types/patterns.ts` — re-exports from `@trusten/shared/domain`.
- `src/trusten/dashboard/routes.ts` — HTML routes removed, requests validated.
- `src/trusten/dashboard/ui.ts`, `theme.ts` — deleted at cutover (Task 17).

---

## Task 1: Move dark-pattern domain types to `packages/shared`

Both `packages/ui`'s content layer and `packages/shared`'s API schemas need `DarkPatternCategory`. It currently lives in `apps/server`, which neither package may depend on. The enums move to `shared` and become zod-backed; the server's barrel re-exports them so no call site changes.

**Files:**
- Create: `packages/shared/src/domain/patterns.ts`
- Create: `packages/shared/src/domain/index.ts`
- Create: `packages/shared/src/domain/patterns.test.ts`
- Modify: `packages/shared/package.json` (add `./domain` export)
- Modify: `apps/server/src/trusten/types/patterns.ts` (replace body with re-export)

**Interfaces:**
- Consumes: nothing.
- Produces: `DarkPatternCategory` (enum), `Severity`, `Grade`, `Regulation` (enum), `RegulatoryViolationSchema`, `ElementEvidenceSchema`, `PatternEvidenceSchema`, `DetectedPatternSchema`, and inferred types `RegulatoryViolation`, `ElementEvidence`, `PatternEvidence`, `DetectedPattern`.

- [ ] **Step 1: Read the current source of truth**

Read `apps/server/src/trusten/types/patterns.ts` in full. It defines `DarkPatternCategory` (25 members — the file's own comment says 24 and is wrong), `Severity`, `Regulation`, `RegulatoryViolation`, `ElementEvidence`, `PatternEvidence`, `DetectedPattern`. Copy the enum members **verbatim** — the string values are persisted in SQLite `patterns_json` and must not change.

- [ ] **Step 2: Write the failing test**

Create `packages/shared/src/domain/patterns.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import {
  DarkPatternCategory,
  DetectedPatternSchema,
  SeveritySchema,
} from './patterns'

const validPattern = {
  id: 'p-1',
  category: DarkPatternCategory.FAKE_URGENCY,
  severity: 'critical',
  confidence: 0.87,
  description: 'Urgency language detected.',
  evidence: {},
  regulatoryViolations: [],
  detectedAt: '2026-08-28T10:00:00.000Z',
  url: 'https://example.com/checkout',
  pageTitle: 'Checkout',
}

describe('DetectedPatternSchema', () => {
  test('parses a well-formed pattern', () => {
    const parsed = DetectedPatternSchema.parse(validPattern)
    expect(parsed.category).toBe(DarkPatternCategory.FAKE_URGENCY)
    expect(parsed.confidence).toBe(0.87)
  })

  test('rejects an unknown severity', () => {
    expect(() =>
      DetectedPatternSchema.parse({ ...validPattern, severity: 'apocalyptic' }),
    ).toThrow()
  })

  test('rejects confidence outside 0..1', () => {
    expect(() =>
      DetectedPatternSchema.parse({ ...validPattern, confidence: 1.4 }),
    ).toThrow()
  })

  test('accepts an optional element with a bounding box', () => {
    const parsed = DetectedPatternSchema.parse({
      ...validPattern,
      element: {
        selector: '.countdown',
        text: 'Only 2 left',
        html: '<div>Only 2 left</div>',
        boundingBox: { x: 10, y: 20, width: 300, height: 48 },
      },
    })
    expect(parsed.element?.boundingBox?.width).toBe(300)
  })
})

describe('SeveritySchema', () => {
  test('accepts all four internal levels', () => {
    for (const s of ['critical', 'high', 'medium', 'low']) {
      expect(SeveritySchema.parse(s)).toBe(s)
    }
  })
})

describe('DarkPatternCategory', () => {
  test('has 25 members', () => {
    // Verified against the source enum. Note the original file's comment
    // said "24 total" and was wrong -- trust the count, not the comment.
    expect(Object.keys(DarkPatternCategory)).toHaveLength(25)
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd packages/shared && bun test src/domain/patterns.test.ts`
Expected: FAIL — `Cannot find module './patterns'`.

- [ ] **Step 4: Write the implementation**

Create `packages/shared/src/domain/patterns.ts`. Copy the enums verbatim from the server file, then add schemas:

```ts
/**
 * Trusten — dark-pattern domain types.
 *
 * Source of truth for both the server and the web client. The enum string
 * values are persisted in SQLite (`patterns_json`) — do not change them.
 */
import { z } from 'zod'

export enum DarkPatternCategory {
  // ... all 25 members, copied verbatim from
  // apps/server/src/trusten/types/patterns.ts
}

export enum Regulation {
  // ... copied verbatim
}

export const SeveritySchema = z.enum(['critical', 'high', 'medium', 'low'])
export type Severity = z.infer<typeof SeveritySchema>

export const GradeSchema = z.enum(['A', 'B', 'C', 'D', 'F'])
export type Grade = z.infer<typeof GradeSchema>

export const RegulatoryViolationSchema = z.object({
  regulation: z.nativeEnum(Regulation),
  article: z.string(),
  description: z.string(),
})
export type RegulatoryViolation = z.infer<typeof RegulatoryViolationSchema>

export const BoundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
})
export type BoundingBox = z.infer<typeof BoundingBoxSchema>

export const ElementEvidenceSchema = z.object({
  selector: z.string(),
  text: z.string(),
  html: z.string(),
  boundingBox: BoundingBoxSchema.optional(),
})
export type ElementEvidence = z.infer<typeof ElementEvidenceSchema>

export const PatternEvidenceSchema = z.object({
  screenshot: z.string().optional(),
  screenshotUrl: z.string().optional(),
  domSnapshot: z.string().optional(),
  networkEvidence: z.array(z.string()).optional(),
})
export type PatternEvidence = z.infer<typeof PatternEvidenceSchema>

export const DetectedPatternSchema = z.object({
  id: z.string(),
  category: z.nativeEnum(DarkPatternCategory),
  severity: SeveritySchema,
  confidence: z.number().min(0).max(1),
  description: z.string(),
  element: ElementEvidenceSchema.optional(),
  evidence: PatternEvidenceSchema,
  regulatoryViolations: z.array(RegulatoryViolationSchema),
  detectedAt: z.string(),
  url: z.string(),
  pageTitle: z.string(),
  source: z.enum(['live', 'deep-cache']).optional(),
  cachedAt: z.string().optional(),
})
export type DetectedPattern = z.infer<typeof DetectedPatternSchema>
```

Create `packages/shared/src/domain/index.ts`:

```ts
export * from './patterns'
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd packages/shared && bun test src/domain/patterns.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 6: Add the package export**

In `packages/shared/package.json`, add to `exports`:

```json
"./domain": {
  "types": "./src/domain/index.ts",
  "default": "./src/domain/index.ts"
}
```

- [ ] **Step 7: Re-point the server's types barrel**

Replace the body of `apps/server/src/trusten/types/patterns.ts` with:

```ts
/**
 * Trusten — dark-pattern domain types.
 *
 * Re-exported from @trusten/shared/domain, which is the source of truth so the
 * web client and the server cannot drift. Kept as a module here so existing
 * imports from '../types' continue to work unchanged.
 */
export {
  DarkPatternCategory,
  Regulation,
  type BoundingBox,
  type DetectedPattern,
  type ElementEvidence,
  type Grade,
  type PatternEvidence,
  type RegulatoryViolation,
  type Severity,
} from '@trusten/shared/domain'
```

- [ ] **Step 8: Verify the whole repo still typechecks**

Run: `bun run typecheck`
Expected: both `@trusten/shared` and `@trusten/server` exit 0. If the server reports missing members, a type is still defined only in the old file — move it and re-export.

- [ ] **Step 9: Format and commit**

```bash
bunx biome check --write packages/shared apps/server/src/trusten/types
git add packages/shared apps/server/src/trusten/types/patterns.ts
git commit -m "refactor(types): move dark-pattern domain types to shared, zod-backed"
```

---

## Task 2: `packages/ui` scaffold + severity content

Establishes the package and proves `bun test` runs in it, with the first piece of real content: collapsing four internal severity levels to three shown levels framed by consequence (spec §5.5).

**Files:**
- Create: `packages/ui/package.json`, `packages/ui/tsconfig.json`
- Create: `packages/ui/src/content/severity.ts`
- Create: `packages/ui/src/content/severity.test.ts`

**Interfaces:**
- Consumes: `Severity` from `@trusten/shared/domain` (Task 1).
- Produces: `ShownLevel` (`'serious' | 'worth-knowing' | 'minor'`), `SHOWN_LEVELS: Record<ShownLevel, ShownLevelContent>`, `toShownLevel(severity: Severity): ShownLevel`, `compareSeverity(a: Severity, b: Severity): number`.

- [ ] **Step 1: Create the package manifest**

Create `packages/ui/package.json`:

```json
{
  "name": "@trusten/ui",
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "bun test"
  },
  "dependencies": {
    "@trusten/shared": "workspace:*"
  },
  "exports": {
    "./content": {
      "types": "./src/content/index.ts",
      "default": "./src/content/index.ts"
    },
    "./tokens.css": "./tokens.css",
    "./tailwind-preset": "./tailwind-preset.js"
  }
}
```

Create `packages/ui/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": { "composite": true, "declaration": true },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 2: Write the failing test**

Create `packages/ui/src/content/severity.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { SHOWN_LEVELS, compareSeverity, toShownLevel } from './severity'

describe('toShownLevel', () => {
  test('collapses critical and high to serious', () => {
    expect(toShownLevel('critical')).toBe('serious')
    expect(toShownLevel('high')).toBe('serious')
  })

  test('maps medium to worth-knowing and low to minor', () => {
    expect(toShownLevel('medium')).toBe('worth-knowing')
    expect(toShownLevel('low')).toBe('minor')
  })
})

describe('SHOWN_LEVELS', () => {
  test('every level has a label, an explanation and an icon', () => {
    for (const level of Object.values(SHOWN_LEVELS)) {
      expect(level.label.length).toBeGreaterThan(0)
      expect(level.meaning.length).toBeGreaterThan(0)
      expect(level.icon.length).toBeGreaterThan(0)
    }
  })

  test('never relies on colour alone — each level carries a word', () => {
    // Accessibility constraint: colour + word + icon (spec 2.3)
    for (const level of Object.values(SHOWN_LEVELS)) {
      expect(level.label).not.toMatch(/^#[0-9a-f]{3,8}$/i)
    }
  })

  test('uses no internal jargon in shown copy', () => {
    const banned = /severity|confidence|dark pattern|analyzer/i
    for (const level of Object.values(SHOWN_LEVELS)) {
      expect(level.label).not.toMatch(banned)
      expect(level.meaning).not.toMatch(banned)
    }
  })
})

describe('compareSeverity', () => {
  test('sorts most serious first', () => {
    const sorted = ['low', 'critical', 'medium', 'high'].sort(
      compareSeverity as (a: string, b: string) => number,
    )
    expect(sorted).toEqual(['critical', 'high', 'medium', 'low'])
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd packages/ui && bun test`
Expected: FAIL — `Cannot find module './severity'`.

- [ ] **Step 4: Write the implementation**

Create `packages/ui/src/content/severity.ts`:

```ts
/**
 * Trusten — severity, as the reader sees it.
 *
 * The scanner works in four levels (critical/high/medium/low). Readers get
 * three, framed by what it means for them rather than by an abstract scale:
 * a four-point abstract scale is one distinction more than this audience
 * needs. Colour is never the only carrier — every level has a word and an
 * icon too.
 */
import type { Severity } from '@trusten/shared/domain'

export type ShownLevel = 'serious' | 'worth-knowing' | 'minor'

export interface ShownLevelContent {
  label: string
  meaning: string
  icon: string
  /** CSS custom property name from tokens.css — never a literal colour. */
  colorVar: string
}

export const SHOWN_LEVELS: Record<ShownLevel, ShownLevelContent> = {
  serious: {
    label: 'Serious',
    meaning: 'This could cost you money or give away your personal details.',
    icon: 'alert-triangle',
    colorVar: '--trusten-level-serious',
  },
  'worth-knowing': {
    label: 'Worth knowing',
    meaning: 'This is unfair, but it is unlikely to cost you directly.',
    icon: 'info',
    colorVar: '--trusten-level-worth-knowing',
  },
  minor: {
    label: 'Minor',
    meaning: 'More annoying than harmful.',
    icon: 'dot',
    colorVar: '--trusten-level-minor',
  },
}

const TO_SHOWN: Record<Severity, ShownLevel> = {
  critical: 'serious',
  high: 'serious',
  medium: 'worth-knowing',
  low: 'minor',
}

export function toShownLevel(severity: Severity): ShownLevel {
  return TO_SHOWN[severity]
}

const RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

/** Sort comparator putting the most serious finding first. */
export function compareSeverity(a: Severity, b: Severity): number {
  return RANK[a] - RANK[b]
}
```

Create `packages/ui/src/content/index.ts`:

```ts
export * from './severity'
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd packages/ui && bun test`
Expected: PASS — 6 tests.

- [ ] **Step 6: Add the import-boundary lint rule — before any component exists**

Spec §7.2 makes this structural, not advisory: if `packages/ui/src/domain/` ever imports from SvelteKit, projects 2 and 3 cannot reuse it, and that breakage is silent until someone tries. The rule goes in now, while there is nothing to fix.

Add to `biome.json` under `linter`:

```json
"domains": {},
"rules": {
  "style": {
    "noRestrictedImports": {
      "level": "error",
      "options": {
        "paths": {
          "$app/navigation": "packages/ui must not import SvelteKit — projects 2 and 3 render these components outside it.",
          "$app/stores": "packages/ui must not import SvelteKit — projects 2 and 3 render these components outside it.",
          "$app/environment": "packages/ui must not import SvelteKit — projects 2 and 3 render these components outside it.",
          "$env/static/public": "packages/ui must not import SvelteKit — projects 2 and 3 render these components outside it."
        }
      }
    }
  }
}
```

Scope it to the package with an override so `apps/web` may still import them:

```json
"overrides": [
  {
    "includes": ["**/packages/ui/**"],
    "linter": { "rules": { "style": { "noRestrictedImports": "error" } } }
  },
  {
    "includes": ["**/apps/web/**"],
    "linter": { "rules": { "style": { "noRestrictedImports": "off" } } }
  }
]
```

- [ ] **Step 7: Verify the rule actually fires**

Temporarily add `import { goto } from '$app/navigation'` to `packages/ui/src/content/severity.ts`, then run `bunx biome check packages/ui`.
Expected: an error naming the restricted import. **Remove the line again** and confirm the check passes. A rule that has never been seen to fail is not a rule.

- [ ] **Step 8: Install and verify the workspace link**

Run from the repo root: `bun install`
Expected: `@trusten/ui` appears as a workspace package; `bun run typecheck` still exits 0.

- [ ] **Step 9: Format and commit**

```bash
bunx biome check --write packages/ui
git add packages/ui biome.json
git commit -m "feat(ui): add @trusten/ui package with severity content layer"
```

---

## Task 3: Plain-language pattern content — all 25 categories

The highest-value deliverable in this project. Reviewed as content, not code (spec §10, step 2).

**Files:**
- Create: `packages/ui/src/content/patterns.ts`
- Create: `packages/ui/src/content/patterns.test.ts`
- Modify: `packages/ui/src/content/index.ts`

**Interfaces:**
- Consumes: `DarkPatternCategory` from `@trusten/shared/domain`.
- Produces: `PatternContent` interface, `PATTERN_CONTENT: Record<DarkPatternCategory, PatternContent>`, `getPatternContent(category: DarkPatternCategory): PatternContent`.

- [ ] **Step 1: Write the failing test**

Create `packages/ui/src/content/patterns.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { DarkPatternCategory } from '@trusten/shared/domain'
import { PATTERN_CONTENT, getPatternContent } from './patterns'

// Jargon that must never reach a reader (spec 2.2). Includes our own
// vocabulary and the research taxonomy the enum names come from.
const BANNED = [
  'dark pattern',
  'analyzer',
  'heuristic',
  'confidence',
  'severity',
  'deduction',
  'fomo',
  'loss aversion',
  'zuckering',
  'roach motel',
  'confirmshaming',
  'drip pricing',
  'basket sneaking',
  'bait and switch',
  'dark consent',
]

describe('PATTERN_CONTENT', () => {
  test('covers every DarkPatternCategory', () => {
    const missing = Object.values(DarkPatternCategory).filter(
      (c) => !PATTERN_CONTENT[c],
    )
    expect(missing).toEqual([])
  })

  test('every entry fills all five fields', () => {
    for (const [category, content] of Object.entries(PATTERN_CONTENT)) {
      for (const field of ['name', 'what', 'why', 'watchFor', 'lawPlain']) {
        const value = content[field as keyof typeof content]
        expect(
          typeof value === 'string' && value.trim().length > 0,
          `${category}.${field} is empty`,
        ).toBe(true)
      }
    }
  })

  test('uses no jargon anywhere in reader-facing copy', () => {
    for (const [category, content] of Object.entries(PATTERN_CONTENT)) {
      const blob = Object.values(content).join(' ').toLowerCase()
      for (const word of BANNED) {
        expect(blob.includes(word), `${category} contains "${word}"`).toBe(false)
      }
    }
  })

  test('keeps sentences short enough to read easily', () => {
    // Rough readability guard: no sentence over 25 words.
    for (const [category, content] of Object.entries(PATTERN_CONTENT)) {
      for (const sentence of `${content.what} ${content.why}`.split(/[.!?]+/)) {
        const words = sentence.trim().split(/\s+/).filter(Boolean)
        expect(
          words.length <= 25,
          `${category} has a ${words.length}-word sentence`,
        ).toBe(true)
      }
    }
  })

  test('names do not reuse the enum key', () => {
    // "Fake Urgency" prettified from fake_urgency is not a translation.
    for (const [category, content] of Object.entries(PATTERN_CONTENT)) {
      const prettified = category.replace(/_/g, ' ')
      expect(content.name.toLowerCase()).not.toBe(prettified)
    }
  })
})

describe('getPatternContent', () => {
  test('returns the entry for a known category', () => {
    const content = getPatternContent(DarkPatternCategory.FAKE_URGENCY)
    expect(content.name).toBe('A fake deadline')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/ui && bun test src/content/patterns.test.ts`
Expected: FAIL — `Cannot find module './patterns'`.

- [ ] **Step 3: Write the content**

Create `packages/ui/src/content/patterns.ts`. Write **all 25** entries — 8 are given below as specimens, and the remaining 17 are named beneath them. Complete every one in the same voice, checking each against the Global Constraints. (The enum has 25 members; the source file's own comment claiming 24 is wrong.)

```ts
/**
 * Trusten — what each finding means, in plain words.
 *
 * The scanner names findings using the Brignull/Mathur research taxonomy
 * ("roach motel", "confirmshaming"). Those names are correct and useless to
 * the people this product is for. This file is the translation layer, and it
 * is content: review it as writing, not as code.
 *
 * Fields, each with a job:
 *   name      what to call it
 *   what      what the site did
 *   why       why that is unfair to you
 *   watchFor  how to spot it yourself next time
 *   lawPlain  the legal position, one sentence, no citation
 */
import { DarkPatternCategory } from '@trusten/shared/domain'

export interface PatternContent {
  name: string
  what: string
  why: string
  watchFor: string
  lawPlain: string
}

export const PATTERN_CONTENT: Record<DarkPatternCategory, PatternContent> = {
  [DarkPatternCategory.FAKE_URGENCY]: {
    name: 'A fake deadline',
    what: 'This shop used a countdown or a "hurry" message to rush you.',
    why: 'The deadline often is not real. It is there to stop you comparing prices or thinking it over.',
    watchFor: 'Timers that start again when you reload the page.',
    lawPlain:
      'In the EU and the US, inventing a fake deadline to hurry a shopper is against the law.',
  },

  [DarkPatternCategory.FAKE_SCARCITY]: {
    name: "Pretending it's nearly sold out",
    what: 'This shop said only a few items were left.',
    why: 'Shops often show this whether it is true or not, so you buy before checking elsewhere.',
    watchFor: 'A "only 2 left" message that says the same thing days later.',
    lawPlain:
      'Claiming something is nearly gone when it is not is illegal in the EU, the UK and the US.',
  },

  [DarkPatternCategory.CONFIRMSHAMING]: {
    name: 'Guilt-tripping you for saying no',
    what: 'The button to say no was worded to make you feel bad.',
    why: 'Wording like "No thanks, I don\'t like saving money" is designed to embarrass you into agreeing.',
    watchFor: 'A "no" option that sounds like an insult to yourself.',
    lawPlain:
      'EU rules ban website designs that pressure or manipulate people into choices.',
  },

  [DarkPatternCategory.ROACH_MOTEL]: {
    name: 'Easy to join, hard to leave',
    what: 'Signing up took moments, but leaving is buried or missing.',
    why: 'Making the exit hard to find keeps you paying for longer than you meant to.',
    watchFor: 'No "cancel" link anywhere in your account settings.',
    lawPlain:
      'US and EU rules say cancelling must be as easy as signing up was.',
  },

  [DarkPatternCategory.HARD_TO_CANCEL]: {
    name: 'Making it hard to cancel',
    what: 'Cancelling needs a phone call, an email, or several extra steps.',
    why: 'Every extra step is there hoping you give up and keep paying.',
    watchFor: 'Being told to ring a number when you signed up in one click.',
    lawPlain:
      'US rules require a simple way to cancel anything you signed up for online.',
  },

  [DarkPatternCategory.DRIP_PRICING]: {
    name: 'Extra costs added at the last step',
    what: 'The price went up with fees that were not shown at the start.',
    why: 'By the time the real price appears you have already spent time and are more likely to accept it.',
    watchFor: 'A total at checkout higher than the price you first saw.',
    lawPlain:
      'The EU and the US require the full price, including unavoidable fees, to be shown up front.',
  },

  [DarkPatternCategory.PRESELECTED_OPTIONS]: {
    name: 'Boxes already ticked for you',
    what: 'This site ticked boxes on your behalf before you chose anything.',
    why: 'Most people never untick them, so the site gets an agreement you never actually gave.',
    watchFor: 'Ticked boxes for extras, insurance, or marketing emails.',
    lawPlain:
      'EU law says agreement must be an active choice, so pre-ticked boxes do not count as consent.',
  },

  [DarkPatternCategory.PRIVACY_ZUCKERING]: {
    name: 'Sharing your details without telling you clearly',
    what: 'This site passes your personal information to other companies.',
    why: 'It is mentioned somewhere in the small print, where almost nobody reads it.',
    watchFor: 'Long terms pages that mention "partners" or "third parties".',
    lawPlain:
      'EU privacy law requires sites to tell you clearly who gets your information and why.',
  },

  // ... complete the remaining 17 entries in the same voice:
  //   FAKE_SOCIAL_PROOF, TRICK_WORDING, VISUAL_INTERFERENCE, BASKET_SNEAKING,
  //   BAIT_AND_SWITCH, FORCED_CONTINUITY, FORCED_REGISTRATION, FORCED_SHARING,
  //   GAMIFICATION_PRESSURE, HIDDEN_DEFAULTS, REPEATED_PROMPTS, DISGUISED_ADS,
  //   COMPARISON_PREVENTION, INFORMATION_HIDING, COOKIE_WALL, DARK_CONSENT,
  //   FAKE_HIERARCHY
  //
  // Suggested names, to keep the voice consistent:
  //   FAKE_SOCIAL_PROOF    "Made-up numbers of other shoppers"
  //   TRICK_WORDING        "Wording designed to confuse you"
  //   VISUAL_INTERFERENCE  "Important words hidden in the design"
  //   BASKET_SNEAKING      "Something added to your basket you didn't pick"
  //   BAIT_AND_SWITCH      "Offering one thing, then giving another"
  //   FORCED_CONTINUITY    "A free trial that quietly starts charging"
  //   FORCED_REGISTRATION  "Made to create an account for no good reason"
  //   FORCED_SHARING       "Made to share your contacts or profile"
  //   GAMIFICATION_PRESSURE "Streaks and rewards used to keep you coming back"
  //   HIDDEN_DEFAULTS      "Settings quietly chosen for you"
  //   REPEATED_PROMPTS     "Asked again and again until you agree"
  //   DISGUISED_ADS        "Adverts made to look like normal content"
  //   COMPARISON_PREVENTION "Made hard to compare with other options"
  //   INFORMATION_HIDING   "Important details kept out of sight"
  //   COOKIE_WALL          "You can't use the site unless you accept tracking"
  //   DARK_CONSENT         "An agreement box designed to be confusing"
  //   FAKE_HIERARCHY       "The 'yes' button made obvious, the 'no' button hidden"
}

export function getPatternContent(
  category: DarkPatternCategory,
): PatternContent {
  return PATTERN_CONTENT[category]
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/ui && bun test src/content/patterns.test.ts`
Expected: PASS — 6 tests. The coverage test names any category still missing; the jargon test names the offending word and category.

- [ ] **Step 5: Export from the content barrel**

Add to `packages/ui/src/content/index.ts`:

```ts
export * from './patterns'
```

- [ ] **Step 6: Read the whole file aloud as a final check**

Not a mechanical step, and the reason this task exists. Read every `what` and `why` as though to someone who has never heard the phrase "dark pattern". Anything that needs a second reading gets rewritten.

- [ ] **Step 7: Format and commit**

```bash
bunx biome check --write packages/ui
git add packages/ui/src/content
git commit -m "feat(ui): add plain-language content for all 25 pattern categories"
```

---

## Task 4: Grade and confidence content

Turns the grade into a headline sentence (spec §5.6) and confidence into wording and placement rather than a number (spec §5.4).

**Files:**
- Create: `packages/ui/src/content/grade.ts`, `packages/ui/src/content/grade.test.ts`
- Create: `packages/ui/src/content/confidence.ts`, `packages/ui/src/content/confidence.test.ts`
- Modify: `packages/ui/src/content/index.ts`

**Interfaces:**
- Consumes: `Grade` from `@trusten/shared/domain`.
- Produces: `gradeHeadline(grade: Grade, findingCount: number): { headline: string; sub: string }`; `ConfidenceBand` (`'stated' | 'hedged' | 'aside'`), `toConfidenceBand(confidence: number): ConfidenceBand`, `CONFIDENCE_PREFIX: Record<ConfidenceBand, string>`.

- [ ] **Step 1: Write the failing tests**

Create `packages/ui/src/content/grade.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { gradeHeadline } from './grade'

describe('gradeHeadline', () => {
  test('gives a plain sentence, never a score', () => {
    const { headline, sub } = gradeHeadline('D', 4)
    expect(headline).toBe('This shop uses several unfair tricks')
    expect(sub).toContain('4 things')
    expect(`${headline} ${sub}`).not.toMatch(/\d+\s*\/\s*100|score/i)
  })

  test('reassures plainly when nothing was found', () => {
    const { headline, sub } = gradeHeadline('A', 0)
    expect(headline).toMatch(/fair|nothing|clean/i)
    expect(sub).not.toMatch(/0 things/)
  })

  test('uses singular wording for a single finding', () => {
    expect(gradeHeadline('B', 1).sub).toContain('1 thing you should know')
  })

  test('covers every grade', () => {
    for (const g of ['A', 'B', 'C', 'D', 'F'] as const) {
      expect(gradeHeadline(g, 2).headline.length).toBeGreaterThan(0)
    }
  })
})
```

Create `packages/ui/src/content/confidence.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { CONFIDENCE_PREFIX, toConfidenceBand } from './confidence'

describe('toConfidenceBand', () => {
  test('states findings we are sure about', () => {
    expect(toConfidenceBand(0.9)).toBe('stated')
    expect(toConfidenceBand(0.8)).toBe('stated')
  })

  test('hedges the middle band', () => {
    expect(toConfidenceBand(0.75)).toBe('hedged')
    expect(toConfidenceBand(0.7)).toBe('hedged')
  })

  test('moves weak findings aside', () => {
    expect(toConfidenceBand(0.69)).toBe('aside')
    expect(toConfidenceBand(0.55)).toBe('aside')
  })
})

describe('CONFIDENCE_PREFIX', () => {
  test('never contains a number', () => {
    for (const prefix of Object.values(CONFIDENCE_PREFIX)) {
      expect(prefix).not.toMatch(/\d/)
    }
  })

  test('reads as plain English', () => {
    expect(CONFIDENCE_PREFIX.stated).toBe('We found')
    expect(CONFIDENCE_PREFIX.hedged).toBe('This looks like')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/ui && bun test src/content/grade.test.ts src/content/confidence.test.ts`
Expected: FAIL — both modules missing.

- [ ] **Step 3: Write the implementations**

Create `packages/ui/src/content/grade.ts`:

```ts
/**
 * Trusten — the grade, as a sentence.
 *
 * The A-F letter stays (school grades are one scale this audience reads
 * fluently) but it is not the headline. The headline is a plain sentence,
 * and the 0-100 score never appears on a reader-facing surface.
 */
import type { Grade } from '@trusten/shared/domain'

const HEADLINES: Record<Grade, string> = {
  A: 'This shop looks fair',
  B: 'This shop is mostly fair',
  C: 'This shop uses some unfair tricks',
  D: 'This shop uses several unfair tricks',
  F: 'Be careful with this shop',
}

export function gradeHeadline(
  grade: Grade,
  findingCount: number,
): { headline: string; sub: string } {
  const headline = HEADLINES[grade]

  if (findingCount === 0) {
    return {
      headline,
      sub: 'We did not find anything to worry about.',
    }
  }

  const noun = findingCount === 1 ? 'thing' : 'things'
  return {
    headline,
    sub: `We found ${findingCount} ${noun} you should know about.`,
  }
}
```

Create `packages/ui/src/content/confidence.ts`:

```ts
/**
 * Trusten — how sure we are, without saying a number.
 *
 * The scanner produces a 0-1 confidence. Showing "0.55" to someone who came
 * here to find out whether a shop is honest tells them nothing and costs them
 * trust. Confidence becomes wording and placement instead.
 *
 * Nothing is hidden: weak findings still appear, collected under a heading
 * the reader can open.
 */
export type ConfidenceBand = 'stated' | 'hedged' | 'aside'

export const CONFIDENCE_PREFIX: Record<ConfidenceBand, string> = {
  stated: 'We found',
  hedged: 'This looks like',
  aside: 'This might be',
}

export function toConfidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= 0.8) return 'stated'
  if (confidence >= 0.7) return 'hedged'
  return 'aside'
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/ui && bun test`
Expected: PASS — all content tests green.

- [ ] **Step 5: Export and commit**

Add both to `packages/ui/src/content/index.ts`, then:

```bash
bunx biome check --write packages/ui
git add packages/ui/src/content
git commit -m "feat(ui): express grade as a sentence and confidence as wording"
```

---

## Task 5: Design tokens and Tailwind preset

**Files:**
- Create: `packages/ui/tokens.css`
- Create: `packages/ui/tailwind-preset.js`

**Interfaces:**
- Produces: CSS custom properties consumed by every component; a Tailwind preset exposing them as utilities (`bg-surface`, `text-serious`, `text-grade-d`).

- [ ] **Step 1: Read the colours being replaced**

Read `apps/server/src/trusten/dashboard/theme.ts`. `GRADE_COLOR` and `SEVERITY_COLOR` are the values to carry over. `CATEGORY_LABELS` is superseded by Task 3 and does **not** move.

- [ ] **Step 2: Write the tokens**

Create `packages/ui/tokens.css`. Contrast is a requirement, not a preference — every text/background pair must reach WCAG AA, and body text AAA.

```css
/**
 * Trusten design tokens.
 *
 * Single source of truth for colour, type and spacing across the dashboard,
 * the PDF report and the extension. Replaces the 135 literal hex values that
 * used to live in dashboard/ui.ts.
 */
:root {
  /* Brand */
  --trusten-purple: #6d28d9;
  --trusten-purple-strong: #5b21b6;

  /* Grade — carried over from dashboard/theme.ts */
  --trusten-grade-a: #15803d;
  --trusten-grade-b: #4d7c0f;
  --trusten-grade-c: #a16207;
  --trusten-grade-d: #c2410c;
  --trusten-grade-f: #b91c1c;

  /* Shown levels (see src/content/severity.ts) */
  --trusten-level-serious: #b91c1c;
  --trusten-level-worth-knowing: #a16207;
  --trusten-level-minor: #15803d;

  /* Surfaces and text */
  --trusten-bg: #ffffff;
  --trusten-surface: #f8f7fb;
  --trusten-border: #e4e1ec;
  --trusten-text: #1c1a22;
  --trusten-text-muted: #55505f;

  /* Type — 18px base is a requirement for this audience, not a preference */
  --trusten-text-base: 1.125rem;
  --trusten-line-height: 1.7;
  --trusten-measure: 68ch;

  /* Minimum interactive target */
  --trusten-target-min: 44px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --trusten-bg: #131118;
    --trusten-surface: #1c1a22;
    --trusten-border: #322d3d;
    --trusten-text: #f4f2f8;
    --trusten-text-muted: #b3aec0;

    --trusten-grade-a: #4ade80;
    --trusten-grade-b: #a3e635;
    --trusten-grade-c: #fbbf24;
    --trusten-grade-d: #fb923c;
    --trusten-grade-f: #f87171;

    --trusten-level-serious: #f87171;
    --trusten-level-worth-knowing: #fbbf24;
    --trusten-level-minor: #4ade80;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 3: Write the Tailwind preset**

Create `packages/ui/tailwind-preset.js`:

```js
/**
 * Tailwind preset exposing Trusten's design tokens as utilities, so no
 * component ever writes a literal colour.
 */
export default {
  theme: {
    extend: {
      colors: {
        purple: 'var(--trusten-purple)',
        'purple-strong': 'var(--trusten-purple-strong)',
        bg: 'var(--trusten-bg)',
        surface: 'var(--trusten-surface)',
        border: 'var(--trusten-border)',
        text: 'var(--trusten-text)',
        'text-muted': 'var(--trusten-text-muted)',
        serious: 'var(--trusten-level-serious)',
        'worth-knowing': 'var(--trusten-level-worth-knowing)',
        minor: 'var(--trusten-level-minor)',
        'grade-a': 'var(--trusten-grade-a)',
        'grade-b': 'var(--trusten-grade-b)',
        'grade-c': 'var(--trusten-grade-c)',
        'grade-d': 'var(--trusten-grade-d)',
        'grade-f': 'var(--trusten-grade-f)',
      },
      fontSize: {
        base: ['var(--trusten-text-base)', 'var(--trusten-line-height)'],
      },
      maxWidth: {
        measure: 'var(--trusten-measure)',
      },
      minHeight: {
        target: 'var(--trusten-target-min)',
      },
      minWidth: {
        target: 'var(--trusten-target-min)',
      },
    },
  },
}
```

- [ ] **Step 4: Commit**

```bash
bunx biome check --write packages/ui
git add packages/ui/tokens.css packages/ui/tailwind-preset.js
git commit -m "feat(ui): add design tokens and Tailwind preset"
```

---

## Task 6: API contract schemas in `packages/shared`

Replaces the ad-hoc response shapes and the `c.req.json<T>()` casts with one definition used by both sides (spec §7.3).

**Files:**
- Create: `packages/shared/src/api/scan.ts`, `audit.ts`, `domain.ts`, `history.ts`, `index.ts`
- Create: `packages/shared/src/api/api.test.ts`
- Modify: `packages/shared/package.json` (add `./api` export)

**Interfaces:**
- Consumes: `DetectedPatternSchema`, `GradeSchema` from `../domain`.
- Produces: `QuickScanRequestSchema`, `QuickScanResponseSchema`, `AnalyzePageRequestSchema`, `AuditRequestSchema`, `AuditStartResponseSchema`, `AuditStatusSchema`, `ScanDetailSchema`, `DomainSummarySchema`, `GlobalStatsSchema`, `HistoryResponseSchema`, plus inferred types of the same names without `Schema`.

- [ ] **Step 1: Read the shapes being formalised**

Read `apps/server/src/trusten/dashboard/routes.ts` lines 205–395 and the `DomainSummary`, `GlobalStats`, `AuditJob`, `AuditPlanItem` interfaces in `apps/server/src/trusten/db.ts` lines 7–66. The schemas must describe what the server **already returns** — this task changes no response shape.

- [ ] **Step 2: Write the failing test**

Create `packages/shared/src/api/api.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { AuditRequestSchema, QuickScanRequestSchema } from './audit'
import { AnalyzePageRequestSchema } from './scan'

describe('QuickScanRequestSchema', () => {
  test('accepts a url', () => {
    expect(QuickScanRequestSchema.parse({ url: 'https://example.com' }).url).toBe(
      'https://example.com',
    )
  })

  test('rejects a missing url', () => {
    expect(() => QuickScanRequestSchema.parse({})).toThrow()
  })

  test('rejects a non-string url — the hole the old cast left open', () => {
    expect(() => QuickScanRequestSchema.parse({ url: 42 })).toThrow()
  })

  test('trims surrounding whitespace', () => {
    expect(
      QuickScanRequestSchema.parse({ url: '  https://example.com  ' }).url,
    ).toBe('https://example.com')
  })
})

describe('AuditRequestSchema', () => {
  test('defaults mode to fixed and watch to false', () => {
    const parsed = AuditRequestSchema.parse({ url: 'https://example.com' })
    expect(parsed.mode).toBe('fixed')
    expect(parsed.watch).toBe(false)
  })

  test('rejects an unknown mode', () => {
    expect(() =>
      AuditRequestSchema.parse({ url: 'https://example.com', mode: 'psychic' }),
    ).toThrow()
  })
})

describe('AnalyzePageRequestSchema', () => {
  test('requires url and html', () => {
    expect(() =>
      AnalyzePageRequestSchema.parse({ url: 'https://example.com' }),
    ).toThrow()
  })

  test('defaults optional text fields to empty strings', () => {
    const parsed = AnalyzePageRequestSchema.parse({
      url: 'https://example.com',
      html: '<html></html>',
    })
    expect(parsed.text).toBe('')
    expect(parsed.pageTitle).toBe('')
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd packages/shared && bun test src/api/api.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 4: Write the schemas**

Create `packages/shared/src/api/scan.ts`:

```ts
/**
 * Trusten API — scan endpoints.
 *
 * One definition, validated by the server and used for types by the web
 * client, so the two cannot drift.
 */
import { z } from 'zod'
import { DetectedPatternSchema, GradeSchema } from '../domain'

const trimmedUrl = z.string().trim().min(1, 'url is required')

export const AnalyzePageRequestSchema = z.object({
  url: trimmedUrl,
  html: z.string().min(1, 'html is required'),
  text: z.string().default(''),
  pageTitle: z.string().default(''),
})
export type AnalyzePageRequest = z.infer<typeof AnalyzePageRequestSchema>

export const CategoryScoreSchema = z.object({
  count: z.number(),
  severity: z.string(),
  score: z.number(),
})

export const ScanScoreSchema = z.object({
  numeric: z.number(),
  grade: GradeSchema,
  summary: z.string(),
  categoryBreakdown: z.record(z.string(), CategoryScoreSchema),
})

export const ScanDetailSchema = z.object({
  id: z.string(),
  url: z.string(),
  domain: z.string(),
  scanType: z.string(),
  startedAt: z.string(),
  completedAt: z.string(),
  patterns: z.array(DetectedPatternSchema),
  score: ScanScoreSchema,
  pdfPath: z.string().optional(),
  htmlPath: z.string().optional(),
  videoPath: z.string().optional(),
})
export type ScanDetail = z.infer<typeof ScanDetailSchema>
```

Create `packages/shared/src/api/audit.ts`:

```ts
import { z } from 'zod'

const trimmedUrl = z.string().trim().min(1, 'url is required')

export const QuickScanRequestSchema = z.object({ url: trimmedUrl })
export type QuickScanRequest = z.infer<typeof QuickScanRequestSchema>

export const AuditRequestSchema = z.object({
  url: trimmedUrl,
  workflows: z.array(z.string()).optional(),
  watch: z.boolean().default(false),
  mode: z.enum(['fixed', 'discover']).default('fixed'),
})
export type AuditRequest = z.infer<typeof AuditRequestSchema>

export const AuditStartResponseSchema = z.object({
  jobId: z.string(),
  domain: z.string(),
})
export type AuditStartResponse = z.infer<typeof AuditStartResponseSchema>

export const AuditPlanItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  steps: z.number(),
})

export const AuditStatusSchema = z.object({
  jobId: z.string(),
  status: z.enum(['pending', 'running', 'done', 'failed']),
  domain: z.string(),
  workflows: z.array(z.string()),
  completedWorkflows: z.array(z.string()),
  currentStep: z.string(),
  scanIds: z.array(z.string()),
  error: z.string().nullable(),
  plan: z.array(AuditPlanItemSchema),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
})
export type AuditStatus = z.infer<typeof AuditStatusSchema>

/** Events pushed over the live WebSocket — mirrors live/hub.ts LiveEvent. */
export const LiveEventSchema = z.object({
  type: z.enum(['frame', 'progress', 'done', 'error']),
  data: z.string().optional(),
  step: z.number().optional(),
  total: z.number().optional(),
  url: z.string().optional(),
  action: z.string().optional(),
  patternCount: z.number().optional(),
  grade: z.string().optional(),
  message: z.string().optional(),
})
export type LiveEvent = z.infer<typeof LiveEventSchema>
```

Create `packages/shared/src/api/domain.ts`:

```ts
import { z } from 'zod'

export const DomainSummarySchema = z.object({
  domain: z.string(),
  scanCount: z.number(),
  latestGrade: z.string(),
  latestScore: z.number(),
  latestScanAt: z.string(),
  avgScore: z.number(),
  totalPatterns: z.number(),
  criticalCount: z.number(),
  highCount: z.number(),
})
export type DomainSummary = z.infer<typeof DomainSummarySchema>

export const GlobalStatsSchema = z.object({
  totalScans: z.number(),
  totalDomains: z.number(),
  totalPatterns: z.number(),
  avgScore: z.number(),
  cleanSites: z.number(),
  dirtySites: z.number(),
})
export type GlobalStats = z.infer<typeof GlobalStatsSchema>
```

Create `packages/shared/src/api/history.ts`:

```ts
import { z } from 'zod'

export const ScanHistoryRowSchema = z.object({
  id: z.string(),
  url: z.string(),
  domain: z.string(),
  scanType: z.string(),
  workflowId: z.string().nullable(),
  startedAt: z.string(),
  completedAt: z.string(),
  scoreNumeric: z.number(),
  scoreGrade: z.string(),
  patternCount: z.number(),
  criticalCount: z.number(),
  highCount: z.number(),
  pdfPath: z.string().nullable(),
  htmlPath: z.string().nullable(),
  createdAt: z.string(),
})
export type ScanHistoryRow = z.infer<typeof ScanHistoryRowSchema>

export const HistoryResponseSchema = z.object({
  scans: z.array(ScanHistoryRowSchema),
  total: z.number(),
})
export type HistoryResponse = z.infer<typeof HistoryResponseSchema>
```

Create `packages/shared/src/api/index.ts`:

```ts
export * from './audit'
export * from './domain'
export * from './history'
export * from './scan'
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd packages/shared && bun test`
Expected: PASS — all schema tests green.

- [ ] **Step 6: Add the package export**

In `packages/shared/package.json`, add:

```json
"./api": {
  "types": "./src/api/index.ts",
  "default": "./src/api/index.ts"
}
```

- [ ] **Step 7: Commit**

```bash
bunx biome check --write packages/shared
git add packages/shared
git commit -m "feat(shared): add zod API contract schemas"
```

---

## Task 7: Validate requests in the Hono server

Replaces the three `c.req.json<T>()` casts with real validation, returning a field-level 400 instead of a misleading "Invalid JSON body" or an opaque 500.

**Files:**
- Modify: `apps/server/src/trusten/dashboard/routes.ts` (the `/api/analyze-page`, `/api/quick-scan`, `/api/audit` handlers)
- Create: `apps/server/src/trusten/dashboard/validate.ts`
- Create: `apps/server/src/trusten/dashboard/validate.test.ts`

**Interfaces:**
- Consumes: schemas from `@trusten/shared/api`.
- Produces: `parseBody<T>(c: Context, schema: ZodSchema<T>): Promise<{ ok: true; data: T } | { ok: false; response: Response }>`.

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/trusten/dashboard/validate.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { QuickScanRequestSchema } from '@trusten/shared/api'
import { formatZodError } from './validate'

describe('formatZodError', () => {
  test('names the offending field', () => {
    const result = QuickScanRequestSchema.safeParse({ url: '' })
    expect(result.success).toBe(false)
    if (result.success) return

    const body = formatZodError(result.error)
    expect(body.error).toBe('Invalid request')
    expect(body.fields.url).toBe('url is required')
  })

  test('reports several bad fields at once', () => {
    const schema = QuickScanRequestSchema
    const result = schema.safeParse({ url: 42 })
    expect(result.success).toBe(false)
    if (result.success) return

    const body = formatZodError(result.error)
    expect(Object.keys(body.fields)).toContain('url')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/server && bun test src/trusten/dashboard/validate.test.ts`
Expected: FAIL — `Cannot find module './validate'`.

- [ ] **Step 3: Write the helper**

Create `apps/server/src/trusten/dashboard/validate.ts`:

```ts
/**
 * Trusten — request validation at the HTTP boundary.
 *
 * Replaces `c.req.json<T>()`, which is a compile-time cast and checks nothing
 * at run time. Errors come back field-by-field so the client can render them
 * next to the input that caused them.
 */
import type { Context } from 'hono'
import type { ZodError, ZodType } from 'zod'

export interface ValidationErrorBody {
  error: string
  fields: Record<string, string>
}

export function formatZodError(error: ZodError): ValidationErrorBody {
  const fields: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_'
    if (!fields[key]) fields[key] = issue.message
  }
  return { error: 'Invalid request', fields }
}

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; body: ValidationErrorBody }

/** Parse and validate a JSON body. Never throws. */
export async function parseBody<T>(
  c: Context,
  schema: ZodType<T>,
): Promise<ParseResult<T>> {
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    return {
      ok: false,
      body: { error: 'Invalid request', fields: { _: 'Body must be JSON' } },
    }
  }

  const result = schema.safeParse(raw)
  if (!result.success) return { ok: false, body: formatZodError(result.error) }
  return { ok: true, data: result.data }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/server && bun test src/trusten/dashboard/validate.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 5: Rewrite the three handlers**

In `routes.ts`, replace the `/api/quick-scan` body block:

```ts
app.post('/api/quick-scan', async (c) => {
  const parsed = await parseBody(c, QuickScanRequestSchema)
  if (!parsed.ok) return c.json(parsed.body, 400)
  const { url } = parsed.data

  const qsDomain = parseHostname(url)
  if (!qsDomain) return c.json({ error: 'Invalid URL' }, 400)
  // ... rest of the handler unchanged
})
```

Apply the same shape to `/api/analyze-page` (`AnalyzePageRequestSchema`) and `/api/audit` (`AuditRequestSchema`). In the audit handler, `workflows` now defaults through the schema, so replace `body.workflows ?? Object.keys(WORKFLOW_REGISTRY)` with `parsed.data.workflows ?? Object.keys(WORKFLOW_REGISTRY)`. Delete the now-dead `try/catch` blocks and their `let` declarations.

- [ ] **Step 6: Verify the server still starts and the old dashboard still works**

Run: `bun run start`
Then, in another terminal:

```bash
curl -s -X POST localhost:9200/trusten/api/quick-scan \
  -H 'Content-Type: application/json' -d '{"url": 42}'
```

Expected: `400` with `{"error":"Invalid request","fields":{"url":"..."}}` — not "Invalid JSON body".
Visit `http://localhost:9200/trusten` and confirm the existing dashboard still renders. Stop the server.

- [ ] **Step 7: Commit**

```bash
bunx biome check --write apps/server
git add apps/server/src/trusten/dashboard
git commit -m "feat(server): validate request bodies against shared zod schemas"
```

---

## Task 8: `apps/web` SvelteKit skeleton

Scaffolds the app, wires Tailwind to the shared preset, proves the Vite proxy reaches the Hono API, and verifies `adapter-node` runs under Bun — the risk flagged in spec §11, checked before any UI is built on it.

**Files:**
- Create: `apps/web/` (SvelteKit scaffold), `svelte.config.js`, `vite.config.ts`, `tailwind.config.js`
- Create: `apps/web/src/lib/api.ts`
- Create: `apps/web/src/routes/+layout.svelte`, `+page.svelte`
- Modify: root `package.json` (scripts)

**Interfaces:**
- Consumes: `@trusten/shared/api` types, `@trusten/ui/tokens.css`, `@trusten/ui/tailwind-preset`.
- Produces: `api.getStats()`, `api.getHistory(limit)`, `api.getScan(id)`, `api.getDomain(domain)`, `api.startAudit(req)`, `api.getAuditStatus(jobId)`, `api.quickScan(req)` — all returning parsed, typed data.

- [ ] **Step 1: Scaffold the app**

```bash
cd apps
bunx sv create web --template minimal --types ts --no-add-ons
cd web
bun add -d @sveltejs/adapter-node tailwindcss @tailwindcss/vite
bun add @trusten/shared@workspace:* @trusten/ui@workspace:*
```

Set `"name": "@trusten/web"` in `apps/web/package.json`.

- [ ] **Step 2: Configure the adapter and the dev proxy**

`apps/web/svelte.config.js`:

```js
import adapter from '@sveltejs/adapter-node'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

export default {
  preprocess: vitePreprocess(),
  kit: { adapter: adapter({ out: 'build' }) },
}
```

`apps/web/vite.config.ts`:

```ts
import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const API_ORIGIN = process.env.TRUSTEN_API_ORIGIN ?? 'http://localhost:9200'

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  server: {
    port: 5173,
    proxy: {
      // `ws: true` matters: the live scan view upgrades to a WebSocket on this
      // same path prefix, and without it the upgrade is dropped in dev.
      // Dev and prod then use identical relative URLs.
      '/trusten/api': { target: API_ORIGIN, changeOrigin: true, ws: true },
    },
  },
})
```

`apps/web/tailwind.config.js`:

```js
import preset from '@trusten/ui/tailwind-preset'

export default {
  presets: [preset],
  content: ['./src/**/*.{html,svelte,ts}', '../../packages/ui/src/**/*.svelte'],
}
```

- [ ] **Step 3: Write the typed API client**

Create `apps/web/src/lib/api.ts`:

```ts
/**
 * Typed client over the Trusten API.
 *
 * Every response is parsed through the shared schema rather than cast, so a
 * server change that breaks the contract fails here rather than rendering
 * something wrong.
 */
import {
  AuditStartResponseSchema,
  AuditStatusSchema,
  DomainSummarySchema,
  GlobalStatsSchema,
  HistoryResponseSchema,
  ScanDetailSchema,
  type AuditRequest,
  type QuickScanRequest,
} from '@trusten/shared/api'
import type { ZodType } from 'zod'

const BASE = '/trusten/api'

type Fetcher = typeof globalThis.fetch

async function get<T>(
  fetcher: Fetcher,
  path: string,
  schema: ZodType<T>,
): Promise<T> {
  const res = await fetcher(`${BASE}${path}`)
  if (!res.ok) throw new Error(`Request failed: ${res.status}`)
  return schema.parse(await res.json())
}

async function post<T>(
  fetcher: Fetcher,
  path: string,
  body: unknown,
  schema: ZodType<T>,
): Promise<T> {
  const res = await fetcher(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Request failed: ${res.status}`)
  return schema.parse(await res.json())
}

export const api = {
  getStats: (f: Fetcher = fetch) => get(f, '/stats', GlobalStatsSchema),

  getHistory: (limit = 50, f: Fetcher = fetch) =>
    get(f, `/history?limit=${limit}`, HistoryResponseSchema),

  getScan: (id: string, f: Fetcher = fetch) =>
    get(f, `/scan/${encodeURIComponent(id)}`, ScanDetailSchema),

  getDomain: (domain: string, f: Fetcher = fetch) =>
    get(
      f,
      `/domain/${encodeURIComponent(domain)}`,
      DomainSummarySchema.nullable(),
    ),

  startAudit: (req: AuditRequest, f: Fetcher = fetch) =>
    post(f, '/audit', req, AuditStartResponseSchema),

  getAuditStatus: (jobId: string, f: Fetcher = fetch) =>
    get(f, `/audit/${encodeURIComponent(jobId)}`, AuditStatusSchema),

  quickScan: (req: QuickScanRequest, f: Fetcher = fetch) =>
    post(f, '/quick-scan', req, ScanDetailSchema.partial()),
}
```

- [ ] **Step 4: Write the layout with tokens applied**

Create `apps/web/src/routes/+layout.svelte`:

```svelte
<script lang="ts">
  import '@trusten/ui/tokens.css'
  import '../app.css'
  let { children } = $props()
</script>

<div class="min-h-screen bg-bg text-text text-base">
  {@render children()}
</div>
```

Create `apps/web/src/app.css`:

```css
@import 'tailwindcss';

body {
  font-size: var(--trusten-text-base);
  line-height: var(--trusten-line-height);
}

/* Every interactive element meets the 44px minimum target (spec 2.3). */
a,
button,
input,
select {
  min-height: var(--trusten-target-min);
}
```

- [ ] **Step 5: Prove the proxy reaches the API**

Replace `apps/web/src/routes/+page.svelte` with a temporary probe:

```svelte
<script lang="ts">
  import type { PageData } from './$types'
  let { data }: { data: PageData } = $props()
</script>

<h1>Trusten</h1>
<p>{data.stats.totalScans} scans across {data.stats.totalDomains} sites.</p>
```

Create `apps/web/src/routes/+page.ts`:

```ts
import { api } from '$lib/api'
import type { PageLoad } from './$types'

export const load: PageLoad = async ({ fetch }) => {
  return { stats: await api.getStats(fetch) }
}
```

- [ ] **Step 6: Verify dev mode end to end**

Terminal 1: `bun run start` (Hono on 9200).
Terminal 2: `cd apps/web && bun run dev`.
Visit `http://localhost:5173`.
Expected: real scan counts from the SQLite database. If the numbers render, the proxy, the client, and the schema parsing all work.

- [ ] **Step 7: Verify `adapter-node` runs under Bun — the flagged risk**

```bash
cd apps/web && bun run build && bun ./build/index.js
```

Expected: the server starts on port 3000 and `http://localhost:3000` renders the same page.
**If this fails:** record the exact error in the plan and fall back to running this process under Node (`node ./build/index.js`) — the API stays on Bun, they are separate processes, so a split runtime is tolerable. Do not proceed to Task 9 until one of the two works.

- [ ] **Step 8: Add root scripts**

In the root `package.json` scripts:

```json
"dev:web": "bun run --filter @trusten/web dev",
"build:web": "bun run --filter @trusten/web build"
```

- [ ] **Step 9: Commit**

```bash
bunx biome check --write apps/web
git add apps/web package.json bun.lock
git commit -m "feat(web): scaffold SvelteKit app with typed API client"
```

---

## Task 9: `SeverityTag` and `GradeBadge` components

**Files:**
- Create: `packages/ui/src/domain/SeverityTag.svelte`, `GradeBadge.svelte`, `index.ts`
- Create: `packages/ui/src/domain/SeverityTag.test.ts`
- Modify: `packages/ui/package.json` (add `./domain` export, Vitest dev deps)

**Interfaces:**
- Consumes: `toShownLevel`, `SHOWN_LEVELS` (Task 2); `gradeHeadline` (Task 4).
- Produces: `<SeverityTag severity={Severity} />`, `<GradeBadge grade={Grade} />`.

- [ ] **Step 1: Add the component test toolchain**

```bash
cd packages/ui
bun add -d vitest @testing-library/svelte @testing-library/jest-dom \
  jsdom svelte @sveltejs/vite-plugin-svelte
```

Create `packages/ui/vitest.config.ts`:

```ts
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [svelte({ hot: false })],
  test: { environment: 'jsdom', globals: true },
})
```

Add to `packages/ui/package.json` scripts: `"test:components": "vitest run"`.

- [ ] **Step 2: Write the failing test**

Create `packages/ui/src/domain/SeverityTag.test.ts`:

```ts
import { render, screen } from '@testing-library/svelte'
import { describe, expect, test } from 'vitest'
import SeverityTag from './SeverityTag.svelte'

describe('SeverityTag', () => {
  test('shows the plain word, not the internal level', () => {
    render(SeverityTag, { props: { severity: 'critical' } })
    expect(screen.getByText('Serious')).toBeTruthy()
    expect(screen.queryByText('critical')).toBeNull()
  })

  test('collapses high to the same shown level as critical', () => {
    render(SeverityTag, { props: { severity: 'high' } })
    expect(screen.getByText('Serious')).toBeTruthy()
  })

  test('carries an accessible label, not colour alone', () => {
    const { container } = render(SeverityTag, { props: { severity: 'medium' } })
    const tag = container.querySelector('[data-level]')
    expect(tag?.getAttribute('aria-label')).toContain('Worth knowing')
  })

  test('renders an icon alongside the word', () => {
    const { container } = render(SeverityTag, { props: { severity: 'low' } })
    expect(container.querySelector('svg')).toBeTruthy()
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd packages/ui && bun run test:components`
Expected: FAIL — `SeverityTag.svelte` not found.

- [ ] **Step 4: Write the components**

Create `packages/ui/src/domain/SeverityTag.svelte`:

```svelte
<script lang="ts">
  import type { Severity } from '@trusten/shared/domain'
  import { SHOWN_LEVELS, toShownLevel } from '../content/severity'

  interface Props {
    severity: Severity
  }

  let { severity }: Props = $props()

  const level = $derived(toShownLevel(severity))
  const content = $derived(SHOWN_LEVELS[level])
</script>

<!--
  Colour is never the only signal: this tag always carries the word and an
  icon too, so it survives greyscale printing and colour-blind readers.
-->
<span
  data-level={level}
  aria-label="{content.label}. {content.meaning}"
  class="inline-flex items-center gap-2 rounded-full px-3 py-1 font-semibold text-sm"
  style="color: var({content.colorVar});"
>
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    {#if level === 'serious'}
      <path d="M8 1 L15 14 H1 Z" fill="none" stroke="currentColor" stroke-width="2" />
      <line x1="8" y1="6" x2="8" y2="10" stroke="currentColor" stroke-width="2" />
    {:else if level === 'worth-knowing'}
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="2" />
      <line x1="8" y1="7" x2="8" y2="12" stroke="currentColor" stroke-width="2" />
      <circle cx="8" cy="4.5" r="1" fill="currentColor" />
    {:else}
      <circle cx="8" cy="8" r="4" fill="currentColor" />
    {/if}
  </svg>
  {content.label}
</span>
```

Create `packages/ui/src/domain/GradeBadge.svelte`:

```svelte
<script lang="ts">
  import type { Grade } from '@trusten/shared/domain'

  interface Props {
    grade: Grade
  }

  let { grade }: Props = $props()

  const colorVar = $derived(`--trusten-grade-${grade.toLowerCase()}`)
</script>

<span
  class="inline-flex min-h-target min-w-target items-center justify-center rounded-xl font-bold text-3xl"
  style="color: var({colorVar}); border: 3px solid var({colorVar});"
  aria-label="Grade {grade}"
>
  {grade}
</span>
```

Create `packages/ui/src/domain/index.ts`:

```ts
export { default as GradeBadge } from './GradeBadge.svelte'
export { default as SeverityTag } from './SeverityTag.svelte'
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd packages/ui && bun run test:components`
Expected: PASS — 4 tests.

- [ ] **Step 6: Add the package export and commit**

Add to `packages/ui/package.json` exports:

```json
"./domain": {
  "types": "./src/domain/index.ts",
  "svelte": "./src/domain/index.ts",
  "default": "./src/domain/index.ts"
}
```

```bash
bunx biome check --write packages/ui
git add packages/ui
git commit -m "feat(ui): add SeverityTag and GradeBadge components"
```

---

## Task 10: `EvidenceShot` — crop and highlight from `boundingBox`

The component that makes the redesign work. `ElementEvidence.boundingBox` is already produced by the scanner and has never been used by the UI. Each finding shows its screenshot cropped and zoomed to its own element (spec §6.2).

**Files:**
- Create: `packages/ui/src/domain/crop.ts`, `crop.test.ts`
- Create: `packages/ui/src/domain/EvidenceShot.svelte`
- Modify: `packages/ui/src/domain/index.ts`

**Interfaces:**
- Consumes: `BoundingBox` from `@trusten/shared/domain`.
- Produces: `computeCrop(box, image, opts): CropResult` where `CropResult = { x, y, width, height, scale }`; `<EvidenceShot src box alt static />`.

- [ ] **Step 1: Write the failing test**

Create `packages/ui/src/domain/crop.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { computeCrop } from './crop'

const image = { width: 1280, height: 3000 }

describe('computeCrop', () => {
  test('centres the crop on the element', () => {
    const box = { x: 500, y: 1000, width: 200, height: 60 }
    const crop = computeCrop(box, image, { padding: 40 })
    expect(crop.x).toBe(460)
    expect(crop.y).toBe(960)
    expect(crop.width).toBe(280)
    expect(crop.height).toBe(140)
  })

  test('never crops outside the image on the top left', () => {
    const box = { x: 5, y: 5, width: 100, height: 20 }
    const crop = computeCrop(box, image, { padding: 40 })
    expect(crop.x).toBe(0)
    expect(crop.y).toBe(0)
  })

  test('never crops past the bottom right edge', () => {
    const box = { x: 1200, y: 2960, width: 100, height: 60 }
    const crop = computeCrop(box, image, { padding: 40 })
    expect(crop.x + crop.width).toBeLessThanOrEqual(image.width)
    expect(crop.y + crop.height).toBeLessThanOrEqual(image.height)
  })

  test('enforces a minimum crop so a tiny element is not shown alone', () => {
    const box = { x: 600, y: 1500, width: 8, height: 8 }
    const crop = computeCrop(box, image, { padding: 40, minWidth: 320 })
    expect(crop.width).toBeGreaterThanOrEqual(320)
  })

  test('falls back to the top of the page when there is no box', () => {
    const crop = computeCrop(undefined, image, { padding: 40 })
    expect(crop).toEqual({ x: 0, y: 0, width: 1280, height: 3000, scale: 1 })
  })

  test('reports the scale needed to fit a display width', () => {
    const box = { x: 0, y: 0, width: 640, height: 200 }
    const crop = computeCrop(box, image, { padding: 0, displayWidth: 320 })
    expect(crop.scale).toBeCloseTo(0.5)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/ui && bun test src/domain/crop.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the implementation**

Create `packages/ui/src/domain/crop.ts`:

```ts
/**
 * Trusten — cropping a screenshot to one finding.
 *
 * The scanner records a boundingBox for the offending element but the old
 * dashboard never used it: boxes were burned into the image at capture time,
 * so they could not be toggled or tied to what the reader was reading.
 *
 * Here each finding gets its own picture, cropped and zoomed to its own
 * element. One finding, one picture, one highlight — easier to follow than a
 * wide screenshot carrying eight boxes.
 */
import type { BoundingBox } from '@trusten/shared/domain'

export interface ImageSize {
  width: number
  height: number
}

export interface CropOptions {
  /** Context to keep around the element, in image pixels. */
  padding?: number
  /** Smallest acceptable crop width, so a tiny element still has context. */
  minWidth?: number
  /** Width the crop will be displayed at, used to compute `scale`. */
  displayWidth?: number
}

export interface CropResult {
  x: number
  y: number
  width: number
  height: number
  /** Multiply image pixels by this to get display pixels. */
  scale: number
}

export function computeCrop(
  box: BoundingBox | undefined,
  image: ImageSize,
  opts: CropOptions = {},
): CropResult {
  const { padding = 40, minWidth = 0, displayWidth } = opts

  // No box: show the whole page rather than guessing.
  if (!box) {
    return {
      x: 0,
      y: 0,
      width: image.width,
      height: image.height,
      scale: displayWidth ? displayWidth / image.width : 1,
    }
  }

  let width = Math.max(box.width + padding * 2, minWidth)
  let height = box.height + padding * 2

  // Keep the element centred while widening to the minimum.
  const centerX = box.x + box.width / 2
  const centerY = box.y + box.height / 2

  width = Math.min(width, image.width)
  height = Math.min(height, image.height)

  let x = Math.round(centerX - width / 2)
  let y = Math.round(centerY - height / 2)

  // Clamp inside the image.
  x = Math.max(0, Math.min(x, image.width - width))
  y = Math.max(0, Math.min(y, image.height - height))

  return {
    x,
    y,
    width: Math.round(width),
    height: Math.round(height),
    scale: displayWidth ? displayWidth / width : 1,
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/ui && bun test src/domain/crop.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Write the component**

Create `packages/ui/src/domain/EvidenceShot.svelte`. Note the `static` prop: project 2 uses it to render into the PDF where nothing can be interactive.

```svelte
<script lang="ts">
  import type { BoundingBox } from '@trusten/shared/domain'
  import { computeCrop, type ImageSize } from './crop'

  interface Props {
    src: string
    box?: BoundingBox
    /** Natural size of the screenshot. */
    image: ImageSize
    /** Plain description of what the picture shows. */
    alt: string
    /** Render without interactivity — the mode the PDF report uses. */
    isStatic?: boolean
    displayWidth?: number
  }

  let {
    src,
    box,
    image,
    alt,
    isStatic = false,
    displayWidth = 640,
  }: Props = $props()

  const crop = $derived(computeCrop(box, image, { padding: 48, minWidth: 480, displayWidth }))
  const displayHeight = $derived(Math.round(crop.height * crop.scale))
</script>

<figure class="m-0">
  <div
    class="relative overflow-hidden rounded-xl border border-border"
    style="width: {displayWidth}px; height: {displayHeight}px; max-width: 100%;"
  >
    <img
      {src}
      {alt}
      class="absolute max-w-none origin-top-left"
      style="
        left: {-crop.x * crop.scale}px;
        top: {-crop.y * crop.scale}px;
        width: {image.width * crop.scale}px;
      "
    />

    {#if box}
      <!-- Drawn over a clean screenshot rather than burned into it. -->
      <svg
        class="pointer-events-none absolute inset-0"
        width={displayWidth}
        height={displayHeight}
        aria-hidden="true"
      >
        <rect
          x={(box.x - crop.x) * crop.scale}
          y={(box.y - crop.y) * crop.scale}
          width={box.width * crop.scale}
          height={box.height * crop.scale}
          fill="none"
          stroke="var(--trusten-level-serious)"
          stroke-width="3"
          rx="4"
        />
      </svg>
    {/if}
  </div>

  {#if !isStatic}
    <figcaption class="mt-2 text-sm text-text-muted">{alt}</figcaption>
  {/if}
</figure>
```

- [ ] **Step 6: Export and commit**

Add `export { default as EvidenceShot } from './EvidenceShot.svelte'` to `packages/ui/src/domain/index.ts`.

```bash
bunx biome check --write packages/ui
git add packages/ui/src/domain
git commit -m "feat(ui): add EvidenceShot with per-finding crop and highlight"
```

---

## Task 11: `FindingCard` — the consumer composition

One finding, self-contained, read top to bottom (spec §6.2). This is the *consumer* composition; project 2 adds a professional one over the same primitives (spec §7.2.1).

**Files:**
- Create: `packages/ui/src/domain/Disclosure.svelte`
- Create: `packages/ui/src/domain/FindingCard.svelte`, `FindingCard.test.ts`
- Modify: `packages/ui/src/domain/index.ts`

**Interfaces:**
- Consumes: `getPatternContent` (Task 3), `toConfidenceBand`/`CONFIDENCE_PREFIX` (Task 4), `SeverityTag` (Task 9), `EvidenceShot` (Task 10).
- Produces: `<FindingCard pattern index screenshotUrl imageSize />`.

- [ ] **Step 1: Write the failing test**

Create `packages/ui/src/domain/FindingCard.test.ts`:

```ts
import { DarkPatternCategory } from '@trusten/shared/domain'
import { render, screen } from '@testing-library/svelte'
import { describe, expect, test } from 'vitest'
import FindingCard from './FindingCard.svelte'

const pattern = {
  id: 'p-1',
  category: DarkPatternCategory.FAKE_URGENCY,
  severity: 'critical' as const,
  confidence: 0.87,
  description:
    'Urgency language detected: "Only 2 left". Manufactured time pressure exploits loss aversion.',
  element: {
    selector: '.countdown',
    text: 'Only 2 left — order in 5:00',
    html: '<div>Only 2 left</div>',
    boundingBox: { x: 100, y: 200, width: 300, height: 48 },
  },
  evidence: {},
  regulatoryViolations: [
    {
      regulation: 'EU_UCPD',
      article: 'Annex I, Para 7',
      description: 'UCPD blacklists falsely stating limited availability.',
    },
  ],
  detectedAt: '2026-08-28T10:00:00.000Z',
  url: 'https://example.com/checkout',
  pageTitle: 'Checkout',
}

const props = {
  pattern,
  index: 1,
  screenshotUrl: '/shot.png',
  imageSize: { width: 1280, height: 3000 },
}

describe('FindingCard', () => {
  test('leads with the plain name, not the taxonomy name', () => {
    render(FindingCard, { props })
    expect(screen.getByText('A fake deadline')).toBeTruthy()
    expect(screen.queryByText(/fake_urgency/i)).toBeNull()
  })

  test('quotes what the site actually said', () => {
    render(FindingCard, { props })
    expect(screen.getByText(/Only 2 left/)).toBeTruthy()
  })

  test('shows no confidence number anywhere', () => {
    const { container } = render(FindingCard, { props })
    expect(container.textContent).not.toContain('0.87')
    expect(container.textContent).not.toMatch(/confidence/i)
  })

  test('keeps the technical explanation behind a disclosure', () => {
    render(FindingCard, { props })
    // Present in the DOM but inside a collapsed <details>.
    const details = screen.getByText('How we worked this out').closest('details')
    expect(details).toBeTruthy()
    expect(details?.hasAttribute('open')).toBe(false)
  })

  test('labels the legal disclosure as a question, not as jargon', () => {
    render(FindingCard, { props })
    expect(screen.getByText('Is this allowed?')).toBeTruthy()
    expect(screen.queryByText(/regulatory violation/i)).toBeNull()
  })

  test('hedges a middling finding instead of stating it', () => {
    render(FindingCard, {
      props: { ...props, pattern: { ...pattern, confidence: 0.72 } },
    })
    expect(screen.getByText(/This looks like/)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/ui && bun run test:components`
Expected: FAIL — `FindingCard.svelte` not found.

- [ ] **Step 3: Write the disclosure primitive**

Create `packages/ui/src/domain/Disclosure.svelte`. Native `<details>` — keyboard accessible for free, and works without JavaScript, which matters for SSR on older devices.

```svelte
<script lang="ts">
  interface Props {
    label: string
    children: import('svelte').Snippet
  }

  let { label, children }: Props = $props()
</script>

<details class="mt-3 border-border border-t pt-3">
  <summary
    class="flex min-h-target cursor-pointer items-center font-semibold text-purple"
  >
    {label}
  </summary>
  <div class="mt-2 text-text-muted text-sm">
    {@render children()}
  </div>
</details>
```

- [ ] **Step 4: Write the card**

Create `packages/ui/src/domain/FindingCard.svelte`:

```svelte
<script lang="ts">
  import type { DetectedPattern } from '@trusten/shared/domain'
  import { CONFIDENCE_PREFIX, toConfidenceBand } from '../content/confidence'
  import { getPatternContent } from '../content/patterns'
  import Disclosure from './Disclosure.svelte'
  import EvidenceShot from './EvidenceShot.svelte'
  import SeverityTag from './SeverityTag.svelte'
  import type { ImageSize } from './crop'

  interface Props {
    pattern: DetectedPattern
    index: number
    screenshotUrl?: string
    imageSize?: ImageSize
  }

  let { pattern, index, screenshotUrl, imageSize }: Props = $props()

  const content = $derived(getPatternContent(pattern.category))
  const band = $derived(toConfidenceBand(pattern.confidence))
  const prefix = $derived(CONFIDENCE_PREFIX[band])
</script>

<article class="border-border border-t py-8">
  <header class="mb-4 flex flex-wrap items-baseline gap-3">
    <h3 class="m-0 font-bold text-2xl">
      <span class="text-text-muted">{index}.</span>
      {content.name}
    </h3>
    <SeverityTag severity={pattern.severity} />
  </header>

  {#if pattern.element?.text}
    <p class="mb-2 text-text-muted">The site said:</p>
    <blockquote
      class="my-0 mb-4 border-purple border-l-4 bg-surface py-3 pl-4 font-medium"
    >
      "{pattern.element.text}"
    </blockquote>
  {/if}

  {#if screenshotUrl && imageSize}
    <div class="mb-6">
      <EvidenceShot
        src={screenshotUrl}
        box={pattern.element?.boundingBox}
        image={imageSize}
        alt="Where this appeared on the page"
      />
    </div>
  {/if}

  <h4 class="mt-6 mb-1 font-bold text-lg">What this means</h4>
  <p class="mt-0 max-w-measure">{prefix} this: {content.what} {content.why}</p>

  <h4 class="mt-6 mb-1 font-bold text-lg">How to spot it yourself</h4>
  <p class="mt-0 max-w-measure">{content.watchFor}</p>

  <Disclosure label="Is this allowed?">
    <p class="mt-0">{content.lawPlain}</p>
    {#each pattern.regulatoryViolations as violation (violation.article)}
      <p class="mt-2 mb-0">
        <strong>{violation.regulation} {violation.article}</strong> —
        {violation.description}
      </p>
    {/each}
  </Disclosure>

  <Disclosure label="How we worked this out">
    <p class="mt-0">{pattern.description}</p>
    {#if pattern.element?.selector}
      <p class="mt-2 mb-0">
        Found at: <code>{pattern.element.selector}</code>
      </p>
    {/if}
  </Disclosure>
</article>
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd packages/ui && bun run test:components`
Expected: PASS — 6 tests.

- [ ] **Step 6: Export and commit**

```bash
bunx biome check --write packages/ui
git add packages/ui/src/domain
git commit -m "feat(ui): add FindingCard consumer composition"
```

---

## Task 12: `/scan/:id` — the result page

**Files:**
- Create: `apps/web/src/routes/scan/[id]/+page.ts`, `+page.svelte`
- Create: `apps/web/src/lib/findings.ts`, `findings.test.ts`

**Interfaces:**
- Consumes: `api.getScan` (Task 8), `FindingCard`, `GradeBadge` (Tasks 9/11), `gradeHeadline` (Task 4), `compareSeverity` (Task 2), `toConfidenceBand` (Task 4).
- Produces: `splitFindings(patterns): { main: DetectedPattern[]; aside: DetectedPattern[] }`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/findings.test.ts`:

```ts
import { DarkPatternCategory } from '@trusten/shared/domain'
import { describe, expect, test } from 'bun:test'
import { splitFindings } from './findings'

function pattern(confidence: number, severity: 'critical' | 'low', id: string) {
  return {
    id,
    category: DarkPatternCategory.FAKE_URGENCY,
    severity,
    confidence,
    description: '',
    evidence: {},
    regulatoryViolations: [],
    detectedAt: '',
    url: '',
    pageTitle: '',
  }
}

describe('splitFindings', () => {
  test('moves weak findings aside without discarding them', () => {
    const { main, aside } = splitFindings([
      pattern(0.9, 'critical', 'a'),
      pattern(0.55, 'critical', 'b'),
    ])
    expect(main.map((p) => p.id)).toEqual(['a'])
    expect(aside.map((p) => p.id)).toEqual(['b'])
  })

  test('orders the main list most serious first', () => {
    const { main } = splitFindings([
      pattern(0.9, 'low', 'low-one'),
      pattern(0.9, 'critical', 'critical-one'),
    ])
    expect(main[0].id).toBe('critical-one')
  })

  test('breaks severity ties by how sure we are', () => {
    const { main } = splitFindings([
      pattern(0.82, 'critical', 'less-sure'),
      pattern(0.95, 'critical', 'more-sure'),
    ])
    expect(main[0].id).toBe('more-sure')
  })

  test('handles an empty scan', () => {
    expect(splitFindings([])).toEqual({ main: [], aside: [] })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && bun test src/lib/findings.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the helper**

Create `apps/web/src/lib/findings.ts`:

```ts
/**
 * Ordering and grouping for the result page.
 *
 * The most serious, most certain finding is read first. Findings we are not
 * sure enough about move to a collected group the reader can open, so our own
 * uncertainty never dilutes the main read.
 */
import type { DetectedPattern } from '@trusten/shared/domain'
import { compareSeverity } from '@trusten/ui/content'
import { toConfidenceBand } from '@trusten/ui/content'

export function splitFindings(patterns: DetectedPattern[]): {
  main: DetectedPattern[]
  aside: DetectedPattern[]
} {
  const main: DetectedPattern[] = []
  const aside: DetectedPattern[] = []

  for (const p of patterns) {
    if (toConfidenceBand(p.confidence) === 'aside') aside.push(p)
    else main.push(p)
  }

  const order = (a: DetectedPattern, b: DetectedPattern) =>
    compareSeverity(a.severity, b.severity) || b.confidence - a.confidence

  return { main: main.sort(order), aside: aside.sort(order) }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && bun test src/lib/findings.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Write the route loader**

Create `apps/web/src/routes/scan/[id]/+page.ts`:

```ts
import { api } from '$lib/api'
import { error } from '@sveltejs/kit'
import type { PageLoad } from './$types'

export const load: PageLoad = async ({ params, fetch }) => {
  try {
    return { scan: await api.getScan(params.id, fetch) }
  } catch {
    // A real 404, replacing the soft "not found" card served with a 200.
    throw error(404, 'We could not find that result.')
  }
}
```

- [ ] **Step 6: Write the page**

Create `apps/web/src/routes/scan/[id]/+page.svelte`:

```svelte
<script lang="ts">
  import { splitFindings } from '$lib/findings'
  import { gradeHeadline } from '@trusten/ui/content'
  import { FindingCard, GradeBadge } from '@trusten/ui/domain'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()

  const split = $derived(splitFindings(data.scan.patterns))
  const heading = $derived(
    gradeHeadline(data.scan.score.grade, split.main.length),
  )
</script>

<svelte:head>
  <title>{data.scan.domain} — Trusten</title>
</svelte:head>

<main class="mx-auto max-w-4xl px-6 py-12">
  <header class="mb-10 flex flex-wrap items-center gap-6">
    <GradeBadge grade={data.scan.score.grade} />
    <div>
      <h1 class="m-0 font-bold text-4xl">{heading.headline}</h1>
      <p class="mt-2 mb-0 text-text-muted">{heading.sub}</p>
      <p class="mt-1 mb-0 text-sm text-text-muted">
        We checked {data.scan.domain}
      </p>
    </div>
  </header>

  {#if split.main.length === 0 && split.aside.length === 0}
    <p class="max-w-measure text-xl">
      We looked for the usual tricks and did not find any. This site seems to
      treat you fairly.
    </p>
  {:else}
    <section>
      <h2 class="mb-2 font-bold text-2xl">What we found</h2>
      {#each split.main as pattern, i (pattern.id)}
        <FindingCard {pattern} index={i + 1} />
      {/each}
    </section>
  {/if}

  {#if split.aside.length > 0}
    <details class="mt-12 border-border border-t pt-6">
      <summary class="min-h-target cursor-pointer font-semibold text-purple">
        A few other things worth a look ({split.aside.length})
      </summary>
      <p class="max-w-measure text-text-muted">
        We are less sure about these, so we have kept them separate.
      </p>
      {#each split.aside as pattern, i (pattern.id)}
        <FindingCard {pattern} index={split.main.length + i + 1} />
      {/each}
    </details>
  {/if}

  <p class="mt-12">
    <a class="font-semibold text-purple" href="/">Check another site</a>
  </p>
</main>
```

- [ ] **Step 7: Verify against a real scan**

Start both servers, find an existing scan id (`curl -s localhost:9200/trusten/api/history?limit=1 | head -c 400`), and visit `http://localhost:5173/scan/<id>`.
Expected: a plain-English headline, findings in plain language, no confidence numbers, weak findings collapsed at the bottom. Confirm with your browser's reader/zoom at 200% that nothing overlaps.

- [ ] **Step 8: Commit**

```bash
bunx biome check --write apps/web
git add apps/web/src
git commit -m "feat(web): add plain-language scan result page"
```

---

## Task 13: `/` home — one field, one button

**Files:**
- Create/Modify: `apps/web/src/routes/+page.svelte`, `+page.ts`

**Interfaces:**
- Consumes: `api.quickScan`, `api.getHistory` (Task 8).

- [ ] **Step 1: Replace the probe loader**

Rewrite `apps/web/src/routes/+page.ts`:

```ts
import { api } from '$lib/api'
import type { PageLoad } from './$types'

export const load: PageLoad = async ({ fetch }) => {
  const history = await api.getHistory(5, fetch).catch(() => ({
    scans: [],
    total: 0,
  }))
  return { recent: history.scans }
}
```

- [ ] **Step 2: Write the page**

Rewrite `apps/web/src/routes/+page.svelte`:

```svelte
<script lang="ts">
  import { goto } from '$app/navigation'
  import { api } from '$lib/api'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()

  let url = $state('')
  let busy = $state(false)
  let problem = $state('')

  async function check(event: SubmitEvent) {
    event.preventDefault()
    if (!url.trim()) {
      problem = 'Please type the address of the site you want checked.'
      return
    }

    busy = true
    problem = ''
    try {
      const result = await api.quickScan({ url })
      if (result.id) await goto(`/scan/${result.id}`)
      else problem = 'We could not check that site. Please try again.'
    } catch {
      problem = 'We could not reach the checking service. Try again in a moment.'
    } finally {
      busy = false
    }
  }
</script>

<main class="mx-auto max-w-3xl px-6 py-16">
  <h1 class="m-0 font-bold text-5xl">Is this site being fair with you?</h1>
  <p class="mt-4 max-w-measure text-xl text-text-muted">
    Paste the address of a shop or a website. We will look for tricks that
    push people into spending more, sharing more, or agreeing to things they
    did not mean to.
  </p>

  <form class="mt-10" onsubmit={check}>
    <label class="block font-semibold" for="site">Website address</label>
    <input
      id="site"
      class="mt-2 w-full rounded-xl border-2 border-border bg-bg px-4 py-3 text-base"
      type="text"
      bind:value={url}
      placeholder="example.com"
      autocomplete="url"
      aria-describedby={problem ? 'site-problem' : undefined}
    />

    {#if problem}
      <p id="site-problem" class="mt-2 mb-0 font-semibold text-serious" role="alert">
        {problem}
      </p>
    {/if}

    <button
      class="mt-4 min-h-target rounded-xl bg-purple px-8 py-3 font-bold text-lg text-white disabled:opacity-60"
      type="submit"
      disabled={busy}
    >
      {busy ? 'Checking…' : 'Check this site'}
    </button>
  </form>

  <p class="mt-6 text-text-muted">
    Want a deeper look, including signing up and cancelling?
    <a class="font-semibold text-purple" href="/audit">Run a full check</a>.
  </p>

  {#if data.recent.length > 0}
    <section class="mt-16">
      <h2 class="font-bold text-2xl">Recently checked</h2>
      <ul class="list-none p-0">
        {#each data.recent as scan (scan.id)}
          <li class="border-border border-b py-3">
            <a class="font-semibold text-purple" href="/scan/{scan.id}">
              {scan.domain}
            </a>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</main>
```

- [ ] **Step 3: Verify manually**

With both servers running, visit `http://localhost:5173`, enter a URL, and confirm it navigates to a result page. Submit an empty form and confirm the error reads as a sentence and is announced (`role="alert"`).

- [ ] **Step 4: Commit**

```bash
bunx biome check --write apps/web
git add apps/web/src/routes
git commit -m "feat(web): add home page with single-field site check"
```

---

## Task 14: `/explore` — history and leaderboard merged

**Files:**
- Create: `apps/web/src/routes/explore/+page.ts`, `+page.svelte`

**Interfaces:**
- Consumes: `api.getHistory` (Task 8), `GradeBadge` (Task 9).

- [ ] **Step 1: Write the loader**

Create `apps/web/src/routes/explore/+page.ts`:

```ts
import { api } from '$lib/api'
import type { PageLoad } from './$types'

export const load: PageLoad = async ({ fetch }) => {
  // Client-side filtering below this size; revisit past ~2,000 rows (spec 12).
  return { history: await api.getHistory(200, fetch) }
}
```

- [ ] **Step 2: Write the page**

Create `apps/web/src/routes/explore/+page.svelte`:

```svelte
<script lang="ts">
  import { GradeBadge } from '@trusten/ui/domain'
  import type { Grade } from '@trusten/shared/domain'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()

  let query = $state('')

  const rows = $derived(
    data.history.scans.filter((s) =>
      s.domain.toLowerCase().includes(query.trim().toLowerCase()),
    ),
  )
</script>

<main class="mx-auto max-w-5xl px-6 py-12">
  <h1 class="m-0 font-bold text-4xl">Sites we have checked</h1>

  <label class="mt-8 block font-semibold" for="filter">Search by name</label>
  <input
    id="filter"
    class="mt-2 w-full max-w-md rounded-xl border-2 border-border bg-bg px-4 py-3"
    type="search"
    bind:value={query}
    placeholder="example.com"
  />

  {#if rows.length === 0}
    <p class="mt-8 text-text-muted">No sites match that name.</p>
  {:else}
    <ul class="mt-8 list-none p-0">
      {#each rows as scan (scan.id)}
        <li class="flex items-center gap-4 border-border border-b py-4">
          <GradeBadge grade={scan.scoreGrade as Grade} />
          <div class="flex-1">
            <a class="font-semibold text-lg text-purple" href="/scan/{scan.id}">
              {scan.domain}
            </a>
            <p class="mt-1 mb-0 text-sm text-text-muted">
              {scan.patternCount === 0
                ? 'Nothing found'
                : `${scan.patternCount} ${scan.patternCount === 1 ? 'thing' : 'things'} found`}
            </p>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</main>
```

- [ ] **Step 3: Verify and commit**

Visit `http://localhost:5173/explore`, confirm real rows render and the filter narrows them.

```bash
bunx biome check --write apps/web
git add apps/web/src/routes/explore
git commit -m "feat(web): merge history and leaderboard into explore page"
```

---

## Task 15: `/site/:domain` — one site over time

**Files:**
- Create: `apps/web/src/routes/site/[domain]/+page.ts`, `+page.svelte`
- Modify: `apps/web/src/lib/api.ts` (add `getDomainScans`)

**Interfaces:**
- Consumes: `GET /api/domain/:domain`, which already returns `{ domain, summary, scans }`.
- Produces: `api.getDomainDetail(domain)`.

- [ ] **Step 1: Extend the API client**

The existing `/api/domain/:domain` handler returns `{ domain, summary, scans }`, not a bare summary. Add to `packages/shared/src/api/domain.ts`:

```ts
import { ScanHistoryRowSchema } from './history'

export const DomainDetailSchema = z.object({
  domain: z.string(),
  summary: DomainSummarySchema.nullable(),
  scans: z.array(ScanHistoryRowSchema),
})
export type DomainDetail = z.infer<typeof DomainDetailSchema>
```

Replace `getDomain` in `apps/web/src/lib/api.ts` with the following — and **delete the now-orphaned `DomainSummarySchema` import**, adding `DomainDetailSchema` in its place. This repo sets biome's `noUnusedImports` to `error`, so an orphaned import fails lint:

```ts
getDomainDetail: (domain: string, f: Fetcher = fetch) =>
  get(f, `/domain/${encodeURIComponent(domain)}`, DomainDetailSchema),
```

- [ ] **Step 2: Write the loader**

Create `apps/web/src/routes/site/[domain]/+page.ts`:

```ts
import { api } from '$lib/api'
import { error } from '@sveltejs/kit'
import type { PageLoad } from './$types'

export const load: PageLoad = async ({ params, fetch }) => {
  try {
    return { detail: await api.getDomainDetail(params.domain, fetch) }
  } catch {
    throw error(404, 'We have not checked that site yet.')
  }
}
```

- [ ] **Step 3: Write the page**

Create `apps/web/src/routes/site/[domain]/+page.svelte`:

```svelte
<script lang="ts">
  import type { Grade } from '@trusten/shared/domain'
  import { GradeBadge } from '@trusten/ui/domain'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()

  const latest = $derived(data.detail.scans[0])
</script>

<main class="mx-auto max-w-4xl px-6 py-12">
  <h1 class="m-0 font-bold text-4xl">{data.detail.domain}</h1>

  {#if latest}
    <div class="mt-6 flex items-center gap-4">
      <GradeBadge grade={latest.scoreGrade as Grade} />
      <p class="m-0 text-text-muted">
        Last checked {latest.createdAt.slice(0, 10)}
      </p>
    </div>
  {/if}

  <h2 class="mt-12 font-bold text-2xl">Every check we have run</h2>
  <ul class="list-none p-0">
    {#each data.detail.scans as scan (scan.id)}
      <li class="flex items-center gap-4 border-border border-b py-4">
        <GradeBadge grade={scan.scoreGrade as Grade} />
        <a class="font-semibold text-purple" href="/scan/{scan.id}">
          {scan.createdAt.slice(0, 10)}
        </a>
        <span class="text-text-muted">
          {scan.patternCount === 0
            ? 'Nothing found'
            : `${scan.patternCount} found`}
        </span>
      </li>
    {/each}
  </ul>
</main>
```

- [ ] **Step 4: Verify and commit**

```bash
bunx biome check --write apps/web packages/shared
git add apps/web packages/shared
git commit -m "feat(web): add per-site history page"
```

---

## Task 16: `/audit` — live timeline that becomes the result

The continuity requirement in spec §6.4: no redirect, no `setTimeout`. The timeline the user watched becomes the result they read.

**Files:**
- Create: `apps/web/src/lib/live.svelte.ts`, `live.test.ts`
- Create: `apps/web/src/routes/audit/+page.svelte`

**Interfaces:**
- Consumes: `api.startAudit`, `api.getAuditStatus` (Task 8); `LiveEventSchema` (Task 6).
- Produces: `createLiveScan()` returning `{ steps, frame, status, error, start(url, opts), destroy() }`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/live.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { reduceLiveEvent, type LiveState } from './live.svelte'

const empty: LiveState = {
  steps: [],
  frame: null,
  status: 'running',
  error: null,
}

describe('reduceLiveEvent', () => {
  test('adds a step when progress arrives', () => {
    const next = reduceLiveEvent(empty, {
      type: 'progress',
      step: 1,
      total: 4,
      action: 'Looking at the home page',
    })
    expect(next.steps).toHaveLength(1)
    expect(next.steps[0].action).toBe('Looking at the home page')
  })

  test('does not duplicate a step number', () => {
    const once = reduceLiveEvent(empty, {
      type: 'progress',
      step: 1,
      action: 'Looking at the home page',
    })
    const twice = reduceLiveEvent(once, {
      type: 'progress',
      step: 1,
      action: 'Looking at the home page',
    })
    expect(twice.steps).toHaveLength(1)
  })

  test('stores the newest frame without touching steps', () => {
    const next = reduceLiveEvent(empty, { type: 'frame', data: 'abc123' })
    expect(next.frame).toBe('data:image/jpeg;base64,abc123')
    expect(next.steps).toHaveLength(0)
  })

  test('marks the scan done', () => {
    const next = reduceLiveEvent(empty, { type: 'done' })
    expect(next.status).toBe('done')
  })

  test('carries an error message in plain words', () => {
    const next = reduceLiveEvent(empty, {
      type: 'error',
      message: 'We could not open the basket page',
    })
    expect(next.status).toBe('failed')
    expect(next.error).toBe('We could not open the basket page')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && bun test src/lib/live.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the state model**

Create `apps/web/src/lib/live.svelte.ts`. The reducer is a pure function so it can be tested without a browser; the rune-backed class wraps it.

```ts
/**
 * Live scan state.
 *
 * The old dashboard polled every 3 seconds and rebuilt DOM by string
 * concatenation, because the page had no state model to receive the
 * WebSocket's events into. It always carried progress/frame/done/error; this
 * is the model. Polling survives only as a reconnect fallback.
 */
import { LiveEventSchema, type LiveEvent } from '@trusten/shared/api'

export interface LiveStep {
  step: number
  action: string
  done: boolean
}

export interface LiveState {
  steps: LiveStep[]
  frame: string | null
  status: 'running' | 'done' | 'failed'
  error: string | null
}

/** Pure reducer — the whole transport-independent behaviour, testable alone. */
export function reduceLiveEvent(state: LiveState, event: LiveEvent): LiveState {
  switch (event.type) {
    case 'frame':
      if (!event.data) return state
      return { ...state, frame: `data:image/jpeg;base64,${event.data}` }

    case 'progress': {
      const step = event.step ?? state.steps.length + 1
      if (state.steps.some((s) => s.step === step)) return state
      return {
        ...state,
        steps: [
          ...state.steps.map((s) => ({ ...s, done: true })),
          { step, action: event.action ?? 'Working…', done: false },
        ],
      }
    }

    case 'done':
      return {
        ...state,
        status: 'done',
        steps: state.steps.map((s) => ({ ...s, done: true })),
      }

    case 'error':
      return {
        ...state,
        status: 'failed',
        error: event.message ?? 'Something went wrong while checking.',
      }
  }
}

export function createLiveScan() {
  let state = $state<LiveState>({
    steps: [],
    frame: null,
    status: 'running',
    error: null,
  })

  let socket: WebSocket | null = null

  function connect(jobId: string) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    socket = new WebSocket(
      `${proto}://${location.host}/trusten/api/jobs/${jobId}/live`,
    )
    socket.onmessage = (message) => {
      const parsed = LiveEventSchema.safeParse(JSON.parse(message.data))
      if (parsed.success) state = reduceLiveEvent(state, parsed.data)
    }
  }

  return {
    get state() {
      return state
    },
    connect,
    destroy() {
      socket?.close()
      socket = null
    },
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && bun test src/lib/live.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Declare the route client-rendered**

Spec §7.4 makes SSR the default and CSR the exception with a stated reason. This route is inherently live and stateful — there is nothing to server-render before a scan starts.

Create `apps/web/src/routes/audit/+page.ts`:

```ts
// Inherently live: nothing exists to render until a check is running.
export const ssr = false
```

- [ ] **Step 6: Write the page**

Create `apps/web/src/routes/audit/+page.svelte`. Note there is **no redirect**: when the scan finishes, the same page fetches the result and renders it beneath the timeline.

```svelte
<script lang="ts">
  import { api } from '$lib/api'
  import { splitFindings } from '$lib/findings'
  import { createLiveScan } from '$lib/live.svelte'
  import type { ScanDetail } from '@trusten/shared/api'
  import { gradeHeadline } from '@trusten/ui/content'
  import { FindingCard, GradeBadge } from '@trusten/ui/domain'
  import { onDestroy } from 'svelte'

  let url = $state('')
  let started = $state(false)
  let problem = $state('')
  let result = $state<ScanDetail | null>(null)

  const live = createLiveScan()
  onDestroy(() => live.destroy())

  const split = $derived(result ? splitFindings(result.patterns) : null)

  async function start(event: SubmitEvent) {
    event.preventDefault()
    if (!url.trim()) {
      problem = 'Please type the address of the site you want checked.'
      return
    }

    problem = ''
    try {
      const { jobId } = await api.startAudit({
        url,
        watch: true,
        mode: 'discover',
      })
      started = true
      live.connect(jobId)
      await waitForResult(jobId)
    } catch {
      problem = 'We could not reach the checking service. Try again in a moment.'
    }
  }

  async function waitForResult(jobId: string) {
    // Fallback only: the WebSocket drives the display, this just collects the
    // finished result so the timeline can become the report in place.
    while (true) {
      await new Promise((r) => setTimeout(r, 3000))
      const status = await api.getAuditStatus(jobId).catch(() => null)
      if (!status) continue
      if (status.status === 'done' && status.scanIds.length > 0) {
        result = await api.getScan(status.scanIds[0])
        return
      }
      if (status.status === 'failed') {
        problem = status.error ?? 'The check did not finish.'
        return
      }
    }
  }
</script>

<main class="mx-auto max-w-4xl px-6 py-12">
  <h1 class="m-0 font-bold text-4xl">Run a full check</h1>
  <p class="mt-3 max-w-measure text-text-muted">
    We will visit the site the way you would — looking at pages, adding things
    to a basket, and trying to cancel — and tell you what we find.
  </p>

  {#if !started}
    <form class="mt-8" onsubmit={start}>
      <label class="block font-semibold" for="audit-url">Website address</label>
      <input
        id="audit-url"
        class="mt-2 w-full max-w-md rounded-xl border-2 border-border bg-bg px-4 py-3"
        type="text"
        bind:value={url}
        placeholder="example.com"
      />
      {#if problem}
        <p class="mt-2 font-semibold text-serious" role="alert">{problem}</p>
      {/if}
      <button
        class="mt-4 min-h-target rounded-xl bg-purple px-8 py-3 font-bold text-lg text-white"
        type="submit"
      >
        Start the check
      </button>
    </form>
  {/if}

  {#if started}
    <section class="mt-10">
      <h2 class="font-bold text-2xl">
        {live.state.status === 'done' ? 'What we did' : 'What we are doing'}
      </h2>

      {#if live.state.frame && live.state.status !== 'done'}
        <img
          class="mt-4 w-full rounded-xl border border-border"
          src={live.state.frame}
          alt="A live picture of the site being checked"
        />
      {/if}

      <ol class="mt-6 list-none p-0">
        {#each live.state.steps as step (step.step)}
          <li class="flex items-center gap-3 border-border border-b py-3">
            <span aria-hidden="true">{step.done ? '✓' : '⋯'}</span>
            <span>{step.action}</span>
          </li>
        {/each}
      </ol>

      {#if live.state.error}
        <p class="font-semibold text-serious" role="alert">{live.state.error}</p>
      {/if}
    </section>
  {/if}

  <!--
    The timeline is not replaced and the page does not redirect: the result
    appears beneath what the reader just watched.
  -->
  {#if result && split}
    {@const heading = gradeHeadline(result.score.grade, split.main.length)}
    <section class="mt-16 border-border border-t pt-10">
      <header class="mb-8 flex flex-wrap items-center gap-6">
        <GradeBadge grade={result.score.grade} />
        <div>
          <h2 class="m-0 font-bold text-3xl">{heading.headline}</h2>
          <p class="mt-2 mb-0 text-text-muted">{heading.sub}</p>
        </div>
      </header>

      {#each split.main as pattern, i (pattern.id)}
        <FindingCard {pattern} index={i + 1} />
      {/each}
    </section>
  {/if}
</main>
```

- [ ] **Step 7: Verify the continuity requirement by hand**

Start both servers, visit `http://localhost:5173/audit`, run a check against a real site.
Expected: steps appear one by one with the live picture; when it finishes, **the page does not navigate** — the findings appear below the timeline you just watched.

- [ ] **Step 8: Commit**

```bash
bunx biome check --write apps/web
git add apps/web/src
git commit -m "feat(web): add live audit timeline that becomes the result in place"
```

---

## Task 17: Cutover — delete the old dashboard

The only non-additive step. Everything up to here left the old dashboard working.

**Files:**
- Delete: `apps/server/src/trusten/dashboard/ui.ts`, `theme.ts`
- Modify: `apps/server/src/trusten/dashboard/routes.ts`, `apps/server/src/trusten/report.ts`

**Interfaces:**
- `report.ts` moves from `./dashboard/theme` to `@trusten/ui/content` for its display data.

- [ ] **Step 1: Move the display tokens `report.ts` still needs**

`report.ts` imports `CATEGORY_LABELS`, `GRADE_COLOR`, `SEVERITY_COLOR` from `./dashboard/theme`. Add a compatibility export to `packages/ui/src/content/index.ts`:

```ts
/**
 * Legacy display maps, kept for report.ts until project 2 rebuilds it on
 * components. New code should use PATTERN_CONTENT and the CSS tokens.
 */
export const GRADE_COLOR: Record<string, string> = {
  A: '#15803d',
  B: '#4d7c0f',
  C: '#a16207',
  D: '#c2410c',
  F: '#b91c1c',
}

export const SEVERITY_COLOR: Record<string, string> = {
  critical: '#b91c1c',
  high: '#c2410c',
  medium: '#a16207',
  low: '#15803d',
}
```

For `CATEGORY_LABELS`, copy the **original** map from `dashboard/theme.ts` verbatim:

```ts
/**
 * The report's original category labels, carried over unchanged.
 *
 * Deliberately NOT derived from PATTERN_CONTENT: spec 7.6 leaves report.ts
 * untouched this project, and deriving these would silently re-voice the PDF.
 * Project 2 decides the report's voice when it splits the consumer and
 * professional reports.
 */
export const CATEGORY_LABELS: Record<string, string> = {
  // Copy all 25 entries verbatim from apps/server/src/trusten/dashboard/theme.ts
  // before deleting that file in step 4.
}
```

- [ ] **Step 2: Re-point `report.ts` and add the dependency**

In `apps/server/package.json`, add `"@trusten/ui": "workspace:*"`. In `report.ts`, change:

```ts
import { CATEGORY_LABELS, GRADE_COLOR, SEVERITY_COLOR } from './dashboard/theme'
```

to:

```ts
import { CATEGORY_LABELS, GRADE_COLOR, SEVERITY_COLOR } from '@trusten/ui/content'
```

- [ ] **Step 3: Strip the HTML routes**

In `routes.ts`, delete the `ui.ts` import block and these handlers: `app.get('/')`, `/audit`, `/history`, `/leaderboard`, `/site/:domain`, `/scan/:id`. **Keep** every `/api/*` handler and the three report asset routes (`/report/:id/screenshot/:step`, `/report/:id/video`, `/report/:id/pdf`).

- [ ] **Step 4: Delete the old renderer**

```bash
git rm apps/server/src/trusten/dashboard/ui.ts apps/server/src/trusten/dashboard/theme.ts
```

- [ ] **Step 5: Verify nothing still references them**

Run: `grep -rn "dashboard/ui\|dashboard/theme" apps packages --include=*.ts`
Expected: no matches.
Run: `bun run typecheck`
Expected: exit 0 for all workspaces.

- [ ] **Step 6: Verify both halves still work**

Start the API (`bun run start`) and the web app (`bun run dev:web`).
Expected: `http://localhost:9200/trusten/api/stats` returns JSON; `http://localhost:9200/trusten` now 404s (correct — the UI moved); `http://localhost:5173` serves the dashboard. Run a Deep Scan and confirm the PDF still generates with its category labels intact.

- [ ] **Step 7: Commit**

```bash
bunx biome check --write apps packages
git add -A apps/server packages/ui
git commit -m "refactor(server): remove template-string dashboard in favour of SvelteKit app"
```

---

## Task 18: End-to-end journeys, accessibility assertions, and CI

**Files:**
- Create: `apps/web/playwright.config.ts`, `apps/web/e2e/result.spec.ts`, `apps/web/e2e/audit.spec.ts`
- Modify: `.github/workflows/code-quality.yml`

- [ ] **Step 1: Verify Playwright runs at all — the flagged risk**

The README records that Playwright cannot launch under Bun (its pipe transport needs inherited file descriptors Bun does not provide), which is why the scanner uses Puppeteer. That applies to the runner process too, so the suite runs under **Node**.

```bash
cd apps/web
npm install -D @playwright/test @axe-core/playwright
npx playwright install chromium
npx playwright --version
```

Expected: a version prints. **If this fails under Node**, stop and fall back to Puppeteer-driven end-to-end tests under `bun test` — worse to author, proven in this repo.

- [ ] **Step 2: Configure Playwright**

Create `apps/web/playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:5173' },
  webServer: {
    command: 'bun run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
})
```

- [ ] **Step 3: Write the result-page journey**

Create `apps/web/e2e/result.spec.ts`:

```ts
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('a result page reads plainly and is accessible', async ({ page }) => {
  const res = await page.request.get(
    'http://localhost:9200/trusten/api/history?limit=1',
  )
  const { scans } = await res.json()
  test.skip(scans.length === 0, 'no scans in the database to render')

  await page.goto(`/scan/${scans[0].id}`)

  // The voice rules from the spec, enforced.
  const body = await page.textContent('body')
  expect(body).not.toMatch(/confidence/i)
  expect(body).not.toMatch(/\b0\.\d\d\b/)
  expect(body).not.toMatch(/roach motel|zuckering|confirmshaming/i)

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze()
  expect(results.violations).toEqual([])
})

test('body text is at least 18px', async ({ page }) => {
  await page.goto('/')
  const size = await page.evaluate(() =>
    Number.parseFloat(getComputedStyle(document.body).fontSize),
  )
  expect(size).toBeGreaterThanOrEqual(18)
})
```

- [ ] **Step 4: Write the home-page journey**

Create `apps/web/e2e/audit.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test('the home page asks for one thing', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByLabel('Website address')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Check this site' })).toBeVisible()
})

test('an empty submission explains itself in a sentence', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Check this site' }).click()
  const alert = page.getByRole('alert')
  await expect(alert).toBeVisible()
  await expect(alert).toContainText('Please type')
})

test('every interactive target meets the 44px minimum', async ({ page }) => {
  await page.goto('/')
  for (const el of await page.locator('button, a, input').all()) {
    const box = await el.boundingBox()
    if (box) expect(box.height).toBeGreaterThanOrEqual(44)
  }
})
```

- [ ] **Step 5: Run the suites**

```bash
cd apps/web && npx playwright test
```

Expected: PASS. An axe violation names the rule and the element — fix the markup, never the assertion.

- [ ] **Step 6: Add the CI job**

In `.github/workflows/code-quality.yml`, add a job alongside the existing one:

```yaml
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.6
      - run: bun install --frozen-lockfile
      - name: Unit tests
        run: bun test
      - name: Component tests
        run: bun run --filter @trusten/ui test:components
```

Leave the Playwright suite out of CI for now — it needs both servers and a browser download. Note it as follow-up work in the PR description.

- [ ] **Step 7: Commit and open the PR**

```bash
git add apps/web .github/workflows/code-quality.yml
git commit -m "test: add end-to-end journeys, axe assertions and a CI test job"
git push -u origin feat/sveltekit-dashboard
gh pr create --title "feat(web): rebuild dashboard on SvelteKit in plain language" --body "Implements docs/superpowers/specs/2026-08-28-sveltekit-dashboard-design.md"
```

---

## Verification checklist

Before marking the plan complete, confirm each against the spec:

- [ ] No confidence figure, no `/100` score, no deduction arithmetic on any reader-facing surface (§2.2).
- [ ] All 25 categories have plain-language content and the completeness test passes (§5.1–5.2).
- [ ] Analyzer text and formal citations are present but demoted behind labelled disclosures — not deleted, because project 2's professional report needs them primary (§5.3, §7.2.1).
- [ ] Findings below 0.7 confidence appear in a collapsed group, not the main list (§5.4).
- [ ] Four internal severity levels render as three, each with colour **and** word **and** icon (§5.5, §2.3).
- [ ] Result page is single-column; no two-pane inspector, no tab switcher (§6.2).
- [ ] Each finding's screenshot is cropped to its own `boundingBox` with the highlight drawn as SVG, not burned in (§6.2).
- [ ] `/audit` does not redirect on completion — the timeline becomes the result in place (§6.4).
- [ ] Body text ≥18px, targets ≥44px, axe passes at WCAG AA, page usable at 200% zoom (§2.3).
- [ ] `packages/ui/src/domain/` imports nothing from SvelteKit, and no `fetch` or store at module scope (§7.2).
- [ ] `ui.ts` and `theme.ts` are deleted; `bun run typecheck` passes across all workspaces (§7.6).
- [ ] Deep Scan still produces a PDF with correct category labels (§7.6).
