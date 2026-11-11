<script lang="ts">
import type { WorkflowStep } from '@trusten/shared/api'
import type { DetectedPattern } from '@trusten/shared/domain'
import {
  CONFIDENCE_PREFIX,
  getPatternAdvice,
  getPatternContent,
  toConfidenceBand,
} from '@trusten/ui/content'
import { Disclosure, SeverityTag } from '@trusten/ui/domain'
import { onMount } from 'svelte'
import { replaceState } from '$app/navigation'
import { page } from '$app/state'
import {
  findingEvidence,
  hasScreenshot,
  stepScreenshotUrl,
} from '$lib/evidence'
import { getJourneyStepContent } from '$lib/journey-content'
import EvidenceViewer from './EvidenceViewer.svelte'

interface Props {
  scanId: string
  steps: WorkflowStep[]
  /** Certain findings, most important first. */
  findings: DetectedPattern[]
  /** Findings we are less sure about, kept in their own group. */
  uncertain: DetectedPattern[]
  /** Shown in place of the list when there is nothing to report. */
  empty?: import('svelte').Snippet
}

let { scanId, steps, findings, uncertain, empty }: Props = $props()

const all = $derived([...findings, ...uncertain])
const pages = $derived(steps.filter(hasScreenshot))
let selectedId = $state<string>()
let pageNumber = $state<number>()
let showUncertain = $state(false)

const selected = $derived(all.find((pattern) => pattern.id === selectedId))
const evidence = $derived(
  selected ? findingEvidence(scanId, steps, selected) : undefined,
)
const shownPage = $derived(
  evidence?.step ??
    pages.find((step) => step.stepNumber === pageNumber) ??
    pages[0],
)

function numberOf(pattern: DetectedPattern): number {
  return all.indexOf(pattern) + 1
}

function pageTitle(step: WorkflowStep | undefined): string {
  if (!step) return 'Page checked'
  return pages.length > 1 ? getJourneyStepContent(step).title : 'Page checked'
}

function select(pattern: DetectedPattern, scroll = false) {
  const opening = selectedId !== pattern.id
  selectedId = opening ? pattern.id : undefined
  if (opening && uncertain.includes(pattern)) showUncertain = true
  const hash = `#finding-${pattern.id}`
  if (opening && location.hash !== hash) replaceState(hash, page.state)
  if (scroll)
    requestAnimationFrame(() =>
      document
        .getElementById(`finding-${pattern.id}`)
        ?.scrollIntoView({ block: 'start', behavior: 'smooth' }),
    )
}

function showPage(step: WorkflowStep) {
  selectedId = undefined
  pageNumber = step.stepNumber
}

