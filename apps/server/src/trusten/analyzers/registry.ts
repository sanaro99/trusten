/**
 * Trusten — Analyzer registry
 *
 * Single source of truth for the set of analyzers plus name→instance lookup.
 * The engine and the agentic workflow discovery both resolve analyzers through
 * here, so adding an analyzer is a one-line change in this file.
 */

import type { BaseAnalyzer } from './base-analyzer'
import { ComparisonPreventionAnalyzer } from './comparison-prevention'
import { ForcedActionAnalyzer } from './forced-action'
import { InterfaceManipulationAnalyzer } from './interface-manipulation'
import { MisdirectionAnalyzer } from './misdirection'
import { NaggingAnalyzer } from './nagging'
import { ObstructionAnalyzer } from './obstruction'
import { PreselectionAnalyzer } from './preselection'
import { PrivacyAnalyzer } from './privacy'
import { SneakingAnalyzer } from './sneaking'
import { UrgencyScarcityAnalyzer } from './urgency-scarcity'
import { VisualAnalyzer } from './visual'

export const ALL_ANALYZERS: BaseAnalyzer[] = [
  new UrgencyScarcityAnalyzer(),
  new MisdirectionAnalyzer(),
  new SneakingAnalyzer(),
  new ObstructionAnalyzer(),
  new ForcedActionAnalyzer(),
  new PreselectionAnalyzer(),
  new NaggingAnalyzer(),
  new ComparisonPreventionAnalyzer(),
  new PrivacyAnalyzer(),
  new InterfaceManipulationAnalyzer(),
  new VisualAnalyzer(),
]

/** Every analyzer's name — used by workflow discovery to validate LLM output. */
export const ANALYZER_NAMES: string[] = ALL_ANALYZERS.map((a) => a.name)

const ANALYZER_BY_NAME = new Map<string, BaseAnalyzer>(
  ALL_ANALYZERS.map((a) => [a.name, a]),
)

/**
 * Resolve analyzer names to instances, dropping any unknown names.
 * Returns all analyzers when `names` is omitted.
 */
export function getAnalyzers(names?: string[]): BaseAnalyzer[] {
  if (!names) return ALL_ANALYZERS
  return names
    .map((name) => ANALYZER_BY_NAME.get(name))
    .filter((a): a is BaseAnalyzer => a !== undefined)
}
