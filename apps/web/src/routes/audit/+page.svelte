<script lang="ts">
import type { ScanDetail } from '@trusten/shared/api'
import { gradeHeadline } from '@trusten/ui/content'
import { FindingCard, GradeBadge } from '@trusten/ui/domain'
import { onDestroy } from 'svelte'
import { api, publicScanErrorMessage } from '$lib/api'
import JourneyTimeline from '$lib/components/JourneyTimeline.svelte'
import { splitFindings } from '$lib/findings'
import { completedAuditResultId, createLiveScan } from '$lib/live.svelte'
import { getTurnstileToken } from '$lib/turnstile'

let url = $state('')
let started = $state(false)
let problem = $state('')
let result = $state<ScanDetail | null>(null)
let busy = $state(false)
let turnstileContainer = $state<HTMLDivElement>()

const live = createLiveScan()
onDestroy(() => live.destroy())

const split = $derived(result ? splitFindings(result.patterns) : null)
const finishedSteps = $derived(
  live.state.steps.filter((step) => step.done).length,
)

function friendlyActivity(action: string): string {
  const value = action.toLowerCase()
  if (value.includes('cookie') || value.includes('consent'))
    return 'Checking the privacy choices'
  if (value.includes('cancel') || value.includes('unsubscribe'))
    return 'Looking for a way to leave'
  if (
    value.includes('sign') ||
    value.includes('register') ||
    value.includes('account')
  )
    return 'Checking the sign-up process'
  if (value.includes('search') || value.includes('browse'))
    return 'Looking for something to check'
  if (value.includes('select') || value.includes('open'))
    return 'Opening an item or option'
  if (
    value.includes('add') ||
    value.includes('basket') ||
    value.includes('cart')
  )
    return 'Checking what is added to the basket'
  if (
    value.includes('checkout') ||
    value.includes('price') ||
    value.includes('fee')
  )
    return 'Checking the final price and choices'
  return 'Checking this part of the website'
}

function evidenceUrl(patternId: string): string | undefined {
  if (!result) return undefined
  const pattern = result.patterns.find(
    (candidate) => candidate.id === patternId,
  )
  if (pattern?.evidence.screenshotUrl) return pattern.evidence.screenshotUrl
  const step = result.workflowSteps?.find((candidate) =>
    candidate.patternsFound.some((pattern) => pattern.id === patternId),
  )
  return step
    ? `/trusten/report/${encodeURIComponent(result.id)}/screenshot/${step.stepNumber}`
    : undefined
}

function startOver() {
  live.reset()
  result = null
  problem = ''
  started = false
}

async function start(event: SubmitEvent) {
  event.preventDefault()
  if (!url.trim()) {
    problem = 'Please type the address of the website you want checked.'
    return
  }

  problem = ''
  busy = true
  try {
    if (!turnstileContainer) throw new Error('Scan form is not ready')
    const turnstileToken = await getTurnstileToken(
      turnstileContainer,
      'audit_scan',
    )
    const { jobId, capabilityToken } = await api.startAudit({
      url,
      watch: true,
      mode: 'discover',
      turnstileToken,
    })
    started = true
    await live.connect(jobId, capabilityToken)
    await waitForResult(jobId, capabilityToken)
  } catch (error) {
    problem = publicScanErrorMessage(error)
    if (started) live.fail(problem)
  } finally {
    busy = false
  }
}

async function waitForResult(jobId: string, capabilityToken: string) {
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, 3000))
    const status = await api
      .getAuditStatus(jobId, capabilityToken)
      .catch(() => null)
    if (!status) continue
    if (status.status === 'done' && status.scanIds.length > 0) {
      const resultId = completedAuditResultId(status.scanIds)
      if (resultId) result = await api.getScan(resultId)
      return
    }
    if (status.status === 'failed') {
      problem = 'The website stopped the check before it could finish.'
      live.fail(problem)
      return
    }
  }
}
</script>

<svelte:head>
  <title>Full website check — Trusten</title>
  <meta name="description" content="Watch Trusten follow a website journey and explain the choices it finds in plain language." />
</svelte:head>

