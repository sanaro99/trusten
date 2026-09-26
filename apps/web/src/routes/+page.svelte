<script lang="ts">
import { goto } from '$app/navigation'
import { api, publicScanErrorMessage } from '$lib/api'
import { historyCoverageLabel } from '$lib/history-coverage'
import { getTurnstileToken } from '$lib/turnstile'
import type { PageData } from './$types'

let { data }: { data: PageData } = $props()

let url = $state('')
let busy = $state(false)
let problem = $state('')
let turnstileContainer = $state<HTMLDivElement>()

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

function readableDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value.slice(0, 10)
    : dateFormatter.format(date)
}

async function check(event: SubmitEvent) {
  event.preventDefault()
  if (!url.trim()) {
    problem = 'Please type the address of the website you want to check.'
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
    else problem = 'We could not check that website. Please try again.'
  } catch (error) {
    problem = publicScanErrorMessage(error)
  } finally {
    busy = false
  }
}
</script>

<svelte:head>
  <title>Trusten — Know when a website is pushing you</title>
  <meta name="description" content="Check websites for tricks that rush, confuse, or pressure your choices. See clear evidence in plain language." />
</svelte:head>

<main id="main-content" class="home-page mx-auto max-w-6xl px-5 py-10 sm:px-6 lg:py-16">
  <section class="home-hero grid items-center gap-10 lg:grid-cols-[1.08fr_.92fr] lg:gap-14">
    <div>
      <div class="eyebrow mb-5"><span aria-hidden="true"></span>Make choices with confidence</div>
      <h1 class="m-0 max-w-3xl text-5xl font-bold leading-[1.04] sm:text-6xl lg:text-7xl">
        Know when a website is <span class="text-primary">pushing you.</span>
      </h1>
      <p class="mt-6 max-w-2xl text-xl text-base-content/75">
        A little clarity before you click. Trusten uncovers the tricks that rush, confuse, or pressure you — with evidence you can understand.
      </p>

      <form class="quick-check card mt-8" onsubmit={check} aria-labelledby="quick-check-title">
        <div class="card-body p-5 sm:p-7">
          <h2 id="quick-check-title" class="m-0 text-xl font-bold">Check a website</h2>
          <label class="mt-1 font-semibold" for="site">Website address</label>
          <div class="check-controls mt-1 w-full">
            <input
              id="site"
              class="input input-lg w-full min-w-0 flex-1"
              type="text"
              bind:value={url}
              placeholder="example.com"
              autocomplete="url"
              inputmode="url"
              aria-invalid={problem ? 'true' : undefined}
              aria-describedby={problem ? 'site-problem' : 'site-hint'}
            />
            <button class="btn btn-primary btn-lg px-5" type="submit" disabled={busy} aria-busy={busy}>
              {busy ? 'Checking…' : 'Check this site'}
            </button>
          </div>
          <p id="site-hint" class="mb-0 mt-2 text-sm text-base-content/65">A quick check usually takes about a minute. No account needed.</p>
          {#if problem}
            <div id="site-problem" class="alert alert-error mt-3" role="alert">{problem}</div>
          {/if}
          <div class="mt-1" bind:this={turnstileContainer}></div>
        </div>
      </form>

      <p class="mt-6 text-base-content/70">
        Want us to follow more of the journey?
        <a class="link link-primary ml-1 font-bold" href="/audit">Run a full check <span class="ml-1" aria-hidden="true">&rarr;</span></a>
      </p>
    </div>

    <aside class="pressure-study" aria-labelledby="pressure-example-title">
      <div class="study-caption"><span>A closer look</span><span>01 / Urgency</span></div>
      <div class="example-browser">
        <div class="example-toolbar"><span class="window-dots" aria-hidden="true">● ● ●</span><span>Illustrative example</span><span aria-hidden="true">↗</span></div>
        <div class="example-content">
          <div class="example-label">THE PRESSURE TO DECIDE</div>
          <h2 id="pressure-example-title">“Only 2 left.”<br /><span>Sound familiar?</span></h2>
          <div class="countdown-well" aria-label="Example countdown: 4 minutes 59 seconds">
            <span class="timer-digit">04</span><span class="timer-colon" aria-hidden="true">:</span><span class="timer-digit">59</span>
          </div>
          <p class="example-deadline">Offer ends soon. Or does it?</p>
          <div class="example-choice" aria-hidden="true">Get it before it’s gone <span>↗</span></div>
        </div>
      </div>
      <div class="evidence-note">
        <span class="evidence-icon" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="m5 12 4 4L19 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg></span>
        <div><p class="eyebrow">A moment of clarity</p><h3>Urgency is a claim. Ask for proof.</h3><p class="evidence-copy">Trusten looks for evidence behind the pressure, so you have room to decide.</p></div>
      </div>
      <p class="study-footnote">An example of what we look for, not a live scan.</p>
    </aside>
  </section>

  <section id="common-tricks" class="section-block scroll-mt-28 pt-24" aria-labelledby="common-tricks-title">
    <div class="max-w-3xl">
      <div class="badge badge-primary badge-outline font-bold">Have you seen this before?</div>
      <h2 id="common-tricks-title" class="mb-0 mt-4 text-4xl font-bold sm:text-5xl">Everyday website tricks</h2>
      <p class="mt-4 text-xl text-base-content/70">These designs can make a choice feel urgent, hide its real cost, or make saying no harder than saying yes.</p>
    </div>

    <div class="mt-9 grid gap-5 sm:grid-cols-2">
      <article class="trick-card card">
        <div class="card-body p-6">
          <div class="flex items-start gap-4">
            <span class="neo-inset grid size-12 shrink-0 place-items-center rounded-2xl text-xl font-bold text-warning" aria-hidden="true">00:10</span>
            <div><h3 class="m-0 text-xl font-bold">A timer that starts again</h3><p class="mb-0 mt-2 text-base-content/70">A countdown creates pressure, even when the offer is not really ending.</p></div>
          </div>
        </div>
      </article>
      <article class="trick-card card">
        <div class="card-body p-6">
          <div class="flex items-start gap-4">
            <span class="neo-inset grid size-12 shrink-0 place-items-center rounded-2xl text-lg font-bold text-error" aria-hidden="true">+$</span>
            <div><h3 class="m-0 text-xl font-bold">Fees that appear late</h3><p class="mb-0 mt-2 text-base-content/70">The first price looks low, but extra charges show up near the end.</p></div>
          </div>
        </div>
      </article>
      <article class="trick-card card">
        <div class="card-body p-6">
          <div class="flex items-start gap-4">
            <span class="neo-inset grid size-12 shrink-0 place-items-center rounded-2xl text-sm font-bold text-primary" aria-hidden="true">YES?</span>
            <div><h3 class="m-0 text-xl font-bold">A hidden way to say no</h3><p class="mb-0 mt-2 text-base-content/70">The “accept” choice is bright and clear while the refusal is easy to miss.</p></div>
          </div>
        </div>
      </article>
      <article class="trick-card card">
        <div class="card-body p-6">
          <div class="flex items-start gap-4">
            <span class="neo-inset grid size-12 shrink-0 place-items-center rounded-2xl text-xl font-bold text-error" aria-hidden="true">×5</span>
            <div><h3 class="m-0 text-xl font-bold">Easy to join, hard to leave</h3><p class="mb-0 mt-2 text-base-content/70">Signing up takes one click, but cancelling means searching through many screens.</p></div>
          </div>
        </div>
      </article>
    </div>
  </section>

  <section class="principle-panel mt-24 rounded-[2rem] bg-primary px-6 py-10 text-primary-content sm:px-10 lg:px-14" aria-labelledby="why-it-matters-title">
    <div class="grid items-center gap-8 lg:grid-cols-[.8fr_1.2fr]">
      <div>
        <p class="m-0 text-sm font-bold uppercase tracking-widest text-primary-content/75">Why it matters</p>
        <h2 id="why-it-matters-title" class="mb-0 mt-3 text-3xl font-bold sm:text-4xl">A fair choice needs time and clear information.</h2>
      </div>
      <div class="grid gap-3 sm:grid-cols-3" aria-label="How a website trick can affect a decision">
        <div class="principle-step rounded-2xl p-4"><span>01</span><strong class="block">The design pushes</strong><p>A message creates fear or urgency.</p></div>
        <div class="principle-step rounded-2xl p-4"><span>02</span><strong class="block">Your attention narrows</strong><p>It gets harder to compare or pause.</p></div>
        <div class="principle-step rounded-2xl p-4"><span>03</span><strong class="block">The choice feels forced</strong><p>You may agree before you are ready.</p></div>
      </div>
    </div>
  </section>

  <section id="how-it-works" class="section-block scroll-mt-28 pt-24" aria-labelledby="how-title">
    <div class="mx-auto max-w-3xl text-center">
      <div class="badge badge-primary badge-outline font-bold">How Trusten helps</div>
      <h2 id="how-title" class="mb-0 mt-4 text-4xl font-bold sm:text-5xl">Evidence you can understand</h2>
      <p class="mt-4 text-xl text-base-content/70">We show what we checked, what we found, and where a website stopped us.</p>
    </div>

    <ol class="mt-10 grid list-none gap-6 p-0 md:grid-cols-3">
      <li class="process-card card">
        <div class="card-body p-7"><span class="neo-inset grid size-12 place-items-center rounded-full font-bold text-primary">1</span><h3 class="mb-0 mt-4 text-xl font-bold">Enter a website</h3><p class="mb-0 mt-2 text-base-content/70">Start with a quick check, or ask Trusten to follow a longer journey.</p></div>
      </li>
      <li class="process-card card">
        <div class="card-body p-7"><span class="neo-inset grid size-12 place-items-center rounded-full font-bold text-primary">2</span><h3 class="mb-0 mt-4 text-xl font-bold">We follow the path</h3><p class="mb-0 mt-2 text-base-content/70">Trusten visits the pages a person would use and looks for unfair pressure.</p></div>
      </li>
      <li class="process-card card">
        <div class="card-body p-7"><span class="neo-inset grid size-12 place-items-center rounded-full font-bold text-primary">3</span><h3 class="mb-0 mt-4 text-xl font-bold">See the proof</h3><p class="mb-0 mt-2 text-base-content/70">The result links each concern to the page and evidence behind it.</p></div>
      </li>
    </ol>
  </section>

  <section class="result-preview mt-24 grid gap-7 lg:grid-cols-[1.05fr_.95fr]" aria-labelledby="example-result-title">
    <div class="card">
      <div class="card-body p-7 sm:p-9">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <span class="badge badge-secondary badge-outline font-bold">Example result</span>
          <span class="badge badge-warning font-bold">2 concerns found</span>
        </div>
        <div class="mt-6 flex items-center gap-5">
          <div class="radial-progress text-4xl font-bold text-primary" style="--value:78; --size:6rem; --thickness:.65rem;" role="img" aria-label="Example grade B">B</div>
          <div><h2 id="example-result-title" class="m-0 text-2xl font-bold">Mostly fair, with concerns</h2><p class="mb-0 mt-1 text-base-content/65">The main price was clear, but urgency messages may rush your choice.</p></div>
        </div>
        <div class="neo-inset mt-7 rounded-2xl p-5">
          <p class="m-0 text-sm font-bold uppercase tracking-wider text-base-content/70">What you should know</p>
          <p class="mb-0 mt-2">Take a moment before buying. The stock and time claims may not reflect a real limit.</p>
        </div>
      </div>
    </div>

    <div class="result-explainer px-2 py-4 sm:px-6">
      <h2 class="m-0 text-3xl font-bold">Honest about limits</h2>
      <p class="mt-4 text-base-content/70">A website can change, hide pages, or stop an automated check. When that happens, Trusten tells you what it could not finish instead of pretending the result is complete.</p>
      <ul class="mt-6 space-y-3 pl-0">
        <li class="flex gap-3"><span class="font-bold text-success" aria-hidden="true">✓</span><span>Evidence stays connected to each concern.</span></li>
        <li class="flex gap-3"><span class="font-bold text-success" aria-hidden="true">✓</span><span>Uncertain findings are clearly marked.</span></li>
        <li class="flex gap-3"><span class="font-bold text-success" aria-hidden="true">✓</span><span>Incomplete checks are never presented as complete.</span></li>
      </ul>
      <a class="btn mt-5" href="/explore">Explore real results <span aria-hidden="true">&rarr;</span></a>
    </div>
  </section>

  <section class="recent-section mt-24" aria-labelledby="recent-title">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="m-0 text-sm font-bold uppercase tracking-widest text-base-content/70">Public evidence library</p>
        <h2 id="recent-title" class="mb-0 mt-2 text-3xl font-bold">Recent website checks</h2>
      </div>
      <a class="link link-primary font-bold" href="/explore">Explore all results <span class="ml-1" aria-hidden="true">&rarr;</span></a>
    </div>

    {#if data.recent.length > 0}
      <ul class="mt-7 grid list-none gap-4 p-0 md:grid-cols-2">
        {#each data.recent as scan (scan.id)}
          <li class="card neo-pressable">
            <a class="card-body min-h-28 flex-row items-center gap-4 no-underline" href="/scan/{scan.id}">
              <span class="badge {historyCoverageLabel(scan) ? 'badge-warning' : 'badge-primary'} size-14 text-xl font-bold">{historyCoverageLabel(scan) ? '!' : scan.scoreGrade}</span>
              <span><strong class="block break-all text-base-content">{scan.domain}</strong><small class="text-base-content/65">{historyCoverageLabel(scan) ?? `${scan.patternCount} ${scan.patternCount === 1 ? 'concern' : 'concerns'}`} · {readableDate(scan.createdAt)}</small></span>
              <span class="ml-auto text-primary" aria-hidden="true">&rarr;</span>
            </a>
          </li>
        {/each}
      </ul>
    {:else}
      <div class="empty-library mt-7">
        <span class="empty-library-icon" aria-hidden="true">↗</span>
        <div><strong>No shared checks yet</strong><p>The first completed check will appear here, with its evidence and any concerns found.</p></div>
        <a class="btn" href="#quick-check-title">Start a check</a>
      </div>
    {/if}
  </section>

  {#if data.stats.totalScans > 0}
  <section class="stats stats-vertical mt-12 w-full sm:stats-horizontal" aria-label="Trusten activity">
    <div class="stat"><div class="stat-title text-base-content/70">Checks completed</div><div class="stat-value text-primary">{data.stats.totalScans.toLocaleString()}</div></div>
    <div class="stat"><div class="stat-title text-base-content/70">Websites examined</div><div class="stat-value text-primary">{data.stats.totalDomains.toLocaleString()}</div></div>
    <div class="stat"><div class="stat-title text-base-content/70">Concerns surfaced</div><div class="stat-value text-primary">{data.stats.totalPatterns.toLocaleString()}</div></div>
  </section>
  {/if}

  <section class="final-cta mt-24 text-center" aria-labelledby="final-cta-title">
    <h2 id="final-cta-title" class="m-0 text-4xl font-bold">Make your next choice with clearer information.</h2>
    <p class="mx-auto mt-4 max-w-2xl text-xl text-base-content/70">Check a website before you sign up, share information, or pay.</p>
    <a class="btn btn-primary btn-lg mt-5" href="#quick-check-title">Check a website</a>
  </section>
</main>
