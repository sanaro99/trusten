<script lang="ts">
import type { Grade } from '@trusten/shared/domain'
import { GradeBadge } from '@trusten/ui/domain'
import type { PageData } from './$types'

let { data }: { data: PageData } = $props()

let query = $state('')

const rows = $derived(
  data.history.scans.filter((s) =>
    s.domain.toLowerCase().includes(query.trim().toLowerCase()),
  ),
)
</script>

<main class="mx-auto max-w-6xl px-6 py-12">
  <div class="badge badge-primary badge-outline font-bold">Public evidence library</div>
  <h1 class="mt-4 mb-0 font-bold text-5xl">Sites we have checked</h1>
  <p class="mt-3 text-base-content/65">Search independent results and open the evidence behind every grade.</p>

  <label class="mt-8 block font-semibold" for="filter">Search by name</label>
  <input
    id="filter"
    class="input input-lg mt-2 w-full max-w-lg shadow-inner"
    type="search"
    bind:value={query}
    placeholder="example.com"
  />

  {#if data.historyUnavailable}
    <div class="alert mt-8" role="status">
      Site history is temporarily unavailable. The rest of Trusten is still ready to use.
    </div>
  {:else if rows.length === 0}
    <p class="mt-8 text-text-muted">No sites match that name.</p>
  {:else}
    <ul class="mt-8 grid list-none gap-4 p-0 md:grid-cols-2">
      {#each rows as scan (scan.id)}
        <li class="card flex-row items-center gap-4 border border-base-300 bg-base-100 p-5 shadow-lg">
          <GradeBadge grade={scan.scoreGrade as Grade} />
          <div class="flex-1">
            <a class="link link-primary font-semibold text-lg" href="/scan/{scan.id}">
              {scan.domain}
            </a>
            <p class="mt-1 mb-0 text-sm text-base-content/60">
              {scan.patternCount === 0
                ? 'Nothing found'
                : `${scan.patternCount} ${scan.patternCount === 1 ? 'thing' : 'things'} found`}
            </p>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</main>
