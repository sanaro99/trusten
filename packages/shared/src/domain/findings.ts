import type { DetectedPattern } from './patterns'

function isCountdown(pattern: DetectedPattern): boolean {
  return /timer|countdown|\b\d{1,2}\s*(?::\s*\d{2}|h\s*:|h\s+\d)/i.test(
    `${pattern.element?.selector ?? ''} ${pattern.element?.text ?? ''}`,
  )
}

function sameCountdown(a: DetectedPattern, b: DetectedPattern): boolean {
  if (!isCountdown(a) || !isCountdown(b)) return false
  const clockOnly = (text: string) =>
    /^\s*\d{1,2}\s*(?::\s*\d{2}|h\s*:|h\s+\d)[\d\s:ms]*$/i.test(text)
  const first = a.element?.text ?? ''
  const second = b.element?.text ?? ''
  // A generic DOM label can complement a visual clock, but two named offers
  // must never merge merely because both contain countdowns.
  return (
    (first === 'Countdown timer' && clockOnly(second)) ||
    (second === 'Countdown timer' && clockOnly(first))
  )
}

/** Merge overlapping evidence of the same choice, preserving distinct choices. */
export function consolidateFindings(
  patterns: readonly DetectedPattern[],
): DetectedPattern[] {
  const result: DetectedPattern[] = []
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
  const rank = { low: 0, medium: 1, high: 2, critical: 3 }
  for (const pattern of patterns) {
    const text = normalize(pattern.element?.text ?? '')
    const existing = result.find((p) => {
      if (
        p.category !== pattern.category ||
        p.url.split('#')[0] !== pattern.url.split('#')[0]
      )
        return false
      if (
        p.element?.selector &&
        pattern.element?.selector &&
        p.element.selector !== pattern.element.selector
      )
        return false
      const previous = normalize(p.element?.text ?? '')
      return (
        (p.category === 'fake_urgency' && sameCountdown(p, pattern)) ||
        (text.length >= 8 &&
          previous.length >= 8 &&
          (text.includes(previous) || previous.includes(text))) ||
        (p.description === pattern.description && text === previous)
      )
    })
    if (!existing) {
      result.push({ ...pattern })
      continue
    }
    const otherElement = pattern.element
    const currentElement = existing.element
    if (
      otherElement &&
      (!currentElement ||
        currentElement.text === 'Countdown timer' ||
        otherElement.text.length > currentElement.text.length)
    ) {
      existing.element = {
        ...otherElement,
        selector: otherElement.selector || currentElement?.selector || '',
        boundingBox: otherElement.boundingBox ?? currentElement?.boundingBox,
      }
    } else if (currentElement && otherElement) {
      existing.element = {
        ...currentElement,
        selector: currentElement.selector || otherElement.selector,
        boundingBox: currentElement.boundingBox ?? otherElement.boundingBox,
      }
    }
    if (rank[pattern.severity] > rank[existing.severity])
      existing.severity = pattern.severity
    existing.confidence = Math.max(existing.confidence, pattern.confidence)
    existing.evidence = {
      ...pattern.evidence,
      ...Object.fromEntries(
        Object.entries(existing.evidence).filter(
          ([, value]) => value !== undefined,
        ),
      ),
    }
  }
  return result
}

export function isPurchaseLimitClaim(text: string): boolean {
  return (
    /\blimit(?:ed to)?\s+\d+\b/i.test(text) &&
    !/\b(?:stock|left|remaining|sold out|selling fast|inventory)\b/i.test(text)
  )
}

/**
 * Retail fine print such as "Limited quantities. No rainchecks." limits the
 * seller's promise; it is not a claim that stock is about to run out.
 */
export function isStockDisclaimer(text: string): boolean {
  return (
    /\b(?:limited\s+quantit(?:y|ies)|while\s+(?:supplies|stocks?)\s+lasts?|no\s+rain\s?checks?|quantities\s+(?:are\s+)?limited)\b/i.test(
      text,
    ) && !/\b(?:only\s+\d+|\d+\s+(?:left|remaining))\b/i.test(text)
  )
}

/** Reject model claims that do not contain the evidence their category needs. */
export function hasCategoryEvidence(
  category: string,
  text: string,
  hasPreviousStep = false,
): boolean {
  if (category === 'fake_scarcity')
    return !isPurchaseLimitClaim(text) && !isStockDisclaimer(text)
  // HH:MM alone is usually a time of day; a running countdown shows seconds.
  const pressure =
    /countdown|timer|\blimited[ -]time\b|\b(?:today only|ends? (?:soon|today|tonight|in)|expires?|hurry|last chance|act now)\b|\b\d{1,2}\s*:\s*\d{2}\s*:\s*\d{2}\b|\d+h\s*:/i
  if (category === 'fake_urgency') return pressure.test(text)
  if (category === 'fake_hierarchy' && pressure.test(text))
    return /\b(?:accept|reject|decline|choose|choice|option|plan|button|recommended)\b/i.test(
      text,
    )
  if (category === 'drip_pricing')
    return (
      /[$£€¥₹]|\b(?:fee|surcharge|charge|cost|price)\b/i.test(text) &&
      (hasPreviousStep ||
        /\b(?:added|additional|extra|excluded|not included|mandatory|plus|at checkout)\b/i.test(
          text,
        ))
    )
  return true
}
