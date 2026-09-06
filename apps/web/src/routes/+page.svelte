<script lang="ts">
import { goto } from '$app/navigation'
import { api, publicScanErrorMessage } from '$lib/api'
import { getTurnstileToken } from '$lib/turnstile'
import type { PageData } from './$types'

let { data }: { data: PageData } = $props()

let url = $state('')
let busy = $state(false)
let problem = $state('')
let turnstileContainer = $state<HTMLDivElement>()

async function check(event: SubmitEvent) {
  event.preventDefault()
  if (!url.trim()) {
    problem = 'Please type the address of the site you want checked.'
    return
  }

  busy = true
  problem = ''
  try {
    if (!turnstileContainer) throw new Error('Scan form is not ready')
    const turnstileToken = await getTurnstileToken(
      turnstileContainer,
      'quick_scan',
    )
    const result = await api.quickScan({ url, turnstileToken })
    if (result.scanId) await goto(`/scan/${result.scanId}`)
    else problem = 'We could not check that site. Please try again.'
  } catch (error) {
    problem = publicScanErrorMessage(error)
  } finally {
    busy = false
  }
}
</script>

<svelte:head>
  <title>Trusten — See what a website is really asking of you</title>
  <meta name="description" content="Check websites for manipulative design, hidden pressure and unfair journeys." />
</svelte:head>

<main class="mx-auto max-w-6xl px-6 py-12 lg:py-20">
  <section class="grid items-center gap-10 lg:grid-cols-[1.12fr_.88fr]">
    <div>
      <div class="badge badge-primary badge-outline mb-5 font-bold uppercase tracking-widest">Clarity for the web</div>
      <h1 class="m-0 max-w-3xl font-bold text-5xl leading-[1.04] md:text-7xl">
        See what a website is <span class="text-primary">really</span> asking of you.
      </h1>
      <p class="mt-6 max-w-measure text-xl text-base-content/70">
        Trusten follows the path a real person would take, spots manipulative
        design, and shows you the evidence in plain language.
      </p>

      <form class="card mt-9 border border-base-300 bg-base-100" onsubmit={check}>
        <div class="card-body p-5 md:p-7">
          <label class="font-semibold" for="site">Website address</label>
          <div class="join join-vertical mt-2 w-full sm:join-horizontal">
            <input
              id="site"
              class="input input-lg join-item w-full flex-1"
              type="text"
              bind:value={url}
              placeholder="example.com"
              autocomplete="url"
              aria-describedby={problem ? 'site-problem' : 'site-hint'}
            />
            <button class="btn btn-primary btn-lg join-item px-7" type="submit" disabled={busy}>
              {busy ? 'Checking…' : 'Check this site'}
            </button>
          </div>
          <p id="site-hint" class="mt-2 mb-0 text-sm text-base-content/60">A quick check takes about a minute. No account needed.</p>
          {#if problem}
            <div id="site-problem" class="alert alert-error mt-3" role="alert">{problem}</div>
          {/if}
          <div class="mt-1" bind:this={turnstileContainer}></div>
        </div>
      </form>

      <p class="mt-7 text-base-content/65">
        Need checkout, signup and cancellation tested?
        <a class="link link-primary ml-1 font-bold" href="/audit">Run a full journey audit →</a>
      </p>
    </div>

    <aside class="card overflow-hidden border border-base-300 bg-base-100" aria-label="What a Trusten audit reveals">
      <div class="card-body p-7 md:p-9">
        <div class="badge badge-secondary badge-outline font-bold">A transparent verdict</div>
        <div class="mt-5 grid grid-cols-[auto_1fr] items-center gap-5">
          <div class="radial-progress bg-primary/10 text-4xl font-bold text-primary" style="--value:78; --size:6rem; --thickness:.65rem;" role="progressbar" aria-label="Example grade B">B</div>
          <div>
            <p class="m-0 font-bold text-xl">Mostly fair, with concerns</p>
            <p class="mt-1 mb-0 text-sm text-base-content/60">Every grade links back to visible evidence.</p>
          </div>
        </div>
        <div class="rounded-box mt-7 bg-base-200 p-5 shadow-inner">
          <p class="m-0 text-xs font-bold tracking-widest text-base-content/55">WHAT WE FOLLOWED</p>
          <ul class="steps steps-vertical mt-4 w-full text-left text-sm">
            <li class="step step-primary">Opened the product page</li>
            <li class="step step-primary">Added an item to the basket</li>
            <li class="step step-primary">Checked the final price</li>
          </ul>
        </div>
        <p class="mt-5 mb-0 text-sm text-base-content/60">Screenshots, visited pages and findings stay together as one evidence trail.</p>
      </div>
    </aside>
  </section>

  <section class="stats stats-vertical mt-16 w-full border border-base-300 bg-base-100 sm:stats-horizontal" aria-label="Trusten activity">
    <div class="stat"><div class="stat-title">Checks completed</div><div class="stat-value text-primary">{data.stats.totalScans.toLocaleString()}</div></div>
    <div class="stat"><div class="stat-title">Sites examined</div><div class="stat-value text-primary">{data.stats.totalDomains.toLocaleString()}</div></div>
    <div class="stat"><div class="stat-title">Patterns surfaced</div><div class="stat-value text-primary">{data.stats.totalPatterns.toLocaleString()}</div></div>
  </section>

  <section class="mt-20">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div><div class="badge badge-primary badge-outline font-bold">Recent evidence</div><h2 class="mt-3 mb-0 font-bold text-3xl">Latest site checks</h2></div>
      <a class="link link-primary font-bold" href="/explore">Explore every result →</a>
    </div>
    {#if data.recent.length > 0}
      <ul class="mt-7 grid list-none gap-4 p-0 md:grid-cols-2">
        {#each data.recent as scan (scan.id)}
          <li class="card border border-base-300 bg-base-100 transition-transform hover:-translate-y-1">
            <a class="card-body min-h-24 flex-row items-center gap-4 no-underline" href="/scan/{scan.id}">
              <span class="badge badge-primary size-13 text-xl font-bold">{scan.scoreGrade}</span>
              <span><strong class="block text-base-content">{scan.domain}</strong><small class="text-base-content/60">{scan.patternCount} {scan.patternCount === 1 ? 'finding' : 'findings'} · {scan.createdAt.slice(0, 10)}</small></span>
              <span class="ml-auto text-primary" aria-hidden="true">→</span>
            </a>
          </li>
        {/each}
      </ul>
    {:else}
      <div class="alert mt-7 bg-base-100 shadow-lg">The first completed check will appear here.</div>
    {/if}
  </section>
</main>
