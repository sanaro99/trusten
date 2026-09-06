<script lang="ts">
import type { DetectedPattern } from '@trusten/shared/domain'
import { gradeHeadline } from '@trusten/ui/content'
import { FindingCard, GradeBadge } from '@trusten/ui/domain'
import JourneyTimeline from '$lib/components/JourneyTimeline.svelte'
import { splitFindings } from '$lib/findings'
import type { PageData } from './$types'

let { data }: { data: PageData } = $props()

const split = $derived(splitFindings(data.scan.patterns))
const heading = $derived(
  gradeHeadline(data.scan.score.grade, split.main.length),
)
const workflowSteps = $derived(data.scan.workflowSteps ?? [])
const seriousCount = $derived(
  data.scan.patterns.filter(
    (pattern) => pattern.severity === 'critical' || pattern.severity === 'high',
  ).length,
)

function stepFor(pattern: DetectedPattern) {
  return workflowSteps.find((step) =>
    step.patternsFound.some((candidate) => candidate.id === pattern.id),
  )
}

function evidenceUrl(pattern: DetectedPattern): string | undefined {
  if (pattern.evidence.screenshotUrl) return pattern.evidence.screenshotUrl
  if (
    pattern.evidence.screenshot &&
    !pattern.evidence.screenshot.startsWith('[')
  ) {
    return pattern.evidence.screenshot.startsWith('data:')
      ? pattern.evidence.screenshot
      : `data:image/jpeg;base64,${pattern.evidence.screenshot}`
  }
  const step = stepFor(pattern)
  if (!step) return undefined
  return `/trusten/report/${encodeURIComponent(data.scan.id)}/screenshot/${step.stepNumber}`
}
</script>

<svelte:head>
  <title>{data.scan.domain} — Trusten</title>
</svelte:head>

<main class="mx-auto max-w-6xl px-6 py-12">
  <div class="breadcrumbs text-sm text-base-content/55">
    <ul><li><a href="/">Dashboard</a></li><li><a href="/explore">Results</a></li><li>{data.scan.domain}</li></ul>
  </div>

  <header class="card mt-5 overflow-hidden border border-base-300 bg-base-100 shadow-2xl">
    <div class="card-body gap-6 p-7 md:flex-row md:items-center md:p-10">
      <GradeBadge grade={data.scan.score.grade} />
      <div class="min-w-0 flex-1">
        <div class="badge badge-primary badge-outline mb-3">Trusten verdict</div>
        <h1 class="m-0 font-bold text-4xl md:text-5xl">{heading.headline}</h1>
        <p class="mt-3 mb-0 text-lg text-base-content/65">{heading.sub}</p>
        <p class="mt-2 mb-0 truncate text-sm text-base-content/50">Checked {data.scan.domain} · {data.scan.completedAt.slice(0, 10)}</p>
      </div>
      <div class="stats stats-vertical bg-base-200 shadow-inner">
        <div class="stat py-3"><div class="stat-title">Findings</div><div class="stat-value text-2xl">{data.scan.patterns.length}</div></div>
        <div class="stat py-3"><div class="stat-title">Serious</div><div class="stat-value text-2xl text-error">{seriousCount}</div></div>
      </div>
    </div>
  </header>

  {#if workflowSteps.length > 0}
    <JourneyTimeline scanId={data.scan.id} steps={workflowSteps} />
  {/if}

  <section class="mt-14" aria-labelledby="findings-heading">
    <div class="mb-7 flex flex-wrap items-end justify-between gap-3">
      <div>
        <div class="badge badge-secondary badge-outline font-bold">The verdict explained</div>
        <h2 id="findings-heading" class="mt-3 mb-0 font-bold text-3xl">What we found</h2>
        <p class="mt-2 mb-0 max-w-measure text-base-content/65">Each finding includes the words or page evidence behind it, what it means, and how to recognize it yourself.</p>
      </div>
      {#if data.scan.pdfPath}
        <a class="btn btn-outline" href="/trusten/report/{data.scan.id}/pdf">Download report</a>
      {/if}
    </div>

    {#if split.main.length === 0 && split.aside.length === 0}
      <div class="alert alert-success shadow-lg">
        <span>We looked for the usual tricks and did not find any. This site seems to treat you fairly.</span>
      </div>
    {:else}
      {#each split.main as pattern, i (pattern.id)}
        <FindingCard {pattern} index={i + 1} screenshotUrl={evidenceUrl(pattern)} />
      {/each}
    {/if}
  </section>

  {#if split.aside.length > 0}
    <details class="collapse-arrow collapse mt-8 border border-base-300 bg-base-100 shadow-lg">
      <summary class="collapse-title font-semibold text-primary">A few other things worth a look ({split.aside.length})</summary>
      <div class="collapse-content">
        <p class="max-w-measure text-base-content/65">We are less sure about these, so we have kept them separate.</p>
        {#each split.aside as pattern, i (pattern.id)}
          <FindingCard {pattern} index={split.main.length + i + 1} screenshotUrl={evidenceUrl(pattern)} />
        {/each}
      </div>
    </details>
  {/if}

  <div class="mt-12 flex flex-wrap gap-3">
    <a class="btn btn-primary" href="/">Check another site</a>
    <a class="btn btn-ghost" href="/explore">Explore other results</a>
  </div>
</main>
