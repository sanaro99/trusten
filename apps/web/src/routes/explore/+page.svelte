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

<main class="mx-auto max-w-5xl px-6 py-12">
  <h1 class="m-0 font-bold text-4xl">Sites we have checked</h1>

  <label class="mt-8 block font-semibold" for="filter">Search by name</label>
  <input
    id="filter"
    class="mt-2 w-full max-w-md rounded-xl border-2 border-border bg-bg px-4 py-3"
    type="search"
    bind:value={query}
    placeholder="example.com"
  />

  {#if rows.length === 0}
    <p class="mt-8 text-text-muted">No sites match that name.</p>
  {:else}
    <ul class="mt-8 list-none p-0">
      {#each rows as scan (scan.id)}
        <li class="flex items-center gap-4 border-border border-b py-4">
          <GradeBadge grade={scan.scoreGrade as Grade} />
          <div class="flex-1">
            <a class="font-semibold text-lg text-purple" href="/scan/{scan.id}">
              {scan.domain}
            </a>
            <p class="mt-1 mb-0 text-sm text-text-muted">
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