<main class="mx-auto max-w-6xl px-6 py-12">
  <div class="badge badge-primary badge-outline font-bold">Full website check</div>
  <h1 class="mt-4 mb-0 max-w-3xl font-bold text-4xl leading-tight md:text-6xl">
    See what happens beyond the first page.
  </h1>
  <p class="mt-4 max-w-measure text-lg text-base-content/70">
    Trusten follows an ordinary website journey, such as comparing an option,
    reviewing a basket, or looking for a way to cancel. You can watch the check
    and see the evidence it finds.
  </p>

  {#if !started}
    <section class="mt-9 grid gap-5 lg:grid-cols-[1fr_.72fr]" aria-label="Start a full website check">
      <form class="card border border-base-300 bg-base-100" onsubmit={start}>
        <div class="card-body p-6 md:p-8">
          <h2 class="card-title text-2xl">Which website should we check?</h2>
          <label class="mt-3 block font-semibold" for="audit-url">Website address</label>
          <input
            id="audit-url"
            class="input input-lg mt-2 w-full"
            type="text"
            bind:value={url}
            placeholder="example.com"
            autocomplete="url"
            aria-describedby="audit-hint"
          />
          <p id="audit-hint" class="mt-3 mb-0 text-sm text-base-content/65">
            A full check takes longer because Trusten tries several parts of the website.
          </p>
          {#if problem}
            <div class="alert alert-error mt-3" role="alert">{problem}</div>
          {/if}
          <button class="btn btn-primary btn-lg mt-5 w-full sm:w-auto" type="submit" disabled={busy}>
            {busy ? 'Preparing the check…' : 'Start full check'}
          </button>
          <div class="mt-3" bind:this={turnstileContainer}></div>
        </div>
      </form>

      <aside class="card border border-base-300 bg-base-100" aria-labelledby="safe-check-heading">
        <div class="card-body p-6 md:p-8">
          <div class="neo-inset grid size-12 place-items-center rounded-2xl text-primary" aria-hidden="true">✓</div>
          <h2 id="safe-check-heading" class="mt-2 text-2xl font-bold">A careful, private check</h2>
          <ul class="mt-2 space-y-4 p-0 text-base-content/75">
            <li class="flex gap-3"><span class="text-success" aria-hidden="true">●</span><span>Trusten does not place an order or use your personal details.</span></li>
            <li class="flex gap-3"><span class="text-success" aria-hidden="true">●</span><span>Every concern links back to the page where it appeared.</span></li>
            <li class="flex gap-3"><span class="text-success" aria-hidden="true">●</span><span>If the website blocks part of the check, we say so clearly.</span></li>
          </ul>
          <a class="link link-primary mt-2 font-semibold" href="/">Only need the first page checked?</a>
        </div>
      </aside>
    </section>
  {/if}

  {#if started}
    <section class="card mt-10 border border-base-300 bg-base-100" aria-live="polite" aria-labelledby="live-check-heading">
      <div class="card-body p-6 md:p-8">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div class="badge badge-primary badge-outline font-bold">
              {live.state.status === 'done' ? 'Check complete' : live.state.status === 'failed' ? 'Check paused' : 'Checking now'}
            </div>
            <h2 id="live-check-heading" class="mt-3 mb-0 font-bold text-3xl">
              {live.state.status === 'done' ? 'Here is what Trusten checked' : live.state.status === 'failed' ? 'Trusten could not finish' : 'Trusten is following the journey'}
            </h2>
            <p class="mt-2 mb-0 text-base-content/65">
              {live.state.status === 'running'
                ? 'You can leave this tab open while the check continues.'
                : `${finishedSteps} ${finishedSteps === 1 ? 'part' : 'parts'} checked.`}
            </p>
          </div>
          {#if live.state.status === 'running'}
            <span class="loading loading-ring loading-lg text-primary" aria-label="Check in progress"></span>
          {/if}
        </div>

        {#if live.state.frame && live.state.status !== 'done'}
          <details class="collapse-arrow collapse mt-6 border border-base-300 bg-base-200">
            <summary class="collapse-title font-semibold text-primary">Watch the website as Trusten checks it</summary>
            <div class="collapse-content">
              <img class="mt-2 max-h-[36rem] w-full rounded-box bg-neutral object-contain shadow-inner" src={live.state.frame} alt="A live view of the website being checked" />
            </div>
          </details>
        {/if}

        <ol class="mt-7 list-none space-y-3 p-0" aria-label="Check progress">
          {#each live.state.steps as step (step.step)}
            <li class="neo-inset flex items-center gap-4 rounded-2xl px-4 py-3">
              <span class="grid size-10 shrink-0 place-items-center rounded-full {step.done ? 'bg-success text-success-content' : 'bg-primary text-primary-content'}" aria-hidden="true">
                {step.done ? '✓' : step.step}
              </span>
              <span class="min-w-0 flex-1">
                <strong class="block">{friendlyActivity(step.action)}</strong>
                <small class="text-base-content/70">{step.done ? 'Finished' : 'In progress'}</small>
              </span>
            </li>
          {/each}
        </ol>

        {#if live.state.steps.length === 0 && live.state.status === 'running'}
          <div class="neo-inset mt-7 rounded-2xl p-5 text-base-content/70">
            Opening the website and planning a safe route…
          </div>
        {/if}

        {#if live.state.error || problem}
          <div class="alert alert-error mt-6" role="alert">
            <div>
              <strong class="block">The website may have blocked the check.</strong>
              <span>Nothing was submitted or purchased. You can try again now.</span>
            </div>
          </div>
          <button class="btn btn-primary mt-4" type="button" onclick={startOver}>Try again</button>
        {/if}
      </div>
    </section>
  {/if}

  {#if result && split}
    {@const heading = gradeHeadline(result.score.grade, split.main.length)}
    <section class="mt-16">
      <header class="card mb-8 border border-base-300 bg-base-100">
        <div class="card-body flex-row flex-wrap items-center gap-6">
          <GradeBadge grade={result.score.grade} />
          <div>
            <h2 class="m-0 font-bold text-3xl">{heading.headline}</h2>
            <p class="mt-2 mb-0 text-base-content/65">{heading.sub}</p>
          </div>
        </div>
      </header>

      {#if result.workflowSteps?.length}
        <JourneyTimeline scanId={result.id} steps={result.workflowSteps} />
      {/if}

      <h2 class="mt-14 mb-2 font-bold text-3xl">What we found</h2>
      <p class="mb-6 max-w-measure text-base-content/65">
        Start with the plain explanation. Open the evidence when you want to see exactly where it appeared.
      </p>
      {#each split.main as pattern, i (pattern.id)}
        <FindingCard {pattern} index={i + 1} screenshotUrl={evidenceUrl(pattern.id)} />
      {/each}
    </section>
  {/if}
</main>
