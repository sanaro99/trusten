/**
 * Picks which links or buttons a journey step should try for a wanted phrase.
 *
 * `rankControls` runs inside the page (serialized with `toString()`), so it
 * must stay self-contained: no imports, no references to module scope.
 */

export interface ControlDescriptor {
  /** Accessible name: aria-label, text, value, title, or icon alt text. */
  label: string
  /** The link target path for `<a href>`, otherwise null. */
  href: string | null
}

/**
 * Indexes of the controls worth trying for `wanted`, best first: exact label,
 * then shorter labels containing the phrase, then icon-only links whose path
 * names it (for example an unlabeled cart icon linking to /cart).
 */
export function rankControls(
  controls: ControlDescriptor[],
  wanted: string,
): number[] {
  const norm = (value: string) =>
    value.toLowerCase().replace(/\s+/g, ' ').trim()
  const phrase = norm(wanted)
  if (!phrase) return []
  // Labels that contain the phrase but lead somewhere else: "Add to cart"
  // when looking for the cart, "Continue shopping" when looking for
  // "continue", "Create account" when looking for the account.
  const distractors: Array<[RegExp, RegExp]> = [
    [/\badd to\b/, /\badd to\b/],
    [
      /\b(continue|keep|back to|return to) (shopping|browsing)\b/,
      /shopping|browsing/,
    ],
    [/\bcreate (an |your )?account\b/, /create/],
  ]
  const misleading = (label: string) =>
    distractors.some(
      ([labelPattern, wantedPattern]) =>
        labelPattern.test(label) && !wantedPattern.test(phrase),
    )
  const slug = phrase
    .replace(/[^a-z0-9 ]/g, '')
    .trim()
    .split(' ')
    .join('[-_]?')
  const pathPattern = slug
    ? new RegExp(`(^|/)${slug}s?(/|$|\\.|\\?|#)`, 'i')
    : null

  const labelled: Array<{ index: number; exact: boolean; length: number }> = []
  const byPath: number[] = []
  controls.forEach((control, index) => {
    const label = norm(control.label)
    if (label && label.indexOf(phrase) >= 0) {
      if (misleading(label)) return
      labelled.push({ index, exact: label === phrase, length: label.length })
      return
    }
    // Only fall back to the link path when the visible label says nothing
    // useful, so a link titled "Shop sale" is never read as the cart.
    const wordy = /[a-z]{3,}/.test(label)
    if (!wordy && control.href && pathPattern) {
      let path = control.href
      try {
        path = new URL(control.href, 'http://x/').pathname
      } catch (_) {
        // keep the raw value
      }
      if (pathPattern.test(path)) byPath.push(index)
    }
  })
  labelled.sort(
    (a, b) => Number(b.exact) - Number(a.exact) || a.length - b.length,
  )
  return labelled.map((entry) => entry.index).concat(byPath)
}

/** In-page helper that describes a control's accessible name. */
export const DESCRIBE_CONTROL = `function describeControl(el) {
  function text(node) { return (node && node.textContent || '').replace(/\\s+/g, ' ').trim(); }
  var label = el.getAttribute('aria-label') || '';
  if (!label && el.getAttribute('aria-labelledby')) {
    label = el.getAttribute('aria-labelledby').split(/\\s+/).map(function (id) { return text(document.getElementById(id)); }).join(' ');
  }
  if (!label) label = text(el);
  if (!label && el.value && el.tagName === 'INPUT') label = el.value;
  if (!label) label = el.getAttribute('title') || '';
  if (!label) {
    var icon = el.querySelector('img[alt], svg title, [aria-label]');
    if (icon) label = icon.getAttribute('alt') || icon.getAttribute('aria-label') || text(icon);
  }
  var href = el.tagName === 'A' ? el.getAttribute('href') : null;
  return { label: label || '', href: href };
}`
