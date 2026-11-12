/**
 * Screenshots that show each finding.
 *
 * The step screenshot shows the page as it was reached. A finding further down
 * the page (a footer link, a fee near the order button) is not in that picture,
 * so extra screenshots are taken with the page scrolled to it. Each finding
 * records which screenshot shows it and where the element sits in that image.
 */

import { logger } from '../lib/logger'
import type { BrowserDriver } from './browser/driver'
import type { BoundingBox, DetectedPattern, EvidenceCapture } from './types'
import { sleep } from './utils/delay'

/** Extra screenshots per step, on top of the step screenshot itself. */
const MAX_EXTRA_VIEWS = 4
const SCAN_ID = /^scan-[A-Za-z0-9-]+$/
const CAPTURE_FILE = /^step-\d+(?:-view-\d+)?\.jpg$/

interface Measurement {
  scrollY: number
  /** One entry per target: the element as fractions of the viewport, or null. */
  boxes: (BoundingBox | null)[]
}

interface Target {
  selector: string
  text: string
  /** Phrases quoted inside a description, tried when `text` is not on the page. */
  quotes?: string[]
}

export function isValidCapture(capture: {
  scanId: string
  file: string
}): boolean {
  return SCAN_ID.test(capture.scanId) && CAPTURE_FILE.test(capture.file)
}

export function captureFileName(stepNumber: number, view: number): string {
  return view === 0
    ? `step-${stepNumber}.jpg`
    : `step-${stepNumber}-view-${view}.jpg`
}

/** Quoted text to look for on the page: whitespace-normalized, cut at a word. */
export function searchText(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= 80) return clean
  const cut = clean.slice(0, 80)
  const space = cut.lastIndexOf(' ')
  return space > 40 ? cut.slice(0, space) : cut
}

/**
 * AI findings often describe the screen ("'Accept All Cookies' (black filled
 * button)") instead of quoting it. The phrases in quotes are the page's own
 * words, so they are what to look for.
 */
export function quotedPhrases(text: string): string[] {
  const phrases: string[] = []
  const pattern =
    /(?<![\p{L}\p{N}])['"‘“]([^'"‘’“”\n]{3,80}?)['"’”](?![\p{L}\p{N}])/gu
  for (const match of text.matchAll(pattern)) {
    const phrase = match[1].replace(/\s+/g, ' ').trim()
    if (phrase.length >= 3 && !phrases.includes(phrase)) phrases.push(phrase)
  }
  return phrases.slice(0, 4)
}

/**
 * In-page script: find each target, optionally scroll one into view first,
 * and report every element's position as fractions of the viewport.
 */
export function buildMeasureScript(
  targets: Target[],
  scrollTo: number | null,
): string {
  return `(function(){
  var targets = ${JSON.stringify(targets)};
  var norm = function(s){ return (s || '').replace(/\\s+/g, ' ').trim().toLowerCase(); };
  var cache = null;
  function textNodes(){
    if (cache) return cache;
    cache = [];
    var all = document.body ? document.body.querySelectorAll('*') : [];
    for (var i = 0; i < all.length; i++) {
      var tag = all[i].tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEMPLATE') continue;
      cache.push([all[i], null]);
    }
    return cache;
  }
  function shown(el){
    var r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  }
  // A quote that spans unrelated parts of the page only matches a huge
  // container; pointing at that would highlight nothing useful.
  function compact(el){
    if (el === document.body || el === document.documentElement || !shown(el)) return false;
    return el.getBoundingClientRect().height <= (window.innerHeight || 800) * 1.5;
  }
  function byText(needle){
    var nodes = textNodes(), match = null;
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i][0];
      // Descendants follow their ancestor: stop once past the first occurrence.
      if (match && !match.contains(el)) break;
      if (nodes[i][1] === null) nodes[i][1] = norm(el.textContent);
      if (nodes[i][1].indexOf(needle) !== -1 && compact(el)) match = el;
    }
    return match;
  }
  function locate(t){
    var needle = norm(t.text);
    var bySelector = null;
    if (t.selector) {
      try {
        bySelector = document.querySelector(t.selector);
        if (bySelector && !shown(bySelector)) bySelector = null;
      } catch (e) {}
    }
    // Some selectors are broad guesses; trust them only when the quote agrees.
    if (bySelector && (needle.length < 4 || norm(bySelector.textContent).indexOf(needle) !== -1)) return bySelector;
    var hit = (needle.length >= 4 && byText(needle)) || bySelector;
    var quotes = t.quotes || [];
    for (var q = 0; !hit && q < quotes.length; q++) {
      var phrase = norm(quotes[q]);
      if (phrase.length >= 3) hit = byText(phrase);
    }
    return hit;
  }
  var found = targets.map(locate);
  if (${scrollTo === null ? 'false' : 'true'}) {
    var el = found[${scrollTo ?? -1}];
    if (el) { try { el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (e) {} }
  }
  var vw = window.innerWidth || 1, vh = window.innerHeight || 1;
  var boxes = found.map(function(el){
    if (!el) return null;
    var r = el.getBoundingClientRect();
    var left = Math.max(0, r.left), top = Math.max(0, r.top);
    var right = Math.min(vw, r.right), bottom = Math.min(vh, r.bottom);
    if (right - left < 2 || bottom - top < 2) return null;
    // Mostly hidden above or below the screen: another view will show it whole.
    if ((bottom - top) < Math.min(r.height, vh) * 0.6) return null;
    return { x: left / vw, y: top / vh, width: (right - left) / vw, height: (bottom - top) / vh };
  });
  return JSON.stringify({ scrollY: window.scrollY || 0, boxes: boxes });
})()`
}

