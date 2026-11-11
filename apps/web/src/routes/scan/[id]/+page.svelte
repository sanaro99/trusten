<script lang="ts">
import { assessScanCoverage } from '@trusten/shared/domain'
import { GradeBadge } from '@trusten/ui/domain'
import FindingInspector from '$lib/components/FindingInspector.svelte'
import JourneyTimeline from '$lib/components/JourneyTimeline.svelte'
import ReportAssets from '$lib/components/ReportAssets.svelte'
import { splitFindings } from '$lib/findings'
import { getReportSummary } from '$lib/report-content'
import type { PageData } from './$types'

let { data }: { data: PageData } = $props()

const split = $derived(splitFindings(data.scan.patterns))
const workflowSteps = $derived(data.scan.workflowSteps ?? [])
const coverage = $derived(assessScanCoverage(data.scan.scanType, workflowSteps))
const missingQuickEvidence = $derived(
  data.scan.scanType === 'quick' && coverage.status === 'missing',
)
const blockedQuickEvidence = $derived(
  data.scan.scanType === 'quick' && coverage.status === 'blocked',
)
const limitedQuickEvidence = $derived(
  data.scan.scanType === 'quick' && coverage.missingVisual,
)
const asideOnly = $derived(split.main.length === 0 && split.aside.length > 0)
const summary = $derived(
  getReportSummary(
    data.scan.score.grade,
    data.scan.patterns.length,
    workflowSteps,
    data.scan.scanType,
  ),
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
</script>

<svelte:head>
  <title>{data.scan.domain} — Trusten</title>
</svelte:head>

<main id="main-content" class="report-page mx-auto max-w-6xl px-6 py-12">
  <div class="breadcrumbs text-sm text-base-content/70">
    <ul><li><a href="/">Dashboard</a></li><li><a href="/explore">Results</a></li><li>{data.scan.domain}</li></ul>
  </div>

  {#if data.cached}
    <div class="alert alert-info mt-5" role="status">
      Saved result from {new Date(data.scan.completedAt).toLocaleString()}.
    </div>
  {/if}

  <header class="report-summary card mt-5 overflow-hidden">
    <div class="card-body gap-6 p-7 md:flex-row md:items-center md:p-10">
      {#if summary.limited}
        <div class="grid size-24 shrink-0 place-items-center rounded-full border border-warning/35 bg-warning/10 text-center shadow-inner">
          <span class="text-3xl" aria-hidden="true">!</span>
          <span class="sr-only">Limited check</span>
        </div>
      {:else if !asideOnly}
        <GradeBadge grade={data.scan.score.grade} />
      {/if}
      <div class="min-w-0 flex-1">
        <div class="badge {summary.limited ? 'badge-warning' : 'badge-primary badge-outline'} mb-3">{summary.eyebrow}</div>
        <h1 class="m-0 font-bold text-4xl md:text-5xl">{asideOnly && !summary.limited ? 'Some findings need a closer look' : summary.headline}</h1>
        <p class="mt-3 mb-0 max-w-2xl text-lg text-base-content/65">{asideOnly && !summary.limited ? 'The findings below are uncertain. Review their evidence before drawing a conclusion.' : summary.sub}</p>
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

  {#if summary.limited}
    <a class="link link-primary mt-4 inline-flex min-h-11 items-center font-bold" href="/extension">Get the Trusten Chrome extension</a>
  {/if}

  <FindingInspector
    scanId={data.scan.id}
    steps={workflowSteps}
    findings={[...split.main, ...split.more]}
    uncertain={split.aside}
  >
    {#snippet empty()}
      <div class="alert {summary.limited ? 'alert-warning' : 'alert-success'} shadow-lg">
        <span>{missingQuickEvidence ? 'The page evidence for this older result is unavailable. Run a new check before relying on its grade.' : blockedQuickEvidence ? 'The captured page is a website verification screen. No findings about the requested site can be drawn from this check.' : coverage.textOnly ? 'We checked the words on this page and found no concern, but no screenshot was captured, so visual tricks were not reviewed.' : limitedQuickEvidence ? 'Text and page checks found no concern, but visual analysis did not complete. Review the screenshot before relying on this result.' : summary.limited ? 'We did not find a concern in the pages we reached. Because the check was limited, this does not mean the whole website is clear.' : data.scan.scanType === 'quick' ? 'We did not find common tricks on the captured page. This result covers one page only.' : 'We checked the available pages for common tricks and did not find any concerns.'}</span>
      </div>
    {/snippet}
  </FindingInspector>

  {#if data.scan.scanType !== 'quick' && workflowSteps.length > 0}
    <JourneyTimeline scanId={data.scan.id} steps={workflowSteps} />
  {/if}

  <ReportAssets scan={data.scan} />

  <div class="mt-12 flex flex-wrap gap-3">
    <a class="btn btn-primary" href="/">Check another site</a>
    <a class="btn btn-ghost" href="/explore">Explore other results</a>
  </div>
</main>
