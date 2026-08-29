<script lang="ts">
import type { DetectedPattern } from '@trusten/shared/domain'
import { CONFIDENCE_PREFIX, toConfidenceBand } from '../content/confidence'
import { getPatternContent } from '../content/patterns'
import type { ImageSize } from './crop'
import Disclosure from './Disclosure.svelte'
import EvidenceShot from './EvidenceShot.svelte'
import SeverityTag from './SeverityTag.svelte'

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
    {#if pattern.regulatoryViolations.length > 0}
      {#if content.contested}
        <!--
          content.contested means the law here is genuinely unsettled. The
          citations below are what regulators have challenged similar
          designs with, not a finding that this site broke the law — stating
          them plainly would contradict the hedge in lawPlain directly above.
        -->
        <p class="mt-2 mb-0">
          Rules regulators have pointed to when challenging designs like
          this:
        </p>
      {/if}
      {#each pattern.regulatoryViolations as violation (violation.article)}
        <p class="mt-2 mb-0">
          <strong>{violation.regulation} {violation.article}</strong> —
          {violation.description}
        </p>
      {/each}
    {/if}
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
