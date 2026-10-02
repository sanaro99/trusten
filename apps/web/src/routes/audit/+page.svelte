<script lang="ts">
import type { ScanDetail, ScanHistoryRow } from '@trusten/shared/api'
import { FindingCard, GradeBadge } from '@trusten/ui/domain'
import { onDestroy, onMount } from 'svelte'
import { goto } from '$app/navigation'
import { ApiError, api, publicScanErrorMessage } from '$lib/api'
import JourneyTimeline from '$lib/components/JourneyTimeline.svelte'
import ReportAssets from '$lib/components/ReportAssets.svelte'
import { splitFindings } from '$lib/findings'
import {
  completedAuditResultId,
  createLiveScan,
  pollAuditStatus,
} from '$lib/live.svelte'
import { getReportSummary } from '$lib/report-content'
import { findSavedEvidence, validateWebsiteInput } from '$lib/submission'
import { getTurnstileToken } from '$lib/turnstile'

let url = $state('')
let started = $state(false)
let problem = $state('')
let result = $state<ScanDetail | null>(null)
let reused = $state(false)
let busy = $state(false)
let phase = $state<'visitor' | 'scan'>('visitor')
let extensionHelp = $state(false)
let savedEvidence = $state<ScanHistoryRow | null>(null)
let turnstileContainer = $state<HTMLDivElement>()
let polling = new AbortController()
const completedResultKey = 'trusten:completed-audit'

const live = createLiveScan()
onDestroy(() => {
  polling.abort()
  live.destroy()
})
onMount(() => {
  // Only a refreshed completed audit restores its public result. Starting a
  // new visit to /audit still opens the form. No capability tokens are stored.
  const navigation = performance.getEntriesByType('navigation')[0] as
    | PerformanceNavigationTiming
    | undefined
  if (
    navigation?.type !== 'reload' ||
    new URL(navigation.name).pathname !== '/audit'
  )
    return
  try {
    const path = sessionStorage.getItem(completedResultKey)
    if (path && /^\/scan\/[^/?#]+(?:\?cached=1)?$/.test(path)) {
      sessionStorage.removeItem(completedResultKey)
      void goto(path, { replaceState: true })
    }
  } catch {
    /* Storage is optional; the saved result link remains available. */
  }
})

const split = $derived(result ? splitFindings(result.patterns) : null)
const finishedSteps = $derived(
  result?.workflowSteps?.filter(
    (step) => step.status === 'observed' || step.status === 'reached',
  ).length ?? 0,
)
const resultPath = $derived(
  result
    ? `/scan/${encodeURIComponent(result.id)}${reused ? '?cached=1' : ''}`
    : '',
)

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
  polling.abort()
  polling = new AbortController()
  live.reset()
  result = null
  reused = false
  problem = ''
  started = false
  busy = false
  extensionHelp = false
  savedEvidence = null
  try {
    sessionStorage.removeItem(completedResultKey)
  } catch {
    /* optional */
  }
}

async function start(event: SubmitEvent) {
  event.preventDefault()
  if (busy) return
  if (!url.trim()) {
    problem = 'Please type the address of the website you want checked.'
    return
  }

  const submittedUrl = validateWebsiteInput(url)
  if (!submittedUrl) {
    problem = 'Please enter a valid website address, such as example.com.'
    return
  }

  problem = ''
  extensionHelp = false
  savedEvidence = null
  busy = true
  phase = 'visitor'
  const signal = polling.signal
  try {
    if (!turnstileContainer) throw new Error('Scan form is not ready')
    const turnstileToken = await getTurnstileToken(
      turnstileContainer,
      'audit_scan',
    )
    signal.throwIfAborted()
    phase = 'scan'
    const { jobId, capabilityToken, cached } = await api.startAudit({
      url: submittedUrl,
      watch: true,
      mode: 'discover',
      turnstileToken,
    })
    signal.throwIfAborted()
    reused = cached === true
    started = true
    if (!reused) void live.connect(jobId, capabilityToken)
    await waitForResult(jobId, capabilityToken, signal)
  } catch (error) {
    if (signal.aborted) return
    problem = publicScanErrorMessage(error)
    extensionHelp =
      error instanceof ApiError &&
      ['SITE_BLOCKED', 'PAGE_NOT_READY', 'PAGE_LOAD_FAILED'].includes(
        error.code ?? '',
      )
    savedEvidence = await findSavedEvidence(error, submittedUrl, 'deep')
    if (started) live.fail(problem)
  } finally {
    if (signal === polling.signal) busy = false
  }
}

