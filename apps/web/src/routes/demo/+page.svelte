<script lang="ts">
import { page } from '$app/state'
import { beginTour } from '$lib/demo/tour-state.svelte'

const journey = [
  {
    title: 'Alex checks the shop before buying',
    text: 'A quick check opens the page in a real browser and grades it in about a minute.',
    href: '/',
    link: 'Start a quick check',
  },
  {
    title: 'Alex sees what is wrong, with proof',
    text: 'Each concern is explained in plain words, with a screenshot of the exact spot on the page.',
    href: '/explore',
    link: 'Open a saved result',
  },
  {
    title: 'Alex compares other shops',
    text: 'Public checks stay in the evidence library, searchable by website and grade.',
    href: '/explore',
    link: 'Browse the library',
  },
  {
    title: 'Trusten follows the journey to checkout',
    text: 'A full check visits the pages a shopper would, so fees added late are caught too.',
    href: '/audit',
    link: 'Run a full check',
  },
  {
    title: 'Alex checks a page behind a login',
    text: 'The Chrome extension checks the page Alex is looking at and outlines each trick on it.',
    href: '/extension',
    link: 'Get the extension',
  },
]

const features = [
  {
    icon: '1m',
    title: 'Quick check',
    text: 'Type a website address and get a grade from A to F for that page in about a minute.',
    href: '/',
  },
  {
    icon: '→→',
    title: 'Full journey check',
    text: 'Follows a shopper’s path, from product to cart and checkout. Watch each step happen live.',
    href: '/audit',
  },
  {
    icon: '[ ]',
    title: 'Evidence for every concern',
    text: 'Screenshots with the element outlined, what the trick does, and what you can do about it.',
    href: '/explore',
  },
  {
    icon: 'A–F',
    title: 'Public evidence library',
    text: 'Every shared check is saved. Search for a website or filter by grade to compare.',
    href: '/explore',
  },
  {
    icon: '+',
    title: 'Chrome extension',
    text: 'Checks the page you are viewing, even when signed in, and highlights each trick on the page.',
    href: '/extension',
  },
  {
    icon: '!',
    title: 'Honest about limits',
    text: 'When a website blocks a check or part of it fails, Trusten says so instead of giving a grade it cannot back up.',
    href: '/#how-it-works',
  },
]

const planted = [
  'A “flash sale” countdown that quietly restarts',
  '“Only 2 left” and “27 people are looking” claims',
  'A protection plan and partner emails ticked for you',
  'A guilt-trip way to say no',
  'Fees that only appear in the cart',
  'A free trial that is hard to cancel',
]

const tourLink = $derived(`${page.url.origin}/demo?tour=1`)
</script>

<svelte:head>
  <title>Trusten demo — see what Trusten does</title>
  <meta name="description" content="A guided tour of Trusten: quick checks, evidence, the results library, full journey checks, and the Chrome extension." />
</svelte:head>

