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

async function start(event: SubmitEvent) {
  event.preventDefault()
  if (!url.trim()) {
    problem = 'Please type the address of the site you want checked.'
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
  } finally {
    busy = false
  }
}

async function waitForResult(jobId: string, capabilityToken: string) {
  // Fallback only: the WebSocket drives the display, this just collects the
  // finished result so the timeline can become the report in place.
  while (true) {
    await new Promise((r) => setTimeout(r, 3000))
    const status = await api
      .getAuditStatus(jobId, capabilityToken)
      .catch(() => null)
    if (!status) continue
    if (status.status === 'done' && status.scanIds.length > 0) {
      // The first ID is the preliminary homepage scan. The last one carries
      // the completed journey, screenshots, and step-level evidence.
      const resultId = completedAuditResultId(status.scanIds)
      if (resultId) result = await api.getScan(resultId)
      return
    }
    if (status.status === 'failed') {
      problem = status.error ?? 'The check did not finish.'
      return
    }
  }
}
</script>

<main class="mx-auto max-w-6xl px-6 py-12">
  <div class="badge badge-primary badge-outline font-bold">Full journey audit</div>
  <h1 class="mt-4 mb-0 max-w-3xl font-bold text-5xl">Watch Trusten follow the whole path.</h1>
  <p class="mt-4 max-w-measure text-lg text-base-content/65">
    We will visit the site the way you would — looking at pages, adding things
    to a basket, and trying to cancel — and tell you what we find.
  </p>

  {#if !started}
    <form class="card mt-8 max-w-2xl border border-base-300 bg-base-100 shadow-xl" onsubmit={start}>
      <div class="card-body">
      <label class="block font-semibold" for="audit-url">Website address</label>
      <input
        id="audit-url"
        class="input input-lg mt-2 w-full shadow-inner"
        type="text"
        bind:value={url}
        placeholder="example.com"
      />
      {#if problem}
        <div class="alert alert-error mt-2" role="alert">{problem}</div>
      {/if}
      <button
        class="btn btn-primary btn-lg mt-4 shadow-lg"
        type="submit"
        disabled={busy}
      >
        {busy ? 'Starting...' : 'Start the check'}
      </button>
      <div class="mt-3" bind:this={turnstileContainer}></div>
      </div>
    </form>
  {/if}

  {#if started}
    <section class="card mt-10 border border-base-300 bg-base-100 shadow-xl">
      <div class="card-body">
      <h2 class="font-bold text-2xl">
        {live.state.status === 'done' ? 'What we did' : 'What we are doing'}
      </h2>

      {#if live.state.frame && live.state.status !== 'done'}
        <img
          class="mt-4 max-h-[36rem] w-full rounded-box bg-neutral object-contain shadow-inner"
          src={live.state.frame}
          alt="A live view of the site as we check it"
        />
      {/if}

      <ol class="mt-6 list-none p-0">
        {#each live.state.steps as step (step.step)}
          <li class="flex items-center gap-3 border-border border-b py-3">
            <span aria-hidden="true">{step.done ? '✓' : '⋯'}</span>
            <span>{step.action}</span>
          </li>
        {/each}
      </ol>

      {#if live.state.error}
        <div class="alert alert-error" role="alert">{live.state.error}</div>
      {/if}
      </div>
    </section>
  {/if}

  <!--
    The timeline is not replaced and the page does not redirect: the result
    appears beneath what the reader just watched.
  -->
  {#if result && split}
    {@const heading = gradeHeadline(result.score.grade, split.main.length)}
    <section class="mt-16">
      <header class="card mb-8 border border-base-300 bg-base-100 shadow-xl">
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

      <h2 class="mt-14 mb-6 font-bold text-3xl">What we found</h2>
      {#each split.main as pattern, i (pattern.id)}
        <FindingCard {pattern} index={i + 1} screenshotUrl={evidenceUrl(pattern.id)} />
      {/each}
    </section>
  {/if}
</main>