async function waitForResult(
  jobId: string,
  capabilityToken: string,
  signal: AbortSignal,
) {
  const status = await pollAuditStatus(
    () =>
      api.getAuditStatus(jobId, capabilityToken, (input, init) =>
        fetch(input, { ...init, signal }),
      ),
    (status) => live.update(status),
    undefined,
    signal,
  )
  // HTTP is authoritative. Stop late optional stream events from replacing a
  // terminal result or failure notice while its saved evidence is loaded.
  live.destroy()
  const resultId = completedAuditResultId(status.scanIds)
  if (status.status === 'failed') {
    problem = 'The website stopped the check before it could finish.'
    live.fail(problem)
    extensionHelp = true
  }
  if (resultId) {
    const savedResult = await api.getScan(resultId, (input, init) =>
      fetch(input, { ...init, signal }),
    )
    signal.throwIfAborted()
    result = savedResult
    try {
      sessionStorage.setItem(completedResultKey, resultPath)
    } catch {
      /* optional */
    }
  } else if (status.status === 'done')
    throw new ApiError(422, 'SCAN_INCOMPLETE')
}
</script>

<svelte:head>
  <title>Full website check — Trusten</title>
  <meta name="description" content="Watch Trusten follow a website journey and explain the choices it finds in plain language." />
</svelte:head>

