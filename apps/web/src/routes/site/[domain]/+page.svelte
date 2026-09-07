<script lang="ts">
import type { ScanHistoryRow } from '@trusten/shared/api'
import type { Grade } from '@trusten/shared/domain'
import { GradeBadge } from '@trusten/ui/domain'
import type { PageData } from './$types'

let { data }: { data: PageData } = $props()

const dateFormatter = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

function timeValue(value: string): number {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

const scans = $derived(
  data.detail.scans.toSorted(
    (a, b) => timeValue(b.createdAt) - timeValue(a.createdAt),
  ),
)
const latest = $derived(scans[0])
const previous = $derived(scans[1])

function verdictText(grade: string): string {
  if (grade === 'A') return 'No clear concerns found'
  if (grade === 'B') return 'Mostly fair'
  if (grade === 'C') return 'Some concerns found'
  if (grade === 'D') return 'Several concerns found'
  return 'Serious concerns found'
}

function findingText(scan: ScanHistoryRow): string {
  const serious = scan.criticalCount + scan.highCount
  if (serious > 0)
    return `${serious} serious ${serious === 1 ? 'concern' : 'concerns'} among ${scan.patternCount} found`
  if (scan.patternCount > 0)
    return `${scan.patternCount} ${scan.patternCount === 1 ? 'concern' : 'concerns'} found`
  return 'No clear concerns found'
}

function comparisonText(
  current: ScanHistoryRow,
  older?: ScanHistoryRow,
): string {
  if (!older) return 'This is the first check shared for this website.'
  const change = current.scoreNumeric - older.scoreNumeric
  const findingChange = current.patternCount - older.patternCount
  if (change >= 5)
    return findingChange < 0
      ? `The result improved, with ${Math.abs(findingChange)} fewer ${Math.abs(findingChange) === 1 ? 'concern' : 'concerns'} found.`
      : 'The result improved since the previous check.'
  if (change <= -5)
    return findingChange > 0
      ? `The result became more concerning, with ${findingChange} more ${findingChange === 1 ? 'concern' : 'concerns'} found.`
      : 'The result became more concerning since the previous check.'
  return findingChange === 0
    ? 'The result is similar to the previous check.'
    : `The overall result is similar, but Trusten found ${Math.abs(findingChange)} ${findingChange > 0 ? 'more' : 'fewer'} ${Math.abs(findingChange) === 1 ? 'concern' : 'concerns'}.`
}
</script>

<svelte:head>
  <title>{data.detail.domain} check history | Trusten</title>
  <meta name="description" content="See how Trusten's checks of {data.detail.domain} changed over time." />
</svelte:head>

<main class="mx-auto max-w-5xl px-6 py-12">
  <nav aria-label="Breadcrumb">
    <a class="link link-primary text-sm font-semibold" href="/explore">← Back to all websites</a>
  </nav>
  <div class="badge badge-primary badge-outline mt-6 font-bold">Website history</div>
  <h1 class="mt-4 mb-0 break-words font-bold text-4xl md:text-5xl">{data.detail.domain}</h1>
  <p class="mt-3 max-w-2xl text-base-content/70">
    Websites can change. This page shows what Trusten found on each visit, with links to the evidence.
  </p>

  {#if latest}
    <section class="card mt-8 border border-base-300 bg-base-100 p-6 shadow-xl" aria-labelledby="latest-heading">
      <div class="flex flex-wrap items-start gap-5">
        <GradeBadge grade={latest.scoreGrade as Grade} />
        <div class="min-w-0 flex-1">
          <p class="m-0 text-sm font-semibold text-base-content/70">Latest check</p>
          <h2 id="latest-heading" class="mt-1 mb-0 text-2xl font-bold">{verdictText(latest.scoreGrade)}</h2>
          <p class="mt-2 mb-0 text-base-content/70">
            Checked {dateFormatter.format(new Date(latest.createdAt))} · {findingText(latest)}
          </p>
        </div>
        <a class="btn btn-primary" href="/scan/{latest.id}">View latest evidence</a>
      </div>

      <div class="mt-6 rounded-box bg-base-200 p-5 shadow-inner">
        <h3 class="m-0 text-base font-bold">What changed?</h3>
        <p class="mt-1 mb-0 text-base-content/70">{comparisonText(latest, previous)}</p>
      </div>
    </section>

    <section class="mt-12" aria-labelledby="timeline-heading">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="timeline-heading" class="m-0 text-2xl font-bold">How the checks changed</h2>
          <p class="mt-2 mb-0 text-base-content/65">Newest first. Open any check to see exactly what Trusten found.</p>
        </div>
        <p class="m-0 rounded-full bg-base-200 px-4 py-2 text-sm font-semibold shadow-inner">
          {scans.length} {scans.length === 1 ? 'check' : 'checks'} shared
        </p>
      </div>

      <ol class="relative mt-8 list-none space-y-5 border-l-2 border-primary/25 p-0 pl-6">
        {#each scans as scan, index (scan.id)}
          <li class="relative">
            <span class="absolute top-7 -left-[1.95rem] size-3 rounded-full bg-primary ring-4 ring-base-100" aria-hidden="true"></span>
            <article class="card border border-base-300 bg-base-100 p-5 shadow-lg">
              <div class="flex flex-wrap items-start gap-4">
                <GradeBadge grade={scan.scoreGrade as Grade} />
                <div class="min-w-0 flex-1">
                  <p class="m-0 text-sm font-semibold text-base-content/70">
                    {index === 0 ? 'Latest check · ' : ''}{dateFormatter.format(new Date(scan.createdAt))}
                  </p>
                  <h3 class="mt-1 mb-0 text-xl font-bold">{verdictText(scan.scoreGrade)}</h3>
                  <p class="mt-2 mb-0 text-base-content/70">{findingText(scan)}</p>
                  {#if scans[index + 1]}
                    <p class="mt-2 mb-0 text-sm text-base-content/70">{comparisonText(scan, scans[index + 1])}</p>
                  {/if}
                </div>
                <a class="btn btn-ghost" href="/scan/{scan.id}" aria-label="View evidence from {dateFormatter.format(new Date(scan.createdAt))}">
                  View evidence
                </a>
              </div>
            </article>
          </li>
        {/each}
      </ol>
    </section>
  {:else}
    <section class="card mt-8 border border-base-300 bg-base-100 p-8 text-center shadow-lg">
      <h2 class="m-0 text-2xl font-bold">No checks are available for this website</h2>
      <p class="mt-2 text-base-content/70">Run a new check to see how this website may shape your choices.</p>
      <a class="btn btn-primary mx-auto mt-4 w-fit" href="/">Check this website</a>
    </section>
  {/if}
</main>
