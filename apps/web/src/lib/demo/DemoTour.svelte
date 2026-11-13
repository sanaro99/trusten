<script lang="ts">
import { onMount, tick } from 'svelte'
import { goto } from '$app/navigation'
import { page } from '$app/state'
import { isOnStepPage, stepPath, tourSteps } from './tour'
import { beginTour, tour } from './tour-state.svelte'

let ready = $state(false)
let minimized = $state(false)
let heading = $state<HTMLElement>()

const steps = $derived(tourSteps(tour.picks))
const index = $derived(Math.max(0, Math.min(tour.index, steps.length - 1)))
const step = $derived(steps[index])
const last = $derived(index === steps.length - 1)
const here = $derived(
  step ? isOnStepPage(page.url.pathname, step, tour.picks) : false,
)

onMount(() => {
  tour.load()
  ready = true
  // A shared link such as /demo?tour=1 starts the tour straight away.
  if (page.url.searchParams.has('tour')) beginTour()
})

async function show(next: number) {
  const target = steps[next]
  if (!target) return
  tour.go(next)
  minimized = false
  await goto(stepPath(target, tour.picks), { noScroll: true })
  await tick()
  heading?.focus({ preventScroll: true })
}

async function finish() {
  tour.end()
  if (page.url.pathname !== '/demo') await goto('/demo')
}

// Point at this step's part of the page once it has rendered.
$effect(() => {
  if (!ready || !tour.active || !here || !step?.target) return
  const selector = step.target
  let marked: Element | null = null
  const timer = setTimeout(() => {
    marked = document.querySelector(selector)
    if (!marked) return
    marked.classList.add('tour-spotlight')
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // Tall sections start at their heading; small ones sit mid-screen.
    const tall =
      marked.getBoundingClientRect().height > window.innerHeight * 0.6
    marked.scrollIntoView({
      block: tall ? 'start' : 'center',
      behavior: still ? 'auto' : 'smooth',
    })
  }, 200)
  return () => {
    clearTimeout(timer)
    marked?.classList.remove('tour-spotlight')
  }
})
</script>

{#if ready && tour.active && step}
  {#if minimized}
    <button class="tour-pill btn btn-primary shadow-xl" type="button" onclick={() => (minimized = false)} aria-label="Show the guided tour, step {index + 1} of {steps.length}">
      Tour · {index + 1}/{steps.length} <span aria-hidden="true">&uarr;</span>
    </button>
  {:else}
    <aside class="tour-card card border border-primary/25 bg-base-100 shadow-2xl" aria-label="Guided tour" data-testid="demo-tour">
      <div class="card-body gap-3 p-5">
        <div class="flex items-center justify-between gap-3">
          <p class="m-0 text-xs font-bold uppercase tracking-widest text-primary">Guided tour · {index + 1} of {steps.length}</p>
          <button class="btn btn-ghost btn-xs" type="button" onclick={() => (minimized = true)}>Hide</button>
        </div>
        <progress class="progress progress-primary h-1.5 w-full" value={index + 1} max={steps.length} aria-hidden="true"></progress>
        <h2 class="m-0 text-xl font-bold leading-snug" tabindex="-1" bind:this={heading}>{step.title}</h2>
        <p class="m-0 text-base-content/75" aria-live="polite">{step.body}</p>
        {#if !here}
          <div class="rounded-box bg-base-200 p-3 text-sm">
            This step is on another page.
            <button class="link link-primary font-bold" type="button" onclick={() => show(index)}>Go to this step</button>
          </div>
        {/if}
        <div class="mt-1 flex flex-wrap items-center gap-2">
          <button class="btn btn-sm" type="button" onclick={() => show(index - 1)} disabled={index === 0}>Back</button>
          {#if last}
            <button class="btn btn-primary btn-sm" type="button" onclick={finish}>Finish tour</button>
          {:else}
            <button class="btn btn-primary btn-sm" type="button" onclick={() => show(index + 1)}>Next <span aria-hidden="true">&rarr;</span></button>
          {/if}
          <button class="btn btn-ghost btn-sm ml-auto" type="button" onclick={finish}>End tour</button>
        </div>
      </div>
    </aside>
  {/if}
{/if}

<style>
  .tour-card, .tour-pill {
    position: fixed;
    right: 1rem;
    bottom: 1rem;
    z-index: 45;
  }
  .tour-card {
    width: min(24rem, calc(100vw - 2rem));
    max-height: calc(100vh - 2rem);
    overflow-y: auto;
  }
  :global(.tour-spotlight) {
    outline: 3px solid var(--color-primary);
    outline-offset: 6px;
    border-radius: 1rem;
    animation: tour-pulse 1.6s ease-in-out 3;
    scroll-margin: 7rem;
  }
  @keyframes tour-pulse {
    50% { outline-offset: 12px; outline-color: color-mix(in oklab, var(--color-primary) 45%, transparent); }
  }
  @media (prefers-reduced-motion: reduce) {
    :global(.tour-spotlight) { animation: none; }
  }
</style>
