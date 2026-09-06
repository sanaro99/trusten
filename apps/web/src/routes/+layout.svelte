<script lang="ts">
import '@trusten/ui/tokens.css'
import '../app.css'
import favicon from '$lib/assets/favicon.svg'

let { children } = $props()
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="min-h-screen bg-base-200 text-base-content">
	<header class="sticky top-0 z-30 bg-base-200/95 shadow-[0_10px_24px_-20px_#31344b] backdrop-blur-md">
		<div class="navbar mx-auto min-h-18 max-w-6xl px-5">
			<div class="navbar-start">
				<a class="btn btn-ghost gap-3 px-2 text-xl" href="/" aria-label="Trusten home">
					<span class="neo-raised grid size-10 place-items-center rounded-xl text-primary" aria-hidden="true">
						<svg width="21" height="21" viewBox="0 0 24 24" fill="none">
							<path d="M12 2.5 20 6v5.7c0 4.9-3.1 8.3-8 9.8-4.9-1.5-8-4.9-8-9.8V6l8-3.5Z" stroke="currentColor" stroke-width="2"/>
							<path d="m8.5 12 2.2 2.2 4.9-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
					</span>
					<span class="brand-type">Trusten</span>
				</a>
			</div>
			<nav class="navbar-center hidden md:flex" aria-label="Main navigation">
				<ul class="menu menu-horizontal gap-1 px-1 font-semibold">
					<li><a href="/">Dashboard</a></li>
					<li><a href="/explore">Explore results</a></li>
					<li><a href="/audit">Full audit</a></li>
				</ul>
			</nav>
			<div class="navbar-end">
				<a class="btn btn-primary" href="/audit">New audit <span aria-hidden="true">→</span></a>
			</div>
		</div>
	</header>
	{@render children()}
	<footer class="footer footer-horizontal mx-auto max-w-6xl border-t border-base-300 px-6 py-10 text-sm text-base-content/65">
		<aside><strong class="brand-type text-lg text-base-content">Trusten</strong><p>Independent dark-pattern detection for a fairer web.</p></aside>
		<nav><h2 class="footer-title">Explore</h2><a class="link link-hover" href="/explore">Site results</a><a class="link link-hover" href="/audit">Run an audit</a></nav>
	</footer>
</div>
