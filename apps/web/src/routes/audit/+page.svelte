<script lang="ts">
import type { ScanDetail } from '@trusten/shared/api'
import { gradeHeadline } from '@trusten/ui/content'
import { FindingCard, GradeBadge } from '@trusten/ui/domain'
import { onDestroy } from 'svelte'
import { api } from '$lib/api'
import { splitFindings } from '$lib/findings'
import { createLiveScan } from '$lib/live.svelte'

let url = $state('')
let started = $state(false)
let problem = $state('')
let result = $state<ScanDetail | null>(null)

const live = createLiveScan()
onDestroy(() => live.destroy())

const split = $derived(result ? splitFindings(result.patterns) : null)

async function start(event: SubmitEvent) {
  event.preventDefault()
  if (!url.trim()) {
    problem = 'Please type the address of the site you want checked.'
    return
  }

  problem = ''
  try {
    const { jobId } = await api.startAudit({
      url,
      watch: true,
      mode: 'discover',
    })
    started = true
    live.connect(jobId)
    await waitForResult(jobId)
  } catch {
    problem = 'We could not reach the checking service. Try again in a moment.'
  }
}

async function waitForResult(jobId: string) {
  // Fallback only: the WebSocket drives the display, this just collects the
  // finished result so the timeline can become the report in place.
  while (true) {
    await new Promise((r) => setTimeout(r, 3000))
    const status = await api.getAuditStatus(jobId).catch(() => null)
    if (!status) continue
    if (status.status === 'done' && status.scanIds.length > 0) {
      result = await api.getScan(status.scanIds[0])
      return
    }
    if (status.status === 'failed') {
      problem = status.error ?? 'The check did not finish.'
      return
    }
  }
}
</script>

<main class="mx-auto max-w-4xl px-6 py-12">
  <h1 class="m-0 font-bold text-4xl">Run a full check</h1>
  <p class="mt-3 max-w-measure text-text-muted">
    We will visit the site the way you would — looking at pages, adding things
    to a basket, and trying to cancel — and tell you what we find.
  </p>

  {#if !started}
    <form class="mt-8" onsubmit={start}>
      <label class="block font-semibold" for="audit-url">Website address</label>
      <input
        id="audit-url"
        class="mt-2 w-full max-w-md rounded-xl border-2 border-border bg-bg px-4 py-3"
        type="text"
        bind:value={url}
        placeholder="example.com"
      />
      {#if problem}
        <p class="mt-2 font-semibold text-serious" role="alert">{problem}</p>
      {/if}
      <button
        class="mt-4 min-h-target rounded-xl bg-purple px-8 py-3 font-bold text-lg text-white"
        type="submit"
      >
        Start the check
      </button>
    </form>
  {/if}

  {#if started}
    <section class="mt-10">
      <h2 class="font-bold text-2xl">
        {live.state.status === 'done' ? 'What we did' : 'What we are doing'}
      </h2>

      {#if live.state.frame && live.state.status !== 'done'}
        <img
          class="mt-4 w-full rounded-xl border border-border"
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
        <p class="font-semibold text-serious" role="alert">{live.state.error}</p>
      {/if}
    </section>
  {/if}

  <!--
    The timeline is not replaced and the page does not redirect: the result
    appears beneath what the reader just watched.
  -->
  {#if result && split}
    {@const heading = gradeHeadline(result.score.grade, split.main.length)}
    <section class="mt-16 border-border border-t pt-10">
      <header class="mb-8 flex flex-wrap items-center gap-6">
        <GradeBadge grade={result.score.grade} />
        <div>
          <h2 class="m-0 font-bold text-3xl">{heading.headline}</h2>
          <p class="mt-2 mb-0 text-text-muted">{heading.sub}</p>
        </div>
      </header>

      {#each split.main as pattern, i (pattern.id)}
        <FindingCard {pattern} index={i + 1} />
      {/each}
    </section>
  {/if}
</main>
