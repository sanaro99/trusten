<script lang="ts">
import type { Grade } from '@trusten/shared/domain'
import { GradeBadge } from '@trusten/ui/domain'
import type { PageData } from './$types'

let { data }: { data: PageData } = $props()

const latest = $derived(data.detail.scans[0])
</script>

<main class="mx-auto max-w-4xl px-6 py-12">
  <h1 class="m-0 font-bold text-4xl">{data.detail.domain}</h1>

  {#if latest}
    <div class="mt-6 flex items-center gap-4">
      <GradeBadge grade={latest.scoreGrade as Grade} />
      <p class="m-0 text-text-muted">
        Last checked {latest.createdAt.slice(0, 10)}
      </p>
    </div>
  {/if}

  <h2 class="mt-12 font-bold text-2xl">Every check we have run</h2>
  <ul class="list-none p-0">
    {#each data.detail.scans as scan (scan.id)}
      <li class="flex items-center gap-4 border-border border-b py-4">
        <GradeBadge grade={scan.scoreGrade as Grade} />
        <a class="font-semibold text-purple" href="/scan/{scan.id}">
          {scan.createdAt.slice(0, 10)}
        </a>
        <span class="text-text-muted">
          {scan.patternCount === 0
            ? 'Nothing found'
            : `${scan.patternCount} found`}
        </span>
      </li>
    {/each}
  </ul>
</main>
