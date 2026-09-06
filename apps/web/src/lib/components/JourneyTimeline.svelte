<script lang="ts">
import type { WorkflowStep } from '@trusten/shared/api'

interface Props {
  scanId: string
  steps: WorkflowStep[]
}

let { scanId, steps }: Props = $props()

const reached = $derived(
  steps.filter(
    (step) => step.status === 'reached' || step.status === 'observed',
  ).length,
)

function statusLabel(step: WorkflowStep): string {
  if (step.status === 'reached') return 'Reached'
  if (step.status === 'observed') return 'Observed'
  if (step.status === 'skipped') return 'Skipped'
  if (step.status === 'not-reached') return 'Did not advance'
  if (step.status === 'no-navigation') return 'No navigation'
  return 'Checked'
}

function statusClass(step: WorkflowStep): string {
  if (step.status === 'reached' || step.status === 'observed')
    return 'badge-success'
  if (step.status === 'skipped') return 'badge-ghost'
  return 'badge-warning'
}

function screenshotUrl(step: WorkflowStep): string {
  return `/trusten/report/${encodeURIComponent(scanId)}/screenshot/${step.stepNumber}`
}
</script>

<section class="mt-12" aria-labelledby="journey-heading">
  <div class="flex flex-wrap items-end justify-between gap-3">
    <div>
      <div class="badge badge-primary badge-outline font-bold">Evidence trail</div>
      <h2 id="journey-heading" class="mt-3 mb-0 font-bold text-3xl">What Trusten navigated</h2>
      <p class="mt-2 mb-0 text-base-content/65">Reached {reached} of {steps.length} recorded steps. Open a step to see the page and what was found there.</p>
    </div>
    <div class="badge badge-lg badge-neutral">{steps.length} {steps.length === 1 ? 'step' : 'steps'}</div>
  </div>

  <div class="mt-7 space-y-4">
    {#each steps as step, index (step.stepNumber)}
      <details class="collapse-arrow collapse border border-base-300 bg-base-100 shadow-lg" open={index === 0}>
        <summary class="collapse-title min-h-20 pr-14">
          <span class="flex items-center gap-4">
            <span class="badge badge-primary size-10 shrink-0 font-bold">{index + 1}</span>
            <span class="min-w-0 flex-1">
              <strong class="block truncate">{step.action}</strong>
              <small class="block truncate text-base-content/55">{step.url}</small>
            </span>
            <span class="badge {statusClass(step)} hidden sm:inline-flex">{statusLabel(step)}</span>
            {#if step.patternsFound.length > 0}
              <span class="badge badge-error badge-outline hidden sm:inline-flex">{step.patternsFound.length} found</span>
            {/if}
          </span>
        </summary>
        <div class="collapse-content">
          <div class="grid gap-5 border-t border-base-300 pt-5 lg:grid-cols-[1.25fr_.75fr]">
            <figure class="m-0 overflow-hidden rounded-box bg-neutral shadow-inner">
              <img class="block max-h-[34rem] w-full object-contain" src={screenshotUrl(step)} alt="Screenshot after step {index + 1}: {step.action}" loading="lazy" />
              <figcaption class="bg-neutral px-4 py-2 text-sm text-neutral-content/75">Captured at this step</figcaption>
            </figure>
            <div>
              <h3 class="mt-0 font-bold text-xl">What happened</h3>
              <div class="badge {statusClass(step)}">{statusLabel(step)}</div>
              {#if step.navReason}<p class="mt-3 text-sm text-base-content/65">{step.navReason}</p>{/if}
              {#if step.patternsFound.length > 0}
                <h4 class="mt-6 mb-2 font-bold">Found on this page</h4>
                <ul class="menu rounded-box bg-base-200 p-2">
                  {#each step.patternsFound as pattern (pattern.id)}
                    <li><a href="#finding-{pattern.id}">{pattern.description}</a></li>
                  {/each}
                </ul>
              {:else}
                <div class="alert alert-success mt-6 text-sm">No questionable patterns were found at this step.</div>
              {/if}
            </div>
          </div>
        </div>
      </details>
    {/each}
  </div>
</section>
