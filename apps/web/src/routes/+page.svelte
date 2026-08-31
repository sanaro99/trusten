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

<main class="mx-auto max-w-3xl px-6 py-16">
  <h1 class="m-0 font-bold text-5xl">Is this site being fair with you?</h1>
  <p class="mt-4 max-w-measure text-xl text-text-muted">
    Paste the address of a shop or a website. We will look for tricks that
    push people into spending more, sharing more, or agreeing to things they
    did not mean to.
  </p>

  <form class="mt-10" onsubmit={check}>
    <label class="block font-semibold" for="site">Website address</label>
    <input
      id="site"
      class="mt-2 w-full rounded-xl border-2 border-border bg-bg px-4 py-3 text-base"
      type="text"
      bind:value={url}
      placeholder="example.com"
      autocomplete="url"
      aria-describedby={problem ? 'site-problem' : undefined}
    />

    {#if problem}
      <p id="site-problem" class="mt-2 mb-0 font-semibold text-serious" role="alert">
        {problem}
      </p>
    {/if}

    <button
      class="mt-4 min-h-target rounded-xl bg-purple px-8 py-3 font-bold text-lg text-white disabled:opacity-60"
      type="submit"
      disabled={busy}
    >
      {busy ? 'Checking…' : 'Check this site'}
    </button>
    <div class="mt-3" bind:this={turnstileContainer}></div>
  </form>

  <p class="mt-6 text-text-muted">
    Want a deeper look, including signing up and cancelling?
    <a class="font-semibold text-purple" href="/audit">Run a full check</a>.
  </p>

  {#if data.recent.length > 0}
    <section class="mt-16">
      <h2 class="font-bold text-2xl">Recently checked</h2>
      <ul class="list-none p-0">
        {#each data.recent as scan (scan.id)}
          <li class="border-border border-b py-3">
            <a class="font-semibold text-purple" href="/scan/{scan.id}">
              {scan.domain}
            </a>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</main>
