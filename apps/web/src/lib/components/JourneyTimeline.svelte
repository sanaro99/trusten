<script lang="ts">
import type { WorkflowStep } from '@trusten/shared/api'
import { getPatternContent } from '@trusten/ui/content'
import {
  completedJourneySteps,
  getJourneyStepContent,
} from '$lib/journey-content'

interface Props {
  scanId: string
  steps: WorkflowStep[]
}

let { scanId, steps }: Props = $props()
let selected = $state<WorkflowStep>()
let dialog = $state<HTMLDialogElement>()

const reached = $derived(completedJourneySteps(steps))

function screenshotUrl(step: WorkflowStep): string {
  return `/trusten/report/${encodeURIComponent(scanId)}/screenshot/${step.stepNumber}`
}

function openStep(step: WorkflowStep) {
  selected = step
  requestAnimationFrame(() => dialog?.showModal())
}

function closeStep() {
  dialog?.close()
}
</script>

<section class="mt-12" aria-labelledby="journey-heading">
  <div class="flex flex-wrap items-end justify-between gap-3">
    <div>
      <div class="badge badge-primary badge-outline font-bold">Evidence trail</div>
      <h2 id="journey-heading" class="mt-3 mb-0 font-bold text-3xl">How far we could check</h2>
      <p class="mt-2 mb-0 max-w-measure text-base-content/65">
        We completed {reached} of {steps.length} steps. Choose a step to see the page evidence and what happened.
      </p>
    </div>
    <div class="badge badge-lg badge-neutral">{reached}/{steps.length} completed</div>
  </div>

  <ol class="mt-7 grid list-none gap-0 p-0 md:grid-cols-[repeat(var(--step-count),minmax(0,1fr))]" style:--step-count={steps.length}>
    {#each steps as step, index (step.stepNumber)}
      {@const content = getJourneyStepContent(step)}
      <li class="relative pb-5 pl-12 md:px-2 md:pb-0 md:pt-12">
        {#if index < steps.length - 1}
          <span aria-hidden="true" class="absolute bottom-0 left-[1.15rem] top-9 w-1 rounded-full bg-base-300 md:left-1/2 md:right-[-50%] md:top-[1.15rem] md:h-1 md:w-auto"></span>
        {/if}
        <span aria-hidden="true" class="absolute left-0 top-2 z-10 grid size-10 place-items-center rounded-full border-4 border-base-100 font-bold shadow-md md:left-1/2 md:top-0 md:-translate-x-1/2 {content.status === 'complete' ? 'bg-success text-success-content' : content.status === 'blocked' ? 'bg-warning text-warning-content' : 'bg-base-300 text-base-content/70'}">
          {content.status === 'complete' ? '✓' : index + 1}
        </span>
        <button
          type="button"
          class="card min-h-full w-full border border-base-300 bg-base-100 text-left shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          aria-label="Open evidence for step {index + 1}: {content.title}"
          onclick={() => openStep(step)}
        >
          <span class="card-body gap-2 p-4">
            <span class="badge {content.status === 'complete' ? 'badge-success' : content.status === 'blocked' ? 'badge-warning' : 'badge-ghost'}">{content.statusLabel}</span>
            <strong>{content.title}</strong>
            <span class="text-sm text-base-content/65">{content.description}</span>
            {#if step.patternsFound.length > 0}
              <span class="mt-1 text-sm font-semibold text-error">{step.patternsFound.length} {step.patternsFound.length === 1 ? 'concern' : 'concerns'} found</span>
            {/if}
          </span>
        </button>
      </li>
    {/each}
  </ol>
</section>

<dialog bind:this={dialog} class="modal modal-bottom sm:modal-middle" aria-labelledby="step-dialog-title" onclose={() => (selected = undefined)}>
  {#if selected}
    {@const content = getJourneyStepContent(selected)}
    <div class="modal-box max-w-4xl border border-base-300 bg-base-100 p-0 shadow-2xl">
      <header class="flex items-start justify-between gap-4 border-b border-base-300 p-5 md:p-6">
        <div>
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <span class="badge badge-primary">Step {selected.stepNumber}</span>
            <span class="badge {content.status === 'complete' ? 'badge-success' : content.status === 'blocked' ? 'badge-warning' : 'badge-ghost'}">{content.statusLabel}</span>
          </div>
          <h3 id="step-dialog-title" class="m-0 text-2xl font-bold">{content.title}</h3>
          <p class="mt-1 mb-0 text-sm text-base-content/70">{content.pageLabel}</p>
        </div>
        <button type="button" class="btn btn-circle btn-ghost" aria-label="Close step details" onclick={closeStep}>✕</button>
      </header>

      <div class="grid gap-6 p-5 md:p-6 lg:grid-cols-[1.25fr_.75fr]">
        <figure class="m-0 overflow-hidden rounded-box bg-neutral shadow-inner">
          <img class="block max-h-[34rem] w-full object-contain" src={screenshotUrl(selected)} alt="Page captured while checking {content.title.toLowerCase()}" loading="lazy" />
          <figcaption class="bg-neutral px-4 py-2 text-sm text-neutral-content/75">Evidence captured at this step</figcaption>
        </figure>
        <div>
          <h4 class="mt-0 mb-2 text-lg font-bold">What happened</h4>
          <p class="mt-0 text-base-content/75">{content.outcome}</p>

          {#if selected.patternsFound.length > 0}
            <h4 class="mt-6 mb-2 text-lg font-bold">Concerns found here</h4>
            <ul class="menu rounded-box bg-base-200 p-2">
              {#each selected.patternsFound as pattern (pattern.id)}
                <li><a href="#finding-{pattern.id}" onclick={closeStep}>{getPatternContent(pattern.category).name}</a></li>
              {/each}
            </ul>
          {:else if content.status === 'complete'}
            <div class="alert alert-success mt-6 text-sm">We did not find a concern on this page.</div>
          {/if}

          <details class="collapse-arrow collapse mt-6 bg-base-200">
            <summary class="collapse-title min-h-12 font-semibold text-primary">Technical details</summary>
            <div class="collapse-content break-words text-sm text-base-content/65">
              <p><strong>Scanner instruction:</strong> {selected.action}</p>
              <p><strong>Page address:</strong> {selected.url}</p>
              {#if selected.navReason}<p><strong>Navigation record:</strong> {selected.navReason}</p>{/if}
            </div>
          </details>
        </div>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button aria-label="Close step details">Close</button></form>
  {/if}
</dialog>