<main id="main-content" class="demo-page mx-auto max-w-6xl px-5 py-12 sm:px-6 lg:py-16">
  <section class="demo-hero max-w-3xl" aria-labelledby="demo-title">
    <div class="eyebrow mb-5"><span aria-hidden="true"></span>Demo</div>
    <h1 id="demo-title" class="m-0 text-5xl font-bold leading-[1.05] sm:text-6xl">See what Trusten does in <span class="text-primary">two minutes.</span></h1>
    <p class="mt-6 text-xl text-base-content/75">Follow a guided tour through the real site, using saved results so nothing has to load live. Or jump straight to any feature below.</p>
    <div class="mt-8 flex flex-wrap gap-3">
      <button class="btn btn-primary btn-lg" type="button" onclick={beginTour} data-testid="start-tour">Start the guided tour <span aria-hidden="true">&rarr;</span></button>
      <a class="btn btn-lg" href="/demo/shop">Open the practice shop</a>
    </div>
  </section>

  <section class="mt-20" aria-labelledby="journey-title">
    <p class="m-0 text-sm font-bold uppercase tracking-widest text-base-content/70">A shopper’s journey</p>
    <h2 id="journey-title" class="mb-0 mt-2 text-3xl font-bold sm:text-4xl">How Alex uses Trusten</h2>
    <ol class="mt-8 grid list-none gap-4 p-0 md:grid-cols-5">
      {#each journey as stage, i (stage.title)}
        <li class="card process-card">
          <div class="card-body gap-2 p-5">
            <span class="neo-inset grid size-10 place-items-center rounded-full font-bold text-primary" aria-hidden="true">{i + 1}</span>
            <h3 class="m-0 mt-2 text-lg font-bold leading-snug">{stage.title}</h3>
            <p class="m-0 text-sm text-base-content/70">{stage.text}</p>
            <a class="link link-primary mt-auto pt-2 text-sm font-bold" href={stage.href}>{stage.link} <span aria-hidden="true">&rarr;</span></a>
          </div>
        </li>
      {/each}
    </ol>
  </section>

  <section id="demo-features" class="mt-20 scroll-mt-28" aria-labelledby="features-title">
    <p class="m-0 text-sm font-bold uppercase tracking-widest text-base-content/70">Features</p>
    <h2 id="features-title" class="mb-0 mt-2 text-3xl font-bold sm:text-4xl">Everything Trusten can do</h2>
    <ul class="mt-8 grid list-none gap-5 p-0 sm:grid-cols-2 lg:grid-cols-3">
      {#each features as feature (feature.title)}
        <li class="card trick-card neo-pressable">
          <a class="card-body flex-row items-start gap-4 p-6 no-underline" href={feature.href}>
            <span class="neo-inset grid size-12 shrink-0 place-items-center rounded-2xl text-sm font-bold text-primary" aria-hidden="true">{feature.icon}</span>
            <span>
              <strong class="block text-lg text-base-content">{feature.title}</strong>
              <span class="mt-1 block text-base-content/70">{feature.text}</span>
            </span>
          </a>
        </li>
      {/each}
    </ul>
  </section>

  <section class="card mt-20" aria-labelledby="practice-title">
    <div class="card-body grid gap-8 p-7 sm:p-10 lg:grid-cols-[1fr_1fr]">
      <div>
        <p class="m-0 text-sm font-bold uppercase tracking-widest text-base-content/70">Try it yourself</p>
        <h2 id="practice-title" class="mb-0 mt-2 text-3xl font-bold">The practice shop</h2>
        <p class="mt-4 text-base-content/75">A made-up store that uses common tricks on purpose. Install the Chrome extension, open the shop, click the Trusten icon and choose <strong>Check this page</strong>, then <strong>Highlight these choices</strong>.</p>
        <div class="mt-6 flex flex-wrap gap-3">
          <a class="btn btn-primary" href="/demo/shop">Open the practice shop</a>
          <a class="btn" href="/extension">Get the extension</a>
        </div>
      </div>
      <div class="neo-inset rounded-2xl p-6">
        <p class="m-0 font-bold">What is hidden in it</p>
        <ul class="mb-0 mt-3 space-y-2 pl-0">
          {#each planted as trick (trick)}
            <li class="flex gap-3"><span class="font-bold text-warning" aria-hidden="true">!</span><span>{trick}</span></li>
          {/each}
        </ul>
      </div>
    </div>
  </section>

  <section class="mt-16 max-w-3xl" aria-labelledby="presenting-title">
    <h2 id="presenting-title" class="m-0 text-2xl font-bold">Showing Trusten to others?</h2>
    <ul class="mt-4 space-y-3 pl-5 text-base-content/75">
      <li>Share <code class="break-all">{tourLink}</code> to start the guided tour straight away.</li>
      <li>Install the extension before you present, and try it once on the practice shop.</li>
      <li>A full check takes a few minutes. Run one beforehand, and the tour will show its finished journey.</li>
      <li>Live checks first confirm you are a person, and some websites block automated visitors. Saved results in the library always open instantly.</li>
    </ul>
  </section>
</main>