async function measure(
  browser: BrowserDriver,
  pageId: number,
  targets: Target[],
  scrollTo: number | null,
): Promise<Measurement | null> {
  const result = await browser.evaluate(
    pageId,
    buildMeasureScript(targets, scrollTo),
  )
  if (typeof result.value !== 'string') return null
  try {
    const parsed = JSON.parse(result.value) as Partial<Measurement>
    return Array.isArray(parsed.boxes) && parsed.boxes.length === targets.length
      ? { scrollY: Number(parsed.scrollY) || 0, boxes: parsed.boxes }
      : null
  } catch {
    return null
  }
}

/**
 * Take the step screenshot plus up to four extra views, and attach to each
 * finding the screenshot that shows it. Findings that cannot be found on the
 * page point at the step screenshot without a box. Never throws: a failed
 * capture leaves the findings without screenshots.
 */
export async function captureStepEvidence(
  browser: BrowserDriver,
  pageId: number,
  opts: {
    scanId: string
    dir: string
    stepNumber: number
    patterns: DetectedPattern[]
  },
): Promise<{ screenshotB64: string; screenshotPath: string }> {
  const [fs, path] = await Promise.all([import('node:fs'), import('node:path')])
  const pending = opts.patterns.filter(
    (pattern) => !pattern.evidence.capture && pattern.source !== 'deep-cache',
  )
  const targets: Target[] = pending.map((pattern) => ({
    selector: pattern.element?.selector ?? '',
    text: searchText(pattern.element?.text ?? ''),
    quotes: quotedPhrases(pattern.element?.text ?? ''),
  }))

  const shoot = async (view: number) => {
    const { data } = await browser.screenshot(pageId, {
      format: 'jpeg',
      quality: 82,
      fullPage: false,
    })
    const file = captureFileName(opts.stepNumber, view)
    const filePath = path.join(opts.dir, file)
    fs.writeFileSync(filePath, Buffer.from(data, 'base64'))
    return { data, file, filePath }
  }
  const attach = (index: number, file: string, box?: BoundingBox) => {
    const capture: EvidenceCapture = { scanId: opts.scanId, file }
    if (box) capture.box = box
    pending[index].evidence = { ...pending[index].evidence, capture }
  }

  let main: { data: string; file: string; filePath: string }
  let start: Measurement | null = null
  try {
    start = await measure(browser, pageId, targets, null).catch(() => null)
    main = await shoot(0)
  } catch {
    return { screenshotB64: '', screenshotPath: '' }
  }

  const placed = new Set<number>()
  start?.boxes.forEach((box, index) => {
    if (!box) return
    attach(index, main.file, box)
    placed.add(index)
  })

  try {
    let view = 0
    for (
      let attempt = 0;
      attempt < targets.length && view < MAX_EXTRA_VIEWS;
      attempt++
    ) {
      const next = targets.findIndex(
        (target, index) =>
          !placed.has(index) && (target.selector || target.text.length >= 4),
      )
      if (next === -1) break
      const before = await measure(browser, pageId, targets, next)
      await sleep(250)
      const after = await measure(browser, pageId, targets, null)
      if (!before || !after || !after.boxes[next]) {
        // Not on the page after all; stop trying this one.
        placed.add(next)
        continue
      }
      view++
      const shot = await shoot(view)
      after.boxes.forEach((box, index) => {
        if (!box || placed.has(index)) return
        attach(index, shot.file, box)
        placed.add(index)
      })
    }
  } catch (err) {
    logger.warn('Trusten: extra finding screenshots failed', {
      error: String(err),
    })
  } finally {
    if (start) {
      await browser
        .evaluate(pageId, `window.scrollTo(0, ${Number(start.scrollY) || 0})`)
        .catch(() => undefined)
    }
  }

  pending.forEach((pattern, index) => {
    if (!pattern.evidence.capture) attach(index, main.file)
  })
  return { screenshotB64: main.data, screenshotPath: main.filePath }
}

/** Folder holding a scan's screenshots, taken from its own saved steps. */
export function captureDirectory(
  scanId: string,
  steps: readonly { screenshotPath?: string }[],
  reportsDir: string,
): string {
  for (const step of steps) {
    const parts = step.screenshotPath?.split(/[\\/]/) ?? []
    if (parts.length > 1 && parts[parts.length - 2] === scanId)
      return parts.slice(0, -1).join('/')
  }
  return `${reportsDir}/screenshots/${scanId}`
}
