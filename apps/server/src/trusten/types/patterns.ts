/**
 * Trusten — dark-pattern domain types.
 *
 * Re-exported from @trusten/shared/domain, which is the source of truth so the
 * web client and the server cannot drift. Kept as a module here so existing
 * imports from '../types' continue to work unchanged.
 */
export {
  type BoundingBox,
  DarkPatternCategory,
  type DetectedPattern,
  type ElementEvidence,
  type PatternEvidence,
  Regulation,
  type RegulatoryViolation,
  type Severity,
} from '@trusten/shared/domain'
