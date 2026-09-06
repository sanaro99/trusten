<script lang="ts">
import type { Grade } from '@trusten/shared/domain'
import { GradeBadge } from '@trusten/ui/domain'
import type { PageData } from './$types'

let { data }: { data: PageData } = $props()

const latest = $derived(data.detail.scans[0])
</script>

<main class="mx-auto max-w-5xl px-6 py-12">
  <div class="badge badge-primary badge-outline font-bold">Site history</div>
  <h1 class="mt-4 mb-0 font-bold text-5xl">{data.detail.domain}</h1>

  {#if latest}
    <div class="card mt-6 flex-row items-center gap-4 border border-base-300 bg-base-100 p-6 shadow-xl">
      <GradeBadge grade={latest.scoreGrade as Grade} />
      <p class="m-0 text-base-content/65">
        Last checked {latest.createdAt.slice(0, 10)}
      </p>
    </div>
  {/if}

  <h2 class="mt-12 font-bold text-2xl">Every check we have run</h2>
  <ul class="mt-6 list-none space-y-4 p-0">
    {#each data.detail.scans as scan (scan.id)}
      <li class="card flex-row items-center gap-4 border border-base-300 bg-base-100 p-5 shadow-lg">
        <GradeBadge grade={scan.scoreGrade as Grade} />
        <a class="link link-primary font-semibold" href="/scan/{scan.id}">
          {scan.createdAt.slice(0, 10)}
        </a>
        <span class="text-base-content/60">
          {scan.patternCount === 0
            ? 'Nothing found'
            : `${scan.patternCount} found`}
        </span>
      </li>
    {/each}
  </ul>
</main>
