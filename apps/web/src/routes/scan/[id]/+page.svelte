<script lang="ts">
import { gradeHeadline } from '@trusten/ui/content'
import { FindingCard, GradeBadge } from '@trusten/ui/domain'
import { splitFindings } from '$lib/findings'
import type { PageData } from './$types'

let { data }: { data: PageData } = $props()

const split = $derived(splitFindings(data.scan.patterns))
const heading = $derived(
  gradeHeadline(data.scan.score.grade, split.main.length),
)
</script>

<svelte:head>
  <title>{data.scan.domain} — Trusten</title>
</svelte:head>

<main class="mx-auto max-w-4xl px-6 py-12">
  <header class="mb-10 flex flex-wrap items-center gap-6">
    <GradeBadge grade={data.scan.score.grade} />
    <div>
      <h1 class="m-0 font-bold text-4xl">{heading.headline}</h1>
      <p class="mt-2 mb-0 text-text-muted">{heading.sub}</p>
      <p class="mt-1 mb-0 text-sm text-text-muted">
        We checked {data.scan.domain}
      </p>
    </div>
  </header>

  {#if split.main.length === 0 && split.aside.length === 0}
    <p class="max-w-measure text-xl">
      We looked for the usual tricks and did not find any. This site seems to
      treat you fairly.
    </p>
  {:else}
    <section>
      <h2 class="mb-2 font-bold text-2xl">What we found</h2>
      {#each split.main as pattern, i (pattern.id)}
        <FindingCard {pattern} index={i + 1} />
      {/each}
    </section>
  {/if}

  {#if split.aside.length > 0}
    <details class="mt-12 border-border border-t pt-6">
      <summary class="min-h-target cursor-pointer font-semibold text-purple">
        A few other things worth a look ({split.aside.length})
      </summary>
      <p class="max-w-measure text-text-muted">
        We are less sure about these, so we have kept them separate.
      </p>
      {#each split.aside as pattern, i (pattern.id)}
        <FindingCard {pattern} index={split.main.length + i + 1} />
      {/each}
    </details>
  {/if}

  <p class="mt-12">
    <a class="font-semibold text-purple" href="/">Check another site</a>
  </p>
</main>
