<script lang="ts">
import {
  type DetectedPattern,
  isAccessChallengeUrl,
} from '@trusten/shared/domain'
import { FindingCard, GradeBadge } from '@trusten/ui/domain'
import JourneyTimeline from '$lib/components/JourneyTimeline.svelte'
import { splitFindings } from '$lib/findings'
import { getReportSummary } from '$lib/report-content'
import type { PageData } from './$types'

let { data }: { data: PageData } = $props()

const split = $derived(splitFindings(data.scan.patterns))
const workflowSteps = $derived(data.scan.workflowSteps ?? [])
const quickEvidence = $derived(
  data.scan.scanType === 'quick' ? workflowSteps[0] : undefined,
)
const missingQuickEvidence = $derived(
  data.scan.scanType === 'quick' && !quickEvidence?.screenshotPath,
)
const blockedQuickEvidence = $derived(
  data.scan.scanType === 'quick' &&
    !!quickEvidence?.url &&
    isAccessChallengeUrl(quickEvidence.url),
)
const limitedQuickEvidence = $derived(
  data.scan.scanType === 'quick' &&
    !!quickEvidence?.screenshotPath &&
    quickEvidence.visualCheckAvailable === false,
)
const summary = $derived(
  data.scan.scanType === 'quick'
    ? missingQuickEvidence
      ? {
          ...getReportSummary(data.scan.score.grade, split.main.length, []),
          limited: true,
          eyebrow: 'Evidence unavailable',
          headline: 'We cannot verify this quick check',
          sub: 'This result did not save a page capture. Run a new check to get a reviewable result.',
        }
      : blockedQuickEvidence
        ? {
            ...getReportSummary(data.scan.score.grade, split.main.length, []),
            limited: true,
            eyebrow: 'Check blocked',
            headline: 'We could not inspect this website',
            sub: 'The website sent our browser to a verification page. This result does not assess the requested site.',
          }
        : limitedQuickEvidence
          ? {
              ...getReportSummary(data.scan.score.grade, split.main.length, []),
              limited: true,
              eyebrow: 'Partial quick check',
              headline:
                data.scan.patterns.length === 0
                  ? 'No concerns found in available checks'
                  : `${data.scan.patterns.length} ${data.scan.patterns.length === 1 ? 'concern' : 'concerns'} found on this page`,
              sub: 'We captured this page, but visual analysis was unavailable. The grade is not conclusive.',
            }
          : {
              ...getReportSummary(data.scan.score.grade, split.main.length, []),
              eyebrow: 'Quick check · one page',
              headline:
                data.scan.patterns.length === 0
                  ? 'No concerns found on this page'
                  : `${data.scan.patterns.length} ${data.scan.patterns.length === 1 ? 'concern' : 'concerns'} found on this page`,
              sub: 'We checked the captured page for common patterns. Checkout and other journeys need a deeper check.',
            }
    : getReportSummary(data.scan.score.grade, split.main.length, workflowSteps),
)
const seriousCount = $derived(
  data.scan.patterns.filter(
    (pattern) => pattern.severity === 'critical' || pattern.severity === 'high',
  ).length,
)
const checkedDate = $derived(
  new Intl.DateTimeFormat('en', { dateStyle: 'long' }).format(
    new Date(data.scan.completedAt),
  ),
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
  <div class="breadcrumbs text-sm text-base-content/70">
    <ul><li><a href="/">Dashboard</a></li><li><a href="/explore">Results</a></li><li>{data.scan.domain}</li></ul>
  </div>

  <header class="card mt-5 overflow-hidden border border-base-300 bg-base-100 shadow-2xl">
    <div class="card-body gap-6 p-7 md:flex-row md:items-center md:p-10">
      {#if summary.limited}
        <div class="grid size-24 shrink-0 place-items-center rounded-full border border-warning/35 bg-warning/10 text-center shadow-inner">
          <span class="text-3xl" aria-hidden="true">!</span>
          <span class="sr-only">Limited check</span>
        </div>
      {:else}
        <GradeBadge grade={data.scan.score.grade} />
      {/if}
      <div class="min-w-0 flex-1">
        <div class="badge {summary.limited ? 'badge-warning' : 'badge-primary badge-outline'} mb-3">{summary.eyebrow}</div>
        <h1 class="m-0 font-bold text-4xl md:text-5xl">{summary.headline}</h1>
        <p class="mt-3 mb-0 max-w-2xl text-lg text-base-content/65">{summary.sub}</p>
        <p class="mt-2 mb-0 truncate text-sm text-base-content/70">Checked {data.scan.domain} · {checkedDate}</p>
      </div>
      <div class="stats stats-vertical bg-base-200 shadow-inner">
        <div class="stat py-3"><div class="stat-title text-base-content/70">Concerns found</div><div class="stat-value text-2xl">{data.scan.patterns.length}</div></div>
        {#if workflowSteps.length > 0 && data.scan.scanType !== 'quick'}
          <div class="stat py-3"><div class="stat-title text-base-content/70">Journey checked</div><div class="stat-value text-2xl">{summary.completed}/{summary.total}</div></div>
        {:else}
          <div class="stat py-3"><div class="stat-title text-base-content/70">Serious concerns</div><div class="stat-value text-2xl text-error">{seriousCount}</div></div>
        {/if}
      </div>
    </div>
  </header>

  {#if quickEvidence?.screenshotPath}
    <section class="mt-12" aria-labelledby="page-evidence-heading">
      <div class="badge badge-primary badge-outline font-bold">Evidence trail</div>
      <h2 id="page-evidence-heading" class="mt-3 mb-0 font-bold text-3xl">Page we checked</h2>
      <p class="mt-2 mb-5 break-all text-base-content/65">{quickEvidence.url}</p>
      <figure class="m-0 overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-lg">
        <img
          class="block max-h-[42rem] w-full object-contain"
          src="/trusten/report/{encodeURIComponent(data.scan.id)}/screenshot/{quickEvidence.stepNumber}"
          alt="Screenshot of the page captured during the quick check"
          loading="lazy"
        />
        <figcaption class="px-5 py-3 text-sm text-base-content/65">Captured {new Date(quickEvidence.timestamp).toLocaleString()} · Single page check</figcaption>
      </figure>
    </section>
  {:else if workflowSteps.length > 0}
    <JourneyTimeline scanId={data.scan.id} steps={workflowSteps} />
  {/if}

  <section class="mt-14" aria-labelledby="findings-heading">
    <div class="mb-7 flex flex-wrap items-end justify-between gap-3">
      <div>
        <div class="badge badge-secondary badge-outline font-bold">What you should know</div>
        <h2 id="findings-heading" class="mt-3 mb-0 font-bold text-3xl">What we found</h2>
        <p class="mt-2 mb-0 max-w-measure text-base-content/65">Start with the practical advice. Then review the words and page evidence behind each concern.</p>
      </div>
      {#if data.scan.pdfPath}
        <a class="btn btn-outline" href="/trusten/report/{data.scan.id}/pdf">Download report</a>
      {/if}
    </div>

    {#if split.main.length === 0 && split.aside.length === 0}
      <div class="alert {summary.limited ? 'alert-warning' : 'alert-success'} shadow-lg">
        <span>{missingQuickEvidence ? 'The page evidence for this older result is unavailable. Run a new check before relying on its grade.' : blockedQuickEvidence ? 'The captured page is a website verification screen. No findings about the requested site can be drawn from this check.' : limitedQuickEvidence ? 'Text and page checks found no concern, but visual analysis did not complete. Review the screenshot before relying on this result.' : summary.limited ? 'We did not find a concern in the pages we reached. Because the check was limited, this does not mean the whole website is clear.' : data.scan.scanType === 'quick' ? 'We did not find common tricks on the captured page. This result covers one page only.' : 'We checked the available pages for common tricks and did not find any concerns.'}</span>
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