<main id="main-content" class="audit-page mx-auto max-w-6xl px-6 py-12">
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
      <form class="card audit-form" onsubmit={start}>
        <div class="card-body p-6 md:p-8">
          <h2 class="card-title text-2xl">Which website should we check?</h2>
          <label class="mt-3 block font-semibold" for="audit-url">Website address</label>
          <input
            id="audit-url"
            class="input input-lg mt-2 w-full"
            type="text"
            bind:value={url}
            disabled={busy}
            placeholder="example.com"
            autocomplete="url"
            aria-describedby="audit-hint"
          />
          <p id="audit-hint" class="mt-3 mb-0 text-sm text-base-content/65">
            A full check takes longer because Trusten tries several parts of the website.
          </p>
          {#if problem}
            <div class="alert alert-error mt-3" role="alert">{problem}</div>
            {#if extensionHelp}<a class="link link-primary inline-flex min-h-11 items-center font-bold" href="/extension">Get the Trusten Chrome extension</a>{/if}
            {#if savedEvidence}<a class="link link-primary inline-flex min-h-11 items-center font-bold" href="/scan/{encodeURIComponent(savedEvidence.id)}?cached=1">Open saved check</a>{/if}
          {/if}
          <button class="btn btn-primary btn-lg mt-5 w-full sm:w-auto" type="submit" disabled={busy}>
            {busy ? phase === 'visitor' ? 'Verifying visitor…' : 'Preparing…' : 'Start full check'}
          </button>
          <div class="mt-3" bind:this={turnstileContainer}></div>
        </div>
      </form>

      <aside class="card audit-assurance" aria-labelledby="safe-check-heading">
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
    {#if reused && result}
      <div class="alert alert-info mt-10" role="status">
        Saved full check from {new Date(result.completedAt).toLocaleString()}.
      </div>
    {/if}
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
                : result ? `${finishedSteps} journey ${finishedSteps === 1 ? 'step' : 'steps'} checked.` : live.state.status === 'done' ? 'Preparing the saved result…' : 'The check stopped before a saved journey result was available.'}
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

        <ol class="mt-7 list-none space-y-3 p-0" aria-label="Check activity">
          {#each live.state.steps as step (step.step)}
            <li class="neo-inset flex items-center gap-4 rounded-2xl px-4 py-3">
              <span class="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-content" aria-hidden="true">
                {step.step}
              </span>
              <span class="min-w-0 flex-1">
                <strong class="block">{step.action}</strong>
                <small class="text-base-content/70">{live.state.status === 'running' && step === live.state.steps.at(-1) ? 'In progress' : 'Activity reported'}</small>
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
              <strong class="block">{problem || live.state.error}</strong>
              <span>Nothing was submitted or purchased.</span>
            </div>
          </div>
          <button class="btn btn-primary mt-4" type="button" onclick={startOver}>Try again</button>
          {#if extensionHelp}<a class="link link-primary mt-2 inline-flex min-h-11 items-center font-bold" href="/extension">Get the Trusten Chrome extension</a>{/if}
        {/if}
      </div>
    </section>
  {/if}

  {#if result && split}
    {@const heading = getReportSummary(result.score.grade, result.patterns.length, result.workflowSteps ?? [], result.scanType)}
    {@const asideOnly = split.main.length === 0 && split.aside.length > 0}
    <section class="mt-16">
      <header class="card mb-8 border border-base-300 bg-base-100">
        <div class="card-body flex-row flex-wrap items-center gap-6">
          {#if heading.limited}
            <div class="grid size-24 shrink-0 place-items-center rounded-full border border-warning/35 bg-warning/10 text-center shadow-inner">
              <span class="text-3xl" aria-hidden="true">!</span>
              <span class="sr-only">Limited check</span>
            </div>
          {:else if !asideOnly}
            <GradeBadge grade={result.score.grade} />
          {/if}
          <div>
            {#if heading.limited}
              <div class="badge badge-warning mb-3">{heading.eyebrow}</div>
            {/if}
            <h2 class="m-0 font-bold text-3xl">{asideOnly && !heading.limited ? 'Some findings need a closer look' : heading.headline}</h2>
            <p class="mt-2 mb-0 text-base-content/65">{asideOnly && !heading.limited ? 'The findings below are uncertain. Review their evidence before drawing a conclusion.' : heading.sub}</p>
          </div>
        </div>
      </header>
      <div class="mb-8 flex flex-wrap gap-3">
        <a class="btn btn-primary" href={resultPath}>Open saved result</a>
        <button class="btn" type="button" onclick={startOver}>Check another site</button>
      </div>
      <ReportAssets scan={result} />
      {#if heading.limited}<a class="link link-primary mt-4 inline-flex min-h-11 items-center font-bold" href="/extension">Get the Trusten Chrome extension</a>{/if}

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
      {#if result.patterns.length === 0}
        <div class="alert {heading.limited ? 'alert-warning' : 'alert-success'}"><span>{heading.limited ? 'We did not find a concern in the pages we reached. The limited check does not show whether the whole website is clear.' : 'We did not find common tricks in the pages checked. Review the journey above to see what this result covers.'}</span></div>
      {/if}
      {#if split.aside.length > 0}
        <details class="collapse-arrow collapse mt-8 border border-base-300 bg-base-100">
          <summary class="collapse-title font-semibold text-primary">A few other things worth a look ({split.aside.length})</summary>
          <div class="collapse-content">
            <p class="max-w-measure text-base-content/65">We are less sure about these, so we have kept them separate.</p>
            {#each split.aside as pattern, i (pattern.id)}<FindingCard {pattern} index={split.main.length + i + 1} screenshotUrl={evidenceUrl(pattern.id)} />{/each}
          </div>
        </details>
      {/if}
    </section>
  {/if}
</main>