function normalize(text: string | undefined): string {
  return (text ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** A step's copy of a finding may have been merged into one with another id. */
function findById(id: string): DetectedPattern | undefined {
  const direct = all.find((candidate) => candidate.id === id)
  if (direct) return direct
  const copy = steps
    .flatMap((step) => step.patternsFound)
    .find((candidate) => candidate.id === id)
  if (!copy) return undefined
  return all.find(
    (candidate) =>
      candidate.category === copy.category &&
      normalize(candidate.element?.text) === normalize(copy.element?.text),
  )
}

function selectFromHash() {
  if (!location.hash.startsWith('#finding-')) return
  const pattern = findById(
    decodeURIComponent(location.hash.slice('#finding-'.length)),
  )
  if (!pattern) return
  if (selectedId !== pattern.id) select(pattern, true)
  else
    document
      .getElementById(`finding-${pattern.id}`)
      ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}

function concernsOn(step: WorkflowStep): DetectedPattern[] {
  return all.filter(
    (pattern) => findingEvidence(scanId, steps, pattern).step === step,
  )
}

onMount(() => {
  if (location.hash.startsWith('#finding-')) selectFromHash()
  if (!selectedId && findings[0]) selectedId = findings[0].id
  window.addEventListener('hashchange', selectFromHash)
  return () => window.removeEventListener('hashchange', selectFromHash)
})
</script>

{#snippet viewer()}
  {#if selected && evidence}
    <EvidenceViewer
      src={evidence.src}
      box={evidence.box}
      marker={String(numberOf(selected))}
      alt="Where “{getPatternContent(selected.category).name}” appeared on {pageTitle(evidence.step).toLowerCase()}"
      caption={evidence.box
        ? `${pageTitle(evidence.step)} · concern ${numberOf(selected)} is outlined`
        : evidence.src
          ? `${pageTitle(evidence.step)} · we could not mark the exact spot for this concern`
          : pageTitle(evidence.step)}
    />
  {:else if shownPage}
    <EvidenceViewer
      src={stepScreenshotUrl(scanId, shownPage)}
      alt="Screenshot of {pageTitle(shownPage).toLowerCase()}"
      caption="{pageTitle(shownPage)} · captured {new Date(shownPage.timestamp).toLocaleString()}"
    />
  {/if}
{/snippet}

{#snippet concern(pattern: DetectedPattern)}
  {@const content = getPatternContent(pattern.category)}
  {@const open = selectedId === pattern.id}
  {@const found = findingEvidence(scanId, steps, pattern)}
  <li id="finding-{pattern.id}" class="concern" class:concern-open={open}>
    <button
      type="button"
      class="concern-toggle"
      aria-expanded={open}
      aria-controls="concern-{pattern.id}"
      onclick={() => select(pattern)}
    >
      <span class="concern-number" aria-hidden="true">{numberOf(pattern)}</span>
      <span class="min-w-0 flex-1">
        <span class="flex flex-wrap items-center gap-2">
          <strong class="text-lg">{content.name}</strong>
          <SeverityTag severity={pattern.severity} />
        </span>
        {#if pattern.element?.text}
          <span class="concern-quote">“{pattern.element.text}”</span>
        {/if}
        {#if pages.length > 1 && found.step}
          <span class="mt-1 block text-sm text-base-content/65">On: {pageTitle(found.step)}</span>
        {/if}
      </span>
      <span class="concern-chevron" aria-hidden="true">{open ? '−' : '+'}</span>
    </button>

    {#if open}
      <div id="concern-{pattern.id}" class="concern-body">
        <p class="mt-0 max-w-measure">
          {CONFIDENCE_PREFIX[toConfidenceBand(pattern.confidence)]} this: {content.what}
        </p>
        <div class="lg:hidden mb-4">{@render viewer()}</div>
        <section class="rounded-box border border-primary/20 bg-primary/10 p-4" aria-label="What you can do">
          <h4 class="mt-0 mb-1 font-bold">What you can do</h4>
          <p class="m-0 max-w-measure">{getPatternAdvice(pattern.category)}</p>
        </section>
        <Disclosure label="Why this matters and how to spot it">
          <p class="mt-0">{content.why}</p>
          <p class="mb-0"><strong>How to spot it yourself:</strong> {content.watchFor}</p>
        </Disclosure>
        <Disclosure label="Is this allowed?">
          <p class="mt-0">{content.lawPlain}</p>
          {#if pattern.regulatoryViolations.length > 0}
            {#if content.contested}
              <p class="mt-2 mb-0">Rules regulators have pointed to when challenging designs like this:</p>
            {/if}
            {#each pattern.regulatoryViolations as violation (violation.article)}
              <p class="mt-2 mb-0"><strong>{violation.regulation} {violation.article}</strong> — {violation.description}</p>
            {/each}
          {/if}
        </Disclosure>
        <Disclosure label="How we worked this out">
          <p class="mt-0">This is the scanner’s detailed note. It may use technical language.</p>
          <p class="mt-2">{pattern.description}</p>
          {#if pattern.element?.selector}
            <p class="mt-2 mb-0">Found at: <code>{pattern.element.selector}</code></p>
          {/if}
        </Disclosure>
      </div>
    {/if}
  </li>
{/snippet}

<section class="mt-12" aria-labelledby="findings-heading">
  <div class="mb-6">
    <div class="badge badge-secondary badge-outline font-bold">What you should know</div>
    <h2 id="findings-heading" class="mt-3 mb-0 font-bold text-3xl">What we found</h2>
    {#if all.length > 0}
      <p class="mt-2 mb-0 max-w-measure text-base-content/65">
        Choose a concern to see where it appeared and what you can do about it.
      </p>
    {/if}
  </div>

  <div class="inspector grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
    <div class="min-w-0">
      {#if findings.length === 0 && uncertain.length === 0}
        {@render empty?.()}
        {#if pages.length > 0}
          <div class="mt-6 lg:hidden">{@render viewer()}</div>
        {/if}
      {:else}
        {#if findings.length > 0}
          <ol class="concern-list">
            {#each findings as pattern (pattern.id)}
              {@render concern(pattern)}
            {/each}
          </ol>
        {:else}
          <p class="mt-0 max-w-measure text-base-content/70">
            We are not sure about anything we found. Review the evidence below before drawing a conclusion.
          </p>
        {/if}

        {#if uncertain.length > 0}
          <div class="mt-6">
{#if findings.length > 0}
            <button
              type="button"
              class="btn btn-ghost btn-sm px-0 text-primary"
              aria-expanded={showUncertain}
              onclick={() => (showUncertain = !showUncertain)}
            >
              {showUncertain ? 'Hide' : 'Show'} {uncertain.length} less certain {uncertain.length === 1 ? 'concern' : 'concerns'}
            </button>
            {/if}
            {#if showUncertain || findings.length === 0}
              <p class="mt-2 mb-3 max-w-measure text-sm text-base-content/65">We are less sure about these, so they are kept separate.</p>
              <ol class="concern-list">
                {#each uncertain as pattern (pattern.id)}
                  {@render concern(pattern)}
                {/each}
              </ol>
            {/if}
          </div>
        {/if}
      {/if}
    </div>

    {#if pages.length > 0 || all.length > 0}
      <aside class="inspector-viewer hidden lg:block" aria-label="Page evidence">
        {#if pages.length > 1}
          <div class="mb-3 flex flex-wrap gap-2" role="group" aria-label="Pages checked">
            {#each pages as step, index (step.stepNumber)}
              {@const count = concernsOn(step).length}
              <button
                type="button"
                class="btn btn-sm {shownPage === step ? 'btn-primary' : 'btn-ghost'}"
                aria-pressed={shownPage === step}
                title={pageTitle(step)}
                onclick={() => showPage(step)}
              >
                {index + 1}. {pageTitle(step)}{count > 0 ? ` (${count})` : ''}
              </button>
            {/each}
          </div>
        {/if}
        {@render viewer()}
        {#if !selected && shownPage && concernsOn(shownPage).length > 0}
          <ul class="mt-3 flex list-none flex-wrap gap-2 p-0">
            {#each concernsOn(shownPage) as pattern (pattern.id)}
              <li>
                <button type="button" class="btn btn-outline btn-xs" onclick={() => select(pattern, true)}>
                  {numberOf(pattern)}. {getPatternContent(pattern.category).name}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </aside>
    {/if}
  </div>
</section>
