<script lang="ts">
import type { ScanHistoryRow } from '@trusten/shared/api'
import type { Grade } from '@trusten/shared/domain'
import { GradeBadge } from '@trusten/ui/domain'
import type { PageData } from './$types'

type DomainGroup = {
  domain: string
  scans: ScanHistoryRow[]
  latest: ScanHistoryRow
  previous?: ScanHistoryRow
}

let { data }: { data: PageData } = $props()
let query = $state('')
let verdict = $state('all')
let concern = $state('all')
let sort = $state('newest')

const dateFormatter = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

function timeValue(value: string): number {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

function verdictText(grade: string): string {
  if (grade === 'A') return 'No clear concerns found'
  if (grade === 'B') return 'Mostly fair'
  if (grade === 'C') return 'Some concerns found'
  if (grade === 'D') return 'Several concerns found'
  return 'Serious concerns found'
}

function concernText(scan: ScanHistoryRow): string {
  const serious = scan.criticalCount + scan.highCount
  if (serious > 0)
    return `${serious} serious ${serious === 1 ? 'concern' : 'concerns'}`
  if (scan.patternCount > 0)
    return `${scan.patternCount} ${scan.patternCount === 1 ? 'concern' : 'concerns'} to review`
  return 'No clear concerns found'
}

function trendText(group: DomainGroup): string {
  if (!group.previous) return 'First check'
  const change = group.latest.scoreNumeric - group.previous.scoreNumeric
  if (change >= 5) return 'Improved since the previous check'
  if (change <= -5) return 'More concerning than the previous check'
  return 'Similar to the previous check'
}

const groups = $derived.by(() => {
  const grouped = new Map<string, ScanHistoryRow[]>()
  for (const scan of data.history.scans) {
    const key = scan.domain.toLowerCase()
    grouped.set(key, [...(grouped.get(key) ?? []), scan])
  }

  return Array.from(grouped.values()).map((scans): DomainGroup => {
    const ordered = scans.toSorted(
      (a, b) => timeValue(b.createdAt) - timeValue(a.createdAt),
    )
    return {
      domain: ordered[0].domain,
      scans: ordered,
      latest: ordered[0],
      previous: ordered[1],
    }
  })
})

const results = $derived.by(() => {
  const search = query.trim().toLowerCase()
  const filtered = groups.filter((group) => {
    if (search && !group.domain.toLowerCase().includes(search)) return false
    if (verdict === 'clear' && group.latest.patternCount > 0) return false
    if (verdict === 'concerns' && group.latest.patternCount === 0) return false
    if (
      concern === 'serious' &&
      group.latest.criticalCount + group.latest.highCount === 0
    )
      return false
    if (
      concern === 'other' &&
      (group.latest.patternCount === 0 ||
        group.latest.criticalCount + group.latest.highCount > 0)
    )
      return false
    return true
  })

  return filtered.toSorted((a, b) => {
    if (sort === 'concerning')
      return a.latest.scoreNumeric - b.latest.scoreNumeric
    if (sort === 'checked') return b.scans.length - a.scans.length
    return timeValue(b.latest.createdAt) - timeValue(a.latest.createdAt)
  })
})

function clearFilters() {
  query = ''
  verdict = 'all'
  concern = 'all'
  sort = 'newest'
}
</script>

<svelte:head>
  <title>Explore website checks | Trusten</title>
  <meta
    name="description"
    content="Explore Trusten's public library of website checks and the evidence behind each result."
  />
</svelte:head>

<main class="mx-auto max-w-6xl px-6 py-12">
  <div class="badge badge-primary badge-outline font-bold">Public evidence library</div>
  <h1 class="mt-4 mb-0 max-w-3xl font-bold text-4xl md:text-5xl">See how websites shape your choices</h1>
  <p class="mt-3 max-w-2xl text-base-content/70">
    Search checks shared by the Trusten community. Each result links to the evidence, so you can see what happened for yourself.
  </p>

  {#if data.historyUnavailable}
    <section class="card mt-8 border border-base-300 bg-base-100 p-6 shadow-lg" role="status">
      <h2 class="m-0 text-xl font-bold">The evidence library is taking a break</h2>
      <p class="mt-2 mb-0 text-base-content/70">
        We cannot load past checks right now. You can still check a website yourself.
      </p>
      <a class="btn btn-primary mt-5 w-fit" href="/">Check a website</a>
    </section>
  {:else}
    <section class="card mt-8 border border-base-300 bg-base-100 p-5 shadow-lg" aria-labelledby="filters-heading">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="filters-heading" class="m-0 text-xl font-bold">Find a website</h2>
          <p class="mt-1 mb-0 text-sm text-base-content/65">Filter by what the latest check found.</p>
        </div>
        <button class="btn btn-ghost btn-sm" type="button" onclick={clearFilters}>Clear filters</button>
      </div>

      <div class="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <label class="form-control md:col-span-2 lg:col-span-1">
          <span class="mb-2 font-semibold">Website name</span>
          <input class="input w-full shadow-inner" type="search" bind:value={query} placeholder="example.com" />
        </label>
        <label class="form-control">
          <span class="mb-2 font-semibold">Latest verdict</span>
          <select class="select w-full shadow-inner" bind:value={verdict}>
            <option value="all">Any verdict</option>
            <option value="clear">No clear concerns</option>
            <option value="concerns">Concerns found</option>
          </select>
        </label>
        <label class="form-control">
          <span class="mb-2 font-semibold">Type of concern</span>
          <select class="select w-full shadow-inner" bind:value={concern}>
            <option value="all">Any concern</option>
            <option value="serious">Serious concerns</option>
            <option value="other">Other concerns</option>
          </select>
        </label>
        <label class="form-control">
          <span class="mb-2 font-semibold">Sort by</span>
          <select class="select w-full shadow-inner" bind:value={sort}>
            <option value="newest">Newest check</option>
            <option value="concerning">Most concerning</option>
            <option value="checked">Most checked</option>
          </select>
        </label>
      </div>
    </section>

    <div class="mt-8 flex flex-wrap items-center justify-between gap-3">
      <p class="m-0 font-semibold" aria-live="polite">
        {results.length} {results.length === 1 ? 'website' : 'websites'} found
      </p>
      <p class="m-0 text-sm text-base-content/70">Showing the latest result for each website</p>
    </div>

    {#if groups.length === 0}
      <section class="card mt-6 border border-base-300 bg-base-100 p-8 text-center shadow-lg">
        <h2 class="m-0 text-2xl font-bold">No checks have been shared yet</h2>
        <p class="mt-2 text-base-content/70">Start with a website you use and help build the public evidence library.</p>
        <a class="btn btn-primary mx-auto mt-4 w-fit" href="/">Check the first website</a>
      </section>
    {:else if results.length === 0}
      <section class="card mt-6 border border-base-300 bg-base-100 p-8 text-center shadow-lg">
        <h2 class="m-0 text-2xl font-bold">No websites match those filters</h2>
        <p class="mt-2 text-base-content/70">Try a shorter name or clear the filters to see every website.</p>
        <button class="btn btn-primary mx-auto mt-4" type="button" onclick={clearFilters}>Show all websites</button>
      </section>
    {:else}
      <ul class="mt-6 grid list-none gap-5 p-0 md:grid-cols-2">
        {#each results as group (group.domain)}
          <li>
            <article class="card h-full border border-base-300 bg-base-100 p-6 shadow-lg">
              <div class="flex items-start gap-4">
                <GradeBadge grade={group.latest.scoreGrade as Grade} />
                <div class="min-w-0 flex-1">
                  <h2 class="m-0 truncate text-xl font-bold">
                    <a class="link link-primary" href="/site/{encodeURIComponent(group.domain)}">{group.domain}</a>
                  </h2>
                  <p class="mt-1 mb-0 font-semibold">{verdictText(group.latest.scoreGrade)}</p>
                </div>
              </div>

              <div class="mt-5 rounded-box bg-base-200 p-4 shadow-inner">
                <p class="m-0 font-semibold">{concernText(group.latest)}</p>
                <p class="mt-1 mb-0 text-sm text-base-content/70">{trendText(group)}</p>
              </div>

              <dl class="mt-5 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt class="text-base-content/70">Last checked</dt>
                  <dd class="mt-1 font-semibold">{dateFormatter.format(new Date(group.latest.createdAt))}</dd>
                </div>
                <div>
                  <dt class="text-base-content/70">Checks shared</dt>
                  <dd class="mt-1 font-semibold">{group.scans.length}</dd>
                </div>
              </dl>

              <div class="mt-auto flex flex-wrap gap-3 pt-6">
                <a class="btn btn-primary" href="/site/{encodeURIComponent(group.domain)}">View site history</a>
                <a class="btn btn-ghost" href="/scan/{group.latest.id}">Latest evidence</a>
              </div>
            </article>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</main>
