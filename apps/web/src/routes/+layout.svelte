<script lang="ts">
import { page } from '$app/state'
import '@trusten/ui/tokens.css'
import '../app.css'

let { children } = $props()
let menuOpen = $state(false)

function isCurrent(path: string) {
  if (path === '/') return page.url.pathname === '/'
  return page.url.pathname.startsWith(path)
}
</script>

<div class="min-h-screen text-base-content">
	<a class="btn btn-primary fixed left-4 top-3 z-50 -translate-y-24 focus:translate-y-0" href="#main-content">Skip to main content</a>
	<header class="site-header sticky top-0 z-30">
		<div class="navbar mx-auto min-h-20 max-w-6xl px-4 sm:px-6">
			<div class="navbar-start">
				<a class="btn btn-ghost px-2" href="/" aria-label="Trusten home">
					<span class="brand-lockup" aria-hidden="true"><img src="/trusten_logo.png" alt="" width="1983" height="793" /></span>
				</a>
			</div>

			<nav class="navbar-center hidden lg:flex" aria-label="Main navigation">
				<ul class="menu menu-horizontal gap-1 px-1 font-semibold">
					<li><a href="/" aria-current={isCurrent('/') ? 'page' : undefined}>Home</a></li>
					<li><a href="/explore" aria-current={isCurrent('/explore') ? 'page' : undefined}>Explore results</a></li>
					<li><a href="/#common-tricks">Common tricks</a></li>
					<li><a href="/#how-it-works">How it works</a></li>
				</ul>
			</nav>

			<div class="navbar-end gap-2">
				<a class="btn btn-primary hidden sm:inline-flex" href="/audit" aria-current={isCurrent('/audit') ? 'page' : undefined}>Check a site <span aria-hidden="true">&rarr;</span></a>
				<details class="dropdown dropdown-end lg:hidden" bind:open={menuOpen}>
					<summary class="btn list-none" aria-label="Open navigation menu">
						<span aria-hidden="true">&#9776;</span> Menu
					</summary>
					<ul class="menu neo-floating dropdown-content z-40 mt-3 w-64 gap-1 rounded-box p-3 font-semibold" aria-label="Mobile navigation">
						<li><a href="/" aria-current={isCurrent('/') ? 'page' : undefined} onclick={() => menuOpen = false}>Home</a></li>
						<li><a href="/explore" aria-current={isCurrent('/explore') ? 'page' : undefined} onclick={() => menuOpen = false}>Explore results</a></li>
						<li><a href="/#common-tricks" onclick={() => menuOpen = false}>Common tricks</a></li>
						<li><a href="/#how-it-works" onclick={() => menuOpen = false}>How it works</a></li>
						<li class="mt-2 sm:hidden"><a class="bg-primary text-primary-content" href="/audit" onclick={() => menuOpen = false}>Check a site</a></li>
					</ul>
				</details>
			</div>
		</div>
	</header>

	{@render children()}

	<footer class="mx-auto mt-20 max-w-6xl px-6 py-12 text-base-content/70">
		<div class="grid gap-9 md:grid-cols-[1.4fr_1fr_1fr]">
			<div>
				<span class="brand-lockup brand-lockup-footer" role="img" aria-label="Trusten"><img src="/trusten_logo.png" alt="" width="1983" height="793" /></span>
				<p class="mt-2 max-w-sm text-sm">Clear evidence about website tricks that can rush, confuse, or pressure your choices.</p>
			</div>
			<nav class="flex flex-col items-start gap-1" aria-label="Learn about Trusten">
				<h2 class="mb-1 text-sm font-bold uppercase tracking-wider text-base-content">Understand</h2>
				<a class="link link-hover" href="/#common-tricks">Common website tricks</a>
				<a class="link link-hover" href="/#how-it-works">How checks work</a>
			</nav>
			<nav class="flex flex-col items-start gap-1" aria-label="Use Trusten">
				<h2 class="mb-1 text-sm font-bold uppercase tracking-wider text-base-content">Check</h2>
				<a class="link link-hover" href="/explore">Explore results</a>
				<a class="link link-hover" href="/audit">Run a full check</a>
			</nav>
		</div>
		<p class="footer-note mt-10 border-t border-base-300 pt-6 text-sm">Trusten shows what it could verify and says clearly when a check could not be completed.</p>
	</footer>
</div>
